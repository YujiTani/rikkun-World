# M1 開発の担当分け（開発ループ 1 周目）

オーナーの指示で、開発を 5 つの担当に分けて並列で進める。最後に 1 人がつなぎ込む。
全員が同じ仕様書（`docs/design/M1-01-world.md` 第 3 版、`docs/design/M1-02-movement.md` 第 2 版）を読む。
つなぎ目の約束は `src/contracts.ts`（PO が決めた型。勝手に変えない）。

| 担当 | 中身 | 担当ファイル（ここだけ編集してよい） | 出すもの（つなぎ目） | テスト用窓口 |
|---|---|---|---|---|
| **T1 島生成** | 島の形・高さ・地層・木・岩山・鉱石・見える木・テストに使ってよい場所・戻る場所 | `src/world/gen/**` | `generateIsland: GenerateIsland`、`IslandInfo` | （T2 の `world.*` に IslandInfo を渡す） |
| **T2 ブロック作り** | ブロック 11 種の定義、16x16 ドット絵テクスチャ、ブロックの入れ物、チャンクのメッシュ（見えない面を描かない）、部分的な作り直し、水の半透明 | `src/world/blocks/**`, `src/world/render/**`, `src/world/VoxelWorld.ts`, `src/world/hook.ts` | `VoxelWorld` の実装、`WorldRenderer`（`attach(scene)`, `update()`）、`BLOCK_TYPES` | `createWorldHook(world, island)` → `world.*` |
| **T3 プレイヤーの動き** | 歩く・止まる・ジャンプ・重力（§4.5 の計算）・当たり判定・世界の端の面・オートジャンプ・水の中・向き（マウス感度）・落ちたら戻る | `src/player/**` | `PlayerController`（`state: PlayerState`、`update(dt)`、`set()`、`respawn()`） | `createPlayerHook(...)` → `player.get/set` |
| **T4 カメラ切り替え** | 一人称／三人称、V で切り替え、壁よけ、上下を向いたときの置き方、ブロック人形と手足、＋の印、見下ろしカメラ | `src/camera/**` | `CameraRig`（`update(dt)`、`toggleView()`、`overview(on)`） | `createCameraHook(...)` → `camera.*` と `player.doll()` 用の関数 |
| **T5 スタート画面と入力** | 「クリックして あそぼう！」の案内画面、ポインターロック、マウスの動き、入力を受け付けるかの判定、時間を止める判定 | `src/ui/playOverlay.ts`, `src/ui/playOverlay.css`, `src/input/**` | `LookSource`、`LockStatus` の実装 | `createLockHook(...)` → `lock.*`、`createInputHook(...)` → `input.*` |
| **T6 つなぎ込み**（全員の後） | 5 つをまとめて動くゲームにする。`settings.*` を作る。仮の景色を消す | `src/main.ts`, `src/game/**`, `src/debug/**`, `src/ui/hud.ts`, `src/ui/style.css` | 動くゲーム | `window.__rikkun` を組み立てる |

## きまり
- 担当ファイル以外は編集しない（読むのは自由）。`src/contracts.ts` も編集しない。
- 相手のコードが必要なところは、`src/contracts.ts` の形の「仮のもの」でユニットテストする。
- 数値は担当ごとに 1 か所の設定ファイル（例 `src/player/config.ts`）にまとめる。
- 各自、別々の git worktree で作業し、そのブランチにコミットする。PO がまとめる。

## 各担当の詳しい指示

共通: 最初に `.claude/agents/developer.md`、`CLAUDE.md`、このファイル、`src/contracts.ts` を読む。仕様書は自分の担当の節だけ読めばよい。自分の worktree のブランチに最後にコミットする（push しない）。終わる前に `npm run typecheck` と `npm test`。相手のコードは contracts の形の仮のもの（配列の VoxelWorld など）でテストする。返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

