import * as path from 'path';

// root dir of the repo
export const ROOT_PROJECT_DIR = path.resolve(__dirname, '..', '..');

// tmp dir we use for test artifacts
export const TEST_APPS_DIR = path.join(ROOT_PROJECT_DIR, 'tmp');
