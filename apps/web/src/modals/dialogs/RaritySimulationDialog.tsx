import { useEffect, useMemo, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { RarityLabel } from '../../components/RarityLabel';
import {
  simulateRarityProbabilities,
  type RaritySimulationInput
} from '../../features/rarity/utils/raritySimulation';
import { formatRarityRate } from '../../features/rarity/utils/rarityRate';

export interface RaritySimulationDialogPayload {
  rarities: RaritySimulationInput[];
  defaultDrawCount?: number;
  defaultTargetCount?: number;
}

const DEFAULT_DRAW_COUNT = 10;
const DEFAULT_TARGET_COUNT = 1;
const MAX_DRAW_COUNT = 100000;

function sanitizeDrawCount(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_DRAW_COUNT;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_DRAW_COUNT);
}

function sanitizeTargetCount(value: number, drawCount: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_TARGET_COUNT;
  }
  return Math.min(Math.max(Math.floor(value), 0), drawCount);
}

function formatPercent(rate: number): string {
  return `${formatRarityRate(rate)}%`;
}

export function RaritySimulationDialog({
  payload,
  close
}: ModalComponentProps<RaritySimulationDialogPayload>): JSX.Element {
  const baseRarities = payload?.rarities ?? [];
  const [drawCount, setDrawCount] = useState(() => sanitizeDrawCount(payload?.defaultDrawCount ?? DEFAULT_DRAW_COUNT));
  const [targetCount, setTargetCount] = useState(() =>
    sanitizeTargetCount(payload?.defaultTargetCount ?? DEFAULT_TARGET_COUNT, drawCount)
  );

  useEffect(() => {
    setTargetCount((current) => sanitizeTargetCount(current, drawCount));
  }, [drawCount]);

  const simulatedRows = useMemo(
    () =>
      simulateRarityProbabilities({
        rarities: baseRarities,
        drawCount,
        targetCount
      }),
    [baseRarities, drawCount, targetCount]
  );

  return (
    <>
      <ModalBody className="rarity-simulation-dialog__body space-y-5">
        <div className="rarity-simulation-dialog__overview rounded-2xl border border-border/60 bg-panel-muted px-4 py-3 text-sm text-muted-foreground">
          <p className="rarity-simulation-dialog__overview-text">
            現在のレアリティ排出率を使って、連数ごとの「指定個数以上出る確率」を表示します。
          </p>
        </div>

        <div className="rarity-simulation-dialog__controls grid gap-3 md:grid-cols-2">
          <label
            className="rarity-simulation-dialog__control rarity-simulation-dialog__control--draw flex flex-col gap-2 rounded-2xl border border-border/60 bg-panel-contrast px-4 py-3"
            htmlFor="rarity-simulation-draw-count-input"
          >
            <span className="rarity-simulation-dialog__control-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              連数
            </span>
            <input
              id="rarity-simulation-draw-count-input"
              className="rarity-simulation-dialog__control-input w-full rounded-xl border border-border/70 bg-panel px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              type="number"
              min={1}
              max={MAX_DRAW_COUNT}
              step={1}
              value={drawCount}
              onChange={(event) => setDrawCount(sanitizeDrawCount(Number(event.target.value)))}
            />
          </label>

          <label
            className="rarity-simulation-dialog__control rarity-simulation-dialog__control--target flex flex-col gap-2 rounded-2xl border border-border/60 bg-panel-contrast px-4 py-3"
            htmlFor="rarity-simulation-target-count-input"
          >
            <span className="rarity-simulation-dialog__control-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              同時に出る個数
            </span>
            <input
              id="rarity-simulation-target-count-input"
              className="rarity-simulation-dialog__control-input w-full rounded-xl border border-border/70 bg-panel px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              type="number"
              min={0}
              max={drawCount}
              step={1}
              value={targetCount}
              onChange={(event) => setTargetCount(sanitizeTargetCount(Number(event.target.value), drawCount))}
            />
          </label>
        </div>

        <div className="rarity-simulation-dialog__table-wrapper overflow-x-auto rounded-2xl border border-border/60 bg-panel">
          <table className="rarity-simulation-dialog__table w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead className="rarity-simulation-dialog__table-head bg-panel-contrast/90 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <tr className="rarity-simulation-dialog__table-head-row">
                <th className="rarity-simulation-dialog__table-head-cell rarity-simulation-dialog__table-head-cell--label px-4 py-3 text-left font-semibold">
                  レアリティ
                </th>
                <th className="rarity-simulation-dialog__table-head-cell rarity-simulation-dialog__table-head-cell--base px-4 py-3 text-right font-semibold">
                  単発排出率
                </th>
                <th className="rarity-simulation-dialog__table-head-cell rarity-simulation-dialog__table-head-cell--exact px-4 py-3 text-right font-semibold">
                  {drawCount}連で{targetCount}個以上
                </th>
              </tr>
            </thead>
            <tbody className="rarity-simulation-dialog__table-body divide-y divide-border/40 bg-panel-muted">
              {simulatedRows.map((row) => (
                <tr key={row.id} className="rarity-simulation-dialog__table-row">
                  <td className="rarity-simulation-dialog__table-cell rarity-simulation-dialog__table-cell--label px-4 py-3 text-left text-surface-foreground">
                    <RarityLabel
                      label={row.label || row.id}
                      color={row.color}
                      className="rarity-simulation-dialog__rarity-label-text font-medium"
                    />
                  </td>
                  <td className="rarity-simulation-dialog__table-cell rarity-simulation-dialog__table-cell--base px-4 py-3 text-right text-muted-foreground">
                    {formatPercent(row.emitRate)}
                  </td>
                  <td className="rarity-simulation-dialog__table-cell rarity-simulation-dialog__table-cell--exact px-4 py-3 text-right text-surface-foreground">
                    {formatPercent(row.atLeastCountRate)}
                  </td>
                </tr>
              ))}
              {simulatedRows.length === 0 ? (
                <tr className="rarity-simulation-dialog__table-row rarity-simulation-dialog__table-row--empty">
                  <td
                    className="rarity-simulation-dialog__table-cell rarity-simulation-dialog__table-cell--empty px-4 py-6 text-center text-sm text-muted-foreground"
                    colSpan={3}
                  >
                    シミュレーション対象のレアリティがありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ModalBody>

      <ModalFooter>
        <button type="button" className="rarity-simulation-dialog__close-button btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
