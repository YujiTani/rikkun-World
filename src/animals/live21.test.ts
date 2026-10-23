import { describe, expect, it } from 'vitest';
import type { AnimalEvent, BlockId, DayPhase, ItemId, ThrowAim, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks, inInterior } from './coop';

/**
 * LIVE-2.1 B・C: なげる・小屋 の 子・こたつ 3 こ・保存 v 4（docs/design/LIVE-2.1.md §2.2〜§2.4・§4.3）。
 * 世界は ArrayVoxelWorld（床 y=8、立つ 高さ y=9）。
 */
const SIZE = 100;

function setup(opts: { phase?: DayPhase; px?: number; pz?: number; seed?: number } = {}) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const st = { day: 0, phase: (opts.phase ?? 'day') as DayPhase };
  const player = { position: { x: opts.px ?? 20.5, y: 9, z: opts.pz ?? 20.5 } as Vec3 };
  const eggs: Vec3[] = [];
  const dropped: { at: Vec3; item: ItemId }[] = [];
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: opts.seed ?? 7,
      settings,
      dropEgg: (at) => eggs.push({ ...at }),
      addItem: () => true,
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
  const full = settings.animalFollowTicks;
  return { world, st, player, eggs, dropped, settings, m, step, ev, one, full };
}
type S = ReturnType<typeof setup>;

const place = (s: S, x = 50, z = 50, dir: 0 | 1 | 2 | 3 = 0) => {
  const r = s.m.placeCoop(x, 9, z, dir);
  if (typeof r !== 'number') throw new Error('置けない: ' + r);
  return s.m.coops().find((c) => c.id === r)!;
};
/** (px, pz) に 立って ひよこ（stage）を だっこ する。向きは 東（+x） */
function carry(s: S, px: number, pz: number, stage: 'chick' | 'adult' = 'chick') {
  s.player.position.x = px;
  s.player.position.z = pz;
  const id = s.m.spawn(px - 1, 9, pz, { friend: true, follow: s.full, stage })!;
  s.step(2);
  if (s.m.carryHold(id, 40) !== 'lifted') throw new Error('だっこ できない');
  return id;
}
const aimEast = (s: S, place: Vec3 | null): ThrowAim => ({ place, eye: { x: s.player.position.x, y: s.player.position.y + 1.6, z: s.player.position.z }, dirX: 1, dirZ: 0 });

