import winston from 'winston';
import DailyRotateFile from '../';
import * as fs from 'fs';

const ws = fs.createWriteStream('.');

const transport = new DailyRotateFile({
    filename: './asdf%DATE%.log',
    options: {},
});

const transport1 = new DailyRotateFile({
    stream: ws,
});

const transport2 = new (winston.transports.DailyRotateFile)({
    filename: '.',
});

export default transport;

if (require.main === module) {
    console.log(transport);

    const logger = winston.createLogger({
        transports: [
            transport,
        ],
    });

    logger.transports.forEach;
}
