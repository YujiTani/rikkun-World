import { describe, expect, it } from 'vitest';
import { IMPACT, ImpactBus, impactOf, type ImpactLevel } from '../fx/impact';
import { P1CamFx, P2CamFx, type DuoCamFx, type P2CamView } from './camFx';
import { fakeRig } from './camFxFake';
import { createImpactRoute } from './impactRoute';
import type { P2Pose } from './p2Pose';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md 1.13 §3.6「手ごたえ」・§8 の `impactFor(who)`・§12.0 の `duo.impact`・AC97・AC113）の 先行テスト（赤）。
 * 当たりの 止め・ゆれを「だれの 物か」で ふりわける。2 人の ときは 世界を 止めず、その人の カメラだけ。1 人の ときは 今の まま。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/impactRoute.ts。three を 使わない）----
 *   createImpactRoute(d: {
 *     joined: () => boolean;                      2P が いるか（shared.duoJoined）
 *     worldStop: (ticks: number) => void;         1 人の とき 世界を 止める（game.hitStop）
 *     worldStopLeft: () => number;                世界の 止めの のこり（game.hitStopLeft）。1 人の ときの `duo.impact(1).stopLeft`
 *     camFx: (who: 1 | 2) => DuoCamFx;            その人の カメラ（camFx.ts の 型。1P は CameraRig を 包む 物、2P は P2CamFx）
 *     shakeOn: () => boolean;                     ゆれを 出すか（FX_SETTINGS.fxShake が 0 でない）。0 でも 止めは 出す（今の 決まり）
 *     tick: () => number;                         game.tick
 *   }): {
 *     impactFor(who: 1 | 2): ImpactBus;           ← §8 の `shared.impactFor(who)`。作った ImpactBus を 使い回す（呼ぶ たびに 新しい 物を 作らない。2 人 → 1 人に かわっても 同じ 物）
 *     flush(): void;                              ステップの おわりに 1 回（step.ts の `impactBus.flush()` の 所。2 つとも）
 *     view(who: 1 | 2): { trauma: number; stopLeft: number; log: ImpactLogEntry[] } | null   ← `duo.impact(who)`。log は コピー
 *   }
 *   ふりわけ（`ImpactBus` の 出口 `{ stop, shake, tick }` を 次の とおりに つなぐ。`ImpactBus` 自体は かえない）:
 *     1 人の とき  impactFor(1): stop → worldStop(n)、shake → camFx(1).addTrauma(a)。impactFor(2): 何も しない（stop も shake も 出口に 出ない）
 *     2 人の とき  impactFor(who): stop → camFx(who).freeze(n)、shake → camFx(who).addTrauma(a)。worldStop は 呼ばない
 *     shake は shakeOn() が false なら 出さない。数は `IMPACT`（fx/impact.ts）から 読む。
 *   1P の camFx(1) は 本物の `P1CamFx`（camFx.ts。CameraRig を 包む）、2P の camFx(2) は `P2CamFx`。この 通しは 両方 本物を つかう（下の「AC97 通し」）。
 *   view(who): 1 人の とき who=1 は { trauma: camFx(1).trauma(), stopLeft: worldStopLeft(), log }、who=2 は null。
 *              2 人の とき { trauma: camFx(who).trauma(), stopLeft: camFx(who).stopLeft(), log }
 */

interface Spy extends DuoCamFx {
  traumas: number[];
  freezes: number[];
  trauma(): number;
  stopLeft(): number;
}
function spyFx(): Spy {
  const s: Spy = {
    traumas: [],
    freezes: [],
    addTrauma: (a) => {
      s.traumas.push(a);
    },
    freeze: (n) => {
      s.freezes.push(n);
    },
    setDistance: () => {},
    stopLeft: () => (s.freezes.length ? Math.max(...s.freezes) : 0),
    trauma: () => s.traumas.reduce((a, b) => Math.min(1, a + b), 0),
    distance: () => DUO_TUNING.cameraSplit,
  };
  return s;
}

