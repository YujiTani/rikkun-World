import type { BlockId, CraftEvent, CraftSystem, Inventory, MaterialSources, MaterialUse, TansuMaterialStore, TansuPos, ItemId, ItemStack, Recipe, Vec3, VoxelWorld } from '../contracts';
import { K_FURNACE, K_TANSU, isFurnKind } from '../world/blocks/houseBlocks';
import { CRAFT2_SETTING_DEFAULTS } from '../contracts';
import { maxOwnedOf } from '../content/items/registry';
import { itemType } from '../inventory/items';
import { PickupLog } from '../inventory/pickupLog';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES } from './recipes';
import { createCraftConfig, type CraftConfig } from './config';
import { FurnaceWorld, type FurnaceFxEntryLike, type FurnaceView, type FurnaceWho } from './FurnaceWorld';

export type { FurnaceFxEntryLike, FurnaceView } from './FurnaceWorld';

const MAX_QUEUE = 256;

export type MakeReason = null | 'missing' | 'full' | 'unknown' | 'noFuel' | 'queueFull' | 'haveOne';
export type BakeReason = null | 'missing' | 'noFuel' | 'queueFull' | 'closed' | 'notFurnace' | 'unknown';

export interface CraftDeps {
  world: Pick<VoxelWorld, 'getBlock'>;
  inventory: Inventory;
  /** 落ちたアイテムの置き場（かまど をこわして入らなかった分） */
  drops?: { scatter(position: Vec3, stacks: readonly ItemStack[], opts?: { kind?: 'death' | 'yokai' }): number };
  /** 保存してほしいとき */
  requestSave?: () => void;
  config?: CraftConfig;
  /** CRAFT-2: たんす（`StorageSystem`）。なければ たんす は 使わない */
  tansu?: TansuMaterialStore & { list(): Vec3[]; version?(): number };
  /** CRAFT-2: プレイヤーの足もと（きょりの はかり始め）。なければ たんす は 使わない */
  player?: () => Vec3;
  /** CRAFT-2: 使える たんす の きょり（設定 `craftTansuRange`。かすみ `fogFar` とは つながない。なければ はじめの値 40） */
  tansuRange?: () => number;
  /**
   * COOP-1 4c: 世界の かまど（1P・2P の つくる で 1 つ）。渡すと その かまどに 入れる／見る（すすめるのは `FurnaceWorld.update()` だけ）。
   * 渡さない ときは 自分だけの かまどを 内に 持つ（1 人の 遊びは 今の まま。`update()` で すすむ）
   */
  furnaces?: FurnaceWorld;
  /** COOP-1 4c: この つくる の 持ち主（かまどに 入れる「入れた 人」。既定 1） */
  who?: FurnaceWho;
}

/** 範囲の中の たんす 1 こ（数は 見るたびに 1 回だけ数えて覚える） */
interface RangeTansu extends TansuPos {
  dist: number;
  counts: Map<ItemId, number>;
}

/** 素材の取り方の予定（何も変えない） */
interface Plan {
  ok: boolean;
  /** ねんりょう（やくときだけ。見つからなければ null） */
  fuel: ItemId | null;
  inv: Map<ItemId, number>;
  tansu: (TansuPos & { item: ItemId; count: number })[];
  missing: { item: ItemId; count: number }[];
}

type Slot = ItemStack | null;

/** 入れ方（M2 §4.2）を配列の上で試す。入らなかった数を返す */
function simulateAdd(slots: Slot[], item: ItemId, count: number): number {
  const max = itemType(item)?.maxStack ?? 0;
  let left = count;
  if (max <= 0) return left;
  for (let i = 0; i < slots.length && left > 0; i++) {
    const s = slots[i];
    if (s && s.item === item && s.count < max) {
      const n = Math.min(max - s.count, left);
      slots[i] = { item, count: s.count + n };
      left -= n;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const n = Math.min(max, left);
      slots[i] = { item, count: n };
      left -= n;
    }
  }
  return left;
}

