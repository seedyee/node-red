/**
 * Copyright 2015 IBM Corp.
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

let events
let log
let i18n
let settings

function init(runtime) {
  settings = runtime.settings
  events = runtime.events
  log = runtime.log
  i18n = runtime.i18n
}

function getLocalFile(file) {
  try {
    fs.statSync(file.replace(/\.js$/, '.html'))
  } catch(err) {
    console.log(err)
    throw err
  }
  return {
    file: file,
    module: 'node-red',
    name: path.basename(file).replace(/^\d+-/, '').replace(/\.js$/, ''),
    version: settings.version,
  }
}

/**
 * Synchronously walks the directory looking for node files.
 * Emits 'node-icon-dir' events for an icon dirs found
 * @param dir the directory to search
 * @return an array of fully-qualified paths to .js files
 */

function getLocalNodeFiles(dir) {
  let result = []
  let files = []
  try {
    files = fs.readdirSync(dir).sort()
  } catch(err) {
    console.log(err)
    throw err
  }

  files.forEach(function(fn) {
    const stats = fs.statSync(path.join(dir,fn))
    if (stats.isFile()) {
      if (/\.js$/.test(fn)) {
        const info = getLocalFile(path.join(dir, fn))
        result.push(info)
      }
    } else if (stats.isDirectory()) {
      // Ignore /.dirs/, /lib/ /node_modules/
      if (!/^(\..*|lib|icons|node_modules|test|locales)$/.test(fn)) {
        result = result.concat(getLocalNodeFiles(path.join(dir,fn)))
      } else if (fn === 'icons') {
        // todo remove the following stupid line and it's deps
        events.emit('node-icon-dir', path.join(dir,fn))
      }
    }
  })
  return result
}

/**
 * Scans the specified paths for nodes
 * @param moduleName the name of the module to be found
 * @return a list of node modules: {dir,package}
 */

function getNodeFiles() {
  // Find all of the nodes to load
  const { coreNodesDir, nodesDirList, userDir } = settings
  const defaultLocalesPath = path.join(coreNodesDir, 'core', 'locales')
  i18n.registerMessageCatalog('node-red', defaultLocalesPath, 'messages.json')

  // map and then flatten
  const nodeFiles = nodesDirList.map(getLocalNodeFiles).reduce((a, b) => a.concat(b), [])
  const nodeList = {
    'node-red': {
      name: 'node-red',
      version: settings.version,
      nodes: {},
    }
  }
  nodeFiles.forEach(function(node) {
    nodeList['node-red'].nodes[node.name] = node
  })
  return nodeList
}

module.exports = {
  init,
  getNodeFiles,
}
