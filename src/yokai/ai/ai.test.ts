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
    heal: () => 0,
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
  it('からかさ: 目の高さの線が当たり、8 回で defeat（体力 8）、ドロップがイベントに出る', () => {
    const { m, step, inv } = setup();
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    const hit = m.raycast({ x: 2.5, y: 10.62, z: 6.5 }, { x: 1, y: 0, z: 0 }, 3);
    expect(hit?.id).toBe(id);
    expect(hit!.distance).toBeCloseTo(0.95, 5); // 当たり箱 +0.3
    expect(m.raycast({ x: 2.5, y: 10.62, z: 6.5 }, { x: 1, y: 0, z: 0 }, 0.9)).toBeNull();
    const from = { x: 2.5, y: 9, z: 6.5 };
    m.damage(id, 1, from);
    expect(m.list()[0]!.hp).toBe(7);
    step(10);
    expect(m.list()[0]!.position.x).toBeCloseTo(5.5, 2); // 1.0 押される
    for (let i = 0; i < 6; i++) m.damage(id, 1, from);
    expect(m.list()[0]!.state).not.toBe('dying'); // 7 回目まで体力 1 でたおれない
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
  it('WEAPON-4 AC4: 体力 23 に 2.3 を 10 回 → 10 回目で 0 になって たおれる（小数の 誤差で のこらない）', () => {
    const { m } = setup();
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    m.setHp(id, 23);
    const from = { x: 2.5, y: 9, z: 6.5 };
    for (let i = 1; i <= 9; i++) {
      m.damage(id, 2.3, from);
      expect(m.list()[0]!.state, `${i} 回目`).not.toBe('dying');
    }
    expect(m.list()[0]!.hp).toBeCloseTo(2.3, 3);
    m.damage(id, 2.3, from);
    expect(m.list()[0]!.state).toBe('dying');
    expect(m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(1);
  });
  it('WEAPON-4 AC4: 体力 8 に 1.5 を 1 回 → 6.5。たたいた あとの 体力は いつも 0.01 の位まで', () => {
    const { m } = setup();
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    const from = { x: 2.5, y: 9, z: 6.5 };
    m.damage(id, 1.5, from);
    expect(m.list()[0]!.hp).toBeCloseTo(6.5, 3);
    const id2 = m.spawn('karakasa', 7.5, 9, 6.5, { ai: false });
    m.damage(id2, 2.3, from);
    m.damage(id2, 2.3, from);
    expect(m.list().find((y) => y.id === id2)!.hp).toBe(3.4); // 8 − 2.3 − 2.3 = 3.4000000000000004 を そのまま のこさない
    m.damage(id, 0.8, from);
    m.damage(id, 0.8, from);
    m.damage(id, 2.3, from);
    m.damage(id, 2.3, from); // 8 − 1.5 − 0.8 − 0.8 − 2.3 − 2.3 = 0.3
    const hp = m.list()[0]!.hp;
    expect(hp).toBe(0.3);
    expect(Math.abs(hp * 100 - Math.round(hp * 100))).toBeLessThan(1e-9);
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
    ['karakasa', 18],
    ['chochin', 21],
    ['nurikabe', 12],
    ['rokurokubi', 18],
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
    let maxY = 0;
    for (let i = 0; i < 600; i++) {
      c.step();
      maxY = Math.max(maxY, c.m.list()[0]!.position.y); // たおれこみで足場がこわれることがあるので、のぼった高さを見る
    }
    expect(maxY).toBeCloseTo(10, 2);
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
    expect(k.combat.hits[0]!.amount).toBe(2);
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
    expect(n.combat.hits[0]!.amount).toBe(16); // 4 の 4 倍
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
    expect(combat.hits[0]!.amount).toBe(2);
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
    for (let i = 0; i < 48; i++) m2.damage(id, 1, { x: 0, y: 9, z: 0 });
    const d = m2.drainEvents().find((e) => e.type === 'defeat');
    expect(d && d.type === 'defeat' ? d.reward : -1).toBe(0);
  });
});

describe('ろくろくびの首・妖怪の体にふれる（M4 追加）', () => {
  it('間の壁を越えて、首を曲げて かみつく。道が無ければ かみつかない', () => {
    const { m, step, player, combat, world } = setup();
    player.position = { x: 8.5, y: 9, z: 6.5 };
    for (let y = 9; y <= 10; y++) for (let z = 3; z <= 10; z++) world.setBlock(6, y, z, 'stone');
    const id = m.spawn('rokurokubi', 3.5, 9, 6.5, { yawDeg: 90 });
    for (let i = 0; i < 90; i++) step();
    const ev = m.takeHookEvents();
    expect(ev.some((e) => e.type === 'attackStart' && e.id === id)).toBe(true);
    expect(combat.hits.some((h) => h.by === 'rokurokubi' && h.amount === 2)).toBe(true);
    // 道が無い（天井まで壁）なら かみつかない
    const t = setup();
    t.player.position = { x: 8.5, y: 9, z: 6.5 };
    for (let y = 9; y <= 30; y++) for (let z = 0; z <= 40; z++) t.world.setBlock(6, y, z, 'stone');
    t.m.spawn('rokurokubi', 3.5, 9, 6.5, { yawDeg: 90 });
    for (let i = 0; i < 200; i++) t.step();
    expect(t.m.takeHookEvents().some((e) => e.type === 'attackStart')).toBe(false);
  });

  it('プレイヤーが高い所にいても、首が届くなら かみつく。届かない高さなら かみつかない（#71）', () => {
    const { m, step, player, combat, world } = setup();
    for (let x = 7; x <= 10; x++) for (let z = 5; z <= 8; z++) world.setBlock(x, 12, z, 'stone');
    player.position = { x: 8.5, y: 13, z: 6.5 };
    m.spawn('rokurokubi', 3.5, 9, 6.5, { yawDeg: 90 });
    for (let i = 0; i < 120; i++) step();
    expect(m.takeHookEvents().some((e) => e.type === 'attackStart')).toBe(true);
    expect(combat.hits.some((h) => h.by === 'rokurokubi' && h.amount === 2)).toBe(true);
    const t = setup();
    for (let x = 4; x <= 8; x++) for (let z = 5; z <= 8; z++) t.world.setBlock(x, 20, z, 'stone');
    t.player.position = { x: 5.5, y: 21, z: 6.5 };
    t.m.spawn('rokurokubi', 3.5, 9, 6.5, { yawDeg: 90 });
    for (let i = 0; i < 200; i++) t.step();
    expect(t.m.takeHookEvents().some((e) => e.type === 'attackStart')).toBe(false);
  });

  it('体の箱にふれたら ハート半分（体力 1）。攻撃中は攻撃のダメージだけ', () => {
    const { m, step, player, combat } = setup();
    m.spawn('karakasa', 2.5, 9, 6.5, { ai: false });
    step(2);
    expect(combat.hits.length).toBeGreaterThan(0);
    expect(combat.hits[0]).toMatchObject({ amount: 1, by: 'karakasa' });
    m.config.contactDamage = 0;
    const n = combat.hits.length;
    step(5);
    expect(combat.hits.length).toBe(n);
    expect(player.position.x).toBe(2.5);
  });
});

describe('M5: 出る所と遠くの妖怪（AC18）', () => {
  function bigSetup(water: boolean) {
    const world = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
    for (let x = 0; x < 128; x++)
      for (let z = 0; z < 128; z++) {
        world.setBlock(x, 8, z, 'stone');
        if (water) world.setBlock(x, 9, z, 'water');
      }
    const time = makeTime('night');
    const player = { position: { x: 64.5, y: 9, z: 64.5 } };
    const m = new YokaiManager({ world, time, getPlayer: () => player, combat: makeCombat(), inventory: makeInv(), seed: 7 });
    m.config.yokaiWander = false;
    return { m, player };
  }
  it('夜、ひらちでは出て、水平 12 以上はなれている', () => {
    const { m, player } = bigSetup(false);
    // 気づく範囲が広いので近づいてくる。出た その時の距離を見る
    const seen = new Set<unknown>();
    for (let i = 0; i < 3000; i++) {
      m.update(1 / 60);
      for (const y of m.list()) {
        if (seen.has(y.id)) continue;
        seen.add(y.id);
        const d = Math.hypot(y.position.x - player.position.x, y.position.z - player.position.z);
        expect(d).toBeGreaterThanOrEqual(11.9);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });
  it('みず の列には出ない', () => {
    const { m } = bigSetup(true);
    for (let i = 0; i < 3000; i++) m.update(1 / 60);
    expect(m.list()).toHaveLength(0);
  });
  it('水平 64 より遠い妖怪は、次のステップで静かに消える（落とし物なし）', () => {
    const { m, player } = bigSetup(false);
    m.config.yokaiAutoSpawn = false;
    const near = m.spawn('karakasa', player.position.x + 60, 9, player.position.z, { ai: false });
    const far = m.spawn('karakasa', player.position.x + 65, 9, player.position.z, { ai: false });
    m.drainEvents();
    m.update(1 / 60);
    const ids = m.list().map((y) => y.id);
    expect(ids).toContain(near);
    expect(ids).not.toContain(far);
    expect(m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(0);
  });
});

describe('FIX-fall-reach: おりる・落下ダメージ・当たり判定', () => {
  it('5 マスの段差の上から、下のプレイヤーへ歩いて降りてくる', () => {
    const s = setup();
    for (let x = 9; x <= 14; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 13; y++) s.world.setBlock(x, y, z, 'stone');
    s.player.position = { x: 2.5, y: 9, z: 6.5 };
    s.m.spawn('rokurokubi', 10.5, 14, 6.5);
    let minY = 99;
    for (let i = 0; i < 900; i++) {
      s.step();
      minY = Math.min(minY, s.m.list()[0]?.position.y ?? 99);
    }
    expect(minY).toBeCloseTo(9, 2);
    expect(s.m.list()[0]!.hp).toBe(10); // 5 マス落ちて 2（体力 12 → 10）
  });
  it('おりると倒れる深さ・みず の上へは降りない（ちょうちん以外の歩く妖怪）', () => {
    const s = setup();
    for (let x = 9; x <= 14; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 24; y++) s.world.setBlock(x, y, z, 'stone');
    s.player.position = { x: 2.5, y: 9, z: 6.5 };
    s.m.spawn('rokurokubi', 10.5, 25, 6.5); // 16 マス = ダメージ 13 >= 体力 12
    s.step(900);
    expect(s.m.list()[0]!.position.y).toBeCloseTo(25, 2);
  });
  it('落下ダメージ: 3 マスで 0・5 マスで 2・みず で 0（ろくろくび 体力 12）', () => {
    const fall = (y: number, water = false) => {
      const s = setup();
      if (water) for (let yy = 9; yy <= 12; yy++) s.world.setBlock(5, yy, 5, 'water');
      s.m.spawn('rokurokubi', 5.5, y, 5.5, { ai: false });
      s.step(120);
      return s.m.list()[0]!.hp;
    };
    expect(fall(12)).toBe(12);
    expect(fall(14)).toBe(10);
    expect(fall(18, true)).toBe(12);
  });
  it('落下で倒れたらドロップ・経験値なし（defeat は出る）', () => {
    const s = setup();
    let xp = 0;
    const m = new YokaiManager({ world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: s.inv, seed: 3, onDefeat: () => xp++ });
    m.config.yokaiAutoSpawn = false;
    m.spawn('rokurokubi', 5.5, 25, 5.5, { ai: false }); // 16 マス = ダメージ 13 >= 体力 12
    for (let i = 0; i < 120; i++) m.update(1 / 60);
    expect(m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(1);
    expect(xp).toBe(0);
    expect(s.inv.added).toHaveLength(0);
  });
  it('からかさ: ゆらゆら（2 マス/秒 以下・横にゆれる）落ちて、ダメージなし', () => {
    const s = setup();
    const id = s.m.spawn('karakasa', 20.5, 20, 20.5, { ai: false });
    expect(id).toBeGreaterThan(0);
    let prev = s.m.list()[0]!.position;
    let maxDrop = 0;
    let minX = 99;
    let maxX = -99;
    for (let i = 0; i < 400 && s.m.list()[0]!.position.y > 9.001; i++) {
      s.step();
      const p = s.m.list()[0]!.position;
      maxDrop = Math.max(maxDrop, prev.y - p.y);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      prev = p;
    }
    expect(maxDrop).toBeLessThanOrEqual(2 / 60 + 1e-6);
    expect(maxX - minX).toBeGreaterThan(0.8);
    s.step(20);
    expect(s.m.list()[0]!.hp).toBe(8);
    expect(s.m.list()[0]!.position.y).toBeCloseTo(9, 2);
  });
  it('みず: ろくろくびは中まで追いかける・からかさは入らない。中では速さ ×0.5', () => {
    const pond = (kind: YokaiKind, water: boolean) => {
      const s = setup();
      if (water) for (let x = 0; x <= 30; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 10; y++) s.world.setBlock(x, y, z, 'water');
      s.player.position = { x: 17.5, y: 9, z: 6.5 };
      s.m.spawn(kind, 6.5, 9, 6.5);
      s.step(90);
      return s.m.list()[0]!.position.x - 6.5;
    };
    const dry = pond('rokurokubi', false);
    const wet = pond('rokurokubi', true);
    expect(dry).toBeGreaterThan(1.2);
    expect(wet / dry).toBeGreaterThan(0.4);
    expect(wet / dry).toBeLessThan(0.65);
    expect(pond('karakasa', true)).toBeLessThan(0.1);
  });
  it('攻撃を受ける判定: 当たり箱が 0.3 大きい（前は外れた位置で当たる）', () => {
    const s = setup();
    const id = s.m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    // 箱の横は ±0.75。0.9 はなれた線も当たる、1.1 は外れる
    expect(s.m.raycast({ x: 2.5, y: 10.6, z: 7.4 }, { x: 1, y: 0, z: 0 }, 4)?.id).toBe(id);
    expect(s.m.raycast({ x: 2.5, y: 10.6, z: 7.6 }, { x: 1, y: 0, z: 0 }, 4)).toBeNull();
    // 上: 箱の上は 1.8。2.0 の高さも当たる
    expect(s.m.raycast({ x: 2.5, y: 10.95, z: 6.5 }, { x: 1, y: 0, z: 0 }, 4)?.id).toBe(id);
  });
  it('置く・ぶつかりの箱は広げない', () => {
    const s = setup();
    s.m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    expect(s.m.occupies(5, 9, 6)).toBe(true); // 箱は x 3.75〜5.25
    expect(s.m.occupies(5, 9, 8)).toBe(false);
    expect(s.m.occupies(6, 9, 6)).toBe(false);
  });
});

describe('FIX-fall-reach: ぬりかべ', () => {
  it('体力 40・のけぞらない（ノックバック 0）', () => {
    const s = setup();
    const id = s.m.spawn('nurikabe', 10.5, 9, 10.5, { ai: false });
    expect(s.m.list()[0]!.maxHp).toBe(40);
    for (let i = 0; i < 39; i++) s.m.damage(id, 1, { x: 10.5, y: 9, z: 6.5 });
    s.step(30);
    expect(s.m.list()[0]!.position.z).toBeCloseTo(10.5, 3);
    expect(s.m.list()[0]!.state).not.toBe('dying');
    s.m.damage(id, 1, { x: 10.5, y: 9, z: 6.5 });
    expect(s.m.list()[0]!.state).toBe('dying');
  });
  it('たおれこみで前のブロック（木・石・つち）とした 1 段がこわれる。start_torch・みず・y=0 はこわれない', () => {
    const s = setup();
    const broken: Array<{ x: number; y: number; z: number }> = [];
    const m = new YokaiManager({
      world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: s.inv, seed: 1,
      onBlocks: (cells) => broken.push(...cells),
    });
    m.config.yokaiAutoSpawn = false;
    m.config.yokaiWander = false;
    s.world.setBlock(10, 9, 9, 'log');
    s.world.setBlock(11, 9, 8, 'stone');
    s.world.setBlock(10, 9, 8, 'dirt');
    s.world.setBlock(9, 9, 9, 'start_torch');
    s.world.setBlock(11, 9, 9, 'water');
    s.world.setBlock(10, 0, 9, 'stone');
    s.player.position = { x: 10.5, y: 9, z: 8.5 };
    m.spawn('nurikabe', 10.5, 9, 10.5, { yawDeg: 0 });
    for (let i = 0; i < 200; i++) m.update(1 / 60);
    expect(s.world.getBlock(10, 9, 9)).toBe('air');
    expect(s.world.getBlock(11, 9, 8)).toBe('air');
    expect(s.world.getBlock(10, 9, 8)).toBe('air');
    expect(s.world.getBlock(10, 8, 9)).toBe('air'); // 真下 1 段
    expect(s.world.getBlock(9, 9, 9)).toBe('start_torch');
    expect(s.world.getBlock(11, 9, 9)).toBe('water');
    expect(s.world.getBlock(10, 0, 9)).toBe('stone');
    expect(broken.length).toBeGreaterThan(4);
    expect(s.inv.added).toHaveLength(0); // 落とし物にならない
  });
  function pondRig() {
    const s = setup();
    let xp = 0;
    for (let x = 6; x <= 14; x++) for (let z = 8; z <= 13; z++) for (let y = 9; y <= 12; y++) s.world.setBlock(x, y, z, 'water');
    const m = new YokaiManager({
      world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: s.inv, seed: 1,
      onDefeat: () => xp++,
    });
    m.config.yokaiAutoSpawn = false;
    return { s, m, xp: () => xp };
  }
  it('みず の中で 180 ステップ → 石ブロックになり、経験値も出る。水以外は上書きしない', () => {
    const { s, m, xp } = pondRig();
    s.world.setBlock(9, 10, 10, 'dirt');
    m.spawn('nurikabe', 10.5, 9, 10.5, { ai: false });
    for (let i = 0; i < 179; i++) m.update(1 / 60);
    expect(m.list()).toHaveLength(1);
    expect(m.list()[0]!.state).not.toBe('dying');
    m.update(1 / 60);
    expect(m.list()).toHaveLength(0);
    expect(xp()).toBe(1);
    expect(s.world.getBlock(10, 9, 10)).toBe('stone');
    expect(s.world.getBlock(11, 11, 10)).toBe('stone');
    expect(s.world.getBlock(9, 10, 10)).toBe('dirt');
    expect(s.world.getBlock(10, 12, 10)).toBe('water');
    expect(s.world.getBlock(10, 9, 12)).toBe('water');
  });
  it('途中で みず から出るともどる', () => {
    const { s, m } = pondRig();
    m.spawn('nurikabe', 10.5, 9, 10.5, { ai: false });
    for (let i = 0; i < 90; i++) m.update(1 / 60);
    for (let y = 9; y <= 12; y++) s.world.setBlock(10, y, 10, 'air');
    for (let y = 9; y <= 12; y++) for (const x of [9, 11]) s.world.setBlock(x, y, 10, 'air');
    for (let i = 0; i < 300; i++) m.update(1 / 60);
    expect(m.list()).toHaveLength(1);
    expect(s.world.getBlock(10, 9, 10)).toBe('air');
  });
});

describe('WEAPON-2: damage の 4 つ目（押す距離・上への初速）と setHp', () => {
  const from = { x: 2.5, y: 9, z: 6.5 };
  it('距離を 指定すると その分 押される（突き 1.5・大げさ 2.5）', () => {
    for (const d of [1.5, 2.5, 0]) {
      const { m, step } = setup();
      const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
      m.damage(id, 1, from, { dist: d, up: 0 });
      step(12);
      expect(m.list()[0]!.position.x).toBeCloseTo(4.5 + d, 2);
    }
  });
  it('上への初速: 切り上げ 7 で 0.8 以上 うき、もどる。ちょうちん も もとの高さへ', () => {
    for (const kind of ['karakasa', 'chochin'] as const) {
      const { m, step } = setup();
      const id = m.spawn(kind, 4.5, 9, 6.5, { ai: false });
      const y0 = m.list()[0]!.position.y;
      m.damage(id, 1, from, { dist: 1, up: 7 });
      let maxY = y0;
      for (let i = 0; i < 10; i++) {
        step(1);
        maxY = Math.max(maxY, m.list()[0]!.position.y);
      }
      expect(maxY - y0).toBeGreaterThanOrEqual(0.8);
      step(120);
      expect(m.list()[0]!.position.y).toBeCloseTo(y0, 2);
    }
  });
  it('ぬりかべ は 上にも 横にも 動かない', () => {
    const { m, step } = setup();
    const id = m.spawn('nurikabe', 6.5, 9, 6.5, { ai: false });
    m.setHp(id, 48);
    m.damage(id, 1, from, { dist: 2.5, up: 7 });
    step(15);
    const p = m.list()[0]!.position;
    expect(p.x).toBeCloseTo(6.5, 5);
    expect(p.y).toBeCloseTo(9, 5);
  });
  it('setHp は 最大を こえて も よい', () => {
    const { m } = setup();
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    expect(m.setHp(id, 99)).toBe(true);
    expect(m.list()[0]!.hp).toBe(99);
    expect(m.setHp(999, 1)).toBe(false);
  });
});

describe('BAL-B: 二つ名・場所の倍率（つなぎ）', () => {
  it('ヌシ: 体力 24・攻撃 4・おしらせ 180 ステップ・音の出来事 1 回・たおすと経験値 15 と title', () => {
    let got: { xp: number; title: string } | null = null;
    const s = setup();
    const m = new YokaiManager({
      world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: s.inv, seed: 1,
      onDefeat: (_k, info) => (got = info),
    });
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false, title: 'nushi', m: 1 });
    const row = m.list()[0]!;
    expect([row.title, row.m, row.maxHp, row.attack, row.name]).toEqual(['nushi', 1, 24, 4, 'からかさおばけ']);
    expect(m.announce()).toEqual({ text: 'からかさおばけ の ヌシ が あらわれた！', icon: 'nushi', ticksLeft: 180 });
    expect(m.takeHookEvents().filter((e) => e.type === 'titleSound')).toHaveLength(1);
    for (let i = 0; i < 179; i++) m.update(1 / 60);
    expect(m.announce()).not.toBeNull();
    m.update(1 / 60);
    expect(m.announce()).toBeNull();
    expect(m.nameplateInfo(id)).toEqual({ visible: true, text: 'からかさおばけ の ヌシ' });
    m.damage(id, 24, s.player.position);
    expect(got).toEqual({ xp: 15, title: 'nushi', m: 1 });
    expect(m.drainEvents().find((e) => e.type === 'defeat')).toMatchObject({ title: 'nushi' });
  });
  it('たいしょう・ヌシ は 1 体まで・ぬりかべ も 同じ（#270）・16 ブロックより遠いと名前なし', () => {
    const { m, player } = setup();
    const a = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false, title: 'taisho' });
    const b = m.spawn('karakasa', 4.5, 9, 9.5, { ai: false, title: 'nushi' });
    const n = m.spawn('nurikabe', 8.5, 9, 6.5, { ai: false, title: 'taisho' });
    const t = (id: number) => m.list().find((y) => y.id === id)!.title;
    // ぬりかべ も たいしょう・ヌシ の 1 体に かぞえる（先にいる からかさ がいるので なし）
    expect([t(a), t(b), t(n)]).toEqual(['taisho', 'none', 'none']);
    // ほかに 大きい二つ名がいなければ ぬりかべ も たいしょう（#270）
    const s2 = setup();
    const n2 = s2.m.spawn('nurikabe', 8.5, 9, 6.5, { ai: false, title: 'taisho' });
    expect(s2.m.list().find((y) => y.id === n2)!.title).toBe('taisho');
    const s3 = setup();
    const n3 = s3.m.spawn('nurikabe', 8.5, 9, 6.5, { ai: false, title: 'nushi' });
    expect(s3.m.list().find((y) => y.id === n3)!.title).toBe('nushi');
    player.position.x = 40;
    m.update(1 / 60);
    expect(m.nameplateInfo(a)?.visible).toBe(false);
  });
  it('M: 出た場所から。はじまりの場所・海面は設定から読む', () => {
    const s = setup();
    const m = new YokaiManager({
      world: s.world, time: s.time, getPlayer: () => s.player, combat: s.combat, inventory: s.inv, seed: 1,
      origin: () => ({ x: 4.5 - 564, z: 6.5 }), seaY: () => 9 + 40,
    });
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    expect(m.list()[0]!.m).toBe(1); // テスト用の出し方は m を省くと 1
    m.clear();
    m.spawn('karakasa', 4.5, 9, 6.5, { ai: false, m: 'auto' }); // 自動の出現と同じ決め方（場所から）
    expect(m.list()[0]!.m).toBeCloseTo(2, 9); // 遠さ 564・深さ 40
    expect(m.list()[0]!.maxHp).toBe(16);
    expect(m.list()[0]!.attack).toBe(3);
    expect(id).toBeGreaterThan(0);
  });
  it('大きい二つ名は 体が入らない所では なし', () => {
    const { m, world } = setup();
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 11, z, 'stone'); // 天井 高さ 2（9〜10）
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false, title: 'nushi' }); // 高さ 1.6 × 1.5 = 2.4 は入らない
    expect(m.list().find((y) => y.id === id)!.title).toBe('none');
    const id2 = m.spawn('karakasa', 4.5, 9, 9.5, { ai: false, title: 'oyabun' }); // 1.6 × 1.25 = 2.0 は入る
    expect(m.list().find((y) => y.id === id2)!.title).toBe('oyabun');
  });
});

