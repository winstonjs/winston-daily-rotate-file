'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var semver = require('semver');
var zlib = require('zlib');
var hash = require('object-hash');
var winston = require('winston');
var compat = require('winston-compat');
var MESSAGE = require('triple-beam').MESSAGE;
var PassThrough = require('stream').PassThrough;
var Transport = semver.major(winston.version) === 2 ? compat.Transport : require('winston-transport');

var loggerDefaults = {
    json: false,
    colorize: false,
    eol: os.EOL,
    logstash: null,
    prettyPrint: false,
    label: null,
    stringify: false,
    depth: null,
    showLevel: true,
    timestamp: function () {
        return new Date().toISOString();
    }
};

var DailyRotateFile = function (options) {
    options = options || {};
    Transport.call(this, options);

    function throwIf(target /* , illegal... */) {
        Array.prototype.slice.call(arguments, 1).forEach(function (name) {
            if (options[name]) {
                throw new Error('Cannot set ' + name + ' and ' + target + ' together');
            }
        });
    }

    function getMaxSize(size) {
        if (size && typeof size === 'string') {
            var _s = size.toLowerCase().match(/^((?:0\.)?\d+)([k|m|g])$/);
            if (_s) {
                return size;
            }
        } else if (size && Number.isInteger(size)) {
            var sizeK = Math.round(size / 1024);
            return sizeK === 0 ? '1k' : sizeK + 'k';
        }
        return null;
    }

    function isValidFileName(filename) {
        // eslint-disable-next-line no-control-regex
        return !/["<>|:*?\\/\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f]/g.test(filename);
    }

    function isValidDirName(dirname) {
        // eslint-disable-next-line no-control-regex
        return !/["<>|\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f]/g.test(dirname);
    }

    this.options = Object.assign({}, loggerDefaults, options);

    if (options.stream) {
        throwIf('stream', 'filename', 'maxsize');
        this.logStream = new PassThrough();
        this.logStream.pipe(options.stream);
    } else {
        this.filename = options.filename ? path.basename(options.filename) : 'winston.log';
        this.dirname = options.dirname || path.dirname(options.filename);

        if (!isValidFileName(this.filename) || !isValidDirName(this.dirname)) {
            throw new Error('Your path or filename contain an invalid character.');
        }

        var self = this;

        this.logStream = require('file-stream-rotator').getStream({
            filename: path.join(this.dirname, this.filename),
            frequency: 'custom',
            date_format: options.datePattern ? options.datePattern : 'YYYY-MM-DD',
            verbose: false,
            size: getMaxSize(options.maxSize),
            max_logs: options.maxFiles,
            end_stream: true,
            audit_file: path.join(self.dirname, '.' + hash(options) + '-audit.json'),
            file_options: options.options ? options.options : {flags: 'a'}
        });

        this.logStream.on('rotate', function (oldFile, newFile) {
            self.emit('rotate', oldFile, newFile);
        });

        if (options.zippedArchive) {
            this.logStream.on('rotate', function (oldFile) {
                var oldFileExist = fs.existsSync(oldFile);
                var gzExist = fs.existsSync(oldFile + '.gz');
                if (!oldFileExist || gzExist) {
                    return;
                }
                var gzip = zlib.createGzip();
                var inp = fs.createReadStream(oldFile);
                var out = fs.createWriteStream(oldFile + '.gz');
                inp.pipe(gzip).pipe(out).on('finish', function () {
                    fs.unlinkSync(oldFile);
                });
            });
        }
    }
};

module.exports = DailyRotateFile;

util.inherits(DailyRotateFile, Transport);

DailyRotateFile.prototype.name = 'dailyRotateFile';

var noop = function () {};
if (semver.major(winston.version) === 2) {
    DailyRotateFile.prototype.log = function (level, msg, meta, callback) {
        callback = callback || noop;
        var options = Object.assign({}, this.options, {
            level: level,
            message: msg,
            meta: meta
        });

        var output = compat.log(options) + options.eol;
        this.logStream.write(output);
        callback(null, true);
    };
} else {
    DailyRotateFile.prototype.normalizeQuery = compat.Transport.prototype.normalizeQuery;
    DailyRotateFile.prototype.log = function (info, callback) {
        callback = callback || noop;

        this.logStream.write(info[MESSAGE] + this.options.eol);
        this.emit('logged', info);
        callback(null, true);
    };
}

DailyRotateFile.prototype.close = function () {
    var self = this;
    if (this.logStream) {
        this.logStream.end(function () {
            self.emit('finish');
        });
    }
};

DailyRotateFile.prototype.query = function (options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    if (!this.options.json) {
        throw new Error('query() may not be used without the json option being set to true');
    }

    if (!this.filename) {
        throw new Error('query() may not be used when initializing with a stream');
    }

    var self = this;
    var results = [];
    options = self.normalizeQuery(options);

    var logFiles = (function () {
        var fileRegex = new RegExp(self.filename.replace('%DATE%', '.*'), 'i');
        return fs.readdirSync(self.dirname).filter(function (file) {
            return path.basename(file).match(fileRegex);
        });
    })();

    if (logFiles.length === 0 && callback) {
        callback(null, results);
    }

    (function processLogFile(file) {
        if (!file) {
            return;
        }
        var logFile = path.join(self.dirname, file);
        var buff = '';

        var stream = fs.createReadStream(logFile, {
            encoding: 'utf8'
        });

        stream.on('error', function (err) {
            if (stream.readable) {
                stream.destroy();
            }
            if (!callback) {
                return;
            }
            return err.code === 'ENOENT' ? callback(null, results) : callback(err);
        });

        stream.on('data', function (data) {
            data = (buff + data).split(/\n+/);
            var l = data.length - 1;

            for (var i = 0; i < l; i++) {
                add(data[i]);
            }

            buff = data[l];
        });

        stream.on('close', function () {
            if (buff) {
                add(buff, true);
            }

            if (logFiles.length) {
                processLogFile(logFiles.shift());
            } else if (callback) {
                results.sort(function (a, b) {
                    var d1 = new Date(a.timestamp).getTime();
                    var d2 = new Date(b.timestamp).getTime();

                    return d1 > d2 ? 1 : d1 < d2 ? -1 : 0;
                });

                if (options.order === 'desc') {
                    results = results.reverse();
                }

                var start = options.start || 0;
                var limit = options.limit || results.length;

                results = results.slice(start, start + limit);

                if (options.fields) {
                    results = results.map(function (log) {
                        var obj = {};
                        options.fields.forEach(function (key) {
                            obj[key] = log[key];
                        });
                        return obj;
                    });
                }
                callback(null, results);
            }
        });

        function add(buff, attempt) {
            try {
                var log = JSON.parse(buff);
                if (!log || typeof log !== 'object') {
                    return;
                }

                var time = new Date(log.timestamp);
                if ((options.from && time < options.from) || (options.until && time > options.until)) {
                    return;
                }

                results.push(log);
            } catch (e) {
                if (!attempt) {
                    stream.emit('error', e);
                }
            }
        }
    })(logFiles.shift());
};
