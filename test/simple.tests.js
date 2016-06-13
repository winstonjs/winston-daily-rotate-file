/* eslint-disable max-nested-callbacks,no-unused-expressions */
'use strict';

var path = require('path');
var expect = require('chai').expect;
var winston = require('winston');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var fs = require('fs');
var moment = require('moment');
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
  })
};

describe('winston/transports/daily-rotate-file', function () {
  describe('an instance of the transport', function () {
    describe('with / characters in the datePattern', function () {
      it('should create the full path', function (done) {
        var now = moment();
        var transport = new DailyRotateFile({
          filename: path.join(fixturesDir, 'application'),
          datePattern: '/yyyy/MM/dd.log',
          createTree: true
        });

        transport.log('info', 'test message', {}, function (err) {
          if (err) {
            done(err);
          }

          fs.readFile(path.join(fixturesDir, 'application', now.format('YYYY'), now.format('MM'), now.format('DD') + '.log'), 'utf8', function (err, contents) {
            if (err) {
              done(err);
            }

            var lines = contents.split('\n').filter(function (n) {
              return n !== '';
            });

            expect(lines.length).to.equal(1);
            done();
          });
        });
      });
    });

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
  });
});
