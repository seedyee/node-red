/**
 * Copyright 2013, 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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

const fs = require('fs')
const path = require('path')

const runtime = require('./runtime')
const api = require('./api')

let nodeApp = null
let adminApp = null
let server = null
let apiEnabled = false

function checkBuild() {
  const editorFile = path.join(__dirname,'../public/red/red.min.js')
  try {
    const stats = fs.statSync(editorFile)
  } catch(err) {
    const e = new Error('Node-RED not built')
    e.code = 'not_built'
    throw e
  }
}

module.exports = {
  init: function(httpServer, userSettings) {
    runtime.init(userSettings, api)
    api.init(httpServer, runtime)
    apiEnabled = true
    adminApp = runtime.adminApi.adminApp
    nodeApp = runtime.adminApi.nodeApp
    server = runtime.adminApi.server
    return
  },
  start: function() {
    return runtime.start().then(function() {
      if (apiEnabled) {
        return api.start()
      }
    })
  },
  stop: function() {
    return runtime.stop().then(function() {
      if (apiEnabled) {
        return api.stop()
      }
    })
  },

  nodes: runtime.nodes,
  log: runtime.log,
  settings:runtime.settings,
  util: runtime.util,
  version: runtime.version,

  comms: api.comms,
  library: api.library,
  auth: api.auth,

  get httpAdmin() { return adminApp },
  get httpNode() { return nodeApp },
  get server() { return server },
}
