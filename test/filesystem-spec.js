'use strict'

const assert = require('assert')
const fs = require('../lib/wrapped-fs')
const path = require('path')
const rimraf = require('rimraf')

const Filesystem = require('../lib/filesystem')

describe('filesystem', function () {
  beforeEach(() => { rimraf.sync(path.join(__dirname, '..', 'tmp'), fs) })

  it('should does not throw error when src path include symbol link', async () => {
    /* eslint-disable no-irregular-whitespace */
    /**
     * Directory structure:
     * tmp
     * ├── private
     * │   └── var
     * │       ├── app
     * │       │   └── file.txt -> ../file.txt
     * │       └── file.txt
     * └── var -> private/var
     */
    const tmpPath = path.join(__dirname, '..', 'tmp')
    const privateVarPath = path.join(tmpPath, 'private', 'var')
    const varPath = path.join(tmpPath, 'var')
    fs.mkdirSync(privateVarPath, { recursive: true })
    fs.symlinkSync(path.relative(tmpPath, privateVarPath), varPath)

    const originFilePath = path.join(varPath, 'file.txt')
    fs.writeFileSync(originFilePath, 'hello world')
    const appPath = path.join(varPath, 'app')
    fs.mkdirpSync(appPath)
    fs.symlinkSync('../file.txt', path.join(appPath, 'file.txt'))

    const filesystem = new Filesystem(varPath)
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'))
    })
  })
})
