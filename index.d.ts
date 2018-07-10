declare module "winston-daily-rotate-file" {
    import * as Transport from "winston-transport";

    interface DailyRotateFileTransportOptions extends Transport.TransportStreamOptions {
        json?: boolean;
        eol?: string;

        /**
         * A string representing the moment.js date format to be used for rotating. The meta characters used in this string will dictate the frequency of the file rotation. For example, if your datePattern is simply 'HH' you will end up with 24 log files that are picked up and appended to every day. (default 'YYYY-MM-DD')
         */
        datePattern?: string;

        /**
         * A boolean to define whether or not to gzip archived log files. (default 'false')
         */
        zippedArchive?: boolean;

        /**
         * Filename to be used to log to. This filename can include the %DATE% placeholder which will include the formatted datePattern at that point in the filename. (default: 'winston.log.%DATE%)
         */
        filename?: string;

        /**
         * The directory name to save log files to. (default: '.')
         */
        dirname?: string;

        /**
         * Write directly to a custom stream and bypass the rotation capabilities. (default: null)
         */
        stream?: NodeJS.WritableStream;

        /**
         * Maximum size of the file after which it will rotate. This can be a number of bytes, or units of kb, mb, and gb. If using the units, add 'k', 'm', or 'g' as the suffix. The units need to directly follow the number. (default: null)
         */
        maxSize?: string | number;

        /**
         * Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. (default: null)
         */
        maxFiles?: string | number;
    }

    interface DailyRotateFileTransportInstance extends Transport {
        filename: string;
        dirname: string;
        logStream: NodeJS.WritableStream;
        options: DailyRotateFileTransportOptions;

        new (options?: DailyRotateFileTransportOptions): DailyRotateFileTransportInstance;
    }

    const DailyRotateFile: DailyRotateFileTransportInstance;

    export = DailyRotateFile;
}
