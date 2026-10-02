import { useEffect, useState } from 'preact/hooks';
import type { PlayerSummary, PlayerView } from '../../shared/protocol.ts';

export function inviteLink(code: string): string {
  return `${location.origin}/?c=${code}`;
}

export function nameOf(view: PlayerView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function Countdown({ deadline, offset }: { deadline: number | null; offset: number }) {
  const left = () => (deadline === null ? 0 : Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000)));
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    const timer = setInterval(() => setSeconds(left()), 250);
    return () => clearInterval(timer);
  }, [deadline, offset]);
  if (deadline === null) return null;
  return (
    <p class="countdown" role="timer" aria-label="Restzeit">
      ⏱ {seconds} s
    </p>
  );
}

/** Player list with a per-phase status mark. */
export function PlayerList({ view, doneLabel }: { view: PlayerView; doneLabel: string }) {
  return (
    <ul class="players" aria-label="Spieler">
      {view.players.map((p) => (
        <li key={p.id} data-done={p.done}>
          {p.name}
          {p.id === view.me && ' (du)'}
          {p.id === view.hostId && view.phase === 'lobby' && ' 👑'}
          {statusMark(p, doneLabel)}
        </li>
      ))}
    </ul>
  );
}

function statusMark(p: PlayerSummary, doneLabel: string): string {
  if (!p.connected) return ' – offline';
  if (p.pending) return ' – kommt nächste Runde dazu';
  if (p.done) return ` – ${doneLabel}`;
  return '';
}

export function InviteOverlay({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <div class="overlay" role="dialog" aria-label="Mitspieler einladen">
      <Invite code={code} />
      <button onClick={onClose}>Schließen</button>
    </div>
  );
}

export function Invite({ code }: { code: string }) {
  const link = inviteLink(code);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Schwindelex', url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // user cancelled sharing
    }
  };
  return (
    <section class="invite">
      <p>
        Code: <strong class="code">{code}</strong>
      </p>
      <img src={`/qr/${code}.svg`} alt={`QR-Code zum Beitreten, Code ${code}`} width={200} height={200} />
      <p>
        <a href={link}>{link}</a>
      </p>
      <button onClick={share}>{copied ? 'Link kopiert ✓' : 'Link teilen'}</button>
    </section>
  );
}
