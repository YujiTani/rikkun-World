import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, ItemStack, Vec3 } from '../contracts';
import { PanelOrder } from '../duo/panelOrder';
import { InventoryImpl } from '../inventory/Inventory';
import { SAVE_VERSION } from '../save/SaveManager';
import { StorageSystem } from '../storage/StorageSystem';
import { CRAFT_DEFAULTS } from './config';
import { CraftSystemImpl } from './CraftSystem';
import { FurnaceWorld } from './FurnaceWorld';

/**
 * COOP-1 4c（docs/design/COOP-1.md §3.3「4c の しくみ」・§6・§8 の 4c の 宿題 1・2・3・AC93）の 先行テスト（赤）。
 * かまどの 中身（じゅんばん・やいている とちゅう・待っている 物）を 1P の つくる から **世界に 1 つの 物** に 分け、
 * 1P・2P の つくる（CraftSystemImpl）が 同じ 物に 入れる。やけた 物は「入れた 人」の もちものへ。
 *
 * ---- 実装への 約束（新しい ファイル src/craft/FurnaceWorld.ts。CraftSystem.ts の 中の かまど の 部分を ここへ 出す）----
 *   class FurnaceWorld
 *     constructor(d: {
 *       world: Pick<VoxelWorld, 'getBlock'>
 *       inventoryOf: (who: 1 | 2) => Inventory         … やけた 物の 届け先（入れた 人の もちもの）
 *       joined: () => boolean                           … 2P が いるか。false の あいだは 入れた 人が 2 の 物も 1P へ（やけた 物も 待っている 物も。つぎの update から）。
 *                                                          2P の パッドが ぬけて いる だけ（2P は まだ いる）なら true の まま
 *       onDelivered?: (who: 1 | 2, item: ItemId, count: number) => void
 *                                                       … やけた 物が **実際に 入った** ときに その もちものの 持ち主（who）と 入った 数だけ。
 *                                                          「ぽん」（かまどから 絵が とぶ）・ばんざい・ひろった ログ（1P だけ）の 受け口。who は 受け取った 人
 *       config?: CraftConfig                            … bakeTicks・bakeQueueMax・fuelOrder は 1P と 同じ 表（CRAFT_DEFAULTS）
 *       requestSave?: () => void
 *     })
 *     update(): void                       … 世界の かまどを 1 ステップ すすめる。**毎ステップ ちょうど 1 回**（配線が 呼ぶ）
 *     view(x, y, z): FurnaceView | null    … 今の `furnaceAt` と 同じ 形（かまどの ブロックで なければ null）
 *     positions(): Vec3[]
 *     serialize(): unknown / deserialize(data: unknown): void   … 保存の 形は 下
 *   CraftSystemImpl（src/craft/CraftSystem.ts）の 変更:
 *     CraftDeps に 足す:  furnaces?: FurnaceWorld   … 渡すと その 世界の かまどに 入れる / 見る。渡さない ときは 今まで どおり 自分だけの 世界を 内に 持つ（1 人の 動きは 今の まま）。
 *                         who?: 1 | 2               … 入れる 人（既定 1）。bake が じゅんばんに 入れる「入れた 人」
 *     - bake / clickBake / furnaceAt / furnaceFxEntries / furnacePositions / openFurnace / closeFurnace / openedFurnace は 今の 窓口の まま。`opened` は 画面ごと（1P と 2P で 別）。
 *     - **update() は 渡された 世界の かまどを すすめない**（2 つの つくる が それぞれ すすめて 2 倍速に しない。すすめるのは FurnaceWorld.update() だけ）。
 *       渡さない ときは 今まで どおり update() で すすむ。
 *     - furnaceBroken(x, y, z): 中の 材料・ねんりょう・待っている 物は **この つくる の もちもの**（＝こわした 人）へ。入らない 分は drops.scatter。世界の かまどの 記録は 消える。
 *       （2P が こわす とき 配線は 2P の つくる を `createP2Dig` の `m4.craft` に わたす）
 *     - 出来事 `bakeStart`（先頭が かわる とき）・`bakeDone` は、その 1 こを 入れた 人（やけた 物を 受け取る 人）の つくる の `drainEvents()`・`takeFurnaceHookEvents()` に 出る
 *       （2P の 分は p2Craft.step が 実績へ 流す）。
 *     - serializeFurnaces() / deserializeFurnaces(data) は 世界の かまどの serialize / deserialize に つなぐ（保存の 配線は 今の まま 1P の つくる から 呼んでよい）。
 *   保存の 形（§6）: 今の `{ x, y, z, queue: [{ recipe, fuel }], progress, done: [{ item, count }] }` の
 *     queue の 1 こ 1 こと done の 1 こ 1 こに **省ける** `by`（2P の 物だけ `by: 2`。1P は 書かなくても 書いても よい）を 足す。
 *     読む とき: `by` が ない・2 以外（1・3・'x'・null…）は 1P。`SAVE_VERSION` は 上げない。
 *   出来事の 届け口（レビュー指摘 1）: FurnaceWorld に `listen(who: 1 | 2, sink: (e: CraftEvent) => void): () => void`（戻り値は 登録を やめる 関数）。
 *     CraftSystemImpl は 作る とき `furnaces.listen(who, e => this.emit(e, 'furnace'))` で 自分を 登録する（`who` の 既定は 1）。
 *     届け先は「やけた 物を 受け取る 人」: `joined()` が true なら 入れた 人、false なら（2P の 物でも）1P。bakeStart は 先頭に なった 1 こを 入れた 人〔の 受け取り先〕へ。
 *     1 人の 遊び（furnaces を 渡さない）は 今までどおり 自分の 世界に 自分で 出す。
 *   1 人の 遊びが かわらない 約束（レビュー指摘 2）:
 *     - 配線は `fw.update()` を 今の `craft.update()` の **すぐ あと**に、1 人でも 毎ステップ ちょうど 1 回 呼ぶ（2P の craft.update も 呼ぶが、世界は すすめない）。
 *     - `onDelivered(who, item, count)` は 受け取る 人の `craft.notifyPickup(item, count)` に つなぐ（1P: ひろった ログと pickup の 出来事。2P: 実績の pickup の 出来事だけ〔2P の ログは 画面に 出さない。§2.6〕）。
 *     - furnaces を 渡し joined が false の 1 人の 遊びは、渡さない ときと `pickupLog()`・`drainEvents()` が 同じ（下の テスト。出来事の tick だけ 1 ずれて よい）。
 *   「やく」の ページの ねんりょう・できる かず（AC93）: `nextFuel()`・`fuel()`・`bakeList()`・`total()` は 呼んだ つくる の 持ち主の もちもの（と その人の 足もとの たんす）だけで 数える（もう 1 人の もちものは 数えない。下の テスト）。
 *   足りない 口: 上の `listen` と `update` の 呼び順 だけ（テストは これで 足りる）。
 */