/** 取り出し方（M2 §4.2: ふくろのマスから先に）を配列の上で試す */
function simulateRemove(slots: Slot[], item: ItemId, count: number): void {
  let left = count;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i];
    if (s && s.item === item) {
      const n = Math.min(s.count, left);
      left -= n;
      slots[i] = n === s.count ? null : { item, count: s.count - n };
    }
  }
}

const NO_CRAFT_EVENTS: CraftEvent[] = [];

/** つくる・やく（M4 §2.2・§2.3）。材料の 数え方・つくる・やく の 入れ方（かまどの 中身は FurnaceWorld） */
export class CraftSystemImpl implements CraftSystem {
  readonly config: CraftConfig;
  private readonly log: PickupLog;
  private tickCount = 0;
  private opened: Vec3 | null = null;
  /** 世界の かまど（渡された 物。なければ 自分だけの 物） */
  private readonly fw: FurnaceWorld;
  /** 自分だけの かまどなら true（`update()` で すすめる） */
  private readonly ownsFurnaces: boolean;
  private readonly who: FurnaceWho;

  // ---- CRAFT-2: 範囲の中の たんす（しぼるのは 位置・たんす の中身・きょり が 変わった後の 次に数えるときだけ）
  private range: RangeTansu[] = [];
  private rangeValid = false;
  private rangePos = { x: NaN, y: NaN, z: NaN };
  private rangeVer = -1;
  private rangeFog = NaN;
  private filterCount = 0;
  private invVer = 0;
  private hint: { key: string; value: boolean } = { key: '', value: false };

  private drainQueue: CraftEvent[] = [];
  private craftHookQueue: CraftEvent[] = [];
  private furnaceHookQueue: CraftEvent[] = [];

  constructor(private readonly d: CraftDeps) {
    this.config = d.config ?? createCraftConfig();
    this.log = new PickupLog({ ticks: this.config.pickupLogTicks, max: this.config.pickupLogMax });
    this.who = d.who ?? 1;
    this.ownsFurnaces = !d.furnaces;
    this.fw =
      d.furnaces ??
      new FurnaceWorld({
        world: d.world,
        inventoryOf: () => d.inventory,
        joined: () => true,
        fixedRecipient: this.who, // 自分だけの かまど: やけた 物・出来事は いつも この つくる の 持ち主へ（by が 2 の 保存を 1 人で 読んでも）
        onDelivered: (_who, item, count, tick) => this.notifyPickup(item, count, tick),
        config: this.config,
        requestSave: d.requestSave,
        tick: () => this.tickCount,
      });
    // やけた 物を 受け取る 人の つくる に、bakeStart・bakeDone の 出来事が 出る
    this.fw.listen(this.who, (e) => this.emit(e, 'furnace'));
    d.inventory.onChange?.(() => {
      this.invVer++;
    });
  }

  // ---------------------------------------------------------- たんす の素材（CRAFT-2 §2.2〜§2.4）

  private fog(): number {
    return this.d.tansuRange?.() ?? CRAFT2_SETTING_DEFAULTS.craftTansuRange;
  }

  /** 使える たんす を しぼる（位置・中身・きょり が 同じなら しぼり直さない）。近い順（同じなら x → z → y） */
  private ensureRange(): RangeTansu[] {
    const st = this.d.tansu;
    const pl = this.d.player;
    if (!st || !pl) return this.range;
    const p = pl();
    const fog = this.fog();
    const ver = st.version ? st.version() : -2;
    const rp = this.rangePos;
    if (this.rangeValid && ver !== -2 && ver === this.rangeVer && fog === this.rangeFog && p.x === rp.x && p.y === rp.y && p.z === rp.z) {
      return this.range;
    }
    this.filterCount++;
    const out: RangeTansu[] = [];
    for (const t of st.list()) {
      if (!isFurnKind(this.d.world.getBlock(t.x, t.y, t.z), K_TANSU)) continue;
      const dist = Math.hypot(p.x - (t.x + 0.5), p.y - t.y, p.z - (t.z + 0.5));
      if (dist <= fog) out.push({ x: t.x, y: t.y, z: t.z, dist, counts: new Map() });
    }
    out.sort((a, b) => a.dist - b.dist || a.x - b.x || a.z - b.z || a.y - b.y);
    this.range = out;
    this.rangeValid = true;
    this.rangePos = { x: p.x, y: p.y, z: p.z };
    this.rangeVer = ver;
    this.rangeFog = fog;
    return out;
  }

