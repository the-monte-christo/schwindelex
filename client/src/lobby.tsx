import type { PlayerView } from '../../shared/protocol.ts';
import { connection } from './connection.ts';
import { Invite, PlayerList } from './parts.tsx';

export function Lobby({ view }: { view: PlayerView }) {
  const me = view.players.find((p) => p.id === view.me);
  const isHost = view.hostId === view.me;
  const allReady = view.players.every((p) => p.ready || !p.connected);
  const canStart = isHost && allReady && view.players.length >= 2;

  return (
    <main>
      <h1>Schwindelex</h1>
      <Invite code={view.code} />

      <h2>Mitspieler ({view.players.length})</h2>
      <PlayerList view={view} doneLabel="bereit" />

      <button aria-pressed={me?.ready ?? false} onClick={() => connection.send({ t: 'ready', ready: !me?.ready })}>
        {me?.ready ? 'Bereit ✓' : 'Bereit?'}
      </button>
      {isHost && (
        <button onClick={() => connection.send({ t: 'start' })} disabled={!canStart}>
          Spiel starten
        </button>
      )}
      {isHost && !canStart && (
        <p class="hint">{view.players.length < 2 ? 'Warte auf Mitspieler…' : 'Warte, bis alle bereit sind…'}</p>
      )}
      <button class="link" onClick={() => connection.leave()}>
        Verlassen
      </button>
    </main>
  );
}
