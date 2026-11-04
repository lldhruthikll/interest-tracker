const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const portalRoutes = require('./routes/portal');

function createApp() {
  const app = express();

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
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
