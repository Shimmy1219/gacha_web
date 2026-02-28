import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { loadAsset } from '@domain/assets/assetStorage';
import type { ReceiveMediaItem } from '../../pages/receive/types';

const SCALE_MIN = 0.6;
const SCALE_MAX = 2.4;
const OFFSET_RATIO_MIN = -1;
const OFFSET_RATIO_MAX = 1;
const WHEEL_SCALE_SENSITIVITY = 0.0015;
const MIN_PINCH_DISTANCE_PX = 8;

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
 * @property initialTransform 初期表示時に適用する調節値。
 * @property onSave ユーザーが保存を押した時に呼ばれるコールバック。
 */
export interface IconRingAdjustDialogPayload {
  ringItem: ReceiveMediaItem;
  iconAssetId: string;
  initialTransform: IconRingAdjustResult;
  onSave: (nextTransform: IconRingAdjustResult) => void;
}

interface PointerSnapshot {
  x: number;
  y: number;
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

interface PinchState {
  pointerIdA: number;
  pointerIdB: number;
  startDistance: number;
  startScale: number;
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

function resolveDistance(pointerA: PointerSnapshot, pointerB: PointerSnapshot): number {
  return Math.hypot(pointerA.x - pointerB.x, pointerA.y - pointerB.y);
}

/**
 * 責務: アイコンリングを固定表示したまま、アイコン画像の拡大・縮小・移動を調節して親モーダルへ保存する。
 *
 * @param props モーダルの基本プロパティと、調節対象のリング・アイコン情報。
 * @returns アイコン調節モーダル。
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

  const stageRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<IconRingAdjustResult>(transform);
  const pointersRef = useRef<Map<number, PointerSnapshot>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

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
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;

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
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
    };
  }, [payload?.iconAssetId, payload?.ringItem]);

  const updateTransform = useCallback((updater: (current: IconRingAdjustResult) => IconRingAdjustResult) => {
    setTransform((current) => normalizeTransform(updater(current)));
  }, []);

  const startDrag = useCallback((pointerId: number, point: PointerSnapshot) => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const rect = stageElement.getBoundingClientRect();
    const currentTransform = transformRef.current;
    dragRef.current = {
      pointerId,
      startX: point.x,
      startY: point.y,
      startOffsetXRatio: currentTransform.offsetXRatio,
      startOffsetYRatio: currentTransform.offsetYRatio,
      previewWidth: rect.width,
      previewHeight: rect.height
    };
    pinchRef.current = null;
  }, []);

  const startPinch = useCallback((pointerIdA: number, pointerIdB: number) => {
    const pointerA = pointersRef.current.get(pointerIdA);
    const pointerB = pointersRef.current.get(pointerIdB);
    if (!pointerA || !pointerB) {
      return;
    }

    const startDistance = Math.max(resolveDistance(pointerA, pointerB), MIN_PINCH_DISTANCE_PX);
    pinchRef.current = {
      pointerIdA,
      pointerIdB,
      startDistance,
      startScale: transformRef.current.scale
    };
    dragRef.current = null;
  }, []);

  const reconcileGestureMode = useCallback(() => {
    const pointerIds = Array.from(pointersRef.current.keys());

    if (pointerIds.length >= 2) {
      startPinch(pointerIds[0], pointerIds[1]);
      return;
    }

    if (pointerIds.length === 1) {
      const pointerId = pointerIds[0];
      const pointer = pointersRef.current.get(pointerId);
      if (!pointer) {
        dragRef.current = null;
        pinchRef.current = null;
        return;
      }
      startDrag(pointerId, pointer);
      return;
    }

    dragRef.current = null;
    pinchRef.current = null;
  }, [startDrag, startPinch]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isLoading || error) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      reconcileGestureMode();
    },
    [error, isLoading, reconcileGestureMode]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) {
        return;
      }

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const pinchState = pinchRef.current;
      if (pinchState && pointersRef.current.size >= 2) {
        const pointerA = pointersRef.current.get(pinchState.pointerIdA);
        const pointerB = pointersRef.current.get(pinchState.pointerIdB);
        if (!pointerA || !pointerB) {
          reconcileGestureMode();
          return;
        }

        const currentDistance = Math.max(resolveDistance(pointerA, pointerB), MIN_PINCH_DISTANCE_PX);
        const distanceRatio = currentDistance / pinchState.startDistance;
        updateTransform((current) => ({ ...current, scale: pinchState.startScale * distanceRatio }));
        return;
      }

      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaXRatio = dragState.previewWidth > 0 ? (event.clientX - dragState.startX) / dragState.previewWidth : 0;
      const deltaYRatio =
        dragState.previewHeight > 0 ? (event.clientY - dragState.startY) / dragState.previewHeight : 0;

      updateTransform((current) => ({
        ...current,
        offsetXRatio: dragState.startOffsetXRatio + deltaXRatio,
        offsetYRatio: dragState.startOffsetYRatio + deltaYRatio
      }));
    },
    [reconcileGestureMode, updateTransform]
  );

  const handlePointerUpOrCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      pointersRef.current.delete(event.pointerId);
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
      if (pinchRef.current?.pointerIdA === event.pointerId || pinchRef.current?.pointerIdB === event.pointerId) {
        pinchRef.current = null;
      }
      reconcileGestureMode();
    },
    [reconcileGestureMode]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (isLoading || error) {
        return;
      }
      event.preventDefault();
      const nextScaleDelta = -event.deltaY * WHEEL_SCALE_SENSITIVITY;
      updateTransform((current) => ({ ...current, scale: current.scale + nextScaleDelta }));
    },
    [error, isLoading, updateTransform]
  );

  const handleReset = useCallback(() => {
    const resetTransform: IconRingAdjustResult = {
      scale: 1,
      offsetXRatio: 0,
      offsetYRatio: 0
    };
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    transformRef.current = resetTransform;
    setTransform(resetTransform);
  }, []);

  const handleSave = useCallback(() => {
    if (!payload?.onSave) {
      return;
    }
    payload.onSave(transformRef.current);
    close();
  }, [close, payload]);

  return (
    <>
      <ModalBody className="icon-ring-adjust-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
        <div className="icon-ring-adjust-dialog__content space-y-5">
          <div className="icon-ring-adjust-dialog__preview-block rounded-2xl border border-border/60 bg-panel-muted/40 p-3 sm:p-4">
            <div className="icon-ring-adjust-dialog__preview-actions mb-3 flex justify-end">
              <button
                type="button"
                className="icon-ring-adjust-dialog__reset-button btn btn-muted h-7 px-2 text-[11px]"
                onClick={handleReset}
                disabled={isLoading || Boolean(error)}
              >
                リセット
              </button>
            </div>

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
                ref={stageRef}
                className="icon-ring-adjust-dialog__preview-stage relative mx-auto aspect-square w-full max-w-[340px] cursor-grab overflow-hidden rounded-2xl border border-border/60 bg-white shadow-inner active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUpOrCancel}
                onPointerCancel={handlePointerUpOrCancel}
                onWheel={handleWheel}
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
              </div>
            ) : null}
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
          確定
        </button>
      </ModalFooter>
    </>
  );
}
