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
  registerType: registry.registerNodeConstructor,
  get: registry.getNodeConstructor,
  getNodeList: registry.getNodeList,
  getModuleInfo: registry.getModuleInfo,
  getNodeConfigs: registry.getAllNodeConfigs,
  getNodeConfig: registry.getNodeConfig,
}
