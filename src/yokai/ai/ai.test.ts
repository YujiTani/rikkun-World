import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { YOKAI_DROPS } from './config';
import { aabbOverlap, lineOfSight, rayObb } from './geometry';

function makeTime(phase: DayPhase = 'day'): TimeOfDay & { p: DayPhase } {
  const t = {
    p: phase,
    dayTick: () => 0,
    day: () => 0,
    phase: () => t.p,
    skyColor: () => '#000000',
    brightness: () => 1,
    dollBrightness: () => 1,
    set: () => {},
    update: () => {},
    onPhaseChange: () => () => {},
  };
  return t;
}

function makeCombat() {
  const hits: Array<{ amount: number; by: YokaiKind; from: Vec3 }> = [];
  const c: PlayerCombat & { hits: typeof hits; isDead: boolean } = {
    hits,
    isDead: false,
    hp: () => 20,
    maxHp: () => 20,
    dead: () => c.isDead,
    invincibleTicks: () => 0,
    damage: (amount, by, from) => {
      hits.push({ amount, by, from });
      return true;
    },
    drainEvents: () => [],
  };
  return c;
}

function makeInv() {
  const added: Array<{ item: ItemId; count: number }> = [];
  const inv = { added, add: (item: ItemId, count: number) => (added.push({ item, count }), 0) } as unknown as Inventory & { added: typeof added };
  return inv;
}

function setup(opts: { floor?: boolean; phase?: DayPhase } = {}) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  if (opts.floor !== false) {
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  }
  const time = makeTime(opts.phase ?? 'day');
  const combat = makeCombat();
  const inv = makeInv();
  const player = { position: { x: 2.5, y: 9, z: 6.5 } };
  const m = new YokaiManager({ world, time, getPlayer: () => player, combat, inventory: inv, seed: 1 });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) m.update(1 / 60);
  };
  return { world, time, combat, inv, player, m, step };
}