class W {
  blocks = new Map<string, BlockId>();
  size = { x: 256, y: 64, z: 256 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'air' && b !== 'water' && b !== 'outside';
  }
}

const F = { x: 3, y: 5, z: 3 };
const F2 = { x: 8, y: 5, z: 3 };
const ORE = 'iron_ore' as const;
const FUEL = 'coal_ore' as const;
const OUT = 'iron_ingot' as const;
const BAKE = CRAFT_DEFAULTS.bakeTicks;
const QMAX = CRAFT_DEFAULTS.bakeQueueMax;
const stack = (item: ItemId, count: number): ItemStack => ({ item, count });

/** 1P と 2P と 世界の かまど 1 つ（F。F2 も ある）。2P の 足もとは たんすの そば、1P は とおく */
function rig(o: { joined?: boolean } = {}) {
  const world = new W();
  world.setBlock(F.x, F.y, F.z, 'furnace');
  world.setBlock(F2.x, F2.y, F2.z, 'furnace');
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const flags = { joined: o.joined ?? true };
  const delivered: Array<{ who: 1 | 2; item: string; count: number }> = [];
  const scattered: ItemStack[] = [];
  const drops = {
    scatter: (_p: Vec3, stacks: readonly ItemStack[]) => {
      scattered.push(...stacks);
      return 0;
    },
  };
  const p1: Vec3 = { x: 200.5, y: 5, z: 200.5 };
  const p2: Vec3 = { x: 11.5, y: 5, z: 3.5 };
  const st = new StorageSystem({ world, inventory: inv1, player: () => p1, scatter: () => undefined, inventoryOpen: () => false, openScreen: () => undefined, closeScreen: () => undefined });
  const fw = new FurnaceWorld({ world, inventoryOf: (w) => (w === 1 ? inv1 : inv2), joined: () => flags.joined, onDelivered: (who, item, count) => delivered.push({ who, item, count }) });
  const craft1 = new CraftSystemImpl({ world, inventory: inv1, drops, furnaces: fw, who: 1, tansu: st, player: () => p1, tansuRange: () => 40 });
  const craft2 = new CraftSystemImpl({ world, inventory: inv2, drops, furnaces: fw, who: 2, tansu: st, player: () => p2, tansuRange: () => 40 });
  /** 毎ステップ: 2 つの つくる の update と、世界の かまどの update（1 回） */
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      craft1.update();
      craft2.update();
      fw.update();
    }
  };
  const stock = (inv: InventoryImpl, n: number) => {
    inv.add(ORE, n);
    inv.add(FUEL, n);
  };
  const fill = (inv: InventoryImpl) => {
    for (let i = 0; i < 36; i++) inv.setSlot(i, stack('dirt', 64));
  };
  const waiting = () => (fw.view(F.x, F.y, F.z)?.done ?? []).reduce((n, s) => n + s.count, 0);
  return { world, inv1, inv2, flags, delivered, scattered, st, fw, craft1, craft2, step, stock, fill, waiting, p1, p2 };
}

