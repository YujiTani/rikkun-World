import { afterEach, describe, expect, it } from 'vitest';
import { createGashaRelease, type BossHandle, type ReleaseEnv } from './release';
import { RELEASE } from './releaseTuning';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「出る・消える」「体力ゲージ」・§9.10・§10・§11.2 の 8・AC112・AC113）: がしゃどくろの 出る・消える・ゲージの 2 人分（release.ts）。実装の 前に 書いた 赤の テスト。
 * 出るのは 1P の まわり（今の まま）。消えるのは **2 人とも** despawnDistance（400 マス）より 遠い とき。ゲージは **barShowDistance（100 マス）より 近い 人の 半分** に 出す。
 *
 * ---- 開発への 約束（`src/gasha/release.ts` の ReleaseEnv。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   ReleaseEnv.players?(): readonly { who: 1 | 2; x: number; y: number; z: number }[]   … 遊んでいる 人の 足もと（1P も ふくむ。2P が いなければ 1P だけ）。毎回 読み直す。
 *       なければ 今の とおり env.player() だけ（AC113。今の release.test.ts は 変えない）。出す 場所・向きは 今の まま env.player()（1P）の まわり。
 *   ReleaseEnv.showBarFor?(who: 1 | 2, on: boolean): void   … その人の 半分の ゲージを 出す／かくす（`gasha-hp-p1`＝1P の `#gashaBigHp`・`gasha-hp-p2`）。
 *       players が ある ときは 人ごとに 呼ぶ（その人が barShowDistance 以内なら on）。なければ 今の showBar(on)（1P）。
 *       2P が 一覧から 消えたら、次の しらべで showBarFor(2, false)。体が 消えたら 両方 false。
 */

const R = RELEASE.spawn;

function fakeBoss(at: { x: number; z: number; yawDeg?: number }) {
  const boss = { pos: { x: at.x, y: 20, z: at.z }, alive: true, despawns: 0, places: 1 };
  const handle: BossHandle = {
    place: (a) => { boss.pos = { x: a.x, y: 20, z: a.z }; boss.alive = true; boss.places++; },
    despawn: () => { boss.alive = false; boss.despawns++; },
    hp: () => 1000,
    maxHp: () => 1000,
    angry: () => {},
    walk: () => {},
    info: () => ({ pos: [boss.pos.x, boss.pos.y, boss.pos.z] }),
  };
  return { boss, handle };
}

function rig(opts: { p2?: { x: number; z: number } | null; legacyBar?: boolean } = {}) {
  const p1 = { x: 0.5, y: 20, z: 0.5, yawDeg: 90 };
  const p2 = opts.p2 === undefined ? { x: 0.5, z: 0.5 } : opts.p2;
  const p2ref: { cur: { x: number; z: number } | null } = { cur: p2 };
  const bar: { 1: boolean[]; 2: boolean[] } = { 1: [], 2: [] };
  const legacyBar: boolean[] = [];
  let made: ReturnType<typeof fakeBoss> | null = null;
  const env = {
    seed: 4242, enabled: true,
    player: () => ({ ...p1 }),
    players: () => [{ who: 1 as const, x: p1.x, y: p1.y, z: p1.z }, ...(p2ref.cur ? [{ who: 2 as const, x: p2ref.cur.x, y: 20, z: p2ref.cur.z }] : [])],
    isLand: () => true, isLoaded: () => false, terrainTop: () => 12, groundY: () => 40,
    start: async (_wrap: unknown, at: { x: number; z: number; yawDeg?: number }) => { made = fakeBoss(at); return made.handle; },
    scatter: () => {}, record: () => {}, say: () => {},
    showBarFor: (who: 1 | 2, on: boolean) => { bar[who].push(on); },
    ...(opts.legacyBar ? { showBar: (on: boolean) => { legacyBar.push(on); } } : {}),
  } as unknown as ReleaseEnv;
  const rel = createGashaRelease(env);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) rel.step(1 / 60); };
  return { rel, p1, p2: p2ref, bar, legacyBar, run, boss: () => made!.boss };
}
const tick = R.checkEverySec + 0.3;