function rig(opts: { joined?: boolean; shake?: boolean } = {}) {
  const st = { joined: opts.joined ?? false, shake: opts.shake ?? true, tick: 0, worldStops: [] as number[] };
  const fx = { 1: spyFx(), 2: spyFx() };
  const route = createImpactRoute({
    joined: () => st.joined,
    worldStop: (n) => {
      st.worldStops.push(n);
    },
    worldStopLeft: () => (st.worldStops.length ? Math.max(...st.worldStops) : 0),
    camFx: (who) => fx[who],
    shakeOn: () => st.shake,
    tick: () => st.tick,
  });
  return { st, fx, route };
}
/** 世界を 止めた 長さ（呼ばれなければ 0） */
const stopped = (st: { worldStops: number[] }) => (st.worldStops.length ? Math.max(...st.worldStops) : 0);

const LEVELS: ImpactLevel[] = ['mid', 'large', 'echo'];

describe('AC113: 1 人の とき（今の ImpactBus の 動き）', () => {
  it.each(LEVELS)('%s: 世界を 止め（IMPACT の 数）、1P の カメラが ゆれる。2P の カメラには 何も 出ない', (level) => {
    const { st, fx, route } = rig({ joined: false });
    route.impactFor(1).hit(level);
    route.flush();
    expect(stopped(st)).toBe(IMPACT[level].stop);
    expect(fx[1].traumas).toEqual([IMPACT[level].trauma]);
    expect(fx[1].freezes, '1P の カメラの 止めは 使わない（世界が 止まる）').toEqual([]);
    expect(fx[2].traumas).toEqual([]);
    expect(fx[2].freezes).toEqual([]);
  });
  it('small は 何も 出さない', () => {
    const { st, fx, route } = rig({ joined: false });
    route.impactFor(1).hit('small');
    route.flush();
    expect(st.worldStops).toEqual([]);
    expect(fx[1].traumas).toEqual([]);
  });
  it('同じ ステップに 何回 当たっても いちばん 強い 段の 1 回 ぶん', () => {
    const { st, fx, route } = rig({ joined: false });
    const bus = route.impactFor(1);
    bus.hit('mid');
    bus.hit('large');
    bus.hit('mid');
    bus.hit('echo');
    route.flush();
    expect(stopped(st)).toBe(IMPACT.large.stop);
    expect(fx[1].traumas).toEqual([IMPACT.large.trauma]);
    route.flush();
    expect(fx[1].traumas, 'flush を 2 回 呼んでも 出直さない').toEqual([IMPACT.large.trauma]);
  });
  it('ゆれを 切ると（shakeOn が false）ゆれは 出ない。止めは 出る', () => {
    const { st, fx, route } = rig({ joined: false, shake: false });
    route.impactFor(1).hit('large');
    route.flush();
    expect(fx[1].traumas).toEqual([]);
    expect(stopped(st)).toBe(IMPACT.large.stop);
  });
  it('2P が いない ときの impactFor(2) は 何も しない（世界を 止めない・1P を ゆらさない）。view(2) は null', () => {
    const { st, fx, route } = rig({ joined: false });
    route.impactFor(2).hit('large');
    route.flush();
    expect(st.worldStops).toEqual([]);
    expect(fx[1].traumas).toEqual([]);
    expect(fx[2].freezes).toEqual([]);
    expect(route.view(2)).toBeNull();
  });
  it('view(1): 世界の 止めの のこりと 1P の カメラの ゆれ（今の `__rikkun.impact` と 同じ 数）。log に 段が 残る', () => {
    const { st, fx, route } = rig({ joined: false });
    st.tick = 12;
    route.impactFor(1).hit('mid');
    route.flush();
    const v = route.view(1)!;
    expect(v.stopLeft).toBe(IMPACT.mid.stop);
    expect(v.trauma).toBe(fx[1].trauma());
    expect(v.log).toEqual([{ tick: 12, level: 'mid' }]);
  });
});