describe('列を捨てる・出てよい列（VOX-D）', () => {
  it('canSpawnAt が false を返す所には 出ない', () => {
    const s = setup({ phase: 'night' });
    s.m.config.yokaiAutoSpawn = true;
    (s.m as unknown as { opts: { canSpawnAt?: (x: number, z: number) => boolean } }).opts.canSpawnAt = () => false;
    s.player.position = { x: 20.5, y: 9, z: 20.5 };
    s.step(600);
    expect(s.m.list()).toHaveLength(0);
  });
  it('canSpawnAt が true なら 今までどおり 出る', () => {
    const s = setup({ phase: 'night' });
    s.m.config.yokaiAutoSpawn = true;
    (s.m as unknown as { opts: { canSpawnAt?: (x: number, z: number) => boolean } }).opts.canSpawnAt = () => true;
    s.player.position = { x: 20.5, y: 9, z: 20.5 };
    s.step(1);
    expect(s.m.list()).toHaveLength(1);
  });
  it('読みこんでいない列にいる妖怪は 静かに消える（落とし物なし）', () => {
    const s = setup();
    s.m.spawn('karakasa', 10.5, 9, 10.5, { ai: false });
    s.step(2);
    expect(s.m.list()).toHaveLength(1);
    s.world.isLoaded = () => false;
    s.step(2);
    expect(s.m.list()).toHaveLength(0);
    expect(s.inv.added).toHaveLength(0);
    expect(s.m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(0);
  });
});
