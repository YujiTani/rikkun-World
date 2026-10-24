import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';
import type { BigSfxEnv } from './gashaBigSfx';
import type { HitSources, YokaiWorldLike } from './gashaBigHit';

/** 攻撃 4「口から 火山噴火」: つなぎ（隕石・予告の 輪・落下範囲・飛び散る 炎・燃え残り・小さな 穴・植物が 燃える・体が 焼ける・ドットダメージ・音）。
 *  high = 地面を 高く（y = 4 が くさ ブロックの 地面。草は なし）して 穴が あけられる ように する */
function rig(opts: { high?: boolean } = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const calls = { hurt: [] as { a: number; from: { x: number; y: number; z: number } }[], air: 0 };
  const removed = new Set<string>();
  const sounds: string[] = [];
  const src = { blade: null as ReturnType<NonNullable<HitSources['blade']>>, waves: [] as ReturnType<NonNullable<HitSources['waves']>> | never[] };
  const ym: YokaiWorldLike = { raycast: () => null, damage: () => 0 };
  const sfxEnv: BigSfxEnv = { now: () => 0, play: (u) => { sounds.push(u.replace(/^.*\//, '').replace(/\.(ogg|wav)$/, '')); return 0.1; }, loop: (u) => { sounds.push('loop:' + u.replace(/^.*\//, '').replace(/\.wav$/, '')); return { stop: () => { sounds.push('stop:' + u.replace(/^.*\//, '').replace(/\.wav$/, '')); } }; } };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => (opts.high ? 4 : -1), addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: (a, from) => { calls.hurt.push({ a, from: { ...from } }); return true; },
    blockAt: (x, y, z) => {
      if (removed.has(`${x},${y},${z}`)) return 'air';
      if (opts.high) return y < 4 ? 'dirt' : y === 4 ? 'grass' : 'air';
      if (y < -1) return 'dirt';
      if (y === -1) return 'grass';
      if (y === 0) return 'kusa';
      return 'air';
    },
    setBlockAir: (x, y, z) => { calls.air++; removed.add(`${x},${y},${z}`); return true; },
    sfxEnv,
    hit: { blade: () => src.blade, waves: () => src.waves as never, yokai: () => ym },
  };
  const h = startGashaBig(deps);
  h.walk(false);
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  st.x = info.pos[0]! + Math.sin(yaw) * 70; st.z = info.pos[2]! + Math.cos(yaw) * 70; st.y = 0; // 隕石・火の 粉の 範囲の そと（ねらいも とどかない aimMaxDist の そと。farDist より 近い）
  const step = (sec: number, each?: () => void) => { for (let i = 0; i < Math.round(sec * 60); i++) { each?.(); for (const f of ups) f(1 / 60); } };
  return { h, st, calls, step, sounds, removed, pos: info.pos, src, ym };
}
const total = () => T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.5;
/** 1 回の 噴火で 落ちる 燃えかすの 数（隕石 1 つに 1 ＋ 飛び散った 火の 粉） */
const embersOf = (imp: { sparks: number }[]) => imp.length + imp.reduce((a, q) => a + q.sparks, 0);

describe('口から 火山噴火: つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('吸いこみの 間は 風の すじと 口の 光だけ。隕石は まだ。そのあと 火柱が 立って 隕石が とぶ（岩・光の かさ・炎の 尾）', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec * 0.8);
    let i = r.h.attackInfo().eruption;
    expect(i.phase).toBe('inhale');
    expect(i.fx.wind).toBeGreaterThan(5);
    expect(i.fx.column).toBe(false);
    expect(i.flying).toBe(0);
    expect(r.sounds).toContain('a4_inhale');
    r.step(T.eruption.inhaleSec * 0.2 + 0.8);
    i = r.h.attackInfo().eruption;
    expect(i.phase).toBe('erupt');
    expect(i.fx.column).toBe(true);
    expect(i.fx.wind).toBe(0);
    expect(i.flying).toBeGreaterThan(3);
    expect(i.fx.meteors).toBe(i.flying);
    expect(i.fx.trails).toBeGreaterThan(i.flying); // 1 つに 何まいも 尾の 板
    expect(r.sounds).toContain('a4_erupt');
    expect(r.sounds.indexOf('a4_inhale')).toBeLessThan(r.sounds.indexOf('a4_erupt'));
  });

  it('着地の 少し 前から 予告の 赤い 輪。着地すると 輪・光・かけら、燃えかすと 飛び散る 火の 粉。重い ドンと 小さな ぱちっ、ぱちぱち（ループ）', () => {
    const r = rig();
    r.h.attack('eruption');
    let maxWarn = 0, maxSparks = 0, maxRings = 0, maxDebris = 0;
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + 2, () => {
      const f = r.h.attackInfo().eruption.fx;
      maxWarn = Math.max(maxWarn, f.warns); maxSparks = Math.max(maxSparks, f.sparks); maxRings = Math.max(maxRings, f.rings); maxDebris = Math.max(maxDebris, f.debris);
    });
    expect(maxWarn).toBeGreaterThan(5);
    expect(maxSparks).toBeGreaterThan(5);
    expect(maxRings).toBeGreaterThan(2);
    expect(maxDebris).toBeGreaterThan(10);
    const i = r.h.attackInfo().eruption;
    expect(i.landed).toBeGreaterThan(10);
    const imp = r.h.eruptionImpacts();
    expect(imp.length).toBe(i.landed);
    expect(i.embers).toBe(embersOf(imp) - i.sparks); // とんで いる 火の 粉は まだ 燃えかすに なって いない
    expect(r.sounds.filter((s) => s.startsWith('step_slam')).length).toBeGreaterThan(5); // 隕石の ドン（同時 上限つき）
    expect(r.sounds.filter((s) => s.startsWith('a4_ash')).length).toBeGreaterThan(10);
    expect(r.sounds).toContain('loop:a4_embers');
  });

  it('1 回の 噴火で count 個 ぜんぶ 降り、火の 粉も ぜんぶ 落ち、攻撃が おわると 怒りに もどる。燃えかすは しばらく のこって 消える', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    let i = r.h.attackInfo();
    expect(i.eruption.phase).toBe('done');
    expect(i.attack).toBeNull();
    expect(i.eruption.landed).toBe(T.eruption.meteor.count);
    expect(i.eruption.flying).toBe(0);
    expect(i.eruption.sparks).toBe(0);
    const imp = r.h.eruptionImpacts();
    for (const q of imp) { expect(q.sparks).toBeGreaterThanOrEqual(T.eruption.splash.min); expect(q.sparks).toBeLessThanOrEqual(T.eruption.splash.max); }
    expect(i.eruption.embers).toBe(Math.min(T.eruption.ember.max, embersOf(imp)));
    expect(i.eruption.embers).toBeGreaterThan(T.eruption.meteor.count * (1 + T.eruption.splash.min) * 0.95);
    r.h.angry(false);
    r.step(T.eruption.ember.sec + 1);
    i = r.h.attackInfo();
    expect(i.eruption.embers).toBe(0);
    expect(r.sounds).toContain('stop:a4_embers');
  }, 60000); // 燃えかすが 消える まで 300 秒ぶん 進める

  it('植物は 燃える: 隕石・火の 粉が 落ちた 所の 草が 消える。地面（くさブロック。y = 0 は 岩盤の かわりで 穴も あかない）は のこる', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    const i = r.h.attackInfo().eruption;
    expect(i.burntBlocks).toBeGreaterThan(30);
    expect(i.craterBlocks).toBe(0);
    expect(r.calls.air).toBe(i.burntBlocks);
    for (const k of r.removed) expect(k.split(',')[1]).toBe('0'); // 草（y = 0）だけ。地面（y = -1）は のこる
  });

  it('毎回 ちがう: 1 回目と 2 回目で 隕石の 着地が ちがう。燃えかすは 上限まで たまり、こえた ぶんは 古い 順に 消える', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total() + 1);
    const imp1 = r.h.eruptionImpacts(), n1 = r.h.attackInfo().eruption.embers;
    const a = imp1.map((e) => e.x.toFixed(2) + ',' + e.z.toFixed(2)).slice(0, 8).join(';');
    const firstIds = new Set(r.h.eruptionEmbers().map((e) => e.id));
    r.h.attack('eruption');
    r.step(total() + 1);
    const imp2 = r.h.eruptionImpacts();
    const b = imp2.map((e) => e.x.toFixed(2) + ',' + e.z.toFixed(2)).slice(0, 8).join(';');
    expect(r.h.attackInfo().eruption.count).toBe(2);
    expect(a).not.toBe(b);
    const all = r.h.eruptionEmbers();
    expect(all.length).toBe(Math.min(T.eruption.ember.max, n1 + embersOf(imp2)));
    const keptFirst = all.filter((e) => firstIds.has(e.id)).length;
    expect(keptFirst).toBe(all.length - embersOf(imp2)); // 消えたのは 1 回目（古い）の ほう
  });

  it('燃えかすに 触れて いる 間 ドットダメージ（間かくごと）。はなれれば 受けない', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    const e = r.h.eruptionEmbers().find((q) => !q.body)!;
    r.calls.hurt.length = 0;
    r.st.x = e.x; r.st.z = e.z; r.st.y = e.y;
    r.step(3);
    const n = r.calls.hurt.length;
    expect(n).toBeGreaterThanOrEqual(Math.floor(3 / T.eruption.ember.dotEverySec) - 1);
    expect(r.calls.hurt[0]!.a).toBe(T.eruption.ember.dotDamage);
    r.st.x = e.x + 200; r.calls.hurt.length = 0;
    r.step(2);
    expect(r.calls.hurt.length).toBe(0);
  });

  it('落下範囲: 隕石が 落ちた 点の radius いないに いると ダメージ（着地点から はじく）。ねらいが あるので 止まって いると 当たる', () => {
    const r = rig();
    const mouth = (r.h.info() as { head: number[] }).head;
    r.st.x = mouth[0]! + 30; r.st.z = mouth[2]!; r.st.y = 0;
    r.h.attack('eruption');
    r.step(total());
    const i = r.h.attackInfo().eruption;
    expect(i.aimed).toBeGreaterThan(T.eruption.meteor.count * T.eruption.meteor.aimShare * 0.5);
    expect(i.meteorHurts).toBeGreaterThan(0);
    const hits = r.calls.hurt.filter((c) => c.a === T.eruption.meteor.damage);
    expect(hits.length).toBe(i.meteorHurts);
    const imp = r.h.eruptionImpacts();
    for (const h of hits) {
      expect(Math.hypot(h.from.x - r.st.x, h.from.z - r.st.z)).toBeLessThanOrEqual(T.eruption.meteor.radius + 1e-6); // はじく 向きの もと = 着地点（範囲の 中）
      expect(imp.some((q) => q.x === h.from.x && q.z === h.from.z)).toBe(true);
    }
  });

  it('落下範囲の 外では 隕石の ダメージ 0（遠くに いる）', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    expect(r.h.attackInfo().eruption.meteorHurts).toBe(0);
    expect(r.calls.hurt.filter((c) => c.a === T.eruption.meteor.damage).length).toBe(0);
  });

  it('地面に 小さな 穴: 隕石の 着地点の いちばん 上の だんが こわれる（1 つ crater.max マス まで）。燃えかすは 穴の 底へ', () => {
    const r = rig({ high: true });
    r.h.attack('eruption');
    r.step(total());
    const i = r.h.attackInfo().eruption;
    const imp = r.h.eruptionImpacts().filter((q) => !q.body);
    expect(i.craterBlocks).toBeGreaterThan(imp.length);
    expect(i.craterBlocks).toBeLessThanOrEqual(imp.length * T.eruption.crater.max);
    const cr = [...r.removed].map((k) => k.split(',').map(Number) as [number, number, number]).filter((c) => c[1] === 4);
    expect(cr.length).toBe(i.craterBlocks);
    for (const [x, , z] of cr) expect(imp.some((q) => Math.hypot(x + 0.5 - q.x, z + 0.5 - q.z) <= T.eruption.crater.radius + 1e-6)).toBe(true);
    const low = r.h.eruptionEmbers().filter((e) => !e.body && Math.abs(e.y - 4) < 1e-6).length;
    expect(low).toBeGreaterThan(imp.length * 0.5);
  });

  it('体にも 降る: 体の 上に 落ちた 隕石で ガラスの 雲が 割れ、こけが 焼け、時間で もどる', () => {
    const saved = { ash: { ...T.eruption.meteor }, restore: T.eruption.body.restoreSec };
    Object.assign(T.eruption.meteor, { rMin: 0.5, rMax: 14, count: 160, maxFlying: 200 });
    T.eruption.body.restoreSec = 4;
    try {
      const r = rig();
      r.h.attack('eruption');
      r.step(T.eruption.inhaleSec + T.eruption.eruptSec + 5);
      const i = r.h.attackInfo().eruption;
      expect(i.onBody).toBeGreaterThan(5);
      expect(i.mossHidden + i.glassBroken).toBeGreaterThan(0);
      r.step(T.eruption.body.restoreSec + 2);
      expect(r.h.attackInfo().eruption.mossHidden).toBe(0);
    } finally { Object.assign(T.eruption.meteor, saved.ash); T.eruption.body.restoreSec = saved.restore; }
  });

  it('燃えかすは 約 5 分（300 秒）燃えつづけて、それから 消える。数が 多くても 描画の 回数は ふえない', () => {
    expect(T.eruption.ember.sec).toBe(300);
    const r = rig();
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    r.h.angry(false);
    const n0 = r.h.attackInfo().eruption.embers;
    expect(n0).toBe(embersOf(r.h.eruptionImpacts()));
    r.step(280);
    expect(r.h.attackInfo().eruption.embers).toBe(n0);
    // 描画: 炎・こげ跡は どれだけ 増えても 1 つの InstancedMesh
    const meshes: string[] = [];
    r.h.group.parent?.traverse((o) => { if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) meshes.push(o.name); });
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    const n2 = embersOf(r.h.eruptionImpacts());
    expect(r.h.attackInfo().eruption.embers).toBe(Math.min(T.eruption.ember.max, n0 + n2));
    const after: string[] = [];
    r.h.group.parent?.traverse((o) => { if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) after.push(o.name); });
    expect(after.length).toBe(meshes.length);
    r.h.angry(false);
    r.step(25);
    expect(r.h.attackInfo().eruption.embers).toBe(n2); // 1 回目の ぶんだけ 消える
  }, 60000);

  it('刀を 当てると 燃えかすが 消える（小さな 煙と 音）。当てなかった 燃えかすは のこる', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    const list = r.h.eruptionEmbers().filter((e) => !e.body);
    const e = list[0]!, n0 = r.h.attackInfo().eruption.embers;
    r.sounds.length = 0;
    r.src.blade = { shape: { kind: 'capsule', from: { x: e.x, y: e.y + 0.4, z: e.z }, to: { x: e.x + 0.3, y: e.y + 0.4, z: e.z }, radius: 0.4 }, damage: 1, swing: 'a', frame: 1 };
    r.step(0.1);
    r.src.blade = null;
    const i = r.h.attackInfo().eruption;
    expect(i.embers).toBeLessThan(n0);
    expect(i.embers).toBeGreaterThan(n0 - 20); // 当てた 近くだけ
    expect(i.doused).toBe(n0 - i.embers);
    expect(i.fx.smoke).toBeGreaterThan(0);
    expect(r.sounds.length).toBeGreaterThan(0);
    const still = r.h.eruptionEmbers();
    expect(still.some((q) => Math.hypot(q.x - e.x, q.z - e.z) < 0.3 && Math.abs(q.y - e.y) < 0.3)).toBe(false);
  });

  it('真空波・らせん（飛ぶ 波）でも 消える。ドームは 範囲ぜんぶ', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    const e = r.h.eruptionEmbers().find((q) => !q.body)!, n0 = r.h.attackInfo().eruption.embers;
    r.src.waves = [{ id: 1, position: { x: e.x, y: e.y + 0.5, z: e.z }, radius: 1, damage: 1 }];
    r.step(0.1);
    r.src.waves = [];
    expect(r.h.attackInfo().eruption.embers).toBeLessThan(n0);
  });

  it('パンチ・矢（妖怪への 線の 当たり）でも 消える: 線が 燃えかすに 当たり、ダメージが 来ると 消える', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    r.step(0.1); // 線の 当たりへの 割りこみを つける
    const e = r.h.eruptionEmbers().find((q) => !q.body)!, n0 = r.h.attackInfo().eruption.embers;
    const o = { x: e.x, y: e.y + 3, z: e.z };
    const hit = r.ym.raycast(o, { x: 0, y: -1, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeGreaterThan(1.2);
    expect(hit!.distance).toBeLessThan(3);
    r.ym.damage(hit!.id, 2, o);
    expect(r.h.attackInfo().eruption.embers).toBe(n0 - 1);
    // はずれた 線は 何にも 当たらない
    expect(r.ym.raycast({ x: e.x + 40, y: e.y + 3, z: e.z + 40 }, { x: 0, y: -1, z: 0 }, 10)).toBeNull();
  });
});
