# WEAPON-2 開発の担当分け（弓の山なり・刀の構えと技・道具のたいきゅう）

仕様: `docs/design/WEAPON-2.md`（第 5 版）。タスク票: `docs/tickets/WEAPON-2.md`。つなぎ目の型: `src/contracts.ts` の末尾「WEAPON-2」節ほか（先にやること 済み）。
土台は M7 の入った `main`（ブランチ `claude/weapons`）。M7 のテストも通すこと。

## 全員のきまり（M7 と同じ）
- 読むもの: `CLAUDE.md`、このファイル、`src/contracts.ts`、仕様書の **自分の節だけ**（§7 の自分の行と、そこに出る AC・節）。
- **担当ファイル以外は編集しない**（下の表）。例外は「先にやること」で入れた仮のものを、自分の担当で本物に直すことだけ。
- 確認は `npm run check:fast`（E2E は回さない。関係する spec だけ回すのはよい）。自分の worktree のブランチにコミット（`git add` はファイル指定）。push はしない。
- `contracts.ts` は変えない。変えたいときは返答で PO に伝える。`docs/design/` は編集しない。
- 乱数はシード付き。毎フレーム new しない。画面の文字は HTML、漢字は `ruby()`。入力は Action 経由。
- 返答は「作ったファイル・要点・テスト結果・ブランチ名・つなぎ込みへの申し送り・仕様の問題」を短く。

## 担当ファイル（仕様書 §7 のとおり。M7 のあとの形）
| 担当 | ファイル | 中身 |
|---|---|---|
| A 刀のしくみ | `src/tools/blade/`（新）、`src/combat/PlayerCombat.ts`（刀を持っているとき今のパンチを使わない分かれ道と、なぎなた・つるはし・くわ・ほかのパンチが当たったとき `wearHeld` を呼ぶ所だけ） | `createBladeSystem(deps: BladeDeps): BladeSystem`、かまえ・わざ・先行入力・おしつづけ、当たりの形（§4.1・§4.3）、かべごし、ダメージ・ノックバック、歩く倍率と動けない（`motion()`）、`blade.*` の中身（`src/tools/blade/hook.ts`）。AC1〜AC12・AC26 の刀・なぎなた・つるはし |
| B 弓 | `src/tools/ToolSystem.ts`、`src/tools/bow/`（新）、`src/tools/config.ts`（ゆみの古い名前を消すだけ）、`src/tools/hook.ts`・`index.ts` | `createBowSystem(deps: BowDeps): BowSystem`、`ToolSystem.bow()`、段・放物線・当たり・ささった や と拾う、`bow.*`。AC13〜AC16・AC18 の歩く速さと持ちかえ |
| C 人形と一人称 | `src/camera/`（`dollAnim.ts`・`BlockDoll.ts`・`heldTools.ts`・`CameraRig.ts`・`hook.ts`） | 両手持ち・刀の向き・足の前後・ひざ、§3.1・§3.2 の時間表、弓のしなり 3 段、`CameraRig.setWeaponSource(src: WeaponVisualSource)`、`camera.dollPose/firstPersonTip/fov/bowPose/bowHand`。AC17・AC19・AC20・AC18 の FOV |
| D 画面・音・演出 | `src/ui/`、`src/fx/`、`src/achievements/`、`src/craft/info/` | かまえのしるし・わざの名前・きせき・星・画面のゆれ・ささった や、たいきゅうのバー・「！」・こわれた演出・合図チップ・ログ、音（§3.4）、説明の表・ツールチップ・案内画面、実績 4 こ（`toolBroken`・`wearTotal`・`armorBroken`）。AC21〜AC23・AC29・AC31 |
| E 入力と妖怪 | `src/input/`（`actions.ts` は `stanceNext` を入れ済み。ヒントの文など残りがあれば）、`src/yokai/ai/`、`src/yokai/hook.ts` | `YokaiManager.damage(id, amount, from, knock?)` の本物（押す距離・上への初速。ちょうちんは押し上げられてから元の高さへ。ぬりかべは押されない）、`yokai.setHp(id, hp)`。AC9 の妖怪の動き |
| F たいきゅう | `src/inventory/Inventory.ts`・`hook.ts`、`src/tools/durability.ts`、`src/drops/DropField.ts`、`src/craft/ArmorSystem.ts`・`craft/hook.ts`、`src/save/`（へった量の保存に要る所だけ）、`src/combat/PlayerCombat.ts` の **`hurt()` の防具の 1 か所だけ**（`armor.cut(kind)` → `armor.cut(kind, amount)`。`CombatArmorPort.cut` の型も同じ行で） | `wearHeld`/`wearSlot`/`durability`/`drainWearEvents`、`ItemStack.wear` を動かす・たんす・すてる・ふくろ・保存で保つ、`itemClassOf`・`maxDurability`、防具の `cut(kind, amount)`（先にカット→あとでへらす）・`equippedStack`・`durability`・`ArmorSnapshot.wear`・こわれる。`inventory.durability/setDurability/itemClass`・`armor.durability/setDurability`。AC25〜AC28・AC30・AC32 |
| つなぎ込み | `src/main.ts`、`src/debug/testHook.ts`、`src/dig/DigSystem.ts`、`src/contracts.ts`（PO が決めた形のまま） | 設定の入れ物（`createW2Settings()` を `createSettingsHook` の extras へ）、`blade`・`bow` を毎ステップ回す（`BladeStepContext`/`BowStepContext` を作る）、ひだりクリックのふりわけ（§2.1 の 6。刀: 手前が妖怪→`techPressed`/`techHeld`、作物→しゅうかく、ブロック→ほる）、`motion()` をプレイヤーの速さ・ジャンプにかける、突きのふみこみ、ブロックをこわしたら `wearHeld`、くわで たがやしたら `wearHeld`、`weaponVisualSource` を `CameraRig` へ、E2E、§6.2 の今までのテスト直し |

