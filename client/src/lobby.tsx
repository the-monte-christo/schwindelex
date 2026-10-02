import type { PlayerView } from '../../shared/protocol.ts';
import { connection } from './connection.ts';
import { Icon } from './icon.tsx';
import { Logo } from './logo.tsx';
import { Invite, PlayerList } from './parts.tsx';

export function Lobby({ view }: { view: PlayerView }) {
  const me = view.players.find((p) => p.id === view.me);
  const isHost = view.hostId === view.me;
  const allReady = view.players.every((p) => p.ready || !p.connected);
  const canStart = isHost && allReady && view.players.length >= 2;

  return (
    <main>
      <Logo />
      <Invite code={view.code} />

      <h2 class="scribbled">
        <Icon name="people" />
        Mitspieler ({view.players.length})
      </h2>
      <PlayerList view={view} doneLabel="bereit" />

      <div class="buttons">
        <button aria-pressed={me?.ready ?? false} onClick={() => connection.send({ t: 'ready', ready: !me?.ready })}>
          {me?.ready ? (
            <>
              <Icon name="check" />
              Bereit
            </>
          ) : (
            'Bereit?'
          )}
        </button>
        {isHost && (
          <button class="primary" onClick={() => connection.send({ t: 'start' })} disabled={!canStart}>
            Spiel starten
          </button>
        )}
      </div>
      {isHost && !canStart && (
        <p class="hint">{view.players.length < 2 ? 'Warte auf Mitspieler…' : 'Warte, bis alle bereit sind…'}</p>
      )}
      <button class="link" onClick={() => connection.leave()}>
        <Icon name="exit" />
        Verlassen
      </button>
    </main>
  );
}
