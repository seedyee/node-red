/**
 * Copyright 2015, 2016 IBM Corp.
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

const util = require('util')
const when = require('when')
const events = require('../../events')

var settings
var Node
var loader

var nodeConfigCache = null
var moduleConfigs = {}
var nodeList = []
var nodeConstructors = {}
var nodeTypeToId = {}
var moduleNodes = {}

function init(_settings, _loader) {
  settings = _settings
  loader = _loader
  moduleNodes = {}
  nodeTypeToId = {}
  nodeConstructors = {}
  nodeList = []
  nodeConfigCache = null
  Node = require('../Node')
}

function load() {
  moduleConfigs = settings.get('nodes')
}

function getNodeConfig(id,lang) {
  var config = moduleConfigs[getModule(id)]
  if (!config) {
    return null
  }
  config = config.nodes[getNode(id)]
  if (config) {
    var result = config.config
    result += loader.getNodeHelp(config,lang||'en-US')
    return result
  } else {
    return null
  }
}

function filterNodeInfo(n) {
  var r = {
    id: n.id||n.module+'/'+n.name,
    name: n.name,
    types: n.types,
    enabled: n.enabled,
    local: n.local||false,
  }
  if (n.hasOwnProperty('module')) {
    r.module = n.module
  }
  if (n.hasOwnProperty('err')) {
    r.err = n.err.toString()
  }
  return r
}

function getModule(id) {
  const parts = id.split('/')
  return parts.slice(0, parts.length-1).join('/')
}

function getNode(id) {
  const parts = id.split('/')
  return parts[parts.length - 1]
}

function addNodeSet(set) {
  const { id, version } = set
  if (!set.err) {
    set.types.forEach(function(t) {
      nodeTypeToId[t] = id
    })
  }
  moduleNodes[set.module] = moduleNodes[set.module]||[]
  moduleNodes[set.module].push(set.name)

  if (!moduleConfigs[set.module]) {
    moduleConfigs[set.module] = {
      name: set.module,
      nodes: {}
    }
  }

  if (version) {
    moduleConfigs[set.module].version = version
  }
  moduleConfigs[set.module].local = set.local

  moduleConfigs[set.module].nodes[set.name] = set
  nodeList.push(id)
  nodeConfigCache = null
}


function getNodeInfo(typeOrId) {
  var id = typeOrId
  if (nodeTypeToId.hasOwnProperty(typeOrId)) {
    id = nodeTypeToId[typeOrId]
  }
  /* istanbul ignore else */
  if (id) {
    var module = moduleConfigs[getModule(id)]
    if (module) {
      var config = module.nodes[getNode(id)]
      if (config) {
        var info = filterNodeInfo(config)
        if (config.hasOwnProperty('loaded')) {
          info.loaded = config.loaded
        }
        info.version = module.version
        return info
      }
    }
  }
  return null
}

function getFullNodeInfo(typeOrId) {
  // Used by index.enableNodeSet so that .file can be retrieved to pass
  // to loader.loadNodeSet
  var id = typeOrId
  if (nodeTypeToId.hasOwnProperty(typeOrId)) {
    id = nodeTypeToId[typeOrId]
  }
  /* istanbul ignore else */
  if (id) {
    var module = moduleConfigs[getModule(id)]
    if (module) {
      return module.nodes[getNode(id)]
    }
  }
  return null
}

function getNodeList(filter) {
  var list = []
  for (var module in moduleConfigs) {
    /* istanbul ignore else */
    if (moduleConfigs.hasOwnProperty(module)) {
      var nodes = moduleConfigs[module].nodes
      for (var node in nodes) {
        /* istanbul ignore else */
        if (nodes.hasOwnProperty(node)) {
          var nodeInfo = filterNodeInfo(nodes[node])
          nodeInfo.version = moduleConfigs[module].version
          if (!filter || filter(nodes[node])) {
            list.push(nodeInfo)
          }
        }
      }
    }
  }
  return list
}

function getModuleList() {
  return moduleConfigs
}

