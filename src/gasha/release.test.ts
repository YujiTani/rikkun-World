import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { hazePatch } from './gashaBig';
import type { ItemStack } from '../contracts';
import type { GashaBigDeps } from './gashaBig';
import { createGashaRelease, type BossHandle, type DepsWrap, type GirlHooks, type ReleaseEnv } from './release';
import { RELEASE } from './releaseTuning';
import { NINJA_GEAR } from '../craft/config';
import type { ItemId } from '../contracts';

const NINJA_IDS = Object.values(NINJA_GEAR) as string[];
import { TUNE as BIG } from './gashaBigTuning';

/** gashaBig.ts の place({ x, z, yawDeg })・despawn()・onDefeated の まね */
function fakeBoss(wrapped: GashaBigDeps, first: { x: number; z: number; yawDeg?: number }) {
  const boss = {
    pos: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    hp: 1000,
    angry: false,
    walking: true,
    alive: false,
    hidden: false,
    tiredSec: 0,
    finales: 0,
    frozen: false,
    girlBox: null as unknown,
    /** 固まった しゅんかん(gashaBig.ts の onUpdate が onHeld を 呼ぶ) */
    hold() { boss.frozen = true; wrapped.onHeld?.(); },
    places: 0,
    despawns: 0,
    /** 体力 0 に なった（gashaBig.ts の onUpdate が onDefeated を 呼ぶ） */
    kill() { boss.hp = 0; wrapped.onDefeated?.(); },
    /** とどめの あとの 場面（gashaBig.ts の finishInfo の まね） */
    phase: 'off',
    damaged: [] as { part: string; amount: number }[],
    /** コアを たたいた（n 回目。left = のこり） */
    coreHit(n: number, left: number) { wrapped.onCoreHit?.({ x: boss.pos.x + 1, y: boss.pos.y + 5, z: boss.pos.z, n, left }); },
    /** コアが こわれた */
    coreBroken() { wrapped.onCoreBroken?.({ x: boss.pos.x + 1, y: boss.pos.y + 5, z: boss.pos.z }); },
    /** くずれて 消えた */
    vanished() { wrapped.onVanished?.(); },
    place(at: { x: number; z: number; yawDeg?: number }) {
      const { x, z } = at;
      boss.pos = { x, y: (wrapped.placeGroundY ?? wrapped.groundY)(Math.floor(x), Math.floor(z)) + 1, z };
      boss.yawDeg = at.yawDeg ?? 0;
      boss.hp = 1000;
      boss.alive = true;
      boss.hidden = false;
      boss.finales = 0;
      boss.frozen = false;
      boss.places++;
    },
    despawn() { boss.alive = false; boss.angry = false; boss.walking = false; boss.despawns++; },
  };
  boss.place(first);
  if (!wrapped.noTabi) wrapped.giveNinjaTabi?.();
  // 体の 3D（place の たびに 新しい 材料で 作りなおされる、ところまで まねる）
  let group = new Group();
  const remake = () => { group = new Group(); const m = new MeshBasicMaterial(); hazePatch(m); group.add(new Mesh(new BoxGeometry(), m)); };
  remake();
  const handle: BossHandle = {
    get group() { return group; },
    place: (at) => { boss.place(at); remake(); },
    despawn: () => boss.despawn(),
    finale: () => { boss.finales++; },
    frozen: () => boss.frozen,
    perchSpot: () => ({ x: boss.pos.x + 3, y: boss.pos.y + 30, z: boss.pos.z, yawDeg: 0 }),
    setGirlBox: (b) => { boss.girlBox = b; },
    hp: () => boss.hp,
    maxHp: () => 1000,
    damage: (part, amount) => { boss.damaged.push({ part, amount }); boss.kill(); return amount; },
    finishInfo: () => ({ phase: boss.phase, coreHp: 8, coreMax: 8 }),
    angry: (on) => { boss.angry = on; },
    walk: (on) => { boss.walking = on; },
    info: () => ({ pos: [boss.pos.x, boss.pos.y, boss.pos.z] }),
  };
  return { boss, handle };
}

