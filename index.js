const winston = require("winston");
const DailyRotateFile = require("./daily-rotate-file");

winston.transports.DailyRotateFile = DailyRotateFile;
module.exports = DailyRotateFile;