function getModuleInfo(module) {
  if (moduleNodes[module]) {
    var nodes = moduleNodes[module]
    var m = {
      name: module,
      version: moduleConfigs[module].version,
      local: moduleConfigs[module].local,
      nodes: [],
    }
    nodes.forEach(node => {
      const nodeInfo = filterNodeInfo(moduleConfigs[module].nodes[node])
      nodeInfo.version = m.version
      m.nodes.push(nodeInfo)
    })
    return m
  } else {
    return null
  }
}

function getCaller(){
  var orig = Error.prepareStackTrace
  Error.prepareStackTrace = function(_, stack){ return stack }
  var err = new Error()
  Error.captureStackTrace(err, arguments.callee)
  var stack = err.stack
  Error.prepareStackTrace = orig
  stack.shift()
  stack.shift()
  return stack[0].getFileName()
}

function inheritNode(constructor) {
  if(Object.getPrototypeOf(constructor.prototype) === Object.prototype) {
    util.inherits(constructor,Node)
  } else {
    var proto = constructor.prototype
    while(Object.getPrototypeOf(proto) !== Object.prototype) {
      proto = Object.getPrototypeOf(proto)
    }
    //TODO: This is a partial implementation of util.inherits >= node v5.0.0
    //      which should be changed when support for node < v5.0.0 is dropped
    //      see: https://github.com/nodejs/node/pull/3455
    proto.constructor.super_ = Node
    if(Object.setPrototypeOf) {
      Object.setPrototypeOf(proto, Node.prototype)
    } else {
      // hack for node v0.10
      proto.__proto__ = Node.prototype
    }
  }
}

function registerNodeConstructor(nodeSet,type,constructor) {
  if (nodeConstructors.hasOwnProperty(type)) {
    throw new Error(type+' already registered')
  }
  //TODO: Ensure type is known - but doing so will break some tests
  //      that don't have a way to register a node template ahead
  //      of registering the constructor
  if(!(constructor.prototype instanceof Node)) {
    inheritNode(constructor)
  }

  var nodeSetInfo = getFullNodeInfo(nodeSet)
  if (nodeSetInfo) {
    if (nodeSetInfo.types.indexOf(type) === -1) {
      // A type is being registered for a known set, but for some reason
      // we didn't spot it when parsing the HTML file.
      // Registered a type is the definitive action - not the presence
      // of an edit template. Ensure it is on the list of known types.
      nodeSetInfo.types.push(type)
    }
  }

  nodeConstructors[type] = constructor
  events.emit('type-registered',type)
}

function getAllNodeConfigs(lang) {
  if (!nodeConfigCache) {
    var result = ''
    var script = ''

    nodeList.forEach(id => {
      var config = moduleConfigs[getModule(id)].nodes[getNode(id)]
      if (config.enabled && !config.err) {
        result += config.config
        result += loader.getNodeHelp(config, lang||'en-US') || ''
      }
    })
    nodeConfigCache = result
  }
  return nodeConfigCache
}

function getNodeConstructor(type) {
  var id = nodeTypeToId[type]

  var config
  if (typeof id === 'undefined') {
    config = undefined
  } else {
    config = moduleConfigs[getModule(id)].nodes[getNode(id)]
  }

  if (!config || (config.enabled && !config.err)) {
    return nodeConstructors[type]
  }
  return null
}

function clear() {
  nodeConfigCache = null
  moduleConfigs = {}
  nodeList = []
  nodeConstructors = {}
  nodeTypeToId = {}
}

function getTypeId(type) {
  if (nodeTypeToId.hasOwnProperty(type)) {
    return nodeTypeToId[type]
  } else {
    return null
  }
}


var registry = module.exports = {
  init: init,
  load: load,
  clear: clear,

  registerNodeConstructor: registerNodeConstructor,
  getNodeConstructor: getNodeConstructor,

  addNodeSet: addNodeSet,
  getNodeInfo: getNodeInfo,
  getFullNodeInfo: getFullNodeInfo,
  getNodeList: getNodeList,
  getModuleList: getModuleList,
  getModuleInfo: getModuleInfo,

  /**
   * Gets all of the node template configs
   * @return all of the node templates in a single string
   */
  getAllNodeConfigs: getAllNodeConfigs,
  getNodeConfig: getNodeConfig,

  getTypeId: getTypeId,
}
