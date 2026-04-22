# signallab-feelcycle

FEELCYCLE の自分用記録を保存するための CLI リポジトリです。手入力と CSV 取込に加えて、ログイン後のマイページから受講履歴を取得できます。

## 役割

- FEELCYCLE の受講履歴を取得する
- 保存前に整形する
- ローカル JSONL と Supabase に保存する
- 週回数や継続の元データを維持する

## 環境変数

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FEELCYCLE_EMAIL`
- `FEELCYCLE_PASSWORD`
- `FEELCYCLE_LOGIN_URL`
- `FEELCYCLE_HISTORY_URL`
- `FEELCYCLE_MANUAL_LOGIN`
- `FEELCYCLE_HISTORY_MONTHS`

`FEELCYCLE_HISTORY_MONTHS` は遡って取得する月数です。初期値は `24` です。

## 重複防止

- 各レコードは正規化済みの `id` を持ちます
- Supabase 保存は `upsert(..., { onConflict: "id" })` で実行します
- 同じ受講履歴を再取得しても、新規追加ではなく更新になります

## 使い方

```bash
npm install
npm run dev:add
npm run dev:import-csv -- ./imports/example-feelcycle.csv
npm run dev:fetch-mypage
npm run dev:summary
```