describe('出る 場所は 1P の まわり（今の まま。AC112・§11.2 の 8）', () => {
  const savedChance = RELEASE.spawn.chancePerMorning;
  afterEach(() => { RELEASE.spawn.chancePerMorning = savedChance; });

  it('2P が 遠くに いても 近くに いても、出る 場所は 1P から minDistance〜maxDistance', async () => {
    for (const p2 of [{ x: 3000.5, z: 3000.5 }, { x: 0.5, z: 0.5 }, { x: 160, z: 0 }]) {
      const r = rig({ p2 });
      await r.rel.spawn({ distance: 200, angleDeg: 0 });
      expect(r.boss().pos.x).toBeCloseTo(r.p1.x + 200, 3);
      expect(r.boss().pos.z).toBeCloseTo(r.p1.z, 3);
    }
    RELEASE.spawn.chancePerMorning = 1;
    const r = rig({ p2: { x: 3000.5, z: 3000.5 } });
    r.rel.onMorning(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const d = Math.hypot(r.boss().pos.x - r.p1.x, r.boss().pos.z - r.p1.z);
    expect(d).toBeGreaterThanOrEqual(R.minDistance - 1e-6);
    expect(d).toBeLessThanOrEqual(R.maxDistance + 1e-6);
  });
});

describe('消える のは 2 人とも 遠い とき（AC112）', () => {
  it('1P が despawnDistance より 遠くても、2P が 近ければ 消えない。2P も 遠く なると 消える', async () => {
    const r = rig({ p2: { x: 230, z: 0.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    const b = r.boss().pos;
    r.p1.x = b.x - (R.despawnDistance + 50); // 1P は 遠い
    r.p2.cur = { x: b.x + 30, z: b.z }; // 2P は 近い
    r.run(tick + 2);
    expect(r.rel.state()).toBe('present');
    expect(r.boss().despawns).toBe(0);
    r.p2.cur = { x: b.x + R.despawnDistance + 50, z: b.z }; // 2P も 遠い
    r.run(tick);
    expect(r.rel.state()).toBe('idle');
    expect(r.boss().despawns).toBe(1);
  });

  it('2P が 遠くて 1P が 近い うちは 消えない。1P も 遠く なれば 消える', async () => {
    const r = rig({ p2: { x: 5000.5, z: 5000.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    r.run(tick + 2);
    expect(r.rel.state()).toBe('present');
    const b = r.boss().pos;
    r.p1.x = b.x - (R.despawnDistance + 50);
    r.run(tick);
    expect(r.rel.state()).toBe('idle');
  });

  it('2P が いなく なって（やめて）1P だけに なっても、1P が 近い うちは 消えず、1P が 遠く なれば 消える（2P の 位置は もう 見ない）', async () => {
    const r = rig({ p2: { x: 230, z: 0.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    const b = r.boss().pos;
    r.p2.cur = null;
    r.run(tick + 2);
    expect(r.rel.state()).toBe('present');
    r.p1.x = b.x - (R.despawnDistance + 50);
    r.run(tick);
    expect(r.rel.state()).toBe('idle');
  });

  it('1 人（players が 1P だけ）の ときは 今の とおり、1P が 遠く なれば 消える', async () => {
    const r = rig({ p2: null });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    r.p1.x += R.despawnDistance + R.maxDistance + 50;
    r.run(tick);
    expect(r.rel.state()).toBe('idle');
  });
});

describe('体力ゲージは 100 マス より 近い 人の 半分に（AC112）', () => {
  it('2P だけ 近い: 2P の ゲージだけ 出る（1P の ゲージは かくれる）', async () => {
    const r = rig({ p2: { x: 230, z: 0.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.bar[1].at(-1)).toBe(false);
    expect(r.bar[2].at(-1)).toBe(true); // 近くに 出した ときは すぐ 出る
  });

  it('1P だけ 近い: 1P の ゲージだけ 出る。しらべは checkEverySec ごと', async () => {
    const r = rig({ p2: { x: 5000.5, z: 5000.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.bar[1].at(-1)).toBe(false);
    expect(r.bar[2].at(-1)).toBe(false);
    r.p1.x = r.boss().pos.x - 50;
    r.run(tick);
    expect(r.bar[1].at(-1)).toBe(true);
    expect(r.bar[2].at(-1)).toBe(false);
  });

  it('2 人とも 近い: 両方の 半分に 出る。境目（barShowDistance ちょうど）は 出る・それより 遠いと かくれる', async () => {
    const r = rig({ p2: { x: 5000.5, z: 5000.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    const b = r.boss().pos;
    r.p1.x = b.x - R.barShowDistance; r.p1.z = b.z;
    r.p2.cur = { x: b.x, z: b.z + R.barShowDistance };
    r.run(tick);
    expect(r.bar[1].at(-1)).toBe(true);
    expect(r.bar[2].at(-1)).toBe(true);
    r.p2.cur = { x: b.x, z: b.z + R.barShowDistance + 1 };
    r.run(tick);
    expect(r.bar[1].at(-1)).toBe(true);
    expect(r.bar[2].at(-1)).toBe(false);
  });

  it('2P が やめて 一覧から 消えたら、2P の ゲージは 次の しらべで かくれる', async () => {
    const r = rig({ p2: { x: 230, z: 0.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.bar[2].at(-1)).toBe(true);
    r.p2.cur = null;
    r.run(tick);
    expect(r.bar[2].at(-1)).toBe(false);
  });

  it('体が 消えたら 両方の ゲージが かくれる', async () => {
    const r = rig({ p2: { x: 230, z: 0.5 } });
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    r.p1.x = r.boss().pos.x - 50;
    r.run(tick);
    expect(r.bar[1].at(-1)).toBe(true);
    expect(r.bar[2].at(-1)).toBe(true);
    r.rel.despawn();
    expect(r.bar[1].at(-1)).toBe(false);
    expect(r.bar[2].at(-1)).toBe(false);
  });
});

describe('1 人の とき（AC113）: players が なければ 今の showBar（1P）の まま', () => {
  it('players も showBarFor も ない 環境で、今の とおり showBar が 1P の 近さで 呼ばれる', async () => {
    const legacy: boolean[] = [];
    const p = { x: 0.5, y: 20, z: 0.5, yawDeg: 90 };
    let made: ReturnType<typeof fakeBoss> | null = null;
    const env: ReleaseEnv = {
      seed: 1, enabled: true, player: () => ({ ...p }), isLand: () => true, isLoaded: () => false, terrainTop: () => 12, groundY: () => 40,
      start: async (_w, at) => { made = fakeBoss(at); return made.handle; },
      scatter: () => {}, record: () => {}, say: () => {}, showBar: (on) => { legacy.push(on); },
    };
    const rel = createGashaRelease(env);
    await rel.spawn({ distance: 200, angleDeg: 0 });
    expect(legacy.at(-1)).toBe(false);
    p.x = made!.boss.pos.x - 50;
    for (let i = 0; i < Math.round((R.checkEverySec + 0.3) * 60); i++) rel.step(1 / 60);
    expect(legacy.at(-1)).toBe(true);
  });
});
