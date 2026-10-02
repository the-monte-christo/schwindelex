import type { PlayerSummary, PlayerView, RoundView } from '../../../shared/protocol.ts';
import type { Game } from '../game/game.ts';
import type { Player, Round } from '../game/types.ts';

/** What one player may see. Hides other answers while writing and authors/truth while voting. */
export function viewFor(game: Game, code: string, me: string, now: number): PlayerView {
  return {
    code,
    me,
    hostId: game.hostId,
    phase: game.phase,
    serverNow: now,
    players: game.players.map((p) => summary(game, p)),
    round: game.round ? roundView(game, game.round, me) : null,
  };
}

function summary(game: Game, p: Player): PlayerSummary {
  const round = game.round;
  let done = false;
  if (game.phase === 'lobby') done = p.ready;
  else if (game.phase === 'writing') done = round?.answers[p.id]?.submitted ?? false;
  else if (game.phase === 'voting') done = round?.votes[p.id] !== undefined;
  else if (game.phase === 'reveal') done = p.decision !== null;
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
    ready: p.ready,
    inRound: p.inRound,
    pending: p.pending,
    done,
  };
}

function roundView(game: Game, round: Round, me: string): RoundView {
  const view: RoundView = {
    number: round.number,
    word: round.word.word,
    pos: round.word.pos,
    deadline: game.nextDeadline(),
  };
  switch (game.phase) {
    case 'writing':
      view.myAnswer = round.answers[me] ? { ...round.answers[me] } : undefined;
      break;
    case 'voting':
      view.stacks = round.stacks.map((s) => ({ id: s.id, text: s.text, size: Math.max(1, s.authors.length) }));
      view.myStack = round.stacks.find((s) => s.authors.includes(me))?.id ?? null;
      view.myVote = round.votes[me] ?? null;
      break;
    case 'reveal':
    case 'finished':
      if (round.stacks.length > 0) {
        view.reveal = {
          definition: round.word.definition,
          stacks: round.stacks.map((s) => ({
            id: s.id,
            text: s.text,
            isTrue: s.isTrue,
            authors: [...s.authors],
            voters: Object.entries(round.votes)
              .filter(([, stackId]) => stackId === s.id)
              .map(([voter]) => voter),
          })),
          scores: round.scores,
        };
      }
      view.myDecision = game.player(me)?.decision ?? null;
      break;
  }
  return view;
}
