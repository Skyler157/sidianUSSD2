require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const redisClient = require('./config/database');
const ussdController = require('./controllers/ussdController');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for USSD responses
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10, // 10 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.logSecurity(req.ip, 'rate_limit_exceeded', {
            url: req.url,
            userAgent: req.get('User-Agent')
        });
        res.status(429).send('con Too many requests. Please try again later.');
    }
});

app.use('/ussd', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    logger.log('system', `Incoming ${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: req.query,
        body: req.body
    });

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.log('system', `Completed ${req.method} ${req.url}`, {
            status: res.statusCode,
            duration: `${duration}ms`
        });
    });

    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const redisConnected = redisClient.isClientConnected();
    const health = {
        status: redisConnected ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
            redis: redisConnected ? 'connected' : 'disconnected'
        },
        uptime: process.uptime()
    };

    res.status(redisConnected ? 200 : 503).json(health);
});

// Session stats endpoint (for monitoring)
app.get('/stats', async (req, res) => {
    try {
        const stats = await require('../services/sessionService').getStats();
        res.json(stats);
    } catch (error) {
        logger.error('system', 'Failed to get stats', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Main USSD endpoint
app.get('/ussd/:msisdn/:sessionid/:shortcode/:response?', async (req, res) => {
    try {
        const { msisdn, sessionid, shortcode, response } = req.params;

        // Validate required parameters
        if (!msisdn || !sessionid || !shortcode) {
            logger.logSecurity(req.ip, 'invalid_request', {
                msisdn,
                sessionid,
                shortcode,
                response
            });
            return res.status(400).send('end Invalid request parameters');
        }

        // Sanitize inputs
        const sanitizedMsisdn = msisdn.replace(/[^0-9]/g, '');
        const sanitizedSessionId = sessionid.replace(/[^a-zA-Z0-9-_]/g, '');
        const sanitizedShortcode = shortcode.replace(/[^0-9*#]/g, '');
        const sanitizedResponse = response ? response.trim() : null;

        // Validate MSISDN format (basic check)
        if (sanitizedMsisdn.length < 10 || sanitizedMsisdn.length > 15) {
            logger.logSecurity(req.ip, 'invalid_msisdn', { msisdn: sanitizedMsisdn });
            return res.status(400).send('end Invalid phone number');
        }

        logger.log('system', 'Processing USSD request', {
            msisdn: sanitizedMsisdn,
            sessionId: sanitizedSessionId,
            shortcode: sanitizedShortcode,
            response: sanitizedResponse,
            ip: req.ip
        });

        // Process USSD request
        const result = await ussdController.handleRequest(
            sanitizedMsisdn,
            sanitizedSessionId,
            sanitizedShortcode,
            sanitizedResponse
        );

        // Send response
        res.set({
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.send(result);

    } catch (error) {
        logger.error('system', 'USSD endpoint error', error);
        res.status(500).send('end Sorry, service temporarily unavailable. Please try again later.');
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('system', 'Unhandled error', error);
    res.status(500).send('end Sorry, service temporarily unavailable. Please try again later.');
});

// 404 handler
app.use((req, res) => {
    logger.logSecurity(req.ip, 'not_found', {
        method: req.method,
        url: req.url
    });
    res.status(404).send('end Service not found');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.log('system', 'SIGTERM received, shutting down gracefully');
    await redisClient.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.log('system', 'SIGINT received, shutting down gracefully');
    await redisClient.disconnect();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('system', 'Uncaught Exception', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('system', 'Unhandled Rejection', { reason, promise });
    process.exit(1);
});

// Start server
async function startServer() {
    try {
        // Connect to Redis
        await redisClient.connect();
        logger.log('system', 'Connected to Redis successfully');

        // Start HTTP server
        app.listen(PORT, () => {
            logger.log('system', `USSD Banking Server started on port ${PORT}`, {
                port: PORT,
                environment: process.env.NODE_ENV,
                timezone: process.env.APP_TIMEZONE
            });
            console.log(`🚀 USSD Banking Server running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`📈 Stats: http://localhost:${PORT}/stats`);
        });

    } catch (error) {
        logger.error('system', 'Failed to start server', error);
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the application
startServer().catch((error) => {
    console.error('❌ Application startup failed:', error);
    process.exit(1);
});

module.exports = app;