const bake = (c: CraftSystemImpl, at = F) => c.bake(OUT, at.x, at.y, at.z);

describe('AC93: かまどの 中身は 世界に 1 つ（どちらが 入れても 同じ かまど）', () => {
  it('2P が 入れた じゅんばんが 1P の 画面にも 見え、1P が 入れた 物も 2P に 見える（furnace.get は 1 つ）', () => {
    const r = rig();
    r.stock(r.inv2, 1);
    r.stock(r.inv1, 1);
    expect(bake(r.craft2)).toMatchObject({ ok: true, reason: null });
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)).toEqual(r.craft2.furnaceAt(F.x, F.y, F.z));
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)).toMatchObject({ burning: true, queue: [OUT] });
    expect(bake(r.craft1)).toMatchObject({ ok: true });
    expect(r.craft2.furnaceAt(F.x, F.y, F.z)!.queue).toEqual([OUT, OUT]);
    expect(r.fw.view(F.x, F.y, F.z)).toEqual(r.craft1.furnaceAt(F.x, F.y, F.z));
  });

  it('材料と ねんりょう 1 こは 入れた 人の もちものから へる。1P の もちものは かわらない（2P の ぶんが たりなければ 1P の もので つくらない）', () => {
    const r = rig();
    r.stock(r.inv1, 5);
    r.stock(r.inv2, 1);
    expect(bake(r.craft2)).toMatchObject({ ok: true });
    expect([r.inv2.count(ORE), r.inv2.count(FUEL)]).toEqual([0, 0]);
    expect([r.inv1.count(ORE), r.inv1.count(FUEL)], '1P の もちものは かわらない').toEqual([5, 5]);
    expect(bake(r.craft2)).toMatchObject({ ok: false, reason: 'missing' });
    expect(r.inv1.count(ORE)).toBe(5);
    expect(r.craft2.furnaceAt(F.x, F.y, F.z)!.queue).toHaveLength(1);
  });

  it('2P の 足もとから 近い たんすの 材料も 1P と 同じに 使う（遠い 1P の 分は 使えない）', () => {
    const r = rig();
    r.world.setBlock(10, 5, 3, 'tansu'); // 2P の すぐ そば
    r.st.set(10, 5, 3, 0, stack(ORE, 1));
    r.inv2.add(FUEL, 1);
    r.inv1.add(FUEL, 1);
    expect(bake(r.craft1), '1P は とおくて たんすが 使えない').toMatchObject({ ok: false, reason: 'missing' });
    expect(bake(r.craft2)).toMatchObject({ ok: true });
    expect(r.st.countItem(10, 5, 3, ORE), 'たんすの 鉄鉱石が へる').toBe(0);
    expect(r.inv2.count(FUEL)).toBe(0);
    expect(r.inv1.count(FUEL)).toBe(1);
  });

  it('2 人で 入れても やける 速さは 1 こ ごとに bakeTicks（2 倍に ならない）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1);
    bake(r.craft2);
    r.step(BAKE - 1);
    expect(r.inv1.count(OUT) + r.inv2.count(OUT)).toBe(0);
    r.step(1);
    expect(r.inv1.count(OUT), '先に 入れた 1P の 1 こ目').toBe(1);
    expect(r.inv2.count(OUT)).toBe(0);
    r.step(BAKE - 1);
    expect(r.inv2.count(OUT)).toBe(0);
    r.step(1);
    expect(r.inv2.count(OUT), '2 こ目は さらに bakeTicks 後').toBe(1);
    expect(r.delivered.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it('2 つの つくる の update を 呼んでも、世界の かまどは 1 ステップに 1 回だけ すすむ（progress が 1 ずつ）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    bake(r.craft1);
    r.craft1.update();
    r.craft2.update();
    r.craft1.update();
    r.craft2.update();
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)!.current!.progress, 'fw.update を 呼ばない かぎり すすまない').toBe(0);
    r.fw.update();
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)!.current!.progress).toBeCloseTo(1 / BAKE, 5);
  });

  it('べつの かまども それぞれ 1 ステップに 1 回（2 つの かまどが 同時に すすむ）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1, F);
    bake(r.craft2, F2);
    r.step(BAKE);
    expect(r.inv1.count(OUT)).toBe(1);
    expect(r.inv2.count(OUT)).toBe(1);
  });

  it('じゅんばんの 上限（bakeQueueMax）は 2 人で 1 つ', () => {
    const r = rig();
    r.stock(r.inv1, QMAX);
    r.stock(r.inv2, QMAX);
    for (let i = 0; i < QMAX - 3; i++) expect(bake(r.craft1).ok).toBe(true);
    for (let i = 0; i < 3; i++) expect(bake(r.craft2).ok).toBe(true);
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)!.queue).toHaveLength(QMAX);
    expect(bake(r.craft1)).toMatchObject({ ok: false, reason: 'queueFull' });
    expect(bake(r.craft2)).toMatchObject({ ok: false, reason: 'queueFull' });
    expect(r.inv2.count(ORE), 'いっぱいで 入れられなかった ときは 材料も へらない').toBe(QMAX - 3);
    r.step(BAKE);
    expect(bake(r.craft2).ok, '1 こ やけて 空きが できた').toBe(true);
  });
});

