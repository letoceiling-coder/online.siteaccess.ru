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
  status?: 'pending' | 'sent' | 'failed';
  retryCount?: number;
}

class SiteAccessChatWidget {
  private config: ChatConfig | null = null;
  private externalId: string | null = null;
  private socket: Socket | null = null;
  private conversationId: string | null = null;
  private visitorSessionToken: string | null = null;
  private messages: ChatMessage[] = [];
  private pendingMessages: Map<string, ChatMessage> = new Map(); // clientMessageId -> message
  private retryTimers: Map<string, NodeJS.Timeout> = new Map(); // clientMessageId -> timer
  private lastSeenCreatedAt: string | null = null; // For sync after reconnect
  private isOpen = false;
  private presenceInterval: NodeJS.Timeout | null = null;
  private apiBase: string = 'https://online.siteaccess.ru';
  private maxRetries = 5;
  private retryDelays = [3000, 6000, 12000, 24000, 48000]; // Exponential backoff in ms

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

    // Get or create externalId (token-specific)
    const tokenHash = this.hashToken(config.token);
    const storageKey = `sa_externalId:${tokenHash.slice(0, 8)}`;
    this.externalId = localStorage.getItem(storageKey);
    if (!this.externalId) {
      this.externalId = this.generateUUID();
      localStorage.setItem(storageKey, this.externalId);
    }

    // Get persisted conversationId (token-specific)
    const conversationKey = `sa_conversationId:${tokenHash.slice(0, 8)}`;
    const persistedConversationId = localStorage.getItem(conversationKey);
    if (persistedConversationId) {
      this.conversationId = persistedConversationId;
    }

    // Load pending messages and lastSeenCreatedAt
    this.loadPendingMessages();
    this.loadLastSeenCreatedAt();

    // Send ping to verify installation
    this.sendPing();

