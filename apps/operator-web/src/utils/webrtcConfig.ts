/**
 * WebRTC ICE Configuration with TURN server support
 * Production-ready configuration for NAT traversal
 */

export interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export function getIceServers(): ICEServer[] {
  const servers: ICEServer[] = [
    // Google STUN server (fallback)
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  // Add TURN server if configured
  const turnUrl = import.meta.env.VITE_TURN_URL || '';
  const turnUsername = import.meta.env.VITE_TURN_USERNAME || '';
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD || '';

  if (turnUrl && turnUsername && turnPassword) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnPassword,
    });
  }

  return servers;
}

export function createPeerConnectionConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10,
  };
}
