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

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 5 担当に分けて並列で開始 |
