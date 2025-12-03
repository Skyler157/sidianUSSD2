const express = require('express');
require('dotenv').config();

const redisService = require('./config/redis');
const ussdRoutes = require('./routes/ussd');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

//  Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use((req, res, next) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Log requests (but not excessively)
    if (process.env.NODE_ENV !== 'production' || req.path.includes('/ussd')) {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    }
    next();
});

// Rate limiting for USSD endpoints
const ussdRequests = new Map();
app.use('/sidianussd', (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 30; // Max 30 requests per minute per IP

    if (!ussdRequests.has(clientIP)) {
        ussdRequests.set(clientIP, []);
    }

    const requests = ussdRequests.get(clientIP);
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    validRequests.push(now);
    ussdRequests.set(clientIP, validRequests);

    if (validRequests.length > maxRequests) {
        return res.status(429).json({
            status: 'error',
            message: 'Too many requests. Please try again later.'
        });
    }

    next();
});

// Routes 
app.use('/sidianussd', ussdRoutes);

app.get('/health', async (req, res) => {
    try {
        const redisHealth = await redisService.healthCheck();
        const memoryUsage = process.memoryUsage();
        const loadAverage = process.platform === 'win32' ? 'N/A' : require('os').loadavg();

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            server: HOST,
            port: PORT,
            redis: redisHealth,
            uptime: process.uptime(),
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
            },
            loadAverage,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Monitoring endpoint for session stats
app.get('/metrics', async (req, res) => {
    try {
        // This would be expanded in a production system
        res.json({
            timestamp: new Date().toISOString(),
            activeSessions: 'N/A', // Would need Redis SCAN or similar
            cacheHitRate: 'N/A',   // Would need metrics collection
            averageResponseTime: 'N/A'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
            console.log('Redis is ready');
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