`src/contracts.ts`・`docs/design/` はだれも変えない。`items.ts` は F も さわらない。

## 先にやること で入れたもの（このブランチの最初のコミット）
- **Action**: `stanceNext`（`KeyR`）。`ACTIONS`・`DEFAULT_KEY_BINDINGS` に入れ済み。
- **持ち物**: `ItemStack.wear?: number`（へった量。なし・0 = 新品）。`Inventory` に `wearHeld(n)`・`wearSlot(slot, n)`（どちらも `WearResult | null`。たいきゅうで へらない道具は null で何もしない）・`durability(slot): Durability | null`・`drainWearEvents()`・`peekWearEvents()`。`InventoryImpl` は **仮**（null と [] を返すだけ）。
  - `WearResult = { max, left, worn, broke, low }`（`worn` = 実際にへった量、`broke` = 0 になってマスが空になった、`low` = このとき はじめて のこり わずか）。
  - 0 になった行動は ちゃんと効く: **呼ぶ側が 先に効かせてから `wear*` を呼ぶ**。
  - `WearEvent = { type: 'wearLow' | 'toolBreak', tick, item, slot: number | ArmorSlot }`。
- **なかま・値**: `ItemClass = 'consumable' | 'durable' | 'permanent'`、`Durability = { max, left }`。`src/tools/durability.ts` に `itemClassOf(item)`（**仮**: いつも consumable）と `maxDurability(item, table)`（本物）。
- **防具**: `ArmorSystem.cut(kind?, amount?)`（`amount` = 元のダメージ。**カットを先に返し、そのあとでふせいだ防具をへらす**。`amount` なしの古い呼び方はへらさない）・`equippedStack(slot): ItemStack | null`・`durability(slot)`・`drainWearEvents()`・`peekWearEvents()`。`ArmorSystemImpl` は **仮**（`equippedStack` は `{item, count:1}`、ほかは null / []）。`ArmorSnapshot.wear?: Partial<Record<ArmorSlot, number>>`（`src/craft/ArmorSystem.ts`。前の保存には無い = 新品。`serialize()` も同じ `wear` を足してよい）。
- **妖怪**: `YokaiKnock = { dist, up }`。`YokaiWorld.damage(id, amount, from, knock?)`。省くと今までどおり（水平 1.0・上 0）。`YokaiManager` は **仮**（4 つ目を受けて無視する）。
- **動きの制限**: `PlayerMotionMod = { speedMul, jumpLocked }`（`BladeSystem.motion()`・`BowSystem.motion()`。つなぎ込みが掛ける）。
- **刀**: `BladeStance`('chudan'|'jodan'|'gedan')・`BladeTech`('thrust'|'kesa'|'kiriage')・`BladePhase`('idle'|'switch'|'startup'|'active'|'recovery')・`BladeState`・`BladeShapeInfo`・`BladeEvent`（`techStart`・`techHit`・`techMiss`・`stance`・`cancel`）・`BladeStepContext`・`BladeDeps`・`BladeSystem`。
- **弓**: `BowStage`(0〜3)・`BowState`・`BowPose`・`ArrowInfo`・`StuckArrowInfo`・`BowEvent`（`drawStart`・`stage`・`arrowShot`・`arrowHit`・`arrowStick`・`arrowEnd`・`dryRelease`・`noArrow`・`pickup`）・`BowStepContext`・`BowDeps`・`BowSystem`。`ToolSystem.bow?(): BowSystem`。
- **見た目**: `WeaponVisualSource = { blade(): BladeState; bowPose(): BowPose }`（C の `CameraRig` が読む。つなぎ込みが `{ blade: () => blade.state(), bowPose: () => bow.pose() }` を渡す）。
- **SwingAnim**: `'kesa' | 'kiriage' | 'stance'` を足した（刀のわざ・かまえかえで `drainSwings` に積む）。`CameraRig.pumpSwings` に 仮の分岐（kesa/kiriage → slash、stance → 何もしない）を入れた。C が本物に直す。
- **記録**: `StatKey` に `toolBroken`・`wearTotal`・`armorBroken`。数える場所は D（`toolBreak` の出来事から。防具は slot が `ArmorSlot` で見分ける）。
- **設定**: `W2Settings`・`W2_SETTING_DEFAULTS`・`createW2Settings()`（毎回ふかいコピー）。名前は仕様書どおり: `bladeTech`・`stanceSwitchTicks`(8)・`bladeBufferTicks`(8)・`bladeMoveMul`(`{thrust:0.7, kesaStartupActive:0.3, kesaRecovery:0, kiriage:0.5}`)・`thrustLunge`(0.25)・`bladeAimReach`(4.5)・`bladeShape`・`bladeDamageMul`・`bladeKnock`(`[距離, 上の初速]`)・`bowStageTicks`・`bowSpeed`・`bowDamage`・`bowKnock`・`arrowGravity`(20)・`arrowLifeTicks`(600)・`bowNockTicks`(10)・`arrowStuckTicks`(1800)・`arrowStuckMax`(32)・`arrowPickupRange`(`[1.2, 2]`)・`bowMoveMul`(0.5)・`bowBend`・`toolDurability`・`toolWear`・`wearLowRatio`(0.1)。各担当はこの入れ物を deps で受け取って読む（`settings.set` で変えたらすぐ効くよう、同じオブジェクトを読む）。今の `bowDrawTicks`・`bowInterval`・`arrowSpeed`・`arrowRange`・`arrowDamage`（`tools/config.ts`）は B が使わなくして消す。
- テスト: `src/contracts.w2.test.ts`（R キーと設定の初期値）。`check:fast` 1157 件通過。

