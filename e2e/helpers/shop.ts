import { expect, type Locator, type Page } from '@playwright/test';
import { tapRight } from './houseBuilt';
import { setFakePad } from './duoUi';
import type { P3, TownInfo } from './town';

/**
 * TOWN-1 区切り 1C（よろずや画面・たからばこ。docs/design/TOWN-1-shop.md §2.6・§2.7・§3.2・AC13・AC16・AC19・AC20）の E2E が 使う 部品。実装の 前に 書いた。
 * 窓口の 名前と 形・data-testid の 約束は e2e/town1c.spec.ts の 頭に 書いた（置く 所は developer）。まだ 無ければ「…が まだ ない」で 落ちる（赤）。
 */

export type Who = 1 | 2;

export interface ShopItem {
  id: string;
  price: number;
  canBuy: boolean;
  soldOut: boolean;
}
export interface ShopResultItem {
  item: string;
  count: number;
  rarity: number;
}
export interface ShopState {
  open: boolean;
  dama: number;
  items: ShopItem[];
  selected: string | null;
  result: { box: 'kobako' | 'obako'; items: ShopResultItem[] } | null;
  /** よろずやさんの ふきだしの 文（ない ときは null） */
  bubble: string | null;
  /** その 人が その 箱を あけた 回数（くじの たねの 一部。AC16） */
  opens: { kobako: number; obako: number };
}

/** 窓口 shop[name](...args)。まだ 無ければ 分かりやすく 落とす（実装の 前の 赤） */
export async function shopCall<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  const r = await page.evaluate(
    ({ name, args }) => {
      const t = (window as any).__rikkun.shop;
      const f = t?.[name];
      if (typeof f !== 'function') return { missing: true as const };
      return { value: f.apply(t, args) };
    },
    { name, args },
  );
  expect('missing' in r ? name : null, `window.__rikkun.shop.${name}（TOWN-1 1C の テスト用 フック。e2e/town1c.spec.ts の 頭）が まだ ない`).toBeNull();
  return (r as { value: T }).value;
}
export const shopState = (page: Page, p: Who): Promise<ShopState> => shopCall<ShopState>(page, 'state', p);
export const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);
export const damaOf = (page: Page, p: Who): Promise<number> => page.evaluate((p) => (window as any).__rikkun.dama.count(p) as number, p);
export const countOf = (page: Page, p: Who, item: string): Promise<number> => page.evaluate(([p, item]) => (window as any).__rikkun.duo.count(p, item) as number, [p, item] as const);
export const hpOf = (page: Page, p: Who): Promise<number> => page.evaluate((p) => (window as any).__rikkun.duo.hearts(p).hp as number, p);
export const tid = (page: Page, id: string): Locator => page.getByTestId(id);

/** よろずやさんの 場所（town.info().npcs の shop）と、その 2 マス「戸の ほう」の 立ち場所 */
export function shopStand(info: TownInfo & { npcs: { kind: string; pos: P3 }[]; buildings: { kind: string; door: P3 }[] }): { npc: P3; stand: P3 } {
  const npc = info.npcs.find((n) => n.kind === 'shop')?.pos;
  const door = info.buildings.find((b) => b.kind === 'yorozuya')?.door;
  expect(npc, 'town.info().npcs に shop が いる').toBeTruthy();
  expect(door, 'town.info().buildings に yorozuya が ある').toBeTruthy();
  const dx = door!.x - npc!.x;
  const dz = door!.z - npc!.z;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const stand = { x: Math.floor(npc!.x) + 0.5 + (alongX ? 2 * Math.sign(dx) : 0), y: npc!.y, z: Math.floor(npc!.z) + 0.5 + (alongX ? 0 : 2 * Math.sign(dz)) };
  return { npc: npc!, stand };
}

/** 1P を stand に 置いて よろずやさんの からだの まん中を ねらい（__aim.sOffset の くりかえし）、右クリックで 話す。画面が 開くまで 上限 max ステップ */
export async function talkByClick1P(page: Page, npc: P3, stand: P3, max = 300): Promise<void> {
  await page.evaluate(
    ({ npc, stand }) => {
      const h = (window as any).__rikkun;
      const aim = (window as any).__aim;
      h.input.releaseAll();
      h.player.set({ position: stand, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(2);
      const p = h.player.get().position;
      const t = { x: npc.x, y: npc.y + 0.9, z: npc.z };
      let yaw = 0;
      let pitch = 0;
      for (let i = 0; i < 8; i++) {
        const o = aim.sOffset(yaw, pitch);
        const dx = t.x - (p.x + o.dx);
        const dy = t.y - (p.y + o.dy);
        const dz = t.z - (p.z + o.dz);
        yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
        pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
      }
      h.player.set({ yaw, pitch });
      h.step(1);
      h.lock.simulate(true);
    },
    { npc, stand },
  );
  await tapRight(page);
  for (let i = 0; i < max && !(await shopState(page, 1)).open; i++) await stepN(page, 1);
}

/** 2P を stand に 置いて 建築士さんと 同じ 口（duo.aimAt）で ねらい、ZL（ボタン 6）で 話す */
export async function talkByPad2P(page: Page, npc: P3, stand: P3, max = 300): Promise<void> {
  await page.evaluate(
    ({ npc, stand }) => {
      const h = (window as any).__rikkun;
      h.duo.place(2, stand);
      h.duo.aimAt(2, { x: Math.floor(npc.x), y: Math.floor(npc.y), z: Math.floor(npc.z) });
      h.step(2);
    },
    { npc, stand },
  );
  await setFakePad(page, 1, { buttons: [6] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  for (let i = 0; i < max && !(await shopState(page, 2)).open; i++) await stepN(page, 1);
}
