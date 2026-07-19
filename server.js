/**
 * server.js
 * Core Express server for Clarity - Digital Detox & Cognitive Load Optimizer.
 * Ingests notifications, manages real-time streams, routes AI API calls,
 * and handles OAuth authentication.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Route Handlers
const authRoutes = require('./routes/auth');
const triageRoutes = require('./routes/triage');
const subscriptionRoutes = require('./routes/subscriptions');
const decisionRoutes = require('./routes/decisions');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware Stack
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global Request Logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// API Routes mounting
app.use('/api/auth', authRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/decisions', decisionRoutes);

// Catch-all route to serve the frontend for SPA routing if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Bootstrap Server
server.listen(PORT, () => {
  console.log('==================================================');
  console.log(` Clarity Server running on port ${PORT}`);
  console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Local Access: http://localhost:${PORT}`);
  console.log('==================================================');
});

module.exports = { app, server };
