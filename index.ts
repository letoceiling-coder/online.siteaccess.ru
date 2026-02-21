import { io, Socket } from 'socket.io-client';

interface ChatConfig {
  token: string;
  apiBase?: string;
}

interface ChatMessage {
  serverMessageId?: string;
  clientMessageId?: string;
  text: string;
  senderType: 'visitor' | 'operator';
  createdAt: string;
  delivered?: boolean;
}

class SiteAccessChatWidget {
  private config: ChatConfig | null = null;
  private externalId: string | null = null;
  private socket: Socket | null = null;
  private conversationId: string | null = null;
  private visitorSessionToken: string | null = null;
  private messages: ChatMessage[] = [];
  private isOpen = false;
  private presenceInterval: NodeJS.Timeout | null = null;
  private apiBase: string = 'https://online.siteaccess.ru';

  private container: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;

  constructor() {
    this.init();
  }

  private init() {
    const config = (window as any).SiteAccessChat;
    if (!config || !config.token) {
      console.error('SiteAccessChat: token not found');
      return;
    }

    this.config = config;
    this.apiBase = config.apiBase || 'https://online.siteaccess.ru';

    // Get or create externalId
    this.externalId = localStorage.getItem('sa_external_id');
    if (!this.externalId) {
      this.externalId = this.generateUUID();
      localStorage.setItem('sa_external_id', this.externalId);
    }

    // Send ping to verify installation
    this.sendPing();

    this.createUI();
    this.setupEventListeners();
  }

  private async sendPing() {
    if (!this.config || !this.config.token) return;

    try {
      await fetch(`${this.apiBase}/api/widget/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.config.token,
          externalId: this.externalId,
          pageUrl: window.location.href,
        }),
      });
    } catch (error) {
      // Silently fail - don't break widget if ping fails
      console.warn('SiteAccessChat: ping failed', error);
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private createUI() {
    // Create shadow DOM container
    const shadowHost = document.createElement('div');
    shadowHost.id = 'siteaccess-chat-widget';
    document.body.appendChild(shadowHost);

    const shadow = shadowHost.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
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
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        z-index: 10000;
      }
      .chat-panel.open {
        display: flex;
      }
      .chat-header {
        padding: 15px;
        background: #007bff;
        color: white;
        border-radius: 8px 8px 0 0;
      }
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 100%;
        box-sizing: border-box;
      }
      .message {
        max-width: 75%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        box-sizing: border-box;
      }
      .message.visitor {
        align-self: flex-start;
        background: #f1f3f5;
        color: #212529;
      }
      .message.operator {
        align-self: flex-end;
        background: #4c6ef5;
        color: white;
      }
      .message a {
        word-break: break-all;
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
    `;
    shadow.appendChild(style);

    // Button
    this.button = document.createElement('button');
    this.button.className = 'chat-button';
    this.button.textContent = '💬';
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
    inputContainer.appendChild(this.input);

    const sendButton = document.createElement('button');
    sendButton.className = 'chat-send';
    sendButton.textContent = 'Send';
    inputContainer.appendChild(sendButton);

    sendButton.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    this.container = shadowHost;
  }

  private setupEventListeners() {
    if (this.button) {
      this.button.addEventListener('click', () => {
        this.togglePanel();
      });
    }
  }

  private async togglePanel() {
    if (!this.isOpen) {
      await this.connect();
    }
    this.isOpen = !this.isOpen;
    if (this.panel) {
      this.panel.classList.toggle('open', this.isOpen);
    }
  }

  private async connect() {
    if (!this.config || !this.externalId) return;

    try {
      // Get session
      const response = await fetch(`${this.apiBase}/api/widget/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.config.token,
          externalId: this.externalId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      this.conversationId = data.conversationId;
      this.visitorSessionToken = data.visitorSessionToken;

      // Connect WebSocket
      this.socket = io(`${this.apiBase}/widget`, {
        auth: { token: this.visitorSessionToken },
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        console.log('Widget connected');
        this.startPresenceHeartbeat();
        // Load history via REST API (not WS)
        this.loadHistory();
      });

      this.socket.on('message:ack', (data: any) => {
        const msg = this.messages.find((m) => m.clientMessageId === data.clientMessageId);
        if (msg) {
          msg.delivered = true;
          msg.serverMessageId = data.serverMessageId;
        }
        this.renderMessages();
      });

      this.socket.on('message:new', (data: any) => {
        // Deduplicate: check if message already exists
        const existing = this.messages.find(
          m => m.serverMessageId === data.serverMessageId || 
               m.clientMessageId === data.clientMessageId
        );
        
        if (!existing) {
          this.messages.push({
            serverMessageId: data.serverMessageId,
            clientMessageId: data.clientMessageId,
            text: data.text,
            senderType: data.senderType,
            createdAt: data.createdAt,
          });
          this.renderMessages();
        }
      });

    } catch (error) {
      console.error('Connection error:', error);
    }
  }

  private startPresenceHeartbeat() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }
    this.presenceInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('presence:heartbeat');
      }
    }, 10000);
  }

  private async loadHistory() {
    if (!this.conversationId || !this.visitorSessionToken) return;

    try {
      const response = await fetch(
        `${this.apiBase}/api/widget/messages?conversationId=${this.conversationId}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${this.visitorSessionToken}`,
          },
        }
      );

      if (!response.ok) {
        console.warn('Failed to load message history, continuing with realtime only');
        return;
      }

      const historyMessages = await response.json();
      
      // Deduplicate with existing messages
      const existingIds = new Set(
        this.messages.map(m => m.serverMessageId || m.clientMessageId).filter(Boolean)
      );
      
      const newMessages = historyMessages.filter((msg: any) => 
        !existingIds.has(msg.serverMessageId) && !existingIds.has(msg.clientMessageId)
      );
      
      // Merge: history first, then existing (realtime) messages
      this.messages = [...newMessages, ...this.messages];
      
      // Sort by createdAt
      this.messages.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      this.renderMessages();
    } catch (error) {
      console.warn('Error loading message history:', error);
      // Soft fail: widget still works realtime
    }
  }

  private sendMessage() {
    if (!this.input || !this.socket || !this.conversationId) return;

    const text = this.input.value.trim();
    if (!text) return;

    const clientMessageId = this.generateUUID();
    this.messages.push({
      clientMessageId,
      text,
      senderType: 'visitor',
      createdAt: new Date().toISOString(),
      delivered: false,
    });
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
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${msg.senderType}`;
      messageDiv.textContent = msg.text || '';
      this.messagesContainer!.appendChild(messageDiv);
    });
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  (window as any).SiteAccessChatWidget = SiteAccessChatWidget;
  // Auto-init if config is already available
  if ((window as any).SiteAccessChat) {
    new SiteAccessChatWidget();
  } else {
    // Wait for config
    const checkInterval = setInterval(() => {
      if ((window as any).SiteAccessChat) {
        clearInterval(checkInterval);
        new SiteAccessChatWidget();
      }
    }, 100);
  }
}
