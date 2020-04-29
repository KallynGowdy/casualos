import * as path from 'path';
import * as fs from 'fs';
import { Config } from './config';
import playerConfig from './player.config';

const config: Config = {
    socket: {
        pingInterval: 25000,
        pingTimeout: 15000,
        serveClient: false,
    },
    socketPort: 4567,
    httpPort: 3000,
    tls: null,
    player: playerConfig,
    mongodb: {
        url: 'mongodb://127.0.0.1:27017',
    },
    cassandradb: {
        contactPoints: ['localhost:9042'],
        localDataCenter: 'datacenter1',
        slowRequestTime: 1000,
    },
    redis: {
        options: {
            host: '127.0.0.1',
            port: 6379,
        },
        defaultExpireSeconds: 60, // expire after a minute
    },
    trees: {
        dbName: 'aux-trees',
    },
    repos: {
        mongodb: {
            dbName: 'aux-repos',
        },
        cassandra: {
            keyspace: 'aux_objects',
            replication: {
                class: 'SimpleStrategy',
                replicationFactor: 1,
            },
        },
    },
    bots: {
        dbName: 'aux-bots',
        timeToLive: 3600,
    },
    directory: {
        server: {
            secret: 'test',
            webhook: null,
        },
        client: {
            upstream: 'http://localhost:3000',
            tunnel: null,
        },
        dbName: 'aux-directory',
    },
    proxy: {
        trust: 'loopback',
    },
    dist: path.resolve(__dirname, '..', '..', 'aux-web', 'dist'),
    drives: path.resolve(__dirname, '..', '..', 'drives'),
};

export default config;
