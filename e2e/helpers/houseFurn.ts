import { expect, type Page } from '@playwright/test';
import { standOnGround } from './aim';
import { aimBlock, tapRight, type Pt, type Target } from './houseBuilt';
import { settle, state as bookState, type BookState } from './book';

/**
 * HOUSE-1D（#341 家具の はたらき。docs/design/HOUSE-1.md §2.12・AC28・AC54、docs/tickets/HOUSE-1D.md）の E2E が 使う 準備。
 * フック（house.seat）・ほんだなの 本の 約束は e2e/helpers/house.ts の 先頭（「1D の 約束」）。
 * 座標・向きは 決め打ちしない: 立つ 場所は ゲーム（window.__rikkun）に 聞き、ねらいは `target.get()` で 確かめる。
 */

export interface SeatNow {
  kind: 'sit' | 'bath';
  block: Pt;
  position: Pt;
}

/** 窓口 `house.seat()`。無ければ ここで 分かりやすく 落ちる（実装の 前の 赤） */
export async function seatNow(page: Page): Promise<SeatNow | null> {
  const r = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    if (typeof h.house?.seat !== 'function') return 'NO_HOOK';
    return h.house.seat() ?? null;
  });
  expect(r, 'window.__rikkun.house.seat（1D の テスト用 フック。e2e/helpers/house.ts の 先頭）が まだ ない').not.toBe('NO_HOOK');
  return r as SeatNow | null;
}

/** 平らな 場所に 立ち、その 北 2 マスの 床の 上の マスに id の ブロックを 1 つ 置く。立つ 場所・置いた マス（ゲームの 地面の 高さから 作る） */
export async function standFacingBlock(page: Page, id: string): Promise<{ stand: Pt; block: Pt }> {
  const sp = await page.evaluate(() => {
    const s = (window as any).__rikkun.world.spawn();
    return { x: s.x as number, z: s.z as number };
  });
  const { floorY } = await standOnGround(page, sp.x, sp.z, { yaw: 0 });
  const stand: Pt = { x: sp.x, y: floorY + 1, z: sp.z };
  const block: Pt = { x: Math.floor(sp.x), y: floorY + 1, z: Math.floor(sp.z) - 2 };
  await putBlock(page, block, id);
  return { stand, block };
}

/** ブロックを 1 つ 置きかえて 2 ステップ 進める（光・メッシュが おいつく） */
export const putBlock = (page: Page, p: Pt, id: string): Promise<void> =>
  page.evaluate(
    ({ p, id }) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(p.x, p.y, p.z, id);
      h.step(2);
    },
    { p, id },
  );

/** ブロックを ねらって（横の 面の まん中）右クリックを 1 回。ねらいに のった ブロックと、押す前の 右の 案内を 返す */
export async function useBlock(page: Page, stand: Pt, block: Pt): Promise<{ aimed: Target | null; hint: { icon: string; word: string } | null }> {
  await page.evaluate(
    ({ stand }) => {
      const h = (window as any).__rikkun;
      h.input.releaseAll();
      h.player.set({ position: stand, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(2);
    },
    { stand },
  );
  const aimed = await aimBlock(page, block, 0.5);
  const hint = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    return h.hud.actionHint().right ?? null;
  });
  await tapRight(page);
  return { aimed, hint };
}

/** 本の 動きが おわるまで 進めて、本の 窓口の 値を 返す */
export async function bookAfter(page: Page): Promise<BookState> {
  await settle(page);
  return bookState(page);
}
