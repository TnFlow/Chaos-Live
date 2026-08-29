/**
 * Protocol version for WebSocket handshake compatibility.
 * The mod and middleware may evolve on different cadences —
 * this version field ensures they can negotiate compatibility.
 */
export const PROTOCOL_VERSION = '0.1.0' as const;
