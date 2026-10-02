import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayerView, RoundView } from '../../shared/protocol.ts';
import { connection } from './connection.ts';
import { Countdown, PlayerList } from './parts.tsx';
import { POS_TEXT } from './texts.ts';

const MAX_LENGTH = 100;
const DRAFT_DELAY_MS = 400;

function WordHeader({ round }: { round: RoundView }) {
  return (
    <header class="word">
      <p class="round">Runde {round.number}</p>
      <h1>{round.word}</h1>
      <p class="pos">{POS_TEXT[round.pos]}</p>
    </header>
  );
}

/** For players sitting out this round (passed or joined late). */
export function Waiting({ view }: { view: PlayerView }) {
  const me = view.players.find((p) => p.id === view.me);
  return (
    <main>
      <WordHeader round={view.round!} />
      <p class="notice">{me?.pending ? 'Du bist ab der nächsten Runde dabei.' : 'Du setzt diese Runde aus.'}</p>
      <Countdown deadline={view.round!.deadline} offset={connection.state.clockOffset} />
      <PlayerList view={view} doneLabel="fertig" />
    </main>
  );
}

export function Writing({ view, offset }: { view: PlayerView; offset: number }) {
  const round = view.round!;
  const answer = round.myAnswer;
  const [text, setText] = useState(answer?.text ?? '');
  const draftTimer = useRef<number | undefined>(undefined);

  // New round, or resumed after reconnect: take the server's copy.
  useEffect(() => setText(round.myAnswer?.text ?? ''), [round.number]);
  useEffect(() => () => clearTimeout(draftTimer.current), []);

  const onInput = (value: string) => {
    setText(value);
    clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => connection.send({ t: 'draft', text: value }), DRAFT_DELAY_MS);
  };
  const submit = (e: Event) => {
    e.preventDefault();
    clearTimeout(draftTimer.current);
    connection.send({ t: 'submit', text });
  };
  const clear = () => {
    clearTimeout(draftTimer.current);
    setText('');
    connection.send({ t: 'clear' });
  };

  return (
    <main>
      <WordHeader round={round} />
      <Countdown deadline={round.deadline} offset={offset} />
      <form onSubmit={submit}>
        <label>
          Was bedeutet das Wort?
          <textarea
            value={text}
            maxLength={MAX_LENGTH}
            rows={3}
            onInput={(e) => onInput(e.currentTarget.value)}
          />
        </label>
        <p class="counter">
          {text.length}/{MAX_LENGTH}
        </p>
        <div class="buttons">
          <button type="submit">{answer?.submitted ? 'Abgegeben ✓' : 'OK'}</button>
          <button type="button" onClick={clear}>
            Löschen
          </button>
        </div>
        {answer?.submitted && !text.trim() && <p class="hint">Leere Antwort – du tippst trotzdem mit.</p>}
      </form>
      <PlayerList view={view} doneLabel="fertig" />
    </main>
  );
}

export function Judging({ view }: { view: PlayerView }) {
  return (
    <main>
      <WordHeader round={view.round!} />
      <p class="notice" role="status">
        Die Zettel werden sortiert…
      </p>
    </main>
  );
}

export function Voting({ view, offset }: { view: PlayerView; offset: number }) {
  const round = view.round!;
  return (
    <main>
      <WordHeader round={round} />
      <Countdown deadline={round.deadline} offset={offset} />
      <h2>Welche Erklärung stimmt?</h2>
      <ul class="stacks">
        {round.stacks!.map((s) => (
          <li key={s.id}>
            <button
              class="stack"
              aria-pressed={round.myVote === s.id}
              onClick={() => connection.send({ t: 'vote', stack: s.id })}
            >
              {s.text}
              {s.size > 1 && <span class="size"> ({s.size} Zettel)</span>}
              {round.myStack === s.id && <span class="mine"> – dein Zettel</span>}
            </button>
          </li>
        ))}
      </ul>
      <PlayerList view={view} doneLabel="getippt" />
    </main>
  );
}
