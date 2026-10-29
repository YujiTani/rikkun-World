/**
 * #308 gashaBig.ts を 分けた もの: 攻撃 5「自分に 落雷」の 世界との つなぎ。雷雲・指への 落雷・体の 電気（触れると ダメージ）・まわりの 落雷と 予告
 * （動きの 本体は gashaBigThunder.ts、見た目は gashaBigThunderFx.ts）。
 */
import { Vector3 } from 'three';
import { boltVariantOf } from '../legend/thunderModel';
import type { BigActor } from './gashaBigActor';
import type { GashaBigDeps } from './gashaBigDeps';
import type { BigSfx } from './gashaBigSfx';
import type { LandInfo } from './gashaBigEruption';
import { BodyShock, StrikeField, touchBody } from './gashaBigThunder';
import { ThunderFx, type BoltView, type RingView, type WarnView } from './gashaBigThunderFx';
import { TUNE as T } from './gashaBigTuning';

export interface ThunderEnv {
  actor(): BigActor | null;
  reduced(): boolean;
  sfx: Pick<BigSfx, 'bolt' | 'elecOn' | 'elecOff' | 'strike'>;
  /** 落雷の 着く 高さ（噴火の 地面の 見つけ方と おなじ） */
  landAt(x: number, z: number): LandInfo;
  deps: Pick<GashaBigDeps, 'scene' | 'camera' | 'player' | 'hurt'>;
}

export interface ThunderStep {
  step(dt: number): void;
  /** 雷が 指へ 落ちはじめた（指の 雷の 絵と 音） */
  onStrike(): void;
  /** 雷が 指に 着いた（まわりの 落雷と 体の 電気が はじまる） */
  onLand(): void;
  /** 雷雲・雷・予告・電気を ぜんぶ 消す */
  clear(): void;
  readonly fx: ThunderFx;
  readonly strikes: StrikeField;
  readonly bodyHurts: () => number;
  readonly strikeHurts: () => number;
  /** この 攻撃で まわりに 落ちた 雷の 場所 */
  hitLog(): { x: number; z: number }[];
}

export function createThunderStep(env: ThunderEnv): ThunderStep {
  const { deps, sfx } = env;
  const strikes = new StrikeField(), thunderFx = new ThunderFx(deps.scene, deps.camera), bodyShock = new BodyShock();
  const tipV = new Vector3();
  let fingerBolt: { age: number; variant: number } | null = null;
  let thunderBodyHurts = 0, thunderStrikeHurts = 0, thunderHitLog: { x: number; z: number }[] = [];
  const boltViews: BoltView[] = [], ringViews: RingView[] = [], warnViews: WarnView[] = [];
  const step = (dt: number): void => {
    const actor = env.actor();
    if (!actor) return;
    const A = actor.thunder, K = T.thunder, strikeLead = 7 / 60;
    thunderFx.setSky(A.cloud, A.flash, env.reduced());
    actor.fingerTip(tipV);
    const fingerOn = A.phase === 'point' || A.phase === 'strike' || A.phase === 'shock';
    thunderFx.setFinger(fingerOn ? tipV : null, A.glow);
    boltViews.length = 0; ringViews.length = 0; warnViews.length = 0;
    if (fingerBolt) {
      fingerBolt.age += dt;
      if (fingerBolt.age > 0.7) fingerBolt = null;
      else boltViews.push({ x: tipV.x, y: tipV.y, z: tipV.z, age: fingerBolt.age, variant: fingerBolt.variant, scale: K.boltScaleFinger });
    }
    if (strikes.active) {
      const p = deps.player();
      const o = strikes.update(dt, { center: { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z }, player: { x: p.x, y: p.y, z: p.z }, landAt: env.landAt });
      for (const s of o.hits) {
        sfx.bolt();
        thunderHitLog.push({ x: s.x, z: s.z });
        if (strikes.inStrike(s, p) && deps.hurt?.(K.around.damage, { x: s.x, y: s.y, z: s.z }) !== undefined) thunderStrikeHurts++;
      }
      for (const s of strikes.list) {
        if (s.t < 0) warnViews.push({ x: s.x, y: s.y, z: s.z, warn: strikes.warn(s), radius: K.around.radius });
        else ringViews.push({ x: s.x, y: s.y, z: s.z, age: s.t, radius: K.around.radius });
        if (s.t + strikeLead >= 0) boltViews.push({ x: s.x, y: s.y, z: s.z, age: s.t + strikeLead, variant: boltVariantOf(293 + actor.thunderCount, s.id), scale: K.boltScaleGround });
      }
    }
    thunderFx.setBolts(boltViews); thunderFx.setRings(ringViews); thunderFx.setWarns(warnViews);
    // 体の 電気: 走って いる 間 触れて いる 人に ダメージ
    thunderFx.setElectric(A.elec > 0.01 ? actor.boxList : [], A.elec);
    if (A.elec > 0.05) sfx.elecOn(); else sfx.elecOff();
    const live = A.live, pl = deps.player();
    const touching = live && touchBody((i, j, k) => actor.solid(i, j, k), { x: pl.x, y: pl.y, z: pl.z }, K.body.touchMargin);
    const d = bodyShock.step(dt, live, touching);
    if (d > 0) { deps.hurt?.(d, { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z }); thunderBodyHurts++; }
    thunderFx.update(dt);
  };
  return {
    step,
    onStrike: () => { const a = env.actor(); fingerBolt = { age: 0, variant: boltVariantOf(293, a?.thunderCount ?? 0) }; sfx.strike(); },
    onLand: () => { strikes.begin((env.actor()?.thunderCount ?? 1) - 1); thunderHitLog = []; bodyShock.reset(); },
    clear: () => { thunderFx.clear(); strikes.clear(); bodyShock.reset(); fingerBolt = null; },
    fx: thunderFx, strikes,
    bodyHurts: () => thunderBodyHurts, strikeHurts: () => thunderStrikeHurts,
    hitLog: () => thunderHitLog,
  };
}
