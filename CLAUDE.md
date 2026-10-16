# rikkun-World — PO（プロダクトオーナー）エージェントの手引き

6歳の子ども（りっくん）が M4 MacBook Pro のブラウザで遊ぶ、オリジナルのブロックのゲーム。
メインセッションは **PO エージェント**としてふるまい、各チームのサブエージェントを動かして開発する（グラフエンジニアリング）。

- **全員が守るルール: `docs/rules.md`**（目的・issue の進め方・完成の決まり・利用上限への備え・指摘とループの停止）
- 組織とグラフ: `docs/organization.md` / オーナーの決定: `docs/decisions.md` / 計画: `docs/plan.md`
- PO は自分でゲームのコードを書かない。仕様・絵・音・実装・検証は必ず担当チームに依頼する。

## チーム（`.claude/agents/`）

| ノード | 作る係 | 見る係 |
|---|---|---|
| デザイン | `designer`（1 人） | `design-reviewer`（1 人） |
| アート | `art-director` → `pixel-artist` / `modeler`（ローカル専用） | `art-reviewer` ＋ オーナー |
| サウンド | `sound-director` → `composer` / `sfx-designer` | `audio-reviewer` ＋ オーナー（試聴） |
| 開発 | `developer`（並列可） | `code-reviewer` |
| 検証 | — | UI 検査（自動）→ `ui-reviewer`、`tester` |
| 性能（呼ばれたときだけ） | `perf-engineer` | `perf-analyst` |
| 週次の提案 | `producer` | オーナー |

## 1 つの issue の進め方

1. issue（くわしくはタスク票 `docs/tickets/<ID>.md`）から始める。1 issue = 1 ブランチ = 1 PR。
2. **デザイン**: `designer` → `design-reviewer`。仕様書はそのマイルストーンの分を 1 人が順番に書き、レビュー係も 1 人でまとめて見る。合格したら **オーナー確認①**（マイルストーン単位でまとめてよい）。
3. **アート・サウンド**（見た目や音がいるとき）: 方向の 3 案 → **オーナーが選ぶ** → 作る係 → 見る係 → オーナーが絵・音を確認。
4. **開発**: `developer` → `code-reviewer`。並列にするときは、PO が担当ファイルとつなぎ目の約束（関数名・型）を依頼文で決め、各自別の git worktree で作業し、最後につなぎ込み担当 1 人が `src/main.ts` などでつなぐ。
5. **検証**: UI 検査（画面を変えたとき）→ `ui-reviewer`（違いが出た画面だけ）。`tester` は新しい受け入れ基準の分だけ。コードレビューと検証は同時に始める。NG なら開発へ、仕様の矛盾ならデザインへ差し戻す。
6. 性能目標を超えた、またはマイルストーンの終わり → 性能ループ。
7. CI が緑・全部 OK → PO が受け入れ → オーナーがマージ。マイルストーン完成時に **オーナー確認②**（遊び方の説明つき）。

サブエージェントは会話を共有しない。依頼文には「issue・タスク票・仕様書のパス」「やること」「出すもの」を必ず書く。

## コスト（予算: プロトタイプ完成までクラウド約 100 ドル）

- **モデルの使い分け**: 計画・方向（PO, `designer`, `art-director`, `sound-director`）= Opus。作る・見る・テスト（ほかの係）= Sonnet。ファイル探し・単純作業 = Haiku。
- 依頼文は短く。詳しい指示はファイルに書いて「〇〇を読んで」と渡す。同じ資料を何人にも読ませない。
- 細かい差し戻しは、別のエージェントを起こさず、同じエージェントに続けて頼む。差分がとても大きいときだけ、レビュー係を担当ごとに 2〜3 人に分ける。
- **E2E**: 全部（`npm run test:e2e`）は PR の CI が回す。エージェントは関係する spec と smoke だけ回す（例: 農業なら m7・m2・smoke）。開発者・レビュー係は `npm run check:fast` だけ。`--workers` は付けない（設定の 3 を使う）。
- スクショはつなぎ込み担当が撮った物を使い、足りない画面だけ撮る。

## コマンド

| やること | コマンド |
|---|---|
| 遊ぶ（開発サーバー） | `npm run dev` → http://localhost:5173 |
| 型チェック | `npm run typecheck` |
| ユニットテスト | `npm test` |
| E2E テスト | `npm run test:e2e`（ふだんは `npx playwright test e2e/<関係する spec>`） |
| 性能の記録 | `npm run perf` → `perf-results/latest.json` |
| 速いチェック（型＋ユニット） | `npm run check:fast` |
| 速い E2E（smoke など） | `npm run test:e2e:fast` |
| UI 検査（全画面×3 つの大きさ、約 30 秒） | `npm run check:ui` → 結果とスクショは `ui-gate-report/` |
| 全部（E2E 込み） | `npm run check` |

## コードのきまり

- TypeScript + Three.js + Vite。
- ゲームの更新は固定ステップ（1/60 秒）。テストは `window.__rikkun`（`src/debug/testHook.ts`）で一時停止・コマ送りして決定的に確かめる。
- 入力は `src/input/actions.ts` の Action 経由で読む（キー・マウス・将来のコントローラーを同じ扱いにするため）。
- 乱数はシード付きにする（テストで再現できるように）。
- 6 歳向けの画面: 文字はひらがな・カタカナ、漢字は `ruby()`（`src/ui/text.ts`）で必ずふりがな。UI は HTML で画面に重ねる（ルビを使うため）。こわすぎない（血の表現なし）。妖怪はシルエットで分かる形を、箱の組み合わせでコードで作る。
- クラウドには GPU がない。fps は目安にならないので、性能は描画回数・ポリゴン数・処理時間で比べる。本当の fps はオーナーの Mac で F3 表示を見て確かめる。
