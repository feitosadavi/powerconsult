const jwt = require('jsonwebtoken');

const secret = 'dev-secret-please-change';

const payload = {
  userId: 'id01',
  storeId: 'store-001',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
};

const token = jwt.sign(payload, secret);

console.log(token);