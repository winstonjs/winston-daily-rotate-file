/* eslint-disable max-nested-callbacks,no-unused-expressions */
'use strict';

var path = require('path');
var expect = require('chai').expect;
var winston = require('winston');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var moment = require('moment');
var fs = require('fs');
var tk = require('timekeeper');
var MemoryStream = require('./memory-stream');

var DailyRotateFile = require('../');

var fixturesDir = path.join(__dirname, 'fixtures');
rimraf.sync(fixturesDir);
mkdirp(fixturesDir);

var transports = {
  'file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    prepend: false
  }),
  'stream': new DailyRotateFile({stream: new MemoryStream()}),
  'prepended file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename.log'),
    prepend: true
  }),
  'weekday file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename_weekday'),
    datePattern: '.ddd.log'
  }),
  'prepend weekday file': new DailyRotateFile({
    filename: path.join(fixturesDir, 'testfilename_prepend_weekday.log'),
    datePattern: 'ddd-',
    prepend: true
  })
};

describe('winston/transports/daily-rotate-file', function () {
  describe('an instance of the transport', function () {
    describe('with default datePatterns', function () {
      it('should have a proper filename when prepend option is false', function () {
        var now = moment().format('YYYY-MM-DD');
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'prepend-false.log'),
          prepend: false
        });

        expect(transport._getFilename()).to.equal('prepend-false.log.' + now);
      });

      it('should have a proper filename when prepend options is true', function () {
        var now = moment().format('YYYY-MM-DD');
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'prepend-true.log'),
          prepend: true
        });

        expect(transport._getFilename()).to.equal(now + '.prepend-true.log');
      });

      it('should remove leading dot if one is provided with datePattern', function () {
        var now = moment().format('YYYYMMDD');
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'prepend-false.log'),
          prepend: false,
          datePattern: '.yyyyMMdd'
        });

        expect(transport._getFilename()).to.equal('prepend-false.log.' + now);
      });

      it('should not add leading dot if one is not provided with datePattern', function () {
        var now = moment().format('YYYY-MM-DD');
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'log'),
          datePattern: '-yyyy-MM-dd.log'
        });

        expect(transport._getFilename()).to.equal('log-' + now + '.log');
      });

      it('should remove leading dot if one is provided with datePattern when prepend option is true', function () {
        var now = moment().format('YYYY-MM-DD');
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'prepend-true.log'),
          prepend: true,
          datePattern: '.yyyy-MM-dd'
        });

        expect(transport._getFilename()).to.equal(now + '.prepend-true.log');
      });
    });

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
          filename: path.join(fixturesDir, 'invalid', 'testfilename.log')
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

    describe('when passed an valid filename with different date patterns for log rotation', function () {
      // patterns having one start timestamp for which log file will be creted,
      // then one mid timestamp for which log file should not be rotated,
      // and finally one end timestamp for which log file should be rotated and
      // new logfile should be created.
      var patterns = {
        'full year pattern .yyyy': {
          pattern: '.yyyy',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1874993560000, // GMT: Fri, 01 Jun 2029 07:32:40 GMT
          end: 1893483160000, // GMT: Tue, 01 Jan 2030 07:32:40 GMT
          oldfile: 'test-rotation.log.2029',
          newfile: 'test-rotation.log.2030'
        },
        'small year pattern .yy': {
          pattern: '.yy',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1874993560000, // GMT: Fri, 01 Jun 2029 07:32:40 GMT
          end: 1893483160000, // GMT: Tue, 01 Jan 2030 07:32:40 GMT
          oldfile: 'test-rotation.log.29',
          newfile: 'test-rotation.log.30'
        },
        'month pattern .M': {
          pattern: '.M',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1863156760000, // GMT: Mon, 15 Jan 2029 07:32:40 GMT
          end: 1864625560000, // GMT: Thu, 01 Feb 2029 07:32:40 GMT
          oldfile: 'test-rotation.log.1',
          newfile: 'test-rotation.log.2'
        },
        'zero padded month pattern .MM': {
          pattern: '.MM',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1863156760000, // GMT: Mon, 15 Jan 2029 07:32:40 GMT
          end: 1864625560000, // GMT: Thu, 01 Feb 2029 07:32:40 GMT
          oldfile: 'test-rotation.log.01',
          newfile: 'test-rotation.log.02'
        },
        'daypattern .d': {
          pattern: '.d',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1861986760000, // GMT: Mon, 01 Jan 2029 18:32:40 GMT
          end: 1863156760000, // GMT: Mon, 15 Jan 2029 07:32:40 GMT
          oldfile: 'test-rotation.log.1',
          newfile: 'test-rotation.log.15'
        },
        'zero padded day pattern .dd': {
          pattern: '.dd',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1861986760000, // GMT: Mon, 01 Jan 2029 18:32:40 GMT
          end: 1863156760000, // GMT: Mon, 15 Jan 2029 07:32:40 GMT
          oldfile: 'test-rotation.log.01',
          newfile: 'test-rotation.log.15'
        },
        'hour pattern .H': {
          pattern: '.H',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1861947760000, // GMT: Mon, 01 Jan 2029 07:42:40 GMT
          end: 1861950760000, // GMT: Mon, 01 Jan 2029 08:32:40 GMT
          oldfile: 'test-rotation.log.7',
          newfile: 'test-rotation.log.8'
        },
        'zero padded hour pattern .HH': {
          pattern: '.HH',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1861947760000, // GMT: Mon, 01 Jan 2029 07:42:40 GMT
          end: 1861950760000, // GMT: Mon, 01 Jan 2029 08:32:40 GMT
          oldfile: 'test-rotation.log.07',
          newfile: 'test-rotation.log.08'
        },
        'minute pattern .m': {
          pattern: '.m',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:50 GMT
          mid: 1861947170000, // GMT: Mon, 01 Jan 2029 07:32:50 GMT
          end: 1861947760000, // GMT: Mon, 01 Jan 2029 07:42:40 GMT
          oldfile: 'test-rotation.log.32',
          newfile: 'test-rotation.log.42'
        },
        'zero padded minute pattern .mm': {
          pattern: '.mm',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:50 GMT
          mid: 1861947170000, // GMT: Mon, 01 Jan 2029 07:32:50 GMT
          end: 1861947760000, // GMT: Mon, 01 Jan 2029 07:42:40 GMT
          oldfile: 'test-rotation.log.32',
          newfile: 'test-rotation.log.42'
        },
        'daily rotation pattern .yyyy-MM-dd': {
          pattern: '.yyyy-MM-dd',
          start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
          mid: 1861965828000, // GMT: Mon, 01 Jan 2029 12:43:48 GMT
          end: 1863156760000, // GMT: Mon, 15 Jan 2029 07:32:40 GMT
          oldfile: 'test-rotation.log.2029-01-01',
          newfile: 'test-rotation.log.2029-01-15'
        }
      };
      Object.keys(patterns).forEach(function (pattern) {
        describe('when passed the pattern ' + pattern, function () {
          var transport;
          var rotationLogPath = path.join(fixturesDir, 'rotations');

          beforeEach(function () {
            this.time = new Date(patterns[pattern].start);
            tk.travel(this.time);
            rimraf.sync(rotationLogPath);
            mkdirp(rotationLogPath);
            transport = new DailyRotateFile({
              filename: path.join(rotationLogPath, 'test-rotation.log'),
              datePattern: patterns[pattern].pattern
            });
          });

          afterEach(function () {
            tk.reset();
          });

          it('should create log with proper timestamp', function (done) {
            transport.log('error', 'test message');
            // timeout for winston to create the file.
            setTimeout(function () {
              var filesCreated = fs.readdirSync(rotationLogPath);
              expect(filesCreated.length).to.eql(1);
              expect(filesCreated).to.include(patterns[pattern].oldfile);
              this.time = new Date(patterns[pattern].mid);
              tk.travel(this.time);
              transport.log('error', '2nd test message');
              filesCreated = fs.readdirSync(rotationLogPath);
              expect(filesCreated.length).to.eql(1);
              expect(filesCreated).to.include(patterns[pattern].oldfile);
              this.time = new Date(patterns[pattern].end);
              tk.travel(this.time);
              transport.log('error', '3rd test message');
              setTimeout(function () {
                filesCreated = fs.readdirSync(rotationLogPath);
                expect(filesCreated.length).to.eql(2);
                expect(filesCreated).to.include(patterns[pattern].newfile);
                transport.close();
                // timeout for winston to close the file
                setTimeout(function () {
                  done();
                }, 500);
              }, 500);
            }, 500);
          });
        });
      });
    });

    describe('when passed with maxsize and maxfiles', function () {
      var dailyRotationPattern = {
        pattern: '.yyyy-MM-dd',
        start: 1861947160000, // GMT: Mon, 01 Jan 2029 07:32:40 GMT
        mid: 1861986760000, // GMT: Mon, 01 Jan 2029 18:32:40 GMT
        file1: 'test-rotation.log.2029-01-01',
        file2: 'test-rotation.log.2029-01-01.1',
        file3: 'test-rotation.log.2029-01-01.2'
      };

      describe('when passed the pattern ' + dailyRotationPattern.pattern, function () {
        var transport;
        var rotationLogPath = path.join(fixturesDir, 'rotations');

        beforeEach(function () {
          this.time = new Date(dailyRotationPattern.start);
          tk.travel(this.time);
          rimraf.sync(rotationLogPath);
          mkdirp(rotationLogPath);
          transport = new DailyRotateFile({
            filename: path.join(rotationLogPath, 'test-rotation.log'),
            datePattern: dailyRotationPattern.pattern,
            maxFiles: 2,
            maxsize: 100
          });
        });

        afterEach(function () {
          tk.reset();
        });

        it('should properly rotate log with old files getting deleted', function (done) {
          transport.log('error', 'test message with more than 100 bytes data');
          setTimeout(function () {
            transport.log('error', '2nd test with more than 100 bytes data');
            setTimeout(function () {
              this.time = new Date(dailyRotationPattern.mid);
              tk.travel(this.time);
              transport.log('error', '3rd test');
              setTimeout(function () {
                transport.log('error', '4th test message with more than 100 bytes data');
                setTimeout(function () {
                  var filesCreated = fs.readdirSync(rotationLogPath);
                  expect(filesCreated.length).to.eql(2);
                  expect(filesCreated).not.to.include(dailyRotationPattern.file1);
                  expect(filesCreated).to.include(dailyRotationPattern.file2);
                  expect(filesCreated).to.include(dailyRotationPattern.file3);
                  done();
                }, 500);
              }, 100);
            }, 100);
          }, 100);
        });
      });
    });
  });
});
