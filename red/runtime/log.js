/**
 * Copyright 2014, 2015 IBM Corp.
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
const EventEmitter = require('events').EventEmitter
const { invert } = require('lodash')

const i18n = require('./i18n')

const levels = {
  off:    1,
  fatal:  10,
  error:  20,
  warn:   30,
  info:   40,
  debug:  50,
  trace:  60,
  audit:  98,
  metric: 99,
}

const levelNames = invert(levels)

let logHandlers = []
let metricsEnabled = false

function LogHandler (settings) {
  this.logLevel  = settings ? levels[settings.level] || levels.info : levels.info
  this.metricsOn = settings ? settings.metrics || false : false
  this.auditOn = settings ? settings.audit || false : false

  metricsEnabled = metricsEnabled || this.metricsOn

  this.handler   = (settings && settings.handler) ? settings.handler(settings) : consoleLogger
  this.on('log', function(msg) {
    if (this.shouldReportMessage(msg.level)) {
      this.handler(msg)
    }
  })
}
util.inherits(LogHandler, EventEmitter)

LogHandler.prototype.shouldReportMessage = function(msglevel) {
  return (msglevel == log.METRIC && this.metricsOn) ||
         (msglevel == log.AUDIT && this.auditOn) ||
         msglevel <= this.logLevel
}

function consoleLogger(msg) {
  if (msg.level == log.METRIC || msg.level == log.AUDIT) {
    util.log('['+levelNames[msg.level]+'] '+JSON.stringify(msg))
  } else {
    var message = msg.msg
    if (typeof message === 'object' && message.toString() === '[object Object]' && message.message) {
      message = message.message
    }
    util.log('['+levelNames[msg.level]+'] '+(msg.type?'['+msg.type+':'+(msg.name||msg.id)+'] ':'')+message)
  }
}

var log = module.exports = {
  FATAL:  10,
  ERROR:  20,
  WARN:   30,
  INFO:   40,
  DEBUG:  50,
  TRACE:  60,
  AUDIT:  98,
  METRIC: 99,

  init: function({ logging }) {
    metricsEnabled = false
    var loggerSettings = {}
    const keys = Object.keys(logging)
    if (keys.length === 0) {
      log.addHandler(new LogHandler())
    } else {
      keys.forEach(key => {
        const config = logging[key]
        if (key === 'console' || config.handler) {
          log.addHandler(new LogHandler(config))
        }
      })
    }
  },
  addHandler: function(func) {
    logHandlers.push(func)
  },
  removeHandler: function(func) {
    var index = logHandlers.indexOf(func)
    if (index > -1) {
      logHandlers.splice(index,1)
    }
  },
  log: function(msg) {
    msg.timestamp = Date.now()
    logHandlers.forEach(function(handler) {
      handler.emit('log',msg)
    })
  },
  info: function(msg) {
    log.log({ level: levels.info, msg })
  },
  warn: function(msg) {
    log.log({ level: levels.warn, msg })
  },
  error: function(msg) {
    log.log({ level: levels.error, msg })
  },
  trace: function(msg) {
    log.log({ level: levels.trace, msg })
  },
  debug: function(msg) {
    log.log({ level: levels.debug, msg })
  },
  metric: function() {
    return metricsEnabled
  },

  audit: function(msg,req) {
    msg.level = log.AUDIT
    if (req) {
      msg.user = req.user
      msg.path = req.path
      msg.ip = (req.headers && req.headers['x-forwarded-for']) || (req.connection && req.connection.remoteAddress) || undefined
    }
    log.log(msg)
  }
}

log['_'] = i18n._
