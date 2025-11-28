const redis = require('redis');
const logger = require('../services/logger');

class RedisService {
    constructor() {
        this.client = redis.createClient({
            socket: {
                host: process.env.REDIS_HOST || '172.17.40.25',
                port: 6380,
                connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 15000
            },
            password: process.env.REDIS_PASSWORD || 'bitnami123'
        });

        this.isReady = false;
        this.attachEvents();
        this.client.connect().catch(err => logger.error('Redis connect error:', err.message));
    }

    attachEvents() {
        this.client.on('ready', () => {
            this.isReady = true;
            logger.info('Redis ready');
        });

        this.client.on('error', err => {
            this.isReady = false;
            logger.error('Redis error:', err.message);
        });

        this.client.on('end', () => {
            this.isReady = false;
            logger.warn('Redis connection closed');
        });
    }

    async exec(command, ...args) {
        if (!this.isReady) throw new Error('Redis not ready');

        try {
            return await this.client[command](...args);
        } catch (err) {
            logger.error(`Redis ${command.toUpperCase()} error:`, err.message);
            throw err;
        }
    }

    set(key, value, ttlSeconds = null) {
        return ttlSeconds
            ? this.exec('set', key, value, { EX: ttlSeconds })
            : this.exec('set', key, value);
    }

    get(key) {
        return this.exec('get', key);
    }

    del(key) {
        return this.exec('del', key);
    }

    exists(key) {
        return this.exec('exists', key);
    }

    // Health check
    async healthCheck() {
        return this.isReady
            ? { status: 'healthy', message: 'Redis is ready' }
            : { status: 'error', message: 'Redis not ready' };
    }

    // Test Redis
    async testConnection() {
        try {
            const testKey = 'redis_test';
            const testValue = 'v_' + Date.now();

            await this.set(testKey, testValue, 5);
            const value = await this.get(testKey);

            if (value === testValue) {
                logger.info('Redis test PASSED');
                return true;
            }

            return false;
        } catch (err) {
            logger.error('Redis connection test failed:', err.message);
            return false;
        }
    }

    async disconnect() {
        try {
            await this.client.quit();
            logger.info('Redis disconnected');
        } catch (err) {
            logger.error('Redis disconnect error:', err.message);
        }
    }
}

module.exports = new RedisService();
