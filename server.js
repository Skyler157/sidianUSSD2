const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const redisService = require('./config/redis').client;
const ussdRoutes = require('./routes/ussd');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/sidianussd', ussdRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        redis: 'connected' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Sidian USSD Service running on port ${PORT}`);
    console.log(`Test endpoint: http://localhost:${PORT}/sidianussd`);
});

module.exports = app;