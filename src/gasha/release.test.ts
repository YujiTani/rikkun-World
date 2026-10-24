import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Scene } from 'three';
import { hazePatch } from '../proto/gashaBig';
import type { ItemStack } from '../contracts';
import type { GashaBigDeps } from '../proto/gashaBig';
import { createGashaRelease, type BossHandle, type DepsWrap, type ReleaseEnv } from './release';
import { RELEASE } from './releaseTuning';

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
    places: 0,
    despawns: 0,
    /** 体力 0 に なった（gashaBig.ts の onUpdate が onDefeated を 呼ぶ） */
    kill() { boss.hp = 0; wrapped.onDefeated?.(); },
    place(at: { x: number; z: number; yawDeg?: number }) {
      const { x, z } = at;
      boss.pos = { x, y: (wrapped.placeGroundY ?? wrapped.groundY)(Math.floor(x), Math.floor(z)) + 1, z };
      boss.yawDeg = at.yawDeg ?? 0;
      boss.hp = 1000;
      boss.alive = true;
      boss.hidden = false;
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
    hide: (on) => { boss.hidden = on; },
    tired: (sec) => { boss.tiredSec = sec ?? 0; },
    hp: () => boss.hp,
    maxHp: () => 1000,
    angry: (on) => { boss.angry = on; },
    walk: (on) => { boss.walking = on; },
    info: () => ({ pos: [boss.pos.x, boss.pos.y, boss.pos.z] }),
  };
  return { boss, handle };
}

function rig(over: { chance?: number; enabled?: boolean; noGirl?: boolean; hold?: boolean } = {}) {
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
    girlStarts: 0,
    summons: 0,
    dismisses: 0,
  };
  /** 少女の まね（読みこみを 待たせる ことも できる）。hooks = 大きな 姿に もどる / 少女が また 出る 前 */
  const girl = {
    hooks: null as null | { onBigReturn(restSec: number): void; onBigLeave(): void },
    active: false,
    gate: null as null | (() => void),
    hold: false,
  };
  const scene = new Group() as unknown as Scene;
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
    scene,
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
        dismiss: () => { log.dismisses++; girl.active = false; },
        active: () => girl.active,
      };
    },
    scatter: (at, stacks) => { log.scatter.push({ at: { ...at }, stacks }); },
    record: (key) => { log.record.push(key); },
    say: (t) => { log.say.push(t); },
    bgmReset: () => { log.bgmReset++; },
    sound: (n) => { log.sounds.push(n); },
    showBar: (on) => { log.bar.push(on); },
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

