// Payer (tenant) portal: read-only. Mounted before the owner router in app.js.
const express = require('express');
const { authenticate, requireRole, requirePasswordChanged } = require('../middleware/auth');
const portalController = require('../controllers/portalController');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(authenticate, requireRole('PAYER'), requirePasswordChanged);
router.get('/me', wrap(portalController.me));

module.exports = router;
