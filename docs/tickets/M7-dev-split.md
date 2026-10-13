# M7 開発の担当分け（農業 フェーズ 1）

仕様: `docs/design/M7-farm.md`（第 4 版）。タスク票: `docs/tickets/M7.md`。つなぎ目の型: `src/contracts.ts` の「M7」節（先にやること 済み）。

## 全員のきまり（M6 と同じ）
- 読むもの: `CLAUDE.md`、このファイル、`src/contracts.ts`、仕様書の **自分の節だけ**（§7 の自分の行と、そこに出る AC・節）。
- **担当ファイル以外は編集しない**（下の表）。例外は「先にやること」で入れた仮のものを、自分の担当で本物に直すことだけ。
- 確認は `npm run check:fast`（E2E は回さない）。自分の worktree のブランチにコミット（`git add` はファイル指定）。push はしない。
- `contracts.ts` は変えない。変えたいときは返答で PO に伝える。`docs/design/` は編集しない。
- 乱数はシード付き。毎フレーム new しない。画面の文字は HTML、漢字は `ruby()`。
- 返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## 担当ファイル（仕様書 §7 のとおり）
| 担当 | ファイル | 中身 |
|---|---|---|
| A 農業のしくみ | `src/farm/`（新）、`src/save/` | `createFarmSystem(deps: FarmDeps): FarmSystem`、設定、`farm.*` の窓口の中身（`src/farm/hook.ts`）、保存（`SaveManager` に `farm?: SaveExtra` を足す）、前の保存への置きもの、`farm.makeLegacySave` |
| B ブロックの見た目 | `src/world/blocks/`、`src/world/render/` | 絵（`textures.ts` の `BLOCK_TILES` ほか）、十字の板、固くない・光を通す、みのった作物の明るさの下限、`FarmVisual` |
| C 操作とアイテム | `src/dig/`、`src/inventory/items.ts`、`src/drops/rarity.ts`、`src/craft/recipes.ts`・`src/craft/info/`、`src/tools/`、`src/combat/`（`heal` だけ）、`src/yokai/ai/config.ts`（`YOKAI_DROPS` の行だけ） | 右クリックのふりわけ、すで 3 回、しゅうかく、やせいの やさい、はたけ を こわす、くさ から たね、たべる、くわ、アイテム 9 こ、U16〜U18 |
| D 画面・実績・音 | `src/ui/`、`src/achievements/`、`src/fx/`、`src/camera/heldTools.ts` | アイテム絵 9 こ、カテゴリー（13 色目）、ツールチップ、合図、HUD の まる、案内タブ、実績（分類 9 こ目）、音、§6.2 の M4・M6 の数の直し |
| E 地形 | `src/world/gen/` | `computeFarmPlacement`（`FarmPlacementFn`）、`applyFarmPlacement`（`ApplyFarmPlacement`）、M5 AC の読みかえ |
| つなぎ込み | `src/main.ts`、`src/debug/testHook.ts`、`src/contracts.ts`（PO が決めた形のまま） | つなぐ・E2E |

`src/world/VoxelWorld.ts`・`src/drops/DropField.ts` はだれも変えない（`VoxelWorld.touch` は先にやること で入れた）。