describe('AC93: やけた 物は 入れた 人へ', () => {
  it('1P が 入れた 物は 1P へ、2P が 入れた 物は 2P へ（だれも 画面を 開いて いなくても）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft2);
    bake(r.craft1);
    r.step(BAKE); // 先頭は 2P の
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.inv1.count(OUT)).toBe(0);
    r.step(BAKE);
    expect(r.inv1.count(OUT)).toBe(1);
    expect(r.delivered).toEqual([
      { who: 2, item: OUT, count: 1 },
      { who: 1, item: OUT, count: 1 },
    ]);
  });

  it('2P だけが かまどを 開いていても 1P の 物は 1P へ。1P だけが 開いていても 2P の 物は 2P へ', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1);
    r.craft2.openFurnace(F.x, F.y, F.z);
    r.step(BAKE);
    expect(r.inv1.count(OUT)).toBe(1);
    expect(r.inv2.count(OUT)).toBe(0);
    r.craft2.closeFurnace();
    r.craft1.openFurnace(F.x, F.y, F.z);
    bake(r.craft2);
    r.step(BAKE);
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.inv1.count(OUT)).toBe(1);
  });

  it('出来事（bakeStart・bakeDone）は 入れた 人の つくる に 出る（2P の 分は 2P の つくる）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1);
    bake(r.craft2);
    r.step(BAKE * 2);
    const done = (c: CraftSystemImpl) => c.drainEvents().filter((e) => e.type === 'bakeDone');
    const d1 = done(r.craft1);
    const d2 = done(r.craft2);
    expect(d1).toHaveLength(1);
    expect(d2).toHaveLength(1);
    expect(r.craft2.takeFurnaceHookEvents().map((e) => e.type)).toEqual(['bakeStart', 'bakeDone']);
    expect(r.craft1.takeFurnaceHookEvents().map((e) => e.type)).toEqual(['bakeStart', 'bakeDone']);
  });

  it('入れた 人の もちものが いっぱいなら かまどの 中で 待ち、その人に 空きが できた ステップに 入る（もう 1 人には 入らない）', () => {
    const r = rig();
    r.stock(r.inv2, 1);
    bake(r.craft2);
    r.fill(r.inv2);
    r.step(BAKE);
    expect(r.inv2.count(OUT)).toBe(0);
    expect(r.waiting(), 'かまどの 中で 待つ').toBe(1);
    expect(r.craft1.furnaceAt(F.x, F.y, F.z)!.done).toEqual([stack(OUT, 1)]);
    r.step(10);
    expect(r.inv1.count(OUT), '1P の もちものには 入らない（1P に 空きが あっても）').toBe(0);
    r.inv2.setSlot(10, null);
    r.step(1);
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.waiting()).toBe(0);
    expect(r.delivered).toEqual([{ who: 2, item: OUT, count: 1 }]);
  });

  it('1P が いっぱいで 待っていても、2P の 物は ふさがれず 2P へ 入る（待つのは その人の 分だけ）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1);
    bake(r.craft2);
    r.fill(r.inv1);
    r.step(BAKE * 2);
    expect(r.inv2.count(OUT), '2P の 物は 入る').toBe(1);
    expect(r.waiting(), '1P の 物は 待つ').toBe(1);
    expect(r.inv1.count(OUT)).toBe(0);
    r.inv1.setSlot(11, null);
    r.step(1);
    expect(r.inv1.count(OUT)).toBe(1);
    expect(r.waiting()).toBe(0);
  });

  it('入れた 人ごとに 待つ（同じ 物でも まぜない）。片方に 空きが できても もう 片方の 分は のこる', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    r.stock(r.inv2, 1);
    bake(r.craft1);
    bake(r.craft2);
    r.fill(r.inv1);
    r.fill(r.inv2);
    r.step(BAKE * 2);
    expect(r.waiting()).toBe(2);
    r.inv2.setSlot(10, null);
    r.step(1);
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.inv1.count(OUT)).toBe(0);
    expect(r.waiting()).toBe(1);
  });

  it('2P が いない（まだ 参加していない・やめた）ときは 2P が 入れた 物も 1P へ', () => {
    const r = rig({ joined: false });
    r.stock(r.inv2, 1);
    bake(r.craft2);
    r.step(BAKE);
    expect(r.inv1.count(OUT)).toBe(1);
    expect(r.inv2.count(OUT)).toBe(0);
    expect(r.delivered).toEqual([{ who: 1, item: OUT, count: 1 }]);
  });

  it('やけるのを 待っている あいだに 2P が やめたら、つぎの ステップから 1P へ（待っている 物も）', () => {
    const r = rig();
    r.stock(r.inv2, 2);
    bake(r.craft2);
    bake(r.craft2);
    r.fill(r.inv2);
    r.step(BAKE); // 1 こ目は 2P の いっぱいで 待つ
    expect(r.waiting()).toBe(1);
    r.flags.joined = false; // 2P が やめた
    r.step(1);
    expect(r.inv1.count(OUT), '待っていた 物は 1P へ').toBe(1);
    expect(r.waiting()).toBe(0);
    r.step(BAKE);
    expect(r.inv1.count(OUT), '2 こ目も 1P へ').toBe(2);
    expect(r.inv2.count(OUT)).toBe(0);
  });

  it('2P の パッドが ぬけて いる だけ（joined の まま）の あいだは 2P の もちものへ', () => {
    const r = rig();
    r.stock(r.inv2, 1);
    bake(r.craft2);
    r.step(BAKE);
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.inv1.count(OUT)).toBe(0);
  });

  it('同じ ステップに 2 人が 入れる: 1P が 先（最後の 1 こ分の 空きは 1P が とる）', () => {
    const r = rig();
    r.stock(r.inv1, QMAX);
    r.stock(r.inv2, QMAX);
    for (let i = 0; i < QMAX - 1; i++) bake(r.craft1);
    const order = new PanelOrder();
    const res: Record<string, boolean> = {};
    order.submit(2, () => void (res.p2 = bake(r.craft2).ok));
    order.submit(1, () => void (res.p1 = bake(r.craft1).ok));
    order.flush();
    expect(res).toEqual({ p1: true, p2: false });
    expect(r.inv2.count(ORE), '2P の 材料は へらない').toBe(QMAX);
  });
});

