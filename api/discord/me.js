// 起動時のUI更新（再掲・微調整）
async function refreshDiscordLoginUI() {
  const slot = document.getElementById("discordLoginSlot");
  try {
    const res = await fetch("/api/discord/me", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.ok && data.user?.id) {
      const avatarUrl = data.user.avatar
        ? `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=64`
        : "";
      renderDiscordLoginButton({ mount: slot, loggedIn: true, username: data.user.name || "", avatarUrl });
      console.info("[discord-login] logged in:", data.user);
    } else {
      renderDiscordLoginButton({ mount: slot, loggedIn: false, username: "", avatarUrl: "" });
      console.info("[discord-login] not logged in (expected 401 before login).");
    }
  } catch (e) {
    renderDiscordLoginButton({ mount: slot, loggedIn: false, username: "", avatarUrl: "" });
    console.warn("[discord-login] /api/discord/me check failed:", e);
  }
}

