const objectPath = require('object-path');

module.exports = function(
 arr,
 glue,
 keyPath
) {
  if (!arr || arr.length === 0) {
    return [];
  }

  return arr.slice(0).map(item => objectPath.get(item, keyPath)).join(glue);
}
