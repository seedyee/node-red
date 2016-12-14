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

var log
var redNodes
var settings

module.exports = {
  init: function(runtime) {
    settings = runtime.settings
    redNodes = runtime.nodes
    log = runtime.log
  },
  get: function(req, res) {
    const id = req.params.id
    const flow = redNodes.getFlow(id)
    if (flow) {
      log.audit({ event: 'flow.get', id }, req)
      res.json(flow)
    } else {
      log.audit({ event: 'flow.get',id:id,error:'not_found' }, req)
      res.status(404).end()
    }
  },
  post: function(req, res) {
    const flow = req.body
    redNodes.addFlow(flow).then((id) => {
      log.audit({ event: 'flow.add', id }, req)
      res.json({ id })
    }).otherwise(function(err) {
      log.audit({ event: 'flow.add', error: err.code || 'unexpected_error', message: err.toString() }, req)
      res.status(400).json({error:err.code||'unexpected_error', message:err.toString()})
    })
  },

  put: function(req, res) {
    const id = req.params.id
    const flow = req.body
    try {
      redNodes.updateFlow(id,flow).then(function() {
        log.audit({event: 'flow.update',id },req)
        res.json({ id })
      }).otherwise(function(err) {
        log.audit({ event: 'flow.update',error: err.code || 'unexpected_error', message:err.toString() }, req)
        res.status(400).json({ error:err.code || 'unexpected_error', message:err.toString() })
      })
    } catch(err) {
      if (err.code === 404) {
        log.audit({event: 'flow.update',id:id,error:'not_found'},req)
        res.status(404).end()
      } else {
        log.audit({event: 'flow.update',error:err.code||'unexpected_error',message:err.toString()},req)
        res.status(400).json({error:err.code||'unexpected_error', message:err.toString()})
      }
    }
  },

  delete: function(req, res) {
    const id = req.params.id
    try {
      redNodes.removeFlow(id).then(function() {
        log.audit({ event: 'flow.remove', id }, req)
        res.status(204).end()
      })
    } catch(err) {
      if (err.code === 404) {
        log.audit({ event: 'flow.remove',id, error: 'not_found' }, req)
        res.status(404).end()
      } else {
        log.audit({ event: 'flow.remove', id, error: err.code||'unexpected_error', message:err.toString() }, req)
        res.status(400).json({ error: err.code || 'unexpected_error', message:err.toString() })
      }
    }
  }
}
