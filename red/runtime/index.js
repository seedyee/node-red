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

const when = require('when')

const redNodes = require('./nodes')
const storage = require('./storage')
const log = require('./log')
const i18n = require('./i18n')
const events = require('./events')
const settings = require('./settings')
const path = require('path')
const fs = require('fs')

const { getVersion } = require('../utils')
let started = false
let adminApi

function init(userSettings, _adminApi) {
  log.init(userSettings)
  settings.init(userSettings)
  adminApi = _adminApi
  redNodes.init(runtime)
}

function start() {
  return i18n.init()
             .then(function() {
               /* return i18n.registerMessageCatalog('runtime', path.join(__dirname, 'locales'), 'runtime.json')*/
             })
             .then(function() { return storage.init(runtime)})
             .then(function() { return settings.load(storage)})
             .then(function() {
               log.info(`Node-RED version v${settings.version}`)
               log.info(`Node.js version ${process.version}`)
               return redNodes.load().then(function() {
                 console.log('\n\n==================== Welcome ^_^ ============================\n\n')
                 const nodeErrors = redNodes.getNodeList(function(n) { return n.err != null})
                 const nodeMissings = redNodes.getNodeList(n => n.module && n.enabled && !n.loaded && !n.err)
                 if (nodeErrors.length > 0) {
                   log.warn('------------------------------------------------------')
                   nodeErrors.forEach(err => {
                     log.warn(`[${err.name}] ${err.err}`)
                   })
                   log.warn('------------------------------------------------------')
                 }
                 log.info(`runtime.paths.settings ${settings.settingsFile}`)
                 redNodes.loadFlows().then(redNodes.startFlows)
                 started = true
               }).catch((err) => {
                 log.error(err)
               })
             })
}

function stop() {
  started = false
  return redNodes.stopFlows()
}

var runtime = module.exports = {
  init: init,
  start: start,
  stop: stop,

  version: getVersion,

  log: log,
  i18n: i18n,
  settings: settings,
  storage: storage,
  events: events,
  nodes: redNodes,
  util: require('./util'),
  get adminApi() { return adminApi },
  isStarted: () => started,
}
