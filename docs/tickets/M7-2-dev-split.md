# M7-2 開発の担当分け（農業 フェーズ 2: じょうろ・スプリンクラー・なでる）

仕様: `docs/design/M7-2-farm.md`（第 2 版）。タスク票: `docs/tickets/M7-2.md`。つなぎ目の型: `src/contracts.ts`（「M7-2」の印の所）。前回の例: `docs/tickets/M7-dev-split.md`。ブランチ: `claude/m7-2`（先にやること 済み）。

## 全員のきまり（M7 と同じ）
- 読むもの: `CLAUDE.md`、このファイル、`src/contracts.ts`、仕様書の **自分の節だけ**（§7 の自分の行と、そこに出る AC・節）。
- **担当ファイル以外は編集しない**（下の表）。例外は「先にやること」で入れた仮のものを、自分の担当で本物に直すことだけ。
- 確認は `npm run check:fast`（E2E は回さない）。自分の worktree のブランチにコミット（`git add` はファイル指定）。push はしない。
- `contracts.ts` は変えない。変えたいときは返答で PO に伝える。`docs/design/` は編集しない。
- 乱数はシード付き。毎フレーム new しない。画面の文字は HTML、漢字は `ruby()`。
- 返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## 担当ファイル（仕様書 §7 のとおり）
| 担当 | ファイル | 中身 |
|---|---|---|
| A じょうろ・しめり | `src/farm/FarmSystem.ts`・`src/farm/hook.ts`・`src/farm/watering.ts`（新）、`src/save/`、`src/tools/durability.ts`、`src/storage/StorageSystem.ts`（`water` を読む行だけ）、`src/drops/DropField.ts`（**例外**: `water` を運ぶ・読む行だけ。M7 では だれも変えない だった）、`src/inventory/`（持ち物の保存で `water` を運ぶ所だけ。`items.ts` は B）、`src/camera/heldTools.ts`、`src/fx/waterFx.ts`（新）、`src/ui/waterGauge.ts`・`.css`（新）。`src/ui/hotbar.ts`・`inventoryScreen.ts`・`storageScreen.ts` は **`waterGauge` を呼ぶ 1 行だけ** | くむ・まく（§2.1・§4.3 ②・向きの決め方）、しめりの合わせ（①②③。③は `SprinklerPort`）、ごきげんの倍率（`PetPort`）、保存 `farm.v` 2、`ItemStack.water` の運びと読み、`farm.*` の窓口の中身、設定。AC1〜AC8・AC13・AC17 の `wetSoon`・AC22〜AC24 の農業の分 |
| B スプリンクラー・アイテムの表 | `src/farm/sprinkler.ts`（新）、`src/world/blocks/`・`src/world/render/`、`src/dig/config.ts`（かたさ・めずらしさの行）、`src/inventory/items.ts`・`src/craft/recipes.ts`・`src/drops/rarity.ts`・`src/craft/info/`・`src/ui/itemCategory.ts`・`src/ui/itemArt*`・`src/ui/tooltipModel.ts`、`src/ui/craftPanel.ts`・`.css`、`src/fx/sprinklerFx.ts`（新） | ③の範囲と置く・こわすの追いかけ（`SprinklerPort`）、しぶき、3 アイテムの名前・上限・レシピ・めずらしさ・カテゴリー・説明の表・ツールチップ・絵、U19〜U21、つくる画面（カード 25・マス 28）。AC9〜AC11・AC19・AC20 |
| C なでる・キラキラ・ふりわけ・画面 | `src/dig/rightClick.ts`・`src/dig/DigSystem.ts`（**右クリックのふりわけは C だけ**）、`src/farm/pet.ts`（新）、`src/fx/farmFx.ts`・`farmSounds.ts`・`farmSparkle.ts`（新）、`src/ui/actionHintModel.ts`、`src/ui/` の農業の HUD・合図（`farmHintModel.ts`）・案内画面（A・B の持つファイル以外）、`src/achievements/` | §2.4 の 10 段（4a〜4c は `WateringPort` を呼ぶだけ）、なでる・ごきげん（`PetPort`）、ゆれ・ハート・キラキラ、音（A・B の出来事からも鳴らす）、合図 `fill`、照準の下の案内 4 つ、HUD のハートとうすいしずく、案内画面 3 行、実績（§4.7）、§6.2 の数の直し。AC12・AC14〜AC18・AC21・AC25 |
| つなぎ込み（1 人） | `src/main.ts`、`src/debug/testHook.ts`、`src/contracts.ts`（PO が決めた形のまま） | つなぐ・関係する E2E（m7・m2〈ほる・おく〉・smoke） |

