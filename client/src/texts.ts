import type { ErrorCode } from '../../shared/protocol.ts';

export const ERROR_TEXT: Record<ErrorCode, string> = {
  bad_message: 'Da ist etwas schiefgelaufen.',
  bad_pin: 'Falsche PIN.',
  rate_limited: 'Zu viele Versuche – bitte kurz warten.',
  server_full: 'Der Server ist gerade voll.',
  not_joined: 'Du bist in keinem Spiel.',
  already_joined: 'Du bist schon in einem Spiel.',
  lobby_not_found: 'Diesen Code gibt es nicht.',
  game_finished: 'Das Spiel ist schon vorbei.',
  lobby_full: 'Das Spiel ist voll (max. 20).',
  name_taken: 'Den Namen gibt es schon.',
  name_invalid: 'Bitte einen Namen eingeben.',
  not_host: 'Nur der Host kann starten.',
  not_enough_players: 'Ihr braucht mindestens 2 Leute.',
  not_all_ready: 'Noch nicht alle sind bereit.',
  wrong_phase: 'Das geht gerade nicht.',
  not_in_round: 'Du spielst diese Runde nicht mit.',
  unknown_stack: 'Diesen Zettel gibt es nicht.',
  pending_player: 'Du bist ab der nächsten Runde dabei.',
  internal: 'Serverfehler – bitte nochmal.',
};

export const POS_TEXT = { noun: 'Substantiv', verb: 'Verb', adj: 'Adjektiv' } as const;
