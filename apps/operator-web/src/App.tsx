import React, { useState, useEffect, useRef, useCallback } from 'react';
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
        
        // On reconnect, if a conversation is selected, refresh its messages
        // to ensure we have messages that arrived while offline
        if (selectedConversation) {
          handleSelectConversation(selectedConversation);
        }
      });

      ws.on('message:new', (data: any) => {
        console.log('[REALTIME] Received message:new:', data);
        
        const conversationId = data.conversationId;
        const messageId = data.serverMessageId || data.clientMessageId;
        
        // Update messagesByConversation with deduplication
        setMessagesByConversation((prev) => {
          const existingMessages = prev[conversationId] || [];
          
          // Check for duplicate by serverMessageId or clientMessageId
          const isDuplicate = existingMessages.some(
            (msg) => msg.serverMessageId === messageId || msg.serverMessageId === data.clientMessageId
          );
          
          if (isDuplicate) {
            console.log('[REALTIME] Duplicate message ignored:', messageId);
            return prev;
          }
          
          // Add new message
          const newMessage: Message = {
            serverMessageId: messageId,
            text: data.text,
            senderType: data.senderType,
            createdAt: data.createdAt,
          };
          
          return {
            ...prev,
            [conversationId]: [...existingMessages, newMessage],
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
      });

      setSocket(ws);
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setConnected(false);
    }
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
            
            // Combine: existing (from WS) + new (from fetch), sorted by createdAt
            const combined = [...existing, ...newMessages].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            
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
                </div>
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
