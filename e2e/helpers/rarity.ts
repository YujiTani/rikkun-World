import type { Page } from '@playwright/test';

/** RARITY-7 の E2E の準備。色・形・ことばは決め打ちせず、ゲームの表（__rikkun.rarity.tiers()）に聞く */

export interface TierRow {
  index: number;
  id: string;
  stars: number;
  word: string;
  color: string; // '#rrggbb'
  cssVar: string;
  dropMax: number;
}

export async function readTiers(page: Page): Promise<TierRow[]> {
  return page.evaluate(() => (window as any).__rikkun.rarity.tiers());
}

/** '#rrggbb' を ブラウザの計算された色の書き方 'rgb(r, g, b)' に直す */
export function toRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** 持ち物の画面の開け閉め（toggleInventory を 1 回押す） */
export async function toggleInventory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });
}
