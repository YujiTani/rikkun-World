# rikkun-World
まいんくらふとくろーんでつくった、おりじなるげーむ。かいはつはぐらふえんじにありんぐを適用。

## あそびかた（Mac）

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 をひらく。`F3` キーで性能表示（fps）が出る。

## 開発

- 計画: [docs/plan.md](docs/plan.md)
- 組織図（グラフエンジニアリング）: [docs/organization.md](docs/organization.md)
- 計画のレビュー: [docs/plan-review.md](docs/plan-review.md)
- AI チームの運用ルール: [CLAUDE.md](CLAUDE.md)、エージェント: [.claude/agents/](.claude/agents/)

| コマンド | 内容 |
|---|---|
| `npm run dev` | 遊ぶ（開発サーバー） |
| `npm run typecheck` | 型チェック |
| `npm test` | ユニットテスト |
| `npm run check:fast` | 速いチェック（型＋ユニット） |
| `npm run test:e2e` | E2E テスト（ふだんは `npx playwright test e2e/<spec>`） |
| `npm run test:e2e:fast` | 速い E2E（smoke など） |
| `npm run check:ui` | UI 検査（全画面×3 つの大きさ） |
| `npm run perf` | 性能の数値を記録（`perf-results/latest.json`） |
| `npm run check` | 全部（型＋ユニット＋E2E） |
