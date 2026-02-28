import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { loadAsset } from '@domain/assets/assetStorage';
import type { ReceiveMediaItem } from '../../pages/receive/types';

const SCALE_MIN = 0.6;
const SCALE_MAX = 2.4;
const SCALE_STEP = 0.01;
const SCALE_BUTTON_STEP = 0.1;
const MOVE_NUDGE_STEP = 0.02;
const OFFSET_RATIO_MIN = -1;
const OFFSET_RATIO_MAX = 1;

/**
 * アイコンリング装着時に適用する、アイコン側の調整情報。
 * `scale` はカバー描画を基準にした倍率、`offset*Ratio` はリング全体に対する相対移動量。
 */
export interface IconRingAdjustResult {
  scale: number;
  offsetXRatio: number;
  offsetYRatio: number;
}

/**
 * `IconRingAdjustDialog` の受け渡しデータ。
 *
 * @property ringItem 合成先となるアイコンリング画像。
 * @property iconAssetId 調節対象の登録アイコンID。
 * @property iconLabel 対象アイコンの表示ラベル。
 * @property initialTransform 初期表示時に適用する調節値。
 * @property onSave ユーザーが保存を押した時に呼ばれるコールバック。
 */
export interface IconRingAdjustDialogPayload {
  ringItem: ReceiveMediaItem;
  iconAssetId: string;
  iconLabel: string;
  initialTransform: IconRingAdjustResult;
  onSave: (nextTransform: IconRingAdjustResult) => void;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeTransform(transform: Partial<IconRingAdjustResult> | null | undefined): IconRingAdjustResult {
  return {
    scale: clampNumber(transform?.scale ?? 1, SCALE_MIN, SCALE_MAX),
    offsetXRatio: clampNumber(transform?.offsetXRatio ?? 0, OFFSET_RATIO_MIN, OFFSET_RATIO_MAX),
    offsetYRatio: clampNumber(transform?.offsetYRatio ?? 0, OFFSET_RATIO_MIN, OFFSET_RATIO_MAX)
  };
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetXRatio: number;
  startOffsetYRatio: number;
  previewWidth: number;
  previewHeight: number;
}

/**
 * 責務: アイコンリングを固定表示したまま、アイコン画像の拡大・縮小・移動を調節して親モーダルへ保存する。
 */
export function IconRingAdjustDialog({
  payload,
  close
}: ModalComponentProps<IconRingAdjustDialogPayload>): JSX.Element {
  const [transform, setTransform] = useState<IconRingAdjustResult>(() => normalizeTransform(payload?.initialTransform));
  const [ringPreviewUrl, setRingPreviewUrl] = useState<string | null>(null);
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const scalePercent = useMemo(() => Math.round(transform.scale * 100), [transform.scale]);

  // 親モーダルから渡される初期調節値が変化した時だけ、編集中の値を同期する。
  // 依存配列には各プリミティブ値を並べ、不要な再初期化を避ける。
  useEffect(() => {
    setTransform(normalizeTransform(payload?.initialTransform));
  }, [
    payload?.initialTransform?.offsetXRatio,
    payload?.initialTransform?.offsetYRatio,
    payload?.initialTransform?.scale
  ]);

  // 調節プレビューに必要なリング画像と登録アイコン画像を読み込む。
  // 依存配列は ringItem と iconAssetId のみとし、対象が変わった時だけ再取得する。
  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    const loadPreviewAssets = async () => {
      setIsLoading(true);
      setError(null);
      setRingPreviewUrl(null);
      setIconPreviewUrl(null);

      try {
        // 成功時: リング画像とアイコン画像の双方を object URL 化してプレビューへ反映する。
        if (!payload?.ringItem || payload.ringItem.kind !== 'image') {
          throw new Error('アイコンリング画像が見つかりません。');
        }

        const ringUrl = URL.createObjectURL(payload.ringItem.blob);
        createdUrls.push(ringUrl);

        const iconAsset = await loadAsset(payload.iconAssetId);
        if (!iconAsset?.blob) {
          throw new Error('調節対象のアイコン画像を読み込めませんでした。');
        }

        const iconUrl = URL.createObjectURL(iconAsset.blob);
        createdUrls.push(iconUrl);

        if (!active) {
          return;
        }

        setRingPreviewUrl(ringUrl);
        setIconPreviewUrl(iconUrl);
        setIsLoading(false);
      } catch (loadError) {
        // 失敗時: ユーザーに再試行可能なエラーメッセージを表示する。
        console.error('Failed to load icon ring adjust preview assets', loadError);
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'プレビューの読み込みに失敗しました。');
        setIsLoading(false);
      }
    };

