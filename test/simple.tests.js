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
    DailyRotateFile = require('../'),
    getFormattedDate = require('./helpers/getFormattedDate');

function assertDailyRotateFile(transport) {
  assert.instanceOf(transport, DailyRotateFile);
  assert.isFunction(transport.log);
};

var transportTestSuite = require('winston/test/transports/transport');

var fixturesDir = path.join(__dirname, 'fixtures');
var stream = fs.createWriteStream(path.join(fixturesDir, 'testfile.log.2012-12-18'));
var transports = {
  standard: new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: '.yyyy-MM-dd'
  }),
  failed: new DailyRotateFile({
    filename: path.join(fixturesDir, 'dir404', 'testfile.log')
  }),
  stream: new DailyRotateFile({ stream: stream }),
  minutely: new DailyRotateFile({
    filename: path.join(fixturesDir, 'correctfile.log'),
    datePattern: '.yyyyMMddHHmm'
  })
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
  })
}).addBatch({
  "An instance of the Daily Rotate File Transport": {
    "when the file currently pointing was removed and time has been passing": {
      topic: function() {

        var self = this;
        var minutely = transports.minutely;
        // log into the current file
        minutely.log('info', 'old log');
        var timestamp = new Date();
        var oldTimestamp = getFormattedDate('.yyyyMMddHHmm', timestamp);
        setTimeout(function() {
          // remove the current file
          fs.unlinkSync(path.join(fixturesDir, 'correctfile.log' + oldTimestamp));
          setTimeout(function() {
            // wait for a minute and log something
            minutely.log('info', 'new log');
            var newTimestamp = getFormattedDate('.yyyyMMddHHmm', new Date());
            setTimeout(function() {
              fs.stat(path.join(fixturesDir, 'correctfile.log' + newTimestamp), self.callback);
            }, 200);
          }, (60 - timestamp.getSeconds() + 1) * 1000);
        }, 200);

      },
      "should be logged into the new file": function(err, stat) {
        // see if the file with new timestamp exists
        assert.isNull(err);
        assert.isNotNull(stat);
        assert.isDefined(stat);
        assert.isTrue(stat.size > 0);
      }
    }
  }
}).export(module);
