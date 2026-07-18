import crypto from 'crypto';

// Must match HRMS JWT_SECRET_KEY (per-app — not shared with KTM)
const secret = 'hrms-jwt-dev-secret-change-me';
const header = {
  alg: 'HS256',
  typ: 'JWT'
};
const payload = {
  sub: 'admin',
  username: 'admin',
  full_name: 'Admin User',
  hrms_access_level: 'admin',
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365) // 1 year
};

function base64url(str) {
  return btoa(JSON.stringify(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const encodedHeader = base64url(header);
const encodedPayload = base64url(payload);

const signature = crypto
  .createHmac('sha256', secret)
  .update(`${encodedHeader}.${encodedPayload}`)
  .digest('base64url');

const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;
console.log(jwt);
