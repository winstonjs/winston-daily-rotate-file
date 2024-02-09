const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const zlib = require("zlib");
const hash = require("object-hash");
const MESSAGE = require("triple-beam").MESSAGE;
const PassThrough = require("stream").PassThrough;
const Transport = require("winston-transport");

const loggerDefaults = {
    json: false,
    colorize: false,
    eol: os.EOL,
    logstash: null,
    prettyPrint: false,
    label: null,
    stringify: false,
    depth: null,
    showLevel: true,
    timestamp: () => {
        return new Date().toISOString();
    }
};

const DailyRotateFile = function(options) {
    options = options || {};
    Transport.call(this, options);

    function throwIf(target /* , illegal... */) {
        Array.prototype.slice.call(arguments, 1).forEach((name) => {
            if (options[name]) {
                throw new Error("Cannot set " + name + " and " + target + " together");
            }
        });
    }

    function getMaxSize(size) {
        if (size && typeof size === "string") {
            if (size.toLowerCase().match(/^((?:0\.)?\d+)([kmg])$/)) {
                return size;
            }
        } else if (size && Number.isInteger(size)) {
            const sizeK = Math.round(size / 1024);
            return sizeK === 0 ? "1k" : sizeK + "k";
        }

        return null;
    }

    function isValidFileName(filename) {
        // eslint-disable-next-line no-control-regex
        return !/["<>|:*?\\/\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f]/g.test(
            filename
        );
    }

    function isValidDirName(dirname) {
        // eslint-disable-next-line no-control-regex
        return !/["<>|\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f]/g.test(
            dirname
        );
    }

    this.options = Object.assign({}, loggerDefaults, options);

    if (options.stream) {
        throwIf("stream", "filename", "maxsize");
        this.logStream = new PassThrough();
        this.logStream.pipe(options.stream);
    } else {
        this.filename = options.filename
            ? path.basename(options.filename)
            : "winston.log";
        this.dirname = options.dirname || path.dirname(options.filename);

        if (!isValidFileName(this.filename) || !isValidDirName(this.dirname)) {
            throw new Error("Your path or filename contain an invalid character.");
        }

        this.logStream = require("file-stream-rotator").getStream({
            filename: path.join(this.dirname, this.filename),
            frequency: options.frequency ? options.frequency : "custom",
            date_format: options.datePattern ? options.datePattern : "YYYY-MM-DD",
            verbose: false,
            size: getMaxSize(options.maxSize),
            max_logs: options.maxFiles,
            end_stream: true,
            audit_file: options.auditFile
                ? options.auditFile
                : path.join(this.dirname, "." + hash(options) + "-audit.json"),
            file_options: options.options ? options.options : { flags: "a" },
            utc: options.utc ? options.utc : false,
            extension: options.extension ? options.extension : "",
            create_symlink: options.createSymlink ? options.createSymlink : false,
            symlink_name: options.symlinkName ? options.symlinkName : "current.log",
            watch_log: options.watchLog ? options.watchLog : false,
            audit_hash_type: options.auditHashType ? options.auditHashType : "sha256"
        });

        this.logStream.on("new", (newFile) => {
            this.emit("new", newFile);
        });

        this.logStream.on("rotate", (oldFile, newFile) => {
            this.emit("rotate", oldFile, newFile);
        });

        this.logStream.on("logRemoved", (params) => {
            if (options.zippedArchive) {
                const gzName = params.name + ".gz";
                try {
                    fs.unlinkSync(gzName);
                } catch (err) {
                    // ENOENT is okay, means file doesn't exist, other errors prevent deletion, so report it
                    if (err.code !== "ENOENT") {
                        err.message = `Error occurred while removing ${gzName}: ${err.message}`;
                        this.emit("error", err);
                        return;
                    }
                }
                this.emit("logRemoved", gzName);
                return;
            }
            this.emit("logRemoved", params.name);
        });

        if (options.zippedArchive) {
            this.logStream.on("rotate", (oldFile) => {
                try {
                    if (!fs.existsSync(oldFile)) {
                        return;
                    }
                } catch (err) {
                    err.message = `Error occurred while checking existence of ${oldFile}: ${err.message}`;
                    this.emit("error", err);
                    return;
                }
                try {
                    if (fs.existsSync(`${oldFile}.gz`)) {
                        return;
                    }
                } catch (err) {
                    err.message = `Error occurred while checking existence of ${oldFile}.gz: ${err.message}`;
                    this.emit("error", err);
                    return;
                }

                const gzip = zlib.createGzip();
                const inp = fs.createReadStream(oldFile);
                inp.on("error", (err) => {
                    err.message = `Error occurred while reading ${oldFile}: ${err.message}`;
                    this.emit("error", err);
                });
                const out = fs.createWriteStream(oldFile + ".gz");
                out.on("error", (err) => {
                    err.message = `Error occurred while writing ${oldFile}.gz: ${err.message}`;
                    this.emit("error", err);
                });
                inp
                    .pipe(gzip)
                    .pipe(out)
                    .on("finish", () => {
                        try {
                            fs.unlinkSync(oldFile);
                        } catch (err) {
                            if (err.code !== "ENOENT") {
                                err.message = `Error occurred while removing ${oldFile}: ${err.message}`;
                                this.emit("error", err);
                                return;
                            }
                        }
                        this.emit("archive", oldFile + ".gz");
                    });
            });
        }

        if (options.watchLog) {
            this.logStream.on("addWatcher", (newFile) => {
                this.emit("addWatcher", newFile);
            });
        }
    }
};

