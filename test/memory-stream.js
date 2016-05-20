'use strict';

var Stream = require('stream');
var util = require('util');

module.exports = WritableStream;

util.inherits(WritableStream, Stream.Writable);

function WritableStream(options) {
  Stream.Writable.call(this, options);
}

WritableStream.prototype.write = function () {
  var ret = Stream.Writable.prototype.write.apply(this, arguments);
  if (!ret) {
    this.emit('drain');
  }

  return ret;
};

WritableStream.prototype._write = function (chunk, encoding, callback) {
  this.write(chunk, encoding, callback);
};

WritableStream.prototype.toString = function () {
  return this.toBuffer().toString();
};

WritableStream.prototype.toBuffer = function () {
  var buffers = [];
  this._writableState.buffer.forEach(function (data) {
    buffers.push(data.chunk);
  });

  return Buffer.concat(buffers);
};
