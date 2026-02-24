import React, { useState, useEffect, useRef, useCallback } from 'react';
import { callStore } from './stores/callStore';
import { callStateMachine } from './services/callStateMachine';
import { io, Socket } from 'socket.io-client';
import './App.css';

const API_URL = 'https://online.siteaccess.ru';
const WS_URL = 'https://online.siteaccess.ru';

interface Conversation {
  conversationId: string;
  visitorExternalId: string;
  updatedAt: string;
  lastMessageText: string | null;
}

interface Message {
  serverMessageId?: string;
  clientMessageId?: string;
  text: string | null;
  senderType: 'visitor' | 'operator';
  createdAt: string;
  status?: 'pending' | 'sent' | 'failed';
  retryCount?: number;
}

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [channelId, setChannelId] = useState('');
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>({});
  const [messageInput, setMessageInput] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineVisitors, setOnlineVisitors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('operator_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundUnlocked, setSoundUnlocked] = useState<boolean>(() => {
    return localStorage.getItem('soundUnlocked') === '1';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesWrapRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastSoundPlayTime = useRef<number>(0);
  const [operatorToken, setOperatorToken] = useState<string | null>(
    localStorage.getItem('operatorAccessToken') || null
  );
  const [operatorChannelId, setOperatorChannelId] = useState<string | null>(
    localStorage.getItem('operator_channel_id') || null
  );
  const pendingMessagesRef = useRef<Map<string, Message>>(new Map()); // clientMessageId -> message
  const retryTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // clientMessageId -> timer
  
  // Clear retry timer function
  const clearRetryTimer = useCallback((clientMessageId: string) => {
    const timer = retryTimersRef.current.get(clientMessageId);
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current.delete(clientMessageId);
    }
  }, []);

  const lastSeenCreatedAtRef = useRef<string | null>(null); // For sync after reconnect
  const maxRetries = 5;
  const retryDelays = [3000, 6000, 12000, 24000, 48000]; // Exponential backoff in ms
  
  // Call state
  // Call state from store
  const [callStoreState, setCallStoreState] = React.useState(callStore.getState());
  
  useEffect(() => {
    const unsubscribe = callStore.subscribe(setCallStoreState);
    return unsubscribe;
  }, []);
  

  // Initialize audio element
  useEffect(() => {
    const a = new Audio('/sounds/new-message.wav');
    a.preload = 'auto';
    a.volume = 1;
    audioRef.current = a;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Unlock sound function
  async function unlockSoundOnce() {
    if (!audioRef.current) return;

    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setSoundUnlocked(true);
      localStorage.setItem('soundUnlocked', '1');
    } catch (e) {
      console.error('[SOUND] unlock failed:', e);
    }
  }

  // Safe play function
  function playNewMessageSound() {
    if (!soundEnabled) return;
    if (!audioRef.current) return;

    try {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  }

  // Unlock sound on first user interaction
  useEffect(() => {
    if (soundUnlocked) return;

    const handlePointerDown = () => {
      unlockSoundOnce();
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };

    const handleKeyDown = () => {
      unlockSoundOnce();
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [soundUnlocked]);

  // Check if near bottom of scroll
  const isNearBottom = useCallback((): boolean => {
    if (!messagesWrapRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesWrapRef.current;
    const threshold = 100; // pixels from bottom
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = false) => {
    if (endRef.current) {
      endRef.current.scrollIntoView({
        block: 'end',
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  // Get messages for selected conversation
  const messages = selectedConversation ? (messagesByConversation[selectedConversation] || []) : [];

  // Auto-scroll when conversation is selected
  useEffect(() => {
    if (!selectedConversation) return;
    requestAnimationFrame(() => scrollToBottom(false));
  }, [selectedConversation, scrollToBottom]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (!selectedConversation) return;
    const messagesCount = messagesByConversation[selectedConversation]?.length || 0;
    if (messagesCount > 0) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [selectedConversation, messagesByConversation, scrollToBottom]);

  useEffect(() => {
    if (operatorToken && operatorChannelId) {
      // Auto-connect if token exists
      handleConnectWithToken(operatorToken, operatorChannelId);
    }
  }, []);

  const validateUUID = (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  const handleLogin = async () => {
    if (!email || !password || !channelId) {
      setError('Please enter email, password, and project ID');
      return;
    }

    // Validate UUID format (reject 64-hex tokenHash)
    if (!validateUUID(channelId)) {
      setError('Project ID must be a valid UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Do not use the token.');
      return;
    }

    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/operator/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          channelId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      setOperatorToken(data.operatorAccessToken);
      setOperatorChannelId(data.channelId);
      localStorage.setItem('operatorAccessToken', data.operatorAccessToken);
      localStorage.setItem('operator_channel_id', data.channelId);

      await handleConnectWithToken(data.operatorAccessToken, data.channelId);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleConnectWithToken = async (token: string, chId: string) => {
    setError(null);

    try {
      // Fetch conversations
      const response = await fetch(`${API_URL}/api/operator/conversations?channelId=${chId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }

      const data = await response.json();
      setConversations(data);
      setConnected(true);

      // Connect WebSocket
      const ws = io(`${WS_URL}/operator`, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      ws.on('connect', () => {
        console.log('Operator connected');
        
        // Resend pending messages on reconnect
        resendPendingMessages();
        // Request sync for active conversation
        if (selectedConversation) {
          requestSync(selectedConversation);
        }
        
        // On reconnect, if a conversation is selected, refresh its messages
        // to ensure we have messages that arrived while offline
        if (selectedConversation) {
          handleSelectConversation(selectedConversation);
        }
      });

      ws.on('message:new', (data: any) => {
        console.log('[REALTIME] Received message:new:', data);
        
        const conversationId = data.conversationId;
        
        // Update messagesByConversation with deduplication
        setMessagesByConversation((prev) => {
          const existingMessages = prev[conversationId] || [];
          
          // Dedupe rules: Prefer serverMessageId when present, only use clientMessageId if both are non-empty strings
          const isDuplicate = existingMessages.some((msg) => {
            // If both have serverMessageId, compare by that
            if (msg.serverMessageId && data.serverMessageId) {
              return msg.serverMessageId === data.serverMessageId;
            }
            // If both have clientMessageId (non-empty), compare by that
            if (msg.clientMessageId && data.clientMessageId && 
                msg.clientMessageId !== '' && data.clientMessageId !== '') {
              return msg.clientMessageId === data.clientMessageId;
            }
            // Never treat undefined/null/"" as valid dedupe keys
            return false;
          });
          
          if (isDuplicate) {
            console.log('[REALTIME] Duplicate message ignored:', data.serverMessageId || data.clientMessageId);
            return prev;
          }
          
          // Add new message
          const newMessage: Message = {
            serverMessageId: data.serverMessageId,
            clientMessageId: data.clientMessageId,
            text: data.text,
            senderType: data.senderType,
            createdAt: data.createdAt,
            status: 'sent',
          };
          
          // Update lastSeenCreatedAt
          if (data.createdAt && (!lastSeenCreatedAtRef.current || data.createdAt > lastSeenCreatedAtRef.current)) {
            lastSeenCreatedAtRef.current = data.createdAt;
            saveLastSeenCreatedAt(data.createdAt);
          }
          
          // Merge and sort: createdAt ASC, then id ASC (stable ordering)
          const merged = mergeMessages(existingMessages, [newMessage]);
          
          return {
            ...prev,
            [conversationId]: merged,
          };
        });
        
        // Update conversation list (for badge/notification)
        setConversations((prev) => {
          const existingIndex = prev.findIndex((conv) => conv.conversationId === conversationId);
          
          if (existingIndex >= 0) {
            // Update existing conversation
            return prev.map((conv, idx) =>
              idx === existingIndex
                ? { ...conv, lastMessageText: data.text, updatedAt: new Date().toISOString() }
                : conv
            );
          } else {
            // New conversation - add it to the list
            return [
              {
                conversationId: conversationId,
                visitorExternalId: 'New visitor',
                updatedAt: new Date().toISOString(),
                lastMessageText: data.text,
              },
              ...prev,
            ];
          }
        });
        
        // Play sound if message is from visitor
        if (data.senderType === 'visitor') {
          const now = Date.now();
          if (now - lastSoundPlayTime.current > 500) {
            // Throttle: only play if 500ms passed since last play
            lastSoundPlayTime.current = now;
            playNewMessageSound();
          }
        }
      });

      ws.on('presence:update', (data: any) => {
        if (data.channelId === chId) {
          setOnlineVisitors(data.onlineVisitors || 0);
        }
      });

      ws.on('message:ack', (data: any) => {
        console.log('Message ACK:', data);
        if (!data.clientMessageId) {
          console.warn('message:ack received without clientMessageId');
          return;
        }

        // Clear retry timer and remove from pending (idempotent: safe to call multiple times)
        clearRetryTimer(data.clientMessageId);
        const wasPending = pendingMessagesRef.current.delete(data.clientMessageId);
        if (wasPending) {
          savePendingMessages();
        }

        // Update message status in UI (idempotent: receiving same ACK twice is safe)
        setMessagesByConversation((prev) => {
          const updated = { ...prev };
          if (updated[data.conversationId]) {
            const messages = updated[data.conversationId];
            const msgIndex = messages.findIndex((m) => m.clientMessageId === data.clientMessageId);
            if (msgIndex >= 0) {
              const existingMsg = messages[msgIndex];
              // Idempotency: if already sent with same serverMessageId, skip update
              if (existingMsg.status === 'sent' && existingMsg.serverMessageId === data.serverMessageId) {
                console.log(`[ACK] Duplicate ACK ignored for ${data.clientMessageId.substring(0, 8)}...`);
                return prev;
              }
              updated[data.conversationId] = [...messages];
              updated[data.conversationId][msgIndex] = {
                ...existingMsg,
                status: 'sent',
                serverMessageId: data.serverMessageId,
                createdAt: data.createdAt, // Update createdAt from server
              };
            }
          }
          return updated;
        });
        // Update lastSeenCreatedAt
        if (data.createdAt && (!lastSeenCreatedAtRef.current || data.createdAt > lastSeenCreatedAtRef.current)) {
          lastSeenCreatedAtRef.current = data.createdAt;
          saveLastSeenCreatedAt(data.createdAt);
        }
      });

      // Call event handlers
      ws.on('call:ring', (data: any) => {
        if (data.conversationId === selectedConversation) {
          setCallState(prev => ({
            ...prev,
            incomingCall: { callId: data.callId, fromRole: data.fromRole, kind: data.kind },
            status: 'ringing',
          }));
        }
      });

      ws.on('call:offer', (data: any) => {
        if (data.conversationId === selectedConversation && data.fromRole === 'visitor') {
          setCallState(prev => ({
            ...prev,
            callId: data.callId,
            incomingCall: { callId: data.callId, fromRole: 'visitor', kind: data.kind },
            status: 'ringing',
            kind: data.kind,
          }));
        }
      });

      ws.on('call:answer', (data: any) => {
        if (data.callId === callStoreState.callId) {
          setCallState(prev => ({ ...prev, status: 'in_call' }));
        }
      });

      ws.on('call:hangup', (data: any) => {
        if (data.callId === callStoreState.callId || data.callId === callStoreState.incomingCall?.callId) {
          setCallState({ callId: null, status: 'idle', kind: null, incomingCall: null });
        }
      });

      ws.on('call:busy', (data: any) => {
        if (data.callId === callStoreState.callId) {
          setCallState({ callId: null, status: 'idle', kind: null, incomingCall: null });
        }
      });

      ws.on('sync:response', (data: any) => {
        console.log(`Sync response for ${data.conversationId}: ${data.messages?.length || 0} messages`);
        if (!data.conversationId || !data.messages) return;

        setMessagesByConversation((prev) => {
          const existingMessages = prev[data.conversationId] || [];
          const newMessages = data.messages as Message[];

          const mergedMessages = mergeMessages(existingMessages, newMessages);
          
          // Update lastSeenCreatedAt from the latest message in sync response
          if (mergedMessages.length > 0) {
            const latestSyncMsg = mergedMessages[mergedMessages.length - 1];
            if (latestSyncMsg.createdAt && (!lastSeenCreatedAtRef.current || latestSyncMsg.createdAt > lastSeenCreatedAtRef.current)) {
              lastSeenCreatedAtRef.current = latestSyncMsg.createdAt;
              saveLastSeenCreatedAt(latestSyncMsg.createdAt);
            }
          }

          return {
            ...prev,
            [data.conversationId]: mergedMessages,
          };
        });
      });

      setSocket(ws);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setConnected(false);
    }
  };

  // Helper to merge messages with deduplication and stable sorting
  const mergeMessages = (existing: Message[], incoming: Message[]): Message[] => {
    const allMessages = [...existing, ...incoming];
    const uniqueMessages = new Map<string, Message>();

    for (const msg of allMessages) {
      const key = msg.serverMessageId || msg.clientMessageId;
      if (key) {
        // Prefer serverMessageId if available, otherwise clientMessageId
        // Never treat undefined/null/"" as valid dedupe keys
        if (!uniqueMessages.has(key) || (msg.serverMessageId && !uniqueMessages.get(key)?.serverMessageId)) {
          uniqueMessages.set(key, msg);
        }
      }
    }
    
    // Stable sort: createdAt ASC, then id ASC
    const sorted = Array.from(uniqueMessages.values()).sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      if (dateA !== dateB) return dateA - dateB;
      // Stable sort by serverMessageId if createdAt is same
      const idA = a.serverMessageId || a.clientMessageId || '';
      const idB = b.serverMessageId || b.clientMessageId || '';
      return idA.localeCompare(idB);
    });
    return sorted;
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversation(conversationId);
    setShowScrollButton(false);

    if (!operatorToken) return;

    // Join conversation room for realtime updates
    if (socket) {
      socket.emit('operator:conversation:join', { conversationId });
    }

    // If we already have messages for this conversation, use them
    if (messagesByConversation[conversationId] && messagesByConversation[conversationId].length > 0) {
      // Messages already loaded from WS, but fetch to ensure we have all history
      try {
        const response = await fetch(
          `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=50`,
          {
            headers: {
              Authorization: `Bearer ${operatorToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          // Merge with existing messages, deduplicate
          setMessagesByConversation((prev) => {
            const existing = prev[conversationId] || [];
            const fetched = data as Message[];
            
            // Create a map of existing message IDs
            const existingIds = new Set(existing.map((m) => m.serverMessageId));
            
            // Add only new messages from fetch
            const newMessages = fetched.filter((m) => !existingIds.has(m.serverMessageId));
            
            // Combine: existing (from WS) + new (from fetch), sorted by createdAt ASC, then id ASC (stable)
            const combined = mergeMessages(existing, fetched);
            
            return {
              ...prev,
              [conversationId]: combined,
            };
          });
          
          // Scroll to bottom after loading history
          setTimeout(() => scrollToBottom('auto'), 100);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    } else {
      // No messages yet, fetch from API
      try {
        const response = await fetch(
          `${API_URL}/api/operator/messages?conversationId=${conversationId}&limit=50`,
          {
            headers: {
              Authorization: `Bearer ${operatorToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const data = await response.json();
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: data,
        }));
        
        // Scroll to bottom after loading history
        setTimeout(() => scrollToBottom('auto'), 100);
      } catch (err: any) {
        setError(err.message || 'Failed to load messages');
      }
    }
  };

  const sendMessageToServer = useCallback((message: Message) => {
    if (!socket || !selectedConversation || !message.clientMessageId) return;

    if (!socket.connected) {
      console.warn('Socket not connected, message will be sent on reconnect');
      return;
    }

    socket.emit('message:send', {
      conversationId: selectedConversation,
      text: message.text,
      clientMessageId: message.clientMessageId,
    });

    // Start retry timer if no ACK received
    scheduleRetry(message);
  }, [socket, selectedConversation]);

  const scheduleRetry = useCallback((message: Message) => {
    if (!message.clientMessageId) return;

    const retryCount = message.retryCount || 0;
    if (retryCount >= maxRetries) {
      console.error(`Message ${message.clientMessageId} failed after ${retryCount} retries`);
      setMessagesByConversation((prev) => {
        const updated = { ...prev };
        if (updated[selectedConversation!]) {
          const messages = updated[selectedConversation!];
          const msgIndex = messages.findIndex((m) => m.clientMessageId === message.clientMessageId);
          if (msgIndex >= 0) {
            updated[selectedConversation!] = [...messages];
            updated[selectedConversation!][msgIndex] = { ...messages[msgIndex], status: 'failed' };
          }
        }
        return updated;
      });
      return;
    }

    const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
    
    const timer = setTimeout(() => {
      if (pendingMessagesRef.current.has(message.clientMessageId!)) {
        message.retryCount = (message.retryCount || 0) + 1;
        console.log(`Retrying message ${message.clientMessageId} (attempt ${message.retryCount})`);
        sendMessageToServer(message);
      }
    }, delay);

    // Clear existing timer if any
    const existingTimer = retryTimersRef.current.get(message.clientMessageId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    retryTimersRef.current.set(message.clientMessageId, timer);
  }, [selectedConversation, sendMessageToServer]);

  const resendPendingMessages = useCallback(() => {
    if (pendingMessagesRef.current.size === 0) return;

    console.log(`Resending ${pendingMessagesRef.current.size} pending messages`);
    for (const [clientMessageId, message] of pendingMessagesRef.current.entries()) {
      // Reset retry count on reconnect
      message.retryCount = 0;
      sendMessageToServer(message);
    }
  }, [sendMessageToServer]);

  const requestSync = useCallback((conversationId: string) => {
    if (!socket || !socket.connected) return;

    const sinceCreatedAt = lastSeenCreatedAtRef.current || null;
    console.log(`Requesting sync for conversation ${conversationId} since: ${sinceCreatedAt || 'beginning'}`);

    socket.emit('sync:request', {
      conversationId,
      sinceCreatedAt,
      limit: 100,
    });
  }, [socket]);

  const saveLastSeenCreatedAt = useCallback((createdAt: string) => {
    try {
      localStorage.setItem('operator_lastSeenCreatedAt', createdAt);
    } catch (e) {
      console.warn('Failed to save lastSeenCreatedAt', e);
    }
  }, []);

  const loadLastSeenCreatedAt = useCallback(() => {
    try {
      const stored = localStorage.getItem('operator_lastSeenCreatedAt');
      if (stored) {
        lastSeenCreatedAtRef.current = stored;
      }
    } catch (e) {
      console.warn('Failed to load lastSeenCreatedAt', e);
    }
  }, []);

  // Load lastSeenCreatedAt on mount
  useEffect(() => {
    loadLastSeenCreatedAt();
  }, [loadLastSeenCreatedAt]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !socket || !selectedConversation) return;

    // Generate unique clientMessageId
    const clientMessageId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const trimmedText = messageInput.trim();
    const createdAt = new Date().toISOString();

    // Create message object
    const message: Message = {
      clientMessageId,
      text: trimmedText,
      senderType: 'operator',
      createdAt,
      status: 'pending',
      retryCount: 0,
    };

    // Add to local messages immediately (optimistic update)
    setMessagesByConversation((prev) => {
      const existing = prev[selectedConversation] || [];
      return {
        ...prev,
        [selectedConversation]: [...existing, message],
      };
    });

    // Add to pending
    pendingMessagesRef.current.set(clientMessageId, message);

    // Send to server
    sendMessageToServer(message);

    setMessageInput('');
    
    // Scroll to bottom after sending message
    setTimeout(() => scrollToBottom('smooth'), 100);
  };

  const handleLogout = () => {
    localStorage.removeItem('operatorAccessToken');
    localStorage.removeItem('operator_channel_id');
    setOperatorToken(null);
    setOperatorChannelId(null);
    setConnected(false);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  return (
    <div className="app">
      {!connected ? (
        <div className="connect-panel">
          <h1>Operator Web</h1>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
          </div>
          <div className="form-group">
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <div className="form-group">
            <label>Project ID (UUID):</label>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="Enter project UUID (e.g., 550e8400-e29b-41d4-a716-446655440000)"
              pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
            />
            <small style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '4px' }}>
              This is the Project/Channel UUID from your portal dashboard, not the token.
            </small>
          </div>
          {error && <div className="error">{error}</div>}
          <button onClick={handleLogin} className="connect-btn">
            Login
          </button>
        </div>
      ) : (
        <div className="operator-panel">
          <div className="sidebar">
            <div className="sidebar-header">
              <h2>Conversations</h2>
              <div className="online-count">Online: {onlineVisitors}</div>
              <div className="sound-controls" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => {
                      setSoundEnabled(e.target.checked);
                      localStorage.setItem('operator_sound_enabled', String(e.target.checked));
                    }}
                  />
                  Sound
                </label>
                {!soundUnlocked && (
                  <button
                    onClick={unlockSoundOnce}
                    style={{ fontSize: '11px', padding: '2px 6px', cursor: 'pointer' }}
                  >
                    Enable sound
                  </button>
                )}
              </div>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>
            <div className="conversations-list">
              {conversations.map((conv) => (
                <div
                  key={conv.conversationId}
                  className={`conversation-item ${
                    selectedConversation === conv.conversationId ? 'active' : ''
                  }`}
                  onClick={() => handleSelectConversation(conv.conversationId)}
                >
                  <div className="conversation-visitor">{conv.visitorExternalId}</div>
                  <div className="conversation-preview">
                    {conv.lastMessageText || 'No messages'}
                  </div>
                  <div className="conversation-time">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </div>
                </div>
              ))}
              {conversations.length === 0 && (
                <div className="empty-state">No conversations</div>
              )}
            </div>
          </div>
          <div className="chat-area">
            {selectedConversation ? (
              <>
                <div className="chat-header">
                  <h3>Chat</h3>
                  {callStoreState.state === 'idle' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleStartCall('audio')} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Call
                      </button>
                      <button onClick={() => handleStartCall('video')} style={{ padding: '6px 12px', fontSize: '12px' }}>
                        Video
                      </button>
                    </div>
                  )}
                  {callStoreState.state === 'calling' && <div>Calling...</div>}
                  {callStoreState.state === 'in_call' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span>In call ({callStoreState.kind})</span>
                      <button onClick={handleHangup} style={{ padding: '6px 12px', fontSize: '12px', background: '#dc3545' }}>
                        Hang up
                      </button>
                    </div>
                  )}
                </div>
                {callStoreState.incomingCall && callStoreState.state === 'ringing' && (
                  <div style={{ padding: '12px', background: '#f0f0f0', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Incoming {callStoreState.incomingCall.kind} call</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleAcceptCall} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                        Accept
                      </button>
                      <button onClick={handleDeclineCall} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
                        Decline
                      </button>
                    </div>
                  </div>
                )}
                <div 
                  className="messages-container"
                  ref={messagesWrapRef}
                  onScroll={() => {
                    if (isNearBottom()) {
                      setShowScrollButton(false);
                    } else {
                      setShowScrollButton(true);
                    }
                  }}
                >
                  {messages.map((msg) => (
                    <div key={msg.serverMessageId} className={`message ${msg.senderType}`}>
                      <div className="message-text">{msg.text}</div>
                      <div className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                  {showScrollButton && (
                    <button
                      onClick={() => {
                        scrollToBottom(true);
                        setShowScrollButton(false);
                      }}
                      style={{
                        position: 'sticky',
                        bottom: '10px',
                        alignSelf: 'center',
                        padding: '8px 16px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        zIndex: 10,
                      }}
                    >
                      New messages / Scroll to bottom
                    </button>
                  )}
                </div>
                <div className="chat-input-container">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="chat-input"
                  />
                  <button onClick={handleSendMessage} className="send-btn">
                    Send
                  </button>
                </div>
              </>
            ) : (
              <div className="no-selection">Select a conversation to start chatting</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
