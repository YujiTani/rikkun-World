import { expect, type Page } from '@playwright/test';
import { talkByClick1P, talkByPad2P, type Who } from './shop';
import type { P3, TownInfo } from './town';

/**
 * TOWN-1 区切り 1E（かえりの おふだ・かじやさん・やたい・食事。docs/design/TOWN-1-shop.md §2.10〜§2.13・§3.2・AC32〜37・AC48・AC49）の E2E が 使う 部品。実装の 前に 書いた。
 * 窓口・data-testid の 約束は e2e/town1e.spec.ts の 頭。まだ 無ければ「…が まだ ない」で 落ちる（赤）。
 */

export type Screen = 'smith' | 'stall' | 'meal';
export type Vendor = 'smith' | 'kaitori' | 'dango' | 'gohan';

export interface Dura {
  max: number;
  left: number;
}
export interface SmithItem {
  slot: number | string;
  item: string;
  durability: number;
  max: number;
  price: number;
  canFix: boolean;
}
export interface SmithState {
  open: boolean;
  items: SmithItem[];
}
export interface StallRow {
  item: string;
  need: number;
  have: number;
  canGive: boolean;
}
export interface StallState {
  open: boolean;
  today: number;
  cap: number;
  rows: StallRow[];
}

/** 窓口 __rikkun[group][name](...args)。まだ 無ければ 分かりやすく 落とす（実装の 前の 赤） */
export async function hookCall<T>(page: Page, group: string, name: string, ...args: unknown[]): Promise<T> {
  const r = await page.evaluate(
    ({ group, name, args }) => {
      const t = (window as any).__rikkun[group];
      const f = t?.[name];
      if (typeof f !== 'function') return { missing: true as const };
      return { value: f.apply(t, args) };
    },
    { group, name, args },
  );
  expect('missing' in r ? `${group}.${name}` : null, `window.__rikkun.${group}.${name}（TOWN-1 1E の テスト用 フック。e2e/town1e.spec.ts の 頭）が まだ ない`).toBeNull();
  return (r as { value: T }).value;
}

export const smithState = (page: Page, p: Who): Promise<SmithState> => hookCall<SmithState>(page, 'smith', 'state', p);
export const stallState = (page: Page, p: Who): Promise<StallState> => hookCall<StallState>(page, 'stall', 'state', p);
export const ofudaCharging = async (page: Page, p: Who): Promise<number | null> => (await hookCall<{ charging: number | null }>(page, 'ofuda', 'state', p)).charging;
export const duoDurability = (page: Page, p: Who, slot: number): Promise<Dura | null> => hookCall<Dura | null>(page, 'duo', 'durability', p, slot);
export const duoSetDurability = (page: Page, p: Who, slot: number, left: number): Promise<unknown> => hookCall(page, 'duo', 'setDurability', p, slot, left);
export const duoPos = (page: Page, p: Who): Promise<P3> => page.evaluate((p) => (window as any).__rikkun.duo.pos(p) as P3, p);

/** その 画面が 開いて いるか（画面の 根の data-testid と data-owner。2 人の ときは 開いた 人の 画面だけ DOM に ある） */
export const screenOpen = (page: Page, s: Screen, p: Who): Promise<boolean> =>
  page.evaluate(([s, p]) => !!document.querySelector(`[data-testid="${s}-screen"][data-owner="${p}"]`), [s, p] as const);

interface NpcInfo extends TownInfo {
  npcs: { kind: string; pos: P3; yaw?: number }[];
  stalls: { kind: string; pos: P3; talk: boolean }[];
  buildings: { kind: string; door: P3 }[];
}

/**
 * 話しかける 人の 場所と、その 人の 「前」へ 2 マスの 立ち場所（よろずやと 同じ 考え方）。前の 向き ＝ かじや は 建物の 戸口、やたいの 3 人は 同じ かんばんの やたいの 前に 立つ マス（stalls の pos）の ほう。
 * 決め打ちの 座標は 使わない（town.info() に 聞く）。
 */
export function vendorStand(infoIn: TownInfo, v: Vendor): { npc: P3; stand: P3 } {
  const info = infoIn as NpcInfo;
  const npcKind = v === 'smith' ? 'smith' : v === 'kaitori' ? 'stall' : v;
  const npc = info.npcs.find((n) => n.kind === npcKind)?.pos;
  expect(npc, `town.info().npcs に ${npcKind} が いる（1E で 人が 入る）`).toBeTruthy();
  const toward = v === 'smith' ? info.buildings.find((b) => b.kind === 'kajiya')?.door : info.stalls.find((s) => s.kind === v && s.talk)?.pos;
  expect(toward, v === 'smith' ? 'town.info().buildings に kajiya が ある' : `town.info().stalls に 話せる ${v} が ある`).toBeTruthy();
  const dx = toward!.x - npc!.x;
  const dz = toward!.z - npc!.z;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const stand = { x: Math.floor(npc!.x) + 0.5 + (alongX ? 2 * Math.sign(dx) : 0), y: npc!.y, z: Math.floor(npc!.z) + 0.5 + (alongX ? 0 : 2 * Math.sign(dz)) };
  return { npc: npc!, stand };
}

/** 話して その 画面が 開くまで（1P ＝ 右クリック・2P ＝ ZL）。画面は 話した 人の 根（data-owner）で 見る */
export async function talkVendor(page: Page, p: Who, v: Vendor, info: TownInfo, screen: Screen, max = 300): Promise<void> {
  const { npc, stand } = vendorStand(info, v);
  const isOpen = (): Promise<boolean> => screenOpen(page, screen, p);
  if (p === 1) await talkByClick1P(page, npc, stand, max, isOpen);
  else await talkByPad2P(page, npc, stand, max, isOpen);
}

/** 「たいきゅうが へった かたな」を slot に 置く（left ＝ のこりの たいきゅう）。max は 返す */
export async function giveWornKatana(page: Page, p: Who, slot: number, leftOf: (max: number) => number): Promise<Dura> {
  await page.evaluate(([p, slot]) => (window as any).__rikkun.duo.give(p, 'katana', 1, slot), [p, slot] as const);
  const d = await duoDurability(page, p, slot);
  expect(d, `${p}P の ホットバー ${slot} に かたなが ある`).toBeTruthy();
  await duoSetDurability(page, p, slot, leftOf(d!.max));
  const d2 = await duoDurability(page, p, slot);
  expect(d2!.left, 'たいきゅうが へった').toBeLessThan(d2!.max);
  return d2!;
}