## 先にやること で入れたもの（このブランチの最初のコミット）
- `BlockId` に **13 こ**（`tansu` のうしろ。番号は `BLOCK_TYPES` の順）: `farmland`・`farmland_wet`・`crop_onion`・`crop_tomato`・`crop_pumpkin`・`crop_eggplant`・`wild_onion`・`wild_tomato`・`wild_pumpkin`・`wild_eggplant`・`kakashi`・`kakashi_head`・`saku`。**作物の段階は id に入れない**（段階は `FarmSystem.crop().stage`）。しめり は id（`farmland` / `farmland_wet`）。
- `ItemOnlyId` に **9 こ**（`haniwa` のうしろ）: `seed_onion`・`seed_tomato`・`seed_pumpkin`・`seed_eggplant`・`onion`・`tomato`・`pumpkin`・`eggplant`・`kuwa`。
- 仮のもの（本物に直す担当）: `world/blocks/blockTypes.ts` の 13 行（B が `solid`・`breakable`・名前を確かめる。仮は 作物・やせい・かかし = 固くない・こわせない、さく = 固くない・こわせる、はたけ = 固い・こわせる）。`dig/config.ts` の hardness・harvestLevel・rarity（C。仮: 作物・やせい・かかし = null〈ほれない〉、はたけ 0.5、さく 1）。`achievements/defs.ts` の `CATEGORY_LABEL.farm`（D。`CATEGORY_ORDER` への足しも D）。`world/world.test.ts` の M7 絵の除外（B が絵を足したら `M7_IDS` を消す）。`items.ts`・`itemCategory`・`rarity` の 9 こ は **まだ無い**（C と D が足す。型は通る）。
- `VoxelWorld.touch?(x,y,z)`（id そのままで チャンクだけ作り直す。`ArrayVoxelWorld` に実装済み）。
- `PlayerCombat.heal(amount): number`（`PlayerCombatImpl` に実装済み。C は変えなくてよい）。
- 設定: `M7Settings`・`M7_SETTING_DEFAULTS`・`createM7Settings()`（§4.3〜§4.5 の名前と初期値。13 こ）。つなぎ込みが `createSettingsHook` の extras に渡す（M6 と同じ）。
- 記録: `StatKey` に `till`・`plant:*`・`harvest:*`・`harvestWet`・`eat:*`・`wild:*`・`seedFrom:*`（`visit:oldfarm` は今の `visit:${string}`）。`AchievementCategory` に `'farm'`。
- 道具: `CROP_KINDS`・`CROP_BLOCK`・`WILD_BLOCK`・`SEED_ITEM`・`VEG_ITEM`・`cropKindOfBlock(id)`・`seedKindOfItem(id)`・`vegKindOfItem(id)`。

## つなぎ目の型と関数名（`src/contracts.ts` M7 節）
**A → みんな: `FarmSystem`**（`createFarmSystem(deps: FarmDeps)`）
- 聞く: `crop(x,y,z)`〈作物のマス。やせいは stage 3〉・`crops()`・`soil(x,y,z)`〈はたけ のマス〉・`settings()`・`aim(x,y,z)`〈HUD: `{dots,ripe,wet,dark}`〉・`growTicks(kind,wet)`・`grassSeedKind(x,z)`・`placedM7()`。
- C が呼ぶ（`DigFarmPort`）: `till(x,y,z)`〈くさ・つち→はたけ。上が くうき でなければ false〉・`noteTillPress(x,y,z,count)`・`plant(x,y,z,kind)`〈**座標は はたけ のマス**。作物は 1 つ上〉・`harvest(x,y,z)`〈作物のマス。`{ok:true,kind,wild,wet,items}` か `{ok:false,reason:'notRipe'|'none'}`。作物を くうき にして はたけ は のこす〉・`onBlockBroken(x,y,z,id)`〈C が `air` にした**あと**に呼ぶ。返す `ItemStack[]` を持ち物へ〉・`grassSeed(x,z)`〈くさ を こわした列。たね の `ItemId` か null〉・`eatHeal(item)`〈やさい でなければ 0〉・`noteEat(item,heal,at)`・`noteHint('till'|'full',at)`。**たねを へらす・持ち物へ入れる・入りきらない分を `scatterItem` で出す・体力を変える のは C**（A は 持ち物を持たない）。
- 出来事: `drainEvents()`（D が 音・つぶ・合図・実績に使う）・`peekEvents()`（`farm.events()`）。`FarmEvent` の種類: `till`・`tillPress`・`plant`・`stage`・`harvest`・`wild`・`notRipe`・`wet`・`eat`・`seedFound`・`hint`・`visitOldFarm`。
- 毎ステップ: `update({playerPos})`。つなぎ込みが 止まっているあいだ呼ばない・もちもの画面は 4 ステップに 1 回（`screenSteps`）。
- 保存: `serialize()`・`deserialize(data)`（`SaveManager` の `farm?: SaveExtra`）。
- `noteSeedFound('yokai'|'oldfarm', item, at)` は つなぎ込みが 呼ぶ（からかさ・ろくろくび の おとしもの を拾った／ふるい たんす から たね を 持ち物へ うつした とき）。`grass` は A の `grassSeed` が出す。
- 段階が変わったら A が `world.touch?.(x,y,z)`。しめりが変わったら `setBlock` で `farmland` ↔ `farmland_wet`。

