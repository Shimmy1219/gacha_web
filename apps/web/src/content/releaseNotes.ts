export interface ReleaseNoteEntry {
  id: string;
  title: string;
  publishedAt: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNoteEntry[] = [
  {
    id: '2026-02-12-initial-release',
    title: 'β版リリース',
    publishedAt: '2026-02-12',
    items: [
      '四遊楽ガチャツールのβ版をリリースしました。',
      '基本的なすべての機能が利用可能です。',
      'フィードバックは公式Xアカウント（@shiyuragacha）までお願いいたします。'
    ]
  },
  {
    id: '2026-02-11-release-notes-modal',
    title: 'アップデート情報モーダルを追加',
    publishedAt: '2026-02-11',
    items: [
      'ガチャページ(/gacha)で更新内容を確認できるアップデート情報モーダルを追加しました。',
      'Twitterの公式アカウントへのリンクを追加しました。'
    ]
  },
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
