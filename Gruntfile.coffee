module.exports = (grunt) ->
  grunt.initConfig
    pkg: grunt.file.readJSON('package.json')

    coffee:
      glob_to_multiple:
        expand: true
        cwd: 'src'
        src: ['*.coffee']
        dest: 'lib'
        ext: '.js'

    coffeelint:
      options:
        configFile: 'coffeelint.json'
      src: ['src/**/*.coffee']

  grunt.loadNpmTasks('grunt-contrib-coffee')
  grunt.loadNpmTasks('grunt-coffeelint')
  grunt.registerTask('default', ['coffee', 'coffeelint'])
  grunt.registerTask 'clean', ->
    rm = require('rimraf').sync
    rm('lib')
    rm('build')
