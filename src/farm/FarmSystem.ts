import {
  CROP_BLOCK,
  CROP_KINDS,
  SEED_ITEM,
  VEG_ITEM,
  WILD_BLOCK,
  cropKindOfBlock,
  vegKindOfItem,
  type BlockId,
  type CropKind,
  type CropStage,
  type FarmAim,
  type FarmCropInfo,
  type FarmDeps,
  type FarmEvent,
  type FarmHarvestResult,
  type FarmHintKind,
  type FarmPlacement,
  type FarmStepContext,
  type FarmSystem,
  type ItemId,
  type ItemStack,
  type SeedSource,
  type Vec3,
  type WorldRegions,
} from '../contracts';
import { blockIndexOf } from '../world/blocks/blockTypes';

/** 合図が出ている長さ（ステップ） */
export const HINT_TICKS = 120;
const LOG_MAX = 500;
const VISIT_RANGE = 4;

/** つなぎ込み・保存・テストの窓口が使う、`FarmSystem` に足した口 */
export interface FarmSystemImpl extends FarmSystem {
  /** 新しい世界: 置きものを 置いた直後に呼ぶ（たんす の中身を入れて 印をつける） */
  noteNewWorldPlaced(placement: FarmPlacement): void;
  /**
   * 前の保存: 読みこみのあとに呼ぶ。`changed` = 保存の「島とちがうマス」の番号（(y*sz+z)*sx+x）。
   * 印が あれば何もせず false。印が無ければ §4.5 (5) で置いて 印をつけ true
   */
  placeLegacy(changed: ReadonlySet<number>): boolean;
  /** だんを かえる（テスト用。stageTicks は 0）。作物でなければ false */
  setStage(x: number, y: number, z: number, stage: CropStage): boolean;
  /** 明るさ いつも 15 で 作物 n こ を 0 → 3 まで そだてた ステップの 列（世界は 変えない） */
  simulateGrowth(kind: CropKind, wet: boolean, n: number, seed: number): number[];
  /** 出ている合図 */
  lastHint(): FarmHintKind | null;
  /** 世界の かかし の 場所（置かれていなければ null） */
  kakashi(): Vec3 | null;
}

interface Crop {
  x: number;
  y: number;
  z: number;
  kind: CropKind;
  stage: CropStage;
  ticks: number;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
    set: (s: number) => {
      a = s >>> 0;
    },
  };
}

/** `FarmDeps` に 足す口（くさ の たね の 出やすさ用。`IslandInfo.regions` を そのまま わたす。無ければ 4 しゅるい 同じ） */
export type FarmDepsM7 = FarmDeps & { regions?: () => WorldRegions };

