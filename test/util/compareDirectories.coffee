fs = require 'fs'
path = require 'path'
_ = require 'lodash'

crawlFilesystem = require '../../lib/crawlfs'

module.exports = (dirA, dirB, cb) ->
  crawlFilesystem dirA, (err, pathsA, metadataA) ->
    crawlFilesystem dirB, (err, pathsB, metadataB) ->
      relativeA = _.map pathsA, (pathAItem) -> path.relative dirA, pathAItem
      relativeB = _.map pathsB, (pathBItem) -> path.relative dirB, pathBItem
      onlyInA = _.difference relativeA, relativeB
      onlyInB = _.difference relativeB, relativeA
      inBoth = _.intersection pathsA, pathsB
      differentFiles = []
      errorMsgBuilder = []
      err = null
      for i of inBoth
        filename = inBoth[i]
        typeA = metadataA[filename].type
        typeB = metadataB[filename].type
        # skip if both are directories
        continue if 'directory' is typeA and 'directory' is typeB
        # something is wrong if one entry is a file and the other is a directory
        #if (typeA is 'directory' and typeB isnt 'directory') \
        #or (typeA isnt 'directory' and typeB is 'directory')
        if typeA isnt typeB
          differentFiles.push filename
          continue
        fileContentA = fs.readFileSync(path.join(dirA, filename), 'utf8')
        fileContentB = fs.readFileSync(path.join(dirB, filename), 'utf8')
        differentFiles.push filename if fileContentA isnt fileContentB
      if onlyInA.length
        errorMsgBuilder.push "\tEntries only in '#{dirA}':"
        for file in onlyInA
          errorMsgBuilder.push "\t  #{file}"
      if onlyInB.length
        errorMsgBuilder.push "\tEntries only in '#{dirB}':"
        for file in onlyInB
          errorMsgBuilder.push "\t  #{file}"
      if differentFiles.length
        errorMsgBuilder.push "\tDifferent file content:"
        for file in differentFiles
          errorMsgBuilder.push "\t  #{file}"
      err = new Error "\n" + errorMsgBuilder.join "\n" if errorMsgBuilder.length
      #isIdentical =  not (onlyInA.length or onlyInB.length or differentFiles.length)
      #cb if isIdentical then null else new Error(errorMsg)
      cb err
      return
    return
  return