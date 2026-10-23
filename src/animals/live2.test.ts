import { describe, expect, it } from 'vitest';
import type { AnimalEvent, BlockId, DayPhase, ItemId, ItemStack, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks, inInterior } from './coop';

/**
 * LIVE-2 A: こたつ・ひよこ・とりごや・小屋の子・金の たまご・保存 v 3（docs/design/LIVE-2.md §2・§4・§6）。
 * 世界は ArrayVoxelWorld（床 y=8）。小屋の ブロックは 本番では つなぎ込みが 置く（ここでは `coopBlocks` のとおり ならべる）。
 */
const SIZE = 100;

function setup(opts: { phase?: DayPhase; px?: number; pz?: number; seed?: number } = {}) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const st = { day: 0, phase: (opts.phase ?? 'day') as DayPhase };
  const player = { position: { x: opts.px ?? 20.5, y: 9, z: opts.pz ?? 20.5 } as Vec3 };
  const eggs: Vec3[] = [];
  const dropped: { at: Vec3; item: ItemId }[] = [];
  const bag: ItemId[] = [];
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: opts.seed ?? 7,
      settings,
      dropEgg: (at) => eggs.push({ ...at }),
      addItem: (it) => {
        bag.push(it);
        return true;
      },
      day: () => st.day,
      phase: () => st.phase,
      countryAt: () => ({ kind: 'harappa' }),
      placeCoopBlocks: (x, y, z, dir) => {
        for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, b.block);
        return true;
      },
      removeCoopBlocks: (x, y, z, dir) => {
        for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, 'air');
      },
      dropItem: (at, item) => dropped.push({ at: { ...at }, item }),
    },
  });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const ev = <T extends AnimalEvent['type']>(type: T) => m.events().filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === type);
  const one = (id: number) => m.list().find((a) => a.id === id)!;
  const kit = (x: number, z: number, y = 9) => {
    world.setBlock(x, y, z, 'nukunuku' as BlockId);
    return { x, y, z };
  };
  const full = settings.animalFollowTicks;
  return { world, st, player, eggs, dropped, bag, settings, m, step, ev, one, kit, full };
}
type S = ReturnType<typeof setup>;

const place = (s: S, x = 50, z = 50, dir: 0 | 1 | 2 | 3 = 0) => {
  const r = s.m.placeCoop(x, 9, z, dir);
  if (typeof r !== 'number') throw new Error('置けない: ' + r);
  return s.m.coops().find((c) => c.id === r)!;
};

describe('AC2 こたつに 入れる', () => {
  it('から + egg → 入る（left は kitHatchTicks）。egg で ない 物 は kitWait（2 こ目 は 入る）。すで kitNeedEgg。kin_tamago → gold', () => {
    const s = setup();
    const k = s.kit(30, 30);
    expect(s.m.useKit(k.x, k.y, k.z, null)).toBe('needEgg');
    expect(s.m.lastHint()).toBe('kitNeedEgg');
    expect(s.m.useKit(k.x, k.y, k.z, 'tomato' as ItemId)).toBe('needEgg');
    expect(s.m.kits()).toHaveLength(0);
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    // LIVE-2.1: kits() は eggs・size つき（先頭 の たまご の egg・left・wobble も のこる）
    expect(s.m.kits()).toEqual([{ x: 30, y: 9, z: 30, size: 1, egg: 'egg', left: 7200, wobble: 0, eggs: [{ egg: 'egg', left: 7200, wobble: 0 }] }]);
    expect(s.m.kitAt(30, 9, 30)).not.toBeNull();
    // LIVE-2.1 §2.4: 2 こ目 も 入る（3 こ まで）。egg で ない もの は kitWait
    expect(s.m.useKit(k.x, k.y, k.z, 'tomato' as ItemId)).toBe('wait');
    expect(s.m.lastHint()).toBe('kitWait');
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    const k2 = s.kit(32, 30);
    expect(s.m.useKit(k2.x, k2.y, k2.z, 'kin_tamago')).toBe('put');
    expect(s.m.kitAt(32, 9, 30)!.egg).toBe('gold');
  });
  it('7 つ目は kitMax。ブロックが nukunuku で ない所は 入れない', () => {
    const s = setup();
    for (let i = 0; i < 6; i++) {
      const k = s.kit(30 + i * 2, 30);
      expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    }
    const k7 = s.kit(50, 30);
    expect(s.m.useKit(k7.x, k7.y, k7.z, 'egg')).toBe('max');
    expect(s.m.lastHint()).toBe('kitMax');
    expect(s.m.kits()).toHaveLength(6);
    expect(s.m.useKit(70, 9, 70, 'egg')).toBe('needEgg');
  });
});

