const crypto = require('crypto')
const fs = require('fs')
const stream = require('stream')
const { promisify } = require('util')

const ALGORITHM = 'SHA256'

const pipeline = promisify(stream.pipeline)

async function getFileIntegrity (path) {
  const read = fs.createReadStream(path)
  const hash = crypto.createHash(ALGORITHM)
  hash.setEncoding('hex')
  await pipeline(
    read,
    hash
  )

  return {
    algorithm: ALGORITHM,
    hash: hash.read()
  }
}

module.exports = getFileIntegrity
