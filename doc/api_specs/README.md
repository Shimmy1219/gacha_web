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

## 作成済み（Batch 2: discord + transfer）
- `discord_me_api_spec.md` (`GET /api/discord/me`)
- `discord_csrf_api_spec.md` (`GET /api/discord/csrf`)
- `discord_guilds_api_spec.md` (`GET /api/discord/guilds`)
- `discord_bot_guilds_api_spec.md` (`GET /api/discord/bot-guilds`)
- `discord_categories_api_spec.md` (`GET/POST /api/discord/categories`)
- `discord_members_api_spec.md` (`GET /api/discord/members`)
- `discord_list_gift_channels_api_spec.md` (`GET /api/discord/list-gift-channels`)
- `discord_find_channels_api_spec.md` (`GET /api/discord/find-channels`)
- `discord_send_api_spec.md` (`POST /api/discord/send`)
- `transfer_create_api_spec.md` (`POST /api/transfer/create`)
- `transfer_complete_api_spec.md` (`POST /api/transfer/complete`)
- `transfer_resolve_api_spec.md` (`POST /api/transfer/resolve`)
- `transfer_consume_api_spec.md` (`POST /api/transfer/consume`)

## 次の作成対象（候補）
- `apps/web/api` 配下で未ドキュメント化のルートが見つかった場合に随時追加
- 既存仕様書の未確認項目解消（運用データ・監視指標の反映）