  private tansuHas(t: RangeTansu, item: ItemId): number {
    let n = t.counts.get(item);
    if (n === undefined) {
      n = this.d.tansu!.countItem(t.x, t.y, t.z, item);
      t.counts.set(item, n);
    }
    return n;
  }

  /** 画面（もちもの・かまど）を 開いたとき: かならず しぼり直す（AC9b） */
  refreshTansu(): void {
    this.rangeValid = false;
    this.hint.key = '';
    this.ensureRange();
  }

  /** 今の位置で 使える たんす（取る順） */
  tansuInRange(): (TansuPos & { dist: number })[] {
    return this.ensureRange().map((t) => ({ x: t.x, y: t.y, z: t.z, dist: t.dist }));
  }

  debugCounts(): { tansuFilterCount: number } {
    return { tansuFilterCount: this.filterCount };
  }

  /** もちもの＋たんす の合計 */
  total(item: ItemId): number {
    let n = this.d.inventory.count(item);
    for (const t of this.ensureRange()) n += this.tansuHas(t, item);
    return n;
  }

  /** 範囲の中の たんす だけの合計（ねんりょうの チップの `inTansu` 用） */
  inTansuCount(item: ItemId): number {
    let n = 0;
    for (const t of this.ensureRange()) n += this.tansuHas(t, item);
    return n;
  }

