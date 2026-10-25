# 段階 4: 大きなファイルを分ける（#308 設計メモ）

ルール #304 の段階 4。段階 3 で「データは 1 か所」になったので、ここでは**コードの置き場所**を整える。100 時間遊べる量へ足していくとき、1 つの係を直すのに 3000 行のファイルを読まなくてすむようにする。

## 終わりの条件（#308 に書いたもの）
- `src/contracts.ts` は型と再輸出だけ（実行時の値・関数を持たない）。
- `src/main.ts` は 800 行以下。
- 本番のコード（`src/proto/` の外、テストを除く）から `src/proto/` への import が 0。
- 800 行をこえる `.ts`（テストを除く）が 0（今 17 本）。

## 今（2026-10-25 の調べ、くわしくは下調べのメモ）
- 800 行超: AnimalManager 3046・contracts 3031・main 2847・YokaiManager 2099・proto/gashaBig 2070・DigSystem 1830・WorldRenderer 1481・proto/gashaGirl 1301・VoxelWorld 1257・proto/gashaBigActor 1244・sectionMesher 1207・animalFx 1139・AnimalRenderer 1076・proto/gashaBigTuning 979・AchievementSystem 893・BlockDoll 818・craftPanel 812。
- contracts.ts: 型のほかに設定の初期値と関数（世界の定数・M6・作物・M7・レジェンダリー・W2・CRAFT2・LIVE）がある。本番 263 ファイルが import し、うち 52 が実行時の値を使う。
- main.ts: 上から順に実行する 1 本の流れ。毎ステップの本体（`game.onUpdate`、382 行の 1 文）と開発用の窓口（`installTestHook`、290 行）が大きい。
- 本番→proto の import 16 行: ブロックの見た目（`proto/voxel/looks`）を描画が使い、がしゃどくろ（`proto/gashaBig*`・`gashaGirl*`）を本番の出現（`gasha/release.ts`）と main.ts が使う。試作だった物が本番に入ったまま `proto/` に残っている。

## 分け方のきまり（全 PR 共通）
1. **動きを変えない**。作る順番・更新の順番・乱数の呼ぶ順を変えない（シード付き乱数の結果が変わると E2E と遊びが変わる）。公開の名前（class のメソッド・export の名前・`window.__rikkun`）を変えない。
2. **移すだけの PR と、形を変える PR を分ける**。移すだけ（関数・型をそのまま別ファイルへ）は差分が大きくてもよい。レビュー係は「消えた行と足された行が、import と字下げを除いて同じ」ことを機械で確かめる（`git diff --color-moved=zebra` と行の突き合わせ）。
3. **class を分けるときは「係」ごと**。1 つの class の中の「係」（例: 妖怪の追いかけ・攻撃・落下・見た目）を、別ファイルの関数か、class が持つ小さな部品にする。部品が class 全体（`this`）を受け取る形は禁止。要る物だけの小さな interface を渡す。
4. **毎フレーム動く所で新しい物を作らない**（クロージャや配列を毎回作ると GC が増えて遅くなる）。描画・メッシュ作りの PR は `npm run perf` の数（描画回数・ポリゴン数・処理時間）を前後で比べる。
5. 新しいファイルも 800 行以下。import の輪を増やさない（`check:ratchet` の cycles）。
6. 見た目が変わらないこと: 画面に関わる PR は `npm run check:ui` の差 0。

## PR の順（同じブランチから 1 本ずつ。作業は 2〜3 人同時に別の worktree で）

| 順 | 中身 | 主なファイル | 形 |
|---|---|---|---|
| 4-1 | contracts.ts を係ごとの型ファイルへ | `src/contracts/{world,player,items,yokai,achievements,farm,weapons,storage,animals}.ts` と、設定の初期値を各係へ（W2 → `combat/w2Settings.ts`、LIVE → `animals/liveSettings.ts`、作物 → `farm/crops.ts` など）。`contracts.ts` は `export * from` だけにして、263 ファイルの import は変えない | 移すだけ |
| 4-2 | proto から本番へ出す | `proto/voxel/looks` → `world/render/looks/`、がしゃどくろの本番分 → `src/gasha/`。`proto/` には `?proto=` の開発用の入口だけ残す。ラチェットに「本番→proto の import 数」を足す（16 → 0） | 移すだけ |
| 4-3 | main.ts を分ける | 毎ステップの本体 → `game/step.ts`、開発用の窓口 → `debug/installTestHook.ts`、つなぎ（係ごとの作成と配線）→ `game/wire/*.ts`。main.ts は順に呼ぶだけ | 形を変える（順番は同じ） |
| 4-4 | YokaiManager | 係ごとに分ける。`e.kind === 'nurikabe'` などの動きの分かれ道を、妖怪の登録表の印（浮く・石になる・重い攻撃だけでのけぞる など）に移す（国の妖怪 36 体の前に） | 形を変える |
| 4-5 | 生き物 | AnimalManager（3046）・animalFx・AnimalRenderer | 形を変える |
| 4-6 | 掘る・実績・作る画面・手に持つ形 | DigSystem・AchievementSystem・craftPanel・BlockDoll | 形を変える |
| 4-7 | 世界と描画 | WorldRenderer・VoxelWorld・sectionMesher（性能に効くので `npm run perf` で前後を比べる） | 形を変える |
| 4-8 | がしゃどくろの大きいファイル | gashaBig・gashaGirl・gashaBigActor・gashaBigTuning（4-2 で `src/gasha/` に移った後） | 形を変える |

- 4-1 と 4-2 は「移すだけ」なので先にやる（後の PR がぶつかりにくくなる）。
- 4-4〜4-8 はファイルが重ならないので、作業は同時に進めて、PR は順に出す。
- PR ごとに `ratchet.json` の `filesOver800` を下げる。4-8 で 0 になったら段階 5（ラチェットをエラーにする・きまりを CLAUDE.md と係の手引きへ）。

## 合格の条件（各 PR）
- 写し JSON（`src/content/__snapshots__/`）が 1 文字も変わらない。既存テストの期待を変えない。`check:fast` 緑。
- `check:ratchet` の数が増えない。`filesOver800` は下がった分を下げる。
- 画面に関わる PR は `check:ui` の差 0、描画の PR は `npm run perf` の数が同じ。
- 遊び・見た目・音が変わらないので CI 緑で自動マージ。
