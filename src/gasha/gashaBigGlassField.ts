/**
 * #308 gashaBig.ts を 分けた もの: ガラスの 雲の 割れ・生えなおし。割れた マスは 順番待ちに 入れて、古い 順に 1 つずつ もどす。
 */
import { Vector3 } from 'three';
import type { BigModel, GlassCell } from './gashaBigTypes';
import type { GashaBigDeps } from './gashaBigDeps';
import { TUNE as T } from './gashaBigTuning';

export interface GlassEnv {
  model(): BigModel | null;
  deps: Pick<GashaBigDeps, 'player' | 'onGlassBreak'>;
}

export interface GlassField {
  /** ガラスの 雲を 割る。center から radius いないの マスを 近い 順に 最大 max 個（プレイヤーが ほる ときは 1 個）。割れた 数を 返す */
  breakGlass(c: { x: number; y: number; z: number }, radius: number, max?: number): number;
  /** 毎コマ: 割れた マスを 古い 順に 1 つずつ もどす */
  step(dt: number): void;
  /** もどるのを 待っている 数 */
  brokenCount(): number;
  /** 順番待ちを 空に する（体を 作りなおす とき。時計は そのまま） */
  clear(): void;
}

export function createGlassField(env: GlassEnv): GlassField {
  const deps = env.deps;
  // ガラスの 雲: 割れた マスの 順番待ち（古い 順に 1 つずつ もどる）
  const brokenQ: { gc: GlassCell; t: number }[] = [];
  let glassClock = 0, lastRegen = -1e9;
  const glassWorld = (gc: GlassCell, out: Vector3): Vector3 => {
    const m = env.model()!;
    return out.copy(gc.local).sub(m.rest[gc.joint]).applyMatrix4(m.joints[gc.joint].matrixWorld);
  };
  const breakGlass = (c: { x: number; y: number; z: number }, radius: number, max = Infinity): number => {
    const model = env.model();
    if (!model) return 0;
    model.group.updateMatrixWorld(true);
    const v = new Vector3(), found: { gc: GlassCell; d: number; at: { x: number; y: number; z: number } }[] = [];
    for (const gc of model.glass) {
      const mk = model.hits[gc.hit]?.mask;
      if (!mk || mk.on[gc.cell] !== 1) continue;
      glassWorld(gc, v);
      const d = Math.hypot(v.x - c.x, v.y - c.y, v.z - c.z);
      if (d <= radius) found.push({ gc, d, at: { x: v.x, y: v.y, z: v.z } });
    }
    found.sort((p, q) => p.d - q.d);
    const done: { x: number; y: number; z: number }[] = [];
    for (const f of found.slice(0, max)) {
      model.setGlass(f.gc, false);
      brokenQ.push({ gc: f.gc, t: glassClock });
      done.push(f.at);
    }
    if (done.length) deps.onGlassBreak?.(done);
    return done.length;
  };
  const step = (dt: number): void => {
    glassClock += dt;
    const model = env.model();
    const G = T.glass, q = brokenQ[0];
    if (!model || !q || glassClock - q.t < G.regenDelaySec || glassClock - lastRegen < G.regenGapSec) return;
    // プレイヤーが その マスの 中に いる あいだは もどさない（うまらない ように）
    const p = deps.player(), v = glassWorld(q.gc, new Vector3());
    if (Math.abs(p.x - v.x) < 1.3 && Math.abs(p.z - v.z) < 1.3 && p.y > v.y - 2.2 && p.y < v.y + 1.2) return;
    brokenQ.shift();
    model.setGlass(q.gc, true);
    lastRegen = glassClock;
  };
  return { breakGlass, step, brokenCount: () => brokenQ.length, clear: () => { brokenQ.length = 0; } };
}
