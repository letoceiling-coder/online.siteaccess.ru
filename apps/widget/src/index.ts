import { io, Socket } from 'socket.io-client';

const API_URL = 'http://127.0.0.1:3100';
const WS_URL = 'http://127.0.0.1:3100';

interface ChatMessage {
  serverMessageId?: string;
  clientMessageId?: string;
  text: string;
  senderType: 'visitor' | 'operator';
  createdAt: string;
  delivered?: boolean;
}

class SiteAccessChatWidget {
  private token: string | null = null;
  private externalId: string | null = null;
  private socket: Socket | null = null;
  private conversationId: string | null = null;
  private visitorSessionToken: string | null = null;
  private messages: ChatMessage[] = [];
  private isOpen = false;
  private presenceInterval: NodeJS.Timeout | null = null;

  private container: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // РџРѕР»СѓС‡РёС‚СЊ token РёР· window.SiteAccessChat
    const config = (window as any).SiteAccessChat;
    if (!config || !config.token) {
      console.error('SiteAccessChat: token not found');
      return;
    }
    this.token = config.token;

    // РџРѕР»СѓС‡РёС‚СЊ РёР»Рё СЃРѕР·РґР°С‚СЊ externalId
    this.externalId = localStorage.getItem('sa_external_id');
    if (!this.externalId) {
      this.externalId = this.generateUUID();
      localStorage.setItem('sa_external_id', this.externalId);
    }

    this.createUI();
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private createUI() {
    // Shadow DOM container
    const shadowHost = document.createElement('div');
    shadowHost.id = 'siteaccess-chat-widget';
    document.body.appendChild(shadowHost);

    const shadow = shadowHost.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = \
      .chat-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #007bff;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 24px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
      }
      .chat-panel {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: none;
        flex-direction: column;
        z-index: 10001;
      }
      .chat-panel.open {
        display: flex;
      }
      .chat-header {
        padding: 15px;
        background: #007bff;
        color: white;
        border-radius: 8px 8px 0 0;
        font-weight: bold;
      }
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
      }
      .message {
        margin-bottom: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        max-width: 80%;
      }
      .message.visitor {
        background: #e3f2fd;
        margin-left: auto;
        text-align: right;
      }
      .message.operator {
        background: #f5f5f5;
      }
      .chat-input-container {
        padding: 15px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 10px;
      }
      .chat-input {
        flex: 1;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      .chat-send {
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    \;

    shadow.appendChild(style);

    // Button
    this.button = document.createElement('button');
    this.button.className = 'chat-button';
    this.button.textContent = 'рџ’¬';
    this.button.onclick = () => this.togglePanel();
    shadow.appendChild(this.button);

    // Panel
    this.panel = document.createElement('div');
    this.panel.className = 'chat-panel';
    shadow.appendChild(this.panel);

    const header = document.createElement('div');
    header.className = 'chat-header';
    header.textContent = 'Chat';
    this.panel.appendChild(header);

    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'chat-messages';
    this.panel.appendChild(this.messagesContainer);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'chat-input-container';
    this.panel.appendChild(inputContainer);

    this.input = document.createElement('input');
    this.input.className = 'chat-input';
    this.input.type = 'text';
    this.input.placeholder = 'Type a message...';
    this.input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    };
    inputContainer.appendChild(this.input);

    const sendButton = document.createElement('button');
    sendButton.className = 'chat-send';
    sendButton.textContent = 'Send';
    sendButton.onclick = () => this.sendMessage();
    inputContainer.appendChild(sendButton);

    this.container = shadowHost;
  }

  private async togglePanel() {
    this.isOpen = !this.isOpen;
    if (this.panel) {
      this.panel.classList.toggle('open', this.isOpen);
    }

    if (this.isOpen && !this.socket) {
      await this.connect();
    }
  }

  private async connect() {
    try {
      // РџРѕР»СѓС‡РёС‚СЊ session
      const response = await fetch(\\/api/widget/session\, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin,
        },
        body: JSON.stringify({
          token: this.token,
          externalId: this.externalId,
        }),
      });

      if (!response.ok) {
        throw new Error(\Session failed: \\);
      }

      const data = await response.json();
      this.conversationId = data.conversationId;
      this.visitorSessionToken = data.visitorSessionToken;
      this.externalId = data.externalId;

      // РџРѕРґРєР»СЋС‡РёС‚СЊ Socket.IO
      this.socket = io(\\/widget\, {
        auth: { token: this.visitorSessionToken },
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        console.log('Widget connected');
        this.requestSync();
        this.startPresence();
      });

      this.socket.on('message:ack', (data: any) => {
        const msg = this.messages.find((m) => m.clientMessageId === data.clientMessageId);
        if (msg) {
          msg.serverMessageId = data.serverMessageId;
          msg.delivered = true;
          this.renderMessages();
        }
      });

      this.socket.on('message:new', (data: any) => {
        this.messages.push({
          serverMessageId: data.serverMessageId,
          text: data.text,
          senderType: data.senderType,
          createdAt: data.createdAt,
          delivered: true,
        });
        this.renderMessages();
      });

      this.socket.on('sync:response', (data: any) => {
        this.messages = data.messages.map((m: any) => ({
          serverMessageId: m.serverMessageId,
          text: m.text,
          senderType: m.senderType,
          createdAt: m.createdAt,
          delivered: true,
        }));
        this.renderMessages();
      });
    } catch (error) {
      console.error('Connection error:', error);
    }
  }

  private requestSync() {
    if (this.socket && this.conversationId) {
      this.socket.emit('sync:request', {
        conversationId: this.conversationId,
        limit: 50,
      });
    }
  }

  private startPresence() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }
    this.presenceInterval = setInterval(() => {
      if (this.socket) {
        this.socket.emit('presence:heartbeat');
      }
    }, 10000);
  }

  private sendMessage() {
    if (!this.input || !this.socket || !this.conversationId) return;

    const text = this.input.value.trim();
    if (!text) return;

    const clientMessageId = this.generateUUID();
    const message: ChatMessage = {
      clientMessageId,
      text,
      senderType: 'visitor',
      createdAt: new Date().toISOString(),
      delivered: false,
    };

    this.messages.push(message);
    this.renderMessages();
    this.input.value = '';

    this.socket.emit('message:send', {
      conversationId: this.conversationId,
      text,
      clientMessageId,
    });
  }

  private renderMessages() {
    if (!this.messagesContainer) return;

    this.messagesContainer.innerHTML = '';
    this.messages.forEach((msg) => {
      const div = document.createElement('div');
      div.className = \message \\;
      div.textContent = msg.text;
      this.messagesContainer!.appendChild(div);
    });

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SiteAccessChatWidget();
  });
} else {
  new SiteAccessChatWidget();
}

export default SiteAccessChatWidget;
