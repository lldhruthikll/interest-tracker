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

module.exports = { HttpError, ValidationError, NotFound };