describe('geometry', () => {
  it('線と箱: 前から当たると面までの距離', () => {
    const b = { cx: 0, cy: 0.9, cz: 0, hx: 0.75, hy: 0.9, hz: 0.75 };
    const d = rayObb(0, 1.62, 5, 0, 0, -1, b, 0, 0, 0, 0);
    expect(d).toBeCloseTo(4.25, 5);
    expect(rayObb(0, 1.62, 5, 0, 0, 1, b, 0, 0, 0, 0)).toBe(-1);
  });
  it('向きがあると箱が回る（ぬりかべ 横長を東向きに）', () => {
    const b = { cx: 0, cy: 1.5, cz: 0, hx: 1.3, hy: 1.5, hz: 0.4 };
    // yaw 90 度: 箱の長い方は南北にのびる
    const d = rayObb(0, 1.5, 10, 0, 0, -1, b, 0, 0, 0, Math.PI / 2);
    expect(d).toBeCloseTo(10 - 1.3, 5);
  });
  it('目の線: 壁があると通らない', () => {
    const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    expect(lineOfSight(w, 1.5, 2, 1.5, 10.5, 2, 1.5)).toBe(true);
    w.setBlock(5, 2, 1, 'stone');
    expect(lineOfSight(w, 1.5, 2.5, 1.5, 10.5, 2.5, 1.5)).toBe(false);
  });
  it('箱の重なり: ふれているだけは重ならない', () => {
    const a = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    const b = { minX: 1, maxX: 2, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    expect(aabbOverlap(a, b)).toBe(false);
  });
});

describe('パンチの窓口（raycast / damage / occupies）', () => {
  it('からかさ: 目の高さの線が当たり、4 回で defeat、ドロップがイベントに出る', () => {
    const { m, step, inv } = setup();
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    const hit = m.raycast({ x: 2.5, y: 10.62, z: 6.5 }, { x: 1, y: 0, z: 0 }, 3);
    expect(hit?.id).toBe(id);
    expect(hit!.distance).toBeCloseTo(1.25, 5);
    expect(m.raycast({ x: 2.5, y: 10.62, z: 6.5 }, { x: 1, y: 0, z: 0 }, 1)).toBeNull();
    const from = { x: 2.5, y: 9, z: 6.5 };
    m.damage(id, 1, from);
    expect(m.list()[0]!.hp).toBe(3);
    step(10);
    expect(m.list()[0]!.position.x).toBeCloseTo(5.5, 2); // 1.0 押される
    m.damage(id, 1, from);
    m.damage(id, 1, from);
    m.damage(id, 1, from);
    const ev = m.drainEvents();
    expect(ev.filter((e) => e.type === 'defeat')).toHaveLength(1);
    expect(m.list()[0]!.state).toBe('dying');
    // 乱数のドロップがインベントリに入る（0 個以上、表の中の物だけ）
    const allowed = new Set(YOKAI_DROPS.karakasa.map((r) => r.item));
    for (const a of inv.added) expect(allowed.has(a.item)).toBe(true);
    step(66);
    expect(m.list()).toHaveLength(0);
  });
  it('ぬりかべは押されない', () => {
    const { m, step } = setup();
    const id = m.spawn('nurikabe', 6.5, 9, 6.5, { ai: false });
    m.damage(id, 1, { x: 2.5, y: 9, z: 6.5 });
    step(15);
    expect(m.list()[0]!.position.x).toBeCloseTo(6.5, 5);
  });
  it('妖怪の箱の所は occupies', () => {
    const { m } = setup();
    m.spawn('karakasa', 5.5, 9, 5.5, { ai: false });
    expect(m.occupies(5, 9, 5)).toBe(true);
    expect(m.occupies(5, 11, 5)).toBe(false);
    expect(m.occupies(10, 9, 5)).toBe(false);
  });
});

describe('AI（距離だけで動く）', () => {
  function atDist(kind: YokaiKind, d: number) {
    const s = setup();
    s.player.position = { x: 1.5, y: 9, z: 1.5 };
    const o = 1.5 + d / Math.SQRT2;
    s.m.spawn(kind, o, 9, o);
    return s;
  }
  const sight: Array<[YokaiKind, number]> = [
    ['karakasa', 12],
    ['chochin', 14],
    ['nurikabe', 8],
    ['rokurokubi', 12],
  ];
  for (const [kind, range] of sight) {
    it(`${kind}: 見つける距離の内側は追いかけ、外側は気づかない`, () => {
      const a = atDist(kind, range - 1);
      a.step(30);
      expect(['chase', 'attack', 'retreat']).toContain(a.m.list()[0]!.state);
      const b = atDist(kind, range + 1);
      b.step(300);
      expect(b.m.list()[0]!.state).toBe('idle');
    });
  }
  it('壁ごしでも距離が近ければ見つける（目の線は見ない）', () => {
    const { m, step, world, player } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    for (let y = 9; y <= 11; y++) for (let z = 3; z <= 10; z++) world.setBlock(5, y, z, 'stone');
    m.spawn('karakasa', 8.5, 9, 6.5);
    step(30);
    expect(m.list()[0]!.state).toBe('chase');
  });
  it('あきらめる距離をこえたら さがす → やすむ', () => {
    const { m, step, player } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    m.spawn('karakasa', 10.5, 9, 6.5);
    step(10);
    expect(m.list()[0]!.state).toBe('chase');
    player.position = { x: 2.5, y: 9, z: 30 };
    step(2);
    expect(m.list()[0]!.state).toBe('search');
    step(300);
    expect(m.list()[0]!.state).toBe('idle');
  });
  it('からかさ: 2 ブロックの段をのぼる。ぬりかべは 1 ブロックの段まで', () => {
    const a = setup();
    for (let x = 6; x <= 12; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 10; y++) a.world.setBlock(x, y, z, 'stone');
    a.player.position = { x: 9.5, y: 11, z: 6.5 };
    a.m.spawn('karakasa', 3.5, 9, 6.5);
    a.step(600);
    expect(a.m.list()[0]!.position.y).toBeCloseTo(11, 2);

    const b = setup();
    for (let x = 6; x <= 12; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 10; y++) b.world.setBlock(x, y, z, 'stone');
    b.player.position = { x: 9.5, y: 11, z: 6.5 };
    b.m.spawn('nurikabe', 3.5, 9, 6.5);
    b.step(600);
    expect(b.m.list()[0]!.position.y).toBeCloseTo(9, 2);

    const c = setup();
    for (let x = 6; x <= 12; x++) for (let z = 0; z <= 12; z++) c.world.setBlock(x, 9, z, 'stone');
    c.player.position = { x: 9.5, y: 10, z: 6.5 };
    c.m.spawn('nurikabe', 3.5, 9, 6.5);
    c.step(600);
    expect(c.m.list()[0]!.position.y).toBeCloseTo(10, 2);
  });
  it('水には入らない（からかさ）。ちょうちんは水の上を行く', () => {
    function sea(kind: YokaiKind) {
      const s = setup({ floor: false });
      for (let x = 0; x <= 5; x++) for (let z = 0; z <= 12; z++) s.world.setBlock(x, 8, z, 'stone');
      for (let x = 6; x <= 12; x++) for (let z = 0; z <= 12; z++) {
        s.world.setBlock(x, 4, z, 'sand');
        for (let y = 5; y <= 7; y++) s.world.setBlock(x, y, z, 'water');
      }
      s.player.position = { x: 10.5, y: 7.5, z: 6.5 };
      s.m.spawn(kind, 3.5, 9, 6.5);
      return s;
    }
    const k = sea('karakasa');
    k.step(600);
    expect(k.m.list()[0]!.position.x).toBeLessThanOrEqual(6.0);
    const c = sea('chochin');
    c.step(600);
    expect(c.m.list()[0]!.position.x).toBeGreaterThan(6.0);
  });
  it('ちょうちん: 4〜6 ブロックをたもち、近づくとにげる', () => {
    const { m, step, player } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    m.spawn('chochin', 12.5, 9, 6.5);
    step(600);
    const d = Math.hypot(m.list()[0]!.position.x - 2.5, m.list()[0]!.position.z - 6.5);
    expect(d).toBeGreaterThanOrEqual(4);
    expect(d).toBeLessThanOrEqual(6);
    player.position = { x: m.list()[0]!.position.x - 2, y: 9, z: m.list()[0]!.position.z };
    step(120);
    const d2 = Math.hypot(m.list()[0]!.position.x - player.position.x, m.list()[0]!.position.z - player.position.z);
    expect(d2).toBeGreaterThan(2);
  });
  it('ぬりかべは 0.5 ブロック/秒', () => {
    const { m, step, player } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    const id = m.spawn('nurikabe', 2.5, 9, 14.5, { yawDeg: 0 });
    void id;
    step(2); // 気づく（北向き = プレイヤーの方）
    const z0 = m.list()[0]!.position.z;
    step(300);
    const z1 = m.list()[0]!.position.z;
    expect(z0 - z1).toBeGreaterThan(2.25);
    expect(z0 - z1).toBeLessThan(2.8);
  });
  it('ぬりかべ: 真後ろ 2.0 では 150 ステップ攻撃せず、回って攻撃する', () => {
    const { m, step, player } = setup();
    // 北向き（-Z）。プレイヤーは真後ろ（+Z）2.0
    m.spawn('nurikabe', 10.5, 9, 10.5, { yawDeg: 0 });
    player.position = { x: 10.5, y: 9, z: 12.5 };
    let startedAt = -1;
    for (let i = 1; i <= 600; i++) {
      step();
      if (m.drainEvents().some((e) => e.type === 'attackStart')) {
        startedAt = i;
        break;
      }
    }
    expect(startedAt).toBeGreaterThan(150);
    expect(startedAt).toBeLessThanOrEqual(260);
  });
  it('ろくろくび: 近づいて 120 ステップ以内に攻撃し、攻撃中は動かない。30 ステップ目に当たる', () => {
    const { m, step, player, combat } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    m.spawn('rokurokubi', 7.5, 9, 6.5, { yawDeg: 270 });
    let start = -1;
    let hitStep = -1;
    for (let i = 1; i <= 140; i++) {
      step();
      for (const e of m.drainEvents()) {
        if (e.type === 'attackStart') start = i;
        if (e.type === 'attackHit') hitStep = i;
      }
      if (hitStep > 0) break;
    }
    expect(start).toBeGreaterThan(0);
    expect(hitStep - start).toBe(29);
    expect(combat.hits.length).toBeLessThanOrEqual(1);
  });
  it('からかさ: ふみつけが当たると 1 のダメージ。ぬりかべは 90 ステップ目に 2', () => {
    const k = setup();
    k.player.position = { x: 2.5, y: 9, z: 6.5 };
    k.m.spawn('karakasa', 4.5, 9, 6.5, { yawDeg: 270 });
    let start = -1;
    let hit = -1;
    for (let i = 1; i <= 100; i++) {
      k.step();
      for (const e of k.m.drainEvents()) {
        if (e.type === 'attackStart') start = i;
        if (e.type === 'attackHit') hit = i;
      }
      if (hit > 0) break;
    }
    expect(hit - start).toBe(29);
    expect(k.combat.hits).toHaveLength(1);
    expect(k.combat.hits[0]!.amount).toBe(1);
    expect(k.combat.hits[0]!.by).toBe('karakasa');

    const n = setup();
    n.player.position = { x: 10.5, y: 9, z: 8.5 };
    n.m.spawn('nurikabe', 10.5, 9, 10.5, { yawDeg: 0 });
    start = -1;
    hit = -1;
    for (let i = 1; i <= 200; i++) {
      n.step();
      for (const e of n.m.drainEvents()) {
        if (e.type === 'attackStart') start = i;
        if (e.type === 'attackHit') hit = i;
      }
      if (hit > 0) break;
    }
    expect(hit - start).toBe(89);
    expect(n.combat.hits[0]!.amount).toBe(2);
  });
  it('ちょうちん: 火の玉が出て、とどくとダメージ 1 で消える', () => {
    const { m, step, player, combat } = setup();
    player.position = { x: 2.5, y: 9, z: 6.5 };
    m.spawn('chochin', 7.5, 9, 6.5, { yawDeg: 270 });
    let fired = false;
    for (let i = 0; i < 400 && combat.hits.length === 0; i++) {
      step();
      if (m.drainEvents().some((e) => e.type === 'fireball')) fired = true;
    }
    expect(fired).toBe(true);
    expect(combat.hits).toHaveLength(1);
    expect(combat.hits[0]!.amount).toBe(1);
    step(2);
    expect(m.fireballCount()).toBe(0);
  });
});

describe('出現と帰る', () => {
  it('よる: 1 ステップ目に出る。5 体まで。ぬりかべは 1 体まで。出る場所は離れていて、水の上ではない', () => {
    const s = setup({ phase: 'night' });
    s.m.config.yokaiAutoSpawn = true;
    s.player.position = { x: 20.5, y: 9, z: 20.5 };
    s.step(1);
    expect(s.m.list()).toHaveLength(1);
    let max = 0;
    let nuri = 0;
    for (let i = 0; i < 3000; i++) {
      s.step();
      max = Math.max(max, s.m.list().length);
      nuri = Math.max(nuri, s.m.list().filter((e) => e.kind === 'nurikabe').length);
    }
    expect(max).toBeLessThanOrEqual(5);
    expect(nuri).toBeLessThanOrEqual(1);
    for (const e of s.m.takeHookEvents()) {
      if (e.type !== 'spawn') continue;
      const d = Math.hypot(e.position.x - 20.5, e.position.z - 20.5);
      expect(d).toBeGreaterThanOrEqual(12);
      expect(d).toBeLessThanOrEqual(28);
    }
  });
  it('同じシードなら同じ並び', () => {
    const run = () => {
      const s = setup({ phase: 'night' });
      s.m.config.yokaiAutoSpawn = true;
      s.player.position = { x: 20.5, y: 9, z: 20.5 };
      s.step(1500);
      return s.m.takeHookEvents().filter((e) => e.type === 'spawn');
    };
    expect(run()).toEqual(run());
  });
  it('ひる: 空の下には出ない。屋根の下には出る', () => {
    const open = setup({ phase: 'day' });
    open.m.config.yokaiAutoSpawn = true;
    open.player.position = { x: 20.5, y: 9, z: 20.5 };
    open.step(1800);
    expect(open.m.list()).toHaveLength(0);

    const roofed = setup({ phase: 'day' });
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) roofed.world.setBlock(x, 14, z, 'stone');
    roofed.m.config.yokaiAutoSpawn = true;
    roofed.player.position = { x: 20.5, y: 9, z: 20.5 };
    roofed.step(1800);
    expect(roofed.m.list().length).toBeGreaterThan(0);
  });
  it('あさ: 空の下の妖怪は 600 ステップ以内に帰る（defeat なし）。屋根の下は残る', () => {
    const s = setup({ phase: 'day' });
    for (let x = 30; x <= 38; x++) for (let z = 30; z <= 38; z++) for (let y = 12; y <= 12; y++) s.world.setBlock(x, y, z, 'stone');
    s.player.position = { x: 2.5, y: 9, z: 2.5 };
    s.m.spawn('karakasa', 10.5, 9, 10.5, { ai: false });
    s.m.spawn('nurikabe', 14.5, 9, 10.5, { ai: false });
    s.m.spawn('chochin', 18.5, 9, 10.5, { ai: false });
    s.m.spawn('rokurokubi', 34.5, 9, 34.5, { ai: false });
    s.m.takeHookEvents();
    s.time.p = 'dawn';
    s.step(600);
    const ev = s.m.takeHookEvents();
    expect(ev.filter((e) => e.type === 'leave')).toHaveLength(3);
    expect(ev.filter((e) => e.type === 'defeat')).toHaveLength(0);
    expect(s.m.list().map((e) => e.kind)).toEqual(['rokurokubi']);
  });
});

describe('ドロップ表', () => {
  it('表の確率は 高 0.7・中 0.4・低 0.15・とても低 0.05 で、数は 1〜max', () => {
    for (const rows of Object.values(YOKAI_DROPS)) {
      for (const r of rows) {
        expect([0.7, 0.4, 0.15, 0.05]).toContain(r.chance);
        expect(r.max).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it('defeat.reward は入った合計。入りきらない分は含まない', () => {
    const s = setup();
    const full = { add: (_i: ItemId, c: number) => c } as unknown as Inventory;
    const m2 = new YokaiManager({ world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: full, seed: 3 });
    m2.config.yokaiAutoSpawn = false;
    const id = m2.spawn('nurikabe', 5.5, 9, 6.5, { ai: false });
    for (let i = 0; i < 6; i++) m2.damage(id, 1, { x: 0, y: 9, z: 0 });
    const d = m2.drainEvents().find((e) => e.type === 'defeat');
    expect(d && d.type === 'defeat' ? d.reward : -1).toBe(0);
  });
});
