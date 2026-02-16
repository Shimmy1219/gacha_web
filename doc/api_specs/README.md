# API仕様書（作成進捗）

このディレクトリは `doc/api_spec_writing_manual.md` に準拠したAPI仕様書を格納します。

## 作成済み（Batch 1: auth + blob + receive）
- `auth_discord_start_api_spec.md` (`GET /api/auth/discord/start`)
- `auth_discord_callback_api_spec.md` (`GET /api/auth/discord/callback`)
- `auth_discord_claim_session_api_spec.md` (`POST /api/auth/discord/claim-session`)
- `auth_logout_api_spec.md` (`POST /api/auth/logout`) ※ `doc/` 直下
- `blob_csrf_api_spec.md` (`GET /api/blob/csrf`)
- `blob_upload_api_spec.md` (`POST /api/blob/upload`)
- `receive_token_api_spec.md` (`POST /api/receive/token`)
- `receive_resolve_api_spec.md` (`GET /api/receive/resolve`)
- `receive_delete_api_spec.md` (`POST /api/receive/delete`)

## 次の作成対象（Batch 2候補）
- discord系:
  - `/api/discord/me`
  - `/api/discord/csrf`
  - `/api/discord/bot-guilds`
  - `/api/discord/categories`
  - `/api/discord/members`
  - `/api/discord/find-channels`
  - `/api/discord/list-gift-channels`
  - `/api/discord/send`
  - `/api/discord/guilds` (deprecated redirect)
- transfer系:
  - `/api/transfer/create`
  - `/api/transfer/resolve`
  - `/api/transfer/complete`
  - `/api/transfer/consume`
