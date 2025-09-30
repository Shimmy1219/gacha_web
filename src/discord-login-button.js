// 何もしない“見た目だけ”のレンダラ → ログイン/ログアウトの挙動を追加
export function renderDiscordLoginButton({
  mount,
  loggedIn = false,
  username = "",
  avatarUrl = ""
} = {}) {
  if (!mount) return;
  mount.innerHTML = ""; // 再描画に備えてクリア

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btnDiscordLogin";
  btn.className = loggedIn ? "btn dlb black" : "btn dlb discord";
  btn.setAttribute("aria-label", loggedIn ? `Discord: ${username}` : "Discordでログイン");

  // 未ログイン：テキストのみ
  if (!loggedIn) {
    btn.textContent = "Discordでログイン";
  } else {
    // ログイン済：丸アイコン + ユーザー名
    const wrap = document.createElement("span");
    wrap.className = "dlb-inner";

    if (avatarUrl) {
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "";
      img.className = "dlb-avatar";
      wrap.appendChild(img);
    } else {
      // アバターが無い場合はDiscord風の丸プレースホルダ（無地）
      const ph = document.createElement("span");
      ph.className = "dlb-avatar dlb-avatar--placeholder";
      wrap.appendChild(ph);
    }

    const name = document.createElement("span");
    name.className = "dlb-username";
    name.textContent = username || "Discord User";
    wrap.appendChild(name);

    btn.appendChild(wrap);
  }

  // ====== イベントハンドラ（安全実装） ======
  // 未ログイン → 認可開始（PKCE/state はサーバ側で扱う）
  const startDiscordLogin = () => {
    // 多重クリック防止 & 視覚的フィードバック
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      // セキュリティ：
      // - 外部Urlの混入やオープンリダイレクトを防ぐため固定パスに同タブ遷移
      // - stateはHttpOnlyクッキーで往復するためフロントから付与しない
      window.location.assign("/api/auth/discord/start");
    } catch (e) {
      // 失敗時は復帰
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      console.error(e);
    }
  };

  // ログイン済 → 簡易メニュー（ログアウト）
  const openLoggedInMenu = () => {
    // 既にあればトグルで閉じる
    const exists = mount.querySelector(".dlb-menu");
    if (exists) {
      exists.remove();
      return;
    }
    const menu = document.createElement("div");
    menu.className = "dlb-menu";
    // スタイルは既存CSSに合わせる。最低限アクセシビリティ属性を。
    menu.setAttribute("role", "menu");

    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "dlb-menu__item";
    logoutBtn.textContent = "ログアウト";
    logoutBtn.setAttribute("role", "menuitem");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "dlb-menu__item";
    closeBtn.textContent = "閉じる";
    closeBtn.setAttribute("role", "menuitem");

    menu.appendChild(logoutBtn);
    menu.appendChild(closeBtn);
    // ボタン直下に重ならないよう、マウント内に差し込む
    mount.appendChild(menu);

    // フォーカス管理（簡易）
    logoutBtn.focus();

    // ログアウト実行
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      try {
        // セッションはHttpOnly Cookieなのでfetchはcredentials省略でも同一オリジンで送信されるが、
        // 安全のため include を明示
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        console.error(e);
      } finally {
        // 状態を確実に更新
        window.location.reload();
      }
    });

    closeBtn.addEventListener("click", () => {
      menu.remove();
    });

    // メニュー外クリックで閉じる（イベントバブリングに注意）
    const onDocClick = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    // キャプチャ段階で拾って、他要素のstopPropagation影響を受けにくくする
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  };

  // クリック登録
  if (!loggedIn) {
    // once: true で誤連打抑止（サーバ側はstateも検証するため二重送信耐性あり）
    btn.addEventListener("click", startDiscordLogin, { once: true });
  } else {
    btn.addEventListener("click", openLoggedInMenu);
  }

  // キーボード操作はbutton既定でEnter/Spaceがclickになるので追加実装不要

  mount.appendChild(btn);
}