describe('AC3 かえる（通し）', () => {
  it('600 ステップ目に hatchStart・60 後に hatch・ひよこ(chick)・なかま・follow まんたん・こたつは から', () => {
    const s = setup();
    s.settings.kitHatchTicks = 600;
    s.settings.machoChance = 0;
    const k = s.kit(30, 30);
    s.player.position.x = 25.5;
    s.player.position.z = 30.5;
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.m.events();
    let start = -1;
    let hatch = -1;
    let hEv: Extract<AnimalEvent, { type: 'hatch' }> | undefined;
    for (let i = 1; i <= 800 && hatch < 0; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'hatchStart') {
          start = i;
          expect(e).toMatchObject({ x: 30, y: 9, z: 30 });
        }
        if (e.type === 'hatch') {
          hatch = i;
          hEv = e;
        }
      }
    }
    expect(start).toBe(600);
    expect(hatch - start).toBe(60);
    expect(hEv).toMatchObject({ breed: 'normal', gold: false });
    const rows = s.m.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stage: 'chick', friend: true, follow: s.full, breed: 'normal', home: null, raised: false });
    expect(s.m.kits()).toHaveLength(0);
    expect(s.world.getBlock(30, 9, 30)).toBe('nukunuku');
  });
  it('かえる 動き の あいだ state は hatch・hatchT は 0→1。となり の 地面 に 出る', () => {
    const s = setup();
    s.settings.kitHatchTicks = 10;
    const k = s.kit(30, 30);
    s.player.position.x = 26.5;
    s.player.position.z = 30.5;
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(10);
    const r = s.m.list()[0]!;
    expect(r.state).toBe('hatch');
    expect(Math.hypot(r.x - 30.5, r.z - 30.5)).toBeCloseTo(1, 5);
    expect(r.y).toBe(9);
    // プレイヤー に 近い がわ（西）
    expect(r.x).toBeLessThan(30.5);
    const ts: number[] = [];
    s.step(30);
    s.m.forEachVisible((v) => ts.push(v.hatchT ?? -1));
    expect(ts[0]).toBeGreaterThan(0.4);
    expect(ts[0]).toBeLessThan(0.6);
    const kt: number[] = [];
    s.m.forEachKit((q) => kt.push(q.hatchT));
    expect(kt[0]).toBeCloseTo(ts[0]!, 5);
  });
  it('30 マス はなれて いると 1,200 ステップ でも かえらず、5 マス に もどる と 61 ステップ 以内 に hatchStart', () => {
    const s = setup({ px: 80.5, pz: 30.5 });
    s.settings.kitHatchTicks = 600;
    const k = s.kit(30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(1200);
    expect(s.ev('hatchStart')).toHaveLength(0);
    expect(s.m.kits()[0]!.left).toBe(0);
    s.player.position.x = 25.5;
    let near = -1;
    for (let i = 1; i <= 70 && near < 0; i++) {
      s.step(1);
      if (s.ev('hatchStart').length) near = i;
    }
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(61);
  });
  it('なかま 8 わ だと かえらず friendFull（600 ステップ ごと）', () => {
    const s = setup({ px: 25.5, pz: 30.5 });
    s.settings.kitHatchTicks = 300;
    const k = s.kit(30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    for (let i = 0; i < 8; i++) s.m.spawn(20.5 + i, 9, 40.5, { friend: true, follow: s.full });
    s.m.events();
    s.step(1300);
    const evs = s.m.events();
    expect(evs.filter((e) => e.type === 'hatch')).toHaveLength(0);
    const hints = evs.filter((e) => e.type === 'hint' && e.hint === 'friendFull');
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints.length).toBeLessThanOrEqual(3);
    expect(s.m.kits()).toHaveLength(1);
    // 1 わ はなれたら かえる
    s.m.spawn(0, 0, 0, {});
    const ids = s.m.list().filter((a) => a.friend).map((a) => a.id);
    s.m.clear();
    expect(ids.length).toBeGreaterThan(0);
  });
  it('となり が ぜんぶ かたい → こたつ の 上。上 も かたい → かえらず 待つ', () => {
    const s = setup({ px: 25.5, pz: 30.5 });
    s.settings.kitHatchTicks = 5;
    const k = s.kit(30, 30);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.world.setBlock(30 + dx, 9, 30 + dz, 'stone');
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(8);
    const r = s.m.list()[0]!;
    expect(r.y).toBe(10);
    expect(Math.hypot(r.x - 30.5, r.z - 30.5)).toBeLessThan(0.01);
    const t = setup({ px: 25.5, pz: 30.5 });
    t.settings.kitHatchTicks = 5;
    const k2 = t.kit(30, 30);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.world.setBlock(30 + dx, 9, 30 + dz, 'stone');
    t.world.setBlock(30, 10, 30, 'stone');
    t.m.useKit(k2.x, k2.y, k2.z, 'egg');
    t.step(200);
    expect(t.m.list()).toHaveLength(0);
    expect(t.m.kits()).toHaveLength(1);
    t.world.setBlock(30, 10, 30, 'air');
    t.step(70);
    expect(t.m.list()).toHaveLength(1);
  });
  it('こたつ を こわす → たまご は もどる（egg は dropEgg・金 は kin_tamago）', () => {
    const s = setup();
    const a = s.kit(30, 30);
    const b = s.kit(34, 30);
    s.m.useKit(a.x, a.y, a.z, 'egg');
    s.m.useKit(b.x, b.y, b.z, 'kin_tamago');
    s.step(10);
    s.world.setBlock(30, 9, 30, 'air');
    s.world.setBlock(34, 9, 30, 'air');
    s.step(2);
    expect(s.m.kits()).toHaveLength(0);
    expect(s.eggs).toHaveLength(1);
    expect(s.dropped.map((d) => d.item)).toEqual(['kin_tamago']);
  });
});

describe('AC4 ゆれ', () => {
  it('のこり 2/3 以上 0・1/3 以上 1・それ未満 2', () => {
    const s = setup();
    s.settings.kitHatchTicks = 3000;
    const k = s.kit(30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    const w = () => s.m.kits()[0]!.wobble;
    expect(w()).toBe(0);
    s.step(1000);
    expect(w()).toBe(0); // のこり 2000 = ちょうど 2/3
    s.step(1);
    expect(w()).toBe(1);
    s.step(999);
    expect(w()).toBe(1); // のこり 1000 = ちょうど 1/3
    s.step(1);
    expect(w()).toBe(2);
  });
});

describe('AC17 種類（かえる 時）', () => {
  const hatchOne = (s: S, item: 'egg' | 'kin_tamago', x: number) => {
    const k = s.kit(x, 30);
    s.m.useKit(k.x, k.y, k.z, item);
    s.player.position.x = x - 4.5;
    s.player.position.z = 30.5;
    s.m.events();
    let t0 = -1;
    for (let i = 1; i <= 400; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'hatchStart') t0 = i;
        if (e.type === 'hatch') return { dur: i - t0, ev: e };
      }
    }
    throw new Error('かえらない');
  };
  it('machoChance 1 → macho・80 ステップ・gold false', () => {
    const s = setup();
    s.settings.kitHatchTicks = 5;
    s.settings.machoChance = 1;
    const r = hatchOne(s, 'egg', 30);
    expect(r.ev).toMatchObject({ breed: 'macho', gold: false });
    expect(r.dur).toBe(80);
    expect(s.m.list()[0]!.breed).toBe('macho');
  });
  it('kin_tamago（machoChance 0・machoMiss 5）→ macho・80・gold true・machoMiss 5 の まま', () => {
    const s = setup();
    s.settings.kitHatchTicks = 5;
    s.settings.machoChance = 0;
    s.m.machoMiss(5);
    const r = hatchOne(s, 'kin_tamago', 30);
    expect(r.ev).toMatchObject({ breed: 'macho', gold: true });
    expect(r.dur).toBe(80);
    expect(s.m.machoMiss()).toBe(5);
  });
  it('machoChance 0 で 19 回 normal・20 回目 macho。大人に なっても かわらない', () => {
    const s = setup();
    s.settings.kitHatchTicks = 2;
    s.settings.machoChance = 0;
    const out: string[] = [];
    for (let n = 0; n < 20; n++) {
      out.push(hatchOne(s, 'egg', 30).ev.breed);
      s.m.clear();
    }
    expect(out.slice(0, 19)).toEqual(Array(19).fill('normal'));
    expect(out[19]).toBe('macho');
    expect(s.m.machoMiss()).toBe(0);
  });
  it('machoMiss は 保存 される', () => {
    const s = setup();
    s.m.machoMiss(7);
    const t = setup();
    t.m.deserialize(JSON.parse(JSON.stringify(s.m.serialize())));
    expect(t.m.machoMiss()).toBe(7);
  });
});

