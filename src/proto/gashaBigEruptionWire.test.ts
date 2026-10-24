import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';
import type { BigSfxEnv } from './gashaBigSfx';
import type { HitSources, YokaiWorldLike } from './gashaBigHit';

/** 攻撃 4「口から 火山噴火」: つなぎ（灰・予告の 影・燃え残り・植物が 燃える・体が 焼ける・ドットダメージ・音） */
function rig() {
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
    groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: (a, from) => { calls.hurt.push({ a, from: { ...from } }); return true; },
    blockAt: (x, y, z) => {
      if (removed.has(`${x},${y},${z}`)) return 'air';
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
  st.x = info.pos[0]! + Math.sin(yaw) * 70; st.z = info.pos[2]! + Math.cos(yaw) * 70; st.y = 0; // 灰の 範囲の そと
  const step = (sec: number, each?: () => void) => { for (let i = 0; i < Math.round(sec * 60); i++) { each?.(); for (const f of ups) f(1 / 60); } };
  return { h, st, calls, step, sounds, removed, pos: info.pos, src, ym };
}
const total = () => T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.5;

describe('口から 火山噴火: つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('吸いこみの 間は 風の すじと 口の 光だけ。灰は まだ。そのあと 火柱が 立って 灰が とぶ', () => {
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
    expect(i.fx.ashes).toBe(i.flying);
    expect(r.sounds).toContain('a4_erupt');
    expect(r.sounds.indexOf('a4_inhale')).toBeLessThan(r.sounds.indexOf('a4_erupt'));
  });

  it('着地の 少し 前から 予告の 影。着地すると 燃えかすが のこり、小さな 音と ぱちぱち（ループ）', () => {
    const r = rig();
    r.h.attack('eruption');
    let maxShadow = 0;
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + 2, () => { maxShadow = Math.max(maxShadow, r.h.attackInfo().eruption.fx.shadows); });
    expect(maxShadow).toBeGreaterThan(2);
    const i = r.h.attackInfo().eruption;
    expect(i.landed).toBeGreaterThan(10);
    expect(i.embers).toBe(i.landed);
    expect(r.sounds.filter((s) => s.startsWith('a4_ash')).length).toBeGreaterThan(10);
    expect(r.sounds).toContain('loop:a4_embers');
  });

  it('1 回の 噴火で count 個 ぜんぶ 降り、攻撃が おわると 怒りに もどる。燃えかすは しばらく のこって 消える', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    let i = r.h.attackInfo();
    expect(i.eruption.phase).toBe('done');
    expect(i.attack).toBeNull();
    expect(i.eruption.landed).toBe(T.eruption.ash.count);
    expect(i.eruption.flying).toBe(0);
    expect(i.eruption.embers).toBe(T.eruption.ash.count);
    r.h.angry(false);
    r.step(T.eruption.ember.sec + 1);
    i = r.h.attackInfo();
    expect(i.eruption.embers).toBe(0);
    expect(r.sounds).toContain('stop:a4_embers');
  });

  it('植物は 燃える: 灰が 落ちた 所の 草が 消える。地面（くさブロック）は のこる', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total());
    const i = r.h.attackInfo().eruption;
    expect(i.burntBlocks).toBeGreaterThan(30);
    expect(r.calls.air).toBe(i.burntBlocks);
    for (const k of r.removed) expect(k.split(',')[1]).toBe('0'); // 草（y = 0）だけ。地面（y = -1）は のこる
  });

  it('毎回 ちがう: 1 回目と 2 回目で 灰の 着地が ちがう', () => {
    const r = rig();
    r.h.attack('eruption');
    r.step(total() + 1);
    const a = r.h.eruptionEmbers().map((e) => e.x.toFixed(2) + ',' + e.z.toFixed(2)).slice(0, 8).join(';');
    r.h.attack('eruption');
    r.step(total() + 1);
    const all = r.h.eruptionEmbers();
    const b = all.slice(T.eruption.ash.count, T.eruption.ash.count + 8).map((e) => e.x.toFixed(2) + ',' + e.z.toFixed(2)).join(';');
    expect(r.h.attackInfo().eruption.count).toBe(2);
    expect(a).not.toBe(b);
    expect(all.length).toBe(2 * T.eruption.ash.count);
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

  it('灰が 当たると ダメージ（落ちる 場所に いた とき）', () => {
    const saved = { ...T.eruption.ash };
    Object.assign(T.eruption.ash, { rMin: 24, rMax: 40, count: 1500, spawnSec: 2, nearShare: 0, maxFlying: 5000 });
    try {
      const r = rig();
      const mouth = (r.h.info() as { head: number[] }).head;
      r.st.x = mouth[0]! + 30; r.st.z = mouth[2]!; r.st.y = 0;
      r.h.attack('eruption');
      r.step(T.eruption.inhaleSec + T.eruption.eruptSec + 0.5);
      r.step(4);
      expect(r.calls.hurt.some((c) => c.a === T.eruption.ash.damage)).toBe(true);
    } finally { Object.assign(T.eruption.ash, saved); }
  });

  it('体にも 降る: 体の 上に 落ちた 灰で ガラスの 雲が 割れ、こけが 焼け、時間で もどる', () => {
    const saved = { ash: { ...T.eruption.ash }, restore: T.eruption.body.restoreSec };
    Object.assign(T.eruption.ash, { rMin: 0.5, rMax: 14, count: 160 });
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
    } finally { Object.assign(T.eruption.ash, saved.ash); T.eruption.body.restoreSec = saved.restore; }
  });

  it('燃えかすは 約 5 分（300 秒）燃えつづけて、それから 消える。数が 多くても 描画の 回数は ふえない', () => {
    expect(T.eruption.ember.sec).toBe(300);
    const r = rig();
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    r.h.angry(false);
    const n0 = r.h.attackInfo().eruption.embers;
    expect(n0).toBe(T.eruption.ash.count);
    r.step(280);
    expect(r.h.attackInfo().eruption.embers).toBe(n0);
    // 描画: 炎・こげ跡は どれだけ 増えても 1 つの InstancedMesh
    const meshes: string[] = [];
    r.h.group.parent?.traverse((o) => { if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) meshes.push(o.name); });
    r.h.attack('eruption');
    r.step(T.eruption.inhaleSec + T.eruption.eruptSec + T.eruption.rainSec + 0.3);
    expect(r.h.attackInfo().eruption.embers).toBe(n0 * 2);
    const after: string[] = [];
    r.h.group.parent?.traverse((o) => { if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) after.push(o.name); });
    expect(after.length).toBe(meshes.length);
    r.h.angry(false);
    r.step(25);
    expect(r.h.attackInfo().eruption.embers).toBe(n0); // 1 回目の ぶんだけ 消える
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
