/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)）: 少女が ねらう 人。ワープして あらわれる ステップで 近い 方を 決め（createAimLock）、
 * その 魔法の あいだは かえない。player・hurt・パリィ・ハート・カメラは「ねらった 人」の 口を 使う。
 * deps.targets が なければ（1 人の ときの 従来の 形）今の deps.player / hurt / parry / hp を そのまま 使う（AC113）。
 * 少女の パリィは 4d-1 の あとの つなぎ（2P は parry の 口が なければ 'none'＝そのままの ダメージ）。
 */
import type { Camera } from 'three';
import type { GashaGirlDeps } from './gashaGirlTypes';
import { aimedHearts, askAimedParry, createAimLock, facingCamera, pickTarget, type GashaTarget } from './gashaTargets';

type V3 = { x: number; y: number; z: number };
type GirlPlayer = { x: number; y: number; z: number; yawDeg: number; vx: number; vz: number };
type ParryAsk = Parameters<GashaGirlDeps['parry']>[0];

export interface GirlAim {
  /** ワープして あらわれる ステップで 呼ぶ（ねらう 人を 決める） */
  begin(): void;
  player(): GirlPlayer;
  hurt(amount: number, from: V3): boolean;
  parry(h: ParryAsk): ReturnType<GashaGirlDeps['parry']>;
  hearts(): { hp: number; maxHp: number };
  /** 板の 絵・目が 合う しらべが 見る カメラ */
  camera(): Camera;
  /** ねらっている 人（1 人の ときは いつも 1。だれも いなければ null） */
  who(): 1 | 2 | null;
}

export function createGirlAim(deps: GashaGirlDeps, from: () => V3): GirlAim {
  const lock = createAimLock();
  const scratch: GirlPlayer = { x: 0, y: 0, z: 0, yawDeg: 0, vx: 0, vz: 0 };
  /** ねらった 人（決めた 人が いれば その人。まだ なければ 今 近い 人） */
  const aimed = (): GashaTarget | null => {
    if (!deps.targets) return null;
    const list = deps.targets();
    return lock.live(list) ?? (lock.who() === null ? pickTarget(list, from()) : null);
  };
  return {
    begin() { if (deps.targets) lock.start(deps.targets(), from()); },
    player() {
      const t = aimed();
      if (!t) {
        const sp = lock.spot();
        if (!sp) return deps.player();
        scratch.x = sp.x; scratch.y = sp.y; scratch.z = sp.z; scratch.vx = 0; scratch.vz = 0;
        return scratch;
      }
      const p = t.pos, v = t.body?.().velocity;
      scratch.x = p.x; scratch.y = p.y; scratch.z = p.z; scratch.yawDeg = t.yawDeg;
      scratch.vx = v?.x ?? 0; scratch.vz = v?.z ?? 0;
      return scratch;
    },
    hurt(amount, at) {
      if (!deps.targets) return deps.hurt(amount, at);
      return aimed()?.hurt?.(amount, at) ?? false;
    },
    parry(h) {
      if (!deps.targets) return deps.parry(h);
      return askAimedParry(aimed(), h);
    },
    hearts: () => (deps.targets ? aimedHearts(aimed(), () => ({ hp: deps.hp(), maxHp: deps.maxHp() })) : { hp: deps.hp(), maxHp: deps.maxHp() }),
    camera: () => (deps.targets ? facingCamera(aimed(), deps.camera) : deps.camera),
    who: () => (deps.targets ? (aimed()?.who ?? null) : 1),
  };
}