describe('なげる 着地点（throwSpot）', () => {
  it('だっこ して いない とき は null', () => {
    const s = setup();
    expect(s.m.throwSpot(aimEast(s, { x: 24, y: 9, z: 20 }))).toBeNull();
  });
  it('ねらった マス が 4 以内 → その マス の まん中・toss true', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    expect(s.m.throwSpot(aimEast(s, { x: 23, y: 9, z: 20 }))).toMatchObject({ x: 23.5, y: 9, z: 20.5, ok: true, home: null, toss: true });
  });
  it('4 より 遠い → 向き そのまま で 水平 4 の 列（同じ 高さ ±1 で 立てる マス）', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    expect(s.m.throwSpot(aimEast(s, { x: 26, y: 9, z: 20 }))).toMatchObject({ x: 24.5, y: 9, z: 20.5, ok: true });
    // 1 段 高い 台 の 上 → ±1 で 立てる
    s.world.setBlock(24, 9, 20, 'stone');
    expect(s.m.throwSpot(aimEast(s, { x: 26, y: 9, z: 20 }))).toMatchObject({ x: 24.5, y: 10, z: 20.5, ok: true });
    // 2 段 高い かべ → 立てる マス が 無い
    s.world.setBlock(24, 10, 20, 'stone');
    s.world.setBlock(24, 11, 20, 'stone');
    expect(s.m.throwSpot(aimEast(s, { x: 26, y: 9, z: 20 }))).toMatchObject({ ok: false, why: 'cantPutHere' });
  });
  it('d＜1 → toss false（そっと おろす）', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    expect(s.m.throwSpot(aimEast(s, { x: 20, y: 9, z: 20 }))).toMatchObject({ ok: true, toss: false });
  });
  it('何も ねらわない → 前 3 マス の 地面。8 マス 下 まで 無ければ 空中', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    const sp = s.m.throwSpot(aimEast(s, null))!;
    expect(sp).toMatchObject({ x: 23.5, y: 9, z: 20.5, ok: true, toss: true });
    // 前 3 マス の 列 だけ 深い あな
    for (let y = 0; y <= 8; y++) s.world.setBlock(23, y, 20, 'air');
    const air = s.m.throwSpot(aimEast(s, null))!;
    expect(air.ok).toBe(true);
    expect(air.y).toBeCloseTo(9 + 1.6 - 8, 1); // 目 の 高さ 10.6 − 8
    expect(air.y).toBeGreaterThan(2);
  });
  it('着地点 が 固い マス → ok false・cantPutHere', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    s.world.setBlock(23, 10, 20, 'stone');
    expect(s.m.throwSpot(aimEast(s, null))).toMatchObject({ ok: false, why: 'cantPutHere' });
  });
  it('とりごや の 中 → home が 小屋 id。6 わ → ok false・coopFull。小屋 の 子 を 外 へ（8 わ）→ friendFull', () => {
    const s = setup({ px: 46.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    carry(s, 47.5, 50.5);
    expect(s.m.throwSpot(aimEast(s, { x: 50, y: 9, z: 50 }))).toMatchObject({ ok: true, home: c.id });
    for (let i = 0; i < 6; i++) s.m.spawn(49.5 + (i % 3), 9, 49.5 + Math.floor(i / 3), { home: c.id });
    expect(s.m.throwSpot(aimEast(s, { x: 50, y: 9, z: 50 }))).toMatchObject({ ok: false, why: 'coopFull', home: c.id });
  });
  it('ちかくに 立っている とき の 小屋 の 子 を 外 へ なげる とき なかま 8 わ なら friendFull', () => {
    const s = setup({ px: 50.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    const kid = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    s.step(2);
    for (let i = 0; i < 8; i++) s.m.spawn(30.5 + i, 9, 30.5, { friend: true, follow: s.full });
    expect(s.m.carryHold(kid, 40)).toBe('lifted');
    expect(s.m.throwSpot(aimEast(s, { x: 53, y: 9, z: 50 }))).toMatchObject({ ok: false, why: 'friendFull' });
  });
});

describe('なげる（通し）', () => {
  it('10 ステップ目に toss・carried false・carrying null。20＋5d ステップ で P・そのあと パタパタ で 着地・putDown', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    s.m.events();
    expect(s.m.startThrow(aimEast(s, { x: 23, y: 9, z: 20 }))).toBe(true);
    let tossAt = -1;
    let landAt = -1;
    let arcEnd = -1;
    let minY = 99;
    const rows: { x: number; y: number; state: string; fl: boolean; vy: number }[] = [];
    for (let i = 1; i <= 300 && landAt < 0; i++) {
      s.step(1);
      const r = s.one(id);
      rows.push({ x: r.x, y: r.y, state: r.state, fl: r.fluttering, vy: r.vy });
      for (const e of s.m.events()) {
        if (e.type === 'toss') {
          tossAt = i;
          expect(e.to).toEqual({ x: 23.5, y: 9, z: 20.5 });
        }
        if (e.type === 'putDown') landAt = i;
      }
      if (tossAt >= 0 && arcEnd < 0 && r.fluttering) arcEnd = i;
      if (tossAt >= 0 && !r.fluttering && r.state === 'thrown') minY = Math.min(minY, r.y);
    }
    expect(tossAt).toBe(10);
    expect(s.m.carrying()).toBeNull();
    expect(s.one(id).carried).toBe(false);
    expect(rows[tossAt - 1]!.state).toBe('thrown');
    // d = 3 → 35 ステップ（P に 着いた 次 の ステップ から パタパタ）
    expect(arcEnd - tossAt).toBeGreaterThanOrEqual(35);
    expect(arcEnd - tossAt).toBeLessThanOrEqual(37);
    expect(minY).toBeGreaterThanOrEqual(9 + 2.0 - 1e-6);
    // パタパタ は ひよこ 2.5 以下
    for (const r of rows) if (r.fl) expect(r.vy).toBeGreaterThanOrEqual(-2.5 - 0.05);
    expect(landAt).toBeGreaterThan(arcEnd);
    const end = s.one(id);
    expect(end.y).toBeCloseTo(9, 2);
    expect(Math.abs(end.x - 23.5)).toBeLessThan(0.05);
  });
  it('さく の 外 1 マス から 中 3×3 へ → 着地 で home（小屋 id）・出来事 home・homePop 1', () => {
    const s = setup({ px: 46.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    const id = carry(s, 47.5, 50.5, 'adult');
    s.m.events();
    expect(s.m.startThrow(aimEast(s, { x: 50, y: 9, z: 50 }))).toBe(true);
    let fenceMin = 99;
    let home = false;
    for (let i = 0; i < 200 && !home; i++) {
      s.step(1);
      const r = s.one(id);
      if (r.x >= 47.9 && r.x < 49.3 && r.state === 'thrown') fenceMin = Math.min(fenceMin, r.y);
      for (const e of s.m.events()) if (e.type === 'home') home = true;
    }
    expect(home).toBe(true);
    expect(fenceMin).toBeGreaterThanOrEqual(9 + 2.0 - 1e-6);
    const r = s.one(id);
    expect(r.home).toBe(c.id);
    expect(inInterior(c, r.x, r.z, 0)).toBe(true);
    expect(s.m.homePop()).toBeGreaterThan(0.9);
    s.step(41);
    expect(s.m.homePop()).toBe(0);
  });
  it('とりごや の 子 を 外 へ なげて 外 に 着く → なかま（home null）', () => {
    const s = setup({ px: 50.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    const kid = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    s.step(2);
    expect(s.m.carryHold(kid, 40)).toBe('lifted');
    // 小屋 の 外（南 の さく ごし に 5 マス）
    s.player.position.z = 48.6; // 北 の ねぐら は 避け、東 の さく の 外へ
    s.player.position.x = 50.5;
    s.player.position.z = 50.5;
    expect(s.m.startThrow(aimEast(s, { x: 54, y: 9, z: 50 }))).toBe(true);
    s.step(120);
    const r = s.one(kid);
    expect(r.home).toBeNull();
    expect(inInterior(c, r.x, r.z, 0)).toBe(false);
    expect(r.carried).toBe(false);
  });
  it('d＜1 → なげず に 20 ステップ で そっと おろす（toss なし・putDown は 20 ステップ後）', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    s.m.events();
    expect(s.m.startThrow(aimEast(s, { x: 20, y: 9, z: 20 }))).toBe(true);
    let putAt = -1;
    let toss = 0;
    for (let i = 1; i <= 40; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'putDown') putAt = i;
        if (e.type === 'toss') toss++;
      }
    }
    expect(toss).toBe(0);
    expect(putAt).toBeGreaterThanOrEqual(19);
    expect(putAt).toBeLessThanOrEqual(21);
    expect(s.one(id).carried).toBe(false);
    expect(s.m.carrying()).toBeNull();
  });
  it('なげられない 所 → startThrow false・cantPutHere・だっこ の まま', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    s.world.setBlock(23, 10, 20, 'stone');
    s.m.events();
    expect(s.m.startThrow(aimEast(s, null))).toBe(false);
    expect(s.m.lastHint()).toBe('cantPutHere');
    expect(s.m.carrying()).toBe(id);
    s.step(30);
    expect(s.ev('toss')).toHaveLength(0);
  });
  it('もちあげ 中 に もう 1 回 押しても 何も おきない', () => {
    const s = setup();
    carry(s, 20.5, 20.5);
    expect(s.m.startThrow(aimEast(s, { x: 23, y: 9, z: 20 }))).toBe(true);
    s.step(3);
    expect(s.m.startThrow(aimEast(s, { x: 23, y: 9, z: 20 }))).toBe(false);
    s.step(10);
    expect(s.ev('toss')).toHaveLength(1);
  });
});

describe('なげる 当たる（bonk）', () => {
  it('高さ 4 の かべ の 手前 で bonk・かべ に めりこまず 手前 に 着地', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    for (let y = 9; y <= 12; y++) for (let z = 14; z <= 26; z++) s.world.setBlock(22, y, z, 'stone');
    expect(s.m.throwTo(24.5, 9, 20.5)).toBe(true);
    let bonkAt = -1;
    let tossAt = -1;
    let landed = false;
    for (let i = 1; i <= 200 && !landed; i++) {
      s.step(1);
      const r = s.one(id);
      expect(r.x).toBeLessThan(22 - 0.3 + 1e-6);
      for (const e of s.m.events()) {
        if (e.type === 'toss') tossAt = i;
        if (e.type === 'bonk') bonkAt = i;
        if (e.type === 'putDown') landed = true;
      }
    }
    expect(bonkAt).toBeGreaterThan(tossAt);
    expect(landed).toBe(true);
    expect(s.one(id).x).toBeLessThan(22);
    expect(s.one(id).y).toBeCloseTo(9, 2);
  });
  it('高さ 2 の トンネル → 手 から はなれる 所 で bonk・プレイヤー から 1.5 以内 に 着地', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    for (let x = 10; x <= 30; x++) for (let z = 10; z <= 30; z++) s.world.setBlock(x, 11, z, 'stone');
    expect(s.m.throwTo(24.5, 9, 20.5)).toBe(true);
    s.step(80);
    const r = s.one(id);
    expect(Math.hypot(r.x - 20.5, r.z - 20.5)).toBeLessThanOrEqual(1.5);
    expect(r.y).toBeLessThan(11);
    expect(r.carried).toBe(false);
  });
});