## つなぎ目の型と関数名
**A → つなぎ込み: `createBladeSystem(deps: BladeDeps): BladeSystem`**
- 毎ステップ `blade.update(ctx: BladeStepContext)`。`item` が刀でなければ わざ・かまえは おわる（`cancel` の出来事）。`techPressed`/`techHeld` は つなぎ込みが ふりわけ（§2.1 の 6）で「わざ」と決めたときだけ立てる。`stancePressed` は `stanceNext`。
- `deps.yokai()` の `list()`・`raycast`・`damage(id, amount, from, {dist, up})` を使う。妖怪の当たりの箱は `src/yokai/ai/config.ts` の `KIND_AI`（`radius`・`height`）と `AI_CONST.hitPad`、位置は `YokaiInfo.position`・`yawDeg`・`scale`（仕様 §4.1 の「必ず当たる／当たらない」だけ守る）。
- 当たったら `deps.onHit({tech, count})` を 1 わざ 1 回だけ（つなぎ込みが `inventory.wearHeld(toolWear.blade.hit)` へ）。空振りは呼ばない。
- 出来事 `drainEvents()`（D）・`peekEvents()`（`blade.events()`）。`state()`・`shape()`・`setStance()`・`motion()`。
- 刀以外のパンチ（なぎなた・つるはし・くわ・ほか）は 今の `PlayerCombat` の線 1 本のまま。当たったとき `wearHeld(その道具の hit)` を呼ぶ（A。`inventory` は `CombatDeps` にある）。

**B → つなぎ込み: `createBowSystem(deps: BowDeps): BowSystem`**（`ToolSystem` が持ち `bow()` で返す）
- `bow.update(ctx: BowStepContext)`。や は `deps.inventory` で数える・へらす。うったら `deps.onShot()`（つなぎ込みが `wearHeld(toolWear.bow.shot)`）。段 0 で はなす・や 0 本は呼ばない。
- 妖怪へは `damage(id, 段のダメージ, from, {dist: 段のノックバック, up: 0})`。実績 `arrowShot`/`arrowHit` は 今の 出来事の 形のまま D がつなぐ。
- 見た目: `pose()`（C）、`arrows()`・`stuck()`（D の `arrowVisuals`）、`drainEvents()`（D の音）。

**F → みんな**: `inventory.wearHeld(n)`・`wearSlot(slot, n)`・`durability(slot)`、`armor.cut(kind, amount)`・`equippedStack`・`durability`。`drainWearEvents()` は D が毎ステップ読む（持ち物と防具の 2 本）。

**E → A・B**: `damage` の 4 つ目の引数。AC9: 水平の距離は 10 ステップかけて押す、上の初速は 妖怪の落下に乗せる。

**C ← A・B**: `WeaponVisualSource`。C は `BladeState`（`stance`・`tech`・`phase`・`frame`・`switchFrom`）と `BowPose` だけ読めば絵が決まる。

