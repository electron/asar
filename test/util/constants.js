const path = require('path');

// root dir of the repo
const ROOT_PROJECT_DIR = path.resolve(__dirname, '..', '..');

// tmp dir we use for test artifacts
const TEST_APPS_DIR = path.join(ROOT_PROJECT_DIR, 'tmp');

module.exports = { ROOT_PROJECT_DIR, TEST_APPS_DIR };
