const redis = require('redis');
const logger = require('../services/logger');

class RedisService {
    constructor() {
        // Start with one node, cluster will discover others
        this.client = redis.createCluster({
            rootNodes: [
                {
                    socket: {
                        host: process.env.REDIS_HOST || '172.17.40.25',
                        port: parseInt(process.env.REDIS_PORT) || 6380
                    }
                }
            ],
            defaults: {
                socket: {
                    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 15000
                },
                password: process.env.REDIS_PASSWORD || 'bitnami123'
            },
            useReplicas: true 
        });

        this.isReady = false;
        
        this.client.on('ready', () => {
            this.isReady = true;
            logger.info('Redis Cluster ready');
        });

        this.client.on('error', (err) => {
            this.isReady = false;
            logger.error('Redis Cluster error:', err);
        });

        this.client.on('nodeAdded', () => {
            logger.info('Redis node added to cluster');
        });

        // Connect immediately
        this.client.connect().catch(err => {
            logger.error('Redis Cluster connection failed:', err);
        });
    }

    async set(key, value, ttlSeconds = null) {
        try {
            if (ttlSeconds) {
                return await this.client.set(key, value, { EX: ttlSeconds });
            }
            return await this.client.set(key, value);
        } catch (err) {
            logger.error('Redis SET error:', err);
            throw err;
        }
    }

    async get(key) {
        try {
            return await this.client.get(key);
        } catch (err) {
            logger.error('Redis GET error:', err);
            throw err;
        }
    }

    async del(key) {
        try {
            return await this.client.del(key);
        } catch (err) {
            logger.error('Redis DEL error:', err);
            throw err;
        }
    }

    async healthCheck() {
        try {
            await this.client.set('health_check', 'test', { EX: 1 });
            return { status: 'healthy', message: 'Redis Cluster is ready' };
        } catch (err) {
            return { status: 'error', message: err.message };
        }
    }

    async testConnection() {
        try {
            const testKey = 'redis_test_' + Math.random().toString(36).substring(7);
            const testValue = 'test_value';

            await this.set(testKey, testValue, 5);
            const retrieved = await this.get(testKey);
            await this.del(testKey);

            const success = retrieved === testValue;
            if (success) {
                logger.info('Redis Cluster test PASSED');
            } else {
                logger.error('Redis Cluster test FAILED - value mismatch');
            }
            return success;
        } catch (err) {
            logger.error('Redis Cluster connection test failed:', err);
            return false;
        }
    }

    async disconnect() {
        try {
            await this.client.quit();
            logger.info('Redis Cluster disconnected');
        } catch (err) {
            logger.error('Redis Cluster disconnect error:', err);
        }
    }
}

module.exports = new RedisService();