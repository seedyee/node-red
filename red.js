#!/usr/bin/env node
/**
 * Copyright 2013, 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
const http = require('http')
const https = require('https')
const util = require('util')
const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs-extra')
const RED = require('./red/red.js')

let server
let listenpath
const app = express()
const settingsFile = path.join(__dirname, './settings.js')
let settings

try {
  settings = require(settingsFile)
  settings.settingsFile = settingsFile
} catch(err) {
  console.log('Error loading settings file: ${settingsFile}')
  if (err.code == 'MODULE_NOT_FOUND') {
    if (err.toString().indexOf(settingsFile) === -1) {
      console.log(err.toString())
    }
  } else {
    console.log(err)
  }
  process.exit()
}

listenpath = `${settings.https ? 'https' : 'http'}://${settings.uiHost}:${settings.uiPort}${settings.httpEditorRoot}`

console.log(listenpath)
if (settings.https) {
  server = https.createServer(settings.https, app)
} else {
  server = http.createServer(app)
}
server.setMaxListeners(0)

function formatRoot(root) {
  if (root[0] != '/') {
    root = '/' + root
  }
  if (root.slice(-1) != '/') {
    root = root + '/'
  }
  return root
}

settings.disableEditor = settings.disableEditor
settings.httpEditorRoot = formatRoot(settings.httpEditorRoot)
settings.httpNodeRoot = formatRoot(settings.httpNodeRoot)
settings.httpNodeAuth = settings.httpNodeAuth || settings.httpAuth

try {
  RED.init(server,settings)
} catch(err) {
  if (err.code == 'not_built') {
    console.log('Node-RED has not been built. See README.md for details')
  } else {
    console.log('Failed to start server:')
    console.log(err.stack || err)
  }
  process.exit(1)
}

function basicAuthMiddleware(user,pass) {
  var basicAuth = require('basic-auth')
  var checkPassword
  if (pass.length == '32') {
    // Assume its a legacy md5 password
    checkPassword = function(p) {
      return crypto.createHash('md5').update(p,'utf8').digest('hex') === pass
    }
  } else {
    checkPassword = function(p) {
      return bcrypt.compareSync(p, pass)
    }
  }

  return function(req, res, next) {
    if (req.method === 'OPTIONS') {
      return next()
    }
    const requestUser = basicAuth(req)
    if (!requestUser || requestUser.name !== user || !checkPassword(requestUser.pass)) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required')
      return res.sendStatus(401)
    }
    next()
  }
}

app.use(settings.httpEditorRoot, RED.httpAdmin)
if (settings.httpNodeAuth) {
  app.use(settings.httpNodeRoot,basicAuthMiddleware(settings.httpNodeAuth.user,settings.httpNodeAuth.pass))
}
app.use(settings.httpNodeRoot, RED.httpNode)

if (settings.httpStatic) {
  settings.httpStaticAuth = settings.httpStaticAuth || settings.httpAuth
  if (settings.httpStaticAuth) {
    app.use('/', basicAuthMiddleware(settings.httpStaticAuth.user,settings.httpStaticAuth.pass))
  }
  app.use('/', express.static(settings.httpStatic))
}


RED.start().then(function() {
  server.on('error', function(err) {
    if (err.errno === 'EADDRINUSE') {
      RED.log.error(RED.log._('server.unable-to-listen', { listenpath }))
    } else {
      RED.log.error(RED.log._('server.uncaught-exception'))
      RED.log.error(err.stack || err)
    }
    process.exit(1)
  })
  server.listen(settings.uiPort, settings.uiHost, function() {
    RED.log.info(RED.log._('server.now-running', { listenpath }))
  })
}).otherwise(function(err) {
  RED.log.error(RED.log._('server.failed-to-start'))
  RED.log.error(err.stack || err)
})

process.on('uncaughtException', function(err) {
  util.log('[red] Uncaught Exception:')
  util.log(err.stack || err)
  process.exit(1)
})

process.on('SIGINT', function () {
  RED.stop()
  // TODO: need to allow nodes to close asynchronously before terminating the
  // process - ie, promises
  process.exit()
})
