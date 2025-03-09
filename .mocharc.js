module.exports = {
  'watch-files': ['test/**/*.js', 'lib/**/*.js'],
  recursive: true,
  file: './test/mocha.setup.js', // setup file before everything else loads
  'forbid-only': process.env.CI ?? false, // make sure no `test.only` is merged into `main`
  reporter: 'spec',
};
