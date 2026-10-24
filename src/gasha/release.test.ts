import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Group, type Scene } from 'three';
import type { ItemStack } from '../contracts';
import type { GashaBigDeps } from '../proto/gashaBig';
import { TUNE as BIG } from '../proto/gashaBigTuning';
import { createGashaRelease, type BossHandle, type DepsWrap, type ReleaseEnv } from './release';
import { RELEASE } from './releaseTuning';

/** gashaBig.ts の place の まね: プレイヤーの 前方 distance に 置く（deps.player と T.place.distance を 読む） */
function fakeBoss(wrapped: GashaBigDeps) {
  const boss = {
    pos: { x: 0, y: 0, z: 0 },
    hp: 1000,
    angry: false,
    walking: true,
    places: 0,
    place() {
      const p = wrapped.player();
      const y = (p.yawDeg * Math.PI) / 180;
      const d = BIG.place.distance;
      const x = p.x + Math.sin(y) * d, z = p.z - Math.cos(y) * d;
      boss.pos = { x, y: wrapped.groundY(Math.floor(x), Math.floor(z)) + 1, z };
      boss.hp = 1000;
      boss.places++;
      wrapped.fillBlocks?.(Math.floor(x) - 3, boss.pos.y - 8, Math.floor(z) - 3, Math.floor(x) + 3, boss.pos.y - 1, Math.floor(z) + 3, 'grass');
    },
  };
  boss.place();
  wrapped.giveNinjaTabi?.();
  const handle: BossHandle = {
    place: () => boss.place(),
    hp: () => boss.hp,
    angry: (on) => { boss.angry = on; },
    walk: (on) => { boss.walking = on; },
    info: () => ({ pos: [boss.pos.x, boss.pos.y, boss.pos.z] }),
  };
  return { boss, handle };
}

function rig(over: { chance?: number; enabled?: boolean } = {}) {
  const player = { x: 0.5, y: 20, z: 0.5, yawDeg: 90 };
  const loaded = new Set<string>(); // 読みこんだ 列
  const log = {
    scatter: [] as { at: { x: number; y: number; z: number }; stacks: readonly ItemStack[] }[],
    record: [] as string[],
    say: [] as string[],
    bgmReset: 0,
    sounds: [] as string[],
    fills: [] as number[][],
    bar: [] as boolean[],
    tabi: 0,
    starts: 0,
  };
  const scene = new Group() as unknown as Scene;
  let bossRef: ReturnType<typeof fakeBoss> | null = null;
  const baseDeps = {
    player: () => ({ ...player }),
    groundY: () => 40,
    fillBlocks: (...a: number[]) => { log.fills.push(a); },
    giveNinjaTabi: () => { log.tabi++; },
  } as unknown as GashaBigDeps;
  const env: ReleaseEnv = {
    seed: 4242,
    enabled: over.enabled ?? true,
    player: () => ({ ...player }),
    isLand: () => true,
    isLoaded: (x, z) => loaded.has(`${x >> 4},${z >> 4}`),
    terrainTop: () => 12,
    groundY: () => 40,
    scene,
    start: async (wrap: DepsWrap) => {
      log.starts++;
      bossRef = fakeBoss(wrap(baseDeps));
      // 読みこんだ 列なら 本物の 高さ（40）、読みこんで いなければ 地形の 高さ（12）が 返る
      return bossRef.handle;
    },
    scatter: (at, stacks) => { log.scatter.push({ at: { ...at }, stacks }); },
    record: (key) => { log.record.push(key); },
    say: (t) => { log.say.push(t); },
    bgmReset: () => { log.bgmReset++; },
    sound: (n) => { log.sounds.push(n); },
    showBar: (on) => { log.bar.push(on); },
  };
  RELEASE.spawn.chancePerMorning = over.chance ?? 1;
  const rel = createGashaRelease(env);
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) rel.step(1 / 60); };
  return { rel, env, player, loaded, log, settle, run, boss: () => bossRef!.boss };
}

