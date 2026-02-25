interface BuildDiscordShareCommentParams {
  shareUrl: string;
  shareLabel?: string | null;
  expiresAtText?: string | null;
}

/**
 * Discord共有メッセージ用に有効期限を表示文字列へ変換する。
 * @param value ISO文字列などの日付入力
 * @returns 表示用文字列。変換できない場合はnull
 */
export function formatDiscordShareExpiresAt(value?: string | null): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

/**
 * Discordへ送る補足コメントを組み立てる。
 * @param params 共有URL/ラベル/期限情報
 * @returns 送信するコメント本文。不要ならnull
 */
export function buildDiscordShareComment(params: BuildDiscordShareCommentParams): string | null {
  const lines: string[] = [];
  const normalizedShareLabel =
    typeof params.shareLabel === 'string' && params.shareLabel.trim()
      ? params.shareLabel.trim()
      : null;

  if (normalizedShareLabel && normalizedShareLabel !== params.shareUrl) {
    lines.push(normalizedShareLabel);
  }

  const normalizedExpiresAt =
    typeof params.expiresAtText === 'string' && params.expiresAtText.trim()
      ? params.expiresAtText.trim()
      : null;
  if (normalizedExpiresAt) {
    lines.push(`有効期限: ${normalizedExpiresAt}`);
  }

  if (lines.length === 0) {
    return null;
  }
  return lines.join('\n');
}
