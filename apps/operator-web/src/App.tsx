import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

const API_URL = 'http://127.0.0.1:3100';
const WS_URL = 'http://127.0.0.1:3100';

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

  useEffect(() => {
    if (devToken) {
      localStorage.setItem('operator_dev_token', devToken);
    }
  }, [devToken]);

  const handleConnect = async () => {
    if (!channelId || !devToken) {
      alert('Please enter Channel ID and Dev Token');
      return;
    }

    try {
      // Fetch conversations
      const response = await fetch(\\/api/operator/dev/conversations?channelId=\\, {
        headers: {
          'x-operator-dev-token': devToken,
        },
      });

      if (!response.ok) {
        throw new Error(\Failed to fetch conversations: \\);
      }

      const data = await response.json();
      setConversations(data);
      setConnected(true);

      // Connect WebSocket
      const ws = io(\\/operator\, {
        auth: {
          devToken: devToken,
          channelId: channelId,
        },
        transports: ['websocket'],
      });

      ws.on('connect', () => {
        console.log('Operator connected');
      });

      ws.on('message:new', (data: Message) => {
        setMessages((prev) => [...prev, data]);
      });

      ws.on('presence:update', (data: { channelId: string; onlineVisitors: number }) => {
        setOnlineVisitors(data.onlineVisitors);
      });

      setSocket(ws);
    } catch (error) {
      console.error('Connection error:', error);
      alert(\Connection failed: \\);
    }
  };

  const handleSelectConversation = async (convId: string) => {
    setSelectedConversation(convId);
    try {
      const response = await fetch(
        \\/api/operator/dev/messages?conversationId=\&limit=50\,
        {
          headers: {
            'x-operator-dev-token': devToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error(\Failed to fetch messages: \\);
      }

      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !socket || !selectedConversation) return;

    const clientMessageId = \op-\-\\;
    const text = messageInput.trim();

    socket.emit('message:send', {
      conversationId: selectedConversation,
      text,
      clientMessageId,
    });

    // Optimistically add message
    setMessages((prev) => [
      ...prev,
      {
        serverMessageId: clientMessageId,
        text,
        senderType: 'operator',
        createdAt: new Date().toISOString(),
      },
    ]);

    setMessageInput('');
  };

  if (!connected) {
    return (
      <div className=" app\>
 <div className=\connect-panel\>
 <h1>Operator Web - Connect</h1>
 <div className=\form-group\>
 <label>Channel ID:</label>
 <input
 type=\text\
 value={channelId}
 onChange={(e) => setChannelId(e.target.value)}
 placeholder=\Enter channel ID\
 />
 </div>
 <div className=\form-group\>
 <label>Dev Token:</label>
 <input
 type=\password\
 value={devToken}
 onChange={(e) => setDevToken(e.target.value)}
 placeholder=\Enter OPERATOR_DEV_TOKEN\
 />
 </div>
 <button onClick={handleConnect} className=\connect-btn\>
 Connect
 </button>
 </div>
 </div>
 );
 }

 return (
 <div className=\app\>
 <div className=\sidebar\>
 <div className=\sidebar-header\>
 <h2>Conversations</h2>
 <div className=\online-indicator\>
 Online: {onlineVisitors}
 </div>
 </div>
 <div className=\conversations-list\>
 {conversations.map((conv) => (
 <div
 key={conv.conversationId}
 className={\conversation-item \\}
 onClick={() => handleSelectConversation(conv.conversationId)}
 >
 <div className=\conv-visitor\>{conv.visitorExternalId}</div>
 <div className=\conv-preview\>{conv.lastMessageText || 'No messages'}</div>
 </div>
 ))}
 </div>
 </div>
 <div className=\chat-area\>
 {selectedConversation ? (
 <>
 <div className=\chat-header\>
 <h3>Conversation: {selectedConversation.substring(0, 8)}...</h3>
 </div>
 <div className=\messages-container\>
 {messages.map((msg) => (
 <div key={msg.serverMessageId} className={\message \\}>
 <div className=\message-text\>{msg.text}</div>
 <div className=\message-time\>
 {new Date(msg.createdAt).toLocaleTimeString()}
 </div>
 </div>
 ))}
 </div>
 <div className=\chat-input-container\>
 <input
 type=\text\
 value={messageInput}
 onChange={(e) => setMessageInput(e.target.value)}
 onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
 placeholder=\Type a message...\
 className=\chat-input\
 />
 <button onClick={handleSendMessage} className=\send-btn\>
 Send
 </button>
 </div>
 </>
 ) : (
 <div className=\no-conversation\>Select a conversation to start chatting</div>
 )}
 </div>
 </div>
 );
}

export default App;
