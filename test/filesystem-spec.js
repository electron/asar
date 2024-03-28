'use strict'

const assert = require('assert')
const path = require('path')

const Filesystem = require('../lib/filesystem')

describe('filesystem', function () {
  it('should does not throw error when src path include symbol link', async () => {
    const src = path.join(__dirname, 'input', 'srcpath-include-symlink', 'var', 'app')
    const filesystem = new Filesystem(src)
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(src, 'symbol', 'real.txt'))
    })
  })
})
