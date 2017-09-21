'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');
var common = require('winston/lib/winston/common');
var Transport = require('winston').Transport;
var Stream = require('stream').Stream;
var os = require('os');
var winston = require('winston');
var mkdirp = require('mkdirp');
var zlib = require('zlib');

var weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

//
// ### function DailyRotateFile (options)
// #### @options {Object} Options for this instance.
// Constructor function for the DailyRotateFile transport object responsible
// for persisting log messages and metadata to one or more files.
//
var DailyRotateFile = module.exports = function (options) {
  Transport.call(this, options);

  //
  // Helper function which throws an `Error` in the event
  // that any of the rest of the arguments is present in `options`.
  //
  function throwIf(target /* , illegal... */) {
    Array.prototype.slice.call(arguments, 1).forEach(function (name) {
      if (options[name]) {
        throw new Error('Cannot set ' + name + ' and ' + target + 'together');
      }
    });
  }

  if (options.filename || options.dirname) {
    throwIf('filename or dirname', 'stream');
    this._basename = this.filename = options.filename ?
      path.basename(options.filename) :
      'winston.log';

    this.dirname = options.dirname || path.dirname(options.filename);
    this.options = options.options || {flags: 'a'};

    //
    // "24 bytes" is maybe a good value for logging lines.
    //
    this.options.highWaterMark = this.options.highWaterMark || 24;
  } else if (options.stream) {
    throwIf('stream', 'filename', 'maxsize');
    this._stream = options.stream;
    var self = this;
    this._stream.on('error', function (error) {
      self.emit('error', error);
    });

    //
    // We need to listen for drain events when
    // write() returns false. This can make node
    // mad at times.
    //
    this._stream.setMaxListeners(Infinity);
  } else {
    throw new Error('Cannot log to file without filename or stream.');
  }

  this.json = options.json !== false;
  this.colorize = options.colorize || false;
  this.maxsize = options.maxsize || null;
  this.logstash = options.logstash || null;
  this.maxFiles = options.maxFiles || null;
  this.label = options.label || null;
  this.prettyPrint = options.prettyPrint || false;
  this.showLevel = options.showLevel === undefined ? true : options.showLevel;
  this.timestamp = options.timestamp === undefined ? true : options.timestamp;
  this.datePattern = options.datePattern ? options.datePattern : '.yyyy-MM-dd';
  this.depth = options.depth || null;
  this.eol = options.eol || os.EOL;
  this.maxRetries = options.maxRetries || 2;
  this.prepend = options.prepend || false;
  this.createTree = options.createTree || false;
  this.localTime = options.localTime || false;
  this.zippedArchive = options.zippedArchive || false;
  this.maxDays = options.maxDays || 0;

  if (this.json) {
    this.stringify = options.stringify;
  }

  //
  // Internal state variables representing the number
  // of files this instance has created and the current
  // size (in bytes) of the current logfile.
  //
  this._size = 0;
  this._created = 0;
  this._buffer = [];
  this._draining = false;
  this._failures = 0;
  this._archive = false;

  // Internal variable which will hold a record of all files
  // belonging to this transport which are currently in the
  // log directory in chronological order.
  //
  this._currentFiles = function () {
    //
    // Only proceed if maxsize is not configured for this transport.
    if (!this.maxsize) {
      try {
        return fs.readdirSync(this.dirname).filter(function (file) {
          return file.includes(this._basename);
        }.bind(this)).map(function (file) {
          return {
            name: file,
            time: fs.statSync(path.join(this.dirname, file)).mtime.getTime()
          };
        }.bind(this)).sort(function (a, b) {
          return a.time - b.time;
        }).map(function (v) {
          return v.name;
        });
      } catch (e) {
        // directory doesnt exist so there are no files. Do nothing.
      }
    }
    return [];
  }.bind(this)();

  this._year = this._getTime('year');
  this._month = this._getTime('month');
  this._date = this._getTime('date');
  this._hour = this._getTime('hour');
  this._minute = this._getTime('minute');
  this._weekday = weekday[this._getTime('day')];
  var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhM])\1?/g;
  var pad = function (val, len) {
    val = String(val);
    len = len || 2;
    while (val.length < len) {
      val = '0' + val;
    }
    return val;
  };

  this.getFormattedDate = function () {
    // update the year, month, date... variables
    this._year = this._getTime('year');
    this._month = this._getTime('month');
    this._date = this._getTime('date');
    this._hour = this._getTime('hour');
    this._minute = this._getTime('minute');
    this._weekday = weekday[this._getTime('day')];

    var flags = {
      yy: String(this._year).slice(2),
      yyyy: this._year,
      M: this._month + 1,
      MM: pad(this._month + 1),
      d: this._date,
      dd: pad(this._date),
      H: this._hour,
      HH: pad(this._hour),
      m: this._minute,
      mm: pad(this._minute),
      ddd: this._weekday
    };
    return this.datePattern.replace(token, function ($0) {
      return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
    });
  };
};