    this.createUI();
    this.setupEventListeners();
  }

  private hashToken(token: string): string {
    // Simple hash function (for storage key only, not security)
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
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
      // Load history when opening panel (even if we have persisted conversationId)
      await this.loadHistory();
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
        // Resend pending messages on reconnect
        this.resendPendingMessages();
        // Sync missed messages
        this.requestSync();
        // Load history via REST API (not WS)
        this.loadHistory();
      });

      this.socket.on('message:ack', (data: any) => {
        // Find message by clientMessageId (must be non-empty)
        if (!data.clientMessageId) {
          console.warn('message:ack received without clientMessageId');
          return;
        }
        
        // Remove from pending
        const pendingMsg = this.pendingMessages.get(data.clientMessageId);
        if (pendingMsg) {
          this.pendingMessages.delete(data.clientMessageId);
          // Clear retry timer
          const timer = this.retryTimers.get(data.clientMessageId);
          if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(data.clientMessageId);
          }
          this.savePendingMessages();
        }
        
        // Update message in UI (idempotent: receiving same ACK twice is safe)
        const msg = this.messages.find((m) => m.clientMessageId === data.clientMessageId);
        if (msg) {
          // Idempotency: if already delivered, skip update (safe to receive ACK twice)
          if (msg.delivered && msg.status === " sent && msg.serverMessageId === data.serverMessageId) {
 console.log([ACK] Duplicate ACK ignored for ...);
 return;
 }
 
 msg.delivered = true;
 msg.status = sent;
 if (data.serverMessageId) {
 msg.serverMessageId = data.serverMessageId;
 }
 // Update lastSeenCreatedAt
 if (data.createdAt) {
 this.lastSeenCreatedAt = data.createdAt;
 this.saveLastSeenCreatedAt();
 }
 // Re-sort after updating serverMessageId (stable: createdAt ASC, then id ASC)
 this.messages.sort((a, b) => {
 const timeA = new Date(a.createdAt).getTime();
 const timeB = new Date(b.createdAt).getTime();
 if (timeA !== timeB) {
 return timeA - timeB;
 }
 // Stable sort by id if createdAt is equal
 const idA = a.serverMessageId || a.clientMessageId || \;
 const idB = b.serverMessageId || b.clientMessageId || \;
 return idA.localeCompare(idB);
 });
 this.renderMessages();
 } else {
 console.warn(message:ack received for unknown clientMessageId: \);
 }

      this.socket.on('message:new', (data: any) => {
        // Deduplicate: check if message already exists
        // Prefer serverMessageId when present, only use clientMessageId if it's a non-empty string
        const existing = this.messages.find((m) => {
          // If both have serverMessageId, compare by that
          if (m.serverMessageId && data.serverMessageId) {
            return m.serverMessageId === data.serverMessageId;
          }
          // If both have clientMessageId (non-empty), compare by that
          if (m.clientMessageId && data.clientMessageId && 
              m.clientMessageId !== '' && data.clientMessageId !== '') {
            return m.clientMessageId === data.clientMessageId;
          }
          // If one has serverMessageId and other has clientMessageId, they're different
          return false;
        });
        
        if (!existing) {
          this.messages.push({
          // Sort by createdAt ASC, then id ASC (stable ordering)
          this.messages.sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            if (timeA !== timeB) {
              return timeA - timeB;
            }
            // Stable sort by id if createdAt is equal
            const idA = a.serverMessageId || a.clientMessageId || " ;
 const idB = b.serverMessageId || b.clientMessageId || \;
 return idA.localeCompare(idB);
 });
            createdAt: data.createdAt,
            delivered: true,
            status: 'sent',
          });
          // Update lastSeenCreatedAt
          if (data.createdAt && (!this.lastSeenCreatedAt || data.createdAt > this.lastSeenCreatedAt)) {
            this.lastSeenCreatedAt = data.createdAt;
            this.saveLastSeenCreatedAt();
          }
          // Sort by createdAt to maintain chronological order
          this.messages.sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          this.renderMessages();
        }
      });

      this.socket.on('sync:response', (data: any) => {
        if (!data.messages || !Array.isArray(data.messages)) return;

        console.log(`Received ${data.messages.length} messages from sync`);
        
        // Merge sync messages with existing (deduplicate)
        const existingIds = new Set(
          this.messages
            .map(m => m.serverMessageId || m.clientMessageId)
            .filter(Boolean)
        );

        const newMessages = data.messages.filter((msg: any) => {
        // Sort by createdAt ASC, then id ASC (stable ordering)
        this.messages.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          // Stable sort by id if createdAt is equal
          const idA = a.serverMessageId || a.clientMessageId || " ;
 const idB = b.serverMessageId || b.clientMessageId || \;
 return idA.localeCompare(idB);
 });
        for (const msg of newMessages) {
          this.messages.push({
            serverMessageId: msg.serverMessageId,
            clientMessageId: msg.clientMessageId,
            text: msg.text,
            senderType: msg.senderType,
            createdAt: msg.createdAt,
            delivered: true,
            status: 'sent',
          });
          // Update lastSeenCreatedAt
          if (msg.createdAt && (!this.lastSeenCreatedAt || msg.createdAt > this.lastSeenCreatedAt)) {
            this.lastSeenCreatedAt = msg.createdAt;
            this.saveLastSeenCreatedAt();
          }
        }

        // Sort by createdAt
        this.messages.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        this.renderMessages();
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
    if (!this.input || !this.conversationId) return;

    const text = this.input.value.trim();
    if (!text) return;

    // Generate unique clientMessageId (always unique per message)
    const clientMessageId = this.generateUUID();
    const createdAt = new Date().toISOString();
    
    // Create message object
    const message: ChatMessage = {
      clientMessageId,
      text,
      senderType: 'visitor',
      createdAt,
      delivered: false,
      status: 'pending',
      retryCount: 0,
    };
    
    // Add to messages array (optimistic UI update)
    this.messages.push(message);
    
    // Sort by createdAt
    this.messages.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    this.renderMessages();
    this.input.value = '';

    // Add to pending and send
    this.pendingMessages.set(clientMessageId, message);
    this.savePendingMessages();
    this.sendMessageToServer(message);
  }

  private sendMessageToServer(message: ChatMessage) {
    if (!this.socket || !this.conversationId || !message.clientMessageId) return;

    if (!this.socket.connected) {
      console.warn('Socket not connected, message will be sent on reconnect');
      return;
    }

    this.socket.emit('message:send', {
      conversationId: this.conversationId,
      text: message.text,
      clientMessageId: message.clientMessageId,
    });

    // Start retry timer if no ACK received
    this.scheduleRetry(message);
  }

  private scheduleRetry(message: ChatMessage) {
    if (!message.clientMessageId) return;

    const retryCount = message.retryCount || 0;
    if (retryCount >= this.maxRetries) {
      console.error(`Message ${message.clientMessageId} failed after ${retryCount} retries`);
      message.status = 'failed';
      this.renderMessages();
      return;
    }

    const delay = this.retryDelays[Math.min(retryCount, this.retryDelays.length - 1)];
    
    const timer = setTimeout(() => {
      if (this.pendingMessages.has(message.clientMessageId!)) {
        message.retryCount = (message.retryCount || 0) + 1;
        console.log(`Retrying message ${message.clientMessageId} (attempt ${message.retryCount})`);
        this.sendMessageToServer(message);
      }
    }, delay);

    this.retryTimers.set(message.clientMessageId, timer);
  }

  private resendPendingMessages() {
    if (this.pendingMessages.size === 0) return;

    console.log(`Resending ${this.pendingMessages.size} pending messages`);
    for (const [clientMessageId, message] of this.pendingMessages.entries()) {
      // Reset retry count on reconnect
      message.retryCount = 0;
      this.sendMessageToServer(message);
    }
  }

  private requestSync() {
    if (!this.socket || !this.conversationId || !this.socket.connected) return;

    const sinceCreatedAt = this.lastSeenCreatedAt || null;
    console.log(`Requesting sync since: ${sinceCreatedAt || 'beginning'}`);

    this.socket.emit('sync:request', {
      conversationId: this.conversationId,
      sinceCreatedAt,
      limit: 100,
    });
  }

  private savePendingMessages() {
    if (!this.config?.token) return;
    const tokenHash = this.hashToken(this.config.token);
    const key = `sa_pendingMessages:${tokenHash.slice(0, 8)}`;
    try {
      const pending = Array.from(this.pendingMessages.values());
      localStorage.setItem(key, JSON.stringify(pending));
    } catch (e) {
      console.warn('Failed to save pending messages', e);
    }
  }

  private loadPendingMessages() {
    if (!this.config?.token) return;
    const tokenHash = this.hashToken(this.config.token);
    const key = `sa_pendingMessages:${tokenHash.slice(0, 8)}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const pending: ChatMessage[] = JSON.parse(stored);
        for (const msg of pending) {
          if (msg.clientMessageId && msg.status === 'pending') {
            this.pendingMessages.set(msg.clientMessageId, msg);
          }
        }
        localStorage.removeItem(key); // Clear after loading
      }
    } catch (e) {
      console.warn('Failed to load pending messages', e);
    }
  }

  private saveLastSeenCreatedAt() {
    if (!this.config?.token) return;
    const tokenHash = this.hashToken(this.config.token);
    const key = `sa_lastSeenCreatedAt:${tokenHash.slice(0, 8)}`;
    try {
      if (this.lastSeenCreatedAt) {
        localStorage.setItem(key, this.lastSeenCreatedAt);
      }
    } catch (e) {
      console.warn('Failed to save lastSeenCreatedAt', e);
    }
  }

  private loadLastSeenCreatedAt() {
    if (!this.config?.token) return;
    const tokenHash = this.hashToken(this.config.token);
    const key = `sa_lastSeenCreatedAt:${tokenHash.slice(0, 8)}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        this.lastSeenCreatedAt = stored;
      }
    } catch (e) {
      console.warn('Failed to load lastSeenCreatedAt', e);
    }
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
