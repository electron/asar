# Changes By Version

## 1.0.0 - 2019-02-19

## Added

* Promise-based async API (#165)

## Changed

* This module requires Node 6 or later (#165)

## Removed

* V8 snapshot support, which was undocumented and used an unmaintained dependency, which itself had a dependency with a security vulnerability (#165)
* callback-style async API - if you still need to use this style of API, please check out the `nodeify` module (#165)

## 0.14.6 - 2018-12-10

### Fixed

* Normalize file paths in `asar.createPackageFromFiles` (#159)

## 0.14.5 - 2018-10-01

### Fixed

* Regression from #154

## 0.14.4 - 2018-09-30

### Added

* `--is-pack` CLI option / `isPack` option to `asar.listPackage` (#145)

### Fixed

* Allow `asar.createPackageFromFiles` to not pass `metadata` or `options` (#154)

## 0.14.3 - 2018-03-07

### Added

* `globOptions` option to pass options to the `glob` module
* `pattern` option

## 0.14.2 - 2018-02-11

### Fixed

* Invoke callback if the last file in the list was marked as unpacked (#142)

## 0.14.1 - 2018-01-30

### Fixed

* Maximum call stack size exceeded during unpack (#140)

## 0.14.0 - 2017-11-02

### Added

* Snapcraft metadata (#130)
* `uncache` and `uncacheAll` (#118)

### Fixed

* Use of asar inside of an Electron app (#118)

## 0.13.1 - 2017-11-02

### Fixed

- Do not return before the write stream fully closes (#113)

## 0.13.0 - 2017-01-09

### Changed

- Dropped support for Node `0.10.0` and `0.12.0`. The minimum supported version
  is now Node `4.6.0`. (#100)
- This project was ported from CoffeeScript to JavaScript. The behavior and
  APIs should be the same as previous releases. (#100)

## 0.12.4 - 2016-12-28

### Fixed

- Unpack glob patterns containing `{}` characters not working properly (#99)

## 0.12.3 - 2016-08-29

### Fixed

- Multibyte characters in paths are now supported (#86)

## 0.12.2 - 2016-08-22

### Fixed

- Upgraded `minimatch` to `^3.0.3` from `^3.0.0` for [RegExp DOS fix](https://nodesecurity.io/advisories/minimatch_regular-expression-denial-of-service).

## 0.12.1 - 2016-07-25

### Fixed

- Fix `Maximum call stack size exceeded` error regression (#80)

## 0.12.0 - 2016-07-20

### Added

- Added `transform` option to specify a `stream.Transform` function to the
  `createPackageWithOptions` API (#73)

## 0.11.0 - 2016-04-06

### Fixed

- Upgraded `mksnapshot` dependency to remove logged `graceful-fs` deprecation
  warnings (#61)
