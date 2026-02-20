import React, { useState, useEffect } from 'react';
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
  serverMessageId: string;
  text: string | null;
  senderType: 'visitor' | 'operator';
  createdAt: string;
}

function App() {
  const [channelId, setChannelId] = useState('');
  const [devToken, setDevToken] = useState(localStorage.getItem('operator_dev_token') || '');
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineVisitors, setOnlineVisitors] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (devToken) {
      localStorage.setItem('operator_dev_token', devToken);
    }
  }, [devToken]);

  const handleConnect = async () => {
    if (!channelId || !devToken) {
      setError('Please enter Channel ID and Dev Token');
      return;
    }

    setError(null);

    try {
      // Fetch conversations
      const response = await fetch(`${API_URL}/api/operator/dev/conversations?channelId=${channelId}`, {
        headers: {
          'x-operator-dev-token': devToken,
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
        auth: { devToken, channelId },
        transports: ['websocket', 'polling'],
      });

      ws.on('connect', () => {
        console.log('Operator connected');
      });

      ws.on('message:new', (data: any) => {
        if (data.conversationId === selectedConversation) {
          setMessages((prev) => [...prev, data]);
        }
        // Update conversation list
        setConversations((prev) =>
          prev.map((conv) =>
            conv.conversationId === data.conversationId
              ? { ...conv, lastMessageText: data.text, updatedAt: new Date().toISOString() }
              : conv
          )
        );
      });

      ws.on('presence:update', (data: any) => {
        if (data.channelId === channelId) {
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
    setMessages([]);

    try {
      const response = await fetch(
        `${API_URL}/api/operator/dev/messages?conversationId=${conversationId}&limit=50`,
        {
          headers: {
            'x-operator-dev-token': devToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();
      setMessages(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
    }
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !socket || !selectedConversation) return;

    const clientMessageId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    socket.emit('message:send', {
      conversationId: selectedConversation,
      text: messageInput.trim(),
      clientMessageId,
    });

    // Add to local messages immediately
    setMessages((prev) => [
      ...prev,
      {
        serverMessageId: clientMessageId,
        text: messageInput.trim(),
        senderType: 'operator',
        createdAt: new Date().toISOString(),
      },
    ]);

    setMessageInput('');
  };

  return (
    <div className="app">
      {!connected ? (
        <div className="connect-panel">
          <h1>Operator Web - Dev Mode</h1>
          <div className="form-group">
            <label>Channel ID:</label>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="Enter channel ID"
            />
          </div>
          <div className="form-group">
            <label>Dev Token:</label>
            <input
              type="password"
              value={devToken}
              onChange={(e) => setDevToken(e.target.value)}
              placeholder="Enter OPERATOR_DEV_TOKEN"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button onClick={handleConnect} className="connect-btn">
            Connect
          </button>
        </div>
      ) : (
        <div className="operator-panel">
          <div className="sidebar">
            <div className="sidebar-header">
              <h2>Conversations</h2>
              <div className="online-count">Online: {onlineVisitors}</div>
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
                <div className="messages-container">
                  {messages.map((msg) => (
                    <div key={msg.serverMessageId} className={`message ${msg.senderType}`}>
                      <div className="message-text">{msg.text}</div>
                      <div className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
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
