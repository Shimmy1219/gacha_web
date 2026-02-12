import { describe, expect, it } from 'vitest';

import { getUnreadReleaseNotes, type ReleaseNoteEntry } from './releaseNotes';

const RELEASE_FIXTURES: ReleaseNoteEntry[] = [
  {
    id: 'release-003',
    title: 'Release 003',
    publishedAt: '2026-02-12',
    items: ['item-3']
  },
  {
    id: 'release-002',
    title: 'Release 002',
    publishedAt: '2026-02-11',
    items: ['item-2']
  },
  {
    id: 'release-001',
    title: 'Release 001',
    publishedAt: '2026-02-10',
    items: ['item-1']
  }
];

describe('getUnreadReleaseNotes', () => {
  it('returns latest entry on first visit', () => {
    const unread = getUnreadReleaseNotes(RELEASE_FIXTURES, null);

    expect(unread).toEqual([RELEASE_FIXTURES[0]]);
  });

  it('returns empty array when latest release is already seen', () => {
    const unread = getUnreadReleaseNotes(RELEASE_FIXTURES, 'release-003');

    expect(unread).toEqual([]);
  });

  it('returns all newer releases until seen release id', () => {
    const unread = getUnreadReleaseNotes(RELEASE_FIXTURES, 'release-001');

    expect(unread).toEqual([RELEASE_FIXTURES[0], RELEASE_FIXTURES[1]]);
  });

  it('falls back to latest entry when seen release id is not found', () => {
    const unread = getUnreadReleaseNotes(RELEASE_FIXTURES, 'unknown-release');

    expect(unread).toEqual([RELEASE_FIXTURES[0]]);
  });
});
