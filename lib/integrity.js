const crypto = require('crypto')
const fs = require('fs')
const stream = require('stream')
const { promisify } = require('util')

const ALGORITHM = 'SHA256'
// 4MB default block size
const BLOCK_SIZE = 4 * 1024 * 1024

const pipeline = promisify(stream.pipeline)

function hashBlock (block) {
  return crypto.createHash(ALGORITHM).update(block).digest('hex')
}

async function getFileIntegrity (path) {
  const fileHash = crypto.createHash(ALGORITHM)

  const blocks = []
  let currentBlockSize = 0
  let currentBlock = []

  await pipeline(
    fs.createReadStream(path),
    new stream.PassThrough({
      decodeStrings: false,
      transform (_chunk, encoding, callback) {
        fileHash.update(_chunk)

        function handleChunk (chunk) {
          const diffToSlice = Math.min(BLOCK_SIZE - currentBlockSize, chunk.byteLength)
          currentBlockSize += diffToSlice
          currentBlock.push(chunk.slice(0, diffToSlice))
          if (currentBlockSize === BLOCK_SIZE) {
            blocks.push(hashBlock(Buffer.concat(currentBlock)))
            currentBlock = []
            currentBlockSize = 0
          }
          if (diffToSlice < chunk.byteLength) {
            handleChunk(chunk.slice(diffToSlice))
          }
        }
        handleChunk(_chunk)
        callback()
      },
      flush (callback) {
        blocks.push(hashBlock(Buffer.concat(currentBlock)))
        currentBlock = []
        callback()
      }
    })
  )

  return {
    algorithm: ALGORITHM,
    hash: fileHash.digest('hex'),
    blockSize: BLOCK_SIZE,
    blocks: blocks
  }
}

module.exports = getFileIntegrity
