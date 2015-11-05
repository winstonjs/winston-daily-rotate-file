var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhM])\1?/g;

function pad(val, len) {
  val = String(val);
  len = len || 2;
  while (val.length < len) { val = "0" + val; }
  return val;
};

function getFormattedDate(pattern, date) {
  var flags = {
    yy:   String(date.getFullYear()).slice(2),
    yyyy: date.getFullYear(),
    M:    date.getMonth() + 1,
    MM:   pad(date.getMonth() + 1),
    d:    date.getDate(),
    dd:   pad(date.getDate()),
    H:    date.getHours(),
    HH:   pad(date.getHours()),
    m:    date.getMinutes(),
    mm:   pad(date.getMinutes())
  };
  return pattern.replace(token, function ($0) {
    return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
  });
}

module.exports = getFormattedDate;
