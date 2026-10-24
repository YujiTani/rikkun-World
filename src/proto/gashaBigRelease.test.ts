import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { startGashaBig, type GashaBigDeps, type GashaBigHandle } from './gashaBig';
import { BIG_ID_BASE, type YokaiWorldLike } from './gashaBigHit';
import { TUNE as T } from './gashaBigTuning';
import type { BigSfxEnv } from './gashaBigSfx';

/** リリース用の つなぎ（#293 まとめ）: place({x, z, yawDeg})・despawn()・onDefeated・noTabi・hide(on)・maxHp() */
function rig(extra: Partial<GashaBigDeps> = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const sounds: string[] = [];
  const supp: boolean[] = [];
  let clock = 0;
  const nm = (u: string): string => u.replace(/^.*\//, '').replace(/\.(ogg|wav)$/, '');
  const sfxEnv: BigSfxEnv = { now: () => clock, play: (u) => { sounds.push(nm(u)); return 0.1; }, loop: (u) => { sounds.push('loop:' + nm(u)); return { stop: () => { sounds.push('stop:' + nm(u)); } }; } };
  const ym: YokaiWorldLike = { raycast: () => null, damage: () => 0 };
  const scene = new Scene();
  const deps: GashaBigDeps = {
    scene, camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => -1, addPlayerSolid: (fn) => { solids.push(fn); }, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: () => true,
    blockAt: (_x, y) => (y < -1 ? 'dirt' : y === -1 ? 'grass' : 'air'),
    setBlockAir: () => true,
    sfxEnv,
    hit: { yokai: () => ym },
    bgmOut: () => null,
    suppressBgm: (on) => { supp.push(on); },
    ...extra,
  };
  const solids: ((x: number, y: number, z: number) => boolean)[] = [];
  const h = startGashaBig(deps);
  h.walk(false);
  const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) { clock += 1 / 60; for (const f of ups) f(1 / 60); } };
  const bgm = () => (globalThis as unknown as { __gashaBgm: { status(): { wants: { big: boolean; girl: boolean } } } }).__gashaBgm.status();
  const pos = (): [number, number, number] => (h.info().pos as [number, number, number]);
  /** 体の マスの まうえ（体の 上に 立てる 場所） */
  const bodySpot = (): { x: number; y: number; z: number } => {
    const [bx, by, bz] = pos();
    for (let r = 0; r < 30; r += 1) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(bx + Math.cos((a / 16) * 6.283) * r), z = Math.floor(bz + Math.sin((a / 16) * 6.283) * r);
        for (let y = Math.floor(by) + 70; y >= Math.floor(by); y--) if (h.solidAt(x, y, z)) { if (!h.solidAt(x, y + 1, z) && !h.solidAt(x, y + 2, z)) return { x: x + 0.5, y: y + 1, z: z + 0.5 }; break; }
      }
    }
    throw new Error('no body spot');
  };
  return { h, st, step, sounds, supp, ym, scene, solids, bgm, pos, bodySpot, deps };
}

const anyBodyCell = (h: GashaBigHandle): boolean => {
  for (const c of h.colliders()) {
    const [cx, cy, cz] = c.center;
    if (h.solidAt(Math.floor(cx), Math.floor(cy), Math.floor(cz))) return true;
  }
  return false;
};

