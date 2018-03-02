'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var semver = require('semver');
var zlib = require('zlib');
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

    this.options = Object.assign({}, loggerDefaults, options);

    if (options.stream) {
        throwIf('stream', 'filename', 'maxsize');
        this.logStream = new PassThrough();
        this.logStream.pipe(options.stream);
    } else {
        this.filename = options.filename ? path.basename(options.filename) : 'winston.log';
        this.dirname = options.dirname || path.dirname(options.filename);

        var self = this;

        this.logStream = require('file-stream-rotator').getStream({
            filename: path.join(this.dirname, this.filename),
            frequency: 'custom',
            date_format: options.datePattern ? options.datePattern : 'YYYY-MM-DD',
            verbose: false,
            size: getMaxSize(options.maxSize),
            max_logs: options.maxFiles
        });

        this.logStream.on('rotate', function (oldFile, newFile) {
            self.emit('rotate', oldFile, newFile);
        });

        if (options.zippedArchive) {
            this.logStream.on('rotate', function (oldFile) {
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

    if (!this.filename) {
        throw new Error('query() may not be used when initializing with a stream');
    }

    var self = this;
    var results = [];
    var row = 0;
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
                if (!options.start || row >= options.start) {
                    add(data[i]);
                }
                row++;
            }

            buff = data[l];
        });

        stream.on('close', function () {
            if (buff) {
                add(buff, true);
            }

            if (options.order === 'desc') {
                results = results.reverse();
            }

            if (logFiles.length) {
                processLogFile(logFiles.shift());
            } else if (callback) {
                callback(null, results);
            }
        });

        function add(buff, attempt) {
            try {
                var log = JSON.parse(buff);
                if (check(log)) {
                    push(log);
                }
            } catch (e) {
                if (!attempt) {
                    stream.emit('error', e);
                }
            }
        }

        function check(log) {
            if (!log || typeof log !== 'object') {
                return;
            }

            var time = new Date(log.timestamp);
            if ((options.from && time < options.from) || (options.until && time > options.until)) {
                return;
            }

            return true;
        }

        function push(log) {
            if (options.rows && results.length >= options.rows && options.order !== 'desc') {
                if (stream.readable) {
                    stream.destroy();
                }
                return;
            }

            if (options.fields) {
                var obj = {};
                options.fields.forEach(function (key) {
                    obj[key] = log[key];
                });
                log = obj;
            }

            if (options.order === 'desc') {
                if (results.length >= options.rows) {
                    results.shift();
                }
            }
            results.push(log);
        }
    })(logFiles.shift());
};
