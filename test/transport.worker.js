const path = require('path');
// eslint-disable-next-line node/no-unpublished-require -- It's published, see: https://threads.js.org/
const { expose } = require("threads/worker");
const DailyRotateFile = require("../daily-rotate-file");

const logDir = path.join(__dirname, 'concurrent-logs');

const worker = {
    run() {
        new DailyRotateFile({
            dirname: logDir,
            filename: "concurrent.log",
        });
    },
};

expose(worker);
