/**
 * Copyright 2015, 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
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

const when = require('when')
const fs = require('fs')
const path = require('path')
const semver = require('semver')
const forOwn = require('lodash/forOwn')

const localfilesystem = require('./localfilesystem')
const registry = require('./registry')

let settings
let runtime

function init(_runtime) {
  runtime = _runtime
  settings = runtime.settings
  localfilesystem.init(runtime)
}

function load(defaultNodesDir, disableNodePathScan) {
  runtime.log.info(runtime.log._('server.loading'))
  const nodeFiles = localfilesystem.getNodeFiles()
  console.log(nodeFiles['node-red'].nodes.tail)
  return loadNodeFiles(nodeFiles)
}

function loadNodeFiles(nodeFiles) {
  const promises = []
  forOwn(nodeFiles, module => {
    const { nodes } = module
    forOwn(nodes, nodeMeta => {
      try {
        promises.push(loadNodeConfig(nodeMeta))
      } catch(err) {
        console.log(err)
        //
      }
    })
  })

  return when.all(promises).then(nodes => {
    nodes.forEach(node => {
      registry.addNodeSet(node)
    })
    return loadNodeSetList(nodes)
  })
}

function loadNodeConfig(nodeMeta) {
  const { file, module, name, version  } = nodeMeta
  const id = `${module}/${name}`
  const info = registry.getNodeInfo(id)
  const template = file.replace(/\.js$/,'.html')
  let isEnabled = true

  return when.promise(function(resolve) {
    if (info) {
      if (info.hasOwnProperty('loaded')) throw new Error(`${file} already loaded`)
      isEnabled = info.enabled
    }

    const node = {
      id,
      module,
      name,
      file,
      template,
      types: [],
      enabled: isEnabled,
      loaded:false,
      version: version,
      local: nodeMeta.local,
    }

    fs.readFile(template, 'utf8', function(err, content) {
      if (err) {
        node.err = (err.code === 'ENOENT') ? `Error: ${templat} does not exist` : err.toString()
        resolve(node)
      } else {
        let regExp = /(<script[^>]* data-help-name=[\s\S]*?<\/script>)/gi
        match = null
        let mainContent = ''
        let helpContent = {}
        let index = 0
        const lang = runtime.i18n.defaultLang
        while ((match = regExp.exec(content)) !== null) {
          mainContent += content.substring(index, regExp.lastIndex - match[1].length)
          index = regExp.lastIndex
          const help = content.substring(regExp.lastIndex - match[1].length, regExp.lastIndex)
          helpContent[lang] += help
        }
        mainContent += content.substring(index)
        node.config = mainContent
        node.help = helpContent
        node.namespace = node.module
        resolve(node)
      }
    })
  })
}

function createNodeApi(node) {
  const {
    createNode,
    getNode,
    eachNode,
    addCredentials,
    getCredentials,
    deleteCredentials,
  } = runtime.nodes

  const nodesApi = {
    createNode,
    getNode,
    eachNode,
    addCredentials,
    getCredentials,
    deleteCredentials,
  }
  const logApi = {
    log,
    info,
    warn,
    error,
    trace,
    debug,
    metric,
    audit,
  } = runtime.log

  const red = {
    nodes: nodesApi,
    log: logApi,
    settings: {},
    events: runtime.events,
    util: runtime.util,
    version: runtime.version,
  }
  red.nodes.registerType = function(type, constructor, opts) {
    runtime.nodes.registerType(node.id, type, constructor, opts)
  }
  const adminApi = runtime.adminApi
  if (adminApi) {
    red.comms = adminApi.comms
    red.library = adminApi.library
    red.auth = adminApi.auth
    red.httpAdmin = adminApi.adminApp
    red.httpNode = adminApi.nodeApp
    red.server = adminApi.server
  } else {
    red.comms = {
      publish: function() {}
    }
    red.library = {
      register: function() {}
    }
    red.auth = {
      needsPermission: function() {}
    }
    // TODO: stub out httpAdmin/httpNode/server
  }
  red['_'] = function() {
    var args = Array.prototype.slice.call(arguments, 0)
    if (args[0].indexOf(':') === -1) {
      args[0] = node.namespace+':'+args[0]
    }
    return runtime.i18n._.apply(null, args)
  }
  return red
}

/**
 * Loads the specified node into the runtime
 * @param node a node info object - see loadNodeConfig
 * @return a promise that resolves to an update node info object. The object
 *         has the following properties added:
 *            err: any error encountered whilst loading the node
 *
 */

function loadNodeSet(node) {
  const nodeDir = path.dirname(node.file)
  const nodeFn = path.basename(node.file)
  if (!node.enabled) return when.resolve(node)
  try {
    var loadPromise = null
    var r = require(node.file)
    if (typeof r === 'function') {
      var red = createNodeApi(node)
      var promise = r(red)
      if (promise != null && typeof promise.then === 'function') {
        loadPromise = promise.then(function() {
          node.enabled = true
          node.loaded = true
          return node
        }).otherwise(function(err) {
          node.err = err
          return node
        })
      }
    }
    if (loadPromise == null) {
      node.enabled = true
      node.loaded = true
      loadPromise = when.resolve(node)
    }
    return loadPromise
  } catch(err) {
    node.err = err
    return when.resolve(node)
  }
}

function loadNodeSetList(nodes) {
  const promises = []
  nodes.forEach(node => {
    node.err ? promises.push(node) : promises.push(loadNodeSet(node))
  })

  return when.all(promises).then(() => {
    if (settings.available) return registry.saveNodeList()
  })
}

function addModule(module) {
  if (!settings.available()) {
    throw new Error('Settings unavailable')
  }
  var nodes = []
  if (registry.getModuleInfo(module)) {
    // TODO: nls
    var e = new Error('module_already_loaded')
    e.code = 'module_already_loaded'
    return when.reject(e)
  }
}

function loadNodeHelp(node,lang) {
  var dir = path.dirname(node.template)
  var base = path.basename(node.template)
  var localePath = path.join(dir,'locales',lang,base)
  try {
    // TODO: make this async
    var content = fs.readFileSync(localePath, 'utf8')
    return content
  } catch(err) {
    return null
  }
}

function getNodeHelp(node,lang) {
  if (!node.help[lang]) {
    var help = loadNodeHelp(node,lang)
    if (help == null) {
      var langParts = lang.split('-')
      if (langParts.length == 2) {
        help = loadNodeHelp(node,langParts[0])
      }
    }
    if (help) {
      node.help[lang] = help
    } else {
      node.help[lang] = node.help[runtime.i18n.defaultLang]
    }
  }
  return node.help[lang]
}

module.exports = {
  init: init,
  load: load,
  addModule: addModule,
  loadNodeSet: loadNodeSet,
  getNodeHelp: getNodeHelp
}
