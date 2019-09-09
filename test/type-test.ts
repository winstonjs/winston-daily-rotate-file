import winston from 'winston';
import DailyRotateFileTransport, { DailyRotateFileTransportOptions } from '../';
import * as fs from 'fs';

const ws = fs.createWriteStream('.');

const transport = new DailyRotateFileTransport({
    filename: './asdf%DATE%.log',
    options: {},
});

const transport1 = new DailyRotateFileTransport({
    stream: ws,
} as DailyRotateFileTransportOptions);

const transport2 = new (winston.transports.DailyRotateFileTransport)({
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