describe('AC5・AC6 ひよこ', () => {
  it('当たり 0.35×0.3・マッチョは 1.15 倍', () => {
    const s = setup();
    const a = s.m.spawn(30.5, 9, 30.5, { friend: true, stage: 'chick' })!;
    const b = s.m.spawn(32.5, 9, 30.5, { friend: true, stage: 'chick', breed: 'macho' })!;
    expect(s.one(a).size).toEqual({ h: 0.35, w: 0.3, l: 0.3 });
    expect(s.one(b).size.h / s.one(a).size.h).toBeCloseTo(1.15, 2);
  });
  it('ねらう 箱: 横 0.33 で 当たり 0.4 で 当たらない・高さ 0.6', () => {
    const s = setup();
    s.m.spawn(30.5, 9, 30.5, { friend: true, stage: 'chick', follow: 0 });
    const o = (dz: number) => s.m.rayHit({ x: 20.5, y: 9.3, z: 30.5 + dz }, { x: 1, y: 0, z: 0 }, 20);
    expect(o(0.33)).not.toBeNull();
    expect(o(-0.33)).not.toBeNull();
    expect(o(0.4)).toBeNull();
    expect(s.m.rayHit({ x: 20.5, y: 9.7, z: 30.5 }, { x: 1, y: 0, z: 0 }, 20)).toBeNull();
    expect(s.m.rayHit({ x: 20.5, y: 9.55, z: 30.5 }, { x: 1, y: 0, z: 0 }, 20)).not.toBeNull();
  });
  it('むし → fullLeft 600・follow まんたん・animalEggChance 1 でも たまご なし・bugs +1', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    const id = s.m.spawn(21.5, 9, 20.5, { friend: true, stage: 'chick', follow: 100 })!;
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id)).toMatchObject({ fullLeft: 600, follow: s.full, bugs: 1 });
    s.step(700);
    expect(s.ev('egg')).toHaveLength(0);
    expect(s.eggs).toHaveLength(0);
  });
  it('小屋の 外で あさ 3 回 → grow 0・chick', () => {
    const s = setup();
    const id = s.m.spawn(21.5, 9, 20.5, { friend: true, stage: 'chick' })!;
    for (let i = 0; i < 3; i++) {
      s.st.day++;
      s.step(2);
    }
    expect(s.one(id)).toMatchObject({ grow: 0, stage: 'chick' });
  });
  it('パタパタ: 10 マス 上 → 下向き 2.5 以下・228 ステップ 以上・着地 で roll。低い 段差 では roll なし', () => {
    const s = setup();
    const id = s.m.spawn(20.5, 19, 30.5, { friend: true, stage: 'chick', follow: 0 })!;
    s.m.events();
    let maxFall = 0;
    let landed = -1;
    for (let i = 1; i <= 600 && landed < 0; i++) {
      s.step(1);
      const c = s.one(id);
      maxFall = Math.max(maxFall, -c.vy);
      if (c.y <= 9.05) landed = i;
    }
    expect(maxFall).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(maxFall).toBeGreaterThan(2.4);
    expect(landed).toBeGreaterThanOrEqual(228);
    s.step(20);
    expect(s.ev('roll')).toHaveLength(1);
    const t = setup();
    t.m.spawn(20.5, 10.2, 30.5, { friend: true, stage: 'chick', follow: 0 });
    t.step(60);
    expect(t.ev('roll')).toHaveLength(0);
    // 大人 は 2.0（LIVE-1）で roll なし
    const u = setup();
    const a = u.m.spawn(20.5, 19, 30.5, { friend: true, follow: 0 })!;
    let mf = 0;
    for (let i = 0; i < 400; i++) {
      u.step(1);
      mf = Math.max(mf, -u.one(a).vy);
    }
    expect(mf).toBeLessThanOrEqual(2.0 + 1e-9);
    expect(u.ev('roll')).toHaveLength(0);
  });
});

describe('AC7 小屋を 置く', () => {
  it('置く → 5×5 の ブロック（もん 1・ねぐら・すばこ 1・さく）・coops 1・もんの むき', () => {
    const s = setup();
    const c = place(s, 50, 50, 3);
    const seen: Record<string, number> = {};
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) {
      const b = s.world.getBlock(50 + dx, 9 + dy, 50 + dz);
      if (String(b).startsWith('toriya_')) seen[b] = (seen[b] ?? 0) + 1;
    }
    expect(seen.toriya_box).toBe(1);
    expect(seen.toriya_gate).toBe(2);
    expect(seen.toriya_nest).toBe(7); // すばこ の 上 の 1 マス は あけて たまご を 見せる
    expect(seen.toriya_fence).toBe(12);
    expect(c.gate).toEqual({ x: 48, z: 50 });
    expect(c).toMatchObject({ x: 50, y: 9, z: 50, dir: 3, kids: [], nest: { egg: 0, gold: 0 } });
    // 中 3×3 は くうき
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) expect(s.world.getBlock(50 + dx, 9, 50 + dz)).toBe('air');
  });
  it('4 方向 どれ でも もんは 中の 反対 側 に ねぐら', () => {
    for (const dir of [0, 1, 2, 3] as const) {
      const s = setup();
      const c = place(s, 50, 50, dir);
      const [fx, fz] = [Math.sign(c.gate.x - c.x), Math.sign(c.gate.z - c.z)];
      expect(String(s.world.getBlock(c.x - fx * 2, 9, c.z - fz * 2))).toBe('toriya_box');
      expect(String(s.world.getBlock(c.gate.x, 9, c.gate.z))).toBe('toriya_gate');
    }
  });
  it('1 マス ずれて 入る 所 に 置く。穴 3 の でこぼこ は 置かない・coopNoRoom', () => {
    const s = setup();
    s.world.setBlock(48, 9, 48, 'brick'); // LIVE-2.1: いし・つち は 消える ので、じゃま な レンガ の 柱 で ずらす
    s.world.setBlock(48, 10, 48, 'brick');
    const r = s.m.placeCoop(50, 9, 50, 0);
    expect(typeof r).toBe('number');
    const c = s.m.coops()[0]!;
    expect(Math.abs(c.x - 48) > 2 || Math.abs(c.z - 48) > 2).toBe(true);
    const t = setup();
    for (const [x, z] of [[74, 74], [76, 74], [75, 76]] as const) for (const y of [8, 7, 6]) t.world.setBlock(x, y, z, 'air'); // 深さ 3 の あな（LIVE-2.1: 深さ 2 までは うめる）
    expect(t.m.placeCoop(75, 9, 75, 0)).toBe('noRoom');
    expect(t.m.lastHint()).toBe('coopNoRoom');
    expect(t.m.coops()).toHaveLength(0);
    expect(t.m.previewCoop(75, 9, 75, 0)).toMatchObject({ ok: false, x: 75, z: 75 });
    expect(setup().m.previewCoop(50, 9, 50, 0)).toMatchObject({ ok: true, x: 50, z: 50 });
  });
  it('草花 は 置くと 消える 扱い・高い 柱 は だめ。小屋 は 3 つ まで・4 つ目 coopMax', () => {
    const s = setup();
    s.world.setBlock(50, 9, 50, 'flower_y');
    expect(typeof s.m.placeCoop(50, 9, 50, 0)).toBe('number');
    expect(typeof s.m.placeCoop(20, 9, 50, 0)).toBe('number');
    expect(typeof s.m.placeCoop(35, 9, 70, 0)).toBe('number');
    expect(s.m.placeCoop(70, 9, 70, 0)).toBe('max');
    expect(s.m.lastHint()).toBe('coopMax');
    expect(s.m.coops()).toHaveLength(3);
    expect(s.m.previewCoop(70, 9, 70, 0).ok).toBe(false);
  });
  it('他の 小屋 と かさなる 所 には 置かない', () => {
    const s = setup();
    place(s, 50, 50);
    const r = s.m.placeCoop(50, 9, 50, 0);
    // かさなる 5×5 は だめ。ずらしても 1 マス では ぜんぶ かさなる
    expect(r).toBe('noRoom');
  });
  it('coopAt: わ の ブロック は 小屋、中 3×3 と 外 は null', () => {
    const s = setup();
    const c = place(s);
    expect(s.m.coopAt(48, 9, 50)?.id).toBe(c.id);
    expect(s.m.coopAt(52, 11, 52)?.id).toBe(c.id);
    expect(s.m.coopAt(50, 9, 50)).toBeNull();
    expect(s.m.coopAt(55, 9, 50)).toBeNull();
    expect(s.m.coopAt(48, 14, 50)).toBeNull();
  });
});