## 各担当の仮のものの作り方（相手のコードを待たない）
- **A**: `YokaiWorld` は 固定の位置・箱を持つ 仮（`tools.test.ts` / `PlayerCombat.test.ts` の `FakeYokai` と同じやり方で `damage` の引数を記録）、`world` は `ArrayVoxelWorld`、`weaponDamage` は表を引く関数、`onHit` は 呼ばれた数を記録、`tick` は数を 1 つ ふやす関数。B・E・F を待たない。
- **B**: `YokaiWorld` は同じく仮。`inventory` は `InventoryImpl`（`add`/`remove`/`count` は本物）。`onShot` は回数を記録。平らな床は `ArrayVoxelWorld`。AC14 のユニットは広い床の仮の世界で。
- **C**: `WeaponVisualSource` は 固定の `BladeState`/`BowPose` を返す仮（テストでは フレームごとに 値を入れる）。`createBladeSystem`/`createBowSystem` を import しない。
- **D**: `BladeEvent`・`BowEvent`・`WearEvent` の配列を テストで作って 音・画面・実績に流す。`Durability` は 固定の値の仮。`Inventory.durability` が null を返す間は、バー用の関数に `(slot) => Durability | null` を渡す形にしてテストする。
- **E**: 他の担当に頼らない。`YokaiManager` 単体のテスト（`ai.test.ts`）で 4 つ目の引数の効き（距離・上の初速・ぬりかべ）を確かめる。
- **F**: `ItemStack.wear` を 持ち物・たんす・ふくろ・保存で保つ ユニットテスト。`armor.cut(kind, amount)` は `ArmorSystemImpl` 単体で。ほかの担当を待たない。
- **つなぎ込み**: 全員の ブランチが入ってから。

## 経過
| 日付 | 内容 |
|---|---|
| 2026-10-13 | 先にやること 完了（contracts の WEAPON-2 節・仮のもの・このファイル）。A〜F を並列で開始できる |

## 申し送り（各担当の完了報告から）
### E（w2-e）
- A は `yokai.damage(id, 引く量, from=プレイヤー位置, {dist, up})`。省くと水平 1.0・上 0。ぬりかべは押されず浮かない。続けて damage すると押し・浮きは上書き。
- `yokai.setHp(id, hp)`（最大を超えて可、0 以下は 1）を `__rikkun.yokai` に追加済み。
### F（w2-f, 701efa7）
- main.ts: `new InventoryImpl({ settings: () => w2Settings, tick })`、`new ArmorSystemImpl(inv, craftConfig, { settings: () => w2Settings, tick })`（無くても初期値で動く）。
- `inventory.drainWearEvents()`・`armor.drainWearEvents()` は D が毎ステップ読む。`peekWearEvents()` は別ログ（256 件、drain で消えない）。
- `Inventory.add` は wear を運べない。wear つきは `addStack(inv, stack)`（src/tools/durability.ts）。main.ts の scatter（910 行付近）が `{item,count}` を作り直しているので wear を保つよう直す。
- testHook の型に inventory.durability/setDurability/itemClass/events と armor.durability/setDurability/events。
- 担当表の外: PlayerCombat の die()（ふくろの wear）、StorageSystem（たんすの wear）を F が直した。
### B（w2-b）
- 弓は `ToolSystemImpl.step` が今までどおり `bow.update` を呼ぶ（別に呼ぶと二重）。`onShot` は中で `inventory.wearHeld` に接続済み（二重にしない。上書きは `ToolDeps.onBowShot`）。`ToolDeps.settings` に同じ W2Settings を渡す。
- `createToolHook` の `bow: {state, events, arrows, stuck}` を testHook に。`ArrowEvent` は `BowEvent` の別名、`arrowEnd` の traveled/reason/id は無くなった（E2E・main.ts の確認）。
- `config.ts` の `arrowDamage`・`arrowRange` は @deprecated で残してある（D の build.ts と main.ts:529 を直したら消す）。
### A（w2-a）
- 最初に刀を持つ前に `blade.update` を 1 回呼ぶ。毎ステップ `ctx.item` に今の持ち物。`techPressed/techHeld` は §2.1-6 のふりわけで「わざ」の時だけ。
- 左クリックのふりわけは `PlayerCombat.aimedYokai(eye, dir, blockDistance)`（刀のとき 4.5）。
- 刀がこわれた同じステップで null にしたいときは `wearHeld` のあと `update({item:null})` を呼び直す。ほる分の `wearHeld(blade.block)` は DigSystem 側（つなぎ込み）。
- 突きの `deps.lunge(dx,dz)` はつなぎ込みが実装（かべで止める）。
- `tools.test.ts` の古い M4 テスト 2 件（かたな・ぼくとうのパンチ前提）は、つなぎ込みが §6.2 のとおり AC2〜AC8 に置きかえる。