module.exports = DailyRotateFile;

util.inherits(DailyRotateFile, Transport);

DailyRotateFile.prototype.name = "dailyRotateFile";

const noop = function() {};
DailyRotateFile.prototype.log = function (info, callback) {
    callback = callback || noop;

    this.logStream.write(info[MESSAGE] + this.options.eol);
    this.emit("logged", info);
    callback(null, true);
};

DailyRotateFile.prototype.close = function () {
    if (this.logStream) {
        this.logStream.end(() => {
            this.emit("finish");
        });
    }
};

DailyRotateFile.prototype.query = function (options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }

    if (!this.options.json) {
        throw new Error(
            "query() may not be used without the json option being set to true"
        );
    }

    if (!this.filename) {
        throw new Error("query() may not be used when initializing with a stream");
    }

    let results = [];
    options = options || {};

    // limit
    options.rows = options.rows || options.limit || 10;

    // starting row offset
    options.start = options.start || 0;

    // now
    options.until = options.until || new Date();
    if (typeof options.until !== "object") {
        options.until = new Date(options.until);
    }

    // now - 24
    options.from = options.from || options.until - 24 * 60 * 60 * 1000;
    if (typeof options.from !== "object") {
        options.from = new Date(options.from);
    }

    // 'asc' or 'desc'
    options.order = options.order || "desc";

    const logFiles = (() => {
        const fileRegex = new RegExp(this.filename.replace("%DATE%", ".*"), "i");
        return fs.readdirSync(this.dirname).filter((file) => path.basename(file).match(fileRegex));
    })();

    if (logFiles.length === 0 && callback) {
        callback(null, results);
    }

    const processLogFile = (file) => {
        if (!file) {
            return;
        }

        const logFile = path.join(this.dirname, file);
        let buff = "";

        let stream;

        if (file.endsWith(".gz")) {
            stream = new PassThrough();
            const inp = fs.createReadStream(logFile);
            inp.on("error",  (err) => {
                err.message = `Error occurred while reading ${logFile}: ${err.message}`;
                stream.emit("error", err);
            });
            inp.pipe(zlib.createGunzip()).pipe(stream);
        } else {
            stream = fs.createReadStream(logFile, {
                encoding: "utf8",
            });
        }

        stream.on("error",  (err) => {
            if (stream.readable) {
                stream.destroy();
            }

            if (!callback) {
                return;
            }

            return err.code === "ENOENT" ? callback(null, results) : callback(err);
        });

        stream.on("data", (data) => {
            data = (buff + data).split(/\n+/);
            const l = data.length - 1;

            for (let i = 0; i < l; i++) {
                add(data[i]);
            }

            buff = data[l];
        });

        stream.on("end",  () => {
            if (buff) {
                add(buff, true);
            }

            if (logFiles.length) {
                processLogFile(logFiles.shift());
            } else if (callback) {
                results.sort( (a, b) => {
                    const d1 = new Date(a.timestamp).getTime();
                    const d2 = new Date(b.timestamp).getTime();

                    return d1 > d2 ? 1 : d1 < d2 ? -1 : 0;
                });

                if (options.order === "desc") {
                    results = results.reverse();
                }

                const start = options.start || 0;
                const limit = options.limit || results.length;

                results = results.slice(start, start + limit);

                if (options.fields) {
                    results = results.map( (log) => {
                        const obj = {};
                        options.fields.forEach( (key) => {
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
                const log = JSON.parse(buff);
                if (!log || typeof log !== "object") {
                    return;
                }

                const time = new Date(log.timestamp);
                if (
                    (options.from && time < options.from) ||
                    (options.until && time > options.until) ||
                    (options.level && options.level !== log.level)
                ) {
                    return;
                }

                results.push(log);
            } catch (e) {
                if (!attempt) {
                    stream.emit("error", e);
                }
            }
        }
    };
    processLogFile(logFiles.shift());
};
