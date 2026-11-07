/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「ねらう 人」）: がしゃどくろが ねらう 人。
 * わざを 始める ステップで 近い 方（3 次元の 直線・倒れて いる 人は のぞく・同じなら 1P）を 決め、わざの とちゅうでは かえない（gashaTargets.ts の AimLock）。
 * わざの 外では 今 いちばん 近い 人。ねらう わざ（光線・噴火の ねらい・雷の ねらいなど）は「ねらった 人」の 口（player・hurt…）を 使う。
 * 数は ここに ない（式は gashaTargets.ts）。毎ステップ 新しい 物を 作らない。
 */
import { createAimLock, pickTarget, type GashaTarget } from './gashaTargets';

type V3 = { x: number; y: number; z: number };
type PlayerNow = { x: number; y: number; z: number; yawDeg: number };

/** ある 1 人の 口を 1 人用の 形（player・hurt・のせる・押す…）で 見せる もの。宛先は 呼ぶ たびに 決める */
interface PersonView {
  player(): PlayerNow;
  hurt(amount: number, from: V3): boolean;
  setPlayerVelocity(v: V3): void;
  carryPlayer(dx: number, dy: number, dz: number, dYawDeg: number): void;
  nudgePlayer(dx: number, dz: number): void;
  hitStop(ticks: number): void;
  shake(amount: number): void;
}

export interface BigAim {
  /** 人の 一覧 */
  targets(): readonly GashaTarget[];
  /** 今 ねらっている 人（わざの 最中は 決めた 人。それ以外は 今 いちばん 近い 人）。だれも ねらえない ときは null */
  who(): 1 | 2 | null;
  /** ねらった 人（わざの 最中は 決めた 人。倒れて いても その人）。なければ null */
  target(): GashaTarget | null;
  /** わざを 始める（このステップで ねらう 人を 決める） */
  begin(): void;
  /** わざが おわった・体を しまった（ねらいを はずす） */
  clear(): void;
  /** ねらった 人を 1 人用の 形で 見せる（だれも いなければ fallback の 人） */
  aimed: PersonView;
  /** 人ごとの 口を 1 人用の 形で 見せる（宛先は 毎回 resolve で 決める。とどめを さした 人など） */
  viewOf(resolve: () => GashaTarget | null): PersonView;
}

export interface BigAimDeps {
  targets(): readonly GashaTarget[];
  /** がしゃどくろの 場所（近さを くらべる 基準） */
  from(): V3;
  /** 一覧が 空の ときの 人（今の deps.player） */
  fallback(): PlayerNow;
}

export function createBigAim(d: BigAimDeps): BigAim {
  const lock = createAimLock();
  /** 倒れて いる 人も ふくめて いちばん 近い 人（ねらいは なくても 体が 向く 先） */
  const nearestAny = (list: readonly GashaTarget[]): GashaTarget | null => {
    const f = d.from();
    let best: GashaTarget | null = null, bd = Infinity;
    for (const t of list) {
      const p = t.pos, dist = Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z);
      if (best === null || dist < bd || (dist === bd && t.who < best.who)) { best = t; bd = dist; }
    }
    return best;
  };
  const target = (): GashaTarget | null => {
    const list = d.targets();
    if (lock.who() !== null) return lock.live(list);
    return pickTarget(list, d.from());
  };
  const viewTarget = (): GashaTarget | null => {
    const t = target();
    if (t) return t;
    if (lock.who() !== null) return null; // 決めた 人が やめた
    return nearestAny(d.targets());
  };
  const viewOf = (resolve: () => GashaTarget | null): PersonView => {
    const scratch: PlayerNow = { x: 0, y: 0, z: 0, yawDeg: 0 };
    let lastYaw = 0;
    return {
      player() {
        const t = resolve();
        if (t) {
          const p = t.pos;
          scratch.x = p.x; scratch.y = p.y; scratch.z = p.z; scratch.yawDeg = lastYaw = t.yawDeg;
          return scratch;
        }
        const sp = lock.spot();
        if (sp) { scratch.x = sp.x; scratch.y = sp.y; scratch.z = sp.z; scratch.yawDeg = lastYaw; return scratch; }
        return d.fallback();
      },
      hurt: (a, f) => resolve()?.hurt?.(a, f) ?? false,
      setPlayerVelocity: (v) => { resolve()?.setVelocity?.(v); },
      carryPlayer: (dx, dy, dz, dYaw) => { resolve()?.carry?.(dx, dy, dz, dYaw); },
      nudgePlayer: (dx, dz) => { resolve()?.nudge?.(dx, dz); },
      hitStop: (n) => { resolve()?.hitStop?.(n); },
      shake: (a) => { resolve()?.shake?.(a); },
    };
  };
  return {
    targets: d.targets,
    who: () => lock.who() ?? pickTarget(d.targets(), d.from())?.who ?? null,
    target,
    begin() { lock.start(d.targets(), d.from()); },
    clear() { lock.clear(); },
    aimed: viewOf(viewTarget),
    viewOf,
  };
}
