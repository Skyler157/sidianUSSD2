const express = require('express');
require('dotenv').config();

const redisService = require('./config/redis');
const ussdRoutes = require('./routes/ussd');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

//  Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes 
app.use('/sidianussd', ussdRoutes);

app.get('/health', async (req, res) => {
    try {
        const redisHealth = await redisService.healthCheck();
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            server: HOST,
            port: PORT,
            redis: redisHealth,
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Serve static files + simulator
app.use(express.static('public'));
app.get('/simulator', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// Error Handler 
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
});

// 404 Handler 
app.use('*', (req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint not found'
    });
});

// Start Server 
const server = app.listen(PORT, HOST, () => {
    console.log(`Sidian USSD Service running on ${HOST}:${PORT}`);
    console.log(`Health: http://${HOST}:${PORT}/health`);
});

// Redis Startup Test 
setTimeout(async () => {
    console.log('Testing Redis connection...');
    try {
        if (await redisService.testConnection()) {
            console.log('Redis is ready for USSD sessions');
        }
    } catch (error) {
        console.error('Redis test failed:', error.message);
    }
}, 2000);

// Graceful Shutdown 
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    try {
        await redisService.disconnect();
    } catch (_) { }
    server.close(() => process.exit(0));
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