describe('AC97: 2 人の とき（世界は 止めない。その人の カメラだけ）', () => {
  it.each(LEVELS)('2P の %s: 2P の カメラだけ 止まって ゆれる。1P の カメラも 世界も かわらない', (level) => {
    const { st, fx, route } = rig({ joined: true });
    route.impactFor(2).hit(level);
    route.flush();
    expect(fx[2].freezes).toEqual([IMPACT[level].stop]);
    expect(fx[2].traumas).toEqual([IMPACT[level].trauma]);
    expect(st.worldStops, '世界は 止めない').toEqual([]);
    expect(fx[1].freezes).toEqual([]);
    expect(fx[1].traumas).toEqual([]);
  });
  it.each(LEVELS)('1P の %s: 1P の カメラだけ。2P は かわらない。世界は 止めない', (level) => {
    const { st, fx, route } = rig({ joined: true });
    route.impactFor(1).hit(level);
    route.flush();
    expect(fx[1].freezes).toEqual([IMPACT[level].stop]);
    expect(fx[1].traumas).toEqual([IMPACT[level].trauma]);
    expect(st.worldStops).toEqual([]);
    expect(fx[2].freezes).toEqual([]);
    expect(fx[2].traumas).toEqual([]);
  });
  it('同じ ステップに 2 人とも 当たったら それぞれ 別に 数える（段も べつべつ）', () => {
    const { st, fx, route } = rig({ joined: true });
    route.impactFor(1).hit('large');
    route.impactFor(2).hit('mid');
    route.impactFor(2).hit('echo');
    route.flush();
    expect(fx[1].freezes).toEqual([IMPACT.large.stop]);
    expect(fx[1].traumas).toEqual([IMPACT.large.trauma]);
    expect(fx[2].freezes).toEqual([IMPACT.mid.stop]);
    expect(fx[2].traumas).toEqual([IMPACT.mid.trauma]);
    expect(st.worldStops).toEqual([]);
  });
  it('小さい 当たり（small）は 何も 出さない', () => {
    const { fx, route } = rig({ joined: true });
    route.impactFor(2).hit('small');
    route.flush();
    expect(fx[2].freezes).toEqual([]);
    expect(fx[2].traumas).toEqual([]);
  });
  it('ゆれを 切ると（shakeOn が false）2P の カメラも ゆれない。止めは 出る', () => {
    const { fx, route } = rig({ joined: true, shake: false });
    route.impactFor(2).hit('mid');
    route.flush();
    expect(fx[2].traumas).toEqual([]);
    expect(fx[2].freezes).toEqual([IMPACT.mid.stop]);
  });
  it('view(who): その人の カメラの ゆれ・止めの のこり・段の きろく（ほかの 人の 物は 入らない）', () => {
    const { st, fx, route } = rig({ joined: true });
    st.tick = 40;
    route.impactFor(2).hit('mid');
    route.flush();
    st.tick = 41;
    route.impactFor(1).hit('large');
    route.flush();
    const v2 = route.view(2)!;
    expect(v2).toMatchObject({ trauma: fx[2].trauma(), stopLeft: IMPACT.mid.stop });
    expect(v2.log).toEqual([{ tick: 40, level: 'mid' }]);
    const v1 = route.view(1)!;
    expect(v1).toMatchObject({ trauma: fx[1].trauma(), stopLeft: IMPACT.large.stop });
    expect(v1.log).toEqual([{ tick: 41, level: 'large' }]);
  });
  it('view の log は コピー（外から 書きかえても 中は かわらない）', () => {
    const { route } = rig({ joined: true });
    route.impactFor(2).hit('mid');
    route.flush();
    route.view(2)!.log.length = 0;
    expect(route.view(2)!.log).toHaveLength(1);
  });
});