describe('がしゃどくろの 出現（ふだんの ゲーム）', () => {
  let distBackup = 0;
  beforeEach(() => { distBackup = BIG.place.distance; });
  afterEach(() => { BIG.place.distance = distBackup; RELEASE.spawn.chancePerMorning = 0.3; });

  it('あさに くじが 当たると、プレイヤーから 150〜250 ブロック先に 1 体だけ 出る（足袋は 自動で 着せない）', async () => {
    const r = rig();
    r.rel.onMorning(1);
    await r.settle();
    expect(r.rel.state()).toBe('present');
    expect(r.log.starts).toBe(1);
    expect(r.log.tabi).toBe(0); // ごほうびの 足袋を はじめから 着せない
    const d = Math.hypot(r.boss().pos.x - r.player.x, r.boss().pos.z - r.player.z);
    expect(d).toBeGreaterThanOrEqual(RELEASE.spawn.minDistance - 1e-6);
    expect(d).toBeLessThanOrEqual(RELEASE.spawn.maxDistance + 1e-6);
    expect(r.rel.info().distance).toBeCloseTo(d, 3);
  });

  it('出る 向きは プレイヤーの 向きと 関係なく ばらける（日ごと）', async () => {
    const angles = new Set<number>();
    for (let day = 1; day <= 24; day++) {
      const r = rig();
      r.player.yawDeg = 0;
      r.rel.onMorning(day);
      await r.settle();
      angles.add(Math.round(Math.atan2(r.boss().pos.z - r.player.z, r.boss().pos.x - r.player.x) / (Math.PI / 4)));
    }
    expect(angles.size).toBeGreaterThanOrEqual(5);
  });

  it('世界に 1 体だけ: いる 間は あさが 来ても 増えない。同じ 日に 2 回 くじを 引かない', async () => {
    const r = rig();
    r.rel.onMorning(1);
    await r.settle();
    r.rel.onMorning(2);
    await r.settle();
    expect(r.log.starts).toBe(1);
    expect(r.boss().places).toBe(1);
  });

  it('確率 0 なら 出ない。オフ（?gasha=off・自動テスト）の ときも 出ない', async () => {
    const r1 = rig({ chance: 0 });
    for (let d = 1; d < 30; d++) r1.rel.onMorning(d);
    await r1.settle();
    expect(r1.rel.state()).toBe('idle');
    const r2 = rig({ enabled: false });
    r2.rel.onMorning(1);
    await r2.settle();
    expect(r2.rel.state()).toBe('idle');
    expect(r2.log.starts).toBe(0);
  });

  it('どの 向きも 海なら その 日は 出ない', async () => {
    const r = rig();
    r.env.isLand = () => false;
    r.rel.onMorning(1);
    await r.settle();
    expect(r.rel.state()).toBe('idle');
  });

  it('遠く（despawnDistance より 先）へ はなれると 消える。そのあと 次の あさに また 出られる', async () => {
    const r = rig();
    r.rel.onMorning(1);
    await r.settle();
    const first = r.boss().places;
    r.player.x += RELEASE.spawn.despawnDistance + RELEASE.spawn.maxDistance + 50;
    r.run(RELEASE.spawn.checkEverySec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.boss().places).toBe(first + 1); // 遠くへ しまった（置きなおし）
    expect(Math.hypot(r.boss().pos.x - r.player.x, r.boss().pos.z - r.player.z)).toBeGreaterThan(RELEASE.defeat.parkDistance - 10);
    expect(r.boss().angry).toBe(false);
    expect(r.boss().walking).toBe(false);
    r.rel.onMorning(2);
    await r.settle();
    expect(r.rel.state()).toBe('present');
    expect(r.log.starts).toBe(1); // 2 回目は 読みこみなおさず 置くだけ
    expect(Math.hypot(r.boss().pos.x - r.player.x, r.boss().pos.z - r.player.z)).toBeLessThanOrEqual(RELEASE.spawn.maxDistance + 1e-6);
  });

  it('近く にいる 間は 消えない', async () => {
    const r = rig();
    r.rel.onMorning(1);
    await r.settle();
    r.run(10);
    expect(r.rel.state()).toBe('present');
  });

  it('開発用 spawn(): すぐ 出す（距離を 書かなければ dev.distance）。いる 時は 置きなおす', async () => {
    const r = rig({ chance: 0 });
    await r.rel.spawn();
    expect(r.rel.state()).toBe('present');
    expect(r.rel.info().distance).toBeCloseTo(RELEASE.dev.distance, 3);
    await r.rel.spawn({ distance: 30 });
    expect(r.rel.state()).toBe('present');
    expect(r.rel.info().distance).toBeCloseTo(30, 3);
    // 向きを 角度で 指定
    await r.rel.spawn({ distance: 50, angleDeg: 180 });
    expect(r.boss().pos.x).toBeCloseTo(r.player.x - 50, 3);
    expect(r.boss().pos.z).toBeCloseTo(r.player.z, 3);
  });
});

describe('体力ゲージ（試作の ゲージは 出っぱなしなので 近い 間だけ 出す）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  it('遠く（barShowDistance より 先）に いる 間は かくし、近づいた 1 秒 あとに 出し、消えたら かくす', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.log.bar.at(-1)).toBe(false);
    r.player.x = 200.5 - 50; // 近づく
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.log.bar.at(-1)).toBe(true);
    r.rel.despawn();
    expect(r.log.bar.at(-1)).toBe(false);
  });

  it('近くに 出した ときは すぐ 出る', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 60, angleDeg: 0 });
    expect(r.log.bar.at(-1)).toBe(true);
  });
});

