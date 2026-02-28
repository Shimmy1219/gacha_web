import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useResponsiveDashboard } from '../../pages/gacha/components/dashboard/useResponsiveDashboard';
import { useModal } from '../../modals';
import { PageSettingsDialog } from '../../modals/dialogs/PageSettingsDialog';
import {
  buildPageSettingsDialogProps,
  type PageSettingsDialogOpenOptions,
  type PageSettingsDialogPayload,
  type PageSettingsFocusTargetKey,
  type PageSettingsHighlightMode,
  type PageSettingsMenuKey
} from '../../modals/dialogs/pageSettingsDialogConfig';

const VALID_MENU_KEYS = new Set<PageSettingsMenuKey>(['gacha', 'site-theme', 'layout', 'receive', 'misc']);
const VALID_FOCUS_TARGET_KEYS = new Set<PageSettingsFocusTargetKey>([
  'misc-owner-name',
  'gacha-owner-share-rate',
  'layout-site-zoom'
]);
const VALID_HIGHLIGHT_MODES = new Set<PageSettingsHighlightMode>(['pulse', 'persistent']);

/**
 * PageSettingsDialog の payload を /settings 用のクエリ文字列へ変換する。
 *
 * @param payload ページ設定の初期表示オプション
 * @returns /settings に付与する search 文字列
 */
export function buildSettingsSearch(payload?: PageSettingsDialogPayload): string {
  const params = new URLSearchParams();

  if (payload?.initialMenu && VALID_MENU_KEYS.has(payload.initialMenu)) {
    params.set('menu', payload.initialMenu);
  }
  if (payload?.focusTarget && VALID_FOCUS_TARGET_KEYS.has(payload.focusTarget)) {
    params.set('focus', payload.focusTarget);
  }
  if (payload?.highlightMode && VALID_HIGHLIGHT_MODES.has(payload.highlightMode)) {
    params.set('highlightMode', payload.highlightMode);
  }
  if (typeof payload?.highlightDurationMs === 'number' && Number.isFinite(payload.highlightDurationMs)) {
    params.set('highlightDurationMs', String(Math.round(payload.highlightDurationMs)));
  }
  if (typeof payload?.origin === 'string' && payload.origin.trim().length > 0) {
    params.set('origin', payload.origin.trim());
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/**
 * /settings のクエリ文字列から PageSettingsDialog payload を復元する。
 *
 * @param search location.search
 * @returns PageSettingsDialog へ渡せる payload（有効な値が無い場合は undefined）
 */
export function parseSettingsPayloadFromSearch(search: string): PageSettingsDialogPayload | undefined {
  const params = new URLSearchParams(search);
  const payload: PageSettingsDialogPayload = {};

  const initialMenu = params.get('menu');
  if (initialMenu && VALID_MENU_KEYS.has(initialMenu as PageSettingsMenuKey)) {
    payload.initialMenu = initialMenu as PageSettingsMenuKey;
  }

  const focusTarget = params.get('focus');
  if (focusTarget && VALID_FOCUS_TARGET_KEYS.has(focusTarget as PageSettingsFocusTargetKey)) {
    payload.focusTarget = focusTarget as PageSettingsFocusTargetKey;
  }

  const highlightMode = params.get('highlightMode');
  if (highlightMode && VALID_HIGHLIGHT_MODES.has(highlightMode as PageSettingsHighlightMode)) {
    payload.highlightMode = highlightMode as PageSettingsHighlightMode;
  }

  const highlightDurationRaw = params.get('highlightDurationMs');
  if (highlightDurationRaw) {
    const parsed = Number(highlightDurationRaw);
    if (Number.isFinite(parsed)) {
      payload.highlightDurationMs = Math.round(parsed);
    }
  }

  const origin = params.get('origin');
  if (origin && origin.trim().length > 0) {
    payload.origin = origin.trim();
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

/**
 * 端末種別に応じてサイト設定の開き方を切り替える。
 * PC はモーダル、モバイルは /settings ページへ遷移する。
 *
 * @returns サイト設定オープン関数
 */
export function useOpenPageSettings(): (options?: PageSettingsDialogOpenOptions) => void {
  const { isMobile } = useResponsiveDashboard();
  const navigate = useNavigate();
  const { push, dismissAll } = useModal();

  return useCallback(
    (options: PageSettingsDialogOpenOptions = {}) => {
      if (isMobile) {
        // モバイルでは重なったモーダルを閉じてからページ遷移し、スクロールロック残留を防ぐ。
        dismissAll();
        if (typeof document !== 'undefined') {
          // 稀にモーダル遷移直後にbodyのoverflowが残るため、ページ表示前に明示解除する。
          document.body.dataset.modalOpen = '0';
          document.body.style.removeProperty('overflow');
        }
        navigate({
          pathname: '/settings',
          search: buildSettingsSearch(options.payload)
        });
        return;
      }

      push(PageSettingsDialog, buildPageSettingsDialogProps(options));
    },
    [dismissAll, isMobile, navigate, push]
  );
}
