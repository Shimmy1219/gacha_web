import { type BackupDuplicateEntry, type BackupDuplicateResolution } from '../../features/storage/backupService';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface BackupImportConflictDialogPayload {
  entry: BackupDuplicateEntry;
  onResolve?: (decision: BackupDuplicateResolution) => void;
}

export function BackupImportConflictDialog({
  payload,
  close
}: ModalComponentProps<BackupImportConflictDialogPayload>): JSX.Element {
  const entry = payload?.entry;
  const gachaId = entry?.id ?? '';
  const existingName = entry?.existingName;
  const incomingName = entry?.incomingName;
  const displayName = incomingName ?? existingName ?? gachaId;

  const handleResolve = (decision: BackupDuplicateResolution) => {
    payload?.onResolve?.(decision);
    close();
  };

  return (
    <>
      <ModalBody className="space-y-4 text-sm leading-relaxed">
        <div className="space-y-2 text-muted-foreground">
          <p className="text-surface-foreground">
            バックアップ内の「{displayName}」は、既に登録済みのガチャと同じID（{gachaId}）です。
          </p>
          <p>このガチャをどのように処理するか選択してください。</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface/70 p-4 text-xs text-muted-foreground">
          <dl className="space-y-2">
            <div>
              <dt className="text-xs font-semibold text-surface-foreground">バックアップ内の名称</dt>
              <dd>{incomingName ?? '（名称未設定）'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-surface-foreground">現在の登録名</dt>
              <dd>{existingName ?? '（名称未設定）'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-surface-foreground">ガチャID</dt>
              <dd className="font-mono text-surface-foreground">{gachaId}</dd>
            </div>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">
          「スキップ」を選ぶとバックアップ内のこのガチャは追加されません。「上書きする」を選ぶと既存のデータを削除してバックアップの内容に置き換えます。
        </p>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={() => handleResolve('skip')}>
          スキップ
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleResolve('overwrite')}>
          上書きする
        </button>
      </ModalFooter>
    </>
  );
}