describe('AC8 通れる か（小屋の 子・やせい・なかま）', () => {
  it('小屋の 子（ひよこ・大人）は 1,200 ステップ 中 3×3 から 出ない', () => {
    const s = setup({ px: 53.5, pz: 50.5 });
    const c = place(s);
    const a = s.m.spawn(50.5, 9, 50.5, { stage: 'chick', home: c.id })!;
    const b = s.m.spawn(51.5, 9, 51.5, { stage: 'adult', home: c.id })!;
    for (let i = 0; i < 1200; i++) {
      s.step(1);
      for (const id of [a, b]) {
        const r = s.one(id);
        expect(Math.abs(r.x - 50.5)).toBeLessThan(1.5);
        expect(Math.abs(r.z - 50.5)).toBeLessThan(1.5);
      }
    }
  });
  it('やせい は 5×5 に 入らない（もん の 前 から 1,200 ステップ）', () => {
    const s = setup({ px: 20.5, pz: 20.5 });
    const c = place(s, 50, 50, 0);
    // もん は 北(-z)。もん の 前 3 マス
    const w = s.m.spawn(50.5, 9, 46.5, {})!;
    for (let i = 0; i < 1200; i++) {
      s.step(1);
      const r = s.m.list().find((q) => q.id === w);
      expect(r).toBeDefined();
      expect(Math.abs(r!.x - (c.x + 0.5)) < 2.5 && Math.abs(r!.z - (c.z + 0.5)) < 2.5).toBe(false);
    }
  });
  it('ついてくる なかま は もん から 入れる（ワープなし）。中で 180 ステップ すごすと 小屋の 子', () => {
    const s = setup({ px: 50.5, pz: 44.5 });
    place(s, 50, 50, 0);
    const id = s.m.spawn(50.5, 9, 43.0, { friend: true, follow: s.full })!;
    s.step(10);
    // プレイヤー が もん を 通って 中 へ あるく
    for (let i = 0; i < 160; i++) {
      s.player.position.z = Math.min(51.7, s.player.position.z + 0.07);
      s.step(1);
    }
    expect(s.ev('warp')).toHaveLength(0);
    const r = s.one(id);
    expect(Math.abs(r.x - 50.5)).toBeLessThan(1.5);
    expect(r.z).toBeGreaterThan(48.9);
    expect(r.z).toBeLessThan(52);
  });
});

describe('AC9 小屋の 子に する', () => {
  const inside = () => {
    const s = setup({ px: 50.5, pz: 50.5 });
    const c = place(s);
    return { s, c };
  };
  it('中 に 入った ステップ に home・出来事 home（LIVE-2.1: 3 秒 まつ を やめた）・homeFill は 出ない・follow は 使わない', () => {
    const { s, c } = inside();
    const id = s.m.spawn(51.3, 9, 50.5, { friend: true, follow: s.full })!;
    s.m.events();
    const fill = () => {
      let f: number | undefined = -1;
      s.m.forEachVisible((v) => {
        if (v.id === id) f = v.homeFill;
      });
      return f;
    };
    s.step(1);
    expect(s.one(id)).toMatchObject({ home: c.id, follow: 0 });
    expect(s.ev('home')).toEqual([{ type: 'home', id, coop: c.id }]);
    expect(fill()).toBeUndefined();
    expect(s.m.coops()[0]!.kids).toEqual([id]);
    let follow: number | undefined = -1;
    s.m.forEachVisible((v) => {
      if (v.id === id) follow = v.follow;
    });
    expect(follow).toBe(0);
  });
  it('中 に 入って すぐ プレイヤー が 外 に 出て も 小屋 の 子 の まま（LIVE-2.1: 「120 いて 出る → なかま」は なくなった）', () => {
    const { s, c } = inside();
    const id = s.m.spawn(51.3, 9, 50.5, { friend: true, follow: s.full })!;
    s.step(2);
    s.player.position.x = 50.5;
    s.player.position.z = 40.5;
    s.step(300);
    const r = s.one(id);
    expect(r.home).toBe(c.id);
    expect(r.follow).toBe(0);
  });
  it('だっこ から 中 に おろす → すぐ home。6 わ の 小屋 → おろさない・coopFull・putDownWhy', () => {
    const { s, c } = inside();
    const id = s.m.spawn(60.5, 9, 60.5, { friend: true, follow: s.full })!;
    s.player.position.x = 59.5;
    s.player.position.z = 60.5;
    expect(s.m.carryHold(id, 40)).toBe('lifted');
    s.player.position.x = 50.5;
    s.player.position.z = 50.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 50.5 })).toBe(true);
    expect(s.one(id).home).toBe(c.id);
    expect(s.ev('home')).toHaveLength(1);
    for (let i = 0; i < 5; i++) s.m.spawn(50.5 + ((i % 3) - 1), 9, 50.5 + (Math.floor(i / 3) - 1 || 1), { home: c.id });
    expect(s.m.coops()[0]!.kids).toHaveLength(6);
    const id7 = s.m.spawn(60.5, 9, 60.5, { friend: true, follow: s.full })!;
    s.player.position.x = 59.5;
    s.player.position.z = 60.5;
    expect(s.m.carryHold(id7, 40)).toBe('lifted');
    s.player.position.x = 50.5;
    s.player.position.z = 50.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 50.5 })).toBe(false);
    expect(s.m.putDownWhy()).toBe(s.m.lastHint());
    expect(s.m.lastHint()).toBe('coopFull');
    expect(s.m.carrying()).toBe(id7);
    expect(s.one(id7).home).toBeNull();
  });
  it('小屋の 子 を 外 に おろす → なかま（home null・follow 0）。なかま 8 わ → おろさない・friendFull', () => {
    const { s, c } = inside();
    const id = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    s.player.position.x = 49.5;
    s.player.position.z = 50.5;
    expect(s.m.carryHold(id, 40)).toBe('lifted');
    expect(s.one(id).home).toBe(c.id);
    expect(s.m.coops()[0]!.kids).toEqual([id]);
    s.player.position.x = 50.5;
    s.player.position.z = 40.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 40.5 })).toBe(true);
    expect(s.one(id)).toMatchObject({ home: null, follow: 0, friend: true });
    expect(s.m.coops()[0]!.kids).toEqual([]);
    // もう 一度 中 に 入れて、8 わ の とき
    const k2 = s.m.spawn(50.5, 9, 50.5, { home: c.id })!;
    for (let i = 0; i < 7; i++) s.m.spawn(30.5 + i, 9, 30.5, { friend: true, follow: s.full });
    expect(s.m.friendCount()).toBe(8);
    s.player.position.x = 49.5;
    s.player.position.z = 50.5;
    expect(s.m.carryHold(k2, 40)).toBe('lifted');
    s.player.position.x = 50.5;
    s.player.position.z = 40.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 40.5 })).toBe(false);
    expect(s.m.putDownWhy()).toBe(s.m.lastHint());
    expect(s.m.lastHint()).toBe('friendFull');
    expect(s.one(k2).home).toBe(c.id);
  });
  it('小屋の 子は なかま 8 に 数えない: なかま 8 ＋ 小屋の 子 6', () => {
    const { s, c } = inside();
    for (let i = 0; i < 6; i++) expect(s.m.spawn(50.5 + ((i % 3) - 1), 9, 50.5 + (Math.floor(i / 3) - 1 || 1), { home: c.id, stage: 'adult' })).not.toBeNull();
    for (let i = 0; i < 8; i++) expect(s.m.spawn(30.5 + i, 9, 30.5, { friend: true })).not.toBeNull();
    expect(s.m.spawn(40.5, 9, 30.5, { friend: true })).toBeNull();
    expect(s.m.spawn(50.5, 9, 50.5, { home: c.id })).toBeNull();
    expect(s.m.friendCount()).toBe(8);
    expect(s.m.count()).toBe(14);
  });
  it('6 わ の 小屋 では しるし を 出さず 何も おきない', () => {
    const { s, c } = inside();
    for (let i = 0; i < 6; i++) s.m.spawn(50.5 + ((i % 3) - 1), 9, 50.5 + (Math.floor(i / 3) - 1 || 1), { home: c.id });
    const id = s.m.spawn(50.5, 9, 50.5, { friend: true, follow: s.full })!;
    s.step(400);
    expect(s.one(id).home).toBeNull();
  });
  it('いえ の しるし の とちゅう の なかま だけ の 小屋 は こわせる（breakCoop ok）', () => {
    const { s, c } = inside();
    s.settings.coopEnterTicks = 1_000_000;
    s.m.spawn(50.5, 9, 50.5, { friend: true, follow: s.full });
    s.step(30);
    expect(s.m.breakCoop(c.id, true)).toBe('ok');
  });
});

