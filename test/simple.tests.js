/*
 * file-test.js: Tests for instances of the Daily Rotate File transport
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */

var path = require('path'),
    vows = require('vows'),
    fs = require('fs'),
    assert = require('assert'),
    winston = require('winston'),
    helpers = require('winston/test/helpers'),
    DailyRotateFile = require('../');


function assertDailyRotateFile(transport) {
  assert.instanceOf(transport, DailyRotateFile);
  assert.isFunction(transport.log);
};

var transportTestSuite = require('winston/test/transports/transport');

var fixturesDir = path.join(__dirname, 'fixtures');
var stream = fs.createWriteStream(path.join(fixturesDir, 'testfile.log.2012-12-18'));
var streamPrepended = fs.createWriteStream(path.join(fixturesDir, '2015-03-21_testfile.log'));

var transports = {
  standard: new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: '.yyyy-MM-dd'
  }),
  failed: new DailyRotateFile({
    filename: path.join(fixturesDir, 'dir404', 'testfile.log')
  }),
  stream: new DailyRotateFile({ stream: stream }),
  prepended: new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: 'yyyy-MM-dd_',
    prepend: true
  }),
  streamPrepended: new DailyRotateFile({ stream: streamPrepended })
};

vows.describe('winston/transports/daily-rotate-file').addBatch({
  "An instance of the Daily Rotate File Transport": {
    "when passed a valid filename": {
      "should have the proper methods defined": function () {
        assertDailyRotateFile(transports.standard);
      },
      "the log() method": helpers.testNpmLevels(transports.standard, "should respond with true", function (ign, err, logged) {
        assert.isNull(err);
        assert.isTrue(logged);
      })
    },
    "when passed an invalid filename": {
      "should have proper methods defined": function () {
        assertDailyRotateFile(transports.failed);
      },
      "should enter noop failed state": function () {
        helpers.assertFailedTransport(transports.failed);
      }
    },
    "when passed a valid file stream": {
      "should have the proper methods defined": function () {
        assertDailyRotateFile(transports.stream);
      },
      "the log() method": helpers.testNpmLevels(transports.stream, "should respond with true", function (ign, err, logged) {
        assert.isNull(err);
        assert.isTrue(logged);
      })
    }
  },
  "An instance of the Daily Rotate File Transport with 'prepend' option": {
   "when passed a valid filename": {
      "the log() method": helpers.testNpmLevels(transports.prepended, "should respond with true", function (ign, err, logged) {
        assert.isNull(err);
        assert.isTrue(logged);
      })
    },
    "when passed a valid file stream": {
      "the log() method": helpers.testNpmLevels(transports.streamPrepended, "should respond with true", function (ign, err, logged) {
        assert.isNull(err);
        assert.isTrue(logged);
      })
    }
  }
}).addBatch({
  "These tests have a non-deterministic end": {
    topic: function () {
      setTimeout(this.callback, 200);
    },
    "and this should be fixed before releasing": function () {
      assert.isTrue(true);
    }
  }
}).addBatch({
  "An instance of the Daily Rotate File Transport": transportTestSuite(DailyRotateFile, {
    filename: path.join(fixturesDir, 'testfile.log'),
    datePattern: '.2012-12-18'
  }),
  "An instance of the Daily Rotate File Transport with 'prepend' option": transportTestSuite(DailyRotateFile, {
    filename: path.join(fixturesDir, 'testfile.log'),
    datePattern: '2015-03-21_',
    prepend: true
  })
}).export(module);