describe('地面の 高さ・地ならし（読みこんで いない 遠くでも 出せる）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  it('読みこんで いない 列は 地形の 高さ、読みこんだ 列は ゲームの 地面の 高さ', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.boss().pos.y).toBe(12 + 1); // 遠くは 読みこんで いない → terrainTop
    const r2 = rig();
    r2.loaded.add(`${200 >> 4},${0 >> 4}`);
    for (let z = -2; z <= 2; z++) for (let x = 190; x <= 210; x += 8) r2.loaded.add(`${x >> 4},${z}`);
    await r2.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r2.boss().pos.y).toBe(40 + 1);
  });

  it('地ならし（fillBlocks）は 列が 読みこまれる まで 待って、読みこまれたら 1 回だけ 流す', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.log.fills.length).toBe(0); // まだ 読みこんで いない
    expect(r.rel.info().pendingFills).toBe(1);
    r.run(2);
    expect(r.log.fills.length).toBe(0);
    // 近づいて 列が 読みこまれた
    const bx = Math.floor(r.boss().pos.x), bz = Math.floor(r.boss().pos.z);
    for (let x = bx - 3; x <= bx + 3; x += 1) for (let z = bz - 3; z <= bz + 3; z += 1) r.loaded.add(`${x >> 4},${z >> 4}`);
    r.run(2);
    expect(r.log.fills.length).toBe(1);
    expect(r.rel.info().pendingFills).toBe(0);
    r.run(5);
    expect(r.log.fills.length).toBe(1);
  });

  it('すでに 読みこんで いる 近い 所なら すぐ 地ならし', async () => {
    const r = rig();
    for (let x = -20; x <= 120; x += 8) for (let z = -20; z <= 20; z += 8) r.loaded.add(`${x >> 4},${z >> 4}`);
    await r.rel.spawn({ distance: 60, angleDeg: 0 });
    expect(r.log.fills.length).toBe(1);
    expect(r.rel.info().pendingFills).toBe(0);
  });

  it('しまう（遠くへ おく）ときは 地ならしを しない。待っていた 分も すてる', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    expect(r.rel.info().pendingFills).toBe(1);
    r.rel.despawn();
    expect(r.rel.info().pendingFills).toBe(0);
    expect(r.log.fills.length).toBe(0);
  });
});

describe('たおした ごほうび', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  async function defeated() {
    const r = rig();
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().hp = 0;
    r.run(1 / 60);
    return r;
  }

  it('体力 0 で: 実績 を 記録、メッセージ、BGM を 止める、その 場所に 宝箱', async () => {
    const r = await defeated();
    expect(r.rel.state()).toBe('defeated');
    expect(r.log.record).toEqual(['defeat:gashadokuro']);
    expect(r.log.say.length).toBe(1);
    expect(r.log.say[0]).toContain('がしゃどくろ');
    expect(r.log.bgmReset).toBe(1);
    const chests = r.rel.chests();
    expect(chests.length).toBe(1);
    expect(chests[0]!.x).toBeCloseTo(r.boss().pos.x, 3);
    expect(chests[0]!.z).toBeCloseTo(r.boss().pos.z, 3);
    expect(r.env.scene.children.length).toBe(1);
  });

  it('たおれた 回数は 1 回だけ（体力 0 の まま 何コマ たっても 実績・宝箱は ふえない）', async () => {
    const r = await defeated();
    r.run(0.5);
    expect(r.log.record.length).toBe(1);
    expect(r.rel.chests().length).toBe(1);
  });

  it('lingerSec たつと 体は 遠くへ しまわれ（消え）、宝箱は のこる', async () => {
    const r = await defeated();
    r.run(RELEASE.defeat.lingerSec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(Math.hypot(r.boss().pos.x - r.player.x, r.boss().pos.z - r.player.z)).toBeGreaterThan(RELEASE.defeat.parkDistance - 10);
    expect(r.rel.chests().length).toBe(1);
  });

  it('宝箱: 遠い あいだは あかない。近づくと あいて、足袋 + レア素材が とびだす（1 回だけ）', async () => {
    const r = await defeated();
    r.run(RELEASE.defeat.lingerSec + 0.5);
    r.run(10);
    expect(r.log.scatter.length).toBe(0);
    // 宝箱の そばへ
    const c = r.rel.chests()[0]!;
    r.player.x = c.x + 2; r.player.z = c.z; r.player.y = c.y;
    r.run(RELEASE.chest.openSec + 1);
    expect(r.log.scatter.length).toBe(1);
    const items = r.log.scatter[0]!.stacks.map((s) => s.item);
    expect(items).toContain('ninja_tabi');
    for (const row of RELEASE.reward.rare) expect(items).toContain(row.item);
    expect(r.log.scatter[0]!.at.y).toBeGreaterThan(c.y);
    r.run(10);
    expect(r.log.scatter.length).toBe(1);
    expect(r.log.sounds).toContain('levelUp');
  });

  it('あけた 宝箱は stayOpenSec あとに 消える', async () => {
    const r = await defeated();
    const c = r.rel.chests()[0]!;
    r.player.x = c.x + 1; r.player.z = c.z; r.player.y = c.y;
    r.run(RELEASE.defeat.lingerSec + RELEASE.chest.riseSec + RELEASE.chest.openSec + RELEASE.chest.stayOpenSec + 2);
    expect(r.rel.chests().length).toBe(0);
    expect(r.env.scene.children.length).toBe(0);
  });

  it('dev: defeat() で すぐ たおした ことに できる', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 40 });
    r.rel.defeat();
    expect(r.rel.state()).toBe('defeated');
    expect(r.rel.chests().length).toBe(1);
  });
});
