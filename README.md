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
- `FEELCYCLE_HEADLESS`
- `FEELCYCLE_MANUAL_LOGIN`
- `FEELCYCLE_HISTORY_MONTHS`
- `FEELCYCLE_SAVE_SNAPSHOTS`
- `FEELCYCLE_SAVE_LOCAL_RECORDS`

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
npm run dev:sync-lesson-master
npm run dev:summary
```

## レッスンマスタ

`feelcycle_lessons`、`feelcycle_instructors`、`feelcycle_lesson_instructors` は、レッスンとインストラクターの対応を保持します。
対応は固定の所有関係ではなく、受講履歴または予約スケジュールで確認できた担当実績として保存します。

最初に Supabase マイグレーションを適用します。

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

続けて既存の受講履歴からマスタを投入します。

```bash
npm run dev:sync-lesson-master
```

## GitHub Actions

`.github/workflows/fetch-mypage.yml` で定期実行できます。GitHub の repository secrets に次を設定してください。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FEELCYCLE_EMAIL`
- `FEELCYCLE_PASSWORD`
- `FEELCYCLE_LOGIN_URL`
- `FEELCYCLE_HISTORY_URL`
- `FEELCYCLE_HISTORY_MONTHS`

Actions 側では `FEELCYCLE_HEADLESS=true`、`FEELCYCLE_MANUAL_LOGIN=false` で実行します。
CI では `FEELCYCLE_SAVE_SNAPSHOTS=false` と `FEELCYCLE_SAVE_LOCAL_RECORDS=false` を使って、HTML と JSONL のローカル保存をスキップします。
