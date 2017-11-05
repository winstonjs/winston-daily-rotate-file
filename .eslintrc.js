module.exports = exports = {
    extends: 'xo',
    env: {
        node: true,
        mocha: true
    },
    rules: {
        indent: ['error', 4],
        camelcase: ['error', {properties: 'never'}]
    }
};
