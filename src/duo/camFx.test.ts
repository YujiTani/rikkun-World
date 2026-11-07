import { describe, expect, it, vi } from 'vitest';
import { IMPACT, SHAKE, shakeAngles } from '../fx/impact';
import { P1CamFx, P2CamFx, type P2CamView } from './camFx';
import { fakeRig } from './camFxFake';
import type { P2Pose } from './p2Pose';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md 1.13 §3.6「手ごたえ」・§8 の `duoCamFx(who)`・§9.10・§12.0 の `duo.impact`・`duo.camDistance`・AC97）の 先行テスト（赤）。
 * 2 人の とき、その人の 半分の カメラだけ 止める・ゆらす・きょりを かえる。世界は 止めない。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/camFx.ts。three を 使わない）----
 *   interface DuoCamFx {                                            ← §8 の `shared.duoCamFx(who)` の 型（3 つの 口）＋ 読む 口 3 つ
 *     addTrauma(a: number): void;       ゆれを 足す（0〜1 に おさめる）
 *     freeze(ticks: number): void;      このステップの 次から ticks ステップ その人の カメラを 止める（長い 方 1 回。小数は 切りすて。Game.hitStop と 同じ）
 *     setDistance(d: number | null): void;   きょりを d（マス）に する。null で ふだん。目標では なく「今の 値」（なめらかに する のは 呼ぶ 側。CameraRig.distanceOverride と 同じ）
 *     stopLeft(): number;               止めの のこり ステップ（`duo.impact(who).stopLeft`）
 *     trauma(): number;                 ゆれの 量 0〜1（`duo.impact(who).trauma`）
 *     distance(): number;               今の きょり（`duo.camDistance(who)`）。setDistance が なければ baseDistance()
 *   }
 *   class P2CamFx implements DuoCamFx        ← 2P の カメラ用。1P は CameraRig を 包む 別の 物（同じ 型）
 *     new P2CamFx({ baseDistance: () => number })     2P の ふだんの きょり（配線: () => DUO_TUNING.cameraSplit）
 *     step(): void          固定ステップごとに 1 回。当たりを 出す flush より「前」（Game の hitStop と 同じ 順: 当たった ステップは 止めの のこりが そのまま 見える）
 *                           中で: 止めの のこりが あれば このステップは「止めの ステップ」にして のこりを 1 へらす → ゆれの 時間 +1/60 秒 → trauma を `SHAKE.decayPerSecond / 60` へらす（0 まで）→ ゆれの 角度を `shakeAngles` で 決める
 *     frozenNow(): boolean  直前の step() が 止めの ステップだったか
 *     apply(fresh: P2Pose, out: P2CamView): P2CamView
 *                           画面に つかう ポーズを out に 書いて 返す。止めの ステップは 止まる 直前の（止めて ない ステップの）ポーズ、ふつうの ステップは fresh を そのまま。
 *                           ゆれの 角度（ラジアン。カメラの 回転に そのまま 足す）は 止めの ステップでも 毎ステップ かわる。
 *   type P2CamView = P2Pose & { shakeYaw: number; shakePitch: number; shakeRoll: number }
 *
 *   ---- 1P の カメラ用（同じ ファイル src/duo/camFx.ts。three を 使わない）----
 *   interface P1RigPort {          ← CameraRig が 満たす 小さい 口（CameraRig に `shakeNow()` を 1 つ 足す: いまの ゆれの 角度〔ラジアン〕を `{ yaw, pitch, roll }` で 返す）
 *     update(dt: number): void;  肩の 点・ねらい・カメラの 位置と 向き（ゆれ 入り）を 進める。ゆれの 時間と trauma も ここで 進む
 *     addTrauma(a: number): void;  traumaNow(): number;  shakeNow(): { yaw: number; pitch: number; roll: number };
 *     distanceOverride: number | null;   step.ts が 毎ステップ 書く（優先: `legend.camDistance() ?? fx1.override() ?? shared.duoCamDistance`。順は step.ts:74 の まま）
 *   }
 *   interface P1CamPort { position: { x; y; z }; rotation: { x; y; z } }   ← game.camera（THREE の Vector3・Euler で そのまま 満たす）。書きかえるだけ
 *   class P1CamFx implements DuoCamFx
 *     new P1CamFx({ rig: P1RigPort, camera: P1CamPort, baseDistance: () => number, joined: () => boolean })     配線: baseDistance = () => shared.duoCamDistance ?? DUO_TUNING.cameraSolo
 *     update(dt): 毎ステップ 1 回。`rig.update(dt)` を 呼んでいた 所の かわり（当たりを 出す flush より 前）。
 *       1 人の とき（joined() が false）: rig.update(dt) を 呼ぶだけ。止めは 使わない（世界が 止まる → 今の onFrozenUpdate → rig.updateFrozen の まま）。止めの のこりが あれば 0 に する。
 *       2 人の とき: 止めの のこりが あれば このステップは「止めの ステップ」にして へらす → rig.update(dt) を ふつうに 呼ぶ（肩の 点・ねらいは 体に ついてくる）→
 *         止めの ステップなら カメラの 位置を 止める 直前の 値で、向きを（止める 直前の ゆれ なしの 向き + rig.shakeNow()）で 上書きする。ふつうの ステップは 今の 位置・向きを 覚える（向きは ゆれを 引いた 値）。
 *     addTrauma(a) = rig.addTrauma(a)、trauma() = rig.traumaNow()、freeze(n) = P2CamFx と 同じ（長い 方・切りすて）、stopLeft()、frozenNow()
 *     setDistance(d)・override(): d を 覚える（null で なし）。override() が それを 返す（step.ts が 優先の 順で つかう）。
 *     distance() = rig.distanceOverride ?? baseDistance()（壁で 止まる 前の 値）
 *   数は `IMPACT`・`SHAKE`（fx/impact.ts）と `DUO_TUNING.cameraSplit`（duo/tuning.ts）から 読む。1P と 同じ 式（`shakeAngles`）を つかう。乱数は つかわない。
 */

