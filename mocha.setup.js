const chai = require('chai');
const { jestSnapshotPlugin } = require('mocha-chai-jest-snapshot');

chai.use(jestSnapshotPlugin());
