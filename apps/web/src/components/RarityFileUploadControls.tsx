export interface RarityFileUploadOption {
  id: string;
  label: string;
  color?: string | null;
}

interface RarityFileUploadControlsProps {
  options: ReadonlyArray<RarityFileUploadOption>;
  isProcessing: boolean;
  onSelectAll: () => void;
  onSelectRarity: (rarityId: string) => void;
}

export function RarityFileUploadControls({
  options,
  isProcessing,
  onSelectAll,
  onSelectRarity
}: RarityFileUploadControlsProps): JSX.Element {
  return (
    <div className="create-gacha-wizard__upload-controls space-y-3 rounded-2xl border border-border/60 bg-surface/50 p-4">
      <button
        type="button"
        className="create-gacha-wizard__upload-all-button flex w-full flex-col items-start gap-1 rounded-xl border border-border/70 bg-surface/40 px-4 py-3 text-left transition hover:border-accent/60 hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSelectAll}
        disabled={isProcessing}
      >
        <span className="create-gacha-wizard__upload-all-button-title text-sm font-semibold text-surface-foreground">
          {isProcessing ? '処理中…' : '全てのファイルを一括で登録'}
        </span>
        <span className="create-gacha-wizard__upload-all-button-description text-xs text-muted-foreground">
          （レアリティは後から選択）
        </span>
      </button>
      <div className="create-gacha-wizard__rarity-upload-controls space-y-2">
        <p className="create-gacha-wizard__rarity-upload-label text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          レアリティごとにファイルを登録
        </p>
        <div className="create-gacha-wizard__rarity-upload-buttons flex flex-wrap items-stretch gap-2">
          {options.map((rarity) => (
            <button
              key={rarity.id}
              id={`create-gacha-rarity-upload-${rarity.id}`}
              type="button"
              className="create-gacha-wizard__rarity-upload-button inline-flex min-w-[8rem] flex-1 basis-[8rem] items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs font-semibold transition hover:border-accent/60 hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onSelectRarity(rarity.id)}
              disabled={isProcessing}
            >
              <span
                className="create-gacha-wizard__rarity-upload-button-label"
                style={rarity.color ? { color: rarity.color } : undefined}
              >
                {rarity.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
