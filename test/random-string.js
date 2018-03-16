var uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var lowers = 'abcdefghijklmnopqrstuvwxyz';
var numbers = '0123456789';
var specials = '_-|@.,?/!~#$%^&*(){}[]+=';
var charClasses = [uppers, lowers, numbers, specials];
var minLen = charClasses.length;
function chooseRandom(x) {
    var i = Math.floor(Math.random() * x.length);
    return (typeof (x) === 'string') ? x.substr(i, 1) : x[i];
}

module.exports = function (maxLen) {
    maxLen = (maxLen || 36);
    if (maxLen < minLen) {
        throw new Error('length must be >= ' + minLen);
    }
    var str = '';
    var usedClasses = {};
    var charClass;
    do { // Append a random char from a random char class.
        while (str.length < maxLen) {
            charClass = chooseRandom(charClasses);
            usedClasses[charClass] = true;
            str += chooseRandom(charClass);
        }
        // Ensure we have picked from every char class.
    } while (Object.keys(usedClasses).length !== charClasses.length);
    return str;
};
