const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by @grafana/create-plugin
  ...require('./.config/jest.config'),

  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, '@marcbachmann/cel-js'])],
};
