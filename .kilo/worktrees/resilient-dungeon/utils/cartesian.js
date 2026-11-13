function cartesianProduct(attributes) {
  // attributes: { Size: ['S','M'], Color: ['red','Blue'] }
  const keys = Object.keys(attributes);
  if (keys.length === 0) return [];
  const result = [];
  function generate(current, index) {
    if (index === keys.length) {
      result.push({ ...current });
      return;
    }
    const key = keys[index];
    for (const value of attributes[key]) {
      current[key] = value;
      generate(current, index + 1);
    }
  }
  generate({}, 0);
  return result;
}

module.exports = { cartesianProduct };