describe('AC11 大人に なる', () => {
  const kidSetup = (kids = 1) => {
    const s = setup({ px: 44.5, pz: 50.5 });
    const c = place(s);
    const ids: number[] = [];
    for (let i = 0; i < kids; i++) ids.push(s.m.spawn(50.5 + i * 0.5, 9, 50.5, { home: c.id, stage: 'chick' })!);
    s.step(3);
    return { s, c, ids };
  };
  it('あさ 1 回 → grow 1・chick。2 回目 → 60 以内 growStart・60 後 adult・raised・grow(first)', () => {
    const { s, ids } = kidSetup();
    const id = ids[0]!;
    s.st.day++;
    s.step(2);
    expect(s.one(id)).toMatchObject({ grow: 1, stage: 'chick' });
    s.m.events();
    s.st.day++;
    let start = -1;
    let done = -1;
    let gEv: Extract<AnimalEvent, { type: 'grow' }> | undefined;
    for (let i = 1; i <= 200 && done < 0; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'growStart' && start < 0) {
          start = i;
          expect(e.id).toBe(id);
        }
        if (e.type === 'grow') {
          done = i;
          gEv = e;
        }
      }
    }
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThanOrEqual(2);
    expect(done - start).toBe(60);
    expect(gEv).toMatchObject({ id, first: true, breed: 'normal' });
    expect(s.one(id)).toMatchObject({ stage: 'adult', raised: true, grow: 0, home: expect.any(Number) });
  });
  it('2 わ目は first false。プレイヤー が 30 マス では あさ 2 回目 でも chick、近づくと 60 以内', () => {
    const { s, c, ids } = kidSetup(2);
    s.st.day += 2;
    s.step(5);
    s.step(100);
    const evs = s.m.events().filter((e) => e.type === 'grow');
    expect(evs).toHaveLength(2);
    expect(evs.map((e) => (e as { first: boolean }).first)).toEqual([true, false]);
    expect(ids.every((id) => s.one(id).stage === 'adult')).toBe(true);
    // 遠く
    const f = s.m.spawn(c.x + 0.5, 9, c.z + 0.5, { home: c.id, stage: 'chick', grow: 1 })!;
    s.player.position.x = c.x + 30.5;
    s.player.position.z = c.z + 0.5;
    s.st.day++;
    s.step(200);
    expect(s.one(f).stage).toBe('chick');
    s.m.events();
    s.player.position.x = c.x + 0.5 + 15;
    let near = -1;
    for (let i = 1; i <= 70 && near < 0; i++) {
      s.step(1);
      if (s.ev('growStart').length) near = i;
    }
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(60);
  });
  it('grewBefore が あれば first は それ に したがう', () => {
    const { s, ids } = kidSetup();
    (s.m as unknown as { d: { grewBefore?: () => boolean } }).d.grewBefore = () => true;
    s.st.day += 2;
    s.step(100);
    const g = s.m.events().find((e) => e.type === 'grow') as { first: boolean };
    expect(g.first).toBe(false);
    expect(s.one(ids[0]!).stage).toBe('adult');
  });
  it('マッチョ は 大人 に なっても breed が かわらない・ひよこ の とき 小屋 から 出て 外 で すごすと そだたない', () => {
    const s = setup({ px: 44.5, pz: 50.5 });
    const c = place(s);
    const m = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'chick', breed: 'macho' })!;
    const o = s.m.spawn(30.5, 9, 30.5, { friend: true, stage: 'chick' })!;
    s.step(2);
    s.st.day += 2;
    s.step(100);
    expect(s.one(m)).toMatchObject({ stage: 'adult', breed: 'macho' });
    expect(s.one(o)).toMatchObject({ stage: 'chick', grow: 0 });
  });
});

describe('AC12 小屋の たまご', () => {
  const adultKid = () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    s.settings.animalEggChance = 1;
    const c = place(s);
    const id = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult', raised: true })!;
    s.step(3);
    return { s, c, id };
  };
  it('むし → すばこ に 入る（animalEggDelay 後）・足もと に なし', () => {
    const { s, c, id } = adultKid();
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(s.settings.animalEggDelay - 1);
    expect(s.m.coops()[0]!.nest.egg).toBe(0);
    s.step(1);
    expect(s.m.coops()[0]!.nest.egg).toBe(1);
    expect(s.eggs).toHaveLength(0);
    const ev = s.ev('egg');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ id, coop: c.id });
    expect(ev[0]!.gold).toBeUndefined();
    expect(s.one(id).follow).toBe(0);
  });
  it('12 こ で あふれる → 足もと に おとす・coopCollect で ぜんぶ 持ち物 へ', () => {
    const { s, c, id } = adultKid();
    for (let i = 0; i < 13; i++) {
      s.m.feed(id, 'mushi');
      s.step(s.settings.animalEggDelay + 2);
      s.step(s.settings.animalFullTicks + 5);
    }
    expect(s.m.coops()[0]!.nest.egg).toBe(12);
    expect(s.eggs).toHaveLength(1);
    expect(s.m.collectCoop(c.id)).toEqual({ egg: 12, gold: 0 });
    expect(s.bag.filter((i) => i === 'egg')).toHaveLength(12);
    expect(s.m.coops()[0]!.nest.egg).toBe(0);
    expect(s.ev('coopCollect')).toEqual([{ type: 'coopCollect', egg: 12, gold: 0 }]);
    // 0 こ は 何も 出さない
    expect(s.m.collectCoop(c.id)).toEqual({ egg: 0, gold: 0 });
    expect(s.ev('coopCollect')).toHaveLength(0);
  });
  it('持ち物 に 入らない 分 は すばこ に のこる', () => {
    const { s, c } = adultKid();
    (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList[0]!.egg = 5;
    let room = 3;
    (s.m as unknown as { d: { addItem: (i: ItemId) => boolean } }).d.addItem = () => room-- > 0;
    expect(s.m.collectCoop(c.id)).toEqual({ egg: 3, gold: 0 });
    expect(s.m.coops()[0]!.nest.egg).toBe(2);
  });
  it('animalEggChance 0 でも 8 回目 だけ（animalEggPity 7）', () => {
    const { s, id } = adultKid();
    s.settings.animalEggChance = 0;
    const counts: number[] = [];
    for (let n = 1; n <= 8; n++) {
      s.m.feed(id, 'mushi');
      s.step(s.settings.animalEggDelay + 3);
      counts.push(s.m.coops()[0]!.nest.egg);
      s.step(s.settings.animalFullTicks + 40);
    }
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });
  it('小屋の 子 の ひよこ は たまごを うまない', () => {
    const { s, c } = adultKid();
    const ch = s.m.spawn(51.5, 9, 51.5, { home: c.id, stage: 'chick' })!;
    s.m.feed(ch, 'mushi');
    s.step(200);
    expect(s.m.coops()[0]!.nest.egg).toBe(0);
  });
});

