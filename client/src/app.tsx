import { useConnection } from './connection.ts';
import { Home } from './home.tsx';
import { Lobby } from './lobby.tsx';
import { Finished, Reveal } from './reveal.tsx';
import { Judging, Voting, Waiting, Writing } from './round.tsx';
import { ERROR_TEXT } from './texts.ts';

export function App() {
  const state = useConnection();
  const { view } = state;
  return (
    <>
      {state.status !== 'online' && (
        <p class="status" role="status">
          {state.status === 'connecting' ? 'Verbinde…' : 'Verbindung weg – verbinde neu…'}
        </p>
      )}
      {state.error && (
        <p class="error" role="alert">
          {ERROR_TEXT[state.error]}
        </p>
      )}
      <Screen state={state} />
      {!view && (
        <footer>
          <a href="https://github.com/the-monte-christo/schwindelex/blob/main/SOURCES.md">Quellen &amp; Lizenzen</a>
        </footer>
      )}
    </>
  );
}

function Screen({ state }: { state: ReturnType<typeof useConnection> }) {
  const { view, clockOffset } = state;
  if (!view) return <Home notice={state.notice} />;
  const me = view.players.find((p) => p.id === view.me);
  const playing = me?.inRound ?? false;
  switch (view.phase) {
    case 'lobby':
      return <Lobby view={view} />;
    case 'writing':
      return playing ? <Writing view={view} offset={clockOffset} /> : <Waiting view={view} />;
    case 'judging':
      return <Judging view={view} />;
    case 'voting':
      return playing ? <Voting view={view} offset={clockOffset} /> : <Waiting view={view} />;
    case 'reveal':
      return <Reveal view={view} />;
    case 'finished':
      return <Finished view={view} />;
  }
}
