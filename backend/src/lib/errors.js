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

module.exports = { HttpError, ValidationError, NotFound, parseId };
