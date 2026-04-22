# signallab-feelcycle

FEELCYCLE の自分用記録を残すための CLI リポジトリです。MVP では手入力、CSV 取込、継続状況の簡易集計だけに絞ります。

## 役割

- 手入力または CSV 取込で記録を残す
- 保存前に整形する
- JSONL に保存する
- 週回数や継続の元データを維持する

## 使い方

```bash
npm install
npm run dev:add
npm run dev:import-csv -- ./imports/example-feelcycle.csv
npm run dev:summary
```
