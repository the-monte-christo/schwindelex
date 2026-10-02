// Wire protocol between browser and server. JSON over one WebSocket at /ws.
// The server answers every change with a full, player-specific `state` snapshot.

export type Phase = 'lobby' | 'writing' | 'judging' | 'voting' | 'reveal' | 'finished';
export type Decision = 'continue' | 'pass';

export type ClientMessage =
  | { t: 'create'; pin: string; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'draft'; text: string }
  | { t: 'submit'; text: string }
  | { t: 'clear' }
  | { t: 'vote'; stack: string }
  | { t: 'decide'; decision: Decision };

export type ServerMessage =
  | { t: 'welcome'; code: string; token: string; playerId: string }
  | { t: 'state'; view: PlayerView }
  | { t: 'error'; code: ErrorCode }
  /** The lobby no longer exists (game over, cleaned up or replaced by another tab). */
  | { t: 'closed'; reason: 'not_found' | 'replaced' | 'removed' };

export type ErrorCode =
  | 'bad_message'
  | 'bad_pin'
  | 'rate_limited'
  | 'server_full'
  | 'not_joined'
  | 'already_joined'
  | 'lobby_not_found'
  | 'game_finished'
  | 'lobby_full'
  | 'name_taken'
  | 'name_invalid'
  | 'not_host'
  | 'not_enough_players'
  | 'not_all_ready'
  | 'wrong_phase'
  | 'not_in_round'
  | 'unknown_stack'
  | 'pending_player'
  | 'internal';

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** Lobby: ready. */
  ready: boolean;
  inRound: boolean;
  pending: boolean;
  /** Writing: pressed OK. Voting: has voted. Reveal: has decided. */
  done: boolean;
}

export interface VotingStack {
  id: string;
  text: string;
  /** Number of sheets in the stack (similar answers grouped). */
  size: number;
}

export interface RevealStack {
  id: string;
  text: string;
  isTrue: boolean;
  authors: string[];
  voters: string[];
}

export interface ScoreLine {
  correctAnswer: number;
  correctVote: number;
  bluff: number;
  total: number;
}

export interface RoundView {
  number: number;
  word: string;
  pos: 'noun' | 'verb' | 'adj';
  /** Absolute server time (ms) when the timed phase ends, null if untimed. */
  deadline: number | null;
  /** Writing: own answer. */
  myAnswer?: { text: string; submitted: boolean };
  /** Voting: shuffled stacks without authors. */
  stacks?: VotingStack[];
  /** Voting: stack containing own answer, if any. */
  myStack?: string | null;
  myVote?: string | null;
  /** Reveal / finished: everything uncovered. */
  reveal?: {
    definition: string;
    stacks: RevealStack[];
    scores: Record<string, ScoreLine>;
  };
  myDecision?: Decision | null;
}

export interface PlayerView {
  code: string;
  me: string;
  hostId: string | null;
  phase: Phase;
  /** Server clock at send time, so clients can correct their clock offset. */
  serverNow: number;
  players: PlayerSummary[];
  round: RoundView | null;
}
