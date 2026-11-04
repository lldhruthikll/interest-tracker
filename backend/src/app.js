const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

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
  app.use('/api', apiRoutes);

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Error Handler
  app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
