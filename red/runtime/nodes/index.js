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
const registry = require('./registry')
const credentials = require('./credentials')
const flows = require('./flows')
const flowUtil = require('./flows/util')
const context = require('./context')
const Node = require('./Node')

let settings

/**
 * Registers a node constructor
 * @param nodeSet - the nodeSet providing the node (module/set)
 * @param type - the string type name
 * @param constructor - the constructor function for this node type
 * @param opts - optional additional options for the node
 */
function registerType(nodeSet, type, constructor, opts) {
  if (opts && opts.credentials) {
    credentials.register(type, opts.credentials)
  }
  registry.registerType(nodeSet, type, constructor)
}

/**
 * Called from a Node's constructor function, invokes the super-class
 * constructor and attaches any credentials to the node.
 * @param node the node object being created
 * @param def the instance definition for the node
 */
function createNode(node, def) {
  Node.call(node, def)
  let id = node.id
  if (def._alias) {
    id = def._alias
  }
  var creds = credentials.get(id)
  if (creds) {
    //console.log('Attaching credentials to ',node.id)
    // allow $(foo) syntax to substitute env variables for credentials also...
    for (var p in creds) {
      if (creds.hasOwnProperty(p)) {
        flowUtil.mapEnvVarProperties(creds, p)
      }
    }
    node.credentials = creds
  } else if (credentials.getDefinition(node.type)) {
    node.credentials = {}
  }
}

function init(runtime) {
  settings = runtime.settings
  credentials.init(runtime)
  flows.init(runtime)
  registry.init(runtime)
  context.init(runtime.settings)
}

module.exports = {
  // Lifecycle
  init: init,
  load: registry.load,

  // Node registry
  createNode: createNode,
  getNode: flows.get,
  eachNode: flows.eachNode,

  // Node type registry
  registerType: registerType,
  getType: registry.get,

  getNodeInfo: registry.getNodeInfo,
  getNodeList: registry.getNodeList,

  getModuleInfo: registry.getModuleInfo,

  getNodeConfigs: registry.getNodeConfigs,
  getNodeConfig: registry.getNodeConfig,

  clearRegistry: registry.clear,
  cleanModuleList: registry.cleanModuleList,

  // Flow handling
  loadFlows:  flows.load,
  startFlows: flows.startFlows,
  stopFlows:  flows.stopFlows,
  setFlows:   flows.setFlows,
  getFlows:   flows.getFlows,

  addFlow:     flows.addFlow,
  getFlow:     flows.getFlow,
  updateFlow:  flows.updateFlow,
  removeFlow:  flows.removeFlow,

  // Credentials
  addCredentials: credentials.add,
  getCredentials: credentials.get,
  deleteCredentials: credentials.delete,
  getCredentialDefinition: credentials.getDefinition,
}
