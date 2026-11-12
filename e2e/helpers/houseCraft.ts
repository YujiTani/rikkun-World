import { expect, type Page } from '@playwright/test';
import { CRAFT_RECIPES } from '../../src/craft/recipes';
import { kindItem, STYLES } from '../../src/house/recipes/kinds';
import { learnAllRecipes } from './houseRecipe';
import { openDuoHud, installFakePads } from './duoUi';
import { PAD, invOf, padSteer, stepN, tapE, tapPad } from './duoInv';
import type { HouseIssue } from './house';

/**
 * HOUSE-2C AC20（#364。docs/design/HOUSE-2.md 3.4 版 §3.5・§6.2）の UI 検査と、通しの E2E が 使う 準備。
 * 約束（窓口・data-testid）は src/house/recipes/craftKit.ts の「2C の 約束」: `craft.ui().detail.looks`・`craft.pickLook(item)`・`cp-looks`・`cp-look-<item>`・
 * `house.lookOf(x, y, z)`・`house.placedLook(x, y, z)`。数（カード・案・材料）は 表から（#311）。実装の 前は 案の ボタンが 無くて 赤。
 * 時間では 待たない（step の 数）。
 */

/** 案の ある カード（えんとつ）の 作り方の id ＝ むらの アイテム（表から） */
const ENTOTSU_CARD = kindItem('deco', 'entotsu_mura')!;
/** 作り方の 表の ぜんぶの 材料（1 しゅるいずつ） */
const MATERIALS: string[] = [...new Set(CRAFT_RECIPES.flatMap((r) => r.inputs.map((i) => String(i.item))))];

/** 1 人: レシピを ぜんぶ おぼえ、材料を ぜんぶ 1 こ ずつ 持って、もちもの画面の「つくる」で えんとつの カードを えらんだ 形 */
export async function openCraftHouse(page: Page): Promise<void> {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.step(2);
  });
  await learnAllRecipes(page);
  await fillAllMaterials(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  });
  await selectCard(page, ENTOTSU_CARD);
}

/** 持ち物を からに して 材料を 1 こずつ 入れる（表から。36 マスに 入る） */
async function fillAllMaterials(page: Page): Promise<void> {
  await page.evaluate((mats) => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    for (const m of mats) h.inventory.add(m, 1);
    h.step(3);
  }, MATERIALS);
}

/** 材料を 1 しゅるい だけ 持つ（くらべる 基準の 画面） */
async function fillOneMaterial(page: Page): Promise<void> {
  await page.evaluate((m) => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    h.inventory.add(m, 1);
    h.step(3);
  }, MATERIALS[0]);
}

/** カードを えらぶ（1 回 目の クリック ＝ えらぶだけ。作らない）。えらべたか たしかめる */
async function selectCard(page: Page, id: string): Promise<void> {
  const sel = await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    if (h.craft.ui().selected !== id) h.craft.tileClick(id);
    h.step(3);
    return h.craft.ui().selected as string | null;
  }, id);
  expect(sel, `カード ${id} を えらぶ`).toBe(id);
}

/** 2 人: レシピを ぜんぶ おぼえ、2 人とも 材料を 1 こずつ 持って、2 人用の「つくる」で えんとつの カードを えらんだ 形 */
export async function openDuoCraftHouse(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await learnAllRecipes(page);
  await page.evaluate((mats) => {
    const h = (window as any).__rikkun;
    for (const who of [1, 2] as const) mats.forEach((m, i) => h.duo.give(who, m, 1, i));
    h.step(2);
  }, MATERIALS);
  await tapE(page);
  await tapPad(page, 1, PAD.inventory);
  await page.getByTestId('duo-inv-p1').getByTestId('duo-inv-tab-craft').click();
  await padSteer(page, 'tab:craft');
  await tapPad(page, 1, PAD.confirm);
  await stepN(page, 6);
  await selectCard(page, ENTOTSU_CARD); // 1P
  await padSteer(page, `tile:${ENTOTSU_CARD}`); // 2P: 十字で カードへ → 決定（えらぶ）
  await tapPad(page, 1, PAD.confirm);
  await stepN(page, 6);
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}
interface PanelRead {
  who: 0 | 1 | 2;
  looks: { present: boolean; count: number; btns: Array<{ id: string; tag: string; rect: Rect }>; detail: Rect | null };
  grid: { rect: Rect; client: number; scroll: number; tiles: Rect[] } | null;
  detailScroll: { scroll: number; client: number } | null;
  frame: { w: number; h: number; scale: number } | null;
}