3 人のファイルは かさならない。`src/ui/` の さかいめ: A は 3 ファイルに 1 行ずつだけ、B は アイテム表のファイルだけ、残りの農業の所は C。

## 先にやること で入れたもの（このブランチの最初のコミット）
- `BlockId` に `sprinkler`、`ItemOnlyId` に `watering_can`・`long_watering_can`（うしろに足した）。`ItemStack.water?`。`WateringCanId`・`PetResult`・`Facing` の型。
- `StatKey` に `'water:*'`・`'pet:*'`・`'harvestPet'`。`FarmHintKind` に `'fill'`。`FarmAim` に `happy?`・`wetSoon?`（A が入れる。既存の呼び出しを壊さないよう optional）。`FarmEvent` に `fill`・`pour`・`pet`・`sprinklerPlaced`・`sprinklerBroken`。`RightClickKind` は contracts に移した（`dig/rightClick.ts` は再エクスポート）: `'fill'`・`'pour'`・`'fillHint'`・`'pet'` を足した。
- `M7Settings` に 16 こ（`farmWaterDays` ほか。初期値は §4）。`createM7Settings()` は新しい入れ物もコピーする。
- 仮のもの（本物に直す担当）: `world/blocks/blockTypes.ts` の `sprinkler` の行（固い・こわせる。B が確かめる）、`world/blocks/textures.ts` の `BLOCK_TILES.sprinkler`（`stone` の仮。B が絵を足す）、`dig/config.ts` の `sprinkler`（かたさ 3・レベル 0・uncommon・こわすと 1 こ。B が確かめる）、`ui/farmHintModel.ts` の `fill`（C が文・絵を確かめる）。`items.ts`・`itemCategory`・`rarity`（アイテム）の 3 こは **まだ無い**（B が足す）。テスト 2 つ（`contracts.m7.test.ts`・`world.test.ts`）の ID 並びに `sprinkler` を足した。

## つなぎ目の型と関数名（`src/contracts.ts` M7-2 節）
名前は 担当・PO が変えてよい（変えたら 報告）。
- **B → A: `SprinklerPort`**（`src/farm/sprinkler.ts`）: `covers(x,y,z)`・`list()`・`onBlockChanged(x,y,z,before,after)`・`rescan(world)`。A は ③ をこの口だけで聞く。
- **C → A: `PetPort`**（`src/farm/pet.ts`）: `growFactor`・`isHappy`・`left`・`pet(x,y,z,crop): PetResult|null`・`tick()`・`onCropRemoved`・`serialize(): number[]`・`deserialize(flat, isCrop)`。A の `update` が `tick()` を呼び、育つ計算で `growFactor` を p にかける。保存の `happy` は `serialize()` をそのまま入れる。
- **A → C: `WateringPort`**（`src/farm/watering.ts`）: `canPreview(held, ray: WaterRay, repeat): 'fill'|'pour'|'fillHint'|null`・`fill(slot, at)`・`pour(slot, target, facing:{dx,dz}): tiles`。`water` を へらす のも A。C は 4a〜4c でこれを呼ぶだけ。`WaterRay` = `{throughWater, waterCell, hit}`（目のマスの水は数えない・固いブロックより手前だけ）。
- **出来事**: B・C の出来事も A の `drainEvents()` に集める。A は `emit(e: FarmEvent)` を作り、B・C はそれを呼ぶ（`FarmSystem` に足す必要があれば A が型を提案して PO に伝える）。

## 仮のもので テストする（相手を待たない）
- **A**: `SprinklerPort` は `covers` が決まった表を引く仮、`PetPort` は `growFactor` がいつも 1.1 の仮。
- **B**: `FarmSystem` を import しない（`covers` をユニットで確かめる）。
- **C**: `WateringPort` は `canPreview` が決まった答えを返す仮、`crop()` が表を引く仮でふりわけを確かめる。

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-13 | 先にやること 完了（contracts の M7-2 の印・仮のもの・このファイル）。A・B・C を並列で開始できる |