describe('たおした ごほうび', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  async function defeated() {
    const r = rig();
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.boss().kill(); // 体力 0 の 通知（onDefeated）
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

  it('lingerSec たつと 体は 片づけられ（消え）、宝箱は のこる', async () => {
    const r = await defeated();
    r.run(RELEASE.defeat.lingerSec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.boss().alive).toBe(false);
    expect(r.boss().despawns).toBe(1);
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

describe('あけていない 宝箱の 保存（ボス本体は 保存しない）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; });

  async function withChest() {
    const r = rig();
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    r.rel.defeat();
    r.run(RELEASE.defeat.lingerSec + 0.5);
    return r;
  }

  it('宝箱が ない 時は 空。たおすと 1 つ 入る（位置・向き・中身）。JSON に できる', async () => {
    const r0 = rig();
    expect(r0.rel.serialize()).toEqual({ v: 1, chests: [] });
    const r = await withChest();
    const d = JSON.parse(JSON.stringify(r.rel.serialize())) as { v: number; chests: { x: number; y: number; z: number; yaw: number; items: { item: string; count: number }[] }[] };
    expect(d.v).toBe(1);
    expect(d.chests.length).toBe(1);
    const c = r.rel.chests()[0]!;
    expect(d.chests[0]!.x).toBeCloseTo(c.x, 2);
    expect(d.chests[0]!.z).toBeCloseTo(c.z, 2);
    expect(d.chests[0]!.items.map((s) => s.item)).toContain('ninja_tabi');
    expect(r.rel.state()).toBe('idle'); // ボス本体は 入って いない
    expect(Object.keys(d)).toEqual(['v', 'chests']);
  });

  it('リロード: 保存を 読むと 宝箱が とじた まま 戻り（せり上がりは 飛ばす）、近づくと 同じ 中身が とびだす', async () => {
    const r1 = await withChest();
    const saved = JSON.parse(JSON.stringify(r1.rel.serialize()));
    const itemsBefore = r1.rel.chests()[0]!.items;
    const r2 = rig();
    r2.rel.deserialize(saved);
    expect(r2.rel.chests().length).toBe(1);
    expect(r2.rel.chests()[0]!.phase).toBe('closed');
    expect(r2.rel.chests()[0]!.items).toEqual(itemsBefore);
    expect(r2.env.scene.children.length).toBe(1);
    const c = r2.rel.chests()[0]!;
    r2.player.x = c.x + 2; r2.player.z = c.z; r2.player.y = c.y;
    r2.run(RELEASE.chest.openSec + 1);
    expect(r2.log.scatter.length).toBe(1);
    expect(r2.log.scatter[0]!.stacks.map((s) => s.item)).toContain('ninja_tabi');
    // あけたら 保存から きえる
    expect(r2.rel.serialize()).toEqual({ v: 1, chests: [] });
  });

  it('あけた 宝箱は 保存しない。ひらきはじめて 中身が 出る 前なら まだ 保存する', async () => {
    const r = await withChest();
    const c = r.rel.chests()[0]!;
    r.player.x = c.x + 2; r.player.z = c.z; r.player.y = c.y;
    r.run(RELEASE.chest.dropDelaySec / 2); // ひらきはじめた ところ（中身は まだ）
    expect(r.rel.chests()[0]!.phase).toBe('opening');
    expect(r.log.scatter.length).toBe(0);
    expect((r.rel.serialize() as { chests: unknown[] }).chests.length).toBe(1);
    r.run(RELEASE.chest.openSec + 1);
    expect(r.log.scatter.length).toBe(1);
    expect((r.rel.serialize() as { chests: unknown[] }).chests.length).toBe(0);
  });

  it('読みなおすと いまの 宝箱は 入れかわる（ふえない）。こわれた データ・知らない アイテムは むし', async () => {
    const r1 = await withChest();
    const saved = JSON.parse(JSON.stringify(r1.rel.serialize()));
    const r2 = rig();
    r2.rel.deserialize(saved);
    r2.rel.deserialize(saved);
    expect(r2.rel.chests().length).toBe(1);
    expect(r2.env.scene.children.length).toBe(1);
    r2.rel.deserialize(null);
    r2.rel.deserialize('x');
    r2.rel.deserialize({ v: 1, chests: [{ x: 'a' }, null, { x: 1, y: 2, z: 3, yaw: 0, items: [{ item: 'no_such_item', count: 2 }, { item: 'crystal', count: 3 }] }] });
    expect(r2.rel.chests().map((c) => c.items)).toEqual([['crystalx3']]);
    r2.rel.deserialize({ v: 1, chests: [{ x: 1, y: 2, z: 3, yaw: 0, items: [{ item: 'no_such_item', count: 1 }] }] });
    expect(r2.rel.chests().length).toBe(0); // 中身が ぜんぶ 無効なら 出さない
    expect(r2.env.scene.children.length).toBe(0);
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

describe('体力 1/3 で 少女へ（#293 まとめ）', () => {
  afterEach(() => { RELEASE.spawn.chancePerMorning = 0.3; RELEASE.girl.hpFraction = 1 / 3; RELEASE.girl.loadHpFraction = 0.6; });

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

  it('体力が 1/3 以下に なると 大きな 姿を かくして 少女を 出す（1 回だけ）。BGM は 止めない', async () => {
    const r = await fighting();
    r.boss().hp = 1000 / 3 - 1;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().hidden).toBe(true);
    expect(r.log.summons).toBe(1);
    expect(r.rel.info().form).toBe('girl');
    expect(r.log.bgmReset).toBe(0);
    r.run(5);
    expect(r.log.summons).toBe(1);
    expect(r.rel.state()).toBe('present');
  });

  it('ちょうど 1/3 でも かわる。たおした（0）後は かわらない', async () => {
    const r = await fighting();
    r.boss().hp = 1000 / 3;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.log.summons).toBe(1);
    const r2 = await fighting();
    r2.boss().kill();
    r2.run(RELEASE.spawn.checkEverySec + 0.2);
    await r2.settle();
    expect(r2.log.summons).toBe(0);
    expect(r2.rel.state()).toBe('defeated');
  });

  it('少女が 読みこみ おわる まで 大きな 姿は かくさない（読めたら かわる）', async () => {
    const r = await fighting({ hold: true });
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec * 3);
    await r.settle();
    expect(r.boss().hidden).toBe(false);
    expect(r.log.summons).toBe(0);
    r.girl.gate!();
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().hidden).toBe(true);
    expect(r.log.summons).toBe(1);
  });

  it('少女の 5 回が おわって 大きな 姿に もどる: 体が 出て 2 分 休む。休みが おわると また かくれて 少女', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.boss().hidden).toBe(true);
    r.girl.hooks!.onBigReturn(120);
    expect(r.boss().hidden).toBe(false);
    expect(r.boss().tiredSec).toBe(120);
    expect(r.rel.info().form).toBe('rest');
    r.run(5);
    expect(r.log.summons).toBe(1); // 休み中は 少女を また 出さない（少女の 係が 2 分 数える）
    r.girl.hooks!.onBigLeave();
    expect(r.boss().hidden).toBe(true);
    expect(r.rel.info().form).toBe('girl');
    expect(r.boss().hp).toBe(200); // 体力は のこる
    expect(r.log.summons).toBe(1); // 2 回目の 出番は 少女の 係が 自分で はじめる
  });

  it('休み中に たおした: 少女を 止めて 宝箱・実績', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    r.girl.hooks!.onBigReturn(120);
    r.boss().kill();
    expect(r.rel.state()).toBe('defeated');
    expect(r.log.dismisses).toBe(1);
    expect(r.log.record).toEqual(['defeat:gashadokuro']);
    expect(r.log.bgmReset).toBe(1);
    expect(r.rel.chests().length).toBe(1);
  });

  it('少女の 間に 遠く はなれて 消えた: 少女も 止める。次に 出た ときは また 大きな 姿から（少女は 読みこみなおさない）', async () => {
    const r = await fighting();
    r.boss().hp = 200;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.girl.active).toBe(true);
    r.player.x += RELEASE.spawn.despawnDistance + 100;
    r.run(RELEASE.spawn.checkEverySec + 0.5);
    expect(r.rel.state()).toBe('idle');
    expect(r.log.dismisses).toBe(1);
    expect(r.girl.active).toBe(false);
    await r.rel.spawn({ distance: 40, angleDeg: 0 });
    expect(r.rel.info().form).toBe('big');
    expect(r.boss().hidden).toBe(false);
    expect(r.boss().hp).toBe(1000);
    r.run(3);
    expect(r.log.summons).toBe(1);
    r.boss().hp = 100;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.log.summons).toBe(2);
    expect(r.log.girlStarts).toBe(1);
  });

  it('少女の しくみが 無い（startGirl なし）ときは そのまま 大きな 姿で たたかう', async () => {
    const r = await fighting({ noGirl: true });
    r.boss().hp = 10;
    r.run(RELEASE.spawn.checkEverySec * 3);
    await r.settle();
    expect(r.boss().hidden).toBe(false);
    expect(r.rel.info().form).toBe('big');
  });

  it('調整表: girl.hpFraction を かえると きりかわる 体力が かわる', async () => {
    RELEASE.girl.hpFraction = 0.5;
    const r = await fighting();
    r.boss().hp = 450;
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    await r.settle();
    r.run(RELEASE.spawn.checkEverySec + 0.2);
    expect(r.log.summons).toBe(1);
  });
});
