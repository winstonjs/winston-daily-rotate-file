/*
 * daily-rotate-file.js: Transport for outputting to a local log file
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENCE
 *
 */

var winston = require('winston');
var File = winston.transports.File;
var util = require('util');
var path = require('path');


var DailyRotateFile = module.exports = function (options) {
  File.call(this, options);

  this.datePattern = options.datePattern != null ? options.datePattern : '.yyyy-MM-dd';
  this.prepend     = options.prepend     || false;

  var now = new Date();
  this._year   = now.getFullYear();
  this._month  = now.getMonth();
  this._date   = now.getDate();
  this._hour   = now.getHours();
  this._minute = now.getMinutes();

  var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhM])\1?/g,
      pad = function (val, len) {
              val = String(val);
              len = len || 2;
              while (val.length < len) val = "0" + val;
              return val;
      };

  this.getFormattedDate = function() {
    var flags = {
      yy:   String(this._year).slice(2),
      yyyy: this._year,
      M:    this._month + 1,
      MM:   pad(this._month + 1),
      d:    this._date,
      dd:   pad(this._date),
      H:    this._hour,
      HH:   pad(this._hour),
      m:    this._minute,
      mm:   pad(this._minute)
    };
    return this.datePattern.replace(token, function ($0) {
      return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
    });
  };
};

//
// Inherit from `winston.Transport`.
//
util.inherits(DailyRotateFile, File);

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
// ### @private function _getFilename ()
// Returns the log filename depending on `this.prepend` option value
//
File.prototype._getFilename = function () {
  var formattedDate = this.getFormattedDate();

  if (this.prepend) {
    return formattedDate + this._basename;
  }

  return this._basename + formattedDate;
};
