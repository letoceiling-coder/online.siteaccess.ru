export type CallState =
  | 'idle'
  | 'ringing'
  | 'accepted'
  | 'connecting'
  | 'in_call'
  | 'ended'
  | 'busy'
  | 'failed';

interface CallStoreState {
  state: CallState;
  conversationId: string | null;
  callId: string | null;
  kind: 'audio' | 'video' | null;
  fromRole: 'operator' | 'visitor' | null;
  startedAt: number | null;
  incomingCall: { callId: string; fromRole: string; kind: string } | null;
}

class CallStore {
  private state: CallStoreState = {
    state: 'idle',
    conversationId: null,
    callId: null,
    kind: null,
    fromRole: null,
    startedAt: null,
    incomingCall: null,
  };

  private listeners: Set<(state: CallStoreState) => void> = new Set();

  getState(): CallStoreState {
    return { ...this.state };
  }

  subscribe(listener: (state: CallStoreState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.getState()));
  }

  setState(updates: Partial<CallStoreState>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  reset() {
    this.state = {
      state: 'idle',
      conversationId: null,
      callId: null,
      kind: null,
      fromRole: null,
      startedAt: null,
      incomingCall: null,
    };
    this.notify();
  }
}

export const callStore = new CallStore();
