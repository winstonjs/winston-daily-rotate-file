/* eslint-disable max-nested-callbacks,no-unused-expressions,handle-callback-err */
'use strict';

var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var rimraf = require('rimraf');
var moment = require('moment');
var semver = require('semver');
var winston = require('winston');
var MemoryStream = require('./memory-stream');
var randomString = require('./random-string');
var DailyRotateFile = require('../daily-rotate-file');

function sendLogItem(transport, level, message, meta, cb) { // eslint-disable-line max-params
    if (semver.major(winston.version) === 2) {
        transport.log(level, message, meta, cb);
    } else {
        var logger = winston.createLogger({
            transports: [transport]
        });

        transport.on('logged', function () {
            if (cb) {
                cb(null, true);
            }
        });

        logger.info({
            level: level,
            message: message
        });
    }
}

describe('winston/transports/daily-rotate-file', function () {
    beforeEach(function () {
        this.stream = new MemoryStream();
        this.transport = new DailyRotateFile({
            json: true,
            stream: this.stream
        });
    });

    it('should have the proper methods defined', function () {
        var transport = new DailyRotateFile({stream: new MemoryStream()});
        expect(transport).to.be.instanceOf(DailyRotateFile);
        expect(transport).to.respondTo('log');
        expect(transport).to.respondTo('query');
    });

    it('should write to the stream', function (done) {
        var self = this;
        sendLogItem(this.transport, 'info', 'this message should write to the stream', {}, function (err, logged) {
            expect(err).to.be.null;
            expect(logged).to.be.true;
            var logEntry = JSON.parse(self.stream.toString());
            expect(logEntry.level).to.equal('info');
            expect(logEntry.message).to.equal('this message should write to the stream');
            done();
        });
    });

    describe('when passed metadata', function () {
        var circular = {};
        circular.metadata = circular;

        var params = {
            no: {},
            object: {metadata: true},
            primitive: 'metadata',
            circular: circular
        };

        Object.keys(params).forEach(function (param) {
            it('should accept log messages with ' + param + ' metadata', function (done) {
                sendLogItem(this.transport, 'info', 'test log message', params[param], function (err, logged) {
                    expect(err).to.be.null;
                    expect(logged).to.be.true;
                    // TODO parse the metadata value to make sure its set properly
                    done();
                });
            });
        });
    });

    describe('when using a filename or dirname', function () {
        var logDir = path.join(__dirname, 'logs');
        var now = moment().format('YYYY-MM-DD-HH');
        var filename = path.join(logDir, 'application-' + now + '.log');
        var options = {
            json: true,
            dirname: logDir,
            filename: 'application-%DATE%.log',
            datePattern: 'YYYY-MM-DD-HH'
        };

        beforeEach(function (done) {
            var self = this;
            rimraf(logDir, function () {
                self.transport = new DailyRotateFile(options);
                done();
            });
        });

        it('should write to the file', function (done) {
            this.transport.on('finish', function () {
                var logEntries = fs.readFileSync(filename).toString().split('\n').slice(0, -1);
                expect(logEntries.length).to.equal(1);

                var logEntry = JSON.parse(logEntries[0]);
                expect(logEntry.level).to.equal('info');
                expect(logEntry.message).to.equal('this message should write to the file');
                done();
            });

            sendLogItem(this.transport, 'info', 'this message should write to the file', {}, function (err, logged) {
                expect(err).to.be.null;
                expect(logged).to.be.true;
            });

            this.transport.close();
        });

        it('should not allow the stream to be set', function () {
            var opts = Object.assign({}, options);
            opts.stream = new MemoryStream();
            expect(function () {
                var transport = new DailyRotateFile(opts);
                expect(transport).to.not.be.null;
            }).to.throw();
        });

        describe('when setting zippedArchive', function () {
            it('should archive the log after rotating', function (done) {
                var self = this;
                var opts = Object.assign({}, options);
                opts.zippedArchive = true;
                opts.maxSize = '1k';

                this.transport = new DailyRotateFile(opts);

                this.transport.on('finish', function () {
                    fs.readdir(logDir, function (err, files) {
                        expect(files.filter(function (file) {
                            return path.extname(file) === '.gz';
                        }).length).to.equal(1);
                        done();
                    });
                });
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                self.transport.close();
            });
        });

        describe('query', function () {
            it('should call callback when no files are present', function () {
                this.transport.query(function (err, results) {
                    expect(results).to.not.be.null;
                    expect(results.length).to.equal(0);
                });
            });

            it('should raise error when calling with stream', function () {
                expect(function () {
                    var transport = new DailyRotateFile({stream: new MemoryStream()});
                    transport.query(null);
                }).to.throw();
            });

            it('should return log entries that match the query', function (done) {
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));

                var self = this;
                this.transport.on('finish', function () {
                    self.transport.query(function (err, results) {
                        expect(results).to.not.be.null;
                        expect(results.length).to.equal(4);
                        done();
                    });
                });

                this.transport.close();
            });
        });
    });
});
