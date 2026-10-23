# PERF-255: 重さを「仕事の数」で見る窓口（`__rikkun.work`）

issue: #255（ルール: 性能は時間でなく数で落とす） / ブランチ: `claude/project-thread-83rhmw`（PR #256 に足す）

## なぜ
E2E は時間（ms）で合否を決めない（#255・#130）。かわりに「重くなっていないか」を、マシンの速さで変わらない **1 ステップの仕事の数** で見る。
データベースに聞いた回数を数えるテストと同じ考え。遊び・見た目・音は変えない。

## 窓口（`src/debug/testHook.ts` の `TestHook` に足す）
- `work.start()`: 数えはじめる（前の数は 0 にもどす）。
- `work.read()`: `{ steps: number; getBlock: number }` を返す。`steps` は start からの `tick` のふえ、`getBlock` は start からの ワールドの `getBlock` の呼ばれた回数。
- `work.stop()`: 数えるのをやめ、元にもどす。
- 数えるしくみは **start したときだけ** 足す（インスタンスの `getBlock` を包んで、stop で元の関数にもどす）。ふだんの遊びの道には何も足さない（毎コマの分岐も足さない）。
- 動物などが ワールドを別の入れ物ごしに読んでいるなら、その読む口で数える。どこで数えたかをこのファイルの「メモ」に書く。

## テスト
1. ユニット（`developer`）: start → getBlock を 3 回 → read が 3、stop のあとは数えない・元の関数にもどる。
2. E2E（`tester`、`e2e/live1-perf.spec.ts` に 1 本）: 「動物の数を 2 倍にしても、1 ステップの getBlock の数が 2.5 倍以下」。
   - 動物 0 わ・N わ・2N わ で、同じ場所・同じ step 数で `work` を読む。ふえ（N わ − 0 わ、2N わ − 0 わ）を比べる。
   - N は今の AC30 と同じ 11 わ（なかま 8・やせい 3）をもとに。ふえが 0 なら（getBlock を使っていないなら）通してよい（その数を console に出す）。
   - 時間は使わない。
3. `npm run check:fast` と `npx playwright test e2e/live1-perf.spec.ts e2e/smoke.spec.ts` が緑。

## まもること
- `src/debug/e2eNoTime.test.ts` の見張りに かからないこと。
- 期待の数は実装に合わせて変えない。

## メモ
- 数えた所: `src/debug/workHook.ts`（`createWorkHook`）。start で ワールド（`main.ts` の `world`。動物も 同じ入れ物を 直接読む）の インスタンスの `getBlock` を包み、stop で元にもどす（もとがクラスのメソッドなら 包みを 消すだけ）。`steps` は `game.tick` の ふえ。ふだんの道には 何も足さない。
- 数えるのは ワールドの getBlock ぜんぶ（地形の描画・動物・ほか）。動物ぬきでも 土台の数が 大きいので、ふえ（N わ − 0 わ）で見る。
- 測った数（60 ステップ・同じ場所）: 0 わ 97,235 / 11 わ 97,888（ふえ 653）/ 22 わ 98,648（ふえ 1,413）。ふえの比 2.16 倍（上限 2.5 倍）。
- なかまの 上限（`animalFriendMax` 8）が あるので、テストでは 16 に あげて 22 わに そろえる。