describe('AC93: 出来事の 届け口（listen）と 1 人の 遊びが かわらない 約束', () => {
  it('listen: 2P の 物の 出来事は 2P の 側へ、2P が いなければ（joined false）1P の 側へ 届く', () => {
    const r = rig();
    const got: Record<1 | 2, string[]> = { 1: [], 2: [] };
    r.fw.listen(1, (e) => got[1].push(e.type));
    r.fw.listen(2, (e) => got[2].push(e.type));
    r.stock(r.inv2, 1);
    bake(r.craft2);
    r.step(BAKE);
    expect(got[2]).toContain('bakeDone');
    expect(got[1]).not.toContain('bakeDone');

    const q = rig({ joined: false });
    const got2: Record<1 | 2, string[]> = { 1: [], 2: [] };
    q.fw.listen(1, (e) => got2[1].push(e.type));
    q.fw.listen(2, (e) => got2[2].push(e.type));
    q.stock(q.inv2, 1);
    bake(q.craft2);
    q.step(BAKE);
    expect(got2[1]).toContain('bakeDone');
    expect(got2[2]).not.toContain('bakeDone');
    // つくる 側にも 1P の 分として 届く
    expect(q.craft1.drainEvents().some((e) => e.type === 'bakeDone')).toBe(true);
    expect(q.craft2.drainEvents().some((e) => e.type === 'bakeDone')).toBe(false);
  });

  it('listen の 戻り値で 登録を やめると 届かない', () => {
    const r = rig();
    const got: string[] = [];
    const off = r.fw.listen(1, (e) => got.push(e.type));
    off();
    r.stock(r.inv1, 1);
    bake(r.craft1);
    r.step(BAKE);
    expect(got).toEqual([]);
  });

  it('1 人の 遊び: furnaces あり・joined false は furnaces なしと pickupLog・drainEvents が 同じ（onDelivered は 1P の craft.notifyPickup に つなぐ）', () => {
    const solo = (() => {
      const world = new W();
      world.setBlock(F.x, F.y, F.z, 'furnace');
      const inv = new InventoryImpl();
      inv.add(ORE, 2);
      inv.add(FUEL, 2);
      const craft = new CraftSystemImpl({ world, inventory: inv });
      return { world, inv, craft, step: () => craft.update() };
    })();
    const shared = (() => {
      const world = new W();
      world.setBlock(F.x, F.y, F.z, 'furnace');
      const inv = new InventoryImpl();
      inv.add(ORE, 2);
      inv.add(FUEL, 2);
      const box: { craft: CraftSystemImpl | null } = { craft: null };
      const fw = new FurnaceWorld({ world, inventoryOf: () => inv, joined: () => false, onDelivered: (_who, item, count) => box.craft!.notifyPickup(item, count) });
      const craft = new CraftSystemImpl({ world, inventory: inv, furnaces: fw, who: 1 });
      box.craft = craft;
      return { world, inv, craft, step: () => { craft.update(); fw.update(); } };
    })();
    const events: Array<ReturnType<CraftSystemImpl['drainEvents']>> = [[], []];
    const noTick = (list: ReturnType<CraftSystemImpl['drainEvents']>) => list.map((e) => { const { tick: _t, ...rest } = e as unknown as Record<string, unknown>; return rest; });
    for (const s of [solo, shared]) {
      s.craft.bake(OUT, F.x, F.y, F.z);
      s.craft.bake(OUT, F.x, F.y, F.z);
    }
    for (let i = 0; i < BAKE * 2 + 3; i++) {
      solo.step();
      shared.step();
      if (i === BAKE) {
        // とちゅうで 1 回 見る（1 こ目が 入った あと）
        expect(shared.craft.pickupLog()).toEqual(solo.craft.pickupLog());
        events[0]!.push(...solo.craft.drainEvents());
        events[1]!.push(...shared.craft.drainEvents());
      }
    }
    events[0]!.push(...solo.craft.drainEvents());
    events[1]!.push(...shared.craft.drainEvents());
    expect(shared.inv.count(OUT)).toBe(solo.inv.count(OUT));
    expect(shared.craft.pickupLog()).toEqual(solo.craft.pickupLog());
    expect(noTick(events[1]!)).toEqual(noTick(events[0]!));
    expect(noTick(events[0]!).map((e) => e.type)).toEqual(expect.arrayContaining(['bakeStart', 'pickup', 'bakeDone']));
    expect(shared.craft.takeFurnaceHookEvents().map((e) => e.type)).toEqual(solo.craft.takeFurnaceHookEvents().map((e) => e.type));
  });
});

