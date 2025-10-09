export function HeaderBrand(): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground shadow-lg shadow-accent/40">
        G
      </span>
      <div>
        <p className="text-lg font-semibold">Gacha Manager</p>
        <p className="text-xs text-muted-foreground">
          リアグ/レア度/ユーザー所持品を一元管理する React バージョン
        </p>
      </div>
    </div>
  );
}
