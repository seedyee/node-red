/**
 * Copyright 2014, 2015 IBM Corp.
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

const when = require('when')
const path = require('path')

const registry = require('./registry')
const loader = require('./loader')

function init(runtime) {
  loader.init(runtime)
  registry.init(runtime.settings, loader)
}

function load() {
  registry.load()
  return loader.load()
}

module.exports = {
  init:init,
  load:load,
  clear: registry.clear,
  registerType: registry.registerNodeConstructor,

  get: registry.getNodeConstructor,
  getNodeInfo: registry.getNodeInfo,
  getNodeList: registry.getNodeList,

  getModuleInfo: registry.getModuleInfo,
  getModuleList: registry.getModuleList,

  getNodeConfigs: registry.getAllNodeConfigs,
  getNodeConfig: registry.getNodeConfig,
}
