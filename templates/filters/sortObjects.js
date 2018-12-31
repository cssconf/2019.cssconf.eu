const objectPath = require('object-path');

module.exports = function(
  arr,
  keyPath,
  defaultValue = 0,
  compareAs = 'number'
) {
  if (!arr || arr.length < 1) {
    return [];
  }

  return arr.slice(0).sort((objA, objB) => {
    const a = objectPath.get(objA, keyPath, defaultValue);
    const b = objectPath.get(objB, keyPath, defaultValue);
    if (a == null) {
      return 1;
    }
    switch (compareAs) {
      case 'number':
        return a - b;
      case 'string':
        return a.localeCompare(b);
      case 'date':
        if (typeof a == 'string') a = new Date(a);
        if (typeof b == 'string') b = new Date(b);
        return a.getTime() - b.getTime();
    }
  });
};