  /** ねんりょう（`fuelOrder`）ごとの たんす の数 */
  fuelInTansu(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const f of this.config.fuelOrder) o[f] = this.inTansuCount(f);
    return o;
  }

  /** 素材の取り方を 予定する（もちもの → たんす の順。何も変えない） */
  private plan(inputs: readonly { item: ItemId; count: number }[], withFuel: boolean): Plan {
    const inv = this.d.inventory;
    const range = this.ensureRange();
    const usedInv = new Map<ItemId, number>();
    const usedT: Map<ItemId, number>[] = range.map(() => new Map());
    const tansu: Plan['tansu'] = [];
    const missing: Plan['missing'] = [];
    const take = (item: ItemId, need: number): number => {
      const fromInv = Math.min(Math.max(0, inv.count(item) - (usedInv.get(item) ?? 0)), need);
      if (fromInv > 0) usedInv.set(item, (usedInv.get(item) ?? 0) + fromInv);
      let rem = need - fromInv;
      for (let i = 0; i < range.length && rem > 0; i++) {
        const t = range[i];
        const n = Math.min(Math.max(0, this.tansuHas(t, item) - (usedT[i].get(item) ?? 0)), rem);
        if (n <= 0) continue;
        usedT[i].set(item, (usedT[i].get(item) ?? 0) + n);
        const same = tansu.find((e) => e.x === t.x && e.y === t.y && e.z === t.z && e.item === item);
        if (same) same.count += n;
        else tansu.push({ x: t.x, y: t.y, z: t.z, item, count: n });
        rem -= n;
      }
      return rem;
    };
    const left = (item: ItemId): number => {
      let n = inv.count(item) - (usedInv.get(item) ?? 0);
      for (let i = 0; i < range.length; i++) n += this.tansuHas(range[i], item) - (usedT[i].get(item) ?? 0);
      return n;
    };
    for (const i of inputs) {
      const rem = take(i.item, i.count);
      if (rem > 0) missing.push({ item: i.item, count: rem });
    }
    let fuel: ItemId | null = null;
    if (withFuel) {
      if (this.chosenFuel !== null && left(this.chosenFuel) > 0) fuel = this.chosenFuel;
      else fuel = this.config.fuelOrder.find((f) => left(f) > 0) ?? null;
      if (fuel !== null) take(fuel, 1);
    }
    // 取る順: たんす ごと（近い順）→ アイテム
    if (range.length > 1) {
      const order = new Map<string, number>();
      range.forEach((t, i) => order.set(`${t.x},${t.y},${t.z}`, i));
      tansu.sort((a, b) => order.get(`${a.x},${a.y},${a.z}`)! - order.get(`${b.x},${b.y},${b.z}`)!);
    }
    return { ok: missing.length === 0 && (!withFuel || fuel !== null), fuel, inv: usedInv, tansu, missing };
  }

  /** 予定どおりに へらす。使った分を返す */
  private apply(p: Plan): MaterialUse {
    const inv: MaterialUse['inv'] = [];
    for (const [item, count] of p.inv) {
      if (count <= 0) continue;
      this.d.inventory.remove(item, count);
      inv.push({ item, count });
    }
    const tansu: MaterialUse['tansu'] = [];
    for (const e of p.tansu) {
      const took = this.d.tansu!.takeItem(e.x, e.y, e.z, e.item, e.count);
      if (took > 0) tansu.push({ x: e.x, y: e.y, z: e.z, item: e.item, count: took });
    }
    return { inv, tansu };
  }

  /** 今 つくったら どこから何こ取るか（何も変えない。やく は ねんりょう 1 こ もふくむ） */
  sources(recipeId: string): MaterialSources {
    const r = this.recipe(recipeId);
    if (!r) return { ok: false, inv: [], tansu: [], missing: [] };
    const p = this.plan(r.inputs, r.station === 'furnace');
    const missing = p.missing.map((m) => ({ ...m }));
    if (r.station === 'furnace' && p.fuel === null) missing.push({ item: this.chosenFuel ?? this.config.fuelOrder[0], count: 1 });
    return { ok: p.ok, inv: [...p.inv].filter(([, n]) => n > 0).map(([item, count]) => ({ item, count })), tansu: p.tansu.map((e) => ({ ...e })), missing };
  }

  // ---------------------------------------------------------- レシピ

  recipes(): Recipe[] {
    return ALL_RECIPES.map((r) => ({ ...r, output: { ...r.output }, inputs: r.inputs.map((i) => ({ ...i })) }));
  }

  private recipe(id: string): Recipe | undefined {
    return ALL_RECIPES.find((r) => r.id === id);
  }

  status(recipeId: string): { craftable: boolean; missing: ItemStack[]; /** ITEM-FX-1: 持ち物 全体で 1 つだけの 物（おまもり）を もう 持っている */ limit?: 'haveOne' } {
    const r = this.recipe(recipeId);
    if (!r) return { craftable: false, missing: [] };
    const missing: ItemStack[] = this.plan(r.inputs, false).missing.map((m) => ({ item: m.item, count: m.count }));
    if (this.haveOne(r)) return { craftable: false, missing, limit: 'haveOne' };
    return { craftable: missing.length === 0, missing };
  }

  /** 持ち物 全体で 持てる 数が きまって いる 物（おまもり）を、もう その 数 だけ 持っているか */
  private haveOne(r: Recipe): boolean {
    const cap = maxOwnedOf(r.output.item);
    return cap !== null && this.total(r.output.item) + r.output.count > cap;
  }

  /** `craft.list()`（M4 §6.1）: つくる 18 こ */
  list() {
    return CRAFT_RECIPES.map((r) => {
      const st = this.status(r.id);
      return {
        id: r.id,
        output: { ...r.output },
        inputs: r.inputs.map((i) => ({ ...i })),
        works: r.works,
        station: r.station,
        craftable: st.craftable,
        missing: st.missing,
      };
    });
  }

  /** `furnace.list()`（M4 §6.1）: やく 4 こ（今の持ち物で） */
  bakeList() {
    const fuel = this.nextFuel();
    return BAKE_RECIPES.map((r) => {
      const st = this.status(r.id);
      return {
        id: r.id,
        output: { ...r.output },
        inputs: r.inputs.map((i) => ({ ...i })),
        works: r.works,
        canBake: st.craftable && fuel !== null,
        missing: st.missing,
        fuelOk: fuel !== null,
      };
    });
  }

  /** 次に使う ねんりょう（なければ null） */
  nextFuel(): ItemId | null {
    return this.fuel();
  }

  private chosenFuel: ItemId | null = null;

  /** えらんでいる ねんりょう。0 こ（か 未選択）なら 自動の順の先頭。保存はしない */
  fuel(): ItemId | null {
    if (this.chosenFuel !== null && this.total(this.chosenFuel) > 0) return this.chosenFuel;
    return this.autoFuel();
  }

  setFuel(id: ItemId): boolean {
    if (!this.config.fuelOrder.includes(id)) return false;
    this.chosenFuel = id;
    return true;
  }

  private autoFuel(): ItemId | null {
    for (const f of this.config.fuelOrder) if (this.total(f) > 0) return f;
    return null;
  }

  // ---------------------------------------------------------- つくる

  make(recipeId: string): { ok: boolean; reason: MakeReason; used: MaterialUse | null } {
    const r = this.recipe(recipeId);
    if (!r) {
      this.emit({ type: 'craftFail', tick: this.tickCount, recipe: recipeId, reason: 'unknown' }, 'craft');
      return { ok: false, reason: 'unknown', used: null };
    }
    if (r.station === 'furnace') {
      const o = this.opened;
      if (!o) return { ok: false, reason: 'unknown', used: null };
      const res = this.bake(recipeId, o.x, o.y, o.z);
      const reason = res.reason === 'closed' || res.reason === 'notFurnace' ? 'unknown' : res.reason;
      return { ok: res.ok, reason, used: res.used };
    }
    const inv = this.d.inventory;
    if (this.haveOne(r)) {
      this.emit({ type: 'craftFail', tick: this.tickCount, recipe: r.id, reason: 'haveOne' }, 'craft');
      return { ok: false, reason: 'haveOne', used: null };
    }
    const p = this.plan(r.inputs, false);
    if (!p.ok) {
      this.emit({ type: 'craftFail', tick: this.tickCount, recipe: r.id, reason: 'missing' }, 'craft');
      return { ok: false, reason: 'missing', used: null };
    }
    // もちもの から取る分を取ったあとに、できたものが全部入るか（たんす から取る分は 空きを ふやさない。カーソルのものは数えない）
    const trial: Slot[] = inv.slots().map((s) => (s ? { ...s } : null));
    for (const [item, n] of p.inv) simulateRemove(trial, item, n);
    if (simulateAdd(trial, r.output.item, r.output.count) > 0) {
      this.emit({ type: 'craftFail', tick: this.tickCount, recipe: r.id, reason: 'full' }, 'craft');
      return { ok: false, reason: 'full', used: null };
    }
    const used = this.apply(p);
    inv.add(r.output.item, r.output.count);
    this.emit(
      { type: 'craft', tick: this.tickCount, recipe: r.id, item: r.output.item, count: r.output.count, fromTansu: used.tansu.map((e) => ({ ...e })) },
      'craft',
    );
    this.d.requestSave?.();
    return { ok: true, reason: null, used };
  }

  // ---------------------------------------------------------- 拾った

  /** 拾ったのと同じ: 持ち物に入れ、入った数をログと出来事に出す。入らなかった数を返す */
  pickup(item: ItemId, count: number): number {
    const n = Math.floor(count);
    const left = this.d.inventory.add(item, n);
    this.notifyPickup(item, n - left);
    return left;
  }

  /** すでに持ち物に入れた分を「拾った」として知らせる（ほった・落ちたものを拾った） */
  notifyPickup(item: ItemId, count: number, tick: number = this.tickCount): void {
    if (!(count > 0)) return;
    this.log.push(item, count);
    this.emit({ type: 'pickup', tick, item, count }, null);
  }

  /** 今出ているログ（上＝古い） */
  pickupLog() {
    return this.log.list();
  }

  // ---------------------------------------------------------- かまど

  isFurnace(x: number, y: number, z: number): boolean {
    return isFurnKind(this.d.world.getBlock(x, y, z), K_FURNACE);
  }

  openFurnace(x: number, y: number, z: number): void {
    if (this.isFurnace(x, y, z)) {
      this.opened = { x, y, z };
      this.refreshTansu();
    }
  }

  closeFurnace(): void {
    this.opened = null;
  }

  openedFurnace(): Vec3 | null {
    return this.opened ? { ...this.opened } : null;
  }

  /** その かまど で やく（画面に関係なく） */
  bake(recipeId: string, x: number, y: number, z: number): { ok: boolean; reason: BakeReason; used: MaterialUse | null } {
    if (!this.isFurnace(x, y, z)) return { ok: false, reason: 'notFurnace', used: null };
    const r = BAKE_RECIPES.find((b) => b.id === recipeId);
    if (!r) return { ok: false, reason: 'unknown', used: null };
    const p = this.plan(r.inputs, true);
    if (p.missing.length > 0) return { ok: false, reason: 'missing', used: null };
    const fuel = p.fuel;
    if (fuel === null) return { ok: false, reason: 'noFuel', used: null };
    if (this.fw.queueLength(x, y, z) >= this.config.bakeQueueMax) return { ok: false, reason: 'queueFull', used: null };
    const used = this.apply(p);
    this.fw.push(x, y, z, { recipe: r.id, fuel, by: this.who }); // 保存の 合図も FurnaceWorld が 出す
    return { ok: true, reason: null, used };
  }

  /** 開いている かまど で やく（カードを押したのと同じ） */
  clickBake(recipeId: string): { ok: boolean; reason: BakeReason; used: MaterialUse | null } {
    if (!this.opened) return { ok: false, reason: 'closed', used: null };
    return this.bake(recipeId, this.opened.x, this.opened.y, this.opened.z);
  }

  /** かまど の中の様子。かまど でなければ null */
  furnaceAt(x: number, y: number, z: number): FurnaceView | null {
    return this.fw.view(x, y, z);
  }

  /**
   * 毎ステップ呼べる: 今の素材（もちもの＋使える たんす）で「つくる」のレシピが 1 つでも作れるか（かなづち の印）。
   * しらべ直すのは プレイヤーのいる ブロックが 変わったとき・もちもの か どれかの たんす の中身が 変わったときだけ（§2.4 (2) 3）
   */
  canCraftAny(): boolean {
    const p = this.d.player?.();
    const ver = this.d.tansu?.version?.() ?? -2;
    const key = p ? `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}|${this.invVer}|${ver}|${this.fog()}` : `|${this.invVer}|${ver}`;
    if (ver !== -2 && key === this.hint.key) return this.hint.value;
    let any = false;
    for (const r of ALL_RECIPES) {
      if (r.station !== 'craft' || this.haveOne(r)) continue;
      let ok = true;
      for (const inp of r.inputs) {
        if (this.total(inp.item) < inp.count) {
          ok = false;
          break;
        }
      }
      if (ok) {
        any = true;
        break;
      }
    }
    this.hint = { key, value: any };
    return any;
  }

  /** 毎ステップ呼べる: かまど の火・けむり用の一覧（同じ入れ物を使いまわす） */
  furnaceFxEntries(): readonly FurnaceFxEntryLike[] {
    return this.fw.fxEntries();
  }

  /** 画面用: 焼いている かまど の位置の一覧 */
  furnacePositions(): Vec3[] {
    return this.fw.positions();
  }

  /** かまど をこわした: じゅんばん の材料・ねんりょう・待っている焼けたものを、こわした 人（この つくる の もちもの）へ。入らない分は ぶくろ */
  furnaceBroken(x: number, y: number, z: number): void {
    if (this.opened && this.opened.x === x && this.opened.y === y && this.opened.z === z) this.opened = null;
    const state = this.fw.remove(x, y, z);
    if (!state) return;
    const back: ItemStack[] = [];
    const addBack = (item: ItemId, count: number) => {
      const same = back.find((b) => b.item === item);
      if (same) same.count += count;
      else back.push({ item, count });
    };
    for (const q of state.queue) {
      const r = this.recipe(q.recipe);
      if (r) for (const inp of r.inputs) addBack(inp.item, inp.count);
      addBack(q.fuel, 1);
    }
    for (const s of state.done) addBack(s.item, s.count);
    const rest: ItemStack[] = [];
    for (const b of back) {
      const left = this.d.inventory.add(b.item, b.count);
      if (left > 0) rest.push({ item: b.item, count: left });
    }
    if (rest.length > 0) {
      // 1 マス分ずつ（上限をこえないように）
      const bags: ItemStack[] = [];
      for (const s of rest) {
        const max = itemType(s.item)?.maxStack ?? 64;
        for (let left = s.count; left > 0; left -= max) bags.push({ item: s.item, count: Math.min(max, left) });
      }
      this.d.drops?.scatter({ x: x + 0.5, y, z: z + 0.5 }, bags, { kind: 'death' });
    }
    this.d.requestSave?.();
  }

  // ---------------------------------------------------------- こわしたときの数

  fixedDrop(id: BlockId): number | null {
    return this.config.fixedDrop[id] ?? null;
  }

  // ---------------------------------------------------------- 毎ステップ

  /** 1 ステップ進める（持ち物の更新のあとで呼ぶ）。世界の かまどを 渡された ときは かまどは すすめない（`FurnaceWorld.update()` が すすめる） */
  update(): void {
    this.log.update();
    if (this.ownsFurnaces) this.fw.update();
    if (this.opened && !this.isFurnace(this.opened.x, this.opened.y, this.opened.z)) this.opened = null;
    this.tickCount++;
  }

  // ---------------------------------------------------------- 出来事

  drainEvents(): CraftEvent[] {
    if (this.drainQueue.length === 0) return NO_CRAFT_EVENTS; // 空のときは毎ステップ new しない
    const out = this.drainQueue;
    this.drainQueue = [];
    return out;
  }

  /** テストの窓口用: `craft.events()`（craft・craftFail）。呼ぶと空 */
  takeCraftHookEvents(): CraftEvent[] {
    const out = this.craftHookQueue;
    this.craftHookQueue = [];
    return out;
  }

  /** テストの窓口用: `furnace.events()`（bakeStart・bakeDone）。呼ぶと空 */
  takeFurnaceHookEvents(): CraftEvent[] {
    const out = this.furnaceHookQueue;
    this.furnaceHookQueue = [];
    return out;
  }

  private emit(e: CraftEvent, hook: 'craft' | 'furnace' | null): void {
    this.drainQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (hook === 'craft') {
      this.craftHookQueue.push(e);
      if (this.craftHookQueue.length > MAX_QUEUE) this.craftHookQueue.shift();
    } else if (hook === 'furnace') {
      this.furnaceHookQueue.push(e);
      if (this.furnaceHookQueue.length > MAX_QUEUE) this.furnaceHookQueue.shift();
    }
  }

  // ---------------------------------------------------------- 保存

  serializeFurnaces(): unknown {
    return this.fw.serialize();
  }

  /** 読みこみ用。おかしい分は捨てる */
  deserializeFurnaces(data: unknown): void {
    this.fw.deserialize(data);
    this.opened = null;
  }
}