/** 画面（1 人は ぜんたい・2 人用は 1P・2P の パネル）の 数を 読む */
function readPanels(page: Page, duo: boolean): Promise<PanelRead[]> {
  return page.evaluate((duo) => {
    const box = (e: Element): Rect => {
      const b = e.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    };
    const visible = (e: Element): boolean => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const read = (who: 0 | 1 | 2, root: Element): PanelRead => {
      const detail = root.querySelector('.cp-detail');
      const row = root.querySelector('[data-testid="cp-looks"]');
      const btns = Array.from(root.querySelectorAll('[data-testid^="cp-look-"]')).filter(visible);
      const grid = Array.from(root.querySelectorAll<HTMLElement>('.cp-grid.craft-grid, .craft-grid')).find(visible) ?? null;
      const frame = root.querySelector<HTMLElement>('.inv-frame') ?? (root as HTMLElement);
      const m = /^matrix\(([^,]+),/.exec(getComputedStyle(frame).transform);
      return {
        who,
        looks: { present: !!row && visible(row), count: btns.length, btns: btns.map((e) => ({ id: e.getAttribute('data-testid') ?? '', tag: e.tagName, rect: box(e) })), detail: detail ? box(detail) : null },
        grid: grid ? { rect: box(grid), client: grid.clientHeight, scroll: grid.scrollHeight, tiles: Array.from(grid.querySelectorAll('.cp-tile')).filter(visible).map(box) } : null,
        detailScroll: detail ? { scroll: (detail as HTMLElement).scrollHeight, client: (detail as HTMLElement).clientHeight } : null,
        frame: { w: box(frame).w, h: box(frame).h, scale: m ? Number(m[1]) : 1 },
      };
    };
    if (!duo) return [read(0, document.querySelector('#inventory-screen') ?? document.body)];
    return ([1, 2] as const).map((who) => read(who, document.querySelector(`[data-testid="duo-inv-p${who}"]`) ?? document.body));
  }, duo);
}

/**
 * AC20 の 検査（3 つの 大きさ ごと。空 ＝ 合格）。
 * ・案の ボタン 3 つ（STYLES の 数）が 1 行（上の はしが ±1 で そろう）で せつめいの 中・button・どれも 見た目 56×56 以上。せつめいの 中は スクロール なし。
 * ・1 人: 一覧の 見える 高さ ＝ 7 段（7 × マス ＋ 6 × あき ±1）・scrollHeight ＞ clientHeight・画面ぜんたい（.inv-frame）の 大きさと ちぢめの 比が 材料を 1 しゅるい だけ 持った 画面と 同じ（±1 px）。
 * ・十字（パッド）で 一覧の いちばん 下の 行まで 動くと その カードが 一覧の 見える わくの 中（スクロールした）。
 * 2 人用は ちぢめない・一覧は もとから スクロール。
 */
export async function craftHouseIssues(page: Page, duo: boolean): Promise<HouseIssue[]> {
  const out: HouseIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const panels = await readPanels(page, duo);
  for (const p of panels) {
    const name = duo ? `duo-inv-p${p.who}` : 'craft';
    // 案の ボタン
    if (!p.looks.present) add('missing', `${name} cp-looks`, '案の ボタンの 行（cp-looks）が 見えない');
    if (p.looks.count !== STYLES.length) add('looks', `${name} cp-look`, `案の ボタンが ${p.looks.count} こ（${STYLES.length} こ の はず）`);
    const tops = p.looks.btns.map((b) => b.rect.t);
    if (tops.length > 0 && Math.max(...tops) - Math.min(...tops) > 1) add('looks', `${name} cp-look`, `案の ボタンの 上の はしが そろわない（${tops.map((t) => t.toFixed(1)).join(', ')}）`);
    for (const b of p.looks.btns) {
      if (b.tag !== 'BUTTON') add('looks', `${name} ${b.id}`, `button で ない（${b.tag}）`);
      if (b.rect.w < 55.5 || b.rect.h < 55.5) add('size', `${name} cp-look`, `${b.id} が 見た目 ${b.rect.w.toFixed(1)}×${b.rect.h.toFixed(1)}（56×56 以上）`);
      const d = p.looks.detail;
      if (d && (b.rect.l < d.l - 0.5 || b.rect.r > d.r + 0.5 || b.rect.t < d.t - 0.5 || b.rect.b > d.b + 0.5)) add('looks', `${name} cp-look`, `${b.id} が せつめいの 外に はみ出す`);
    }
    if (p.detailScroll && p.detailScroll.scroll > p.detailScroll.client + 1) add('scroll', `${name} cp-detail`, `せつめいの 中が スクロールする（${p.detailScroll.scroll} > ${p.detailScroll.client}）`);
    // 一覧
    if (!p.grid) {
      add('missing', `${name} craft-grid`, 'つくる の 一覧が 見えない');
      continue;
    }
    const rows = [...new Set(p.grid.tiles.map((t) => Math.round(t.t * 10) / 10))].sort((a, b) => a - b);
    if (p.grid.scroll <= p.grid.client) add('scroll', `${name} craft-grid`, `いちばん 多い とき 一覧が スクロールしない（scrollHeight ${p.grid.scroll} ≦ clientHeight ${p.grid.client}）`);
    if (!duo) {
      const t0 = p.grid.tiles[0]!;
      const step = (rows[1] ?? rows[0]! + t0.h) - rows[0]!;
      const seven = 7 * t0.h + 6 * (step - t0.h);
      if (Math.abs(p.grid.rect.h - seven) > 1.5) add('scroll', `${name} craft-grid`, `一覧の 見える 高さ ${p.grid.rect.h.toFixed(1)} が 7 段（${seven.toFixed(1)}）と ちがう`);
    }
  }
  // 1 人: 画面ぜんたいが 材料を 1 しゅるい だけ 持った 画面と 同じ（ちぢめない）
  if (!duo) {
    const full = panels[0]!.frame!;
    await fillOneMaterial(page);
    const ref = (await readPanels(page, false))[0]!.frame!;
    await fillAllMaterials(page);
    await selectCard(page, ENTOTSU_CARD);
    if (Math.abs(full.w - ref.w) > 1 || Math.abs(full.h - ref.h) > 1) add('shrink', 'craft inv-frame', `画面の 大きさが かわる（ぜんぶ ${full.w.toFixed(1)}×${full.h.toFixed(1)}・1 しゅるい ${ref.w.toFixed(1)}×${ref.h.toFixed(1)}）`);
    if (Math.abs(full.scale - ref.scale) > 0.005) add('shrink', 'craft inv-frame', `ちぢめの 比が かわる（ぜんぶ ${full.scale.toFixed(3)}・1 しゅるい ${ref.scale.toFixed(3)}）`);
  }
  // 十字で いちばん 下の 行まで
  const idx = duo ? 1 : 0;
  if (!duo) await installFakePads(page, 1);
  const read = (): Promise<{ last: Rect | null; focus: Rect | null; grid: Rect | null }> =>
    page.evaluate((duoMode) => {
      const root = duoMode ? document.querySelector('[data-testid="duo-inv-p2"]') : document.querySelector('#inventory-screen');
      const box = (e: Element | null): { l: number; t: number; r: number; b: number; w: number; h: number } | null => {
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
      };
      const tiles = Array.from(root?.querySelectorAll('.cp-grid.craft-grid .cp-tile, .craft-grid .cp-tile') ?? []);
      const focus = (duoMode ? root?.querySelector('[data-pad-focus="true"]') : document.activeElement) ?? null;
      return { last: box(tiles[tiles.length - 1] ?? null), focus: focus && focus.classList.contains('cp-tile') ? box(focus) : null, grid: box(root?.querySelector('.craft-grid') ?? null) };
    }, duo);
  // えらんだ カード（えんとつ）が もう いちばん 下の 行に いる ことも ある（2 人用は 列が 少ない）。その ときは 下を 押さない（押すと もちものの マスへ 出る）
  const atLast = (s: { last: Rect | null; focus: Rect | null }): boolean => !!s.last && !!s.focus && Math.abs(s.focus.t - s.last.t) < 1;
  let reached = atLast(await read());
  for (let i = 0; i < 80 && !reached; i++) {
    await tapPad(page, idx, PAD.down);
    reached = atLast(await read());
  }
  if (!reached) add('scroll', duo ? 'duo-inv-p2 craft-grid' : 'craft craft-grid', '十字で 一覧の いちばん 下の 行まで 動けない');
  else {
    await stepN(page, 6);
    const s = await read();
    const f = s.focus!;
    const g = s.grid!;
    if (f.t < g.t - 1 || f.b > g.b + 1) add('scroll', duo ? 'duo-inv-p2 craft-grid' : 'craft craft-grid', `いちばん 下の カードが 一覧の 見える わくの 外（カード ${f.t.toFixed(1)}〜${f.b.toFixed(1)}・わく ${g.t.toFixed(1)}〜${g.b.toFixed(1)}）`);
  }
  if (duo) expect((await invOf(page, 2)).page, '2P は つくる の ページ').toBe('craft');
  return out;
}
