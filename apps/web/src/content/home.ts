export interface HomeToolLink {
  name: string;
  description: string;
  href: string;
  badge?: string;
}

export interface HomeHighlight {
  title: string;
  detail: string;
}

export const featuredTools: HomeToolLink[] = [
  {
    name: 'ガチャツール',
    description: '排出率・アイテム・ユーザー管理をまとめて行える四遊楽の中核ツール',
    href: '/gacha',
    badge: 'メイン'
  },
  {
    name: '受け取りステーション',
    description: 'リアルグッズやコードの受け渡し手順を案内する専用ページ',
    href: '/receive',
    badge: '近日公開'
  },
  {
    name: 'プライバシーポリシー',
    description: 'データの取扱いや連絡先を明確化したガイドライン',
    href: '/privacyPolicy'
  }
];

export const highlights: HomeHighlight[] = [
  {
    title: 'ライブ配信と連動',
    detail: 'リアルタイム入力と結果反映に対応し、配信演出を高めます。'
  },
  {
    title: '複数ガチャを横断管理',
    detail: 'レアリティやアイテム設定をまとめて編集し、運用負荷を軽減します。'
  },
  {
    title: '個人開発だからこそ軽快',
    detail: 'shimmy(しゅら)が迅速に改善し、ユーザーの声をすぐに反映します。'
  }
];

export const newsItems = [
  {
    title: '受け取りステーションの設計を開始',
    date: '2024-05-01',
    summary: '配信後の景品受け渡しをスムーズにするための導線を準備中です。'
  },
  {
    title: 'ライブ貼り付けウィザードを改善',
    date: '2024-04-12',
    summary: 'リアルタイム入力の整合性チェックを強化し、トラブルを未然に防ぎます。'
  }
];
