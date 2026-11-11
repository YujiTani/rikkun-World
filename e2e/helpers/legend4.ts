import { expect, type Page } from '@playwright/test';
import { holdItems } from './blade';

/**
 * LEGEND-4（docs/design/LEGEND-4.md）の E2E 用の 道具。数は 決め打ちせず ゲームに 聞く。
 * 実装の 前は 新しい アイテムが ない ので、`holdLegend` で 赤に なる。
 */

export type V3 = { x: number; y: number; z: number };

/** 新しい レジェンダリーを 0 番に 持つ。登録表に なければ ここで 落ちる */
export async function holdLegend(page: Page, id: string, rest: { item: string; count?: number }[] = []): Promise<void> {
  await holdItems(page, [{ item: id }, ...rest]);
  const n = await page.evaluate((id) => (window.__rikkun as any).inventory.count(id) as number, id);
  expect(n, `${id} が もちものに ない（登録表に まだ ない）`).toBe(1);
}

/** 今の 足もと */
export const feet = (page: Page): Promise<V3> => page.evaluate(() => (window.__rikkun as any).player.get().position as V3);

/** プレイヤーの 体力 */
export const playerHp = (page: Page): Promise<number> => page.evaluate(() => (window.__rikkun as any).combat.get().hp as number);

/** 妖怪の 体力（id ごと） */
export const yokaiHp = (page: Page): Promise<Record<number, number>> =>
  page.evaluate(() => Object.fromEntries(((window.__rikkun as any).yokai.list() as { id: number; hp: number }[]).map((y) => [y.id, y.hp])));

/** 世界の ブロックの 数の 表（くらべる 用） */
export const blockCounts = (page: Page): Promise<Record<string, number>> => page.evaluate(() => (window.__rikkun as any).world.countBlocks() as Record<string, number>);

/** 妖怪の 体の まん中（箱の 高さの 半分あたり）へ 向く pitch を 置く。yaw は 北（0）の まま */
export async function pitchTo(page: Page, id: number): Promise<void> {
  await page.evaluate((id) => {
    const h = window.__rikkun as any;
    const y = (h.yokai.list() as any[]).find((q) => q.id === id);
    const p = h.player.get().position as V3;
    const eye = p.y + 1.5;
    const dz = p.z - y.position.z;
    const dy = y.position.y + 0.8 - eye;
    h.player.set({ pitch: (Math.atan2(dy, dz) * 180) / Math.PI });
    h.step(1);
  }, id);
}

/** n ステップ 進めながら、鳴った 音を ぜんぶ あつめる（`combat.sounds()` は 呼ぶと 空） */
export async function stepCollect(page: Page, n: number): Promise<string[]> {
  return page.evaluate((n) => {
    const h = window.__rikkun as any;
    const out: string[] = [...h.combat.sounds()];
    for (let i = 0; i < n; i++) {
      h.step(1);
      out.push(...h.combat.sounds());
    }
    return out;
  }, n);
}