function rig(over: { chance?: number; enabled?: boolean; noGirl?: boolean; hold?: boolean; ninja?: { book: ItemId[]; have: ItemId[] } } = {}) {
  const player = { x: 0.5, y: 20, z: 0.5, yawDeg: 90 };
  const loaded = new Set<string>(); // 読みこんだ 列
  const log = {
    scatter: [] as { at: { x: number; y: number; z: number }; stacks: readonly ItemStack[]; opts?: object }[],
    record: [] as string[],
    say: [] as string[],
    bgmReset: 0,
    sounds: [] as string[],
    fills: [] as number[][],
    bar: [] as boolean[],
    tabi: 0,
    dropped: [] as { item: string; from: string }[],
    starts: 0,
    girlStarts: 0,
    summons: 0,
    dismisses: 0,
    finishes: 0,
    crumbles: 0,
  };
  /** 少女の まね（読みこみを 待たせる ことも できる）。hooks = 座る 場所・当たりの 箱 */
  const girl = {
    hooks: null as null | GirlHooks,
    stage: 'laugh' as 'off' | 'laugh' | 'orbit' | 'pose' | 'girl' | 'perch' | 'down' | 'crumble',
    active: false,
    gate: null as null | (() => void),
    hold: false,
  };
  let bossRef: ReturnType<typeof fakeBoss> | null = null;
  const baseDeps = {
    player: () => ({ ...player }),
    groundY: () => 30, // 地形の 高さ（ゲームの groundY）。出す 高さは placeGroundY が 決める
    fillBlocks: (...a: number[]) => { log.fills.push(a); }, // 呼ばれない はず（地ならしは しない）
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
    start: async (wrap: DepsWrap, at) => {
      log.starts++;
      bossRef = fakeBoss(wrap(baseDeps), at);
      // 読みこんだ 列なら 本物の 高さ（40）、読みこんで いなければ 地形の 高さ（12）が 返る
      return bossRef.handle;
    },
    startGirl: over.noGirl ? undefined : async (hooks) => {
      log.girlStarts++;
      girl.hooks = hooks;
      if (girl.hold) await new Promise<void>((res) => { girl.gate = res; });
      return {
        summon: () => { log.summons++; girl.active = true; },
        finish: () => { log.finishes++; girl.stage = 'down'; },
        crumble: () => { log.crumbles++; girl.stage = 'crumble'; },
        dismiss: () => { log.dismisses++; girl.active = false; },
        active: () => girl.active,
        stage: () => (girl.active ? girl.stage : 'off'),
      };
    },
    scatter: (at, stacks, opts) => { log.scatter.push({ at: { ...at }, stacks, opts }); },
    record: (key) => { log.record.push(key); },
    say: (t) => { log.say.push(t); },
    bgmReset: () => { log.bgmReset++; },
    sound: (n) => { log.sounds.push(n); },
    showBar: (on) => { log.bar.push(on); },
    // NINJA-1（#299）: 手に 入れた 帳と 持って いる 物（なければ 空）／袋が 出た ことの 知らせ（テロップ用）
    ninja: () => over.ninja ?? { book: [], have: [] },
    dropped: (item, from) => { log.dropped.push({ item, from }); },
  };
  RELEASE.spawn.chancePerMorning = over.chance ?? 1;
  girl.hold = over.hold ?? false;
  const rel = createGashaRelease(env);
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) rel.step(1 / 60); };
  return { rel, env, player, loaded, log, settle, run, girl, boss: () => bossRef!.boss };
}

