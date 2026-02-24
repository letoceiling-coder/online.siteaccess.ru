import { CallState, callStore } from '../stores/callStore';

type Transition = {
  from: CallState[];
  to: CallState;
};

const ALLOWED_TRANSITIONS: Transition[] = [
  { from: ['idle'], to: 'ringing' },
  { from: ['ringing'], to: 'accepted' },
  { from: ['accepted'], to: 'connecting' },
  { from: ['connecting'], to: 'in_call' },
  { from: ['in_call'], to: 'ended' },
  { from: ['ringing'], to: 'busy' },
  { from: ['idle', 'ringing', 'accepted', 'connecting', 'in_call'], to: 'failed' },
  { from: ['idle', 'ringing', 'accepted', 'connecting', 'in_call', 'busy', 'failed'], to: 'ended' },
];

class CallStateMachine {
  private currentState: CallState = 'idle';
  private connectingWatchdog: ReturnType<typeof setTimeout> | null = null;

  getState(): CallState {
    return this.currentState;
  }

  canTransition(to: CallState): boolean {
    const transition = ALLOWED_TRANSITIONS.find((t) => t.to === to);
    if (!transition) {
      return false;
    }
    return transition.from.includes(this.currentState);
  }

  transition(to: CallState, metadata?: { conversationId?: string; callId?: string; kind?: 'audio' | 'video'; fromRole?: 'operator' | 'visitor'; incomingCall?: { callId: string; fromRole: string; kind: string } }): boolean {
    if (!this.canTransition(to)) {
        console.warn("[CALL_STATE_MACHINE] Illegal transition:", this.currentState, "•", to);
      return false;
    }

      console.log("[CALL_STATE_MACHINE] Transition:", this.currentState, "•", to, metadata);

    // Clear watchdog on any transition
    if (this.connectingWatchdog) {
      clearTimeout(this.connectingWatchdog);
      this.connectingWatchdog = null;
    }

    const previousState = this.currentState;
    this.currentState = to;

    // Update store
    const updates: any = { state: to };
    if (metadata) {
      if (metadata.conversationId !== undefined) updates.conversationId = metadata.conversationId;
      if (metadata.callId !== undefined) updates.callId = metadata.callId;
      if (metadata.kind !== undefined) updates.kind = metadata.kind;
      if (metadata.fromRole !== undefined) updates.fromRole = metadata.fromRole;
      if (metadata.incomingCall !== undefined) updates.incomingCall = metadata.incomingCall;
    }

    // Set startedAt when entering connecting or in_call
    if (to === 'connecting' || to === 'in_call') {
      if (!callStore.getState().startedAt) {
        updates.startedAt = Date.now();
      }
    }

    // Reset startedAt when going to idle
    if (to === 'idle' || to === 'ended') {
      updates.startedAt = null;
    }

    callStore.setState(updates);

    // Start watchdog for connecting state
    if (to === 'connecting') {
      this.connectingWatchdog = setTimeout(() => {
        if (this.currentState === 'connecting') {
          console.warn('[CALL_STATE_MACHINE] Watchdog: connecting timeout, transitioning to failed');
          this.transition('failed');
        }
      }, 20000); // 20 seconds
    }

    // Auto-transition from ended to idle after 2 seconds
    if (to === 'ended') {
      setTimeout(() => {
        if (this.currentState === 'ended') {
          console.log('[CALL_STATE_MACHINE] Auto-transition: ended в†’ idle');
          this.transition('idle');
        }
      }, 2000);
    }

    return true;
  }

  reset() {
    if (this.connectingWatchdog) {
      clearTimeout(this.connectingWatchdog);
      this.connectingWatchdog = null;
    }
    this.currentState = 'idle';
    callStore.reset();
  }
}

export const callStateMachine = new CallStateMachine();
