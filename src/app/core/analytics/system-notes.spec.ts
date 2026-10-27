import { GitLabNote, eventsFromNotes, parseSystemNote } from './system-notes';

const author = { id: 5, username: 'eve', name: 'Eve' };

function note(body: string, system = true, created_at = '2026-10-01T10:00:00Z'): GitLabNote {
  return { id: 1, body, system, created_at, author };
}

describe('parseSystemNote', () => {
  it.each([
    ['marked this merge request as **ready**', 'ready'],
    ['marked this merge request as **draft**', 'draft'],
    ['marked as a **Work In Progress**', 'draft'],
    ['unmarked as a **Work In Progress**', 'ready'],
    ['approved this merge request', 'approved'],
    ['unapproved this merge request', 'unapproved'],
    ['requested changes', 'changesRequested'],
  ])('parseSystemNote_%s_%s', (body, kind) => {
    expect(parseSystemNote(note(body))?.kind).toBe(kind);
  });

  it('parseSystemNote_ReviewRequest_TargetsParsed', () => {
    expect(parseSystemNote(note('requested review from @bob, @carol.dev and @dave'))).toEqual({
      kind: 'reviewRequested',
      at: '2026-10-01T10:00:00Z',
      actor: author,
      targets: ['bob', 'carol.dev', 'dave'],
    });
  });

  it('parseSystemNote_AssignedAndRequested_Parsed', () => {
    expect(
      parseSystemNote(note('assigned to @eve and requested review from @bob'))?.targets,
    ).toEqual(['bob']);
  });

  it('parseSystemNote_RemovedRequest_Parsed', () => {
    expect(parseSystemNote(note('removed review request for @bob'))?.kind).toBe(
      'reviewRequestRemoved',
    );
  });

  it('parseSystemNote_UserComment_Ignored', () => {
    expect(parseSystemNote(note('approved this merge request', false))).toBeNull();
    expect(parseSystemNote(note('added 2 commits'))).toBeNull();
  });

  it('eventsFromNotes_Unordered_SortedOldestFirst', () => {
    const events = eventsFromNotes([
      note('approved this merge request', true, '2026-10-03T00:00:00Z'),
      note('marked this merge request as **ready**', true, '2026-10-02T00:00:00Z'),
      note('a comment', false, '2026-10-01T00:00:00Z'),
    ]);

    expect(events.map((e) => e.kind)).toEqual(['ready', 'approved']);
  });
});
