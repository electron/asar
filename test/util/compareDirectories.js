'use strict'

const _ = require('lodash')
const fs = process.versions.electron ? require('original-fs') : require('fs')
const path = require('path')
const crawlFilesystem = require('../../lib/crawlfs')

module.exports = function (dirA, dirB) {
  return Promise.all([crawlFilesystem(dirA, null), crawlFilesystem(dirB, null)])
    .then(([[pathsA, metadataA], [pathsB, metadataB]]) => {
      const relativeA = _.map(pathsA, pathAItem => path.relative(dirA, pathAItem))
      const relativeB = _.map(pathsB, pathBItem => path.relative(dirB, pathBItem))
      const onlyInA = _.difference(relativeA, relativeB)
      const onlyInB = _.difference(relativeB, relativeA)
      const inBoth = _.intersection(pathsA, pathsB)
      const differentFiles = []
      const errorMsgBuilder = []
      for (const filename of inBoth) {
        const typeA = metadataA[filename].type
        const typeB = metadataB[filename].type
        // skip if both are directories
        if (typeA === 'directory' && typeB === 'directory') {
          continue
        }
        // something is wrong if the types don't match up
        if (typeA !== typeB) {
          differentFiles.push(filename)
          continue
        }
        const fileContentA = fs.readFileSync(path.join(dirA, filename), 'utf8')
        const fileContentB = fs.readFileSync(path.join(dirB, filename), 'utf8')
        if (fileContentA !== fileContentB) {
          differentFiles.push(filename)
        }
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
      if (errorMsgBuilder.length) {
        throw new Error('\n' + errorMsgBuilder.join('\n'))
      }

      return Promise.resolve()
    })
}
