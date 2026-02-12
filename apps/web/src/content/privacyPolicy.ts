export interface PrivacyPolicySection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PrivacyPolicyContent {
  operatorName: string;
  title: string;
  lead: string;
  effectiveDateLabel: string;
  lastUpdatedLabel: string;
  sections: PrivacyPolicySection[];
  contactMethodLabel: string;
  contactNote: string;
}

export const privacyPolicyContent: PrivacyPolicyContent = {
  operatorName: '四遊楽（しゅら）',
  title: 'プライバシーポリシー',
  lead:
    '四遊楽（しゅら）（以下「運営者」）は、四遊楽ガチャツール（以下「本サービス」）における利用者情報の取扱いについて、以下のとおり定めます。',
  effectiveDateLabel: '施行日: 2026/02/12',
  lastUpdatedLabel: '最終更新日: 2026/02/12',
  sections: [
    {
      id: 'scope',
      title: '1. 適用範囲',
      paragraphs: [
        '本ポリシーは、本サービスの利用に関連して運営者が取得・利用する情報の取扱いに適用されます。',
        '本サービスが連携する外部サービス（Discord等）については、当該サービスのプライバシーポリシーおよび利用規約があわせて適用されます。'
      ]
    },
    {
      id: 'information-collected',
      title: '2. 取得する情報',
      paragraphs: ['運営者は、本サービスの提供にあたり、次の情報を取得することがあります。'],
      bullets: [
        'Discord連携時の情報（DiscordユーザーID、ユーザー名、アバター、OAuthアクセストークン・リフレッシュトークン）',
        'Discord連携機能で扱う情報（サーバーID、チャンネルID、メンバーID、表示名等）',
        '利用者が入力または生成する情報（ガチャ設定、景品情報、在庫情報、受け取り履歴、ユーザー表示名等）',
        '共有・引き継ぎ機能で扱う情報（アップロードしたZIPファイル、ファイル名、受け取り名、共有トークン、引き継ぎコード）',
        'セキュリティおよび運用上必要な技術情報（Cookie、CSRFトークン、リクエスト情報、レート制御に必要な情報）'
      ]
    },
    {
      id: 'purposes',
      title: '3. 利用目的',
      paragraphs: ['取得した情報は、次の目的で利用します。'],
      bullets: [
        '本人確認、ログイン状態維持、セッション管理',
        'ガチャ管理・景品受け取り・引き継ぎ機能の提供',
        'Discord連携機能の提供（サーバー確認、メンバー検索、チャンネル操作、送信処理等）',
        '不正利用防止、セキュリティ対策、障害対応、品質改善'
      ]
    },
    {
      id: 'storage-retention',
      title: '4. 保存場所と保存期間',
      paragraphs: [
        '本サービスでは、機能ごとに保存場所と期間が異なります。主な取扱いは次のとおりです。',
        '保存期間は法令対応または運用上の必要に応じて変更されることがあります。'
      ],
      bullets: [
        'ブラウザ内保存（localStorage / IndexedDB）: 利用者が削除するまで、またはブラウザデータ消去まで',
        'Discord認証用state情報・PWAブリッジ情報（Upstash Redis）: 原則10分',
        'ログインセッション情報（Upstash Redis）: 最終利用から最大30日',
        '受け取りリンク用トークン（Upstash Redis）: 既定7日（最長14日）',
        '引き継ぎコード情報（Upstash Redis）: 原則24時間',
        'アップロードファイル（Vercel Blob）: 受け取り処理等で削除される場合があります（永続保存は保証しません）'
      ]
    },
    {
      id: 'third-parties',
      title: '5. 第三者提供・外部サービス',
      paragraphs: ['運営者は、次の場合を除き、取得した個人情報を第三者に提供しません。'],
      bullets: [
        '利用者本人の同意がある場合',
        '法令に基づく場合',
        '業務委託先に本サービス提供上必要な範囲で取り扱わせる場合（Discord、Upstash、Vercel等）'
      ]
    },
    {
      id: 'cookies',
      title: '6. Cookieの利用',
      paragraphs: [
        '本サービスでは、認証およびセキュリティ目的でCookieを利用します。',
        '主要なCookieは `sid`（ログインセッション）、`csrf` / `discord_csrf`（CSRF対策）、`d_state` / `d_verifier` / `d_login_context` / `d_pwa_bridge`（Discord認証フロー）です。',
        'Cookieには `Secure`、`HttpOnly`、`SameSite=Lax` 等の属性を付与して運用します。'
      ]
    },
    {
      id: 'analytics',
      title: '7. アクセス解析等',
      paragraphs: [
        '本サービスは、2026/02/12 時点で第三者の広告配信および行動ターゲティング目的のアクセス解析ツールを導入していません。',
        '将来導入する場合は、本ポリシーを更新して公表します。'
      ]
    },
    {
      id: 'rights',
      title: '8. 開示・訂正・削除等',
      paragraphs: [
        '利用者は、法令の定めに基づき、自己に関する情報の開示、訂正、利用停止、削除等を求めることができます。',
        '本サービスの仕様上、利用者端末内に保存されたデータは、利用者自身によるブラウザデータ削除でも消去可能です。'
      ]
    },
    {
      id: 'revision',
      title: '9. 本ポリシーの変更',
      paragraphs: [
        '運営者は、法令の改正、機能変更、運用上の必要に応じて本ポリシーを変更することがあります。',
        '変更後の内容は、本サービス上への掲載をもって効力を生じるものとします。'
      ]
    }
  ],
  contactMethodLabel: 'X（旧Twitter）@shiyuragacha のDM',
  contactNote: '本ポリシーに関するお問い合わせは、上記窓口までご連絡ください。'
};