describe('がしゃどくろの 出現（ふだんの ゲーム）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

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
    expect(r.boss().places).toBe(first); // 置きなおしでは なく
    expect(r.boss().despawns).toBe(1); // 本物の 片づける 口を 呼ぶ
    expect(r.boss().alive).toBe(false);
    expect(r.boss().angry).toBe(false);
    expect(r.boss().walking).toBe(false);
    r.rel.onMorning(2);
    await r.settle();
    expect(r.rel.state()).toBe('present');
    expect(r.log.starts).toBe(1); // 2 回目は 読みこみなおさず 置くだけ
    expect(r.boss().alive).toBe(true);
    expect(r.boss().places).toBe(first + 1);
    expect(Math.hypot(r.boss().pos.x - r.player.x, r.boss().pos.z - r.player.z)).toBeLessThanOrEqual(RELEASE.spawn.maxDistance + 1e-6);
  });

  it('片づけたら BGM の 記録も けす。出す ときは 場所と プレイヤーの 方を 向く 向きを 直接 わたす', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 100, angleDeg: 0 });
    const b = r.boss();
    expect(b.pos.x).toBeCloseTo(r.player.x + 100, 3);
    expect(b.pos.z).toBeCloseTo(r.player.z, 3);
    // プレイヤーは -x の 方 → atan2(-100, 0) = -90 度
    expect(b.yawDeg).toBeCloseTo(-90, 3);
    r.rel.despawn();
    expect(r.log.bgmReset).toBe(1);
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

  it('地ならしは しない: 出現で ワールドの ブロックを 書きかえない（プレイヤーの 家・畑を 消さない）。遠くでも 近くでも', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    r.run(5);
    expect(r.log.fills.length).toBe(0);
    const bx = Math.floor(r.boss().pos.x), bz = Math.floor(r.boss().pos.z);
    for (let x = bx - 3; x <= bx + 3; x += 1) for (let z = bz - 3; z <= bz + 3; z += 1) r.loaded.add(`${x >> 4},${z >> 4}`);
    r.run(5);
    expect(r.log.fills.length).toBe(0);
    const r2 = rig();
    for (let x = -20; x <= 120; x += 8) for (let z = -20; z <= 20; z += 8) r2.loaded.add(`${x >> 4},${z >> 4}`);
    await r2.rel.spawn({ distance: 60, angleDeg: 0 });
    expect(r2.log.fills.length).toBe(0);
  });

  it('出す 高さ: 読みこみ済みなら env.groundY（置いた ブロック込み）、未読みこみなら terrainTop。ゲームの groundY（地形）は つかわない', async () => {
    const r = rig();
    for (let x = -20; x <= 120; x += 8) for (let z = -20; z <= 20; z += 8) r.loaded.add(`${x >> 4},${z >> 4}`);
    await r.rel.spawn({ distance: 60, angleDeg: 0 });
    expect(r.boss().pos.y).toBe(40 + 1);
  });
});

