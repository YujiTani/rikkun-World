# 毎朝の脆弱性の見張り

オーナー決定（2026-10-22）: 毎朝 7:30（日本時間）に予定タスクで見張る＋GitHub の Dependabot alerts を使う。
X は直接読めないので、X で話題になる元の **公式の告知** を見る。

## このプロジェクトで関係するもの

ゲームはサーバーのない静的なページ（GitHub Pages）。遊ぶ人の側では Node.js は動かない。
Node.js はビルド・CI・開発だけ。PHP・Java・Go・Rust・.NET・Docker は使っていない。
だから優先度は、ふだんは P3（外に出ていない）。ただし「ビルドで入る物」（依存・ビルドの Node）が乗っ取られると公開版に悪いものが入るので、それは早めに直す。

## 毎朝見るもの（上から順に）

| # | 見るもの | 見る場所（一次情報） | 新しいことの見分け方 |
|---|---|---|---|
| 1 | Node.js の脆弱性告知 | https://nodejs.org/en/feed/vulnerability.xml | 前回より新しい記事 |
| 2 | Node.js の版 | https://nodejs.org/dist/index.json（`security: true`）| 22 系の最新が前回とちがう |
| 3 | CI が実際に使った Node | 最新の CI の型チェックのジョブのログ「Environment details」の `node: v…` | 2 の最新より古い |
| 4 | npm の依存 | `npm audit --json`（GitHub Advisory のデータ）、GitHub の Dependabot alerts | 0 でない |
| 5 | CI のランナー | 最新の CI のログの OS（`ubuntu-latest` が何を指すか）と警告 | OS・警告がかわった |
| 6 | Playwright | https://github.com/microsoft/playwright/releases | セキュリティの修正がある |
| 6b | Mac で固定した Node | main の `package.json` の `volta.node`（Volta の固定） | 2 の 22 系の最新より古い（`volta pin node@22` で上げる） |
| 7 | 大きなニュースの見落とし | ウェブ検索「Node.js vulnerability」「npm supply chain」（その日の分） | 1〜6 で拾えていない物 |

## 報告のしかた

- 新しいことがあった日だけ、このスレッドで知らせる。直すときは issue（ラベル security）を立て、1 件 = 1 PR、オーナーがマージ。
- 何もない日は知らせず、月曜の週次提案に「先週の見張り: なし」と 1 行。
- 結果は `docs/security/state.json` に残す（次の日に「新しいか」を比べるため）。

## 決まっていること

- CI の setup-node は `node-version: 22` だけだとランナーのキャッシュの古い版を使う（2026-10-22 に 22.23.3 を使っていた）。`check-latest: true` で最新を取りにいく。
- Node 22 は 2027-04-30 でサポート終了。それまでに 24 へ移す。
