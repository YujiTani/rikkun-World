/**
 * #308 gashaBig.ts を 分けた もの: 攻撃 3「目から 光線」の 世界との つなぎ。着弾点が 追う・ブロックで 止まる・当たったら ダメージ・こげ跡と 煙
 * （動きの 本体は gashaBigBeam.ts、見た目は gashaBigBeamFx.ts）。
 */
import { Vector3 } from 'three';
import type { BigActor } from './gashaBigActor';
import type { GashaBigDeps } from './gashaBigDeps';
import type { BigSfx } from './gashaBigSfx';
import { BeamAim, type AimEnv } from './gashaBigBeam';
import { BeamFx } from './gashaBigBeamFx';
import { TUNE as T } from './gashaBigTuning';

export interface BeamEnv {
  actor(): BigActor | null;
  sfx: Pick<BigSfx, 'beamLoopOff' | 'beamOn' | 'beamLoopOn' | 'smoke'>;
  deps: Pick<GashaBigDeps, 'scene' | 'camera' | 'player' | 'groundY' | 'blockAt' | 'setBlockAir' | 'hurt'>;
}

export interface BeamStep {
  step(dt: number): void;
  readonly aim: BeamAim;
  readonly fx: BeamFx;
  /** 直前の コマの 段階（'idle'・'charge'・'fire'・...） */
  prev(): string;
}

export function createBeamStep(env: BeamEnv): BeamStep {
  const { deps, sfx } = env;
  const { blockAt } = deps;
  const beamAim = new BeamAim(), beamFx = new BeamFx(deps.scene, deps.camera);
  const beamEyes: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  let beamPrev = 'idle', beamMark = 0, beamSmoke = 0, beamLast: { x: number; y: number; z: number } | null = null, beamShown = false;
  const beamSolid = (x: number, y: number, z: number): boolean => (blockAt ? ((b: string) => b !== 'air' && b !== 'outside')(blockAt(x, y, z)) : y <= deps.groundY(x, z));
  const step = (dt: number): void => {
    const actor = env.actor();
    if (!actor) return;
    const ph = actor.attackName === 'beam' && actor.mode === 'attack' ? actor.beam.phase : 'idle';
    const K = T.beam;
    if (ph === 'idle' || ph === 'done') {
      if (beamShown || beamPrev !== 'idle') { beamFx.setBeams([], [], false); beamFx.setSparkle([], 0); beamShown = false; actor.beamLook = null; }
      beamPrev = 'idle'; beamLast = null;
      sfx.beamLoopOff();
      beamFx.update(dt);
      return;
    }
    actor.eyePositions(beamEyes);
    const p = deps.player();
    const lp = beamLast;
    const aimEnv: AimEnv = {
      player: { x: p.x, y: p.y, z: p.z }, vel: { x: lp ? (p.x - lp.x) / dt : 0, z: lp ? (p.z - lp.z) / dt : 0 }, yawDeg: p.yawDeg,
      eyes: [beamEyes[0], beamEyes[1]], body: { x: actor.pos.x, z: actor.pos.z }, solid: beamSolid,
    };
    beamLast = { x: p.x, y: p.y, z: p.z };
    beamShown = true;
    if (ph === 'charge') {
      beamFx.setSparkle(beamEyes, actor.beam.glow);
      beamFx.setBeams([], [], false);
      // 予兆の 間は プレイヤーを 見る
      actor.beamLook = null;
    } else if (ph === 'fire') {
      if (beamPrev !== 'fire') { beamAim.begin(aimEnv); beamMark = 0; beamSmoke = 0; sfx.beamOn(); sfx.beamLoopOn(); }
      const r = beamAim.step(dt, aimEnv);
      const a = beamAim.a;
      beamFx.setSparkle(beamEyes, 1);
      beamFx.setBeams(beamEyes, [r.ends[0].end, r.ends[1].end], true);
      actor.beamLook = { x: a.x, y: a.y, z: a.z };
      if (r.reached) {
        beamMark -= dt; beamSmoke -= dt;
        if (beamMark <= 0) { beamMark = K.markEverySec; beamFx.burn(a.x, a.y, a.z); }
        if (beamSmoke <= 0) { beamSmoke = K.smokeEverySec; beamFx.smoke(a.x, a.y, a.z, 1, K.smokeSize); }
        if (K.breakBlocks && blockAt && deps.setBlockAir) {
          for (const e of r.ends) if (e.blocked) deps.setBlockAir(Math.floor(e.end.x), Math.floor(e.end.y), Math.floor(e.end.z));
        }
      }
      if (r.damage > 0) deps.hurt?.(r.damage, { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z });
    } else {
      // 終わり: 光線を 止めて 大きな 煙（最後の 着弾点で）
      if (beamPrev === 'fire') {
        sfx.beamLoopOff(); sfx.smoke();
        const a = beamAim.a;
        beamFx.smoke(a.x, a.y, a.z, K.finaleSmoke, K.finaleSize);
      }
      beamFx.setBeams([], [], false);
      beamFx.setSparkle(beamEyes, actor.beam.glow);
      if (ph === 'recover') actor.beamLook = null;
    }
    beamPrev = ph;
    beamFx.update(dt);
  };
  return { step, aim: beamAim, fx: beamFx, prev: () => beamPrev };
}
