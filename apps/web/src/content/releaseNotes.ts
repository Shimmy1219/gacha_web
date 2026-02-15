export interface ReleaseNoteEntry {
  id: string;
  title: string;
  publishedAt: string;
  items: string[];
}

const FIRST_VISIT_RELEASE_LIMIT = 10;

export const RELEASE_NOTES: ReleaseNoteEntry[] = [
  {
    id: '2026-02-15-stg-main-merge-update',
    title: 'β版ver2アップデート',
    publishedAt: '2026-02-16',
    items: [
      '【受け取り画面】画面下に受け取り履歴、景品一覧のタブを表示するようにしました。',
      '【受け取り画面】普段利用しているアイコンを登録出来るようになりました。アイコンリングをその場で装着出来ます。',
      '【受け取り画面】所持アイテムをアイテムタイプでフィルタ出来るようになりました。',
      '【受け取り画面】全体的に動作が軽くなりました。',
      '【ガチャ画面】デジタルアイテムタイプ（アイコンリング・壁紙・ヘッダーなど）をアスペクト比から推定するようになりました。手動で変更も出来ます。',
      '【ガチャ画面】引継ぎ機能を実装しました。',
      '【ガチャ画面】discord連携時のエラーを見やすくしました。',
      '【ガチャ画面】景品のアップロード速度が若干早くなりました。',
      '公式アカウントを開設しました。',
      '他にも大量の改良を施しました。（書ききれません）'
    ]
  },
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
    return notes.slice(0, FIRST_VISIT_RELEASE_LIMIT);
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
