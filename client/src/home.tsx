import { Logo } from './logo.tsx';
import { useState } from 'preact/hooks';
import { connection } from './connection.ts';

const NAME_KEY = 'schwindelex.name';

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // ignore
  }
}

export function Home({ notice }: { notice: string | null }) {
  const invited = new URLSearchParams(location.search).get('c')?.toUpperCase() ?? '';
  const [name, setName] = useState(storedName);
  const [code, setCode] = useState(invited);
  const [pin, setPin] = useState('');
  const [hosting, setHosting] = useState(false);

  const join = (e: Event) => {
    e.preventDefault();
    rememberName(name);
    connection.send({ t: 'join', code: code.trim(), name });
  };
  const create = (e: Event) => {
    e.preventDefault();
    rememberName(name);
    connection.send({ t: 'create', pin, name });
  };

  return (
    <main>
      <Logo tagline />
      {notice && <p class="notice">{notice}</p>}

      <label>
        Dein Name
        <input value={name} maxLength={20} autoComplete="nickname" onInput={(e) => setName(e.currentTarget.value)} />
      </label>

      {!hosting ? (
        <form key="join" onSubmit={join}>
          <h2>Mitspielen</h2>
          <label>
            Spielcode
            <input
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
          </label>
          <button type="submit" class="primary" disabled={!name.trim() || code.trim().length !== 4}>
            Beitreten
          </button>
          {!invited && (
            <p>
              <button type="button" class="link" onClick={() => setHosting(true)}>
                Neues Spiel erstellen
              </button>
            </p>
          )}
        </form>
      ) : (
        <form key="host" onSubmit={create}>
          <h2>Neues Spiel</h2>
          <label>
            Host-PIN
            <input type="password" value={pin} autoComplete="off" onInput={(e) => setPin(e.currentTarget.value)} />
          </label>
          <button type="submit" class="primary" disabled={!name.trim() || !pin}>
            Spiel erstellen
          </button>
          <p>
            <button type="button" class="link" onClick={() => setHosting(false)}>
              Zurück zum Beitreten
            </button>
          </p>
        </form>
      )}
    </main>
  );
}
