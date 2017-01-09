'use strict'
const fs = require('fs')
const path = require('path')

const _ = require('lodash')

const crawlFilesystem = require('../../lib/crawlfs')

module.exports = function (dirA, dirB, cb) {
  crawlFilesystem(dirA, function (err, pathsA, metadataA) {
    if (err != null) return cb(err)
    crawlFilesystem(dirB, function (err, pathsB, metadataB) {
      if (err != null) return cb(err)
      const relativeA = _.map(pathsA, function (pathAItem) { return path.relative(dirA, pathAItem) })
      const relativeB = _.map(pathsB, function (pathBItem) { return path.relative(dirB, pathBItem) })
      const onlyInA = _.difference(relativeA, relativeB)
      const onlyInB = _.difference(relativeB, relativeA)
      const inBoth = _.intersection(pathsA, pathsB)
      const differentFiles = []
      const errorMsgBuilder = []
      err = null
      for (let i in inBoth) {
        const filename = inBoth[i]
        const typeA = metadataA[filename].type
        const typeB = metadataB[filename].type
        // skip if both are directories
        if (typeA === 'directory' && typeB === 'directory') { continue }
        // something is wrong if the types don't match up
        if (typeA !== typeB) {
          differentFiles.push(filename)
          continue
        }
        const fileContentA = fs.readFileSync(path.join(dirA, filename), 'utf8')
        const fileContentB = fs.readFileSync(path.join(dirB, filename), 'utf8')
        if (fileContentA !== fileContentB) { differentFiles.push(filename) }
      }
      if (onlyInA.length) {
        errorMsgBuilder.push(`\tEntries only in '${dirA}':`)
        for (const file of onlyInA) { errorMsgBuilder.push(`\t  ${file}`) }
      }
      if (onlyInB.length) {
        errorMsgBuilder.push(`\tEntries only in '${dirB}':`)
        for (const file of onlyInB) { errorMsgBuilder.push(`\t  ${file}`) }
      }
      if (differentFiles.length) {
        errorMsgBuilder.push('\tDifferent file content:')
        for (const file of differentFiles) { errorMsgBuilder.push(`\t  ${file}`) }
      }
      if (errorMsgBuilder.length) { err = new Error('\n' + errorMsgBuilder.join('\n')) }
      cb(err)
    })
  })
}
