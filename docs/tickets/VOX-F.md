# VOX-F: さわった列だけ丸ごと保存（IndexedDB）

| 項目 | 内容 |
|---|---|
| マイルストーン | 9×9×9 本番（親 #28） |
| issue | #96（#32 を閉じる） |
| 状態 | 開発中 |
| 周回数（全ループ合計） | 0 / 10 |

## 目的
保存を「最初の世界との差分」から「さわった列だけ丸ごと圧縮して IndexedDB」にする（オーナー決定 2026-10-16、`docs/design/VOX-plan.md` §7）。自動セーブのたびの全マス比べ（#32）をなくす。

## やること（設計書 §7 のとおり）
1. `ChunkStore`（`src/contracts.ts` の型）を IndexedDB で作る: DB `rikkun-world`、ストア `chunks`（キー `[saveId,cx,cz]`、値 `{v,gen,h,data}`、セクションの 3 つの形を並べて deflate-raw）と `meta`（今の JSON の blocks 以外。`JSON.stringify` は 1 回）。テスト用にメモリ版も。
2. `ChunkedVoxelWorld` に `saveDirty`（列）と `takeSaveDirty()`。保存は dirty の列だけ。**全マス比べ・`fillFlat` による写しをやめる。**
3. 書く手順: 縮め終わってから readwrite トランザクション 1 つで列と meta を書く。書くタイミングは今と同じ（10 秒ごと・ロック解除・閉じる・hidden）。
4. 読む: 起動で meta と保存した列を読み、保存した列はそのまま、ない列は生成。`v`・`h`・`gen` の版番号（§7）。壊れたレコードはその列だけ生成に戻す。
5. pagehide の保険（`rikkun-world-pending` に同期で小さく）、`navigator.storage.persist()` を 1 回、設定から `.rikkun.gz` に出す/読む（大人向け。UI は今の設定画面に小さく足すだけ）。
6. **今のセーブの扱い（この PR だけの既定）**: 島はまだあるので、IDB にセーブがなければ、今の localStorage のセーブを 1 回だけ読みこんで IDB に移す（りっくんの島の作品を VOX-B まで残すため）。古いキーは消さない。新しい世界（VOX-B）で全部リセットするのはオーナー決定のとおり。
7. `?reset=1`・`?nosave=1` は今のまま動く。`window.__rikkun` に `save.now()`（Promise）・`save.info()`（`dirtyChunks`,`bytes`,`lastMs`）・`world.hash(cx,cz)` を足す。

## 受け入れ基準
| # | 基準 | 確かめ方 |
|---|---|---|
| 1 | ほる・おく → 保存 → 読みなおしで、世界のハッシュと持ち物などが同じ | ユニット（メモリ版＋fake-indexeddb）・E2E |
| 2 | 保存は dirty の列だけ書く。全マス比べがない | ユニット・grep |
| 3 | 保存 1 回のメインスレッドの時間 5ms 以下、書き終わり 50ms 以下（dirty 4 列＋meta） | perf |
| 4 | 今の localStorage のセーブが 1 回だけ移る。古いキーは残る | ユニット・E2E |
| 5 | pagehide の保険で、最後の保存のあとの変更が残る | E2E（`page.close({ runBeforeUnload: true })`） |
| 6 | 今の保存に関係する E2E が緑 | E2E（関係する spec と smoke） |

## 経過（PO が追記）
| 日付 | ループ | 結果 | メモ |
|---|---|---|---|
| 2026-10-16 | — | 開始 | VOX-A（#101）マージ後。VOX-B は E2E の土台（#103）のあと |
