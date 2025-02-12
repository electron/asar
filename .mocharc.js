module.exports = {
    "watch-files": [
       "test/**/*.js",
       "lib/**/*.js"
    ],
    "recursive": true,
    "file": "./mocha.setup.js", // setup file before everything else loads
    "forbid-only": true
}