describe('AC93: 「やく」の ページの ねんりょう・できる かずは その人の 物だけ', () => {
  it('2P の ねんりょう・できる かずは 2P の もちもの（と 2P の 近くの たんす）だけ。1P の もちものは 数えない（逆も）', () => {
    const r = rig();
    r.stock(r.inv1, 5);
    r.inv2.add(ORE, 1);
    expect(r.craft2.total(ORE)).toBe(1);
    expect(r.craft2.total(FUEL)).toBe(0);
    expect(r.craft2.nextFuel(), '2P には ねんりょうが ない').toBeNull();
    expect(r.craft2.fuel()).toBeNull();
    expect(r.craft2.bakeList().find((b) => b.id === OUT)).toMatchObject({ canBake: false, fuelOk: false });
    expect(r.craft1.total(ORE)).toBe(5);
    expect(r.craft1.nextFuel()).toBe(FUEL);
    expect(r.craft1.bakeList().find((b) => b.id === OUT)).toMatchObject({ canBake: true, fuelOk: true });
    // 2P に ねんりょうが 入ると 2P の 分だけ
    r.inv2.add('log', 2);
    expect(r.craft2.nextFuel()).toBe('log');
    expect(r.craft2.bakeList().find((b) => b.id === OUT)).toMatchObject({ canBake: true });
    expect(r.craft2.total('log')).toBe(2);
    expect(r.craft1.total('log')).toBe(0);
    // 1P が 使っても 2P の 数は かわらない
    bake(r.craft1);
    expect(r.craft2.total(ORE)).toBe(1);
    expect(r.craft2.total('log')).toBe(2);
  });
});

