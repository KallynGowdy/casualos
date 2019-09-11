export const DEFAULT_PING_INTERVAL = 5;

/**
 * The settings that the directory client currently has.
 */
export interface DirectoryClientSettings {
    /**
     * The amount of time between pings in minutes.
     */
    pingInterval: number;

    /**
     * The password that the client is using.
     */
    password: string;

    /**
     * The JWT that the client last got from the server.
     */
    token: string;

    /**
     * The key of the client.
     */
    key: string;

    /**
     * The private SSH key that should be used to connect to the reverse tunnel.
     */
    privateKey: string;
}