### T1 島生成（M1-01 4-1〜4-11, AC1〜AC10, AC13, AC17, AC20）
- `src/world/gen/generateIsland.ts` から `export const generateIsland: GenerateIsland`。空の VoxelWorld に setBlock で書きこみ IslandInfo を返す。シード付き乱数。数値は `src/world/gen/config.ts`。
- 6 つほどのシードで上の AC をユニットテスト。生成時間 1,000 ms 以内。

### T2 ブロック作り（M1-01 4-2, 4-9, 4-10, §6.1 world.*, AC15, AC16, AC18, AC19）
- `src/world/blocks/`: `BLOCK_TYPES`（11 種）と 16x16 ドット絵テクスチャ（コードで描く、NearestFilter）。
- `src/world/VoxelWorld.ts`: `ArrayVoxelWorld implements VoxelWorld`、変わったチャンクを覚える。
- `src/world/render/`: `WorldRenderer(world)` の `attach(scene)` / `update()`。チャンク単位、見えない面を描かない、変わったチャンクだけ作り直す、水は半透明。作り直し時間を記録。
- `src/world/hook.ts`: `createWorldHook(world, renderer, island)` → `world.*`。
- ユニットテスト: 定義・get/set/範囲外・fill・hash・countBlocks・面の数・作り直しの範囲。

### T3 プレイヤーの動き（M1-02 §2.1, §4.1〜4.3, §4.5, §4.6, §5, AC1〜AC21。落ちたら戻る: M1-01 4-7, 4-8）
- `src/player/PlayerController.ts`: `state: PlayerState`、`update(dt)`、`set()`、`respawn()`。コンストラクタで VoxelWorld, ActionState, LookSource, LockStatus, spawn 関数を受け取る。
- 遊びの入力は `lock.playInputEnabled()` のときだけ。§4.5 の計算方法を必ず守る。当たり判定（箱・世界の端の面・壁ぞい・天井）、オートジャンプ、水、y<-10 で戻る、マウス感度と ±89°。
- 数値は `src/player/config.ts`（名前つき）。`src/player/hook.ts`: `createPlayerHook(controller)` → `player.get/set`。
- 描画なしで確かめられる AC を仮の世界でユニットテスト。

### T4 カメラ切り替え（M1-02 §2.2, §3.3, §4.1 カメラ, §4.4, §5 カメラ, AC22〜AC29, AC40〜AC42, §6.1 camera.* と player.doll()）
- `src/camera/CameraRig.ts`: コンストラクタで camera, scene, VoxelWorld, `() => PlayerState`, ActionState。`update(dt)`、`toggleView()`、`overview(on)`。
- 一人称（目 1.62）／三人称（§4.4）、V で 1 回切り替え、壁よけ、ブロック人形と手足、一人称の＋、見下ろし（フォグ切る、人形と＋を出さない）。数値は `src/camera/config.ts`。
- `src/camera/hook.ts`: `createCameraHook(rig)` → `camera.get/overview` と doll 用の関数。
- 位置・距離・壁よけ・pitch ±89・切り替え・人形の表示・手足の角度をユニットテスト。

### T5 スタート画面と入力（M1-02 §2.1, §2.3, §2.4, §3.1, §3.2, AC30〜AC39, §6.1 input.* と lock.*）
- `src/input/`: LookSource と LockStatus の実装、ポインターロック管理（simulate の値を本物より優先）、外れたら `releaseAll()`、F3 はいつでも効く。既存テストを壊さない。
- `src/ui/playOverlay.ts` / `.css`: 「クリックして あそぼう！」／「クリックして つづきを あそぼう！」、大きなボタン（幅 512 以上・高さ 96 以上・文字 32px 以上）、うすい黒 50%。クリックでロック要求。漢字は `ruby()`。
- `src/input/hook.ts`: `createLockHook` → `lock.*`、`createInputHook` → `input.*`。
- 状態の変化・simulate 優先・releaseAll・ロックなしで look 0・各判定・ふりがな漏れをユニットテスト（DOM が要る所は関数を分ける）。

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 5 担当に分けて並列で開始 |
| 2026-10-12 | 予算のためモデルを Sonnet に切り替えて再開（Opus で起動した分は書き始める前に停止） |