describe('AC93: かまどを こわすと 中の 物は こわした 人へ', () => {
  it('2P が こわしたら、1P が 入れた 物も 2P が 入れた 物も 待っている 物も 2P の もちものへ（1P の もちものは かわらない）', () => {
    const r = rig();
    r.stock(r.inv1, 2);
    r.stock(r.inv2, 2);
    bake(r.craft1);
    bake(r.craft2);
    bake(r.craft2);
    r.step(5);
    r.world.setBlock(F.x, F.y, F.z, 'air');
    r.craft2.furnaceBroken(F.x, F.y, F.z);
    expect(r.inv2.count(ORE), '3 こ分の 材料（1P が 入れた 1 こ ＋ 2P が 入れた 2 こ）').toBe(3);
    expect(r.inv2.count(FUEL)).toBe(3);
    expect(r.inv1.count(ORE), '1P は 入れた 1 こ分を もらえない').toBe(1);
    expect(r.inv1.count(FUEL)).toBe(1);
    expect(r.fw.serialize()).toEqual([]);
    expect(r.fw.positions().filter((p) => p.x === F.x)).toEqual([]);
  });

  it('こわした 人の もちものに 入らない 分は おとしもの ぶくろ（drops）へ', () => {
    const r = rig();
    r.inv2.add('clay', 1);
    r.inv2.add('log', 1);
    r.craft2.bake('brick', F.x, F.y, F.z);
    r.fill(r.inv2);
    r.world.setBlock(F.x, F.y, F.z, 'air');
    r.craft2.furnaceBroken(F.x, F.y, F.z);
    expect(r.scattered.map((s) => s.item).sort()).toEqual(['clay', 'log']);
  });

  it('待っている 物（done）も こわした 人へ（入れた 人が 1P でも）', () => {
    const r = rig();
    r.stock(r.inv1, 1);
    bake(r.craft1);
    r.fill(r.inv1);
    r.step(BAKE);
    expect(r.waiting()).toBe(1);
    r.inv2.clear();
    r.world.setBlock(F.x, F.y, F.z, 'air');
    r.craft2.furnaceBroken(F.x, F.y, F.z);
    expect(r.inv2.count(OUT)).toBe(1);
    expect(r.inv1.count(OUT)).toBe(0);
  });

  it('その かまどの「やく」を 開いている 人は（2 人とも）つぎの update で 開いて いない ことに なる', () => {
    const r = rig();
    r.craft1.openFurnace(F.x, F.y, F.z);
    r.craft2.openFurnace(F.x, F.y, F.z);
    expect(r.craft1.openedFurnace()).toEqual(F);
    expect(r.craft2.openedFurnace()).toEqual(F);
    r.world.setBlock(F.x, F.y, F.z, 'air');
    r.craft2.furnaceBroken(F.x, F.y, F.z);
    r.step(1);
    expect(r.craft1.openedFurnace()).toBeNull();
    expect(r.craft2.openedFurnace()).toBeNull();
  });

  it('べつの かまどを 開いている 人は そのまま', () => {
    const r = rig();
    r.craft1.openFurnace(F2.x, F2.y, F2.z);
    r.craft2.openFurnace(F.x, F.y, F.z);
    r.world.setBlock(F.x, F.y, F.z, 'air');
    r.craft1.furnaceBroken(F.x, F.y, F.z);
    r.step(1);
    expect(r.craft1.openedFurnace()).toEqual(F2);
    expect(r.craft2.openedFurnace()).toBeNull();
  });
});

