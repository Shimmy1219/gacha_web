const THEME_PREF_KEY = 'gacha_site_theme_pref_v1';
const DEFAULT_THEME = 'dark';
const root = document.documentElement;
const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let mediaListener = null;

function computeMode(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'system') {
    return mediaQuery && mediaQuery.matches ? 'dark' : 'light';
  }
  return 'dark';
}

function updateMetaThemeColor(mode) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const color = mode === 'light' ? '#f5f7fb' : '#0b0b0f';
  meta.setAttribute('content', color);
}

function setThemePreference(pref, { save = true } = {}) {
  const normalized = (pref === 'light' || pref === 'system') ? pref : 'dark';
  const mode = computeMode(normalized);
  root.setAttribute('data-theme', mode);
  root.setAttribute('data-theme-pref', normalized);
  updateMetaThemeColor(mode);
  if (save) {
    try {
      localStorage.setItem(THEME_PREF_KEY, normalized);
    } catch (e) {
      /* ignore */
    }
  }

  if (mediaQuery) {
    if (normalized === 'system') {
      if (!mediaListener) {
        mediaListener = () => setThemePreference('system', { save: false });
        mediaQuery.addEventListener('change', mediaListener);
      }
    } else if (mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener);
      mediaListener = null;
    }
  }

  document.dispatchEvent(new CustomEvent('theme:changed', {
    detail: { preference: normalized, mode }
  }));
}

function loadStoredPreference() {
  try {
    const stored = localStorage.getItem(THEME_PREF_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch (e) {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function syncThemeRadios(modal, pref) {
  modal.querySelectorAll('input[name="siteTheme"]').forEach((radio) => {
    radio.checked = radio.value === pref;
  });
}

function initThemeOptions(modal) {
  const radios = modal.querySelectorAll('input[name="siteTheme"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', (ev) => {
      if (!ev.target.checked) return;
      const value = ev.target.value;
      if (value === 'dark' || value === 'light' || value === 'system') {
        setThemePreference(value);
      }
    });
  });
}

function populateGachaList(modal) {
  const list = modal.querySelector('#settingsGachaList');
  if (!list) return;
  list.innerHTML = '';

  const services = window.Services || {};
  const app = services.app || services.appStateService || null;
  const raritySvc = services.rarity || services.rarityService || null;

  if (!app || typeof app.listGachas !== 'function') {
    const li = document.createElement('li');
    li.className = 'settings-gacha-empty muted';
    li.textContent = 'ガチャ情報を取得できませんでした。';
    list.appendChild(li);
    return;
  }

  let ids = [];
  try {
    ids = app.listGachas({ sort: true }) || [];
  } catch (e) {
    ids = [];
  }

  if (!ids.length) {
    const li = document.createElement('li');
    li.className = 'settings-gacha-empty muted';
    li.textContent = 'ガチャがまだ登録されていません。';
    list.appendChild(li);
    return;
  }

  const selectedId = app.getSelectedGacha?.() ?? (app.get?.()?.selected ?? null);

  ids.forEach((gachaId) => {
    const name = app.getDisplayName?.(gachaId) || gachaId;
    let count = null;
    if (typeof app.listItemsFromCatalog === 'function') {
      try {
        const items = app.listItemsFromCatalog(gachaId, { rarityService: raritySvc });
        if (Array.isArray(items)) {
          count = items.length;
        } else if (items && typeof items.length === 'number') {
          count = items.length;
        }
      } catch (e) {
        count = null;
      }
    }

    const li = document.createElement('li');
    li.className = 'settings-gacha-item';
    if (selectedId && selectedId === gachaId) {
      li.classList.add('is-active');
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'settings-gacha-name';
    nameEl.textContent = name;

    const idEl = document.createElement('span');
    idEl.className = 'settings-gacha-id';
    idEl.textContent = gachaId;

    li.appendChild(nameEl);
    li.appendChild(idEl);

    if (typeof count === 'number') {
      const countEl = document.createElement('span');
      countEl.className = 'settings-gacha-count';
      countEl.textContent = `${count}件`;
      li.appendChild(countEl);
    }

    list.appendChild(li);
  });
}

function setActiveView(modal, target) {
  const next = target || 'gacha';
  const navItems = modal.querySelectorAll('[data-settings-target]');
  const panels = modal.querySelectorAll('[data-settings-view]');
  navItems.forEach((btn) => {
    const isActive = btn.getAttribute('data-settings-target') === next;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  panels.forEach((panel) => {
    const active = panel.getAttribute('data-settings-view') === next;
    panel.classList.toggle('is-active', active);
    panel.setAttribute('aria-hidden', String(!active));
    panel.setAttribute('tabindex', active ? '0' : '-1');
  });
}

function initNavigation(modal) {
  const navItems = modal.querySelectorAll('[data-settings-target]');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveView(modal, btn.getAttribute('data-settings-target'));
    });
  });
}

function safeOpenModal(modal) {
  if (!modal) return;
  const opener = window.open;
  if (typeof opener === 'function' && /modalCount/.test(String(opener))) {
    opener(modal);
  } else {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
}

function safeCloseModal(modal) {
  if (!modal) return;
  const closer = window.close;
  if (typeof closer === 'function' && /modalCount/.test(String(closer))) {
    closer(modal);
  } else {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.show')) {
      document.body.classList.remove('modal-open');
    }
  }
}

function setupCloseHandlers(modal) {
  const closeBtn = modal.querySelector('[data-settings-close]');
  closeBtn?.addEventListener('click', () => safeCloseModal(modal));
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) {
      safeCloseModal(modal);
    }
  });
}

function initSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;

  initNavigation(modal);
  initThemeOptions(modal);
  setupCloseHandlers(modal);

  const pref = root.getAttribute('data-theme-pref') || loadStoredPreference();
  syncThemeRadios(modal, pref);
  setActiveView(modal, modal.querySelector('.settings-nav__item.is-active')?.getAttribute('data-settings-target') || 'gacha');

  window.showSettingsModal = () => {
    populateGachaList(modal);
    syncThemeRadios(modal, root.getAttribute('data-theme-pref') || DEFAULT_THEME);
    setActiveView(modal, modal.querySelector('.settings-nav__item.is-active')?.getAttribute('data-settings-target') || 'gacha');
    safeOpenModal(modal);
    const activeTab = modal.querySelector('.settings-nav__item.is-active');
    activeTab?.focus();
  };
}

const initialPref = root.getAttribute('data-theme-pref') || loadStoredPreference();
setThemePreference(initialPref, { save: false });

document.addEventListener('DOMContentLoaded', initSettingsModal);

export { setThemePreference };
