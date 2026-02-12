export interface ReleaseNoteEntry {
  id: string;
  title: string;
  publishedAt: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNoteEntry[] = [
  {
    id: '2026-02-12-release-notes-modal',
    title: 'アップデート情報モーダルを追加',
    publishedAt: '2026-02-12',
    items: [
      'ガチャページ(/gacha)で更新内容を確認できるアップデート情報モーダルを追加しました。',
      '前回確認したリリースIDを保存し、未読の更新がある時のみ表示するようにしました。',
      '初回アクセス時も最新のアップデート情報が表示されるようにしました。'
    ]
  }
];

export function getUnreadReleaseNotes(
  notes: ReadonlyArray<ReleaseNoteEntry>,
  lastSeenReleaseId: string | null | undefined
): ReleaseNoteEntry[] {
  if (notes.length === 0) {
    return [];
  }

  const normalizedLastSeenReleaseId =
    typeof lastSeenReleaseId === 'string' ? lastSeenReleaseId.trim() : '';

  if (!normalizedLastSeenReleaseId) {
    return [notes[0]];
  }

  const seenIndex = notes.findIndex((note) => note.id === normalizedLastSeenReleaseId);
  if (seenIndex < 0) {
    return [notes[0]];
  }

  if (seenIndex === 0) {
    return [];
  }

  return notes.slice(0, seenIndex);
}