//
// Inherit from `winston.Transport`.
//
util.inherits(DailyRotateFile, Transport);

/**
 * Define a getter so that `winston.transports.DailyRotateFile`
 * is available and thus backwards compatible.
 */
winston.transports.DailyRotateFile = DailyRotateFile;

//
// Expose the name of this Transport on the prototype
//
DailyRotateFile.prototype.name = 'dailyRotateFile';

//
// ### function log (level, msg, [meta], callback)
// #### @level {string} Level at which to log the message.
// #### @msg {string} Message to log
// #### @meta {Object} **Optional** Additional metadata to attach
// #### @callback {function} Continuation to respond to when complete.
// Core logging method exposed to Winston. Metadata is optional.
//
DailyRotateFile.prototype.log = function (level, msg, meta, callback) {
  if (this.silent) {
    return callback(null, true);
  }

  //
  // If failures exceeds maxRetries then we can't access the
  // stream. In this case we need to perform a noop and return
  // an error.
  //
  if (this._failures >= this.maxRetries) {
    return callback(new Error('Transport is in a failed state.'));
  }

  var self = this;

  var output = common.log({
    level: level,
    message: msg,
    meta: meta,
    json: this.json,
    colorize: this.colorize,
    logstash: this.logstash,
    prettyPrint: this.prettyPrint,
    timestamp: this.timestamp,
    label: this.label,
    stringify: this.stringify,
    showLevel: this.showLevel,
    depth: this.depth,
    formatter: this.formatter,
    humanReadableUnhandledException: this.humanReadableUnhandledException
  }) + this.eol;

  this._size += output.length;

  if (this.filename) {
    this.open(function (err) {
      if (err) {
        //
        // If there was an error enqueue the message
        //
        return self._buffer.push([output, callback]);
      }

      self._write(output, callback);
      self._lazyDrain();
    });
  } else {
    //
    // If there is no `filename` on this instance then it was configured
    // with a raw `WriteableStream` instance and we should not perform any
    // size restrictions.
    //
    this._write(output, callback);
    this._lazyDrain();
  }
};

//
// ### function _write (data, cb)
// #### @data {String|Buffer} Data to write to the instance's stream.
// #### @cb {function} Continuation to respond to when complete.
// Write to the stream, ensure execution of a callback on completion.
//
DailyRotateFile.prototype._write = function (data, callback) {
  // If this is a file write stream, we could use the builtin
  // callback functionality, however, the stream is not guaranteed
  // to be an fs.WriteStream.
  var ret = this._stream.write(data);
  if (!callback) {
    return;
  }

  if (ret === false) {
    return this._stream.once('drain', function () {
      callback(null, true);
    });
  }
  callback(null, true);
};

