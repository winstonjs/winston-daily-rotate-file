'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var zlib = require('zlib');
var hash = require('object-hash');
var MESSAGE = require('triple-beam').MESSAGE;
var PassThrough = require('stream').PassThrough;
var Transport = require('winston-transport');

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
            frequency: options.frequency ? options.frequency : 'custom',
            date_format: options.datePattern ? options.datePattern : 'YYYY-MM-DD',
            verbose: false,
            size: getMaxSize(options.maxSize),
            max_logs: options.maxFiles,
            end_stream: true,
            audit_file: options.auditFile ? options.auditFile : path.join(self.dirname, '.' + hash(options) + '-audit.json'),
            file_options: options.options ? options.options : {flags: 'a'},
            utc: options.utc ? options.utc : false,
            extension: options.extension ? options.extension : '',
            create_symlink: options.createSymlink ? options.createSymlink : false,
            symlink_name: options.symlinkName ? options.symlinkName : 'current.log'
        });

        this.logStream.on('new', function (newFile) {
            self.emit('new', newFile);
        });

        this.logStream.on('rotate', function (oldFile, newFile) {
            self.emit('rotate', oldFile, newFile);
        });

        this.logStream.on('logRemoved', function (params) {
            self.emit('logRemoved', params.name);
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
                    self.emit('archive', oldFile + '.gz');
                });
            });
        }
    }
};

module.exports = DailyRotateFile;

util.inherits(DailyRotateFile, Transport);

DailyRotateFile.prototype.name = 'dailyRotateFile';

var noop = function () {};
DailyRotateFile.prototype.log = function (info, callback) {
    callback = callback || noop;

    this.logStream.write(info[MESSAGE] + this.options.eol);
    this.emit('logged', info);
    callback(null, true);
};

DailyRotateFile.prototype.close = function () {
    var self = this;
    if (this.logStream) {
        this.logStream.end(function () {
            self.emit('finish');
        });
    }
};