describe('ふりわけの 約束（使い回し・切りかえ）', () => {
  it('impactFor は 同じ ImpactBus を 返す（毎ステップ 新しい 物を 作らない）。本物の ImpactBus', () => {
    const { st, route } = rig({ joined: false });
    expect(route.impactFor(1)).toBe(route.impactFor(1));
    expect(route.impactFor(2)).toBe(route.impactFor(2));
    expect(route.impactFor(1)).not.toBe(route.impactFor(2));
    expect(route.impactFor(1)).toBeInstanceOf(ImpactBus);
    const a = route.impactFor(1);
    st.joined = true;
    expect(route.impactFor(1), '2 人に かわっても 同じ').toBe(a);
  });
  it('参加・やめるで ふりわけが 切りかわる（そのステップの flush から）。log は つづく', () => {
    const { st, fx, route } = rig({ joined: false });
    route.impactFor(1).hit('mid');
    route.flush();
    expect(stopped(st)).toBe(IMPACT.mid.stop);
    st.joined = true;
    st.tick = 5;
    route.impactFor(1).hit('mid');
    route.flush();
    expect(fx[1].freezes, '2 人に なったら カメラだけ').toEqual([IMPACT.mid.stop]);
    expect(st.worldStops, '世界の 止めは 1 回だけ（1 人の ときの 分）').toHaveLength(1);
    st.joined = false;
    route.impactFor(1).hit('large');
    route.flush();
    expect(stopped(st)).toBe(IMPACT.large.stop);
    expect(route.view(1)!.log.map((l) => l.level)).toEqual(['mid', 'mid', 'large']);
  });
});

/**
 * AC97 の 通し（ユニット）: 実物の P2CamFx と ImpactBus の ふりわけで、「2P の 刀が 当たった ステップ」から 見える 数を 並べる。
 * 世界（体・妖怪・もう 1 人の カメラ）は 止まらず、2P の カメラの ポーズだけ 止まる。
 */
