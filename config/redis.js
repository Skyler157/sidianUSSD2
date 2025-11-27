const Redis = require('ioredis');

const cluster = new Redis.Cluster(
    [
        { host: '172.17.40.25', port: 6383 },
        { host: '172.17.40.26', port: 6383 },
        { host: '172.17.40.27', port: 6383 }
    ],
    {
        redisOptions: {
            password: process.env.REDIS_PASSWORD, 
            connectTimeout: 10000,
            retryStrategy: times => Math.min(times * 50, 2000)
        }
    }
);

cluster.on('error', (err) => {
    console.error('Redis Cluster Error:', err);
});

module.exports = {
    client: cluster
};
