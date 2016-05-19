/*
 * file-test.js: Tests for instances of the Daily Rotate File transport
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */

var path = require('path');
var expect = require('chai').expect;
var winston = require('winston');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var MemoryStream = require('./memory-stream');

var DailyRotateFile = require('../');

var fixturesDir = path.join(__dirname, 'fixtures');
rimraf.sync(fixturesDir);
mkdirp(fixturesDir);

// var stream = fs.createWriteStream(path.join(fixturesDir, 'testfile.log.2012-12-18'));
// var streamPrepended = fs.createWriteStream(path.join(fixturesDir, '2015-03-21_testfile.log'));
/*
var transports = {
  stream: new DailyRotateFile({ stream: stream }),
  prepended: new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: 'yyyy-MM-dd_',
    prepend: true
  }),
  streamPrepended: new DailyRotateFile({ stream: streamPrepended })
};
*/

var transports = {
  'file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: '.yyyy-MM-dd'
  }),
  'stream': new DailyRotateFile({stream: new MemoryStream()}),
  'prepended file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    datePattern: 'yyyy-MM-dd_',
    prepend: true
  })
};

describe('winston/transports/daily-rotate-file', function () {
  describe('an instance of the transport', function () {
    Object.keys(transports).forEach(function (t) {
      describe('when passed a valid ' + t, function () {
        var transport;

        beforeEach(function () {
          transport = transports[t];
        });

        it('should have the proper methods defined', function () {
          expect(transport).to.be.instanceOf(DailyRotateFile);
          expect(transport).to.respondTo('log');
        });

        var levels = winston.config.npm.levels;
        Object.keys(levels).forEach(function (level) {
          describe('with the ' + level + ' level', function () {
            it('should respond with true when passed no metadata', function (done) {
              transport.log(level, 'test message', {}, function (err, logged) {
                expect(err).to.be.null;
                expect(logged).to.be.true;
                done();
              });
            });

            var circular = { };
            circular.metadata = circular;

            var params = {
              no: {},
              object: {metadata: true},
              primitive: 'metadata',
              circular: circular
            };

            Object.keys(params).forEach(function (param) {
              it('should respond with true when passed ' + param + ' metadata', function (done) {
                transport.log(level, 'test message', params[param], function (err, logged) {
                  expect(err).to.be.null;
                  expect(logged).to.be.true;
                  done();
                });
              });
            });
          });
        });
      });
    });

    describe('when passed an invalid filename', function () {
      var transport;

      beforeEach(function () {
        transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'invalid', 'testfilename.log'),
          datePattern: '.yyyy-MM-dd'
        });
      });

      it('should have proper methods defined', function () {
        expect(transport).to.be.instanceOf(DailyRotateFile);
        expect(transport).to.respondTo('log');
      });

      it('should enter noop failed state', function (done) {
        transport.on('error', function (emitErr) {
          expect(emitErr).to.be.instanceOf(Error);
          expect(emitErr.code, 'ENOENT');
          expect(transport._failures).to.equal(transport.maxRetries);
          done();
        });

        transport.log('error', 'test message');
      });
    });
  });
});
/*
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
*/
