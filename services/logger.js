const winston = require('winston');
const path = require('path');
const fs = require('fs');

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
        winston.format.printf(({ timestamp, level, message, stack, className, methodName, sessionElapsed }) => {
            let logMessage = message;
            if (typeof message === 'object') {
                try {
                    logMessage = JSON.stringify(message);
                } catch {
                    logMessage = String(message);
                }
            }

            let prefix = '';
            if (className && methodName) {
                prefix = `${className}::${methodName}: `;
            } else if (className) {
                prefix = `${className}: `;
            }

            // Add session elapsed time if available
            let elapsedInfo = '';
            if (sessionElapsed !== undefined) {
                elapsedInfo = `SESSION TIME ELAPSED: ${sessionElapsed} seconds\n`;
            }

            if (stack && level === 'error') {
                return `${elapsedInfo}${timestamp} - ${prefix}${logMessage}\n${stack}`;
            }
            return `${elapsedInfo}${timestamp} - ${prefix}${logMessage}`;
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

                    if (typeof logMessage === 'string') {
                        logMessage = logMessage.replace(/\n/g, '\\n'); 
                        // OR: logMessage = logMessage.replace(/\n/g, ' '); // Replace with spaces
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


logger.logWithContext = (level, message, context = {}) => {
    const { className, methodName, sessionElapsed, ...otherContext } = context;

    return logger.log(level, message, {
        className,
        methodName,
        sessionElapsed,
        ...otherContext
    });
};

logger.sessionStart = (sessionId, msisdn, endTime) => {
    const startTime = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });
    const endTimeFormatted = new Date(endTime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' });

    logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
    logger.info('                                                                              START');
    logger.info(`SESSION STARTED @ ${startTime}`);
    logger.info(`SESSION ENDS @ ${endTimeFormatted}`);
    logger.info(`MSISDN: ${msisdn}`);
    logger.info('SESSION TIME ELAPSED: 0 seconds');
};

logger.sessionEnd = (sessionElapsed) => {
    logger.info(`SESSION TIME ELAPSED: ${sessionElapsed} seconds`, { sessionElapsed });
    logger.info('                                                                               END');
    logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
};

logger.methodCall = (className, methodName, params) => {
    logger.logWithContext('info', params, { className, methodName });
};

logger.apiRequest = (service, data, url) => {
    logger.info(`REQUEST [${service}]: ${data}`);
    logger.info(`URL: ${url}`);
};

logger.apiResponse = (service, response) => {
    logger.info(`RESPONSE [${service}]: ${response}`);
};

logger.menuDisplay = (menuName, type, message, size) => {
    const escapedMessage = message
        .replace(/\n/g, '\\n')  
        .replace(/\r/g, '\\r'); 

    logger.info(`MENU{${menuName}}: ${type} ${escapedMessage}`);

    if (size !== undefined) {
        logger.info(`MESSAGE SIZE: ${size} bytes`);
    }
};;

module.exports = logger;
