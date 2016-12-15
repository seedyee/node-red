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
const comms = require('./comms')
const locales = require('./locales')

var redNodes

module.exports = {
  init: function(runtime) {
    redNodes = runtime.nodes
  },
  getAll: function(req, res) {
    if (req.get('accept') == 'application/json') {
      res.json(redNodes.getNodeList())
    } else {
      const lang = locales.determineLangFromHeaders(req.acceptsLanguages())
      res.send(redNodes.getNodeConfigs(lang))
    }
  },
}