    void loadPreviewAssets();

    return () => {
      // 後処理: 生成済み object URL を解放し、メモリリークを防止する。
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [payload?.iconAssetId, payload?.ringItem]);

  const updateTransform = useCallback((updater: (current: IconRingAdjustResult) => IconRingAdjustResult) => {
    setTransform((current) => normalizeTransform(updater(current)));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isLoading || error) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetXRatio: transform.offsetXRatio,
        startOffsetYRatio: transform.offsetYRatio,
        previewWidth: rect.width,
        previewHeight: rect.height
      };

      target.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [error, isLoading, transform.offsetXRatio, transform.offsetYRatio]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaXRatio = dragState.previewWidth > 0 ? (event.clientX - dragState.startX) / dragState.previewWidth : 0;
      const deltaYRatio =
        dragState.previewHeight > 0 ? (event.clientY - dragState.startY) / dragState.previewHeight : 0;

      updateTransform(() => ({
        scale: transform.scale,
        offsetXRatio: dragState.startOffsetXRatio + deltaXRatio,
        offsetYRatio: dragState.startOffsetYRatio + deltaYRatio
      }));
    },
    [transform.scale, updateTransform]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endDrag();
    },
    [endDrag]
  );

  const handleScaleSliderChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextScale = Number.parseFloat(event.currentTarget.value);
      updateTransform((current) => ({ ...current, scale: nextScale }));
    },
    [updateTransform]
  );

  const handleScaleByStep = useCallback(
    (delta: number) => {
      updateTransform((current) => ({ ...current, scale: current.scale + delta }));
    },
    [updateTransform]
  );

  const handleMoveByStep = useCallback(
    (deltaXRatio: number, deltaYRatio: number) => {
      updateTransform((current) => ({
        ...current,
        offsetXRatio: current.offsetXRatio + deltaXRatio,
        offsetYRatio: current.offsetYRatio + deltaYRatio
      }));
    },
    [updateTransform]
  );

  const handleReset = useCallback(() => {
    setTransform({ scale: 1, offsetXRatio: 0, offsetYRatio: 0 });
  }, []);

  const handleSave = useCallback(() => {
    if (!payload?.onSave) {
      return;
    }
    payload.onSave(transform);
    close();
  }, [close, payload, transform]);

  return (
    <>
      <ModalBody className="icon-ring-adjust-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
        <div className="icon-ring-adjust-dialog__content space-y-5">
          <p className="icon-ring-adjust-dialog__guide-text text-sm text-muted-foreground">
            ドラッグで位置調整し、必要に応じてサイズと微調整ボタンを使ってください。
          </p>
          <p className="icon-ring-adjust-dialog__target-text text-xs text-muted-foreground">
            対象: <span className="icon-ring-adjust-dialog__target-label font-semibold text-surface-foreground">{payload?.iconLabel ?? '登録アイコン'}</span>
          </p>

          <div className="icon-ring-adjust-dialog__preview-block rounded-2xl border border-border/60 bg-panel-muted/40 p-3 sm:p-4">
            {isLoading ? (
              <div className="icon-ring-adjust-dialog__loading-message flex items-center justify-center rounded-xl border border-border/60 bg-surface/40 px-4 py-8 text-sm text-muted-foreground">
                プレビューを読み込み中です…
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="icon-ring-adjust-dialog__error-message rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                {error}
              </div>
            ) : null}

            {!isLoading && !error && ringPreviewUrl && iconPreviewUrl ? (
              <div
                className="icon-ring-adjust-dialog__preview-stage relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-2xl border border-border/60 bg-surface/20 shadow-inner"
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={endDrag}
                onPointerLeave={(event) => {
                  const dragState = dragRef.current;
                  if (dragState && dragState.pointerId === event.pointerId && event.pointerType === 'mouse') {
                    handlePointerUp(event);
                  }
                }}
              >
                <img
                  src={iconPreviewUrl}
                  alt="調節中のアイコン"
                  className="icon-ring-adjust-dialog__preview-icon absolute inset-0 h-full w-full object-cover"
                  style={{
                    transform: `translate(${transform.offsetXRatio * 100}%, ${transform.offsetYRatio * 100}%) scale(${transform.scale})`
                  }}
                />
                <img
                  src={ringPreviewUrl}
                  alt="アイコンリング"
                  className="icon-ring-adjust-dialog__preview-ring pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                />
                {isDragging ? (
                  <div className="icon-ring-adjust-dialog__drag-indicator pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/55 px-2 py-1 text-center text-xs text-white">
                    ドラッグ中
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="icon-ring-adjust-dialog__control-panel space-y-4 rounded-2xl border border-border/60 bg-surface/30 p-4">
            <div className="icon-ring-adjust-dialog__scale-control space-y-3">
              <div className="icon-ring-adjust-dialog__scale-header flex items-center justify-between gap-3">
                <label htmlFor="icon-ring-adjust-scale-slider" className="icon-ring-adjust-dialog__scale-label text-sm font-semibold text-surface-foreground">
                  サイズ
                </label>
                <span className="icon-ring-adjust-dialog__scale-value rounded-full border border-border/50 bg-panel px-2 py-0.5 text-xs font-semibold text-surface-foreground">
                  {scalePercent}%
                </span>
              </div>
              <div className="icon-ring-adjust-dialog__scale-row flex items-center gap-2">
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__scale-down-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleScaleByStep(-SCALE_BUTTON_STEP);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="アイコンを縮小"
                >
                  <MinusIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  id="icon-ring-adjust-scale-slider"
                  className="icon-ring-adjust-dialog__scale-slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-panel-contrast accent-accent"
                  type="range"
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={SCALE_STEP}
                  value={transform.scale}
                  onChange={handleScaleSliderChange}
                  disabled={isLoading || Boolean(error)}
                />
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__scale-up-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleScaleByStep(SCALE_BUTTON_STEP);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="アイコンを拡大"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="icon-ring-adjust-dialog__move-control space-y-3">
              <p className="icon-ring-adjust-dialog__move-title text-sm font-semibold text-surface-foreground">移動</p>
              <div className="icon-ring-adjust-dialog__move-grid mx-auto grid max-w-[180px] grid-cols-3 gap-2">
                <div className="icon-ring-adjust-dialog__move-spacer-top-left" />
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__move-up-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleMoveByStep(0, -MOVE_NUDGE_STEP);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="上に移動"
                >
                  <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="icon-ring-adjust-dialog__move-spacer-top-right" />
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__move-left-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleMoveByStep(-MOVE_NUDGE_STEP, 0);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="左に移動"
                >
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__reset-button btn btn-muted h-10 px-2 text-xs"
                  onClick={handleReset}
                  disabled={isLoading || Boolean(error)}
                >
                  中央
                </button>
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__move-right-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleMoveByStep(MOVE_NUDGE_STEP, 0);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="右に移動"
                >
                  <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="icon-ring-adjust-dialog__move-spacer-bottom-left" />
                <button
                  type="button"
                  className="icon-ring-adjust-dialog__move-down-button btn btn-muted inline-flex h-10 w-10 items-center justify-center p-0"
                  onClick={() => {
                    handleMoveByStep(0, MOVE_NUDGE_STEP);
                  }}
                  disabled={isLoading || Boolean(error)}
                  aria-label="下に移動"
                >
                  <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="icon-ring-adjust-dialog__move-spacer-bottom-right" />
              </div>
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter className="icon-ring-adjust-dialog__footer">
        <button type="button" className="icon-ring-adjust-dialog__cancel-button btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button
          type="button"
          className="icon-ring-adjust-dialog__save-button btn btn-primary"
          onClick={handleSave}
          disabled={isLoading || Boolean(error)}
        >
          保存
        </button>
      </ModalFooter>
    </>
  );
}
