#!/usr/bin/env node
const asar = require('..')
const path = require('path')
const yargs = require('yargs')

const args = yargs
  .usage('Usage: $0 <command> [options] [arguments]')
  .strict()
  .help()
  .version(`v${require('../package.json').version}`)
  .command(['pack <dir> <output>', 'p'], 'create asar archive', {
    'exclude-hidden': {
      boolean: true,
      description: 'exclude hidden files'
    },
    ordering: {
      description: 'path to a text file for ordering contents'
    },
    unpack: {
      description: 'do not pack files matching glob <expression>'
    },
    'unpack-dir': {
      description: 'do not pack dirs matching glob <expression> or starting with literal <expression>'
    }
  }, async pack => {
    try {
      await asar.createPackageWithOptions(pack.dir, pack.output, {
        unpack: pack.unpack,
        unpackDir: pack.unpackDir,
        ordering: pack.ordering,
        dot: !pack.excludeHidden
      })
    } catch (error) {
      console.error(error.stack)
      process.exit(1)
    }
  }).command(['list <archive>', 'l'], 'list files of asar archive', {
    'is-pack': {
      alias: 'i',
      boolean: true,
      description: 'describe whether a file is packed or unpacked'
    }
  }, list => {
    for (const file of asar.listPackage(list.archive, { isPack: list.isPack })) {
      console.log(file)
    }
  }).command(['extract-file <archive> <filename>', 'ef'], 'extract one file from the archive', {}, extractFile => {
    require('fs').writeFileSync(
      path.basename(extractFile.filename),
      asar.extractFile(extractFile.archive, extractFile.filename)
    )
  }).command(['extract <archive> <dest>', 'e'], 'extract archive', {}, extract => {
    asar.extractAll(extract.archive, extract.dest)
  })

const command = args.argv._[0]
if (!command) {
  args.showHelp()
}
