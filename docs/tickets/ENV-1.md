# ENV-1: 作る環境の 直し（Node の固定・CI・依存の更新）

| 項目 | 内容 |
|---|---|
| マイルストーン | 環境 |
| 状態 | 開発まち |
| 周回数（全ループ合計） | 0 / 10 |

## 目的（オーナーの言葉で）
2026-10-21 yuzu「構築環境について修正計画を出したい」→ PO の計画（段階 1〜3）を「1 つの issue に まとめて いい」「依存の 更新も 入れて いい」。

## やること（PO が決めた初めの値）
### 段階 1: 小さく 安全な 直し
1. `.nvmrc` を `22` に。`package.json` に `"engines": { "node": ">=22 <23" }`。CI（`ci.yml`・`pages.yml`）は `node-version-file: .nvmrc` を読む。
2. `ci.yml` の「3 つ全部が通ったか」「3 つの結果を」のコメントを 4 つに 直す（分けた数は 4）。
3. `.claude/hooks/session-start.sh`: `npm ci --no-audit --no-fund`、失敗したら `npm install --no-audit --no-fund`（lockfile を 書きかえない）。
4. README のコマンドの表を CLAUDE.md の表と そろえる（`check:fast`・`check:ui`・`test:e2e:fast`・`perf` など）。
5. `playwright.calm.config.ts`・`playwright.shadow.config.ts`: 何に使うかを ファイルの 頭の コメントに 1 行。使う spec があれば `package.json` に スクリプトを 足す（`test:e2e:calm` など）。だれも 使っていなければ PR の 説明に「消す 候補」と 書く（この PR では 消さない）。

### 段階 2: CI
6. `pages.yml`: `npm run build` の 前に `npm run check:fast`（赤なら 公開しない）。
7. `ci.yml` の E2E: `~/.cache/ms-playwright` を `actions/cache` で ためる（key に `package-lock.json` の Playwright の 版）。ためたときは `npx playwright install-deps chromium` だけ、ないときは 今の `install --with-deps`。

### 段階 3: 依存の 更新
8. `vitest` を 5.0.5 に（patch）。
9. `@playwright/test`: **クラウドの Chromium（`/opt/pw-browsers/chromium-1194`）と 合う 版の ときだけ** 上げる。合わない（ブラウザの 版が かわる）なら 上げず、PR の 説明に 理由を 書く。CLAUDE.md の「`playwright install` は しない」を まもる。
10. `typescript` は 5.9 の まま（7 は 大きく かわるので 別の issue）。`@types/node` も 22 の まま（Node 22 に 合わせる）。

## 受け入れ基準
- `npm run check:fast` が 緑。CI（型・ユニット・E2E 4 つ・E2E 全部）が 緑。
- クラウドの 新しい セッションで フックが `npm ci` で 入る（lockfile が かわらない）。
- `pages.yml` を 見ると、型・ユニットが 赤なら build と 公開に 進まない。
- 遊び・見た目・音は かわらない → CI 緑なら 自動マージで よい。

## 進め方
デザイン・アート・音・E2E の 準備は いらない（画面が かわらない）。developer → code-reviewer → CI 緑 → 自動マージ。

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-21 | 0 | 作成 | 段階 1〜3 を 1 つに（yuzu OK） |
| 2026-10-21 | 0 | 進め方 | yuzu「このセッションで全部やりましょう」→ ENV-1 と ART-PIPE-1 を 同じブランチ `claude/sharp-heisenberg-4r3ba6` で 進める（1 issue = 1 ブランチ の 例外。オーナー決定） |
