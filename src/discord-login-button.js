// src/discord-login-button.js
export function renderDiscordLoginButton({
  mount,
  loggedIn = false,
  username = "",
  avatarUrl = ""
} = {}) {
  if (!mount) return;
  mount.innerHTML = "";

  const btn = document.createElement("button");
  btn.type = "button";
  // 統一クラス: .btn .dlb .dlb--discord （状態で --loggedin 付与）
  btn.className = `btn dlb dlb--discord${loggedIn ? " dlb--loggedin" : ""}`;
  btn.setAttribute("aria-label", loggedIn ? `Discord: ${username}` : "Discordでログイン");

  if (!loggedIn) {
    // 未ログイン表示
    const label = document.createElement("span");
    label.className = "dlb-label";
    label.textContent = "Discordでログイン";
    btn.appendChild(label);
  } else {
    // ログイン済み表示（円形アバター＋名前）
    const wrap = document.createElement("span");
    wrap.className = "dlb-inner";

    const img = document.createElement("img");
    if (avatarUrl) img.src = avatarUrl;
    img.alt = "";
    img.className = "dlb-avatar"; // ← CSSで円形にする
    wrap.appendChild(img);

    const name = document.createElement("span");
    name.className = "dlb-username";
    name.textContent = username || "Discord User";
    wrap.appendChild(name);

    btn.appendChild(wrap);
  }

  // クリック動作
  const startDiscordLogin = () => {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      window.location.assign("/api/auth/discord/start");
    } catch (e) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      console.error(e);
    }
  };

  const openLoggedInMenu = () => {
    const exists = mount.querySelector(".dlb-menu");
    if (exists) return exists.remove();

    const menu = document.createElement("div");
    menu.className = "dlb-menu";
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
    mount.appendChild(menu);

    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        });
      } finally {
        window.location.reload();
      }
    });

    // 外側クリックで閉じる
    const onDocClick = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  };

  if (!loggedIn) {
    btn.addEventListener("click", startDiscordLogin, { once: true });
  } else {
    btn.addEventListener("click", openLoggedInMenu);
  }

  mount.appendChild(btn);
}
