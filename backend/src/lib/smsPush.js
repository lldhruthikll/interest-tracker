// Copied from android_in_app/clients/node/smsPush.js (SMS Push Gateway client). Keep the two in sync.
// SMS Push Gateway client: send an SMS through your phone via Firebase Cloud Messaging.
// Zero dependencies, Node 18+ (global fetch). Copy this one file into any app.
//
//   const { sendSms } = require('./smsPush');
//   await sendSms({ serviceAccount, deviceToken, secret, to: '+919840000000', text: 'Hi Ravi…' });
//
// serviceAccount: the parsed service-account JSON from Firebase (Project settings → Service accounts).
// deviceToken / secret: copied from the phone app's screen.
const crypto = require('crypto');

// Must match Signature.kt on the phone: id \n to \n text \n ts \n cb \n sim, "" for missing ones.
function sign(secret, { id, to, text, ts, cb = '', sim = '' }) {
  return crypto.createHmac('sha256', secret).update([id, to, text, ts, cb, sim].join('\n'), 'utf8').digest('hex');
}

const b64url = (x) => Buffer.from(x).toString('base64url');

// OAuth access token for the FCM v1 API from a service account (RS256 JWT grant), cached until near expiry.
const tokenCache = new Map();
async function accessToken(sa) {
  const hit = tokenCache.get(sa.client_email);
  if (hit && hit.exp - 60 > Date.now() / 1000) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${signature}` }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${JSON.stringify(body)}`);
  tokenCache.set(sa.client_email, { token: body.access_token, exp: now + body.expires_in });
  return body.access_token;
}

/**
 * Queue one SMS. Resolves with { id, name } once Google accepted the push (not when the SMS is sent;
 * pass callbackUrl to hear SENT / DELIVERED / FAILED / REJECTED from the phone).
 * ttlSeconds: how long Google keeps it if the phone is offline (the phone itself refuses anything older than 48 h).
 */
async function sendSms({ serviceAccount, deviceToken, secret, to, text, id = crypto.randomUUID(), callbackUrl, simSlot, ttlSeconds = 86400 }) {
  if (!/^\+?[0-9]{6,15}$/.test(to)) throw new Error(`Bad phone number: ${to}`);
  if (!text) throw new Error('text is required');
  const data = { id, to, text, ts: String(Math.floor(Date.now() / 1000)) };
  if (callbackUrl) data.cb = callbackUrl;
  if (simSlot !== undefined && simSlot !== null) data.sim = String(simSlot);
  data.sig = sign(secret, data);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(serviceAccount)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: deviceToken, data, android: { priority: 'HIGH', ttl: `${ttlSeconds}s` } } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`FCM send failed: ${res.status} ${JSON.stringify(body)}`);
  return { id, name: body.name };
}

/** For your callback endpoint: true when X-Signature matches the raw request body. */
function verifyCallback(secret, rawBody, signature) {
  const want = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(String(signature || '').toLowerCase());
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

module.exports = { sendSms, sign, verifyCallback };