**C が受け取る口（`DigM4Deps` に足した 2 つ。どちらも 無ければ M6 のとおり）**: `farm?: DigFarmPort`・`vitals?: DigVitalsPort`（`hp`・`maxHp`・`heal`）。C は 右クリック §2.7 の順で これらを使う。すで 3 回の数は `farm.settings().farmHandTillPresses`・`farmHandTillResetTicks`。

**E → A / つなぎ込み**
- `computeFarmPlacement: FarmPlacementFn = (seed, pristine?) => FarmPlacement`（純粋。世界は変えない。`pristine` が無ければ 同じシードで 島を作り直す）。`FarmPlacement = { wild: [{x,y,z,kind}], oldFarm: { blocks, tansu, tansuItems, kakashi, box, tier } | null }`。`blocks` は 置くマス ぜんぶ（地面を そろえる分・はたけ 12・さく・かかし・たんす。下から上の順）。
- `applyFarmPlacement: ApplyFarmPlacement = (world, placement) => void`（島を作った直後に 1 回。たんす の中身は 置かない）。
- 新しい世界: つなぎ込みが 島を作る → `computeFarmPlacement(seed, {world, info})` → `applyFarmPlacement` → A の `fillTansu`（`FarmDeps.fillTansu`。`StorageSystem.set` を つなぐ）で 中身を入れる → 印をつける。前の保存: A が `FarmDeps.placement`（= E の関数）を 使って §4.5 (5) で 置く。

**B → A / D: 見た目**
- `CropStageSource { stageAt(x,y,z): CropStage|null }`: A の `FarmSystem` が合う形。B の `WorldRenderer` が `setCropStageSource(src)` で受け取り、作物の絵（`crop_<kind>_<stage>`）と 明るさの下限（3 だんかい・やせいの やさい だけ。`farmRipeMinBrightness`）を決める。
- `FarmVisual { texture(name), look(x,y,z) }`: B が `createFarmVisual(...)` で作る。A の `farm.texture`・`farm.look` はそのまま 返す。

## 各担当の仮のものの作り方（相手のコードを待たない）
- **A**: `FarmDeps` の `world` は `ArrayVoxelWorld`、`light` は「いつも N を返す」仮（`{skyLight:()=>N, blockLight:()=>0, level:()=>N}`）、`fillTansu` は配列に ためる関数、`placement` は 固定の `FarmPlacement` を返す仮、`tick` は数を 1 つ ふやす関数。E・B・C を待たない。
- **B**: `CropStageSource` は 固定の段階を返す仮（`{stageAt:()=>3}`）。`FarmSystem` を import しない。
- **C**: `DigFarmPort` は 仮のもの（`crop`・`soil` が 持っている表を引く、`harvest` が 決まった `items` を返す、など）を テストの中で作る。`vitals` も 仮。`PlayerCombatImpl.heal` は 実物がある。
- **D**: `FarmEvent` の 配列を テストで 作って 音・合図・実績に流す。`aim` は 固定の `FarmAim` を返す仮。
- **E**: 他の担当に 頼らない。`generateIsland` の 結果（`world` と `IslandInfo`）だけで `FarmPlacement` を作る。A の `fillTansu` は 使わない。

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-12 | 先にやること 完了（contracts の M7 節・仮のもの・このファイル）。A〜E を並列で開始できる |

