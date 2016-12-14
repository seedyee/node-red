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
  // To skip node scan, the following line will use the stored node list.
  // We should expose that as an option at some point, although the
  // performance gains are minimal.
  //return loadNodeFiles(registry.getModuleList());
  runtime.log.info(runtime.log._('server.loading'));
  var nodeFiles = localfilesystem.getNodeFiles(defaultNodesDir, disableNodePathScan);
  return loadNodeFiles(nodeFiles);
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

function loadNodeFiles(nodeFiles) {
  const promises = []
  forOwn(nodeFiles, (module, moduleKey) => {
    if (moduleKey === 'node-red' || !registry.getModuleInfo(moduleKey)) {
      const moduleNodes = module.nodes
      forOwn(moduleNodes, (moduleNode) => {
        try {
          promises.push(loadNodeConfig(moduleNode))
        } catch(err) {
          console.log(err)
          //
        }
      })
    }
  })

  return when.all(promises).then(function(values) {
    const nodes = values.map(function(value) {
      registry.addNodeSet(value.id, value, value.version)
      return value
    })
    return loadNodeSetList(nodes)
  })
}

function loadNodeConfig(fileInfo) {
  const { file, module, name, version } = fileInfo
  const id = `${module}/${name}`
  const info = registry.getNodeInfo(id)
  let isEnabled = true

  return when.promise(function(resolve) {
    if (info) {
      if (info.hasOwnProperty('loaded')) throw new Error(`${file} already loaded`)
      isEnabled = info.enabled
    }

    const node = {
      id: id,
      module: module,
      name: name,
      file: file,
      template: file.replace(/\.js$/,'.html'),
      enabled: isEnabled,
      loaded:false,
      version: version,
      local: fileInfo.local,
    }

    if (fileInfo.hasOwnProperty('types')) {
      node.types = fileInfo.types
    }

    fs.readFile(node.template, 'utf8', function(err, content) {
      if (err) {
        node.types = [];
        if (err.code === 'ENOENT') {
          if (!node.types) {
            node.types = [];
          }
          node.err = 'Error: '+node.template+' does not exist';
        } else {
          node.types = [];
          node.err = err.toString();
        }
        resolve(node);
      } else {
        const types = [];

        let regExp = /<script ([^>]*)data-template-name=['']([^'']*)['']/gi;
        let match = null

        while ((match = regExp.exec(content)) !== null) {
          types.push(match[2]);
        }
        node.types = types;

        const langRegExp = /^<script[^>]* data-lang=[''](.+?)['']/i;
        regExp = /(<script[^>]* data-help-name=[\s\S]*?<\/script>)/gi;
        match = null;
        var mainContent = '';
        var helpContent = {};
        var index = 0;
        while ((match = regExp.exec(content)) !== null) {
          mainContent += content.substring(index,regExp.lastIndex-match[1].length);
          index = regExp.lastIndex;
          var help = content.substring(regExp.lastIndex-match[1].length,regExp.lastIndex);

          var lang = runtime.i18n.defaultLang;
          if ((match = langRegExp.exec(help)) !== null) {
            lang = match[1];
          }
          if (!helpContent.hasOwnProperty(lang)) {
            helpContent[lang] = '';
          }

          helpContent[lang] += help;
        }
        mainContent += content.substring(index);

        node.config = mainContent;
        node.help = helpContent;
        // TODO: parse out the javascript portion of the template
        //node.script = '';
        for (var i=0;i<node.types.length;i++) {
          if (registry.getTypeId(node.types[i])) {
            node.err = node.types[i]+' already registered';
            break;
          }
        }
        fs.stat(path.join(path.dirname(file),'locales'),function(err,stat) {
          if (!err) {
            node.namespace = node.id;
            runtime.i18n
                   .registerMessageCatalog(
                     node.id, path.join(path.dirname(file),'locales'),
                     path.basename(file,'.js')+'.json'
                   )
                   .then(function() {
                     resolve(node);
                   });
          } else {
            node.namespace = node.module;
            resolve(node);
          }
        });
      }
    });
  });
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
    var loadPromise = null;
    var r = require(node.file);
    if (typeof r === 'function') {
      var red = createNodeApi(node);
      var promise = r(red);
      if (promise != null && typeof promise.then === 'function') {
        loadPromise = promise.then(function() {
          node.enabled = true;
          node.loaded = true;
          return node;
        }).otherwise(function(err) {
          node.err = err;
          return node;
        });
      }
    }
    if (loadPromise == null) {
      node.enabled = true;
      node.loaded = true;
      loadPromise = when.resolve(node);
    }
    return loadPromise;
  } catch(err) {
    node.err = err;
    return when.resolve(node);
  }
}

function loadNodeSetList(nodes) {
  var promises = [];
  nodes.forEach(function(node) {
    if (!node.err) {
      promises.push(loadNodeSet(node));
    } else {
      promises.push(node);
    }
  });

  return when.settle(promises).then(function() {
    if (settings.available()) {
      return registry.saveNodeList();
    } else {
      return;
    }
  });
}

function addModule(module) {
  if (!settings.available()) {
    throw new Error('Settings unavailable');
  }
  var nodes = [];
  if (registry.getModuleInfo(module)) {
    // TODO: nls
    var e = new Error('module_already_loaded');
    e.code = 'module_already_loaded';
    return when.reject(e);
  }
}

function loadNodeHelp(node,lang) {
  var dir = path.dirname(node.template);
  var base = path.basename(node.template);
  var localePath = path.join(dir,'locales',lang,base);
  try {
    // TODO: make this async
    var content = fs.readFileSync(localePath, 'utf8')
    return content;
  } catch(err) {
    return null;
  }
}

function getNodeHelp(node,lang) {
  if (!node.help[lang]) {
    var help = loadNodeHelp(node,lang);
    if (help == null) {
      var langParts = lang.split('-');
      if (langParts.length == 2) {
        help = loadNodeHelp(node,langParts[0]);
      }
    }
    if (help) {
      node.help[lang] = help;
    } else {
      node.help[lang] = node.help[runtime.i18n.defaultLang];
    }
  }
  return node.help[lang];
}

module.exports = {
  init: init,
  load: load,
  addModule: addModule,
  loadNodeSet: loadNodeSet,
  getNodeHelp: getNodeHelp
}
