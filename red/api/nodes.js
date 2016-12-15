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
