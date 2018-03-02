# winston-daily-rotate-file

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url]

A transport for [winston](https://github.com/winstonjs/winston) which logs to a rotating file. Logs can be rotated based on a date, size limit, and old logs can be removed based on count or elapsed days.

Starting with version 2.0.0, the transport has been refactored to leverage the the [file-stream-rotator](https://github.com/rogerc/file-stream-rotator/) module. _Some of the options in the 1.x versions of the transport have changed._ Please review the options below to identify any changes needed.

## Install
```
npm install winston-daily-rotate-file
```

## Options
The DailyRotateFile transport can rotate files by minute, hour, day, month, year or weekday. In addition to the options accepted by the logger, `winston-daily-rotate-file` also accepts the following options:

* **datePattern:** A string representing the [moment.js date format](http://momentjs.com/docs/#/displaying/format/) to be used for rotating. The meta characters used in this string will dictate the frequency of the file rotation. For example, if your datePattern is simply 'HH' you will end up with 24 log files that are picked up and appended to every day. (default 'YYYY-MM-DD')
* **zippedArchive:** A boolean to define whether or not to gzip archived log files. (default 'false')
* **filename:** Filename to be used to log to. This filename can include the `%DATE%` placeholder which will include the formatted datePattern at that point in the filename. (default: 'winston.log.%DATE%)
* **dirname:** The directory name to save log files to. (default: '.')
* **stream:** Write directly to a custom stream and bypass the rotation capabilities. (default: null)
* **maxSize:** Maximum size of the file after which it will rotate. This can be a number of bytes, or units of kb, mb, and gb. If using the units, add 'k', 'm', or 'g' as the suffix. The units need to directly follow the number. (default: null)
* **maxFiles:** Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. (default: null)

## Usage
``` js
  var winston = require('winston');
  require('winston-daily-rotate-file');

  var transport = new (winston.transports.DailyRotateFile)({
    filename: 'application-%DATE%.log',
    datePattern: 'YYYY-MM-DD-HH',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  });

  transport.on('rotate', function(oldFilename, newFilename) {
    // do something fun
  });

  var logger = new (winston.Logger)({
    transports: [
      transport
    ]
  });

  logger.info('Hello World!');
```

You can listen for the *rotate* custom event. The rotate event will pass two parameters to the callback (*oldFilename*, *newFilename*).

## LICENSE
MIT

##### AUTHOR: [Charlie Robbins](https://github.com/indexzero)
##### MAINTAINER: [Matt Berther](https://github.com/mattberther)

[npm-image]: https://badge.fury.io/js/winston-daily-rotate-file.svg
[npm-url]: https://npmjs.org/package/winston-daily-rotate-file
[travis-image]: https://travis-ci.org/winstonjs/winston-daily-rotate-file.svg?branch=master
[travis-url]: https://travis-ci.org/winstonjs/winston-daily-rotate-file
[daviddm-image]: https://david-dm.org/winstonjs/winston-daily-rotate-file.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/winstonjs/winston-daily-rotate-file
