const path = require('path')

module.exports.getVersion = function() {
  let version = require(path.join(__dirname, '../../package.json')).version
  /* istanbul ignore else */
  try {
    fs.statSync(path.join(__dirname, '../../.git'))
    version += '-git'
  } catch(err) {
    // No git directory
  }
    return version
}
