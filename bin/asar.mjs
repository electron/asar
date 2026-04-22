#!/usr/bin/env node

import packageJSON from '../package.json' with { type: 'json' };
import { createPackageWithOptions, listPackage, extractFile, extractAll } from '../lib/asar.js';
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const splitVersion = function (version) {
  return version.split('.').map(function (part) {
    return Number(part);
  });
};
const requiredNodeVersion = splitVersion(packageJSON.engines.node.slice(2));
const actualNodeVersion = splitVersion(process.versions.node);

if (
  actualNodeVersion[0] < requiredNodeVersion[0] ||
  (actualNodeVersion[0] === requiredNodeVersion[0] && actualNodeVersion[1] < requiredNodeVersion[1])
) {
  console.error('CANNOT RUN WITH NODE ' + process.versions.node);
  console.error('asar requires Node ' + packageJSON.engines.node + '.');
  process.exit(1);
}

const commands = {
  pack: {
    aliases: ['p'],
    usage: 'pack|p [options] <dir> <output>',
    description: 'create asar archive',
    args: ['dir', 'output'],
    options: {
      ordering: { type: 'string', description: 'path to a text file for ordering contents' },
      unpack: { type: 'string', description: 'do not pack files matching glob <expression>' },
      'unpack-dir': {
        type: 'string',
        description:
          'do not pack dirs matching glob <expression> or starting with literal <expression>',
      },
      'exclude-hidden': { type: 'boolean', description: 'exclude hidden files' },
    },
    action: (positionals, values) => {
      const [dir, output] = positionals;
      const options = {
        unpack: values.unpack,
        unpackDir: values['unpack-dir'],
        ordering: values.ordering,
        dot: !values['exclude-hidden'],
      };
      return createPackageWithOptions(dir, output, options);
    },
  },
  list: {
    aliases: ['l'],
    usage: 'list|l [options] <archive>',
    description: 'list files of asar archive',
    args: ['archive'],
    options: {
      'is-pack': {
        type: 'boolean',
        short: 'i',
        description: 'each file in the asar is pack or unpack',
      },
    },
    action: (positionals, values) => {
      const [archive] = positionals;
      const files = listPackage(archive, { isPack: values['is-pack'] });
      for (const i in files) {
        console.log(files[i]);
      }
    },
  },
  'extract-file': {
    aliases: ['ef'],
    usage: 'extract-file|ef <archive> <filename>',
    description: 'extract one file from archive',
    args: ['archive', 'filename'],
    options: {},
    action: (positionals) => {
      const [archive, filename] = positionals;
      fs.writeFileSync(path.basename(filename), extractFile(archive, filename));
    },
  },
  extract: {
    aliases: ['e'],
    usage: 'extract|e <archive> <dest>',
    description: 'extract archive',
    args: ['archive', 'dest'],
    options: {},
    action: (positionals) => {
      const [archive, dest] = positionals;
      extractAll(archive, dest);
    },
  },
};

function printHelp() {
  console.log('Usage: asar [options] [command]');
  console.log();
  console.log('Manipulate asar archive files');
  console.log();
  console.log('Options:');
  console.log('  -V, --version                    output the version number');
  console.log('  -h, --help                       display help for command');
  console.log();
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    const label = `${name}|${cmd.aliases[0]}`;
    console.log(`  ${label.padEnd(32)} ${cmd.description}`);
  }
}

function printCommandHelp(cmd) {
  console.log(`Usage: asar ${cmd.usage}`);
  console.log();
  console.log(cmd.description);
  console.log();
  console.log('Options:');
  for (const [opt, spec] of Object.entries(cmd.options)) {
    const prefix = spec.short ? `-${spec.short}, ` : '';
    const suffix = spec.type === 'string' ? ' <value>' : '';
    const label = `${prefix}--${opt}${suffix}`;
    console.log(`  ${label.padEnd(32)} ${spec.description}`);
  }
  console.log(`  ${'-h, --help'.padEnd(32)} display help for command`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printHelp();
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-V') {
  console.log('v' + packageJSON.version);
  process.exit(0);
}

const commandName = args[0];
const commandArgs = args.slice(1);

let command = commands[commandName];
if (!command) {
  command = Object.values(commands).find((cmd) => cmd.aliases.includes(commandName));
}

if (!command) {
  console.log("asar: '%s' is not an asar command. See 'asar --help'.", commandName);
  process.exit(1);
}

let values, positionals;
try {
  ({ values, positionals } = parseArgs({
    args: commandArgs,
    options: {
      ...command.options,
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  }));
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

if (values.help) {
  printCommandHelp(command);
  process.exit(0);
}

if (positionals.length < command.args.length) {
  const missing = command.args[positionals.length];
  console.error(`error: missing required argument '${missing}'`);
  process.exit(1);
}

Promise.resolve(command.action(positionals, values)).catch((error) => {
  console.error(error);
  process.exit(1);
});
