class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
class ValidationError extends HttpError {
  constructor(message) { super(400, message); }
}
class NotFound extends HttpError {
  constructor(message = 'Not found') { super(404, message); }
}

// Route/body ids: positive Postgres int, else 400 (not a Prisma 500).
function parseId(v) {
  const s = String(v);
  if (!/^[1-9]\d{0,9}$/.test(s) || Number(s) > 2147483647) throw new ValidationError('Invalid id');
  return Number(s);
}

// Whitelisted body fields → Prisma data. spec: { key: 'text' | 'opt' | 'bool' }. 'text' is required unless partial;
// 'opt' text accepts null/'' (clears); absent keys are skipped. Unlisted keys (e.g. ownerId) never pass through.
function fields(body, spec, partial = false) {
  const data = {};
  for (const [k, type] of Object.entries(spec)) {
    const v = body?.[k];
    if (v === undefined && (partial || type !== 'text')) continue;
    if (type === 'bool') {
      if (typeof v !== 'boolean') throw new ValidationError(`${k} must be true or false`);
      data[k] = v;
    } else if (type === 'opt') {
      if (v !== null && typeof v !== 'string') throw new ValidationError(`${k} must be text`);
      data[k] = v?.trim() || null;
    } else {
      if (typeof v !== 'string' || !v.trim()) throw new ValidationError(`${k} is required`);
      data[k] = v.trim();
    }
  }
  return data;
}

module.exports = { HttpError, ValidationError, NotFound, parseId, fields };