describe('AC97 通し: 刀（mid）が 当たる（1P は 本物の P1CamFx〔にせの rig〕、2P は 本物の P2CamFx）', () => {
  const DT = 1 / 60;
  const pose = (x: number): P2Pose => ({ x, y: 1, z: 2, yawDeg: 10, pitchDeg: 0 });
  const view = (): P2CamView => ({ x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, shakeYaw: 0, shakePitch: 0, shakeRoll: 0 });

  function scenario(hitWho: 1 | 2) {
    const rig1 = fakeRig();
    const cam = {
      1: new P1CamFx({ rig: rig1, camera: rig1.camera, baseDistance: () => DUO_TUNING.cameraSolo, joined: () => true }),
      2: new P2CamFx({ baseDistance: () => DUO_TUNING.cameraSplit }),
    };
    let tick = 0;
    const worldStops: number[] = [];
    const route = createImpactRoute({
      joined: () => true,
      worldStop: (n) => {
        worldStops.push(n);
      },
      worldStopLeft: () => 0,
      camFx: (who) => cam[who],
      shakeOn: () => true,
      tick: () => tick,
    });
    const HIT = 5;
    const AFTER = IMPACT.mid.stop + 3;
    const rows: Array<{ tick: number; stop1: number; stop2: number; tr1: number; tr2: number; out1: { x: number }; out2: P2CamView; rigUpdates: number }> = [];
    for (let s = 1; s <= HIT + AFTER; s++) {
      tick++; // 世界の tick は 毎ステップ ふえる（止まらない）
      rig1.body.x = s; // 1P の 体は 毎ステップ 動く
      cam[1].update(DT); // 1P の カメラ（rig.update を ふくむ）
      cam[2].step();
      const out2 = cam[2].apply(pose(1000 + s), view()); // 2P の 体も 動く
      if (s === HIT) {
        route.impactFor(hitWho).hit(impactOf({ kind: 'tech', tech: 'thrust', step: 1 })); // 刀の 1 段目 = 中
        route.flush();
      }
      rows.push({ tick, stop1: cam[1].stopLeft(), stop2: cam[2].stopLeft(), tr1: cam[1].trauma(), tr2: cam[2].trauma(), out1: { x: rig1.camera.position.x }, out2, rigUpdates: rig1.updates });
    }
    return { rows, worldStops, HIT };
  }

  it('2P の 刀: 当たった ステップに 2P の stopLeft = IMPACT.mid.stop・trauma = IMPACT.mid.trauma。1P は 0。世界は 止まらない', () => {
    const { rows, worldStops, HIT } = scenario(2);
    const r = rows[HIT - 1]!;
    expect(r.stop2).toBe(IMPACT.mid.stop);
    expect(r.tr2).toBeCloseTo(IMPACT.mid.trauma, 12);
    expect(r.stop1).toBe(0);
    expect(r.tr1).toBe(0);
    expect(worldStops, '__rikkun.impact.stopLeft() は 0 のまま').toEqual([]);
    expect(rows.map((x) => x.tick), '毎ステップ 1 ずつ ふえる').toEqual(rows.map((_, i) => i + 1));
  });
  it('止めの あいだ 2P の カメラの 位置・向きは 当たった ステップの まま、1P の カメラは 体に ついてくる', () => {
    const { rows, HIT } = scenario(2);
    const held = rows[HIT - 1]!.out2;
    for (let k = 1; k <= IMPACT.mid.stop; k++) {
      const r = rows[HIT - 1 + k]!;
      expect(r.out2, `止め ${k}`).toMatchObject({ x: held.x, y: held.y, z: held.z, yawDeg: held.yawDeg, pitchDeg: held.pitchDeg });
      expect(r.out1.x, `1P は 動く ${k}`).toBe(rows[HIT - 1]!.out1.x + k);
      expect(r.stop1).toBe(0);
    }
    const after = rows[HIT + IMPACT.mid.stop]!;
    expect(after.out2.x, '止めが 終わったら 体に ついてくる').toBe(1000 + (HIT + IMPACT.mid.stop + 1));
  });
  it('1P の 刀の 当たりは 1P だけ（2 人の とき）: 1P の カメラが 止まり、世界・1P の 体と ねらい（rig.update）・2P は 動く', () => {
    const { rows, worldStops, HIT } = scenario(1);
    const r = rows[HIT - 1]!;
    expect(r.stop1).toBe(IMPACT.mid.stop);
    expect(r.tr1).toBeCloseTo(IMPACT.mid.trauma, 12);
    expect(r.stop2).toBe(0);
    expect(r.tr2).toBe(0);
    expect(worldStops, '世界は 止めない').toEqual([]);
    expect(rows.map((x) => x.tick), '世界の tick は 毎ステップ ふえる').toEqual(rows.map((_, i) => i + 1));
    for (let k = 1; k <= IMPACT.mid.stop; k++) {
      const q = rows[HIT - 1 + k]!;
      expect(q.out1.x, `1P の カメラは 当たった ステップの まま ${k}`).toBe(r.out1.x);
      expect(q.rigUpdates, `1P の 体・ねらいの 更新は 毎ステップ ${k}`).toBe(r.rigUpdates + k);
      expect(q.out2.x, `2P は 動く ${k}`).toBe(1000 + HIT + k);
    }
    const after = rows[HIT + IMPACT.mid.stop]!;
    expect(after.out1.x, '止めが 終わったら 1P の 体に ついてくる').toBe(HIT + IMPACT.mid.stop + 1);
  });
  it('2P の 当たりの とき 1P の カメラは かわらない（体に ついてくる・止めない）', () => {
    const { rows, HIT } = scenario(2);
    for (let k = 0; k <= IMPACT.mid.stop; k++) expect(rows[HIT - 1 + k]!.out1.x, `1P は 動く ${k}`).toBe(HIT + k);
  });
});
