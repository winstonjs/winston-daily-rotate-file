# winston-daily-rotate-file

### [SEEKING NEW MAINTAINER][maintainer-issue]

**I will be continuing work on `winston` itself with gusto, but do not plan on spending cycles on maintaining this transport. This was the primary motivation for breaking it out from the core in `winston@2.0.0`. If you are interested please let me know in the [tracking Github issue][maintainer-issue].**

## Usage

A transport for winston which logs to a rotating file each day.

``` js
  winston.add(require('winston-daily-rotate-file'), options)
```

The DailyRotateFile transport can rotate files by minute, hour, day, month or year. Its options are identical to the File transport with the lone addition of the 'datePattern' option:

* __datePattern:__ A string representing the pattern to be used when appending the date to the filename (default '.yyyy-MM-dd'). The meta characters used in this string will dictate the frequency of the file rotation. For example if your datePattern is simply '.HH' you will end up with 24 log files that are picked up and appended to every day.

Valid meta characters in the datePattern are:

* __yy:__ Last two digits of the year.
* __yyyy:__ Full year.
* __M:__ The month.
* __MM:__ The zero padded month.
* __d:__ The day.
* __dd:__ The zero padded day.
* __H:__ The hour.
* __HH:__ The zero padded hour.
* __m:__ The minute.
* __mm:__ The zero padded minute.

*Metadata:* Logged via util.inspect(meta);

##### LICENSE: MIT
##### AUTHOR: [Charlie Robbins](https://github.com/indexzero)

[maintainer-issue]: https://github.com/winstonjs/winston-daily-rotate-file/issues/5
