const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
try {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        console.log('Created logs directory:', logsDir);
    }
} catch (error) {
    console.error('Failed to create logs directory:', error.message);
}


const errorFormat = winston.format((info) => {
    if (info instanceof Error) {
        return Object.assign({}, info, {
            message: info.message,
            stack: info.stack
        });
    }
    return info;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        errorFormat(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            let logMessage = message;
            if (typeof message === 'object') {
                try {
                    logMessage = JSON.stringify(message, null, 2);
                } catch {
                    logMessage = String(message);
                }
            }

            if (stack && level === 'error') {
                return `${timestamp} - ${level.toUpperCase()}: ${logMessage}\n${stack}`;
            }
            return `${timestamp} - ${level.toUpperCase()}: ${logMessage}`;
        })
    ),
    transports: [
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logsDir, 'ussd.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
        }),
        // File transport for errors only
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 3,
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(({ timestamp, level, message }) => {
                    let logMessage = message;
                    if (typeof message === 'object') {
                        try {
                            logMessage = JSON.stringify(message, null, 2);
                        } catch {
                            logMessage = String(message);
                        }
                    }
                    return `${timestamp} - ${level}: ${logMessage}`;
                })
            )
        })
    ],
    // Handle exceptions and rejections
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log')
        }),
        new winston.transports.Console()
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log')
        }),
        new winston.transports.Console()
    ]
});


module.exports = logger;