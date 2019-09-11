import { Config } from './config';

const loginTimeout = process.env.LOGIN_TIMEOUT;
const secret = process.env.DIRECTORY_TOKEN_SECRET;
const trustProxy = process.env.PROXY_IP_RANGE;

const config: Config = {
    loginTimeout: parseInt(loginTimeout) || 60,
    httpPort: 3000,
    secret: secret,
    proxy: trustProxy
        ? {
              trust: trustProxy,
          }
        : null,
};

export default config;
