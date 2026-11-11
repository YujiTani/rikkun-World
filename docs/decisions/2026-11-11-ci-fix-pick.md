# 2026-11-11 CI の赤を直すあいだは落ちた spec だけ回す（#444）

オーナー（yuzu）: 「CI error を修正するたびに、もういちど push してすべての CI をまわしてます。30 分かかる」→ 直すあいだは落ちたテストだけ、最後に 1 回全部、時間切れだけの赤は落ちたジョブだけ再実行、の形に OK。「私の操作不要でそれを判断するようにしてほしい」。

## 手順（PR を出したスレッドが自分で判断して進める）

GitHub の操作は GitHub MCP の `actions_run_trigger` と `actions_list` / `get_job_logs` で行う（owner `YujiTani`・repo `rikkun-World`）。

1. **赤を読む**: 落ちたジョブのログ（`get_job_logs`）から、落ちたテストの spec と行を拾う。
   - テストの名前が出ていない（45 分切れ・`npm ci` やダウンロードの失敗・ランナーが止まった）→ **4.** へ。
2. **直して `[skip ci]` で push**: 直しのコミットのメッセージに `[skip ci]` を入れる（PR の全部の CI は動かない。必須チェックは「待ち」のままなので、まちがってマージされない）。
3. **えらんだ spec だけ回す**: `actions_run_trigger` の `run_workflow`、`workflow_id: e2e-pick.yml`、`ref: <PR のブランチ>`、`inputs: { specs: "<落ちた spec> <さわった所の spec> e2e/smoke.spec.ts" }`。ゆれを疑うときは `repeat: "3"`。数分で終わる。結果は `actions_list` の `list_workflow_runs`（`e2e-pick.yml`・ブランチで絞る）で見る。
   - 赤 → 2. にもどる。
   - 緑 → `actions_run_trigger` の `run_workflow`、`workflow_id: ci.yml`、`ref: <PR のブランチ>` で **全部を 1 回**。ここが緑なら必須チェックがそろい、マージ（自動マージの予約もここで動く）。ここで別のテストが赤なら 1. にもどる。
4. **時間切れ・不調だけの赤**: 直さず `rerun_failed_jobs`（`run_id` はその回）を 1 回。同じ形で 2 回つづいたら原因を調べる（シャードの時間のかたより・重い spec など）。
5. **再実行で通ったテスト**は「ゆれ」なので issue にする（skip・削除で緑にしない）。

## 注意
- `e2e-pick.yml` が入る前に main から分かれたブランチには、このファイルがない。先に main を取りこむ（`git merge origin/main` を `[skip ci]` 付きのメッセージで push）。
- `ci.yml` を手で回した回は、PR の「main と合わせた形」ではなく、ブランチそのものを試す。main が大きく進んでいるときは、先に main を取りこんでから回す。
- 最初の push（PR を出すとき）と、`[skip ci]` を付けないふつうの push は、今までどおり全部回る。
- `.github/workflows/` はスレッドから push できない。ワークフローを変えるときは `docs/setup/` に置いてオーナーに入れてもらう。
