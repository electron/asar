const crypto = require('crypto')
const fs = require('fs')
const stream = require('stream')
const { promisify } = require('util')

const ALGORITHMS = ['SHA256']

const pipeline = promisify(stream.pipeline)

async function hashFile (path) {
  const hashes = {}

  await Promise.all(ALGORITHMS.map(async (algo) => {
    const read = fs.createReadStream(path)
    const hash = crypto.createHash(algo)
    hash.setEncoding('base64')
    await pipeline(
      read,
      hash
    )

    hashes[algo] = hash.read()
  }))

  return hashes
}

module.exports = hashFile
