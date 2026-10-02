import { useEffect, useState } from 'preact/hooks';
import type { ClientMessage, ErrorCode, PlayerView, ServerMessage } from '../../shared/protocol.ts';

export interface AppState {
  status: 'connecting' | 'online' | 'offline';
  view: PlayerView | null;
  /** Last error from the server, cleared after a few seconds. */
  error: ErrorCode | null;
  /** Message for the start screen, e.g. why the game is gone. */
  notice: string | null;
  /** serverNow − Date.now(), to show correct countdowns on devices with a wrong clock. */
  clockOffset: number;
}

interface StoredSession {
  code: string;
  token: string;
}

const SESSION_KEY = 'schwindelex.session';

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode: reconnect after reload just won't work
  }
}

/** One WebSocket for the whole app, with automatic reconnect and seat resume. */
class Connection {
  state: AppState = { status: 'connecting', view: null, error: null, notice: null, clockOffset: 0 };
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retryTimer: number | undefined;
  private errorTimer: number | undefined;
  /** Another tab took over the seat: stay quiet instead of fighting over it. */
  private stopped = false;

  start(): void {
    this.connect();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.ws && !this.stopped) this.connect();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Leave the current game for good and return to the start screen. */
  leave(): void {
    this.send({ t: 'leave' });
    this.forget();
  }

  /** Drop all local game state (e.g. after the podium). */
  forget(): void {
    saveSession(null);
    this.set({ view: null, notice: null });
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private connect(): void {
    clearTimeout(this.retryTimer);
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    this.set({ status: 'connecting' });
    ws.onopen = () => {
      this.attempts = 0;
      this.set({ status: 'online' });
      const session = loadSession();
      if (session) this.send({ t: 'resume', code: session.code, token: session.token });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set({ status: 'offline' });
      if (this.stopped) return;
      const delay = Math.min(5000, 500 * 2 ** this.attempts++);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        saveSession({ code: msg.code, token: msg.token });
        break;
      case 'state':
        // The server deletes the lobby right after the podium – nothing left to resume.
        if (msg.view.phase === 'finished') saveSession(null);
        this.set({ view: msg.view, notice: null, clockOffset: msg.view.serverNow - Date.now() });
        break;
      case 'error':
        clearTimeout(this.errorTimer);
        this.set({ error: msg.code });
        this.errorTimer = window.setTimeout(() => this.set({ error: null }), 4000);
        break;
      case 'closed': {
        saveSession(null);
        if (msg.reason === 'replaced') {
          this.stopped = true;
          this.ws?.close();
        }
        const keepPodium = this.state.view?.phase === 'finished';
        this.set({
          view: keepPodium ? this.state.view : null,
          notice:
            msg.reason === 'replaced'
              ? 'Du spielst jetzt in einem anderen Fenster weiter.'
              : msg.reason === 'not_found' && !keepPodium
                ? 'Dieses Spiel gibt es nicht mehr.'
                : null,
        });
        break;
      }
    }
  }
}

export const connection = new Connection();

export function useConnection(): AppState {
  const [state, setState] = useState(connection.state);
  useEffect(() => {
    const unsubscribe = connection.subscribe(() => setState(connection.state));
    setState(connection.state); // catch updates between first render and subscribing
    return unsubscribe;
  }, []);
  return state;
}