describe('とどめ → 赤い コア → ごほうび（宝箱は ない）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  async function finishing(over: Parameters<typeof rig>[0] = {}) {
    const r = rig(over);
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().kill(); // 体力 0 の 一撃（onDefeated）
    return r;
  }

  it('とどめの 一撃: まだ 倒した ことに しない（実績・ごほうびは コアを こわした とき）。BGM は 止める。形態は down', async () => {
    const r = await finishing();
    expect(r.rel.state()).toBe('present');
    expect(r.log.record).toEqual([]);
    expect(r.log.scatter.length).toBe(0);
    expect(r.log.bgmReset).toBe(1);
    expect(r.rel.info().form).toBe('down');
    expect(r.boss().angry).toBe(false);
  });

  it('何コマ たっても とどめは 1 回だけ（BGM・少女への 合図も 1 回）', async () => {
    const r = rig({ chance: 0 });
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.boss().hold();
    r.boss().kill();
    r.boss().kill();
    r.run(1);
    expect(r.log.finishes).toBe(1);
    expect(r.log.bgmReset).toBe(1);
    expect(r.log.dismisses).toBe(0); // 少女は 消さず その場に 座らせる
    expect(r.rel.info().form).toBe('down');
  });

  it('体力が 0 に なって いるのに onDefeated が 来なくても 毎コマの 見まわりで とどめに 入る', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().hp = 0;
    r.run(0.1);
    expect(r.rel.info().form).toBe('down');
    expect(r.log.bgmReset).toBe(1);
  });

  it('形態: とどめの あとは down、大きな 姿が くずれはじめたら crumble', async () => {
    const r = await finishing();
    for (const ph of ['blow', 'fall', 'lie']) { r.boss().phase = ph; expect(r.rel.info().form).toBe('down'); }
    for (const ph of ['crumble', 'gone']) { r.boss().phase = ph; expect(r.rel.info().form).toBe('crumble'); }
  });

  it('コアを たたく たび: レア素材の 行ごとに 1 山ずつ、いきおいよく ばらまく（実績・状態は まだ）', async () => {
    const r = await finishing();
    r.boss().coreHit(1, 7);
    expect(r.log.scatter.length).toBe(RELEASE.reward.rare.length);
    for (let i = 0; i < r.log.scatter.length; i++) {
      const row = RELEASE.reward.rare[i]!;
      const s = r.log.scatter[i]!;
      expect(s.stacks.length).toBe(1); // 山ごとに 光の 柱
      expect(s.stacks[0]!.item).toBe(row.item);
      expect(s.stacks[0]!.count).toBeGreaterThanOrEqual(1);
      expect(s.stacks[0]!.count).toBeLessThanOrEqual(Math.max(1, Math.round(row.max * RELEASE.core.hitScale)));
      expect(s.opts).toEqual({ speedMin: RELEASE.core.scatterSpeed[0], speedMax: RELEASE.core.scatterSpeed[1], upMin: RELEASE.core.scatterUp[0], upMax: RELEASE.core.scatterUp[1] });
      expect(s.at.y).toBeCloseTo(r.boss().pos.y + 5 + RELEASE.core.dropUp, 3);
    }
    expect(r.log.record).toEqual([]);
    expect(r.rel.state()).toBe('present');
    expect(r.log.sounds).toContain('levelUp');
    // たたく たびに ふえる
    r.boss().coreHit(2, 6);
    expect(r.log.scatter.length).toBe(RELEASE.reward.rare.length * 2);
  });

  it('たたいた ときの 中身は 同じ 世界・同じ 回なら 同じ。忍者装備は たたいた ときは 出ない', async () => {
    const a = await finishing(), b = await finishing();
    a.boss().coreHit(3, 5); b.boss().coreHit(3, 5);
    expect(a.log.scatter.map((s) => s.stacks)).toEqual(b.log.scatter.map((s) => s.stacks));
    expect(a.log.scatter.flatMap((s) => s.stacks.map((x) => x.item)).filter((i) => NINJA_IDS.includes(i))).toEqual([]);
  });

  it('コアを こわした: 実績 1 回、メッセージ、忍者装備 ＋ レア素材の 大きな 一山、少女も くずれる。状態は defeated', async () => {
    const r = await finishing();
    const before = r.log.scatter.length;
    r.boss().coreBroken();
    expect(r.rel.state()).toBe('defeated');
    expect(r.log.record).toEqual(['defeat:gashadokuro']);
    expect(r.log.say.length).toBe(1);
    expect(r.log.say[0]).toContain('がしゃどくろ');
    // 山ごとに 1 回(光の 柱が 1 本ずつ): 忍者装備 1 山（NINJA-1: まだの 物から 1 つ）＋ レア素材 3 山
    expect(r.log.scatter.length).toBe(before + 1 + RELEASE.reward.guaranteed.length + RELEASE.reward.rare.length);
    expect(r.log.scatter.slice(before).every((x) => x.stacks.length === 1)).toBe(true);
    const items = r.log.scatter.slice(before).flatMap((x) => x.stacks.map((s) => s.item));
    expect(items.filter((i) => NINJA_IDS.includes(i))).toHaveLength(1);
    for (const row of RELEASE.reward.rare) expect(items).toContain(row.item);
    expect(r.rel.info().kills).toBe(1);
    // 二重に 数えない
    r.boss().coreBroken();
    r.run(0.5);
    expect(r.log.record.length).toBe(1);
    expect(r.log.scatter.length).toBe(before + 1 + RELEASE.reward.guaranteed.length + RELEASE.reward.rare.length);
  });

  // NINJA-1（#299）§3.2・§4.2: 袋が 出た とき に テロップ用の 知らせを 1 回（出どころ gasha）。まだの 物から 1 つ、ぜんぶ 持って いれば 出ない
  it('NINJA-1: 帳に 3 つ → のこりの 1 つが 出て、袋が 出た 知らせ（dropped）が 1 回 だけ', async () => {
    const book = NINJA_IDS.filter((x) => x !== 'ninja_shozoku') as ItemId[];
    const r = await finishing({ ninja: { book, have: [] } });
    const before = r.log.scatter.length;
    r.boss().coreBroken();
    const items = r.log.scatter.slice(before).flatMap((x) => x.stacks.map((s) => s.item));
    expect(items.filter((i) => NINJA_IDS.includes(i))).toEqual(['ninja_shozoku']);
    expect(r.log.dropped).toEqual([{ item: 'ninja_shozoku', from: 'gasha' }]);
    r.boss().coreBroken(); // 二重に 出さない
    expect(r.log.dropped).toHaveLength(1);
  });

  it('NINJA-1: 4 つとも 持って いる → 忍者装備は 出ない（レア素材だけ）・知らせも なし', async () => {
    const all = NINJA_IDS as ItemId[];
    const r = await finishing({ ninja: { book: all, have: all } });
    const before = r.log.scatter.length;
    r.boss().coreBroken();
    const items = r.log.scatter.slice(before).flatMap((x) => x.stacks.map((s) => s.item));
    expect(items.filter((i) => NINJA_IDS.includes(i))).toEqual([]);
    for (const row of RELEASE.reward.rare) expect(items).toContain(row.item);
    expect(r.log.dropped).toEqual([]);
  });

  it('ドロップの 中身は 調整表(RELEASE.reward)の 1 か所: guaranteed に 行を 足すだけで、こわした 一山に 入る(忍者の 部位用)', async () => {
    const saved = RELEASE.reward.guaranteed.slice();
    try {
      RELEASE.reward.guaranteed.push({ item: 'iron_ingot', count: 2 });
      const r = await finishing();
      r.boss().coreBroken();
      const stacks = r.log.scatter.flatMap((x) => x.stacks);
      expect(stacks.filter((s) => NINJA_IDS.includes(s.item)).length).toBe(1);
      expect(stacks.find((s) => s.item === 'iron_ingot' && s.count === 2)).toBeDefined();
    } finally {
      RELEASE.reward.guaranteed.splice(0, RELEASE.reward.guaranteed.length, ...saved);
    }
  });

  it('少女が いれば: とどめで finish()、コアを こわすと crumble()', async () => {
    const r = rig({ chance: 0 });
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.boss().hold();
    r.girl.stage = 'perch';
    r.boss().kill();
    expect(r.log.finishes).toBe(1);
    expect(r.log.crumbles).toBe(0);
    r.boss().coreBroken();
    expect(r.log.crumbles).toBe(1);
    expect(r.girl.active).toBe(true); // くずれ おわる まで 少女は 生きて いる
  });

  it('くずれて 消えた 合図で 体を 片づける（idle。次の あさに また 出られる）', async () => {
    const r = await finishing();
    r.boss().coreBroken();
    r.boss().vanished();
    expect(r.rel.state()).toBe('idle');
    expect(r.boss().alive).toBe(false);
    expect(r.boss().despawns).toBe(1);
  });

  it('消える 合図が 来なくても crumble.sec ＋ safetyExtraSec で 片づける', async () => {
    const r = await finishing();
    r.boss().coreBroken();
    r.run(BIG.finish.crumble.sec);
    expect(r.rel.state()).toBe('defeated');
    r.run(RELEASE.defeat.safetyExtraSec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.boss().despawns).toBe(1);
  });

  it('コアを こわす 前に 遠く はなれたら 片づく。実績は 付かない（コアを 壊して いない）', async () => {
    const r = await finishing();
    r.player.x += RELEASE.spawn.despawnDistance + 100;
    r.run(RELEASE.spawn.checkEverySec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.log.record).toEqual([]);
  });

  it('dev: defeat() は 体力を 0 に する とどめの 流れ（すぐ 倒した ことには ならない）。体の 口が 無ければ とどめの 流れに 入るだけ', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 40 });
    r.rel.defeat();
    expect(r.boss().damaged).toEqual([{ part: 'girl', amount: 1e9 }]);
    expect(r.rel.state()).toBe('present');
    expect(r.rel.info().form).toBe('down');
    const r2 = rig();
    await r2.rel.spawn({ distance: 40 });
    (r2.rel as unknown as { handle: { damage?: unknown } }).handle.damage = undefined;
    r2.rel.defeat();
    expect(r2.rel.info().form).toBe('down');
    expect(r2.log.bgmReset).toBe(1);
  });
});

