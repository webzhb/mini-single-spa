module.export = function (api) {
  api.cache(true);
  return {
    presets: [['@babel/preset-env', { module: false }]],
    plugins: ['@babel/plugin-syntax-dynamic-import'],
  };
};
