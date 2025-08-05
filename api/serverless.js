// Vercel serverless function entry point
const express = require('express');
const { registerRoutes } = require('../server/routes');

const app = express();

// Initialize the Express app with routes
async function handler(req, res) {
  // Set up the Express app if not already done
  if (!app._vercelInitialized) {
    await registerRoutes(app);
    app._vercelInitialized = true;
  }
  
  return app(req, res);
}

module.exports = handler;