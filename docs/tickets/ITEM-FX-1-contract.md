# ITEM-FX-1 つなぎ目の約束（tester → developer）

タスク票 `docs/tickets/ITEM-FX-1.md` の AC1〜AC18 を、テストが決め打ちしている名前・型・窓口。
developer はこの約束どおりに作る（名前を変えたいときは tester に相談）。数は表から読む。テストは数字を書かず表を読む。

## 1. 数の表 `src/content/items/gadgetTuning.ts`（新規）

```ts
export const GADGET_TUNING = {
  lantern: { light: 15 /* ブロックの光の強さ(0〜15)。たいまつ 14 より強い */, noSpawnRadius: 16 /* マス。水平も上下も。この中は妖怪が湧かない */ },
  kite:    { height: 20 /* マス。プレイヤーの足もとからの上空の高さ */ },
  futon:   { sleepSteps: 90 /* ステップ(1/60 秒)。ねている間の長さ。約 1.5 秒 */ },
  omamori: { maxOwned: 1 /* こ。持ち物全体で持てる数 */ },
  waraji:  { jumpHeight: 1.5 /* マス。はいている間のジャンプの高さ(ふだんは 1.25) */ },
} as const;

/** はいている足の防具(なければ null)から、ジャンプの高さを決める。waraji ならば waraji.jumpHeight、それ以外は base */
export function jumpHeightWith(legs: ItemId | null, base: number): number;
```

## 2. アイテム・ブロック

- 新ブロック `lantern` / `futon` / `haniwa`（`BlockId`、`BLOCK_TYPES` に入れる。breakable）。同名のアイテム（既存の GADGETS）が `placeBlock` で置く。こわすと同名アイテム 1 つ。
- 新アイテム `omamori_torn`（やぶれた おまもり）: GADGETS シリーズ（`GadgetId`）、`maxStack: 64`、`wear: 'permanent'`、レシピなし、`category: 'home'`。`ITEM_TYPES` では `omamori` の直後。
- 6 つとも `recipe.works` を外す（はにわも）。`recipe.works === false` のレシピは 1 つも無くなる。info は `later` なし、`how` は「いまは もてる だけ」ではない。説明に数字を書かない。
- おまもりの作り方: すいしょう 3・きん 1・ぬの 2・いと 2（この順: `crystal`, `kin`, `cloth`, `string`）。
- `ItemDef.maxOwned?: number`（新）と `ItemType.maxOwned`。omamori は `GADGET_TUNING.omamori.maxOwned`。
- わらじ: `armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 0 } }`。`ARMOR_SLOT_OF.waraji === 'legs'`。

## 3. ちょうちん（光・湧き）

- `EMISSION[lantern] === GADGET_TUNING.lantern.light`（光はたいまつと同じく 1 マスごとに 1 弱まる）。
- `WorldLight.isDarkForSpawn(x,y,z)` は、`lantern` ブロックから **x・y・z のどれも noSpawnRadius 以内(立方体)** なら必ず false。それより外は今までどおり（夜なら true）。たいまつの 8 マスは変えない。ちょうちんがこわされたら元に戻る(`update()`＋`flush()` のあと)。
- 置ける・落ちる: `digCore.ts` に `lanternSupported(w,x,y,z)`（`torchSupported` ＋ **上**の固いブロック）。`digPlace` は lantern をこれで判定（体と重なっても置ける＝たいまつと同じ）。支えをこわすと `dropUnsupportedTorches` と同様に lantern も落ちて持ち物に戻る。

## 4. ふとん（ねる）

- 新 `src/time/sleep.ts` の `SleepSystem`（`new SleepSystem(time: TimeOfDayImpl, opts?: { steps?: number })`、既定は `GADGET_TUNING.futon.sleepSteps`）:
  - `use(): 'start' | 'notNight' | 'busy'`。時刻が `dusk`・`night` なら `'start'`（ねはじめる）、`day`・`dawn` なら `'notNight'`（何も変えない）、ねている間は `'busy'`。
  - `update()` を 1 ステップごとに呼ぶ。`sleeping(): boolean`、`stepsLeft(): number`、`fade(): number`（0〜1。0 → 1 → 0 と三角に動く。真ん中で 1）、`blocksInput(): boolean`（= sleeping）。
  - 真ん中(fade が最大)で `time.sleepToMorning()` を呼ぶ。終わり(`stepsLeft` 0)で `sleeping()` は false、`fade()` は 0。
