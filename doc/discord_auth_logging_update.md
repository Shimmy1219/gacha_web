# Discord OAuth コールバックのログ監視更新

## 変更概要
- `state or verifier mismatch` ログは、KV 復旧に成功した場合は INFO レベルで
  `recoveredFromKv: true` を含めて出力されます。
- KV 復旧に失敗した場合のみ WARN レベルを維持し、`attempts`・`waitedMs`・`loginContext`
  を付与して原因を追跡しやすくしました。
- `state record missing in kv store` WARN ログにも `attempts`・`waitedMs`・`loginContext`
  を追加し、遅延や不整合の計測が可能です。

## 監視調整
- 既存の WARN レベルカウントによるアラートは、`recoveredFromKv: true` を含む INFO ログを監視対象から除外し、
  WARN ログの発生が純粋に失敗ケースを意味するように更新してください。
- WARN ログのメタデータとして `attempts`・`waitedMs` が付与されるため、ダッシュボードではこれらの値を可視化し、
  Upstash のレプリケーション遅延傾向を把握できるようにします。
- ログクエリや通知文言で `loginContext` を表示し、
  PWA / ブラウザのどちらで問題が起きているか即座に判別できるようにしてください。

## ドキュメント更新
- 本ドキュメントを最新のログ仕様として参照し、今後の運用・障害対応手順に反映させてください。
