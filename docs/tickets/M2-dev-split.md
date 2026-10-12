# M2 開発の担当分け（開発ループ 1 周目）

仕様: `docs/design/M2-dig-inventory.md`（第 2 版、付録 A）。つなぎ目: `src/contracts.ts` の M2 の節（PO が決めた型。変えない）。
予算節約のため、付録 A の 4 担当を 3 つにした（A と B はつながりが強いので 1 人）。

## 共通
最初に `CLAUDE.md`、このファイル、`src/contracts.ts` を読む。仕様書は自分の担当の節だけ読む。担当ファイル以外は編集しない。自分の worktree のブランチに最後にコミット（push しない）。終わる前に `npm run typecheck` と `npm test`。相手のものは contracts の形の仮のものでテストする。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## AB 持ち物＋ねらう・ほる・おく（仕様 §2.1〜2.5 の持ち物・ほる・おく部分, §4.1〜4.3, §5, AC1〜AC18, AC21, AC26）
- 担当: `src/inventory/**`, `src/dig/**`
- `src/inventory/`: `Inventory` の実装、アイテムの種類の表、§2.5 のクリック、`createInventoryHook(inv, screen)` → `inventory.*`（`open` は ScreenState から）。
- `src/dig/`: `DigSystem` の実装（目からの線、かたさ×60÷強さ、続きから・休み・ひび、置く判定、0.5 秒くり返し、いっぱいでも掘れる）、`src/dig/config.ts` に `DigSettings` の値（ブロックのかたさ・要るレベルはここ。`src/world/blocks` は変えない）。`primary`/`secondary`/ホットバー Action（`hotbar1`〜`9`, `hotbarNext`, `hotbarPrev`）を読むのは AB。`lock.playInputEnabled()` が false なら無視。`createDigHook(dig)` → `target.get`, `dig.get`, `dig.events`。**出来事は読み手ごとに別の列**: 画面（C）が毎ステップ `drainEvents()` で読んでも、テストの `dig.events()` の分は消えないようにする（フック用の列を中に持つ。`peekEvents` の中身は AB が決めてよい）。
- コンストラクタで `VoxelWorld`, `() => PlayerState`, `ActionState`, `LockStatus`, `Inventory`, 目の高さを返す関数 を受け取る。

## C 見た目と音（仕様 §3, §2.6, AC22, AC23, AC27）
- 担当: `src/ui/hotbar.*`, `src/ui/inventoryScreen.*`, `src/ui/notice.*`（合図のアイコン・名前の表示）, `src/fx/**`（ねらいの枠・ひび・はじける四角・音）, `src/camera/BlockDoll.ts` と `src/camera/` の人形まわり（一人称で頭・胴体を消し、手足と右手の持ったブロックを見せる）
- 使う: `Inventory`, `DigSystem`（`drainEvents()` で出来事を受ける）, `ScreenState`。画面のクリックは `inventory.click(i)` を呼ぶ。
- `player.doll()` に `parts`, `heldItem`, `heldScreen` を足す（`src/camera/hook.ts`）。
- 漢字は `ruby()`。音は WebAudio でコードで作る（ファイルを使わない）。

## D 入力・画面の状態・自動セーブ（仕様 §2.1 のキー, §2.5 の開閉, §2.7, §4.4, AC18 のホイール部分, AC19, AC20, AC24(b), AC28, AC29）
- 担当: `src/input/**`（新しい Action とキー、ホイール 50 ごと、`input.wheel`）, `src/screen/**`（`ScreenState` の実装、E/閉じるで開閉、開くときロックを外しても案内画面を出さない、`lock.simulate` の擬似状態の更新、閉じるとき `inventory.returnCursor()`）, `src/save/**`（自動セーブ、`?reset=1`, `?nosave=1`、`createSaveHook` → `save.*`）
- `src/input/` の既存（LockController など）は D が直してよい。`ScreenSettings` の値は `src/screen/config.ts`。
- 世界の差分の作り方は D が決める（`VoxelWorld` とシードの島を比べるなど）。

## つなぎ込み（AB・C・D の後。担当: `src/main.ts`, `src/game/**`, `src/debug/**`, `src/ui/hud.ts`, `src/ui/style.css`, `index.html`）
- ゲームの時間を `ScreenState.timeScale()` で進める（`step()` は常に 1 倍）。
- `settings.*` に `DigSettings`・`ScreenSettings` の名前を足す。
- ついでに直す: タイトルの「準備中」、M1 レビュー軽微 D1〜D5（`docs/loop-ledger/M1-02.md`）、世界の端の水の細い線。担当外ファイルだが、この 1 回だけ PO が許可。
- 終わる前に `npm run check`、スクショで確かめる。本体で作業し、コミットは PO。

## 経過
| 日付 | 内容 |
|---|---|
