/**
 * Copyright 2014, 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License')
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

const express = require('express')
const bodyParser = require('body-parser')
const util = require('util')
const path = require('path')
const passport = require('passport')
const when = require('when')
const cors = require('cors')
const ui = require('./ui')
const nodes = require('./nodes')
const flows = require('./flows')
const flow = require('./flow')
const library = require('./library')
const info = require('./info')
const theme = require('./theme')
const locales = require('./locales')
const credentials = require('./credentials')
const comms = require('./comms')
const auth = require('./auth')
const needsPermission = auth.needsPermission

let i18n
let log
let adminApp
let nodeApp
let server
let runtime

var errorHandler = function(err, req, res, next) {
  if (err.message === 'request entity too large') {
    log.error(err)
  } else {
    console.log(err.stack)
  }
  log.audit({event: 'api.error',error: err.code || 'unexpected_error', message:err.toString() }, req)
  res.status(400).json({error:'unexpected_error', message:err.toString()})
}

var ensureRuntimeStarted = function(req, res, next) {
  if (!runtime.isStarted()) {
    log.error('Node-RED runtime not started')
    res.status(503).send('Not started')
  } else {
    next()
  }
}

function init(_server,_runtime) {
  server = _server
  runtime = _runtime
  var settings = runtime.settings
  i18n = runtime.i18n
  log = runtime.log
  nodeApp = express()
  comms.init(server, runtime)
  adminApp = express()
  auth.init(runtime)
  credentials.init(runtime)
  flows.init(runtime)
  flow.init(runtime)
  info.init(runtime)
  library.init(adminApp,runtime)
  locales.init(runtime)
  nodes.init(runtime)

  ui.init(runtime)
  const editorApp = express()
  if (settings.requireHttps === true) {
    editorApp.enable('trust proxy')
    editorApp.use(function (req, res, next) {
      if (req.secure) {
        next()
      } else {
        res.redirect('https://' + req.headers.host + req.originalUrl)
      }
    })
  }

  editorApp.get('/', ensureRuntimeStarted, ui.ensureSlash, ui.editor)
  editorApp.get('/icons/:icon', ui.icon)
  theme.init(runtime)
  if (settings.editorTheme) {
    editorApp.use('/theme', theme.app())
  }
  editorApp.use('/', ui.editorResources)
  adminApp.use(editorApp)

  const limit = settings.apiMaxLength
  adminApp.use(bodyParser.json({ limit }))
  adminApp.use(bodyParser.urlencoded({ limit, extended:true }))

  adminApp.get('/auth/login', auth.login, errorHandler)

  if (settings.adminAuth) {
    //TODO: all passport references ought to be in ./auth
    adminApp.use(passport.initialize())
    adminApp.post('/auth/token',
                  auth.ensureClientSecret,
                  auth.authenticateClient,
                  auth.getToken,
                  auth.errorHandler
    )
    adminApp.post('/auth/revoke',needsPermission(''),auth.revoke,errorHandler)
  }
  if (settings.httpAdminCors) {
    var corsHandler = cors(settings.httpAdminCors)
    adminApp.use(corsHandler)
  }

  // Flows
  adminApp.get('/flows', needsPermission('flows.read'), flows.get, errorHandler)
  adminApp.post('/flows',needsPermission('flows.write'),flows.post,errorHandler)

  adminApp.get('/flow/:id',needsPermission('flows.read'),flow.get,errorHandler)
  adminApp.post('/flow',needsPermission('flows.write'),flow.post,errorHandler)
  adminApp.delete('/flow/:id',needsPermission('flows.write'),flow.delete,errorHandler)
  adminApp.put('/flow/:id',needsPermission('flows.write'),flow.put,errorHandler)

  // Nodes
  adminApp.get('/nodes',needsPermission('nodes.read'),nodes.getAll,errorHandler)
  adminApp.post('/nodes',needsPermission('nodes.write'),nodes.post,errorHandler)

  adminApp.get(/\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission('nodes.read'),nodes.getModule,errorHandler)
  adminApp.put(/\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission('nodes.write'),nodes.putModule,errorHandler)
  adminApp.delete(/\/nodes\/((@[^\/]+\/)?[^\/]+)$/,needsPermission('nodes.write'),nodes.delete,errorHandler)

  adminApp.get(/\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,needsPermission('nodes.read'),nodes.getSet,errorHandler)
  adminApp.put(/\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,needsPermission('nodes.write'),nodes.putSet,errorHandler)

  adminApp.get('/credentials/:type/:id', needsPermission('credentials.read'),credentials.get,errorHandler)

  adminApp.get(/locales\/(.+)\/?$/,locales.get,errorHandler)

  // Library
  adminApp.post(new RegExp('/library/flows\/(.*)'),needsPermission('library.write'),library.post,errorHandler)
  adminApp.get('/library/flows',needsPermission('library.read'),library.getAll,errorHandler)
  adminApp.get(new RegExp('/library/flows\/(.*)'),needsPermission('library.read'),library.get,errorHandler)

  // Settings
  adminApp.get('/settings',needsPermission('settings.read'),info.settings,errorHandler)
  // Error Handler
  //adminApp.use(errorHandler)
}

function start() {
  return i18n.registerMessageCatalog('editor',path.resolve(path.join(__dirname,'locales')),'editor.json').then(function(){
    comms.start()
  })
}

function stop() {
  comms.stop()
  return when.resolve()
}
module.exports = {
  init: init,
  start: start,
  stop: stop,
  library: {
    register: library.register
  },
  auth: {
    needsPermission: auth.needsPermission
  },
  comms: {
    publish: comms.publish
  },
  get adminApp() { return adminApp },
  get nodeApp() { return nodeApp },
  get server() { return server },
}
