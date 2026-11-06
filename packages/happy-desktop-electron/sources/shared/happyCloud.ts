/**
 * The Happy Cloud server this build connects to from the sidebar's "+". It is
 * a team server reached directly from this app, never through the host Happy
 * Agent, compiled in rather than typed, and ends in `/` as addresses are
 * normalized.
 */
export const HAPPY_CLOUD_URL = "https://209-38-182-152.sslip.io/";
export const HAPPY_CLOUD_NAME = "Happy Cloud";
/**
 * The connection ID Happy Cloud has in this app. The window reaches it at
 * `/v0/connections/cloud/api/*` like any connection, and the transport sends
 * those requests to the cloud itself. The host Happy Agent's connection IDs
 * are generated, so they never collide with this one.
 */
export const HAPPY_CLOUD_CONNECTION_ID = "cloud";
