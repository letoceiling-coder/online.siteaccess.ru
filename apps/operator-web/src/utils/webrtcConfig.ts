/**
 * WebRTC ICE Configuration with TURN server support
 * Production-ready configuration for NAT traversal with dynamic credentials
 */

export interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

let cachedCredentials: TurnCredentials | null = null;
let credentialsExpiry = 0;

async function fetchTurnCredentials(): Promise<TurnCredentials> {
  const now = Date.now();
  
  // Use cached credentials if still valid (with 1 minute buffer)
  if (cachedCredentials && credentialsExpiry > now + 60000) {
    return cachedCredentials;
  }

  try {
    const response = await fetch('/api/turn-credentials');
    if (!response.ok) {
      throw new Error(Failed to fetch TURN credentials: );
    }
    
    const credentials = await response.json();
    cachedCredentials = credentials;
    credentialsExpiry = now + (credentials.ttl * 1000);
    
    return credentials;
  } catch (error) {
    console.error('[WebRTC] Failed to fetch TURN credentials:', error);
    // Fallback to empty credentials (STUN only)
    return { username: '', credential: '', ttl: 0 };
  }
}

export async function getIceServers(): Promise<ICEServer[]> {
  const servers: ICEServer[] = [
    // Google STUN server (fallback)
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  // Get dynamic TURN credentials from backend
  const turnUrl = import.meta.env.VITE_TURN_URL || 'turn:89.169.39.244:3478';
  const credentials = await fetchTurnCredentials();

  if (credentials.username && credentials.credential) {
    servers.push({
      urls: turnUrl,
      username: credentials.username,
      credential: credentials.credential,
    });
  }

  return servers;
}

export async function createPeerConnectionConfig(): Promise<RTCConfiguration> {
  return {
    iceServers: await getIceServers(),
    iceCandidatePoolSize: 10,
  };
}