describe('保存（たおした 回数だけ。ボス本体は 保存しない。宝箱は ない）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  it('はじめは 0 回。コアを こわすと 1 ふえる。JSON に できる', async () => {
    const r = rig();
    expect(r.rel.serialize()).toEqual({ v: 2, kills: 0 });
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().kill();
    expect(r.rel.serialize()).toEqual({ v: 2, kills: 0 }); // とどめだけでは 数えない
    r.boss().coreBroken();
    expect(JSON.parse(JSON.stringify(r.rel.serialize()))).toEqual({ v: 2, kills: 1 });
  });

  it('読みこむと 回数が もどる。古い 保存(v1: 宝箱の 一覧)・こわれた データは むし(0 回)', () => {
    const r = rig();
    r.rel.deserialize({ v: 2, kills: 3 });
    expect(r.rel.info().kills).toBe(3);
    r.rel.deserialize({ v: 1, chests: [{ x: 1, y: 2, z: 3, yaw: 0, items: [{ item: 'crystal', count: 3 }] }] });
    expect(r.rel.info().kills).toBe(0);
    r.rel.deserialize({ v: 2, kills: 2.7 });
    expect(r.rel.info().kills).toBe(2);
    for (const bad of [null, undefined, 'x', 7, { kills: 'a' }, { kills: -1 }, { kills: Number.NaN }]) {
      r.rel.deserialize({ v: 2, kills: 5 });
      r.rel.deserialize(bad);
      expect(r.rel.info().kills).toBe(0);
    }
  });

  it('回数が ちがうと ごほうびの 中身の 乱数も かわる（同じ 回数なら 同じ）', async () => {
    const run = async (kills: number) => {
      const r = rig();
      r.rel.deserialize({ v: 2, kills });
      await r.rel.spawn({ distance: 40, angleDeg: 0 });
      r.boss().kill();
      r.boss().coreBroken();
      return r.log.scatter.flatMap((x) => x.stacks);
    };
    expect(await run(0)).toEqual(await run(0));
    const seen = new Set<string>();
    for (let k = 0; k < 12; k++) seen.add(JSON.stringify(await run(k)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('遠くの シルエット（体の 材料に かける）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });
  it('出した とき・置きなおした とき、体の 新しい 材料に シルエットが かかる', async () => {
    const r = rig();
    await r.rel.spawn({ distance: 200, angleDeg: 0 });
    const h = (r.rel as unknown as { handle: BossHandle }).handle;
    const mat = (g: Group) => (g.children[0] as Mesh).material as MeshBasicMaterial;
    expect(mat(h.group as Group).userData.silhouette).toBe(true);
    const first = h.group;
    await r.rel.spawn({ distance: 100, angleDeg: 90 });
    expect(h.group).not.toBe(first); // 作りなおされた 体にも
    expect(mat(h.group as Group).userData.silhouette).toBe(true);
  });
});

describe('体力 1/2（調整表 girl.hpFraction）で 少女へ（#293 まとめ）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; RELEASE.girl.hpFraction = 1 / 2; RELEASE.girl.loadHpFraction = 0.6; });

  async function fighting(over: Parameters<typeof rig>[0] = {}) {
    const r = rig({ chance: 0, ...over });
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    return r;
  }

  it('体力が 多い 間は 少女を 読みこまず、体も かくさない', async () => {
    const r = await fighting();
    r.boss().hp = 900;
    r.run(1);
    expect(r.log.girlStarts).toBe(0);
    expect(r.boss().hidden).toBe(false);
    expect(r.rel.info().form).toBe('big');
  });

  it('体力が loadHpFraction 以下に なったら 少女を 読みこんで ねかせておく（まだ 出さない）', async () => {
    const r = await fighting();
    r.boss().hp = 1000 * RELEASE.girl.loadHpFraction - 1;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    expect(r.log.girlStarts).toBe(1);
    expect(r.log.summons).toBe(0);
    expect(r.boss().hidden).toBe(false);
    r.run(3);
    expect(r.log.girlStarts).toBe(1); // 1 回だけ
  });

  it('体力が 半分（hpFraction）以下に なると 噴火を 出して 固まる(finale)。まだ 少女は 出ない。固まった しゅんかんに 少女の 登場(summon)。BGM は release では 止めない', async () => {
    const r = await fighting();
    r.boss().hp = 1000 * RELEASE.girl.hpFraction - 1;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().finales).toBe(1);
    expect(r.boss().hidden).toBe(false); // 体は かくさない(固まって その場に のこる)
    expect(r.log.summons).toBe(0);
    expect(r.rel.info().form).toBe('freeze');
    r.boss().hold();
    expect(r.log.summons).toBe(1);
    expect(r.rel.info().form).toBe('laugh');
    expect(r.log.bgmReset).toBe(0);
    r.run(5);
    expect(r.boss().finales).toBe(1); // 1 回だけ
    expect(r.log.summons).toBe(1);
    expect(r.rel.state()).toBe('present');
  });

  it('形態は 少女の 場面に したがう: laugh → orbit → pose → girl → perch', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.boss().hold();
    for (const st of ['laugh', 'orbit', 'pose', 'girl', 'perch'] as const) {
      r.girl.stage = st;
      expect(r.rel.info().form).toBe(st);
    }
    expect(r.boss().hp).toBe(200); // 体力は のこる
  });

  it('少女に わたす 口: 座る 場所は 大きな 姿の かた、当たりの 箱は 大きな 姿に 足される', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    const sp = r.girl.hooks!.perchSpot();
    expect(sp).not.toBeNull();
    expect(sp!.y).toBe(r.boss().pos.y + 30);
    const box = { name: 'girl', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] };
    r.girl.hooks!.setHitBox(box);
    expect(r.boss().girlBox).toBe(box);
    r.girl.hooks!.setHitBox(null);
    expect(r.boss().girlBox).toBeNull();
  });

  it('座って 休んでいる 間に とどめ: 少女は その場に 座りこむ(消さない)。実績は コアを こわした とき', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.boss().hold();
    r.girl.stage = 'perch';
    r.boss().kill();
    expect(r.rel.state()).toBe('present');
    expect(r.log.finishes).toBe(1);
    expect(r.log.dismisses).toBe(0);
    expect(r.log.record).toEqual([]);
    expect(r.log.bgmReset).toBe(1);
    r.boss().coreBroken();
    expect(r.rel.state()).toBe('defeated');
    expect(r.log.record).toEqual(['defeat:gashadokuro']);
  });

  it('少女の 間に 遠く はなれて 消えた: 少女も 止める。次に 出た ときは また 大きな 姿から（少女は 読みこみなおさない）', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.boss().hold();
    expect(r.girl.active).toBe(true);
    r.player.x += RELEASE.spawn.despawnDistance + 100;
    r.run(RELEASE.spawn.checkEverySec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.log.dismisses).toBe(1);
    expect(r.girl.active).toBe(false);
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    expect(r.rel.info().form).toBe('big');
    expect(r.boss().hp).toBe(1000);
    r.run(3);
    expect(r.log.summons).toBe(1);
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().finales).toBe(1);
    r.boss().hold();
    expect(r.log.summons).toBe(2);
    expect(r.log.girlStarts).toBe(1);
  });

  it('ちょうど hpFraction でも かわる。たおした（0）後は かわらない', async () => {
    const r = await fighting();
    r.boss().hp = 1000 * RELEASE.girl.hpFraction;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().finales).toBe(1);
    const r2 = await fighting();
    r2.boss().kill();
    r2.run(RELEASE.spawn.checkEverySec + 0.2);
    await r2.settle();
    expect(r2.boss().finales).toBe(0);
    expect(r2.log.summons).toBe(0);
    expect(r2.rel.info().form).toBe('down');
  });

  it('少女が 読みこみ おわる まで 固めない（読めたら かわる）', async () => {
    const r = await fighting({ hold: true });
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec * 3);
    await r.settle();
    expect(r.boss().finales).toBe(0);
    expect(r.log.summons).toBe(0);
    r.girl.gate!();
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().finales).toBe(1);
    r.boss().hold();
    expect(r.log.summons).toBe(1);
  });

  it('少女の しくみが 無い（startGirl なし）ときは そのまま 大きな 姿で たたかう', async () => {
    const r = await fighting({ noGirl: true });
    r.boss().hp = 10;
    r.run(RELEASE.spawn.checkEverySec * 3);
    await r.settle();
    expect(r.boss().finales).toBe(0);
    expect(r.rel.info().form).toBe('big');
  });

  it('調整表: girl.hpFraction を かえると きりかわる 体力が かわる', async () => {
    RELEASE.girl.hpFraction = 0.3;
    const r = await fighting();
    r.boss().hp = 280;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().finales).toBe(1);
    r.boss().hold();
    expect(r.log.summons).toBe(1);
  });
});