describe('がしゃどくろ: リリースの つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); delete (globalThis as { __gashaBgm?: unknown }).__gashaBgm; });
  afterEach(() => { vi.unstubAllGlobals(); delete (globalThis as { __gashaBgm?: unknown }).__gashaBgm; });

  it('noTabi: 起動時に 足袋を 着せない（なければ これまで どおり 1 回 着る）', () => {
    const a = vi.fn(); rig({ giveNinjaTabi: a, noTabi: true });
    expect(a).not.toHaveBeenCalled();
    const b = vi.fn(); rig({ giveNinjaTabi: b });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('place({x, z, yawDeg}): 指した 場所・向きに 体の 足もとが 来る。プレイヤーの 向きは 関係しない。体力も もどる', () => {
    const r = rig();
    r.st.yawDeg = 123;
    r.h.damage('head', 50);
    expect(r.h.hp()).toBeLessThan(r.h.maxHp());
    r.h.place({ x: 300, z: -200, yawDeg: 45 });
    const i = r.h.info() as { pos: number[]; yawDeg: number };
    expect(i.pos[0]).toBeCloseTo(300, 5);
    expect(i.pos[2]).toBeCloseTo(-200, 5);
    expect(i.yawDeg).toBeCloseTo(45, 3);
    expect(r.h.hp()).toBe(r.h.maxHp());
  });

  it('place({x, z}) は yawDeg を 省くと プレイヤーの 方を 向く。引数なしは これまで どおり プレイヤーの 前', () => {
    const r = rig();
    r.st.x = 0; r.st.z = 0;
    r.h.place({ x: 100, z: 0 });
    const y = (r.h.info() as { yawDeg: number }).yawDeg;
    // atan2(px - x, pz - z) = atan2(-100, 0) = -90 度
    expect(Math.sin((y * Math.PI) / 180)).toBeCloseTo(-1, 3);
    r.st.yawDeg = 0; // +x ではなく -z を 向く
    r.h.place();
    const p = r.pos();
    expect(p[0]).toBeCloseTo(0, 3);
    expect(p[2]).toBeCloseTo(-T.place.distance, 3);
  });

  it('maxHp(): 体力の 最大。damage で hp() は へるが maxHp() は かわらない', () => {
    const r = rig();
    expect(r.h.maxHp()).toBe(T.hit.hp);
    r.h.damage('head', 100);
    expect(r.h.maxHp()).toBe(T.hit.hp);
    expect(r.h.hp()).toBeLessThan(T.hit.hp);
  });

  it('onDefeated: 体力が 0 に なった とき 1 回だけ。つぎの place() の あと もう一度 たおせば また 1 回', () => {
    const onDefeated = vi.fn();
    const r = rig({ onDefeated });
    r.step(0.2);
    expect(onDefeated).not.toHaveBeenCalled();
    for (let i = 0; i < 200 && r.h.hp() > 0; i++) r.h.damage('head', 1000);
    expect(r.h.hp()).toBe(0);
    r.step(0.1);
    r.step(1);
    expect(onDefeated).toHaveBeenCalledTimes(1);
    r.h.place({ x: 50, z: 50 });
    r.step(0.2);
    expect(onDefeated).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 200 && r.h.hp() > 0; i++) r.h.damage('head', 1000);
    r.step(0.1);
    expect(onDefeated).toHaveBeenCalledTimes(2);
  });

  describe('despawn()', () => {
    it('体・当たりの 箱・固いマスが ぜんぶ 消え、シーンから 体が はずれる', () => {
      const r = rig();
      const g = r.h.group;
      expect(r.scene.children).toContain(g);
      expect(r.h.colliders().length).toBeGreaterThan(0);
      const spot = r.bodySpot();
      expect(r.h.solidAt(Math.floor(spot.x), Math.floor(spot.y) - 1, Math.floor(spot.z))).toBe(true);
      r.h.despawn();
      expect(r.scene.children).not.toContain(g);
      expect(r.h.colliders()).toEqual([]);
      expect(r.h.solidAt(Math.floor(spot.x), Math.floor(spot.y) - 1, Math.floor(spot.z))).toBe(false);
      expect(anyBodyCell(r.h)).toBe(false);
      // addPlayerSolid に 渡した 関数も 固いと 言わない
      expect(r.solids.some((f) => f(Math.floor(spot.x), Math.floor(spot.y) - 1, Math.floor(spot.z)))).toBe(false);
    });

    it('射線の 割りこみ（矢・パンチ）が 体に 当たらなく なる。ダメージも 受けない', () => {
      const r = rig();
      const [bx, by, bz] = r.pos();
      const org = { x: bx, y: by + 150, z: bz }, down = { x: 0, y: -1, z: 0 };
      const hit = r.ym.raycast(org, down, 200);
      expect(hit?.id).toBeGreaterThanOrEqual(BIG_ID_BASE);
      r.h.despawn();
      expect(r.ym.raycast(org, down, 200)).toBeNull();
      const hp = r.h.hp();
      r.ym.damage(BIG_ID_BASE + 0, 100, org);
      expect(r.h.hp()).toBe(hp);
    });

    it('攻撃の エフェクト・音・燃えかす・落雷が 消え、毎コマの 更新で 何も 起きない', () => {
      const r = rig();
      r.h.attack('thunder');
      r.step(1.2);
      expect(r.sounds).toContain('a5_cloud');
      r.h.despawn();
      const i = r.h.attackInfo();
      expect(i.thunder.fx).toEqual({ bolts: 0, rings: 0, warns: 0, arcs: 0, cloud: 0, flash: 0, glow: false });
      expect(i.eruption.embers).toBe(0);
      expect(i.mode).toBe('');
      expect(r.h.shock().impacts).toBe(0);
      expect(r.h.shock().inputBlocked).toBe(false);
      expect(() => r.step(2)).not.toThrow();
      expect(r.h.attackInfo().count).toBe(0);
      expect(r.h.attackInfo().thunder.count).toBe(0);
    });

    it('地面を たたいた 輪・ひるみも 消える', () => {
      const r = rig();
      r.h.attack('slam2');
      for (let i = 0; i < 600 && r.h.shock().impacts === 0; i++) r.step(0.05);
      expect(r.h.shock().impacts).toBeGreaterThan(0);
      r.h.despawn();
      const s = r.h.shock();
      expect(s.impacts).toBe(0);
      expect(s.staggerLeft).toBe(0);
      expect(s.fx.rings).toBe(0);
      expect(s.fx.dust).toBe(0);
      expect(r.h.attackInfo().fx).toEqual({ warn: false, rocks: 0, cracks: 0 });
    });

    it('BGM の 頼みを 取り下げ、そのあとの 毎コマで ふだんの BGM が もどる', () => {
      const r = rig();
      r.h.hit();
      r.step(0.1);
      expect(r.bgm().wants.big).toBe(true);
      expect(r.supp.at(-1)).toBe(true);
      r.h.despawn();
      r.step(0.1);
      expect(r.bgm().wants.big).toBe(false);
      expect(r.supp.at(-1)).toBe(false);
    });

    it('もういちど place({x, z}) で 出せる: 体力は 満タン、怒りも 消えている', () => {
      const r = rig();
      r.h.hit();
      r.h.damage('head', 100);
      r.h.despawn();
      r.h.place({ x: 80, z: 40, yawDeg: 10 });
      expect(r.h.hp()).toBe(r.h.maxHp());
      expect(r.scene.children).toContain(r.h.group);
      expect(r.h.colliders().length).toBeGreaterThan(0);
      expect(r.h.attackInfo().mode).not.toBe('');
      expect((r.h.info() as { angry: boolean }).angry).toBe(false);
    });

    it('なんども 呼んでも こわれない（出て いない ときも）', () => {
      const r = rig();
      r.h.despawn();
      expect(() => { r.h.despawn(); r.step(0.5); }).not.toThrow();
    });
  });

  describe('hide(on): 少女の 間は 体を かくす（体力・怒り・位置は そのまま）', () => {
    it('hide(true): 見えない・当たらない・固くない。hide(false) で もどる', () => {
      const r = rig();
      const g = r.h.group;
      const hpBefore = r.h.hp();
      r.h.damage('head', 30);
      const hp = r.h.hp();
      expect(hp).toBeLessThan(hpBefore);
      r.h.hide(true);
      expect(g.visible).toBe(false);
      expect(r.h.colliders()).toEqual([]);
      expect(anyBodyCell(r.h)).toBe(false);
      const [bx, by, bz] = r.pos();
      expect(r.ym.raycast({ x: bx, y: by + 150, z: bz }, { x: 0, y: -1, z: 0 }, 200)).toBeNull();
      expect(r.h.hp()).toBe(hp);
      r.h.hide(false);
      expect(g.visible).toBe(true);
      expect(r.h.colliders().length).toBeGreaterThan(0);
      expect(r.ym.raycast({ x: bx, y: by + 150, z: bz }, { x: 0, y: -1, z: 0 }, 200)?.id).toBeGreaterThanOrEqual(BIG_ID_BASE);
      expect(r.h.hp()).toBe(hp);
    });

    it('かくれて いる 間は 体が うごかない（攻撃の 回数も ふえない）。攻撃の エフェクトは 消える', () => {
      const r = rig();
      r.h.attack('thunder');
      r.step(1.2);
      r.h.hide(true);
      expect(r.h.attackInfo().thunder.fx.cloud).toBe(0);
      const before = JSON.stringify(r.h.info().pos);
      r.step(5);
      expect(JSON.stringify(r.h.info().pos)).toBe(before);
      expect(r.h.attackInfo().thunder.count).toBe(1);
    });

    it('体の 上に のっている 人は 地面に おろされる（高い所から 落ちない）', () => {
      const r = rig();
      const spot = r.bodySpot();
      r.st.x = spot.x; r.st.y = spot.y; r.st.z = spot.z;
      expect(spot.y).toBeGreaterThan(5);
      r.h.hide(true);
      expect(r.st.y).toBeCloseTo(0, 5); // groundY = -1 の 上
      expect(r.st.x).toBeCloseTo(spot.x, 5);
    });

    it('怒って いる 間の BGM は 切らさない（少女に かわる あいだ）', () => {
      const r = rig();
      r.h.hit();
      r.step(0.1);
      r.h.hide(true);
      r.step(3);
      expect(r.bgm().wants.big).toBe(true);
      r.h.hide(false);
      r.step(0.1);
      expect(r.bgm().wants.big).toBe(true);
    });

    it('かくれた まま たおされた ことには ならない（体力 0 の 通知は 出して いる 間だけ）／ hide(false) の あと tired(sec) で 休める', () => {
      const onDefeated = vi.fn();
      const r = rig({ onDefeated });
      r.h.hide(true);
      r.step(0.5);
      r.h.hide(false);
      r.h.tired(120);
      r.step(0.5);
      expect(r.h.attackInfo().mode).toBe('tired');
      expect(onDefeated).not.toHaveBeenCalled();
    });
  });
});