//
// ### function query (options, callback)
// #### @options {Object} Loggly-like query options for this instance.
// #### @callback {function} Continuation to respond to when complete.
// Query the transport. Options object is optional.
//
DailyRotateFile.prototype.query = function (options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  var self = this;

  // TODO when maxfilesize rotate occurs
  var createdFiles = self._currentFiles.slice(0); // Clone already sorted _currentFiles array
  var results = [];
  var row = 0;
  options = self.normalizeQuery(options);

  if (createdFiles.length === 0 && callback) {
    callback(null, results);
  }

  // Edit so that all created files are read:
  (function readNextFile(nextFile) {
    if (!nextFile) {
      return;
    }
    var file = path.join(self.dirname, nextFile);
    var buff = '';

    var stream = fs.createReadStream(file, {
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
      var i = 0;

      for (; i < l; i++) {
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

      if (createdFiles.length) {
        readNextFile(createdFiles.shift());
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

    function check(log) {
      if (!log) {
        return;
      }

      if (typeof log !== 'object') {
        return;
      }

      var time = new Date(log.timestamp);
      if ((options.from && time < options.from) ||
        (options.until && time > options.until)) {
        return;
      }

      return true;
    }
  })(createdFiles.shift());// executes the function
};

//
// ### function stream (options)
// #### @options {Object} Stream options for this instance.
// Returns a log stream for this transport. Options object is optional.
//
DailyRotateFile.prototype.stream = function (options) {
  var file = path.join(this.dirname, this._getFilename());
  options = options || {};
  var stream = new Stream();

  var tail = {
    file: file,
    start: options.start
  };

  stream.destroy = common.tailFile(tail, function (err, line) {
    if (err) {
      return stream.emit('error', err);
    }

    try {
      stream.emit('data', line);
      line = JSON.parse(line);
      stream.emit('log', line);
    } catch (e) {
      stream.emit('error', e);
    }
  });

  if (stream.resume) {
    stream.resume();
  }

  return stream;
};

//
// ### function open (callback)
// #### @callback {function} Continuation to respond to when complete
// Checks to see if a new file needs to be created based on the `maxsize`
// (if any) and the current size of the file used.
//
DailyRotateFile.prototype.open = function (callback) {
  if (this.opening) {
    //
    // If we are already attempting to open the next
    // available file then respond with a value indicating
    // that the message should be buffered.
    //
    return callback(true);
  } else if (!this._stream || (this.maxsize && this._size >= this.maxsize) ||
    this._filenameHasExpired()) {
    this._cleanOldFiles();
    //
    // If we dont have a stream or have exceeded our size, then create
    // the next stream and respond with a value indicating that
    // the message should be buffered.
    //
    callback(true);
    return this._createStream();
  }

  //
  // Otherwise we have a valid (and ready) stream.
  //
  callback();
};

//
// ### function close ()
// Closes the stream associated with this instance.
//
DailyRotateFile.prototype.close = function () {
  var self = this;

  if (this._stream) {
    this._stream.end();
    this._stream.destroySoon();

    this._stream.once('drain', function () {
      self.emit('flush');
      self.emit('closed');
    });
  }
};

//
// ### function flush ()
// Flushes any buffered messages to the current `stream`
// used by this instance.
//
DailyRotateFile.prototype.flush = function () {
  var self = this;

  //
  // Iterate over the `_buffer` of enqueued messaged
  // and then write them to the newly created stream.
  //
  this._buffer.forEach(function (item) {
    var str = item[0];
    var callback = item[1];

    process.nextTick(function () {
      self._write(str, callback);
      self._size += str.length;
    });
  });

  //
  // Quickly truncate the `_buffer` once the write operations
  // have been started
  //
  self._buffer.length = 0;

  //
  // When the stream has drained we have flushed
  // our buffer.
  //
  self._stream.once('drain', function () {
    self.emit('flush');
    self.emit('logged');
  });
};

//
// ### @private function _createStream ()
// Attempts to open the next appropriate file for this instance
// based on the common state (such as `maxsize` and `_basename`).
//
DailyRotateFile.prototype._createStream = function () {
  var self = this;
  this.opening = true;

  (function checkFile(target) {
    var fullname = path.join(self.dirname, target);
    //
    // Creates the `WriteStream` and then flushes any
    // buffered messages.
    //
    function createAndFlush(size) {
      if (self._stream) {
        self._archive = self.zippedArchive ? self._stream.path : false;

        self._stream.end();
        self._stream.destroySoon();
      }

      if (self.createTree) {
        mkdirp.sync(path.dirname(fullname));
      }

      self._size = size;
      self.filename = target;
      self._stream = fs.createWriteStream(fullname, self.options);
      self._stream.on('error', function (error) {
        if (self._failures < self.maxRetries) {
          self._createStream();
          self._failures++;
        } else {
          self.emit('error', error);
        }
      });

      //
      // We need to listen for drain events when
      // write() returns false. This can make node
      // mad at times.
      //
      self._stream.setMaxListeners(Infinity);

      //
      // When the current stream has finished flushing
      // then we can be sure we have finished opening
      // and thus can emit the `open` event.
      //
      self.once('flush', function () {
        // Because "flush" event is based on native stream "drain" event,
        // logs could be written inbetween "self.flush()" and here
        // Therefore, we need to flush again to make sure everything is flushed
        self.flush();

        self.opening = false;
        self.emit('open', fullname);
      });

      //
      // Remark: It is possible that in the time it has taken to find the
      // next logfile to be written more data than `maxsize` has been buffered,
      // but for sensible limits (10s - 100s of MB) this seems unlikely in less
      // than one second.
      //
      self.flush();
      compressFile();
    }

    function compressFile() {
      var logfile = self._archive;
      self._archive = false;
      if (logfile && fs.existsSync(String(logfile))) {
        var gzip = zlib.createGzip();

        var inp = fs.createReadStream(String(logfile));
        var out = fs.createWriteStream(logfile + '.gz');

        inp.pipe(gzip).pipe(out);
        fs.unlinkSync(String(logfile));
      }
    }

    fs.stat(fullname, function (err, stats) {
      if (err) {
        if (err.code !== 'ENOENT') {
          return self.emit('error', err);
        }

        return createAndFlush(0);
      }

      if (!stats || (self.maxsize && stats.size >= self.maxsize)) {
        //
        // If `stats.size` is greater than the `maxsize` for
        // this instance then try again
        //
        return checkFile(self._getFile(true));
      }

      if (self._filenameHasExpired()) {
        self._year = self._getTime('year');
        self._month = self._getTime('month');
        self._date = self._getTime('date');
        self._hour = self._getTime('hour');
        self._minute = self._getTime('minute');
        self._weekday = weekday[self._getTime('day')];
        self._created = 0;
        return checkFile(self._getFile());
      }

      createAndFlush(stats.size);
    });
  })(this._getFile());
};

//
// ### @private function _getFile ()
// Gets the next filename to use for this instance
// in the case that log filesizes are being capped.
//
DailyRotateFile.prototype._getFile = function (inc) {
  var filename = this._getFilename();
  var remaining;

  if (inc) {
    //
    // Increment the number of files created or
    // checked by this instance.
    //
    // Check for maxFiles option and delete file
    if (this.maxFiles && (this._created >= (this.maxFiles - 1))) {
      remaining = this._created - (this.maxFiles - 1);
      if (remaining === 0) {
        try {
          fs.unlinkSync(path.join(this.dirname, filename));
        } catch (e) {}
      } else {
        try {
          fs.unlinkSync(path.join(this.dirname, filename + '.' + remaining));
        } catch (e) {}
      }
    }

    this._created += 1;
  } else if (!this.maxsize) {
    //
    // If the filename does not exist in the _currentFiles array then add it.
    if (this._currentFiles.indexOf(filename) === -1) {
      this._currentFiles.push(filename);
    }

    // While the _currentFiles array contains more file names than is configured
    // in maxFiles loop the _currentFiles array and delete the file found at el
    // 0.
    while (this.maxFiles && (this._currentFiles.length > this.maxFiles)) {
      try {
        fs.unlinkSync(path.join(this.dirname, this._currentFiles[0]));
      } catch (e) {
        // File isn't accessible, do nothing.
      }

      // Remove the filename that was just deleted from the _currentFiles array.
      this._currentFiles = this._currentFiles.slice(1);
    }
  }

  return this._created ? filename + '.' + this._created : filename;
};

//
// ### @private function _getFilename ()
// Returns the log filename depending on `this.prepend` option value
//
DailyRotateFile.prototype._getFilename = function () {
  var formattedDate = this.getFormattedDate();

  if (this.prepend) {
    if (this.datePattern === '.yyyy-MM-dd') {
      this.datePattern = 'yyyy-MM-dd.';
      formattedDate = this.getFormattedDate();
    }

    return formattedDate + this._basename;
  }

  return this._basename + formattedDate;
};

//
// ### @private function _lazyDrain ()
// Lazily attempts to emit the `logged` event when `this.stream` has
// drained. This is really just a simple mutex that only works because
// Node.js is single-threaded.
//
DailyRotateFile.prototype._lazyDrain = function () {
  var self = this;

  if (!this._draining && this._stream) {
    this._draining = true;

    this._stream.once('drain', function () {
      this._draining = false;
      self.emit('logged');
    });
  }
};

//
// ### @private function _filenameHasExpired ()
// Checks whether the current log file is valid
// based on given datepattern
//
DailyRotateFile.prototype._filenameHasExpired = function () {
  // searching for m is enough to say minute in date pattern
  if (this.datePattern.match(/m/)) {
    return (this._year < this._getTime('year') || this._month < this._getTime('month') || this._date < this._getTime('date') || this._hour < this._getTime('hour') || this._minute < this._getTime('minute'));
  } else if (this.datePattern.match(/H/)) {
    return (this._year < this._getTime('year') || this._month < this._getTime('month') || this._date < this._getTime('date') || this._hour < this._getTime('hour'));
  } else if (this.datePattern.match(/d/)) {
    return (this._year < this._getTime('year') || this._month < this._getTime('month') || this._date < this._getTime('date'));
  } else if (this.datePattern.match(/M/)) {
    return (this._year < this._getTime('year') || this._month < this._getTime('month'));
  } else if (this.datePattern.match(/yy/)) {
    return (this._year < this._getTime('year'));
  }
  return false;
};

//
// ### @private function _getTime ()
// Get current date/time
// based on localTime config
//
DailyRotateFile.prototype._getTime = function (timeType) {
  var now = new Date();

  if (this.localTime) {
    if (timeType === 'year') {
      return now.getFullYear();
    } else if (timeType === 'month') {
      return now.getMonth();
    } else if (timeType === 'date') {
      return now.getDate();
    } else if (timeType === 'hour') {
      return now.getHours();
    } else if (timeType === 'minute') {
      return now.getMinutes();
    } else if (timeType === 'day') {
      return now.getDay();
    }
  }
  if (timeType === 'year') {
    return now.getUTCFullYear();
  } else if (timeType === 'month') {
    return now.getUTCMonth();
  } else if (timeType === 'date') {
    return now.getUTCDate();
  } else if (timeType === 'hour') {
    return now.getUTCHours();
  } else if (timeType === 'minute') {
    return now.getUTCMinutes();
  } else if (timeType === 'day') {
    return now.getUTCDay();
  }
};

// ### @private function _cleanOldFiles ()
// Remove old log files
// based on "maxDays" option
DailyRotateFile.prototype._cleanOldFiles = function () {
  var self = this;
  var millisecondsInDay = 86400000;
  var now = Date.now();

  function removeOldFile(file) {
    fs.unlink(self.dirname + path.sep + file, function (errUnlink) {
      if (errUnlink) {
        console.error('Error removing file ', file);
      }
    });
  }

  function tryToRemoveLogFile(file) {
    var completeFileName = self.dirname + path.sep + file;
    fs.stat(completeFileName, function (errStats, stats) {
      if (errStats) {
        console.error('Error stats file ', file, errStats);
        return;
      }

      var lastChangeTimestamp = ((stats.mtime && stats.mtime.getTime()) || 0);
      var lifeTime = now - lastChangeTimestamp;
      if (stats.isFile() && lifeTime > (millisecondsInDay * self.maxDays)) {
        removeOldFile(file);
      }
    });
  }

  // if not maxDays specified, do not remove old log files
  if (self.maxDays) {
    fs.readdir(self.dirname, function (err, files) {
      if (err) {
        console.error('Error reading directory ', self.dirname, err);
        return;
      }

      var fileNameReg = new RegExp(self._basename, 'g');
      files.forEach(function (file) {
        if (/.log/.test(file) && fileNameReg.test(file)) {
          tryToRemoveLogFile(file);
        }
      });
    });
  }
};
