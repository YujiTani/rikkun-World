import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CombatEvent, DayPhase, YokaiEvent } from '../contracts';
import { BlockDoll } from '../camera/BlockDoll';
import { BagVisuals } from './bagVisuals';
import { sparkleCount } from './dropSparkle';
import { CombatFx, type CombatFxDeps } from './combatFx';
import { COMBAT_FX, bagPose, edgeOpacity, invincibleAlpha } from './combatFxModel';
import { COMBAT_SOUNDS } from './combatSounds';
import { FX_SETTINGS } from './config';

describe('計算', () => {
  it('ふちのピンクは 0.25 まで・0.4 秒で消える・1 回だけ', () => {
    expect(edgeOpacity(0)).toBe(0);
    expect(edgeOpacity(0.2)).toBeCloseTo(0.25);
    expect(edgeOpacity(0.4)).toBe(0);
    let peak = 0;
    for (let t = 0; t < 0.4; t += 1 / 60) peak = Math.max(peak, edgeOpacity(t));
    expect(peak).toBeLessThanOrEqual(0.25);
  });
  it('むてきの点滅: ハートをうけた直後からうすく、1 秒に 3 回未満の切りかえ', () => {
    const thin = COMBAT_FX.invincibleThinAlpha;
    expect(invincibleAlpha(0)).toBe(1);
    expect(invincibleAlpha(30)).toBe(thin);
    let changes = 0;
    for (let left = 30; left > 1; left--) if (invincibleAlpha(left) !== invincibleAlpha(left - 1)) changes++;
    expect(changes).toBeGreaterThanOrEqual(1); // 0.5 秒のあいだに、うすい → ふつうに戻る
    // 60 ステップ（1 秒）のあいだの「うすい→ふつう」の回数は 3 回未満
    let flashes = 0;
    for (let left = 180; left > 120; left--) if (invincibleAlpha(left) === thin && invincibleAlpha(left - 1) === 1) flashes++;
    expect(flashes).toBeLessThan(3);
  });
  it('ふくろは 2 秒で上下 0.1・4 秒で 1 回転・のこり 30 秒から光が強弱', () => {
    expect(bagPose(0.375, 36000).y).toBeCloseTo(COMBAT_FX.bag.lift + 0.08);
    expect(bagPose(4, 36000).spin).toBeCloseTo(Math.PI * 2);
    expect(bagPose(0.25, 36000).glow).toBe(1);
    expect(bagPose(0.25, 1800).glow).toBeCloseTo(1);
    expect(bagPose(0.75, 1800).glow).toBeLessThan(0.4 + 0.3);
  });
  it('音は M3 の 11 こ + 落とし物の着地 4 こ。すべて短く小さい', () => {
    const names = Object.keys(COMBAT_SOUNDS);
    expect(names).toHaveLength(15);
    for (const tones of Object.values(COMBAT_SOUNDS)) {
      for (const t of tones) {
        expect(t.gain).toBeLessThanOrEqual(0.7);
        expect(t.delay + t.dur).toBeLessThan(1.1);
      }
    }
  });
});

