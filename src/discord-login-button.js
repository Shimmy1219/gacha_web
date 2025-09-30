// 何もしない“見た目だけ”のレンダラ
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

  mount.appendChild(btn);
}
