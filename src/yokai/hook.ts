import type { Vec3, YokaiKind } from '../contracts';
import type { SpawnOptions, YokaiManager } from './ai/YokaiManager';

/** `window.__rikkun.yokai`（M3 §6.1）を返す */
export function createYokaiHook(m: YokaiManager) {
  return {
    yokai: {
      spawn: (kind: YokaiKind, x: number, y: number, z: number, opts?: SpawnOptions): number => m.spawn(kind, x, y, z, opts),
      list: () => m.list(),
      clear: (): void => m.clear(),
      /** 前に呼んでから起きた出来事（呼ぶと空になる）。spawn・attackStart・attackHit・fireball・fireballEnd・hurt・defeat・leave・remove・drop */
      events: () => m.takeHookEvents(),
      /** 飛んでいる火の玉の数 */
      fireballs: (): number => m.fireballCount(),
      /** 線にふれる妖怪（テスト用） */
      raycast: (origin: Vec3, dir: Vec3, max: number) => m.raycast(origin, dir, max),
    },
  };
}
