import { expect, type Locator, type Page } from '@playwright/test';
import { tapRight } from './houseBuilt';
import { installAimHelpers } from './aim';
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
export interface Cell3 {
  x: number;
  y: number;
  z: number;
}
/** shop.spots()（1.5。TOWN-1.md §6.1） */
export interface ShopSpot {
  main: Cell3;
  cells: Cell3[];
  front: 'n' | 'e' | 's' | 'w';
  stand: Cell3;
}
/** shop.boxes()（1.5） */
export interface ShopBox {
  spot: number;
  box: 'kobako' | 'obako';
  p: Who;
  n: number;
  tier: 1 | 2 | 3 | 4;
  main: Cell3;
  cells: Cell3[];
  opened: boolean;
  vanishIn: number | null;
}
export interface ShopState {
  open: boolean;
  dama: number;
  items: ShopItem[];
  selected: string | null;
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
export async function talkByClick1P(page: Page, npc: P3, stand: P3, max = 300, isOpen: () => Promise<boolean> = async () => (await shopState(page, 1)).open): Promise<void> {
  await installAimHelpers(page);
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
  for (let i = 0; i < max && !(await isOpen()); i++) await stepN(page, 1);
}

/** 2P を stand に 置いて 建築士さんと 同じ 口（duo.aimAt）で ねらい、ZL（ボタン 6）で 話す */
export async function talkByPad2P(page: Page, npc: P3, stand: P3, max = 300, isOpen: () => Promise<boolean> = async () => (await shopState(page, 2)).open): Promise<void> {
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
  for (let i = 0; i < max && !(await isOpen()); i++) await stepN(page, 1);
}

export const shopBoxes = (page: Page): Promise<ShopBox[]> => shopCall<ShopBox[]>(page, 'boxes');
export const shopSpots = (page: Page): Promise<ShopSpot[]> => shopCall<ShopSpot[]>(page, 'spots');
export const blockAt = (page: Page, c: Cell3): Promise<string> => page.evaluate((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z) as string, c);

/** 実装の 前に 開く 準備（openTown と 同じ。nosave を 使わない 版。reset ＝ true の とき 新しい セーブで 始める） */
export async function openSavedTown(page: Page, query: string, opts: { duo: boolean }): Promise<void> {
  await page.goto(`/?${query}${opts.duo ? '&duo=dev' : ''}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.settings.set('animalAutoSpawn', false);
    h.yokai.clear();
    h.animals.clear();
    h.time.set(20000);
  });
}

/** 前に 立って ねらい（ __aim.sOffset ）、右クリックで あける（1P）。立つ 場所は spot.stand */
export async function openBoxByClick1P(page: Page, spot: ShopSpot): Promise<void> {
  await installAimHelpers(page);
  await page.evaluate((spot) => {
    const h = (window as any).__rikkun;
    const aim = (window as any).__aim;
    h.input.releaseAll();
    h.player.set({ position: { x: spot.stand.x + 0.5, y: spot.stand.y, z: spot.stand.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(2);
    const p = h.player.get().position;
    const t = { x: spot.main.x + 0.5, y: spot.main.y + 0.5, z: spot.main.z + 0.5 };
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
  }, spot);
  await tapRight(page);
}

/** 2P を 前に 置いて ねらい、ZL で あける */
export async function openBoxByPad2P(page: Page, spot: ShopSpot): Promise<void> {
  await page.evaluate((spot) => {
    const h = (window as any).__rikkun;
    h.duo.place(2, { x: spot.stand.x + 0.5, y: spot.stand.y, z: spot.stand.z + 0.5 });
    h.duo.aimAt(2, spot.main);
    h.step(2);
  }, spot);
  await setFakePad(page, 1, { buttons: [6] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
}
