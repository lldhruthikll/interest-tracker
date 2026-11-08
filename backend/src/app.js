const express = require('express');
const cors = require('cors');
const { HttpError } = require('./lib/errors');
const apiRoutes = require('./routes/api');
const portalRoutes = require('./routes/portal');

function createApp() {
  const app = express();
  // Render terminates TLS in front of us; trust one hop so req.ip (login limiter) is the client IP.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // Enable CORS for frontend requests
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
      credentials: true,
    })
  );

  app.use(express.json());

  // Health check endpoint for Render monitoring
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // API Routes
  // Portal first: apiRoutes' owner-only middleware would 403 PAYERs
  app.use('/api/portal', portalRoutes);
  app.use('/api', apiRoutes);

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Error Handler
  app.use((err, req, res, next) => {
    // Our own HttpErrors carry deliberate messages (e.g. 503 'SMS gateway is not configured'); other 5xx stay masked.
    if (err.status && (err.status < 500 || err instanceof HttpError)) return res.status(err.status).json({ error: err.message });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
