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
| `npm run check` | 型チェック＋ユニットテスト＋E2E テスト |
| `npm run perf` | 性能の数値を記録 |
