'use strict';

var winston = require('winston');
var LegacyDailyRotateFile = require('./legacy-daily-rotate-file');

winston.transports.DailyRotateFile = LegacyDailyRotateFile;
module.exports = LegacyDailyRotateFile;
