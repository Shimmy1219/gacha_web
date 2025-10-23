import { useMemo, useState } from 'react';
import { RadioGroup } from '@headlessui/react';
import { clsx } from 'clsx';

import { SwitchField } from '../../components/form/SwitchField';
import { useSiteTheme } from '../../features/theme/SiteThemeProvider';
import { ModalBody } from '../ModalComponents';
import { type ModalComponent } from '../ModalTypes';

interface MenuItem {
  id: SettingsMenuKey;
  label: string;
  description: string;
}

type SettingsMenuKey = 'gacha' | 'site-theme' | 'misc';

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'gacha',
    label: 'ガチャ一覧',
    description: '一覧ページの並べ替えや表示項目を調整します。'
  },
  {
    id: 'site-theme',
    label: 'サイトカラー',
    description: '背景とアクセントカラーのテーマを切り替えます。'
  },
  {
    id: 'misc',
    label: 'その他の設定',
    description: '通知やガイドの表示方法をカスタマイズします。'
  }
];

export const PageSettingsDialog: ModalComponent = () => {
  const [activeMenu, setActiveMenu] = useState<SettingsMenuKey>('site-theme');
  const [showArchived, setShowArchived] = useState(true);
  const [groupBySeries, setGroupBySeries] = useState(false);
  const [showBetaTips, setShowBetaTips] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(true);
  const { theme, setTheme, options } = useSiteTheme();

  const menuItems = useMemo(() => MENU_ITEMS, []);

  const renderMenuContent = () => {
    switch (activeMenu) {
      case 'gacha':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">ガチャ一覧の表示</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                並べ替えや表示ルールを変更すると、ガチャ管理ページに即時反映されます。
              </p>
            </div>
            <div className="space-y-3">
              <SwitchField
                label="アーカイブ済みのガチャをリストに表示"
                description="過去に終了したガチャも一覧から確認できるようにします。"
                checked={showArchived}
                onChange={setShowArchived}
              />
              <SwitchField
                label="シリーズ別にカードをグループ化"
                description="同じシリーズのガチャをまとめて表示し、カテゴリ見出しを追加します。"
                checked={groupBySeries}
                onChange={setGroupBySeries}
              />
            </div>
          </div>
        );
      case 'site-theme':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">サイトカラー</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                背景とアクセントカラーを切り替えて、配信や共有に合わせた雰囲気に調整できます。
              </p>
            </div>
            <RadioGroup value={theme} onChange={setTheme} className="space-y-3">
              {options.map((option) => (
                <RadioGroup.Option
                  key={option.id}
                  value={option.id}
                  className={({ checked, active }) =>
                    clsx(
                      'flex items-start justify-between gap-4 rounded-2xl border px-4 py-4 transition',
                      checked
                        ? 'border-accent bg-accent/10 shadow-[0_14px_38px_rgba(225,29,72,0.12)]'
                        : 'border-border/60 bg-surface/30 hover:border-accent/40 hover:bg-surface/40',
                      active && !checked ? 'ring-2 ring-accent/40' : undefined
                    )
                  }
                >
                  {({ checked }) => (
                    <>
                      <div className="space-y-1.5">
                        <RadioGroup.Label className="text-sm font-semibold text-surface-foreground">
                          {option.label}
                        </RadioGroup.Label>
                        <RadioGroup.Description className="text-xs text-muted-foreground">
                          {option.description}
                        </RadioGroup.Description>
                        {checked ? (
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                            適用中
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {option.swatch.map((color, index) => (
                          <span
                            key={`${option.id}-${index}`}
                            className="h-10 w-10 rounded-xl border border-border/40 shadow-inner"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </>
                  )}
                </RadioGroup.Option>
              ))}
            </RadioGroup>
          </div>
        );
      case 'misc':
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">その他の設定</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ガイドやセキュリティに関する動作を切り替えできます。変更内容はすぐに適用されます。
              </p>
            </div>
            <div className="space-y-3">
              <SwitchField
                label="最新機能のヒントを表示"
                description="開発中の機能やリリースノートをダッシュボード上で通知します。"
                checked={showBetaTips}
                onChange={setShowBetaTips}
              />
              <SwitchField
                label="ログアウト前に確認ダイアログを表示"
                description="誤操作を防ぐため、ログアウト前に確認メッセージを表示します。"
                checked={confirmLogout}
                onChange={setConfirmLogout}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <ModalBody className="mt-6 space-y-0">
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="w-full max-w-[220px] shrink-0">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveMenu(item.id)}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition',
                      isActive
                        ? 'border-accent bg-accent/10 text-surface-foreground shadow-[0_12px_36px_rgba(225,29,72,0.16)]'
                        : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-surface/20'
                    )}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex-1 rounded-2xl border border-border/60 bg-surface/20 p-6">
          {renderMenuContent()}
        </div>
      </div>
    </ModalBody>
  );
};
