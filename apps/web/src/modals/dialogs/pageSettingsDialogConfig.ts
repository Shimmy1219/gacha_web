import { type ModalBaseProps } from '../ModalTypes';

export type PageSettingsMenuKey = 'gacha' | 'site-theme' | 'layout' | 'receive' | 'misc';

export type PageSettingsFocusTargetKey = 'misc-owner-name' | 'gacha-owner-share-rate' | 'layout-site-zoom';

export type PageSettingsHighlightMode = 'pulse' | 'persistent';

export interface PageSettingsDialogPayload {
  initialMenu?: PageSettingsMenuKey;
  focusTarget?: PageSettingsFocusTargetKey;
  highlightMode?: PageSettingsHighlightMode;
  highlightDurationMs?: number;
  origin?: string;
}

export interface PageSettingsDialogOpenOptions {
  id?: string;
  title?: string;
  description?: string;
  payload?: PageSettingsDialogPayload;
}

const DEFAULT_PAGE_SETTINGS_DIALOG_ID = 'page-settings';
const DEFAULT_PAGE_SETTINGS_DIALOG_TITLE = 'サイト設定';
const DEFAULT_PAGE_SETTINGS_DIALOG_DESCRIPTION = 'ガチャ一覧の表示方法やサイトカラーをカスタマイズできます。';
const DEFAULT_PAGE_SETTINGS_DIALOG_PANEL_CLASS_NAME = 'page-settings-modal overflow-hidden';
const DEFAULT_PAGE_SETTINGS_DIALOG_PANEL_PADDING_CLASS_NAME = 'p-2 lg:p-6';

/**
 * サイト設定モーダルを標準レイアウトで開くためのpropsを生成する。
 *
 * @param options モーダルタイトルや初期フォーカスなどの任意設定
 * @returns PageSettingsDialogへ渡せる共通のモーダルprops
 */
export function buildPageSettingsDialogProps(
  options: PageSettingsDialogOpenOptions = {}
): ModalBaseProps<PageSettingsDialogPayload> {
  return {
    id: options.id ?? DEFAULT_PAGE_SETTINGS_DIALOG_ID,
    title: options.title ?? DEFAULT_PAGE_SETTINGS_DIALOG_TITLE,
    description: options.description ?? DEFAULT_PAGE_SETTINGS_DIALOG_DESCRIPTION,
    size: 'xl',
    panelClassName: DEFAULT_PAGE_SETTINGS_DIALOG_PANEL_CLASS_NAME,
    panelPaddingClassName: DEFAULT_PAGE_SETTINGS_DIALOG_PANEL_PADDING_CLASS_NAME,
    showHeaderCloseButton: true,
    payload: options.payload
  };
}
