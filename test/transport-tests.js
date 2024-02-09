/* eslint-disable max-nested-callbacks,no-unused-expressions,handle-callback-err */
const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;
const { rimrafSync, rimraf } = require("rimraf");
const winston = require("winston");
// eslint-disable-next-line node/no-unpublished-require
const { spawn, Thread, Worker } = require("threads");
const MemoryStream = require("./memory-stream");
const randomString = require("./random-string");
const DailyRotateFile = require("../daily-rotate-file");

function sendLogItem(transport, level, message, meta, cb) { // eslint-disable-line max-params
    transport.on('logged', function () {
        if (cb) {
            cb(null, true);
        }
    });

    const info = { level: level, message: message };
    const jsonFormat = winston.format.json();
    transport.log(jsonFormat.transform(info, jsonFormat.options));
}

describe('winston/transports/daily-rotate-file', function () {
    beforeEach( () => {
        this.stream = new MemoryStream();
        this.transport = new DailyRotateFile({
            stream: this.stream
        });
        this.transport.on("error", function (err) {
            expect(err).to.be.null; // never true for errors, so will cause test to fail
        });
    });

    it('should have the proper methods defined', () => {
        const transport = new DailyRotateFile({ stream: new MemoryStream() });
        expect(transport).to.be.instanceOf(DailyRotateFile);
        expect(transport).to.respondTo('log');
        expect(transport).to.respondTo('query');
    });

    it('should not allow invalid characters in the filename', () => {
        expect( () => {
            // eslint-disable-next-line no-new
            new DailyRotateFile({
                filename: 'test\0log.log'
            });
        }).to.throw();
    });

    it('should not allow invalid characters in the dirname', () => {
        expect( () => {
            // eslint-disable-next-line no-new
            new DailyRotateFile({
                dirname: 'C:\\application<logs>',
                filename: 'test_%DATE%.log'
            });
        }).to.throw();
    });

    it('should write to the stream', (done) => {
        sendLogItem(this.transport, 'info', 'this message should write to the stream', {}, (err, logged) => {
            expect(err).to.be.null;
            expect(logged).to.be.true;
            const logEntry = JSON.parse(this.stream.toString());
            expect(logEntry.level).to.equal('info');
            expect(logEntry.message).to.equal('this message should write to the stream');
            done();
        });
    });

    describe('when using a filename or dirname', () => {
        const logDir = path.join(__dirname, "logs");
        const now = new Date().toISOString().replace("T", "-").slice(0, 13); // YYYY-MM-DD-HH
        const filename = path.join(logDir, "application-" + now + ".testlog");
        const options = {
            json: true,
            dirname: logDir,
            filename: "application-%DATE%",
            datePattern: "YYYY-MM-DD-HH",
            utc: true,
            extension: ".testlog"
        };

        beforeEach(() => {
            expect(rimrafSync(logDir)).true;
            this.transport = new DailyRotateFile(options);
        });

        it('should write to the file', (done) => {
            const finishListener = () => {
                const logEntries = fs.readFileSync(filename).toString().split("\n").slice(0, -1);
                expect(logEntries.length).to.equal(1);

                const logEntry = JSON.parse(logEntries[0]);
                expect(logEntry.level).to.equal('info');
                expect(logEntry.message).to.equal('this message should write to the file');
                this.transport.removeListener('finish', finishListener)
                done();
            }

            this.transport.on('finish', finishListener);

            sendLogItem(this.transport, 'info', 'this message should write to the file', {},  (err, logged) => {
                expect(err).to.be.null;
                expect(logged).to.be.true;
            });

            this.transport.close();
        });

        it('should not allow the stream to be set', () => {
            const opts = Object.assign({}, options);
            opts.stream = new MemoryStream();
            expect(() => {
                const transport = new DailyRotateFile(opts);
                expect(transport).to.not.be.null;
            }).to.throw();
        });

        it('should raise the new event for a new log file', (done) => {
            this.transport.on('new', (newFile) => {
                expect(newFile).to.equal(filename);
                done();
            });

            sendLogItem(this.transport, 'info', 'this message should write to the file');
            this.transport.close();
        });

        it('should raise the logRemoved event when pruning old log files', (done) => {
            const opts = Object.assign({}, options);
            opts.maxSize = '1k';
            opts.maxFiles = 1;

            this.transport = new DailyRotateFile(opts);

            this.transport.on('logRemoved', (removedFilename) => {
                expect(removedFilename).to.equal(filename);
                done();
            });

            sendLogItem(this.transport, 'info', randomString(1056));
            sendLogItem(this.transport, 'info', randomString(1056));
            this.transport.close();
        });

        describe('when setting zippedArchive', () => {
            it('should archive the log after rotating', (done) => {
                const opts = Object.assign({}, options);
                opts.zippedArchive = true;
                opts.maxSize = '1k';

                this.transport = new DailyRotateFile(opts);

                const finishListener = () => {
                    fs.readdir(logDir,  (err, files) => {
                        expect(files.filter( (file) => {
                            return path.extname(file) === '.gz';
                        }).length).to.equal(1);
                        done();
                    });

                    this.transport.removeListener('finish', finishListener)
                }

                this.transport.on('finish', finishListener);
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                this.transport.close();
            });
        });

        describe('when setting watchLog', () => {
            it('should addWatcher to recreate log if deleted', (done) => {
                const opts = Object.assign({}, options);
                opts.watchLog = true;
                this.transport = new DailyRotateFile(opts);

                this.transport.on('addWatcher', (newFile) => {
                    expect(newFile).to.equal(filename);
                    done()
                });

                this.transport.on('new', (newFile) => {
                    expect(newFile).to.equal(filename);
                });

                sendLogItem(this.transport, 'info', 'First message to file');
                this.transport.close();
            });
        });

        describe('query', () => {
            it('should call callback when no files are present', () => {
                this.transport.query((err, results) => {
                    expect(results).to.not.be.null;
                    expect(results.length).to.equal(0);
                });
            });

            it('should raise error when calling with stream', () => {
                expect(() => {
                    const transport = new DailyRotateFile({ stream: new MemoryStream() });
                    transport.query(null);
                }).to.throw();
            });

            it('should raise error when calling with json set to false', () => {
                expect(() => {
                    const opts = Object.assign({}, options);
                    opts.json = false;
                    const transport = new DailyRotateFile(opts);
                    transport.query(null);
                }).to.throw();
            });

            it('should return log entries that match the query', (done) => {
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));

                const finishListener = () => {
                    this.transport.query((err, results) => {
                        expect(results).to.not.be.null;
                        expect(results.length).to.equal(4);
                        done();
                    });
                    this.transport.removeListener('finish', finishListener)
                }

                this.transport.on('finish', finishListener);

                this.transport.close();
            });

            it('should search within archived files', (done) => {
                const opts = Object.assign({}, options);
                opts.zippedArchive = true;
                opts.maxSize = '1k';

                this.transport = new DailyRotateFile(opts);

                sendLogItem(this.transport, 'info', randomString(1056));
                sendLogItem(this.transport, 'info', randomString(1056));

                this.transport.on('archive', () => {
                    this.transport.query((err, results) => {
                        expect(results).to.not.be.null;
                        expect(results.length).to.equal(2);
                        done();
                    });
                });
            });
        });

        describe('concurrent', () => {
            it('should not throw EEXIST', async () => {
                const logDir = path.join(__dirname, 'concurrent-logs');
                await rimraf(logDir);
                const workers = await Promise.all([
                    spawn(new Worker('./transport.worker.js')),
                    spawn(new Worker('./transport.worker.js')),
                    spawn(new Worker('./transport.worker.js')),
                ]);
                await Promise.all(workers.map(worker => worker.run()));
                await Promise.all(workers.map(worker => Thread.terminate(worker)));
            });
        })
    });
});