## main（PR #15）を取りこんだ（2026-10-12）
- `origin/main` を merge 済み（衝突なし、`check:fast` 925 件通過）。`contracts.ts` の M7 節は main の変更の影響なし。
- 使う口（main の新しい形）: `ArmorSystem.equipFromSlot(i)`（防具をきる。C の右クリック順 3 番はこれ）。`Inventory.add(item, n)` は **n が 0 以下なら何もせず 0 を返す**（しゅうかく・たね で 0 こを渡しても安全。「入った数 = n − 返り値」を使ってよい）。`DigSystem` は もちもの画面を開いていても 1〜9 でえらべる（`gate.blocksInput()` を見る）。C は ふりわけ（§2.7）をこの新しい形の上に足す。

## 申し送り（各担当の完了報告から）
### B（m7-b）
- `renderer.setCropStageSource({stageAt: (x,y,z) => farm.crop(x,y,z)?.stage ?? null})`（A の FarmSystem には stageAt が無いので橋を作る）。
- `createFarmVisual({ world, light: renderer.light, crops, ripeMin: () => settings.farmRipeMinBrightness, itemIcon })`。itemIcon は D のアイテム絵を返す関数（渡さないとアイテム id で例外）。
- `farmRipeMinBrightness` を変えたら `renderer.setRipeMinBrightness(v)`（毎ステップでも可）。段階が変わったら A が `world.touch`。
- `src/world/light/opacity.ts` に 1 行（十字の板は光を通す）。E2E で AC25 の明るさを確かめる。
### A（m7-a）
- `createFarmSystem(deps: FarmDepsM7)`：`regions: () => island.regions()` も渡す（PO 了承: contracts は変えず FarmDepsM7 で受ける）。
- 保存: `SaveDeps.farm` に farm を渡す。読みこみは `deserialize(data.farm)` → `placeLegacy(changedSet)`（changedSet は保存の差分マスの番号の集合。置いたら次の保存で書く）。
- 新しい世界: 島 → E の `applyFarmPlacement` → `farm.noteNewWorldPlaced(placement)`。
- `createFarmHook({ farm, visual, aimed: () => dig.target().block ?? null, give, store, seed, world, placement })` を `__rikkun.farm` に。
- `update` は止まっている間は呼ばない。もちもの画面は 4 ステップに 1 回。
- `farm.events()` は直近 500 件のログ（drain しても消えない。PO 了承）。
### E（m7-e）
- 新しい世界: 島 → `computeFarmPlacement(seed, {world, info})` → `applyFarmPlacement` → `fillTansu(placement.oldFarm.tansuItems)` → 印。A の placement に `computeFarmPlacement` をそのまま渡す。
- `box.y0` は h₀−3（地層の差分のため）。A・つなぎ込みは `box.y0` を使う。
- PO 決定（E の仕様の問題）:
  1. ふるい はたけ は **全シードで必ず置く**（種の入手先なので）。段 0〜2 で見つからないときの 最後の段 3 を足す: 8×8（+まわり 1 列）に入る **木を差分として取りのぞいて** 置いてよい（木は島の生成物なので、前の保存の「変えていない」判定にも矛盾しない）。それでもだめなら 距離 7〜16・北から 60° まで広げる。7 と 9 も置けることをテストで固定。
  2. 岩山の範囲の読みかえ（8×8 のてっぺんが ぜんぶ くさ）で よい。
  3. h₀−3 を dirt にする差分と box.y0 = h₀−3 で よい。
- E 追加: 段 3（木を差分でとりのぞく）で 20 シードすべて置ける（7・9 が段 3）。contracts の `tier` を `0|1|2|3` に直すのは つなぎ込み。A・つなぎ込みは tier===3 と、box.y1 が木の高さまで広がることを前提に読む。
### C（m7-c）
- `DigM4Deps` に `farm: FarmSystem` と `vitals: PlayerCombat` を渡す（無いと M6 のまま）。
- 右クリックの順: たんす → かまど → 防具 → たがやす → まく → 合図 → たべる → 置く（previewRightClick と同じ）。左クリック `harvest`（絵はかごの代わりに tomato、語「とる」）。
- itemCategory の 9 こ（D）が入るまで `itemCategory.test.ts` が 1 件落ちる。
- D へ: 説明の表の「どこで」（たねの入手先）と たねの「そだつ はやさ」メーターは未実装。
