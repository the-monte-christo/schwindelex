import { useState } from 'preact/hooks';
import type { PlayerView } from '../../shared/protocol.ts';
import { connection } from './connection.ts';
import { Icon } from './icon.tsx';
import { InviteOverlay, nameOf, noteColor, PlayerList, tilt } from './parts.tsx';

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
          <span>
            {p.place}. {p.name}: {p.score}
          </span>
          {scores[p.id] && scores[p.id]!.total > 0 && <span class="gain">+{scores[p.id]!.total}</span>}
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
            <Icon name="bulb" />
            Richtig: <strong>{reveal.definition}</strong>
          </p>
          <ul class="stacks revealed">
            {reveal.stacks.map((s) => {
              const seed = `${round.number}:${s.id}`;
              return (
                <li key={s.id}>
                  <div
                    class="note"
                    data-true={s.isTrue}
                    data-color={noteColor(seed)}
                    data-size={Math.min(Math.max(1, s.authors.length), 3)}
                    style={tilt(seed)}
                  >
                    {s.isTrue && <span class="stamp">stimmt!</span>}
                    {s.text}
                    <span class="meta">
                      {s.authors.length > 0 ? `von ${names(view, s.authors)}` : 'Original'}
                      {s.voters.length > 0 && ` · getippt von ${names(view, s.voters)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2 class="scribbled">
        <Icon name="star" />
        Punkte
      </h2>
      <Scoreboard view={view} />

      {me?.pending ? (
        <p class="notice">Du bist ab der nächsten Runde dabei.</p>
      ) : (
        <div class="buttons">
          <button class="primary" aria-pressed={round.myDecision === 'continue'} onClick={() => connection.send({ t: 'decide', decision: 'continue' })}>
            Weiter
          </button>
          <button aria-pressed={round.myDecision === 'pass'} onClick={() => connection.send({ t: 'decide', decision: 'pass' })}>
            <Icon name="paperball" />
            Passen
          </button>
        </div>
      )}
      <PlayerList view={view} doneLabel="hat entschieden" />
      <button class="link" onClick={() => setInviting(true)}>
        <Icon name="people" />
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
      <h1 class="logo podium-title">Siegerehrung</h1>
      <ol class="podium" aria-label="Endstand">
        {rows.map((p, i) => (
          <li key={p.id} data-place={p.place} style={{ ...tilt(p.id, 1.5), animationDelay: `${0.15 * (rows.length - i)}s` }}>
            {p.place === 1 && (
              <>
                <Icon name="burst" class="burst" />
                <Icon name="sparkles" class="sparkles" />
                <Icon name="trophy" />
              </>
            )}
            {p.place > 1 && p.place <= 3 && <Icon name="medal" />}
            {`${p.place}. `}
            {p.name}: {p.score} {p.score === 1 ? 'Punkt' : 'Punkte'}
          </li>
        ))}
      </ol>
      <button onClick={() => connection.forget()}>Neues Spiel</button>
    </main>
  );
}
