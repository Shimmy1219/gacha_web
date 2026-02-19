import { ArrowDownTrayIcon, BoltIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

import { useNotification, type NotificationVariant } from '../../../../features/notification';

export function ControlsPanel(): JSX.Element {
  const { notify } = useNotification();

  const handlePushRandomNotification = () => {
    const notificationCandidates: Array<{ variant: NotificationVariant; title: string; message: string }> = [
      {
        variant: 'success',
        title: '通知テスト: 成功',
        message: 'サンプルの成功通知です。共有処理が完了した想定です。'
      },
      {
        variant: 'warning',
        title: '通知テスト: 警告',
        message: 'サンプルの警告通知です。一部データに未設定項目があります。'
      },
      {
        variant: 'error',
        title: '通知テスト: 失敗',
        message: 'サンプルの失敗通知です。通信エラーを想定しています。'
      }
    ];
    const randomIndex = Math.floor(Math.random() * notificationCandidates.length);
    const selected = notificationCandidates[randomIndex] ?? notificationCandidates[0];
    notify(selected);
  };

  return (
    <div className="controls-panel flex flex-col gap-6 text-sm text-muted-foreground">
      <div className="controls-panel__header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="controls-panel__title-group space-y-2">
          <span className="controls-panel__badge badge">ワークフロー</span>
          <h1 className="controls-panel__title text-2xl font-semibold text-surface-foreground">ガチャ運用ダッシュボード</h1>
          <p className="controls-panel__subtitle text-xs text-muted-foreground">
            TXT/JSONの取り込みからレアリティ・アイテム設定、ユーザー配布までを一括で管理します。
          </p>
        </div>
        <div className="controls-panel__actions flex flex-wrap gap-2">
          <button
            type="button"
            className="controls-panel__import-button btn-primary rounded-xl px-5 py-2"
            onClick={() => console.info('TXT/JSONインポートの起動は未実装です')}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            TXT/JSONを読み込む
          </button>
          <button
            type="button"
            className="controls-panel__save-button btn-muted rounded-xl px-5 py-2"
            onClick={() => console.info('保存オプションの起動は未実装です')}
          >
            <CloudArrowUpIcon className="h-4 w-4" />
            保存オプション
          </button>
          <button
            type="button"
            className="controls-panel__random-notification-button btn btn-muted rounded-xl px-5 py-2"
            onClick={handlePushRandomNotification}
          >
            ランダム通知テスト
          </button>
        </div>
      </div>
      <div className="controls-panel__steps grid gap-3 md:grid-cols-3">
        <div className="controls-panel__step-card rounded-2xl border border-border/60 bg-surface/25 p-4">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Step 1</p>
          <h2 className="mt-1 text-sm font-semibold text-surface-foreground">データを取り込む</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            TXT/JSONファイル、手動入力貼り付け、ZIP共有からデータを同期し、AppStateへ反映します。
          </p>
        </div>
        <div className="controls-panel__step-card rounded-2xl border border-border/60 bg-surface/25 p-4">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Step 2</p>
          <h2 className="mt-1 text-sm font-semibold text-surface-foreground">セクションを整える</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            レアリティ、アイテム画像、ユーザー内訳、リアグ設定を調整して、最新の抽選設定を保持します。
          </p>
        </div>
        <div className="controls-panel__step-card rounded-2xl border border-border/60 bg-surface/25 p-4">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Step 3</p>
          <h2 className="mt-1 text-sm font-semibold text-surface-foreground">共有と公開</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            保存オプションとZIP/Blobアップロードで共有URLを生成し、受け取りページへ連携します。
          </p>
        </div>
      </div>
      <div className="controls-panel__note flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
        <BoltIcon className="h-4 w-4" />
        仕様策定中のため、操作ボタンは仮実装です。各機能のReact化に合わせてフックへ接続します。
      </div>
    </div>
  );
}