describe('BagVisuals', () => {
  const it1 = (id: number, x: number, count = 1, item: 'dirt' | 'stone' = 'dirt', batch = 1, rarity: 'common' | 'rare' | 'superRare' = 'common') => ({
    id,
    batch,
    rarity,
    position: { x, y: 9, z: 2 },
    slots: [{ item, count }],
    ticksLeft: 100,
  });
  it('アイテムの数に合わせて出したり消したり。光の柱は かたまりに 1 本で 10 ブロック', () => {
    const scene = new THREE.Scene();
    const v = new BagVisuals(scene);
    v.update(1 / 60, [it1(1, 1)]);
    expect(v.count()).toBe(1);
    v.update(1 / 60, [it1(1, 1), it1(2, 2, 5, 'stone')]);
    expect(v.count()).toBe(2);
    expect(v.pillarCount()).toBe(1);
    v.update(1 / 60, [it1(1, 1), it1(2, 40, 1, 'dirt', 2)]);
    expect(v.pillarCount()).toBe(2);
    const box = new THREE.Box3().setFromObject(v.group);
    expect(box.max.y - 9).toBeGreaterThanOrEqual(10);
    v.update(1 / 60, []);
    expect(v.count()).toBe(0);
    expect(v.pillarCount()).toBe(0);
  });
  it('柱の太さ・色はめずらしさごと。むらさきは星形のつぶとにじ色', () => {
    const v = new BagVisuals(new THREE.Scene());
    v.update(1 / 60, [it1(1, 1, 1, 'dirt', 1, 'rare'), it1(2, 2, 1, 'dirt', 1, 'rare')]);
    expect(v.pillarCount()).toBe(1);
    const pillar = () => v.group.children.find((c) => (c as THREE.Mesh).geometry?.type === 'BoxGeometry' && (c as THREE.Mesh).visible && ((c as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.height === 10) as THREE.Mesh;
    const pts = () => v.group.children.filter((c) => c.type === 'Points') as THREE.Points[];
    const drawn = (i: number) => pts()[i]!.geometry.drawRange.count;
    const col = (pillar().material as THREE.MeshBasicMaterial).color.getHex();
    const wRare = pillar().scale.x;
    expect(drawn(0)).toBe(sparkleCount('rare'));
    expect(drawn(1)).toBe(0);
    v.update(1 / 60, [it1(1, 1, 1, 'dirt', 1, 'superRare')]);
    expect((pillar().material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(col);
    expect(pillar().scale.x).toBeGreaterThan(wRare);
    expect(drawn(1)).toBe(sparkleCount('superRare'));
    const h0 = (pillar().material as THREE.MeshBasicMaterial).color.getHex();
    for (let i = 0; i < 120; i++) v.update(1 / 60, [it1(1, 1, 1, 'dirt', 1, 'superRare')]);
    expect((pillar().material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(h0);
    v.update(1 / 60, [it1(1, 1, 1, 'dirt', 1, 'common')]);
    expect(drawn(1)).toBe(0);
    expect(drawn(0)).toBe(sparkleCount('common'));
  });
  it('着地: 光の輪が出て、音は 1 フレームに いちばんめずらしい 1 つだけ', () => {
    const calls: string[] = [];
    const v = new BagVisuals(new THREE.Scene(), (r) => calls.push(r));
    const air = (id: number, r: 'common' | 'rare') => ({ ...it1(id, id, 1, 'dirt', 1, r), resting: false });
    v.update(1 / 60, [air(1, 'common'), air(2, 'rare')]);
    expect(v.ringCount()).toBe(0);
    expect(calls).toEqual([]);
    v.update(1 / 60, [it1(1, 1), it1(2, 2, 1, 'dirt', 1, 'rare')]);
    expect(calls).toEqual(['rare']);
    expect(v.ringCount()).toBe(2);
    v.update(1 / 60, [it1(1, 1), it1(2, 2, 1, 'dirt', 1, 'rare')]);
    expect(calls).toHaveLength(1);
  });
  it('50 こ落ちても 描画物は ふえない（柱以外 +6 まで）', () => {
    const v = new BagVisuals(new THREE.Scene());
    const bags = Array.from({ length: 50 }, (_, i) => it1(i + 1, i * 0.5, 1, 'dirt', 1, 'superRare'));
    v.update(1 / 60, bags);
    const drawCalls = v.group.children.filter((c) => c.type === 'Points' || c.type === 'InstancedMesh').length;
    expect(drawCalls).toBeLessThanOrEqual(6);
  });
  it('数が 2 こ以上なら板をかさねる', () => {
    const v = new BagVisuals(new THREE.Scene());
    v.update(1 / 60, [it1(1, 1, 1), it1(2, 1, 3)]);
    const [a, b] = v.group.children.filter((c) => c.children.length > 0 && c.children[0]!.children.length > 0);
    expect(a!.children[0]!.children).toHaveLength(1);
    expect(b!.children[0]!.children).toHaveLength(2);
  });
});

describe('人形（たおれる・うすい・パンチ・ようかいだま）', () => {
  it('ようかいだま を持つと玉を出し、ブロックの形は出さない', () => {
    const d = new BlockDoll();
    d.setMode('third');
    d.setHeld('yokai_orb');
    const p = new THREE.Vector3();
    expect(d.heldWorldPosition(p)).not.toBeNull();
    d.setHeld('dirt');
    expect(d.heldItem).toBe('dirt');
    d.setHeld(null);
    expect(d.heldWorldPosition(p)).toBeNull();
    d.dispose();
  });
  it('たおれる・うすくする・パンチ', () => {
    const d = new BlockDoll();
    d.setMode('third');
    d.update(1 / 60, { x: 0, y: 9, z: 0 }, 0, 0, false);
    expect(d.group.rotation.z).toBe(0);
    d.setFallen(1);
    d.update(1 / 60, { x: 0, y: 9, z: 0 }, 0, 0, false);
    expect(d.group.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(d.group.position.y).toBeGreaterThan(9);
    d.setFallen(0);
    d.setAlpha(0.4);
    expect(d.opacity).toBe(0.4);
    d.setAlpha(1);
    d.punch();
    d.update(0.125, { x: 0, y: 9, z: 0 }, 0, 0, false);
    expect(Math.abs(d.armAngle)).toBeLessThan(1); // うで角度は歩きの値。パンチは別に曲げる
    d.dispose();
  });
});

describe('CombatFx（出来事 → 音・画面）', () => {
  function setup() {
    const calls: string[] = [];
    const tones: number[] = [];
    let combatEvents: CombatEvent[] = [];
    let yokaiEvents: YokaiEvent[] = [];
    let dead = false;
    let inv = 0;
    let phaseFn: (p: DayPhase) => void = () => {};
    const shakes: Array<[number, number]> = [];
    const deps: CombatFxDeps = {
      scene: new THREE.Scene(),
      sound: {
        play: (n) => void calls.push('play:' + n),
        playTones: (t) => void tones.push(t[0].f0),
      },
      combat: {
        hp: () => 20,
        maxHp: () => 20,
        dead: () => dead,
        invincibleTicks: () => inv,
        drainEvents: () => {
          const e = combatEvents;
          combatEvents = [];
          return e;
        },
      },
      yokai: {
        drainEvents: () => {
          const e = yokaiEvents;
          yokaiEvents = [];
          return e;
        },
      },
      time: {
        phase: () => 'day',
        onPhaseChange: (fn) => {
          phaseFn = fn;
          return () => {};
        },
      },
      bags: () => [],
      doll: {
        punch: () => void calls.push('punch'),
        setAlpha: (a) => void calls.push('alpha:' + a),
        setFallen: (k) => void calls.push('fallen:' + k.toFixed(2)),
      },
      view: { setShake: (y, p) => void shakes.push([y, p]) },
      hearts: { update: (_dt, hp, i) => void calls.push(`hearts:${hp}:${i}`) },
      deathScreen: { start: () => void calls.push('death'), end: () => void calls.push('respawnScreen'), update: () => {} },
      homeNotice: { show: () => void calls.push('home'), update: () => {} },
      edge: { flash: () => void calls.push('edge'), update: () => {} },
      clock: { set: (p) => void calls.push('clock:' + p) },
      onPickup: (item, n) => void calls.push(`pickup:${item}:${n}`),
      settings: { ...FX_SETTINGS },
    };
    const fx = new CombatFx(deps);
    return {
      fx,
      calls,
      tones,
      shakes,
      push: (...e: CombatEvent[]) => (combatEvents = e),
      pushY: (...e: YokaiEvent[]) => (yokaiEvents = e),
      setDead: (v: boolean) => (dead = v),
      setInv: (v: number) => (inv = v),
      phase: (p: DayPhase) => phaseFn(p),
    };
  }

  it('パンチ → うでを振る・音。当たる・からぶり', () => {
    const s = setup();
    s.push({ type: 'punchStart', tick: 1 }, { type: 'punchHit', tick: 30, yokaiId: 1 }, { type: 'punchMiss', tick: 60 });
    s.fx.update(1 / 60);
    expect(s.calls).toContain('punch');
    expect(s.tones).toHaveLength(3);
  });
  it('ダメージ → ふちのピンク・音・ごく弱いゆれ 0.1 秒', () => {
    const s = setup();
    s.push({ type: 'playerHit', tick: 1, by: 'karakasa', amount: 1 });
    s.fx.update(1 / 60);
    expect(s.calls).toContain('edge');
    expect(s.tones).toHaveLength(1);
    expect(s.shakes.length).toBeGreaterThan(0);
    const n = s.shakes.length;
    for (let i = 0; i < 10; i++) s.fx.update(1 / 60);
    const afterEnd = s.shakes.length;
    for (let i = 0; i < 10; i++) s.fx.update(1 / 60);
    expect(s.shakes.length).toBe(afterEnd); // 終わったら上書きしない
    expect(afterEnd).toBeGreaterThanOrEqual(n);
  });
  it('fxShake を切ればゆれない', () => {
    const s = setup();
    (s.fx as unknown as { cfg: { fxShake: number } }).cfg.fxShake = 0;
    s.push({ type: 'playerHit', tick: 1, by: 'karakasa', amount: 1 });
    s.fx.update(1 / 60);
    s.fx.update(1 / 60);
    expect(s.shakes.every(([y, p]) => y === 0 && p === 0)).toBe(true);
  });
  it('やられた → 白い画面と人形がたおれる。復活 → おうちに もどったよ', () => {
    const s = setup();
    s.push({ type: 'death', tick: 1, dropped: [] });
    s.setDead(true);
    s.fx.update(1 / 60);
    expect(s.calls).toContain('death');
    for (let i = 0; i < 30; i++) s.fx.update(1 / 60);
    expect(s.calls).toContain('fallen:1.00');
    s.setDead(false);
    s.push({ type: 'respawn', tick: 121 });
    s.setInv(180);
    s.fx.update(1 / 60);
    expect(s.calls).toEqual(expect.arrayContaining(['respawnScreen', 'home']));
  });
  it('むてき中のハートと人形', () => {
    const s = setup();
    s.setInv(120);
    s.fx.update(1 / 60);
    expect(s.calls).toContain('hearts:20:true');
    expect(s.calls).toContain('alpha:0.25');
    s.setInv(0);
    s.fx.update(1 / 60);
    expect(s.calls).toContain('hearts:20:false');
    expect(s.calls.filter((c) => c === 'alpha:1')).toHaveLength(1);
  });
  it('妖怪を たおした → ポン（ドロップは地面に落ちるので ようかいだまは飛ばさない）。帰るときは何もしない', () => {
    const s = setup();
    s.pushY(
      { type: 'defeat', tick: 5, id: 1, kind: 'nurikabe', position: { x: 0, y: 0, z: 0 }, reward: 2, title: 'none' },
      { type: 'leave', tick: 5, id: 2, kind: 'karakasa', position: { x: 0, y: 0, z: 0 } },
      { type: 'spawn', tick: 5, id: 3, kind: 'chochin', position: { x: 0, y: 0, z: 0 } },
    );
    s.fx.update(1 / 60);
    expect(s.calls.some((c) => c.startsWith('pickup:'))).toBe(false);
    expect(s.tones).toHaveLength(2); // ポン・出現
  });
  it('時間帯が変わる → 時計・ゆうがたは鐘、あさは小鳥', () => {
    const s = setup();
    expect(s.calls).toContain('clock:day');
    s.phase('dusk');
    s.phase('dawn');
    expect(s.calls).toEqual(expect.arrayContaining(['clock:dusk', 'clock:dawn']));
    expect(s.tones).toEqual([COMBAT_SOUNDS.bell[0].f0, COMBAT_SOUNDS.birds[0].f0]);
  });
});
