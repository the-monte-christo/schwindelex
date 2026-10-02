import { useState } from 'preact/hooks';
import type { PlayerView } from '../../shared/protocol.ts';
import { connection } from './connection.ts';
import { InviteOverlay, nameOf, PlayerList } from './parts.tsx';

function names(view: PlayerView, ids: string[]): string {
  return ids.map((id) => nameOf(view, id)).join(', ');
}

/** Players ordered by score; ties share a place. */
function ranking(view: PlayerView) {
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => ({ ...p, place: 1 + sorted.filter((q) => q.score > p.score).length }));
}

function Scoreboard({ view }: { view: PlayerView }) {
  const scores = view.round?.reveal?.scores ?? {};
  return (
    <ol class="scores" aria-label="Punktestand">
      {ranking(view).map((p) => (
        <li key={p.id}>
          {p.place}. {p.name}: {p.score}
          {scores[p.id] && scores[p.id]!.total > 0 && <span class="gain"> (+{scores[p.id]!.total})</span>}
        </li>
      ))}
    </ol>
  );
}

export function Reveal({ view }: { view: PlayerView }) {
  const round = view.round!;
  const reveal = round.reveal;
  const me = view.players.find((p) => p.id === view.me);
  const [inviting, setInviting] = useState(false);

  return (
    <main>
      <header class="word">
        <p class="round">Runde {round.number}</p>
        <h1>{round.word}</h1>
      </header>
      {reveal && (
        <>
          <p class="truth">
            Richtig: <strong>{reveal.definition}</strong>
          </p>
          <ul class="stacks revealed">
            {reveal.stacks.map((s) => (
              <li key={s.id} data-true={s.isTrue}>
                <p>
                  {s.isTrue ? '✓ ' : ''}
                  {s.text}
                </p>
                <p class="meta">
                  {s.authors.length > 0 ? `von ${names(view, s.authors)}` : 'Original'}
                  {s.voters.length > 0 && ` · getippt von ${names(view, s.voters)}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Punkte</h2>
      <Scoreboard view={view} />

      {me?.pending ? (
        <p class="notice">Du bist ab der nächsten Runde dabei.</p>
      ) : (
        <div class="buttons">
          <button aria-pressed={round.myDecision === 'continue'} onClick={() => connection.send({ t: 'decide', decision: 'continue' })}>
            Weiter
          </button>
          <button aria-pressed={round.myDecision === 'pass'} onClick={() => connection.send({ t: 'decide', decision: 'pass' })}>
            Passen
          </button>
        </div>
      )}
      <PlayerList view={view} doneLabel="hat entschieden" />
      <button class="link" onClick={() => setInviting(true)}>
        Mitspieler einladen
      </button>
      {inviting && <InviteOverlay code={view.code} onClose={() => setInviting(false)} />}
    </main>
  );
}

export function Finished({ view }: { view: PlayerView }) {
  const rows = ranking(view);
  return (
    <main>
      <h1>Siegerehrung</h1>
      <ol class="podium" aria-label="Endstand">
        {rows.map((p) => (
          <li key={p.id} data-place={p.place}>
            {p.place === 1 ? '🏆 ' : `${p.place}. `}
            {p.name}: {p.score} Punkte
          </li>
        ))}
      </ol>
      <button onClick={() => connection.forget()}>Neues Spiel</button>
    </main>
  );
}
