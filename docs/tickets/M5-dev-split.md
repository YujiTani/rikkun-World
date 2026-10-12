# M5 開発の担当分け

仕様: `docs/design/M5-world.md`（付録 A）。つなぎ目: `src/contracts.ts` の M5 の節（`WORLD_SIZE`、`WORLD_CENTER`、`WorldRegions`。PO が決めた。変えない）。テスト場所は x,z=0〜12・y=8〜47。

## 共通
- 最初に `git merge claude/m5-world`（worktree は別ブランチから作られるので）。必要なら `npm install`。
- `CLAUDE.md`、このファイル、`src/contracts.ts` を読む。仕様書は自分の担当の節だけ。担当ファイル以外は編集しない。確認は `npm run check:fast`。最後に自分の worktree のブランチへコミット（push しない）。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。
- B・C は A ができるまで、今の 64×64 の島か、決まった形の仮の世界でテストする。

## A 地形（§4-1〜4-6、AC2〜AC13）
- 担当: `src/world/gen/**`、`src/world/VoxelWorld.ts` の大きさ（`WORLD_SIZE` を使う）、`src/world/hook.ts` の `regions()`
- `IslandInfo` に `regions(): WorldRegions` を足す（型は contracts を使う。`IslandInfo` を広げてよい）

## B 描画・光・性能（§4-7、AC14〜AC17）
- 担当: `src/world/render/**`、`src/world/light/**`、`src/game/config.ts`・`src/game/scenery.ts`、`e2e-perf/**`
- 距離でチャンクを描く／描かない（88 以内）、かすみ 40〜80、最初の明るさの計算を速く、`render.chunks()` の窓口

## C 保存・妖怪・テスト（§4-8・§4-9、AC18〜AC21）
- 担当: `src/save/**`、`src/yokai/**`、`e2e/**`（既存テストの座標を +32 ずらす等）
- 保存の gen を 2 に、size を保存に足す。古い保存は捨てる。妖怪は みず の列に出ない、水平 64 より遠い妖怪は静かに消える

## つなぎ込み（全員の後。`src/main.ts`, `src/debug/**`）
### 申し送り
**A（地形）**
- `src/debug/testHook.ts` の `world` の型に `regions()` を足す（`createWorldHook` は返している）
- 生成は試験で 1,500ms 以内。AC14（明るさ込み 2,500ms）を実測する
- AC4 の「うみ」は試験で d≥52 とみなした（テスト係が確かめる）
**B（描画・光・性能）**
- 毎ステップ `renderer.update({ x: game.camera.position.x, z: game.camera.position.z })`。最初は `renderer.attach` の前に `renderer.setViewer(x, z)`
- testHook に `render: { chunks: () => renderer.chunkStats() }`、world hook に `lightInitMs: () => renderer.light.initMs`（`e2e-perf/m5.perf.ts` が読む）
**C（保存・妖怪・テスト）**
- `isDarkForSpawn` が `world.size.y`（48）まで見ているか確認（`src/world/light`）
- `e2e/m1.spec.ts` AC10 の `drawCalls<=100`・`triangles<=300000` は広い世界で足りなければ M5 の値（200・600,000）に
- A の地形のあと `SaveManager.test.ts`・`ai.test.ts` を回し直す。AC21（500 ブロックの保存 20ms 以下・30,000 文字以下）の計測テストを足す
- m3 の「ひる は屋根の下だけ」は判定を直したので、つなぎ込み後に本当に通るか見る
- 計測（クラウド）: 今の島の生成 20〜32ms・明るさ 19〜30ms。128×48×128 の仮の地面の明るさ 154〜198ms

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 3 担当（A・B・C）で開始 |
| 2026-10-12 | A・B・C と LOD をまとめた（ユニット 793 件 合格）。つなぎ込みへ |
| 2026-10-12 | オーナー指示: 受け入れテスト（tester）は途中で止め、M6 のときにまとめて確かめる。PR を先に作る |
