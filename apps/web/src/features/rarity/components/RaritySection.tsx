import { clsx } from 'clsx';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useStoreValue } from '@domain/stores';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityColorPicker } from './color-picker/RarityColorPicker';

interface RarityRow {
  id: string;
  label: string;
  color: string;
  emitRate?: number;
}

const FALLBACK_RARITY_COLOR = '#3f3f46';

function formatRate(rate?: number): string {
  if (rate == null) {
    return '';
  }
  const percent = rate * 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

export function RaritySection(): JSX.Element {
  const { appState: appStateStore, rarities: rarityStore, ptControls: ptControlsStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const rarityState = useStoreValue(rarityStore);
  const ptSettingsState = useStoreValue(ptControlsStore);

  const status = appStateStore.isHydrated() && rarityStore.isHydrated() ? 'ready' : 'loading';

  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);

  useEffect(() => {
    const availableIds = appState?.order ?? [];
    if (availableIds.length === 0) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && availableIds.includes(current)) {
        return current;
      }
      if (appState?.selectedGachaId && availableIds.includes(appState.selectedGachaId)) {
        return appState.selectedGachaId;
      }
      return availableIds[0];
    });
  }, [appState]);

  const gachaTabs = useMemo(() => {
    if (!appState) {
      return [] as Array<{ id: string; label: string }>;
    }

    const ordered = appState.order ?? [];
    return ordered.map((gachaId) => ({
      id: gachaId,
      label: appState.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [appState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((gacha) => gacha.id), [gachaTabs]);
  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const rarityRows = useMemo(() => {
    if (!rarityState || !activeGachaId) {
      return [] as RarityRow[];
    }

    const rarityIds = rarityState.byGacha?.[activeGachaId] ?? [];
    return rarityIds
      .map((rarityId) => {
        const entity = rarityState.entities?.[rarityId];
        if (!entity) {
          return null;
        }
        return {
          id: entity.id,
          label: entity.label ?? '',
          color: entity.color ?? FALLBACK_RARITY_COLOR,
          emitRate: entity.emitRate
        };
      })
      .filter((entry): entry is RarityRow => Boolean(entry));
  }, [activeGachaId, rarityState]);

  const rarityOptions = useMemo(
    () => rarityRows.map((rarity) => ({ value: rarity.id, label: rarity.label || rarity.id })),
    [rarityRows]
  );

  const ptSettings = activeGachaId ? ptSettingsState?.byGachaId?.[activeGachaId] : undefined;

  const handleLabelChange = useCallback(
    (rarityId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      rarityStore.renameRarity(rarityId, event.target.value);
    },
    [rarityStore]
  );

  const handleColorChange = useCallback(
    (rarityId: string) => (next: string) => {
      rarityStore.setRarityColor(rarityId, next);
    },
    [rarityStore]
  );

  const handleAddRarity = () => {
    console.info('レアリティ追加のモーダルは未実装です');
  };

  const shouldRenderTable = Boolean(activeGachaId);

  return (
    <SectionContainer
      id="rarity"
      title="レアリティ設定"
      description="排出率・カラー・順序を編集し、RarityStoreと同期します。"
      contentClassName="rarity-section__content"
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

      <div className="rarity-section__scroll section-scroll flex-1">
        <div className="rarity-section__scroll-content space-y-4">
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

          <div className="tab-panel-viewport">
            <div
              key={activeGachaId ?? 'rarity-empty'}
              className={panelAnimationClass}
            >
              {shouldRenderTable ? (
                <div className="rarity-section__table-wrapper overflow-hidden rounded-2xl border border-border/60">
                  <table className="rarity-section__table min-w-full border-separate border-spacing-0 divide-y divide-border/60 text-left">
                    <thead className="rarity-section__table-head bg-[#121218] text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      <tr>
                        <th className="rarity-section__column px-[3px] py-2.5 font-semibold">レアリティ</th>
                        <th className="rarity-section__column px-[3px] py-2.5 font-semibold">カラー</th>
                        <th className="rarity-section__column px-[3px] py-2.5 font-semibold">排出率</th>
                        <th className="rarity-section__column px-[3px] py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="rarity-section__table-body divide-y divide-border/40 bg-surface/60">
                      {rarityRows.map((rarity) => (
                        <tr key={rarity.id} className="rarity-section__row text-sm text-surface-foreground">
                          <td className="rarity-section__cell px-[3px] py-2">
                            <input
                              type="text"
                              value={rarity.label}
                              onChange={handleLabelChange(rarity.id)}
                              className="rarity-section__label-input w-full rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm text-surface-foreground transition focus:border-accent focus:outline-none"
                              aria-label={`${rarity.label || rarity.id} のレアリティ名`}
                              placeholder={rarity.label || rarity.id}
                            />
                          </td>
                          <td className="rarity-section__cell px-[3px] py-2">
                            <RarityColorPicker
                              value={rarity.color}
                              ariaLabel={`${rarity.label || rarity.id} のカラー`}
                              onChange={handleColorChange(rarity.id)}
                            />
                          </td>
                          <td className="rarity-section__cell px-[3px] py-2">
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
                          <td className="rarity-section__cell px-[3px] py-2 text-right">
                            <button
                              type="button"
                              className="rarity-section__delete-button inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                              onClick={() => console.info('レアリティ削除は未実装です', rarity.id)}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="rarity-section__add-row">
                        <td className="rarity-section__cell px-[3px] py-3" colSpan={4}>
                          <button
                            type="button"
                            className="rarity-section__add-button inline-flex w-full items-center justify-center rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-sm text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                            onClick={handleAddRarity}
                          >
                            追加
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
