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
      /** 体力を 決める（準備用。最大を こえて も よい） */
      setHp: (id: number, hp: number): boolean => m.setHp(id, hp),
      /** 色の段階・暗さ・いまの色（BAL-G。テスト用） */
      palette: (id: number) => m.paletteInfo(id),
      /** 頭の印・ヌシの光（BAL-G。テスト用） */
      marks: (id: number) => m.marksInfo(id),
      /** WEAPON-5: よろけの のこり。よろけて いなければ null */
      stagger: (id: number) => m.stagger(id),
      /** WEAPON-5: すぐ 攻撃を 始めさせる（ai が false でも）。hitInSteps = 当たりを 見るまで（火の玉は 投げるまで）。できなければ null */
      attackNow: (id: number) => m.attackNow(id),
      /** WEAPON-5: 飛んでいる 火の玉（はね返した分も） */
      fireballList: () => m.fireballList(),
      /** COUNTRY-1 §8: その場所で 使う 国の行 × 全体の倍率 */
      spawnWeights: (x: number, z: number) => m.spawnWeights(x, z),
      /** 線にふれる妖怪（テスト用） */
      raycast: (origin: Vec3, dir: Vec3, max: number) => m.raycast(origin, dir, max),
    },
  };
}
