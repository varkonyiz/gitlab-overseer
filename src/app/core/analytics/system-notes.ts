import { GitLabNote } from '../gitlab/gitlab.models';
import { MrEvent, UserRef } from './merge-request';

export type { GitLabNote };

/**
 * GitLab records state changes as English system notes (the stored text is not localised).
 * Current wording first, then the older "Work In Progress" forms.
 */
const RULES: readonly { readonly pattern: RegExp; readonly kind: MrEvent['kind'] }[] = [
  { pattern: /^marked (?:this merge request )?as \*\*ready\*\*/i, kind: 'ready' },
  { pattern: /^marked (?:this merge request )?as \*\*draft\*\*/i, kind: 'draft' },
  { pattern: /^unmarked (?:this merge request )?as a \*\*work in progress\*\*/i, kind: 'ready' },
  { pattern: /^marked (?:this merge request )?as a \*\*work in progress\*\*/i, kind: 'draft' },
  { pattern: /^approved this merge request/i, kind: 'approved' },
  { pattern: /^unapproved this merge request/i, kind: 'unapproved' },
  { pattern: /^requested changes/i, kind: 'changesRequested' },
];

const REVIEW_REQUEST = /requested review from (.+)$/im;
const REVIEW_REMOVED = /removed review request for (.+)$/im;
// GitLab usernames never end with a dot, so a sentence's full stop is not part of the name.
const MENTION = /@([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?)/g;

/** Turns one note into an event, or null when it is not a state change the analytics use. */
export function parseSystemNote(note: GitLabNote): MrEvent | null {
  if (!note.system || typeof note.body !== 'string') {
    return null;
  }
  const body = note.body.trim();
  const actor: UserRef = {
    id: note.author.id,
    username: note.author.username,
    name: note.author.name,
  };

  for (const rule of RULES) {
    if (rule.pattern.test(body)) {
      return { kind: rule.kind, at: note.created_at, actor };
    }
  }

  // "requested review from @a and @b", also inside "assigned to @x and requested review from @y".
  const requested = REVIEW_REQUEST.exec(body);
  if (requested) {
    const targets = mentions(requested[1]);
    return targets.length ? { kind: 'reviewRequested', at: note.created_at, actor, targets } : null;
  }
  const removed = REVIEW_REMOVED.exec(body);
  if (removed) {
    const targets = mentions(removed[1]);
    return targets.length
      ? { kind: 'reviewRequestRemoved', at: note.created_at, actor, targets }
      : null;
  }
  return null;
}

/** Events of a note list, oldest first. */
export function eventsFromNotes(notes: readonly GitLabNote[]): MrEvent[] {
  return notes
    .map(parseSystemNote)
    .filter((e): e is MrEvent => e !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

function mentions(text: string): string[] {
  return [...new Set([...text.matchAll(MENTION)].map((m) => m[1]))];
}
