import type { ClientMessage, PlayerView, ServerMessage } from '../../../shared/protocol.ts';

/** Test helper: a scripted player talking to a real server over WebSocket. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  view: PlayerView | null = null;
  token = '';
  code = '';
  playerId = '';
  closed = false;
  private ws: WebSocket;
  private cursor = 0;
  private listeners = new Set<() => void>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      this.messages.push(msg);
      if (msg.t === 'state') this.view = msg.view;
      if (msg.t === 'welcome') {
        this.token = msg.token;
        this.code = msg.code;
        this.playerId = msg.playerId;
      }
      for (const l of this.listeners) l();
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const l of this.listeners) l();
    });
  }

  static connect(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(new TestClient(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error('connect failed')), { once: true });
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(data: string): void {
    this.ws.send(data);
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.ws.close();
    return this.until(() => this.closed, 'socket close');
  }

  /** Next message (after the last one consumed) matching pred. */
  async next(pred: (m: ServerMessage) => boolean, what = 'message'): Promise<ServerMessage> {
    let found: ServerMessage | undefined;
    await this.until(() => {
      while (this.cursor < this.messages.length) {
        const m = this.messages[this.cursor++]!;
        if (pred(m)) {
          found = m;
          return true;
        }
      }
      return false;
    }, what);
    return found!;
  }

  error(): Promise<string> {
    return this.next((m) => m.t === 'error', 'error').then((m) => (m as { code: string }).code);
  }

  /** Resolves as soon as the latest view satisfies pred. */
  async state(pred: (v: PlayerView) => boolean, what = 'state'): Promise<PlayerView> {
    await this.until(() => this.view !== null && pred(this.view), what);
    return this.view!;
  }

  private until(check: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`timeout waiting for ${what}; last view phase: ${this.view?.phase}`));
      }, timeoutMs);
      const listener = () => {
        if (!check()) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve();
      };
      this.listeners.add(listener);
    });
  }
}
