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
      ws.on(" call:ring, (data: any) => {
 if (data.conversationId === selectedConversation) {
 callStateMachine.transition(inging, { conversationId: selectedConversation, incomingCall: { callId: data.callId, fromRole: data.fromRole, kind: data.kind } });
 }
 });
      ws.on(" call:offer, (data: any) => {
 if (data.conversationId === selectedConversation && data.fromRole === isitor) {
 callStateMachine.transition(inging, { conversationId: selectedConversation, callId: data.callId, kind: data.kind, fromRole: isitor, incomingCall: { callId: data.callId, fromRole: isitor, kind: data.kind } });
 }
 });
        }
      });
      ws.on(" call:hangup, (data: any) => {
      ws.on(" call:busy, (data: any) => {
 if (data.callId === callStoreState.callId) {
 callStateMachine.transition(busy);
 }
 });
 if (data.callId === callStoreState.callId || data.callId === callStoreState.incomingCall?.callId) {
 callStateMachine.transition(ended);
 }
 });
        }
      });
        console.log(`Sync response for ${data.conversationId}: ${data.messages?.length || 0} messages`);