describe('さく の 上 に 着く', () => {
  it('さく の 上 の 点 へ → 中 3×3 の いちばん 近い あき マス へ よせて 小屋 の 子', () => {
    const s = setup({ px: 46.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    const id = carry(s, 47.5, 50.5);
    // さく(x=48) の 上
    expect(s.m.throwTo(48.5, 11, 50.5)).toBe(true);
    s.step(200);
    const r = s.one(id);
    expect(r.home).toBe(c.id);
    expect(inInterior(c, r.x, r.z, 0)).toBe(true);
    expect(Math.hypot(r.x - 49.5, r.z - 50.5)).toBeLessThanOrEqual(1.2);
  });
  it('6 わ の 小屋 → よせる 先 は 外（プレイヤー がわ）・なかま', () => {
    const s = setup({ px: 46.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    for (let i = 0; i < 6; i++) s.m.spawn(49.5 + (i % 3), 9, 49.5 + Math.floor(i / 3), { home: c.id });
    const id = carry(s, 47.5, 50.5);
    // 6 わ の 小屋 は ふつう なげない ので throwTo の 判定 を さける ため さく の 上 に（home 判定 は 中 3×3 だけ）
    expect(s.m.throwTo(48.5, 11, 50.5)).toBe(true);
    s.step(250);
    const r = s.one(id);
    expect(r.home).toBeNull();
    expect(inInterior(c, r.x, r.z, 0)).toBe(false);
  });
});

describe('保存（なげて いる とちゅう）', () => {
  it('とんで いる とちゅう で 保存 → 着地点 に いる もの と して 書く（小屋 の 中 なら 小屋 の 子）', () => {
    const s = setup({ px: 46.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    carry(s, 47.5, 50.5, 'adult');
    s.m.startThrow(aimEast(s, { x: 50, y: 9, z: 50 }));
    s.step(20);
    const data = s.m.serialize();
    expect(data.v).toBe(4);
    const save = data as unknown as { friends: unknown[]; coops: { id: number; kids: { x: number; z: number }[] }[] };
    expect(save.friends).toHaveLength(0);
    expect(save.coops.find((k) => k.id === c.id)!.kids).toHaveLength(1);
    expect(save.coops[0]!.kids[0]!.x).toBeCloseTo(50.5, 1);
  });
});

describe('なげて いる とちゅう で 着地する 列 が 読まれなく なる', () => {
  it('その場 で とまって まつ（落ち続けて ワープ しない）。読まれたら つづき で 着地', () => {
    const s = setup();
    const id = carry(s, 20.5, 20.5);
    s.m.startThrow(aimEast(s, { x: 23, y: 9, z: 20 }));
    s.step(10 + 36); // もちあげ 10 ＋ 弧 T（d=3 で 35）をこえて 落ちる ところ
    expect(s.one(id).state).toBe('thrown');
    const real = s.world.isLoaded.bind(s.world);
    let off = true;
    s.world.isLoaded = (x: number, z: number) => (off ? false : real(x, z));
    s.step(400);
    expect(s.one(id).state).toBe('thrown');
    expect(s.one(id).y).toBeGreaterThan(-1);
    off = false;
    s.step(120);
    expect(s.one(id).state).not.toBe('thrown');
    expect(s.ev('putDown')).toHaveLength(1);
  });
});

describe('すぐ 小屋 の 子（coopEnterTicks 0）・小屋 の 子 は ワープ しない', () => {
  it('coopEnterTicks の 初期値 は 0。ついてくる なかま が 中 3×3 に 入った ステップ に home・出来事 home', () => {
    const s = setup({ px: 50.5, pz: 44.5 });
    expect(s.settings.coopEnterTicks).toBe(0);
    const c = place(s, 50, 50, 0);
    const id = s.m.spawn(50.5, 9, 43.0, { friend: true, follow: s.full })!;
    s.step(10);
    s.m.events();
    let inAt = -1;
    let homeAt = -1;
    for (let i = 1; i <= 300 && inAt < 0; i++) {
      s.player.position.z = Math.min(51.7, s.player.position.z + 0.07);
      s.step(1);
      const r = s.one(id);
      if (inInterior(c, r.x, r.z, 0)) inAt = i;
      if (s.m.events().some((e) => e.type === 'home')) homeAt = i;
    }
    expect(inAt).toBeGreaterThan(0);
    expect(s.one(id).home).toBe(c.id);
    expect(homeAt).toBe(inAt);
    expect(s.m.homePop()).toBeGreaterThan(0.9);
  });
  it('6 わ の 小屋 に ついて 入って も 小屋 の 子 に ならない', () => {
    const s = setup({ px: 50.5, pz: 44.5 });
    const c = place(s, 50, 50, 0);
    for (let i = 0; i < 6; i++) s.m.spawn(49.5 + (i % 3), 9, 49.5 + Math.floor(i / 3), { home: c.id });
    const id = s.m.spawn(50.5, 9, 43.0, { friend: true, follow: s.full })!;
    s.step(10);
    for (let i = 0; i < 160; i++) {
      s.player.position.z = Math.min(51.7, s.player.position.z + 0.07);
      s.step(1);
    }
    expect(s.one(id).home).toBeNull();
    expect(s.one(id).follow).toBeGreaterThan(0);
  });
  it('小屋 の 子 は プレイヤー が 3,600 ステップ とおく でも ワープ しない・外 の なかま は ワープ する', () => {
    const s = setup({ px: 50.5, pz: 50.5 });
    const c = place(s, 50, 50, 0);
    const kid = s.m.spawn(50.5, 9, 50.5, { home: c.id, stage: 'adult' })!;
    const out = s.m.spawn(30.5, 9, 30.5, { friend: true, follow: s.full })!;
    s.step(5);
    s.m.events();
    s.player.position.x = 50.5 + 40;
    let warpKid = 0;
    let warpOut = 0;
    for (let i = 0; i < 3600; i++) {
      s.step(1);
      for (const e of s.m.events()) if (e.type === 'warp') (e.id === kid ? warpKid++ : e.id === out ? warpOut++ : 0);
    }
    expect(warpKid).toBe(0);
    expect(warpOut).toBeGreaterThanOrEqual(1);
    expect(inInterior(c, s.one(kid).x, s.one(kid).z, 0)).toBe(true);
    expect(s.one(kid).home).toBe(c.id);
  });
});

// ================================================================ C: こたつ に 3 こ

const kitAt = (s: S, x: number, z: number, y = 9) => {
  s.world.setBlock(x, y, z, 'nukunuku' as BlockId);
  return { x, y, z };
};

describe('こたつ に 3 こ（useKit）', () => {
  it('から → egg で 1 こ ずつ 3 こ まで。4 こ目 は full・kitFull。kits() の eggs は 入れた 順（left は へる）', () => {
    const s = setup();
    const k = kitAt(s, 30, 30);
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    s.step(60);
    expect(s.m.useKit(k.x, k.y, k.z, 'kin_tamago')).toBe('put');
    s.step(60);
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    const row = s.m.kits()[0]!;
    expect(row.eggs!.map((e) => e.egg)).toEqual(['egg', 'gold', 'egg']);
    expect(row.eggs!.map((e) => e.left)).toEqual([7200 - 120, 7200 - 60, 7200]);
    expect(row).toMatchObject({ x: 30, y: 9, z: 30, egg: 'egg', left: 7200 - 120, wobble: 0 });
    expect(s.m.kitAt(30, 9, 30)).not.toBeNull();
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('full');
    expect(s.m.lastHint()).toBe('kitFull');
    expect(s.m.kits()[0]!.eggs).toHaveLength(3);
  });
  it('1〜2 こ 入って いても egg は 入る。egg で ない もの は wait（kitWait）。から で egg じゃ ない → needEgg', () => {
    const s = setup();
    const k = kitAt(s, 30, 30);
    expect(s.m.useKit(k.x, k.y, k.z, null)).toBe('needEgg');
    expect(s.m.lastHint()).toBe('kitNeedEgg');
    s.m.useKit(k.x, k.y, k.z, 'egg');
    expect(s.m.useKit(k.x, k.y, k.z, 'tomato' as ItemId)).toBe('wait');
    expect(s.m.lastHint()).toBe('kitWait');
    expect(s.m.useKit(k.x, k.y, k.z, null)).toBe('wait');
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    expect(s.m.kits()[0]!.eggs).toHaveLength(2);
    expect(s.m.useKit(70, 9, 70, 'egg')).toBe('needEgg');
  });
  it('たまご 6 こ まで（世界 ぜんぶ）: 2 台 に 3 こ ずつ → 3 台目 は max・kitMax。2 台 でなくても 6 こ', () => {
    const s = setup();
    const a = kitAt(s, 30, 30);
    const b = kitAt(s, 40, 30);
    const c = kitAt(s, 50, 30);
    for (let i = 0; i < 3; i++) {
      expect(s.m.useKit(a.x, a.y, a.z, 'egg')).toBe('put');
      expect(s.m.useKit(b.x, b.y, b.z, 'egg')).toBe('put');
    }
    expect(s.m.useKit(c.x, c.y, c.z, 'egg')).toBe('max');
    expect(s.m.lastHint()).toBe('kitMax');
    expect(s.m.kits()).toHaveLength(2);
    // 3 台 に 2 こ ずつ → 6 こ で ちょうど
    const t = setup();
    const ks = [kitAt(t, 30, 30), kitAt(t, 40, 30), kitAt(t, 50, 30), kitAt(t, 60, 30)];
    for (const k of ks.slice(0, 3)) for (let i = 0; i < 2; i++) expect(t.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    expect(t.m.useKit(ks[3]!.x, ks[3]!.y, ks[3]!.z, 'egg')).toBe('max');
    expect(t.m.useKit(ks[0]!.x, ks[0]!.y, ks[0]!.z, 'egg')).toBe('max');
  });
  it('2×2 の どの マス でも 同じ 1 台', () => {
    const s = setup();
    const k = kitAt(s, 30, 30);
    s.world.setBlock(31, 9, 30, 'nukunuku_e' as BlockId);
    s.world.setBlock(30, 9, 31, 'nukunuku_s' as BlockId);
    s.world.setBlock(31, 9, 31, 'nukunuku_se' as BlockId);
    expect(s.m.useKit(k.x, k.y, k.z, 'egg')).toBe('put');
    expect(s.m.useKit(31, 9, 31, 'egg')).toBe('put');
    expect(s.m.kits()).toHaveLength(1);
    expect(s.m.kits()[0]).toMatchObject({ size: 2 });
    expect(s.m.kits()[0]!.eggs).toHaveLength(2);
  });
  it('ゆれ は たまご ごと（のこり 2/3 以上 0・1/3 以上 1・それ未満 2）。kits()[0].wobble は 先頭 の たまご', () => {
    const s = setup();
    s.settings.kitHatchTicks = 3000;
    s.player.position.x = 90.5;
    const k = kitAt(s, 30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(1098);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(1098);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(2);
    const row = s.m.kits()[0]!;
    expect(row.eggs!.map((e) => e.wobble)).toEqual([2, 1, 0]);
    expect(row.wobble).toBe(2);
  });
  it('こわす → 入って いた たまご が 種類 ごと に おちる（egg 2・kin_tamago 1）。kits() から 消える', () => {
    const s = setup();
    const k = kitAt(s, 30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.m.useKit(k.x, k.y, k.z, 'kin_tamago');
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.world.setBlock(30, 9, 30, 'air');
    s.step(1);
    expect(s.eggs).toHaveLength(2);
    expect(s.dropped.map((d) => d.item)).toEqual(['kin_tamago']);
    expect(s.m.kits()).toHaveLength(0);
  });
});

describe('こたつ で かえる（1 台 で 同時 に かえる の は 1 こ）', () => {
  it('3 こ を 30 ステップ ごと → 1 こ目 600 で hatchStart・60 後 hatch・次 の hatchStart は 20 後。3 わ で kits() が 空', () => {
    const s = setup();
    s.settings.kitHatchTicks = 600;
    s.settings.machoChance = 0;
    const k = kitAt(s, 30, 30);
    s.player.position.x = 25.5;
    s.player.position.z = 30.5;
    for (let n = 0; n < 3; n++) {
      s.m.useKit(k.x, k.y, k.z, 'egg');
      s.step(30);
    }
    s.m.events();
    const starts: number[] = [];
    const hatches: number[] = [];
    let open = 0;
    let overlap = false;
    let startedAt0 = -1;
    for (let i = 1; i <= 1200 && hatches.length < 3; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'hatchStart') {
          starts.push(i);
          if (++open > 1) overlap = true;
          if (startedAt0 < 0) startedAt0 = i;
        }
        if (e.type === 'hatch') {
          hatches.push(i);
          open--;
        }
      }
    }
    expect(overlap).toBe(false);
    expect(starts).toHaveLength(3);
    expect(hatches).toHaveLength(3);
    expect(starts[0]).toBe(600 - 90); // 1 こ目 は 入れて から 600 ステップ目（3 こ 入れる のに 90 ステップ）
    expect(hatches[0]! - starts[0]!).toBe(60);
    expect(starts[1]! - hatches[0]!).toBe(20);
    expect(starts[2]! - hatches[1]!).toBe(20);
    expect(s.m.kits()).toHaveLength(0);
    expect(s.world.getBlock(30, 9, 30)).toBe('nukunuku');
    expect(s.m.list()).toHaveLength(3);
  });
  it('ひよこ は プレイヤー に いちばん 近い 辺 の すぐ 外 に 出る', () => {
    const s = setup();
    s.settings.kitHatchTicks = 5;
    const k = kitAt(s, 30, 30);
    s.world.setBlock(31, 9, 30, 'nukunuku_e' as BlockId);
    s.world.setBlock(30, 9, 31, 'nukunuku_s' as BlockId);
    s.world.setBlock(31, 9, 31, 'nukunuku_se' as BlockId);
    s.player.position.x = 25.5;
    s.player.position.z = 31.0;
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(10);
    const c = s.m.list()[0]!;
    expect(c.x).toBeLessThan(30);
    expect(Math.hypot(c.x - 30, c.z - 31)).toBeLessThanOrEqual(1.6);
  });
  it('マッチョ は 80 ステップ。プレイヤー が とおい と かえらない', () => {
    const s = setup();
    s.settings.kitHatchTicks = 300;
    s.settings.machoChance = 1;
    const k = kitAt(s, 30, 30);
    s.player.position.x = 80.5;
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(400);
    expect(s.ev('hatchStart')).toHaveLength(0);
    s.player.position.x = 25.5;
    let t0 = -1;
    let t1 = -1;
    for (let i = 1; i <= 200 && t1 < 0; i++) {
      s.step(1);
      for (const e of s.m.events()) {
        if (e.type === 'hatchStart') t0 = i;
        if (e.type === 'hatch') t1 = i;
      }
    }
    expect(t1 - t0).toBe(80);
  });
});

describe('こたつ の 天板 の 3 わく（kitIcons）', () => {
  it('8 マス 以内 の こたつ だけ。slots は いつも 3・から の わく は egg null・fill は 0〜1', () => {
    const s = setup({ px: 30.5, pz: 24.5 });
    const k = kitAt(s, 30, 30);
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(120);
    s.m.useKit(k.x, k.y, k.z, 'kin_tamago');
    const icons = s.m.kitIcons(null, false);
    expect(icons).toHaveLength(1);
    expect(icons[0]).toMatchObject({ x: 30, y: 9, z: 30 });
    expect(icons[0]!.slots).toHaveLength(3);
    expect(icons[0]!.slots.map((q) => q.egg)).toEqual(['egg', 'gold', null]);
    expect(icons[0]!.slots[0]!.fill).toBeGreaterThan(icons[0]!.slots[1]!.fill);
    expect(icons[0]!.slots[2]!.fill).toBe(0);
    s.player.position.x = 60.5;
    expect(s.m.kitIcons(null, false)).toHaveLength(0);
  });
  it('たまご を 持って ねらった から の こたつ は 3 わく とも null で 出る（から で 持たない なら 出ない）', () => {
    const s = setup({ px: 80.5, pz: 80.5 });
    const k = kitAt(s, 30, 30);
    expect(s.m.kitIcons({ x: k.x, y: k.y, z: k.z }, false)).toHaveLength(0);
    const r = s.m.kitIcons({ x: k.x, y: k.y, z: k.z }, true);
    expect(r).toHaveLength(1);
    expect(r[0]!.slots.map((q) => q.egg)).toEqual([null, null, null]);
    // 本体 が 無い マス は 出さない
    expect(s.m.kitIcons({ x: 60, y: 9, z: 60 }, true)).toHaveLength(0);
  });
});

describe('保存 v 4', () => {
  const kits3 = (s: S) => {
    s.settings.kitHatchTicks = 7200;
    const a = kitAt(s, 30, 30);
    const b = kitAt(s, 40, 30);
    for (const e of ['egg', 'kin_tamago', 'egg'] as const) {
      s.m.useKit(a.x, a.y, a.z, e);
      s.step(100);
    }
    s.m.useKit(b.x, b.y, b.z, 'egg');
  };
  it('v 4 で 書いて 読み直す と 同じ（順 も）。4,000 文字 以下', () => {
    const s = setup();
    kits3(s);
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(data.v).toBe(4);
    expect(data.kits).toHaveLength(2);
    expect(data.kits[0].eggs.map((e: { egg: string }) => e.egg)).toEqual(['egg', 'gold', 'egg']);
    const before = s.m.kits().map((k) => k.eggs!.map((e) => [e.egg, e.left]));
    s.m.deserialize(data);
    expect(s.m.kits().map((k) => k.eggs!.map((e) => [e.egg, e.left]))).toEqual(before);
    expect(JSON.stringify(data).length).toBeLessThan(4000);
  });
  it('v 3 の kits 行 { egg, left } → eggs 1 行。eggs 5 こ → 3 こ。9 こ → 6 こ。0 こ の 行 は すてる', () => {
    const s = setup();
    const ks = [kitAt(s, 30, 30), kitAt(s, 40, 30), kitAt(s, 50, 30)];
    const base = { friends: [], coops: [], machoMiss: 0 };
    s.m.deserialize({ v: 3, ...base, kits: [{ ...ks[0]!, egg: 'gold', left: 500 }] });
    expect(s.m.kits().map((k) => k.eggs!.map((e) => [e.egg, e.left]))).toEqual([[['gold', 500]]]);
    s.m.deserialize({ v: 4, ...base, kits: [{ ...ks[0]!, eggs: [1, 2, 3, 4, 5].map((n) => ({ egg: 'egg', left: 1000 * n })) }] });
    expect(s.m.kits()[0]!.eggs).toHaveLength(3);
    s.m.deserialize({ v: 4, ...base, kits: ks.map((k) => ({ ...k, eggs: [1, 2, 3].map((n) => ({ egg: 'egg', left: 1000 * n })) })) });
    expect(s.m.kits()).toHaveLength(2);
    s.m.deserialize({ v: 4, ...base, kits: [{ ...ks[0]!, eggs: [] }] });
    expect(s.m.kits()).toHaveLength(0);
  });
  it('本体 が 無い 行 は すてる。かえる 動き 中 の たまご は left 0 で もどる（ひよこ は 二重 に ならない）', () => {
    const s = setup();
    s.settings.kitHatchTicks = 5;
    const k = kitAt(s, 30, 30);
    s.player.position.x = 25.5;
    s.player.position.z = 30.5;
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.m.useKit(k.x, k.y, k.z, 'egg');
    s.step(20); // 1 こ目 が かえる 動き の まっ最中
    expect(s.m.list().some((a) => a.state === 'hatch')).toBe(true);
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(data.friends).toHaveLength(0);
    expect(data.kits[0].eggs.map((e: { left: number }) => e.left)).toEqual([0, 0]);
    s.world.setBlock(30, 9, 30, 'air');
    s.m.deserialize(data);
    expect(s.m.kits()).toHaveLength(0);
  });
});