describe('AC93・§6: 保存（by は 省ける。SAVE_VERSION は 上げない）', () => {
  it('SAVE_VERSION は 上げない（前の 保存の かまども そのまま 読める）', () => {
    expect(SAVE_VERSION).toBe(1);
  });

  it('2P が 入れた 物に by: 2、1P が 入れた 物は by なし（か 1）。保存して 読み直すと じゅんばん・とちゅう・入れた 人が もどる', () => {
    const a = rig();
    a.stock(a.inv1, 1);
    a.stock(a.inv2, 1);
    bake(a.craft1);
    bake(a.craft2);
    a.step(30);
    const data = JSON.parse(JSON.stringify(a.fw.serialize()));
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ x: F.x, y: F.y, z: F.z, progress: 30 });
    expect([undefined, 1]).toContain(data[0].queue[0].by);
    expect(data[0].queue[1].by).toBe(2);
    expect(data[0].queue.map((q: { recipe: string }) => q.recipe)).toEqual([OUT, OUT]);
    // 1P の つくる の 窓口からも 同じ 物が 出る（保存の 配線は 今の まま）
    expect(JSON.parse(JSON.stringify(a.craft1.serializeFurnaces()))).toEqual(data);

    const b = rig();
    b.fw.deserialize(data);
    expect(b.craft1.furnaceAt(F.x, F.y, F.z)!.queue).toEqual([OUT, OUT]);
    b.step(BAKE - 30 - 1);
    expect(b.inv1.count(OUT)).toBe(0);
    b.step(1);
    expect(b.inv1.count(OUT), '先頭は 1P の 物').toBe(1);
    expect(b.inv2.count(OUT)).toBe(0);
    b.step(BAKE);
    expect(b.inv2.count(OUT), '2 こ目は 2P の 物').toBe(1);
  });

  it('待っている 物（done）の 入れた 人も もどる', () => {
    const a = rig();
    a.stock(a.inv2, 1);
    bake(a.craft2);
    a.fill(a.inv2);
    a.step(BAKE);
    expect(a.waiting()).toBe(1);
    const data = JSON.parse(JSON.stringify(a.fw.serialize()));
    expect(data[0].done).toHaveLength(1);
    expect(data[0].done[0]).toMatchObject({ item: OUT, count: 1, by: 2 });

    const b = rig();
    b.fw.deserialize(data);
    b.fill(b.inv2); // 読み直した あとも 2P の もちものが いっぱいなら 待つ
    b.step(5);
    expect(b.waiting(), '2P の もちものが いっぱいの あいだは 待つ').toBe(1);
    expect(b.inv1.count(OUT)).toBe(0);
    b.inv2.setSlot(3, null);
    b.step(1);
    expect(b.inv2.count(OUT)).toBe(1);
  });

  it('by の ない 保存（前の 保存）は ぜんぶ 1P。done も 1P へ', () => {
    const r = rig();
    r.fw.deserialize([{ x: F.x, y: F.y, z: F.z, queue: [{ recipe: OUT, fuel: FUEL }], progress: 0, done: [{ item: OUT, count: 2 }] }]);
    r.step(1);
    expect(r.inv1.count(OUT), 'done は 次の ステップに 1P へ').toBe(2);
    r.step(BAKE);
    expect(r.inv1.count(OUT)).toBe(3);
    expect(r.inv2.count(OUT)).toBe(0);
  });

  it('知らない by（3・"x"・null・0・2.5）は 1P', () => {
    const r = rig();
    const q = [3, 'x', null, 0, 2.5].map((by) => ({ recipe: OUT, fuel: FUEL, by }));
    r.fw.deserialize([{ x: F.x, y: F.y, z: F.z, queue: q.slice(0, QMAX), progress: 0, done: [] }]);
    r.step(BAKE * q.length);
    expect(r.inv1.count(OUT)).toBe(q.length);
    expect(r.inv2.count(OUT)).toBe(0);
  });

  it('2P の 分が 入った 保存を 1 人で 読むと（2P が いない）、2P の 物も 1P へ', () => {
    const a = rig();
    a.stock(a.inv2, 1);
    bake(a.craft2);
    const data = JSON.parse(JSON.stringify(a.fw.serialize()));
    const b = rig({ joined: false });
    b.fw.deserialize(data);
    b.step(BAKE);
    expect(b.inv1.count(OUT)).toBe(1);
    expect(b.inv2.count(OUT)).toBe(0);
  });

  it('おかしい 分は 捨てる（今まで どおり）', () => {
    const r = rig();
    r.fw.deserialize([{ x: 1.5 }, 'x', null, { x: F.x, y: F.y, z: F.z, queue: [{ recipe: 'nai', fuel: FUEL }], progress: 0, done: [] }]);
    expect(r.fw.positions()).toEqual([]);
  });
});