export function createFarmSystem(deps: FarmDepsM7): FarmSystemImpl {
  const { world, light, settings } = deps;
  const sx = world.size.x;
  const sy = world.size.y;
  const sz = world.size.z;
  const rng = mulberry((deps.seed ^ 0x4fa2a9c1) >>> 0);
  const key = (x: number, y: number, z: number) => (y * sz + z) * sx + x;

  const crops = new Map<number, Crop>();
  /** はたけ のマスの 一覧（しめり の 見直し用）。配列＋場所の表 */
  const soilArr: number[] = [];
  const soilPos = new Map<number, number>();
  let soilCursor = 0;
  let placed = false;
  let kakashiPos: Vec3 | null = null;
  let nearKakashi = false;
  let hint: { kind: FarmHintKind; tick: number } | null = null;
  let pending: FarmEvent[] = [];
  let log: FarmEvent[] = [];

  const emit = (e: FarmEvent) => {
    pending.push(e);
    log.push(e);
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    if (pending.length > LOG_MAX) pending.splice(0, pending.length - LOG_MAX);
  };

  const unKey = (k: number): Vec3 => {
    const x = k % sx;
    const z = Math.floor(k / sx) % sz;
    return { x, y: Math.floor(k / (sx * sz)), z };
  };

  const addSoil = (k: number) => {
    if (soilPos.has(k)) return;
    soilPos.set(k, soilArr.length);
    soilArr.push(k);
  };
  const removeSoil = (k: number) => {
    const p = soilPos.get(k);
    if (p === undefined) return;
    const last = soilArr.pop()!;
    if (last !== k) {
      soilArr[p] = last;
      soilPos.set(last, p);
    }
    soilPos.delete(k);
  };

  const dayLen = () => Math.max(1, deps.dayLength());
  const growTicks = (kind: CropKind, wet: boolean) => settings.farmGrowDays[wet ? 'wet' : 'dry'][kind] * dayLen();

  /** 1 ステップで 進む 確率 p と 必ず進む ステップ数 */
  const params = (kind: CropKind, wet: boolean) => {
    const f = settings.farmMaxWaitFactor;
    const T = Math.max(1, growTicks(kind, wet));
    const p = Math.min(1, (3 * (1 - Math.exp(-f))) / T);
    return { p, cap: Math.max(1, Math.ceil(f / p)) };
  };

  const hasWater = (x: number, y: number, z: number): boolean => {
    const r = settings.farmWetRange;
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) if (world.getBlock(x + dx, y + dy, z + dz) === 'water') return true;
    return false;
  };

  const soilWet = (x: number, y: number, z: number): boolean => world.getBlock(x, y, z) === 'farmland_wet';

  const rint = (lo: number, hi: number) => lo + Math.floor(rng.next() * (hi - lo + 1));

  const yieldItems = (kind: CropKind): ItemStack[] => {
    const [a, b] = settings.farmYield[kind];
    const [c, d] = settings.farmSeedYield;
    const veg = rint(a, b);
    const seeds = rint(c, d);
    return [
      { item: VEG_ITEM[kind], count: veg },
      { item: SEED_ITEM[kind], count: seeds },
    ];
  };

  const cropAt = (x: number, y: number, z: number): { kind: CropKind; wild: boolean; stage: CropStage; rec: Crop | null } | null => {
    const id = world.getBlock(x, y, z);
    if (id === 'outside') return null;
    const info = cropKindOfBlock(id);
    if (!info) return null;
    if (info.wild) return { kind: info.kind, wild: true, stage: 3, rec: null };
    const rec = crops.get(key(x, y, z)) ?? null;
    return { kind: info.kind, wild: false, stage: rec ? rec.stage : 0, rec };
  };

  const isLit = (x: number, y: number, z: number) => light.level(x, y, z) >= settings.farmMinLight;

  const crop = (x: number, y: number, z: number): FarmCropInfo | null => {
    const c = cropAt(x, y, z);
    if (!c) return null;
    const wet = !c.wild && soilWet(x, y - 1, z);
    return {
      kind: c.kind,
      stage: c.stage,
      stageTicks: c.rec ? c.rec.ticks : 0,
      wet,
      lit: isLit(x, y, z),
      ripe: c.stage === 3,
    };
  };

  const changeStage = (c: Crop, to: CropStage) => {
    const from = c.stage;
    c.stage = to;
    c.ticks = 0;
    world.touch?.(c.x, c.y, c.z);
    emit({ type: 'stage', tick: deps.tick(), x: c.x, y: c.y, z: c.z, kind: c.kind, from, to });
  };

  const setWet = (x: number, y: number, z: number, wet: boolean) => {
    world.setBlock(x, y, z, wet ? 'farmland_wet' : 'farmland');
    emit({ type: 'wet', tick: deps.tick(), x, y, z, wet });
  };

  /** 世界ぜんぶから はたけ を 数えなおす（読みこみ・置きもの のあと） */
  const rescanWorld = () => {
    soilArr.length = 0;
    soilPos.clear();
    const fi = blockIndexOf('farmland');
    const wi = blockIndexOf('farmland_wet');
    const w = world as unknown as { getIndex?: (x: number, y: number, z: number) => number };
    let i = 0;
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++, i++) {
          const v = w.getIndex ? w.getIndex(x, y, z) : blockIndexOf(world.getBlock(x, y, z));
          if (v === fi || v === wi) addSoil(i);
        }
  };

  const surfaceY = (x: number, z: number): number => {
    for (let y = sy - 1; y >= 0; y--) if (world.getBlock(x, y, z) !== 'air') return y + 1;
    return 0;
  };

  // ---------------------------------------------------------------- たね の 出やすさ
  const grassSeedKind = (x: number, z: number): CropKind | null => {
    const r = deps.regions?.();
    if (!r) return null;
    const f = r.flat;
    if (x >= f.x0 - 2 && x <= f.x1 + 2 && z >= f.z0 - 2 && z <= f.z1 + 2) return 'tomato';
    const near = (cx: number, cz: number, rad: number) => Math.hypot(x - cx, z - cz) <= rad + 3;
    if (
      r.river.some((q) => x >= q.x0 - 3 && x <= q.x1 + 3 && z >= q.z0 - 3 && z <= q.z1 + 3) ||
      near(r.spring.cx, r.spring.cz, r.spring.r) ||
      near(r.pond.cx, r.pond.cz, r.pond.r)
    )
      return 'eggplant';
    if (Math.hypot(x - r.meadow.cx, z - r.meadow.cz) <= r.meadow.r) return 'pumpkin';
    if (Math.hypot(x - r.forest.cx, z - r.forest.cz) <= r.forest.r) return 'onion';
    return null;
  };

  // ---------------------------------------------------------------- 毎ステップ
  const update = (ctx: FarmStepContext): void => {
    const minLight = settings.farmMinLight;
    const f = settings.farmMaxWaitFactor;
    const dl = dayLen();
    // そだつ
    for (const [k, c] of crops) {
      if (world.getBlock(c.x, c.y, c.z) !== CROP_BLOCK[c.kind]) {
        crops.delete(k);
        continue;
      }
      if (c.stage >= 3) continue;
      if (light.level(c.x, c.y, c.z) < minLight) continue;
      const wet = world.getBlock(c.x, c.y - 1, c.z) === 'farmland_wet';
      const T = Math.max(1, settings.farmGrowDays[wet ? 'wet' : 'dry'][c.kind] * dl);
      const p = Math.min(1, (3 * (1 - Math.exp(-f))) / T);
      c.ticks++;
      if (rng.next() < p || c.ticks >= f / p) changeStage(c, (c.stage + 1) as CropStage);
    }
    // しめり の 見直し（60 ステップで ひとまわり）
    const n = soilArr.length;
    if (n > 0) {
      const per = Math.ceil(n / Math.max(1, settings.farmWetRecheckTicks));
      for (let i = 0; i < per && soilArr.length > 0; i++) {
        if (soilCursor >= soilArr.length) soilCursor = 0;
        const k = soilArr[soilCursor]!;
        const { x, y, z } = unKey(k);
        const b = world.getBlock(x, y, z);
        if (b !== 'farmland' && b !== 'farmland_wet') {
          removeSoil(k);
          continue;
        }
        const w = hasWater(x, y, z);
        if (w !== (b === 'farmland_wet')) setWet(x, y, z, w);
        soilCursor++;
      }
    }
    // かかし に 近づいた
    if (kakashiPos) {
      const p = ctx.playerPos;
      const near =
        Math.abs(p.x - (kakashiPos.x + 0.5)) <= VISIT_RANGE + 0.5 &&
        Math.abs(p.z - (kakashiPos.z + 0.5)) <= VISIT_RANGE + 0.5 &&
        Math.abs(p.y - kakashiPos.y) <= 8;
      if (near && !nearKakashi) emit({ type: 'visitOldFarm', tick: deps.tick(), x: kakashiPos.x, y: kakashiPos.y, z: kakashiPos.z });
      nearKakashi = near;
    }
  };

  // ---------------------------------------------------------------- 置きもの
  const placeOldFarmBlocks = (p: NonNullable<FarmPlacement['oldFarm']>) => {
    for (const b of p.blocks) world.setBlock(b.x, b.y, b.z, b.id);
    for (const b of p.blocks) if (b.id === 'farmland' || b.id === 'farmland_wet') addSoil(key(b.x, b.y, b.z));
    kakashiPos = { ...p.kakashi };
    deps.fillTansu(p.tansu, p.tansuItems.map((s) => ({ ...s })));
  };

  const sys: FarmSystemImpl = {
    crop,
    crops: () => {
      const out: Array<{ x: number; y: number; z: number } & FarmCropInfo> = [];
      for (const c of crops.values()) {
        const i = crop(c.x, c.y, c.z);
        if (i) out.push({ x: c.x, y: c.y, z: c.z, ...i });
      }
      return out;
    },
    soil: (x, y, z) => {
      const b = world.getBlock(x, y, z);
      return b === 'farmland' ? { wet: false } : b === 'farmland_wet' ? { wet: true } : null;
    },
    settings: () => settings,

    till(x, y, z) {
      const b = world.getBlock(x, y, z);
      if ((b !== 'grass' && b !== 'dirt') || world.getBlock(x, y + 1, z) !== 'air') return false;
      const wet = hasWater(x, y, z);
      world.setBlock(x, y, z, wet ? 'farmland_wet' : 'farmland');
      addSoil(key(x, y, z));
      emit({ type: 'till', tick: deps.tick(), x, y, z });
      return true;
    },
    noteTillPress(x, y, z, count) {
      emit({ type: 'tillPress', tick: deps.tick(), x, y, z, count });
    },
    plant(x, y, z, kind) {
      const b = world.getBlock(x, y, z);
      if (b !== 'farmland' && b !== 'farmland_wet') return false;
      if (world.getBlock(x, y + 1, z) !== 'air') return false;
      world.setBlock(x, y + 1, z, CROP_BLOCK[kind]);
      crops.set(key(x, y + 1, z), { x, y: y + 1, z, kind, stage: 0, ticks: 0 });
      emit({ type: 'plant', tick: deps.tick(), x, y: y + 1, z, kind });
      return true;
    },
    harvest(x, y, z): FarmHarvestResult {
      const c = cropAt(x, y, z);
      if (!c) return { ok: false, reason: 'none' };
      const tick = deps.tick();
      if (c.stage < 3) {
        emit({ type: 'notRipe', tick, x, y, z, kind: c.kind });
        return { ok: false, reason: 'notRipe' };
      }
      const wet = !c.wild && soilWet(x, y - 1, z);
      world.setBlock(x, y, z, 'air');
      crops.delete(key(x, y, z));
      const items = yieldItems(c.kind);
      if (c.wild) emit({ type: 'wild', tick, x, y, z, kind: c.kind, seeds: items[1]!.count });
      else emit({ type: 'harvest', tick, x, y, z, kind: c.kind, veg: items[0]!.count, seeds: items[1]!.count, wet });
      return { ok: true, kind: c.kind, wild: c.wild, wet, items };
    },
    onBlockBroken(x, y, z, id: BlockId): ItemStack[] {
      if (id === 'farmland' || id === 'farmland_wet') {
        removeSoil(key(x, y, z));
        const c = cropAt(x, y + 1, z);
        if (!c || c.wild) return [];
        const tick = deps.tick();
        world.setBlock(x, y + 1, z, 'air');
        crops.delete(key(x, y + 1, z));
        if (c.stage < 3) return [{ item: SEED_ITEM[c.kind], count: 1 }];
        const items = yieldItems(c.kind);
        emit({ type: 'harvest', tick, x, y: y + 1, z, kind: c.kind, veg: items[0]!.count, seeds: items[1]!.count, wet: id === 'farmland_wet' });
        return items;
      }
      if (id === 'grass') {
        const c = cropAt(x, y + 1, z);
        if (!c || !c.wild) return [];
        world.setBlock(x, y + 1, z, 'air');
        const items = yieldItems(c.kind);
        emit({ type: 'wild', tick: deps.tick(), x, y: y + 1, z, kind: c.kind, seeds: items[1]!.count });
        return items;
      }
      if (cropKindOfBlock(id)) crops.delete(key(x, y, z));
      return [];
    },
    grassSeed(x, z) {
      if (!(rng.next() < settings.farmGrassSeedChance)) return null;
      const fav = grassSeedKind(x, z);
      let kind: CropKind;
      if (fav) {
        const w = settings.farmGrassSeedWeight;
        let r = rng.next() * (w + 3);
        kind = fav;
        if (r >= w) {
          r -= w;
          const others = CROP_KINDS.filter((k) => k !== fav);
          kind = others[Math.min(2, Math.floor(r))]!;
        }
      } else {
        kind = CROP_KINDS[Math.min(3, Math.floor(rng.next() * 4))]!;
      }
      const item = SEED_ITEM[kind];
      emit({ type: 'seedFound', tick: deps.tick(), x, y: surfaceY(x, z), z, from: 'grass', item });
      return item;
    },
    grassSeedKind,
    eatHeal(item: ItemId) {
      const k = vegKindOfItem(item);
      return k ? settings.eatHeal[k] : 0;
    },
    noteEat(item, heal, at) {
      emit({ type: 'eat', tick: deps.tick(), x: at.x, y: at.y, z: at.z, item, heal });
    },
    noteHint(h, at) {
      hint = { kind: h, tick: deps.tick() };
      emit({ type: 'hint', tick: deps.tick(), x: at.x, y: at.y, z: at.z, hint: h });
    },
    noteSeedFound(from: SeedSource, item, at) {
      emit({ type: 'seedFound', tick: deps.tick(), x: at.x, y: at.y, z: at.z, from, item });
    },

    update,
    aim(x, y, z): FarmAim | null {
      const c = cropAt(x, y, z);
      if (c) {
        const wet = !c.wild && soilWet(x, y - 1, z);
        return { dots: c.stage + 1, ripe: c.stage === 3, wet, dark: c.stage < 3 && !isLit(x, y, z) };
      }
      const s = sys.soil(x, y, z);
      return s ? { dots: 0, ripe: false, wet: s.wet, dark: false } : null;
    },
    growTicks,
    drainEvents() {
      const e = pending;
      pending = [];
      return e;
    },
    peekEvents: () => log.slice(),
    placedM7: () => placed,

    serialize() {
      const flat: number[] = [];
      for (const c of crops.values()) flat.push(c.x, c.y, c.z, CROP_KINDS.indexOf(c.kind) * 4 + c.stage, c.ticks);
      return { v: 1, placed, rng: rng.state(), kakashi: kakashiPos, crops: flat };
    },
    deserialize(data) {
      crops.clear();
      const d = data as { placed?: unknown; rng?: unknown; kakashi?: unknown; crops?: unknown } | null | undefined;
      // 印なし（前の保存・null）は まだ置いていない。farm の中身があって こわれているときは 置いたまま
      placed = d !== null && d !== undefined && typeof d === 'object' ? d.placed !== false : false;
      kakashiPos = null;
      nearKakashi = false;
      if (d && typeof d.rng === 'number') rng.set(d.rng);
      const kk = d?.kakashi as Vec3 | null | undefined;
      if (kk && Number.isFinite(kk.x) && Number.isFinite(kk.y) && Number.isFinite(kk.z)) kakashiPos = { x: kk.x, y: kk.y, z: kk.z };
      const arr = d?.crops;
      if (Array.isArray(arr)) {
        for (let i = 0; i + 4 < arr.length; i += 5) {
          const [x, y, z, ks, ticks] = [arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4]] as number[];
          if (![x, y, z, ks, ticks].every(Number.isInteger)) continue;
          const kind = CROP_KINDS[Math.floor(ks! / 4)];
          const stage = (ks! % 4) as CropStage;
          if (!kind || world.getBlock(x!, y!, z!) !== CROP_BLOCK[kind]) continue;
          crops.set(key(x!, y!, z!), { x: x!, y: y!, z: z!, kind, stage, ticks: Math.max(0, ticks!) });
        }
      }
      rescanWorld();
    },

    noteNewWorldPlaced(placement) {
      if (placement.oldFarm) placeOldFarmTansuOnly(placement.oldFarm);
      placed = true;
    },
    placeLegacy(changed) {
      if (placed) return false;
      const pl = deps.placement(deps.seed);
      for (const w of pl.wild) {
        if (changed.has(key(w.x, w.y, w.z)) || changed.has(key(w.x, w.y - 1, w.z))) continue;
        world.setBlock(w.x, w.y, w.z, WILD_BLOCK[w.kind]);
      }
      const of = pl.oldFarm;
      if (of) {
        const b = of.box;
        let clean = true;
        for (let y = b.y0; y <= b.y1 && clean; y++)
          for (let z = b.z0; z <= b.z1 && clean; z++)
            for (let x = b.x0; x <= b.x1; x++)
              if (changed.has(key(x, y, z))) {
                clean = false;
                break;
              }
        if (clean) placeOldFarmBlocks(of);
      }
      placed = true;
      return true;
    },
    setStage(x, y, z, stage) {
      const c = crops.get(key(x, y, z));
      if (!c) return false;
      c.stage = stage;
      c.ticks = 0;
      world.touch?.(x, y, z);
      return true;
    },
    simulateGrowth(kind, wet, n, seed) {
      const r = mulberry(seed >>> 0);
      const { p, cap } = params(kind, wet);
      const lq = p >= 1 ? 0 : Math.log(1 - p);
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        let total = 0;
        for (let s = 0; s < 3; s++) {
          const g = p >= 1 ? 1 : 1 + Math.floor(Math.log(1 - r.next()) / lq);
          total += Math.min(g, cap);
        }
        out.push(total);
      }
      return out;
    },
    lastHint() {
      return hint && deps.tick() - hint.tick < HINT_TICKS ? hint.kind : null;
    },
    kakashi: () => (kakashiPos ? { ...kakashiPos } : null),
  };

  /** 新しい世界: ブロックは E が 置いた。たんす の 中身と しるしだけ */
  function placeOldFarmTansuOnly(p: NonNullable<FarmPlacement['oldFarm']>) {
    for (const b of p.blocks) if (b.id === 'farmland' || b.id === 'farmland_wet') addSoil(key(b.x, b.y, b.z));
    kakashiPos = { ...p.kakashi };
    deps.fillTansu(p.tansu, p.tansuItems.map((s) => ({ ...s })));
  }

  return sys;
}