describe('AC16 金の たまご', () => {
  it('goldBaseWild 1・goldCap 1 → 金 の たまご（dropItem kin_tamago・egg 出来事 gold true）', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    s.settings.goldBaseWild = 1;
    s.settings.goldCap = 1;
    const id = s.m.spawn(21.5, 9, 20.5, { friend: true })!;
    s.m.feed(id, 'mushi');
    s.step(s.settings.animalEggDelay + 2);
    expect(s.dropped.map((d) => d.item)).toEqual(['kin_tamago']);
    expect(s.eggs).toHaveLength(0);
    const ev = s.ev('egg');
    expect(ev[0]).toMatchObject({ gold: true });
    expect(ev[0]!.coop).toBeUndefined();
    expect(s.one(id).goldMiss).toBe(0);
  });
  it('金 に ならない と goldMiss が ふえる。30 で かならず 金', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    s.settings.goldBaseWild = 0;
    s.settings.goldPerBug = 0;
    const id = s.m.spawn(21.5, 9, 20.5, { friend: true, goldMiss: 30 })!;
    s.m.feed(id, 'mushi');
    s.step(s.settings.animalEggDelay + 2);
    expect(s.dropped.map((d) => d.item)).toEqual(['kin_tamago']);
    expect(s.one(id).goldMiss).toBe(0);
    const t = setup();
    t.settings.animalEggChance = 1;
    t.settings.goldBaseWild = 0;
    t.settings.goldPerBug = 0;
    const b = t.m.spawn(21.5, 9, 20.5, { friend: true, goldMiss: 3 })!;
    t.m.feed(b, 'mushi');
    t.step(t.settings.animalEggDelay + 2);
    expect(t.eggs).toHaveLength(1);
    expect(t.one(b).goldMiss).toBe(4);
  });
  it('小屋 の 金 の たまご は nest.gold に 入る（金 も 1 こ と 数える）・collect で kin_tamago', () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    s.settings.animalEggChance = 1;
    s.settings.goldBaseWild = 1;
    s.settings.goldCap = 1;
    const c = place(s);
    const id = s.m.spawn(50.5, 9, 50.5, { home: c.id })!;
    s.m.feed(id, 'mushi');
    s.step(s.settings.animalEggDelay + 2);
    expect(s.m.coops()[0]!.nest).toEqual({ egg: 0, gold: 1 });
    expect(s.m.collectCoop(c.id)).toEqual({ egg: 0, gold: 1 });
    expect(s.bag).toEqual(['kin_tamago']);
  });
  it('dropItem が 無い とき は 金 でも dropEgg に する（たまご を なくさない）', () => {
    const s = setup();
    delete (s.m as unknown as { d: { dropItem?: unknown } }).d.dropItem;
    s.settings.animalEggChance = 1;
    s.settings.goldBaseWild = 1;
    s.settings.goldCap = 1;
    const id = s.m.spawn(21.5, 9, 20.5, { friend: true })!;
    s.m.feed(id, 'mushi');
    s.step(s.settings.animalEggDelay + 2);
    expect(s.eggs).toHaveLength(1);
  });
});

describe('AC13 ねる', () => {
  it('night で 小屋の 子は sleep・外の なかまは ねない・むし は たべない（sleepHint）・dawn で おきる', () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    const c = place(s);
    const a = s.m.spawn(49.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    const b = s.m.spawn(51.5, 9, 50.5, { home: c.id, stage: 'chick' })!;
    const f = s.m.spawn(25.5, 9, 25.5, { friend: true })!;
    s.st.phase = 'night';
    s.step(120);
    expect(s.one(a).state).toBe('sleep');
    expect(s.one(b).state).toBe('sleep');
    expect(s.one(f).state).not.toBe('sleep');
    expect(s.m.feed(a, 'mushi')).toBe('sleep');
    expect(s.m.lastHint()).toBe('sleepHint');
    expect(s.one(a).fullLeft).toBe(0);
    expect(s.m.preview(a, { item: 'mushi', count: 1 } as ItemStack)).toBe('animalPet');
    s.st.phase = 'dawn';
    s.step(30);
    expect(s.one(a).state).not.toBe('sleep');
    expect(s.one(b).state).not.toBe('sleep');
    expect(s.m.feed(a, 'mushi')).toBe('ate');
  });
  it('ねている 子を なでる・だっこ できる（だっこ で おきる・おろすと また ねる）', () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    const c = place(s);
    const a = s.m.spawn(49.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    s.st.phase = 'night';
    s.step(100);
    expect(s.m.pet(a)).toBe('friend');
    s.step(40);
    expect(s.one(a).state).toBe('sleep');
    expect(s.m.carryHold(a, 40)).toBe('lifted');
    expect(s.one(a).state).toBe('carried');
    expect(s.m.putDown({ x: 50.5, y: 9, z: 50.5 })).toBe(true);
    s.step(60);
    expect(s.one(a).state).toBe('sleep');
  });
});

describe('AC14・AC29 小屋を こわす', () => {
  it('子 0 → breakCoop ok・removeCoop で ブロックが のこらない・coops 0・toriya と たまごが おちる', () => {
    const s = setup();
    const c = place(s);
    (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList[0]!.egg = 2;
    (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList[0]!.gold = 1;
    expect(s.m.breakCoop(c.id, true)).toBe('ok');
    expect(s.m.removeCoop(c.id)).toBe(true);
    let left = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) if (String(s.world.getBlock(50 + dx, 9 + dy, 50 + dz)).startsWith('toriya_')) left++;
    expect(left).toBe(0);
    expect(s.m.coops()).toHaveLength(0);
    expect(s.dropped.map((d) => d.item).sort()).toEqual(['egg', 'egg', 'kin_tamago']);
    expect(s.m.removeCoop(c.id)).toBe(false);
  });
  it('子が いる → locked。押した ステップ だけ coopNotEmpty と coopLocked（くり返しは 出来事 なし）', () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    const c = place(s);
    const kid = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'chick' })!;
    s.m.events();
    expect(s.m.breakCoop(c.id, true)).toBe('locked');
    expect(s.m.lastHint()).toBe('coopNotEmpty');
    expect(s.ev('coopLocked')).toEqual([{ type: 'coopLocked', coop: c.id }]);
    expect(s.m.breakCoop(c.id, false)).toBe('locked');
    expect(s.ev('coopLocked')).toHaveLength(0);
    expect(s.m.removeCoop(c.id)).toBe(false);
    expect(s.m.coops()).toHaveLength(1);
    // だっこ 中 の 子 も 数える
    s.player.position.x = 49.5;
    s.player.position.z = 50.5;
    expect(s.m.carryHold(kid, 40)).toBe('lifted');
    expect(s.m.breakCoop(c.id, true)).toBe('locked');
    // 外 に おろすと こわせる
    s.player.position.x = 50.5;
    s.player.position.z = 40.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 40.5 })).toBe(true);
    expect(s.m.breakCoop(c.id, true)).toBe('ok');
    expect(s.m.removeCoop(c.id)).toBe(true);
  });
  it('ほかの しかた で ブロックが きえた 小屋は きろくを すてる。子は なかまに もどる', () => {
    const s = setup({ px: 48.5, pz: 50.5 });
    const c = place(s);
    const kid = s.m.spawn(50.5, 9, 50.5, { home: c.id })!;
    for (const b of coopBlocks(c.x, c.y, c.z, c.dir)) s.world.setBlock(b.x, b.y, b.z, 'air');
    s.step(40);
    expect(s.m.coops()).toHaveLength(0);
    expect(s.one(kid)).toMatchObject({ home: null, friend: true, follow: 0 });
  });
});

