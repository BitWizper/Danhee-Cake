const crypto = require('crypto');

console.log('JWT_SECRET:', crypto.randomBytes(64).toString('base64'));
console.log('REFRESH_TOKEN_SECRET:', crypto.randomBytes(64).toString('base64'));
