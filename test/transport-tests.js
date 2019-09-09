/* eslint-disable max-nested-callbacks,no-unused-expressions,handle-callback-err */
'use strict';

var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var rimraf = require('rimraf');
var moment = require('moment');
var winston = require('winston');
var MemoryStream = require('./memory-stream');
var randomString = require('./random-string');
var DailyRotateFile = require('../daily-rotate-file');

function sendLogItem(transport, level, message, meta, cb) { // eslint-disable-line max-params
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
    });

    it('should not allow invalid characters in the filename', function () {
        expect(function () {
            // eslint-disable-next-line no-new
            new DailyRotateFile({
                filename: 'test\0log.log'
            });
        }).to.throw();
    });

    it('should not allow invalid characters in the dirname', function () {
        expect(function () {
            // eslint-disable-next-line no-new
            new DailyRotateFile({
                dirname: 'C:\\application<logs>',
                filename: 'test_%DATE%.log'
            });
        }).to.throw();
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
        var now = moment().utc().format('YYYY-MM-DD-HH');
        var filename = path.join(logDir, 'application-' + now + '.testlog');
        var options = {
            json: true,
            dirname: logDir,
            filename: 'application-%DATE%',
            datePattern: 'YYYY-MM-DD-HH',
            utc: true,
            extension: '.testlog'
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

        it('should raise the new event for a new log file', function (done) {
            this.transport.on('new', function (newFile) {
                expect(newFile).to.equal(filename);
                done();
            });

            sendLogItem(this.transport, 'info', 'this message should write to the file');
            this.transport.close();
        });

        it('should raise the logRemoved event when pruning old log files', function (done) {
            var opts = Object.assign({}, options);
            opts.maxSize = '1k';
            opts.maxFiles = 1;

            this.transport = new DailyRotateFile(opts);

            this.transport.on('logRemoved', function (removedFilename) {
                expect(removedFilename).to.equal(filename);
                done();
            });

            sendLogItem(this.transport, 'info', randomString(1056));
            sendLogItem(this.transport, 'info', randomString(1056));
            this.transport.close();
        });

        describe('when setting zippedArchive', function () {
            it('should archive the log after rotating', function (done) {
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
                this.transport.close();
            });
        });
    });
});