const DT = 1 / 60;
const BASE: number = DUO_TUNING.cameraSplit;
const pose = (x: number): P2Pose => ({ x, y: 10 + x, z: 20 - x, yawDeg: 30 + x, pitchDeg: -5 + x / 10 });
const view = (): P2CamView => ({ x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, shakeYaw: 0, shakePitch: 0, shakeRoll: 0 });
const make = () => new P2CamFx({ baseDistance: () => BASE });

describe('AC97: 2P の カメラの はじめの ようす', () => {
  it('ゆれ 0・止め 0・きょりは ふだん', () => {
    const fx = make();
    expect(fx.trauma()).toBe(0);
    expect(fx.stopLeft()).toBe(0);
    expect(fx.distance()).toBe(BASE);
    expect(fx.frozenNow()).toBe(false);
  });
  it('1 ステップ 進めても 変わらない', () => {
    const fx = make();
    fx.step();
    expect(fx.trauma()).toBe(0);
    expect(fx.stopLeft()).toBe(0);
    expect(fx.frozenNow()).toBe(false);
  });
});

describe('AC97: ゆれ（1P と 同じ 量・同じ へり方）', () => {
  it('addTrauma は 足す。1 を こえない', () => {
    const fx = make();
    fx.addTrauma(IMPACT.mid.trauma);
    expect(fx.trauma()).toBeCloseTo(IMPACT.mid.trauma, 12);
    fx.addTrauma(IMPACT.large.trauma);
    fx.addTrauma(IMPACT.large.trauma);
    expect(fx.trauma()).toBe(1);
  });
  it('1 ステップごとに SHAKE.decayPerSecond / 60 ずつ へって 0 で とまる', () => {
    const fx = make();
    fx.step();
    fx.addTrauma(IMPACT.large.trauma);
    let want = IMPACT.large.trauma;
    for (let i = 0; i < 90; i++) {
      fx.step();
      want = Math.max(0, want - SHAKE.decayPerSecond * DT);
      expect(fx.trauma(), `${i + 1} ステップ後`).toBeCloseTo(want, 10);
    }
    for (let i = 0; i < 90; i++) fx.step();
    expect(fx.trauma()).toBe(0);
  });
  it('ゆれの 角度は 1P と 同じ shakeAngles(trauma, 時間) で 決まる（時間 = step() の 数 ÷ 60 秒。trauma は その ステップで へった あとの 値）', () => {
    const fx = make();
    const out = view();
    const ref = { yaw: 0, pitch: 0, roll: 0 };
    fx.step(); // 1 ステップ目
    fx.addTrauma(IMPACT.large.trauma); // 当たり（flush は step の あと）
    fx.step(); // 2 ステップ目
    const t = fx.trauma();
    fx.apply(pose(0), out);
    shakeAngles(t, 2 * DT, ref);
    expect(out.shakeYaw).toBeCloseTo(ref.yaw, 12);
    expect(out.shakePitch).toBeCloseTo(ref.pitch, 12);
    expect(out.shakeRoll).toBeCloseTo(ref.roll, 12);
    expect(Math.abs(out.shakeYaw) + Math.abs(out.shakePitch) + Math.abs(out.shakeRoll), 'ゆれて いる').toBeGreaterThan(0);
  });
  it('trauma 0 なら ゆれの 角度は 全部 0', () => {
    const fx = make();
    const out = view();
    fx.step();
    fx.apply(pose(1), out);
    expect([out.shakeYaw, out.shakePitch, out.shakeRoll]).toEqual([0, 0, 0]);
  });
  it('乱数を つかわない（Math.random を 呼ばない）', () => {
    const spy = vi.spyOn(Math, 'random');
    const fx = make();
    const out = view();
    for (let i = 0; i < 20; i++) {
      fx.step();
      fx.addTrauma(IMPACT.mid.trauma);
      fx.freeze(IMPACT.mid.stop);
      fx.apply(pose(i), out);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('AC97: 止め（世界は 止めない。その人の カメラの 位置・向きだけ その場に 止める）', () => {
  it('freeze(n) の ステップに stopLeft = n。次の ステップから n ステップ「止めの ステップ」', () => {
    const fx = make();
    fx.step();
    fx.freeze(IMPACT.mid.stop);
    expect(fx.stopLeft(), '当たった ステップ').toBe(IMPACT.mid.stop);
    expect(fx.frozenNow(), '当たった ステップ自体は 止めない').toBe(false);
    for (let k = 1; k <= IMPACT.mid.stop; k++) {
      fx.step();
      expect(fx.frozenNow(), `${k} ステップ目は 止め`).toBe(true);
      expect(fx.stopLeft(), `${k} ステップ目の のこり`).toBe(IMPACT.mid.stop - k);
    }
    fx.step();
    expect(fx.frozenNow(), `${IMPACT.mid.stop + 1} ステップ目は うごく`).toBe(false);
    expect(fx.stopLeft()).toBe(0);
  });
  it('長い 方 1 回（Game.hitStop と 同じ）。小数は 切りすて。0 や 負は 何も しない', () => {
    const fx = make();
    fx.step();
    fx.freeze(IMPACT.mid.stop);
    fx.freeze(IMPACT.mid.stop - 1);
    expect(fx.stopLeft()).toBe(IMPACT.mid.stop);
    fx.freeze(IMPACT.large.stop);
    expect(fx.stopLeft()).toBe(IMPACT.large.stop);
    const fx2 = make();
    fx2.freeze(IMPACT.mid.stop + 0.9);
    expect(fx2.stopLeft()).toBe(IMPACT.mid.stop);
    const fx3 = make();
    fx3.freeze(0);
    fx3.freeze(-3);
    expect(fx3.stopLeft()).toBe(0);
  });
  it('止めの ステップは 止まる 直前の ポーズ（位置・向き）。体が 動いても 動かない。終わったら また ついてくる', () => {
    const fx = make();
    const out = view();
    fx.step();
    fx.apply(pose(2), out); // 当たった ステップ（まだ 止めない。この ポーズで 止まる）
    fx.freeze(IMPACT.mid.stop);
    expect(out).toMatchObject(pose(2));
    for (let k = 1; k <= IMPACT.mid.stop; k++) {
      fx.step();
      fx.apply(pose(2 + k), out); // 体は 動きつづける
      expect(out, `${k} ステップ目`).toMatchObject(pose(2));
    }
    fx.step();
    fx.apply(pose(100), out);
    expect(out, '止めが 終わった ステップ').toMatchObject(pose(100));
  });
  it('止めの あいだも ゆれは 動く（毎ステップ ちがう 角度）', () => {
    const fx = make();
    const out = view();
    fx.step();
    fx.apply(pose(0), out);
    fx.addTrauma(IMPACT.large.trauma);
    fx.freeze(IMPACT.large.stop);
    const yaws: number[] = [];
    for (let k = 1; k <= IMPACT.large.stop; k++) {
      fx.step();
      fx.apply(pose(k), out);
      yaws.push(out.shakeYaw);
    }
    expect(new Set(yaws.map((y) => y.toFixed(9))).size, 'ゆれが 毎ステップ 動く').toBeGreaterThan(1);
    expect(fx.trauma(), '止めの あいだも へる').toBeLessThan(IMPACT.large.trauma);
  });
  it('止めて ない ステップが 1 度も ないうちに 止めの ステップが 来たら fresh を つかう（空の ポーズを 出さない）', () => {
    const fx = make();
    const out = view();
    fx.freeze(IMPACT.mid.stop);
    fx.step();
    fx.apply(pose(7), out);
    expect(out).toMatchObject(pose(7));
  });
});

describe('§8: きょりの 口（setDistance・distance。よせ〔4d-1〕・わざの 引き〔4d-2〕が 使う）', () => {
  it('ふだんは baseDistance()（2P は DUO_TUNING.cameraSplit）', () => {
    expect(make().distance()).toBe(DUO_TUNING.cameraSplit);
  });
  it('setDistance(d) で その 値。null で ふだんに もどる。ふだんの 値が かわれば ついていく', () => {
    let base: number = BASE;
    const fx = new P2CamFx({ baseDistance: () => base });
    fx.setDistance(14);
    expect(fx.distance()).toBe(14);
    fx.setDistance(BASE - 0.6);
    expect(fx.distance()).toBe(BASE - 0.6);
    fx.setDistance(null);
    expect(fx.distance()).toBe(BASE);
    base = 4;
    expect(fx.distance(), 'ふだんの きょりが 1 人の 4 に なったら ついていく').toBe(4);
  });
  it('step() では きょりを かえない（なめらかに する のは 呼ぶ 側）', () => {
    const fx = make();
    fx.setDistance(14);
    for (let i = 0; i < 10; i++) fx.step();
    expect(fx.distance()).toBe(14);
  });
});

/** 1P の カメラ（2 人の とき）: 止めの あいだ カメラだけ 止め、体・ねらい（rig.update）は 動きつづける */
describe('AC97: P1CamFx（1P の カメラ。CameraRig を 包む）', () => {
  const make1 = (joined = true, base = DUO_TUNING.cameraSolo as number) => {
    const rig = fakeRig();
    const st = { joined, base };
    const fx = new P1CamFx({ rig, camera: rig.camera, baseDistance: () => st.base, joined: () => st.joined });
    return { rig, fx, st };
  };
  const move = (rig: ReturnType<typeof fakeRig>, k: number) => {
    rig.body.x = k;
    rig.body.y = 10 + k;
    rig.body.z = 20 - k;
    rig.body.yaw = 0.01 * k;
    rig.body.pitch = -0.02 * k;
  };
  const baseRot = (rig: ReturnType<typeof fakeRig>) => {
    const sh = rig.shakeNow();
    const r = rig.camera.rotation;
    return { x: r.x - sh.pitch, y: r.y - sh.yaw, z: r.z - sh.roll };
  };

  it('ゆれ・きょりの 口は rig に つながる', () => {
    const { rig, fx } = make1();
    fx.addTrauma(IMPACT.mid.trauma);
    expect(rig.traumaNow()).toBeCloseTo(IMPACT.mid.trauma, 12);
    expect(fx.trauma()).toBe(rig.traumaNow());
  });
  it('きょり: distance() は rig.distanceOverride ?? ふだん（壁で 止まる 前の 値）。setDistance は override() に 出る', () => {
    const { rig, fx, st } = make1();
    expect(fx.distance()).toBe(DUO_TUNING.cameraSolo);
    st.base = BASE;
    expect(fx.distance()).toBe(BASE);
    rig.distanceOverride = 14; // step.ts が 書いた 値（legend か setDistance か duoCamDistance）
    expect(fx.distance()).toBe(14);
    expect(fx.override()).toBeNull();
    fx.setDistance(BASE - 0.6);
    expect(fx.override()).toBe(BASE - 0.6);
    fx.setDistance(null);
    expect(fx.override()).toBeNull();
  });
  it('2 人: 当たったステップに stopLeft = n。次の n ステップは 止めの ステップ。そのあとは また ついてくる', () => {
    const { rig, fx } = make1();
    move(rig, 1);
    fx.update(DT);
    fx.freeze(IMPACT.mid.stop);
    expect(fx.stopLeft()).toBe(IMPACT.mid.stop);
    expect(fx.frozenNow()).toBe(false);
    for (let k = 1; k <= IMPACT.mid.stop; k++) {
      move(rig, 1 + k);
      fx.update(DT);
      expect(fx.frozenNow(), `${k}`).toBe(true);
      expect(fx.stopLeft(), `${k}`).toBe(IMPACT.mid.stop - k);
    }
    move(rig, 100);
    fx.update(DT);
    expect(fx.frozenNow()).toBe(false);
    expect(rig.camera.position.x).toBe(100);
  });
  it('止めの あいだ: 体と ねらい（rig.update）は 毎ステップ 動く・カメラの 位置と ゆれなしの 向きは 当たった ステップの まま・ゆれだけ 動く', () => {
    const { rig, fx } = make1();
    move(rig, 1);
    fx.update(DT);
    fx.addTrauma(IMPACT.large.trauma);
    fx.freeze(IMPACT.large.stop);
    const heldPos = { ...rig.camera.position };
    const heldBase = baseRot(rig);
    const updates0 = rig.updates;
    const yaws: number[] = [];
    for (let k = 1; k <= IMPACT.large.stop; k++) {
      move(rig, 1 + k); // 体は 動く
      fx.update(DT);
      expect(rig.updates, `rig.update は 毎ステップ ${k}`).toBe(updates0 + k);
      expect(rig.camera.position, `位置 ${k}`).toEqual(heldPos);
      const sh = rig.shakeNow();
      expect(rig.camera.rotation.x, `向き x ${k}`).toBeCloseTo(heldBase.x + sh.pitch, 12);
      expect(rig.camera.rotation.y, `向き y ${k}`).toBeCloseTo(heldBase.y + sh.yaw, 12);
      expect(rig.camera.rotation.z, `向き z ${k}`).toBeCloseTo(heldBase.z + sh.roll, 12);
      yaws.push(rig.camera.rotation.y);
    }
    expect(new Set(yaws.map((y) => y.toFixed(9))).size, 'ゆれは 動く').toBeGreaterThan(1);
  });
  it('1 人（joined が false）: rig.update を 回すだけ。freeze されても 止めの ステップに ならない。参加→やめるで のこりを 捨てる', () => {
    const { rig, fx, st } = make1(false);
    move(rig, 1);
    fx.update(DT);
    fx.freeze(IMPACT.large.stop); // 本来は 呼ばれない
    move(rig, 2);
    fx.update(DT);
    expect(fx.frozenNow()).toBe(false);
    expect(fx.stopLeft(), '1 人に なったら 止めは のこさない').toBe(0);
    expect(rig.camera.position.x).toBe(2);
    // 2 人で 止めの 途中に やめる
    st.joined = true;
    move(rig, 3);
    fx.update(DT);
    fx.freeze(IMPACT.large.stop);
    st.joined = false;
    move(rig, 4);
    fx.update(DT);
    expect(fx.stopLeft()).toBe(0);
    expect(rig.camera.position.x, 'すぐ ついてくる').toBe(4);
  });
  it('乱数を つかわない', () => {
    const spy = vi.spyOn(Math, 'random');
    const { rig, fx } = make1();
    for (let i = 0; i < 12; i++) {
      move(rig, i);
      fx.update(DT);
      fx.addTrauma(IMPACT.mid.trauma);
      fx.freeze(IMPACT.mid.stop);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