describe('AC21・AC22 保存 v 3 と つなぎ目', () => {
  const build = () => {
    const s = setup({ px: 44.5, pz: 50.5 });
    const c1 = place(s, 50, 50, 0);
    const c2 = place(s, 75, 50, 1);
    s.m.spawn(50.5, 9, 50.5, { home: c1.id, stage: 'chick', grow: 1, bugs: 5 });
    s.m.spawn(51.0, 9, 50.5, { home: c1.id, stage: 'adult', breed: 'macho', raised: true });
    s.m.spawn(49.5, 9, 50.5, { home: c1.id, stage: 'adult', raised: true, bugs: 40, goldMiss: 12 });
    s.m.spawn(24.5, 9, 30.5, { friend: true, stage: 'chick', follow: 500 });
    s.m.spawn(26.5, 9, 30.5, { friend: true, stage: 'adult', breed: 'macho' });
    s.settings.kitHatchTicks = 4000;
    const a = s.kit(8, 40);
    const b = s.kit(8, 44);
    s.kit(8, 48);
    s.m.useKit(a.x, a.y, a.z, 'egg');
    s.m.useKit(b.x, b.y, b.z, 'kin_tamago');
    s.m.machoMiss(7);
    s.step(1000);
    return { s, c1, c2 };
  };
  it('保存 → 読み直し で ぜんぶ 同じ（位置 0.01 以内・kits は 2 行・machoMiss・小屋 の すばこ）', () => {
    const { s } = build();
    (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList[0]!.egg = 4;
    (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList[0]!.gold = 1;
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(data.v).toBe(4); // LIVE-2.1: 保存 v 4
    expect(data.kits).toHaveLength(2);
    const t = setup({ px: 44.5, pz: 50.5 });
    // 世界 も おなじ に（本番では 世界 の 保存 が もどす）
    for (const c of s.m.coops()) for (const bl of coopBlocks(c.x, c.y, c.z, c.dir)) t.world.setBlock(bl.x, bl.y, bl.z, bl.block);
    for (const k of s.m.kits()) t.world.setBlock(k.x, k.y, k.z, 'nukunuku');
    t.m.deserialize(data);
    const before = s.m.list();
    const after = t.m.list();
    expect(after).toHaveLength(before.length);
    for (const b of before) {
      const m = after.reduce((best, a) => (Math.hypot(a.x - b.x, a.z - b.z) < Math.hypot(best.x - b.x, best.z - b.z) ? a : best));
      expect(Math.abs(m.x - b.x)).toBeLessThan(0.01);
      expect(Math.abs(m.z - b.z)).toBeLessThan(0.01);
      expect({ stage: m.stage, breed: m.breed, raised: m.raised, bugs: m.bugs, goldMiss: m.goldMiss, grow: m.grow, homed: m.home !== null, follow: m.follow }).toEqual({
        stage: b.stage,
        breed: b.breed,
        raised: b.raised,
        bugs: b.bugs,
        goldMiss: b.goldMiss,
        grow: b.grow,
        homed: b.home !== null,
        follow: b.follow,
      });
    }
    expect(t.m.kits().map((k) => [k.x, k.y, k.z, k.egg, k.left])).toEqual(s.m.kits().map((k) => [k.x, k.y, k.z, k.egg, k.left]));
    expect(t.m.coops().map((c) => [c.id, c.x, c.z, c.dir, c.kids.length, c.nest])).toEqual(s.m.coops().map((c) => [c.id, c.x, c.z, c.dir, c.kids.length, c.nest]));
    expect(t.m.machoMiss()).toBe(7);
    // 読み直した こたつ は また 動く。小屋 の id は つづき から
    t.step(10);
    expect(t.m.kits()[0]!.left).toBe(s.m.kits()[0]!.left - 10);
    t.world.setBlock(80, 8, 80, 'grass');
    const n = t.m.placeCoop(30, 9, 80, 0);
    expect(n).toBe(3);
  });
  it('v 2 → adult・normal・raised false・小屋 こたつ 空。v 1（eggDay つき）→ follow まんたん', () => {
    const s = setup();
    s.m.deserialize({ v: 2, friends: [{ x: 24.5, y: 9, z: 30.5, yaw: 0, follow: 500 }] });
    expect(s.m.list().map((a) => ({ stage: a.stage, breed: a.breed, raised: a.raised, bugs: a.bugs, goldMiss: a.goldMiss, grow: a.grow, follow: a.follow, home: a.home }))).toEqual([
      { stage: 'adult', breed: 'normal', raised: false, bugs: 0, goldMiss: 0, grow: 0, follow: 500, home: null },
    ]);
    expect(s.m.coops()).toHaveLength(0);
    expect(s.m.kits()).toHaveLength(0);
    expect(s.m.machoMiss()).toBe(0);
    s.m.deserialize({ v: 1, friends: [{ x: 24.5, y: 9, z: 30.5, yaw: 0, eggDay: 3 }], wild: [] });
    expect(s.m.list()[0]).toMatchObject({ follow: s.full, stage: 'adult', breed: 'normal', raised: false });
  });
  it("breed 'gold' → normal・stage 知らない値 → adult・数でない行は とばす", () => {
    const s = setup();
    s.m.deserialize({
      v: 3,
      friends: [
        { x: 24.5, y: 9, z: 30.5, yaw: 0, follow: 5, stage: 'adult', breed: 'gold', raised: false, bugs: 0, goldMiss: 0, grow: 0 },
        { x: 'x' },
        { x: 26.5, y: 9, z: 30.5, yaw: 0, follow: 5, stage: 'zzz', breed: 'macho', raised: 'yes', bugs: -3, goldMiss: 'q', grow: 1.6 },
      ],
      coops: [],
      kits: [],
      machoMiss: 'x',
    });
    expect(s.m.list().map((a) => [a.breed, a.stage, a.raised, a.bugs, a.goldMiss, a.grow])).toEqual([
      ['normal', 'adult', false, 0, 0, 0],
      ['macho', 'adult', false, 0, 0, 2],
    ]);
    expect(s.m.machoMiss()).toBe(0);
  });
  it('小屋 4 つ → 3 つ。小屋 の 子 7 → 6。kits 7 行 → 6 行。ブロックが 無い 位置 の 行は すてる', () => {
    const s = setup();
    const row = (i: number) => ({ id: i + 1, x: 10 + i * 10, y: 9, z: 10, dir: 0, kids: [] as unknown[], nest: { egg: 0, gold: 0 } });
    const bird = (i: number) => ({ x: 50.5 + (i % 3) - 1, y: 9, z: 50.5, yaw: 0, follow: 0, stage: 'adult', breed: 'normal', raised: true, bugs: 0, goldMiss: 0, grow: 0 });
    const cs = [row(0), row(1), row(2), row(3)];
    cs[0]!.x = 50;
    cs[0]!.z = 50;
    cs[0]!.kids = Array.from({ length: 7 }, (_, i) => bird(i));
    const kits: unknown[] = [];
    for (let i = 0; i < 7; i++) {
      s.world.setBlock(2 + i, 9, 70, 'nukunuku');
      kits.push({ x: 2 + i, y: 9, z: 70, egg: 'egg', left: 1000 });
    }
    s.m.deserialize({ v: 3, friends: [], coops: cs, kits, machoMiss: 0 });
    expect(s.m.coops()).toHaveLength(3);
    expect(s.m.coops()[0]!.kids).toHaveLength(6);
    expect(s.m.kits()).toHaveLength(6);
    s.m.deserialize({ v: 3, friends: [], coops: [], kits: [{ x: 90, y: 9, z: 90, egg: 'egg', left: 1000 }], machoMiss: 0 });
    expect(s.m.kits()).toHaveLength(0);
  });
  it('小屋の 外 に あった 子 は 中 の まん中 へ', () => {
    const s = setup();
    s.m.deserialize({
      v: 3,
      friends: [],
      coops: [{ id: 1, x: 50, y: 9, z: 50, dir: 0, kids: [{ x: 10, y: 9, z: 10, yaw: 0, follow: 0, stage: 'adult', breed: 'normal', raised: true, bugs: 0, goldMiss: 0, grow: 0 }], nest: { egg: 0, gold: 0 } }],
      kits: [],
      machoMiss: 0,
    });
    const k = s.m.list()[0]!;
    expect(k.home).toBe(1);
    expect(inInterior({ x: 50, z: 50 }, k.x, k.z)).toBe(true);
  });
  it('かえる 動き 中 に 保存 → こたつ に もどる（ひよこ は 二重 に ならない）', () => {
    const s = setup({ px: 25.5, pz: 30.5 });
    s.settings.kitHatchTicks = 5;
    const k = s.kit(30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(20);
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(data.friends).toHaveLength(0);
    expect(data.kits).toEqual([{ x: 30, y: 9, z: 30, eggs: [{ egg: 'egg', left: 0 }] }]);
  });
  it('いちばん 多い とき（なかま 8・小屋 3×6・あたため中 6）で 4,000 文字 以下', () => {
    const s = setup({ px: 44.5, pz: 50.5 });
    s.settings.kitHatchTicks = 7200;
    for (const [x, z] of [[14, 14], [34, 14], [54, 14]] as const) {
      const c = place(s, x, z);
      for (let i = 0; i < 6; i++) s.m.spawn(x + 0.5 + ((i % 3) - 1), 9, z + 0.5 + (Math.floor(i / 3) - 1 || 1), { home: c.id, stage: 'adult', raised: true, bugs: 120, goldMiss: 29, breed: i % 2 ? 'macho' : 'normal' });
    }
    for (let i = 0; i < 8; i++) s.m.spawn(5.5 + i * 1.5, 9, 40.5, { friend: true, stage: 'adult', bugs: 120, goldMiss: 29 });
    for (let i = 0; i < 6; i++) {
      const k = s.kit(4 + i * 3, 56);
      s.m.useKit(k.x, k.y, k.z, 'egg');
    }
    s.step(100);
    const len = JSON.stringify(s.m.serialize()).length;
    expect(s.m.list().filter((a) => a.home !== null)).toHaveLength(18);
    expect(len).toBeLessThanOrEqual(4000);
  });
  it('読みこみ の 前 の 状態 は すべて 消える（小屋・こたつ・machoMiss）', () => {
    const { s } = build();
    s.m.deserialize(null);
    expect(s.m.coops()).toHaveLength(0);
    expect(s.m.kits()).toHaveLength(0);
    expect(s.m.machoMiss()).toBe(0);
    expect(s.m.list()).toHaveLength(0);
  });
});

describe('AC22 つなぎ目', () => {
  it('list() に stage・breed・home・raised、coops() に kids（id）。えらべる子は (a) だけ', async () => {
    const { meatEligible } = await import('./meat');
    const s = setup({ px: 44.5, pz: 50.5 });
    const c = place(s);
    const a = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult', raised: true, breed: 'macho' })!;
    const b = s.m.spawn(51.5, 9, 50.5, { home: c.id, stage: 'adult', raised: false })!;
    const ch = s.m.spawn(49.5, 9, 50.5, { home: c.id, stage: 'chick' })!;
    const f = s.m.spawn(25.5, 9, 30.5, { friend: true, stage: 'chick' })!;
    expect(s.one(a)).toMatchObject({ stage: 'adult', breed: 'macho', home: c.id, raised: true });
    expect(s.one(f)).toMatchObject({ stage: 'chick', breed: 'normal', home: null, raised: false });
    expect(s.m.coops()[0]!.kids).toEqual([a, b, ch]);
    const ok = (id: number) => meatEligible(s.one(id));
    expect([ok(a), ok(b), ok(ch)]).toEqual([true, false, false]);
    // (a) を 外に 出す
    s.player.position.x = 49.5;
    s.player.position.z = 50.5;
    s.m.carryHold(a, 40);
    s.player.position.z = 40.5;
    s.step(1);
    expect(s.m.putDown({ x: 50.5, y: 9, z: 40.5 })).toBe(true);
    expect(ok(a)).toBe(false);
  });
});

describe('AC26 乱数の ながれ', () => {
  it('マッチョ・金の くじは 妖怪や ほかの なかまの 動きの 乱数を かえない（同じ シードで 同じ 場所）', () => {
    const run = (gold: boolean) => {
      const s = setup({ seed: 11 });
      s.settings.animalEggChance = 1;
      s.settings.goldBaseWild = gold ? 1 : 0;
      s.settings.goldCap = gold ? 1 : 0;
      s.settings.goldPerBug = 0;
      const id = s.m.spawn(21.5, 9, 20.5, { friend: true })!;
      s.m.feed(id, 'mushi');
      s.step(400);
      return s.m.list().map((a) => [a.x, a.z]);
    };
    // 金 の くじ は 別の 流れ: 金 かどうか で なかま の 動き が かわらない
    expect(run(true)).toEqual(run(false));
  });
});

describe('AC27 計算（クラウド・目安）', () => {
  it('29 わ（小屋 18・なかま 8・やせい 3）＋ あたため中 6 で 1 ステップ 0.4 ミリ秒 以下（中央値）', () => {
    const s = setup({ px: 20.5, pz: 30.5 });
    s.settings.kitHatchTicks = 7200;
    for (const [x, z] of [[40, 18], [40, 30], [40, 42]] as const) {
      const c = place(s, x, z);
      for (let i = 0; i < 6; i++) s.m.spawn(x + 0.5 + ((i % 3) - 1), 9, z + 0.5 + (Math.floor(i / 3) - 1 || 1), { home: c.id, stage: i < 3 ? 'adult' : 'chick', breed: i === 0 ? 'macho' : 'normal', raised: true });
    }
    for (let i = 0; i < 8; i++) s.m.spawn(5 + (i % 4) * 1.5, 9, 26.5 + Math.floor(i / 4) * 2, { friend: true, stage: i < 4 ? 'adult' : 'chick' });
    for (let i = 0; i < 3; i++) s.m.spawn(5 + i * 1.5, 9, 36.5, { hearts: 2 });
    for (let i = 0; i < 6; i++) {
      const k = s.kit(60, 14 + i * 4);
      s.m.useKit(k.x, k.y, k.z, 'egg');
    }
    expect(s.m.count()).toBe(29);
    s.step(60);
    const ms: number[] = [];
    for (let n = 0; n < 9; n++) {
      const t0 = performance.now();
      s.step(40);
      ms.push((performance.now() - t0) / 40);
    }
    ms.sort((a, b) => a - b);
    expect(ms[4]!).toBeLessThanOrEqual(0.4);
  });
});
