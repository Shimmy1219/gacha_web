import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityColorPicker } from './color-picker/RarityColorPicker';

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

export function RaritySection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const [draftColors, setDraftColors] = useState<Record<string, string>>({});
  const lastSyncedLabelsRef = useRef<Record<string, string>>({});
  const lastSyncedColorsRef = useRef<Record<string, string>>({});

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

  useEffect(() => {
    const syncedLabels: Record<string, string> = {};
    setDraftLabels((prev) => {
      const next: Record<string, string> = {};
      rarityRows.forEach((row) => {
        const previousSynced = lastSyncedLabelsRef.current[row.id];
        const previousDraft = prev[row.id];
        const hasUserEdited = previousDraft != null && previousSynced != null && previousDraft !== previousSynced;
        const nextValue = hasUserEdited ? previousDraft : row.label;
        next[row.id] = nextValue;
        syncedLabels[row.id] = row.label;
      });
      return next;
    });
    lastSyncedLabelsRef.current = syncedLabels;
  }, [rarityRows]);

  useEffect(() => {
    const syncedColors: Record<string, string> = {};
    setDraftColors((prev) => {
      const next: Record<string, string> = {};
      rarityRows.forEach((row) => {
        const previousSynced = lastSyncedColorsRef.current[row.id];
        const previousDraft = prev[row.id];
        const hasUserEdited = previousDraft != null && previousSynced != null && previousDraft !== previousSynced;
        const nextValue = hasUserEdited ? previousDraft : row.color;
        next[row.id] = nextValue;
        syncedColors[row.id] = row.color;
      });
      return next;
    });
    lastSyncedColorsRef.current = syncedColors;
  }, [rarityRows]);

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
                  {rarityRows.map((rarity) => {
                    const labelValue = draftLabels[rarity.id] ?? rarity.label;
                    const colorValue = draftColors[rarity.id] ?? rarity.color;
                    return (
                      <tr key={rarity.id} className="rarity-section__row text-sm text-surface-foreground">
                        <td className="rarity-section__cell px-[3px] py-2">
                          <input
                            type="text"
                            value={labelValue}
                            onChange={(event) =>
                              setDraftLabels((prev) => ({ ...prev, [rarity.id]: event.target.value }))
                            }
                            className="rarity-section__label-input w-full rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm text-surface-foreground transition focus:border-accent focus:outline-none"
                            aria-label={`${rarity.label} のレアリティ名`}
                            placeholder={rarity.label}
                          />
                        </td>
                        <td className="rarity-section__cell px-[3px] py-2">
                          <RarityColorPicker
                            value={colorValue}
                            ariaLabel={`${labelValue || rarity.label} のカラー`}
                            onChange={(next) =>
                              setDraftColors((prev) => ({
                                ...prev,
                                [rarity.id]: next
                              }))
                            }
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
