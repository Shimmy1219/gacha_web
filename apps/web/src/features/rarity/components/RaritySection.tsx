import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityColorChip } from './RarityColorChip';

interface RarityRow {
  id: string;
  label: string;
  color: string;
  emitRate?: number;
}

function formatRate(rate?: number): string {
  if (rate == null) {
    return '';
  }
  const percent = rate * 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

function createBadgeStyle(color: string): { background: string; boxShadow: string } {
  const primary = color || '#3f3f46';
  return {
    background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 45%, #111827 100%)`,
    boxShadow: `0 10px 24px ${primary}55`
  };
}

export function RaritySection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);

  useEffect(() => {
    const availableIds = data?.appState?.order ?? [];
    if (availableIds.length === 0) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && availableIds.includes(current)) {
        return current;
      }
      return data?.appState?.selectedGachaId && availableIds.includes(data.appState.selectedGachaId)
        ? data.appState.selectedGachaId
        : availableIds[0];
    });
  }, [data?.appState]);

  const gachaTabs = useMemo(() => {
    if (!data?.appState) {
      return [] as Array<{ id: string; label: string }>;
    }

    return (data.appState.order ?? []).map((gachaId) => ({
      id: gachaId,
      label: data.appState?.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [data?.appState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((gacha) => gacha.id), [gachaTabs]);
  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const rarityRows = useMemo(() => {
    if (!data?.rarityState || !activeGachaId) {
      return [] as RarityRow[];
    }

    const rarityIds = data.rarityState.byGacha?.[activeGachaId] ?? [];
    return rarityIds
      .map((rarityId) => {
        const entity = data.rarityState?.entities?.[rarityId];
        if (!entity) {
          return null;
        }
        return {
          id: entity.id,
          label: entity.label,
          color: entity.color ?? '#3f3f46',
          emitRate: entity.emitRate
        } satisfies RarityRow;
      })
      .filter((entry): entry is RarityRow => Boolean(entry));
  }, [activeGachaId, data?.rarityState]);

  const rarityOptions = useMemo(
    () => rarityRows.map((rarity) => ({ value: rarity.id, label: rarity.label })),
    [rarityRows]
  );

  const ptSettings = activeGachaId ? data?.ptSettings?.byGachaId?.[activeGachaId] : undefined;

  return (
    <SectionContainer
      id="rarity"
      title="レアリティ設定"
      description="排出率・カラー・順序を編集し、RarityStoreと同期します。"
    >
      <div className="rarity-section__gacha-tabs tab-scroll-area">
        {gachaTabs.map((gacha) => (
          <button
            key={gacha.id}
            type="button"
            className={clsx(
              'rarity-section__gacha-tab tab-pill shrink-0 rounded-full border px-4 py-1.5',
              gacha.id === activeGachaId
                ? 'border-accent/80 bg-accent text-accent-foreground'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
            onClick={() => setActiveGachaId(gacha.id)}
          >
            {gacha.label}
          </button>
        ))}
      </div>

      <div className="tab-panel-viewport">
        <div
          key={activeGachaId ?? 'rarity-empty'}
          className={panelAnimationClass}
        >
          <PtControlsPanel
            settings={ptSettings}
            rarityOptions={rarityOptions.length > 0 ? rarityOptions : [{ value: '', label: 'レアリティ未設定' }]}
          />

          {status !== 'ready' ? (
            <p className="text-sm text-muted-foreground">ローカルストレージからレアリティ情報を読み込み中です…</p>
          ) : null}
          {status === 'ready' && activeGachaId && rarityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">選択中のガチャにレアリティが登録されていません。</p>
          ) : null}

          {rarityRows.length > 0 ? (
            <div className="rarity-section__table-wrapper overflow-hidden rounded-2xl border border-border/60">
              <table className="rarity-section__table min-w-full divide-y divide-border/60 text-left">
                <thead className="rarity-section__table-head bg-[#121218] text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  <tr>
                    <th className="rarity-section__column px-3 py-2.5 font-semibold">レアリティ</th>
                    <th className="rarity-section__column px-3 py-2.5 font-semibold">カラー</th>
                    <th className="rarity-section__column px-3 py-2.5 font-semibold">排出率</th>
                    <th className="rarity-section__column px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="rarity-section__table-body divide-y divide-border/40 bg-surface/60">
                  {rarityRows.map((rarity) => {
                    const badgeStyle = createBadgeStyle(rarity.color);
                    return (
                      <tr key={rarity.id} className="rarity-section__row text-sm text-surface-foreground">
                        <td className="rarity-section__cell px-3 py-2">
                          <span
                            className="rarity-section__rarity-badge inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] text-white"
                            style={badgeStyle}
                          >
                            {rarity.label.slice(0, 3).toUpperCase()}
                          </span>
                        </td>
                        <td className="rarity-section__cell px-3 py-2">
                          <RarityColorChip
                            value={rarity.color}
                            ariaLabel={`${rarity.label} のカラー`}
                            onClick={() => console.info('カラーピッカーは未実装です', rarity.id)}
                          />
                        </td>
                        <td className="rarity-section__cell px-3 py-2">
                          <div className="rarity-section__rate-control flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={formatRate(rarity.emitRate)}
                              className="rarity-section__rate-input min-w-[8ch] rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                            />
                            <span className="rarity-section__rate-unit text-xs text-muted-foreground">%</span>
                          </div>
                        </td>
                        <td className="rarity-section__cell px-3 py-2 text-right">
                          <button
                            type="button"
                            className="rarity-section__delete-button chip"
                            onClick={() => console.info('レアリティ削除は未実装です', rarity.id)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="rarity-section__footer flex justify-end">
            <button
              type="button"
              className="rarity-section__add-rarity chip border-accent/40 bg-accent/10 text-accent"
              onClick={() => console.info('レアリティ追加のモーダルは未実装です')}
            >
              <PlusCircleIcon className="h-4 w-4" />
              レアリティを追加
            </button>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