- `TimeOfDayImpl.sleepToMorning()`（新）: `dayTick = dayTicks + duskTicks + nightTicks`（= あさの始まり、`phase() === 'dawn'`）にして `day()` を 1 進める。
- `NOT_NIGHT_TEXT = 'よる に ねようね'`（`sleep.ts` から export）。
- `previewRightClick`: ねらいのブロックが `futon` なら `{ kind: 'sleep', item: null }`（`RightClickKind` に `'sleep'` を足す）。置く(`place`)より先。
- 窓口 `window.__rikkun.sleep.get(): { sleeping: boolean; stepsLeft: number; fade: number; notice: string | null }`。`notice` は「よる に ねようね」が出ている間だけその文字、出ていなければ null。

## 5. たこ

- 新 `src/player/kite.ts` の `KiteSystem`（`new KiteSystem(opts?: { height?: number })`）:
  - `toggle(player: Vec3): 'up' | 'down'`。上がっていなければ上げる、上がっていれば戻す。
  - `onHeld(item: ItemId | null)`: `kite` 以外を持ったら戻す。
  - `update(player: Vec3)`（毎ステップ）、`up(): boolean`、`position(): Vec3 | null`（上がっていなければ null。x・z はプレイヤーのまわり、y は `player.y + height` を中心にゆらゆら ±0.5 以内）、`height(player: Vec3): number | null`（`position().y - player.y`）。
  - `solid: false`（当たり判定なし）。妖怪・ダメージには一切さわらない。
- `previewRightClick`: `held === 'kite'` なら（ねらいがなくても）`{ kind: 'kite', item: 'kite' }`（`RightClickKind` に `'kite'`）。たこはなくならない（個数はへらない）。
- 窓口 `window.__rikkun.kite.get(): { up: boolean; position: {x,y,z} | null; height: number | null; solid: false }`。

## 6. おまもり

- `PlayerCombatImpl.die()`: 持ち物のどこかに `omamori` があれば、持ち物も防具も 1 つも落とさず（`dropChance` を引かない、`drops.scatter` に何も渡さない）、`omamori` を 1 つ `omamori_torn` に変える（同じマス）。`death` イベントに `protectedBy: 'omamori'` を付ける。持っていなければ `protectedBy` なし。
- `InventoryImpl.add`: `maxOwned` がある物は、持ち物全体の数が `maxOwned` に達していたら 1 つも入れない（戻り値 = 入らなかった数）。`DropField` はそれで地面に残す。
- `CraftSystem.status(id)` に `limit?: 'haveOne'`（omamori を持っているとき `craftable: false`）。`make('omamori')` は `{ ok: false, reason: 'haveOne' }` で持ち物を変えない（`MakeReason` に `'haveOne'`）。作る画面は `.cp-press.is-disabled` ＋ 理由の文。

## 7. わらじ（ジャンプ）

- `PlayerController.setJumpHeight(h: number | null)`（新）。null なら設定の `jumpHeight`。つなぎ込みは毎ステップ `setJumpHeight(jumpHeightWith(armor.equipped('legs'), settings.jumpHeight))`。

## 8. テストが使う窓口のまとめ（window.__rikkun）

新しく足す窓口は 3 つ: `sleep.get()`・`kite.get()`・`world.darkForSpawn(x, y, z): boolean`（`WorldLight.isDarkForSpawn` をそのまま返す。ちょうちんの E2E 用）。ほか既存: `world.setBlock/getBlock/lightAt`、`inventory`、`armor.set`、`combat.damage/get/events`、`time.get/set`、`player.get/set`、`input.press`、`target.get`、`craft.status/make`。
