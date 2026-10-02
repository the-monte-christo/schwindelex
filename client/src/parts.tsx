import { useEffect, useState } from 'preact/hooks';
import type { PlayerSummary, PlayerView } from '../../shared/protocol.ts';
import { Icon } from './icon.tsx';

export function inviteLink(code: string): string {
  return `${location.origin}/?c=${code}`;
}

export function nameOf(view: PlayerView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Stable pseudo-random number from a string (FNV-1a), so sheets keep their look across updates. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rotation and a small sideways shift for "messy" sheets, as CSS custom properties. */
export function tilt(seed: string, max = 3.5, maxShift = 6): Record<string, string> {
  const h = hash(seed);
  const deg = ((h % 1000) / 1000) * 2 * max - max;
  const shift = ((Math.floor(h / 1000) % 1000) / 1000) * 2 * maxShift - maxShift;
  return { '--tilt': `${deg.toFixed(2)}deg`, '--shift': `${shift.toFixed(1)}px` };
}

const NOTE_COLORS = ['yellow', 'orange', 'mint', 'blue', 'lilac'] as const;

export function noteColor(seed: string): string {
  return NOTE_COLORS[hash(`c${seed}`) % NOTE_COLORS.length]!;
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
    <p class="countdown" role="timer" aria-label="Restzeit" data-urgent={seconds <= 10}>
      <Icon name="stopwatch" /> {seconds} s
    </p>
  );
}

/** Player list as name tags with a per-phase status mark. */
export function PlayerList({ view, doneLabel }: { view: PlayerView; doneLabel: string }) {
  return (
    <ul class="players" aria-label="Spieler">
      {view.players.map((p) => (
        <li key={p.id} data-done={p.done} data-offline={!p.connected} style={tilt(p.id, 2)}>
          {p.id === view.hostId && view.phase === 'lobby' && <Icon name="crown" />}
          {!p.connected && <Icon name="plug" />}
          {p.name}
          {p.id === view.me && ' (du)'}
          <span class="tag-status">{statusText(p, doneLabel)}</span>
          {p.done && p.connected && <Icon name="check" />}
        </li>
      ))}
    </ul>
  );
}

function statusText(p: PlayerSummary, doneLabel: string): string {
  if (!p.connected) return ' – offline';
  if (p.pending) return ' – kommt nächste Runde dazu';
  if (p.done) return ` – ${doneLabel}`;
  return '';
}

export function InviteOverlay({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <div class="overlay" role="dialog" aria-label="Mitspieler einladen">
      <h2 class="scribbled">
        <Icon name="people" />
        Mitspieler einladen
      </h2>
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
      if (navigator.share) await navigator.share({ title: 'Schwindelex', text: 'Spiel mit bei Schwindelex!', url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // user cancelled sharing
    }
  };
  return (
    <section class="invite taped">
      <p class="hand">Spielcode</p>
      <strong class="code">{code}</strong>
      <img src={`/qr/${code}.svg`} alt={`QR-Code zum Beitreten, Code ${code}`} width={220} height={220} />
      <p>
        <a href={link}>{link}</a>
      </p>
      <button onClick={share}>
        <Icon name="share" />
        {copied ? 'Link kopiert' : 'Link teilen'}
      </button>
    </section>
  );
}
