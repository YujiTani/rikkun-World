import { expect, type Page } from '@playwright/test';
import { openHouse, press, stepUi, type HouseIssue } from './house';
import { LAYOUT, EDITOR_ROOTS, NEED_ROOTS, ed, edit as editRaw, firstArchitect, layoutTableIssues, openEditorFast, readButtons, setForm, type DomBtn } from './houseEditor';

/**
 * HOUSE-2A（#364 レシピを 見つけて えらぶ。docs/tickets/HOUSE-2A.md・仕様 docs/design/HOUSE-2.md）の E2E の 道具。
 * 約束（窓口・ボタンの id・data-testid）は e2e/helpers/house.ts の 先頭「2A の 約束」。レシピの 数は どこにも 書かない（recipes().all から）。
 */

export interface Recipes {
  learned: string[];
  fresh: string[];
  all: string[];
}
export interface RecipeBand {
  text: string;
  ticksLeft: number;
}
/** editor() の 2A で 足される 部分 */
export interface RecipeEd {
  part: string;
  roof: string;
  wall: string;
  windowKind: string;
  door: string;
  deco: string[];
  light: string;
  marks: string[];
  preview: { glow: { door: boolean; cells: unknown[]; left: number | null; parts?: string[] } | null; angle: number } | null;
}
export const recipeEd = async (page: Page): Promise<RecipeEd> => (await ed(page)) as unknown as RecipeEd;

/** 新しい op（part・wall・door・deco・light）も 送る（型の 表には まだ 無い） */
const edit = (page: Page, op: Record<string, unknown>): Promise<boolean> => editRaw(page, op as never);

export const recipes = (page: Page): Promise<Recipes> => page.evaluate(() => (window as any).__rikkun.house.recipes());
export const learn = (page: Page, id: string): Promise<boolean> => page.evaluate((id) => (window as any).__rikkun.house.learn(id), id);
export const recipeBand = (page: Page): Promise<RecipeBand | null> => page.evaluate(() => (window as any).__rikkun.house.recipeBand());

/** 画面の おぼえた テロップ（data-testid="recipe-band"）が 消えるまで 進める。上限は ステップ数（時間では 待たない） */
export async function waitBandGone(page: Page, max = 6000): Promise<void> {
  const left = await page.evaluate((max) => {
    const h = (window as any).__rikkun;
    let n = 0;
    while (h.house.recipeBand() && n < max) {
      h.step(30);
      n += 30;
    }
    h.step(2);
    return h.house.recipeBand();
  }, max);
  expect(left, 'おぼえた テロップが 消える').toBeNull();
}

/** ぜんぶ おぼえる（窓口 learn）。テロップが 消えるまで 進める */
export async function learnAllRecipes(page: Page): Promise<number> {
  const all = (await recipes(page)).all;
  expect(all.length, '表の レシピ').toBeGreaterThan(0);
  for (const id of all) expect(await learn(page, id), `${id} を おぼえる`).toBe(true);
  await waitBandGone(page);
  return all.length;
}

const col = async (page: Page): Promise<0 | 1 | 2> => page.evaluate(() => (innerWidth <= 1100 ? 0 : innerWidth <= 1360 ? 1 : 2));

// ---------------------------------------------------------------- UI 検査（AC10）

export type RecipeScreen = 'soto' | 'naka' | 'namae' | 'need';

/** ぜんぶ おぼえた 世界で、いちばん 多い 形の 画面を 出す（AC10: ① ばしょ 5・しゅるい 5、② 家具 14・あかり 3、③ 後ろの 文字 8、ひつような もの 17 行） */
export async function openRecipeScreen(page: Page, kind: RecipeScreen): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHouse(page);
  await learnAllRecipes(page);
  await openEditorFast(page, (await firstArchitect(page)).id); // エディターを 窓口で 開く
  const next = async (n: number) => {
    for (let i = 0; i < n; i++) await press(page, 'next');
  };
  if (kind === 'soto' || kind === 'need') {
    expect(await edit(page, { op: 'size', w: 9, d: 9 }), '大きさ 9×9').toBe(true);
    const max = (await ed(page)).windowMax;
    for (let i = 0; i < max; i++) await edit(page, { op: 'windows', delta: 1 });
    expect(await edit(page, { op: 'part', part: 'roof' }), 'やねの ばしょ').toBe(true);
  }
  if (kind === 'need') {
    // 材料 17 しゅるい: 10 しゅるい（き・いし・かみ・ぬの・いと・てつ・くさ・たいまつ・あぶら・ねんど）＋ かわら・しっくい・レンガ・すいしょう・ほたるいし・きん・はな
    for (const [op, k] of [['roof', 'kawara'], ['wall', 'shikkui'], ['windowKind', 'maru'], ['light', 'suisho'], ['deco', 'hanadan'], ['deco', 'shachi'], ['deco', 'entotsu']] as const) {
      expect(await edit(page, { op, kind: k }), `${op} ${k}`).toBe(true);
    }
    await setForm(page, {
      furniture: [
        { kind: 'futon', x: 0, z: 0 }, { kind: 'tansu', x: 2, z: 0 }, { kind: 'nukunuku', x: 5, z: 0 }, { kind: 'andon', x: 8, z: 0 },
        { kind: 'haniwa', x: 0, z: 4 }, { kind: 'furnace', x: 2, z: 4 },
      ],
    });
    expect(await edit(page, { op: 'place', kind: 'maneki', x: 6, z: 6 }), 'まねきねこ').toBe(true);
    await press(page, 'need');
  }
  if (kind === 'naka' || kind === 'namae') {
    await next(1);
    expect((await ed(page)).step).toBe('naka');
    if (kind === 'namae') {
      await setForm(page, { front: 'あいうえおかきく', back: 'のとりで' });
      await next(1);
      expect((await ed(page)).step).toBe('namae');
    }
  }
  await stepUi(page, 110);
}

export const RECIPE_GATE: { id: string; kind: RecipeScreen; roots: string[] }[] = [
  { id: 'house-editor-soto-recipes', kind: 'soto', roots: EDITOR_ROOTS },
  { id: 'house-editor-naka-recipes', kind: 'naka', roots: EDITOR_ROOTS },
  { id: 'house-editor-namae-recipes', kind: 'namae', roots: EDITOR_ROOTS },
  { id: 'house-need-recipes', kind: 'need', roots: NEED_ROOTS },
];

const sameRow = (bs: DomBtn[]): boolean => bs.every((b) => Math.abs(b.rect.y - bs[0]!.rect.y) <= 4);
const SQUARE = (bs: DomBtn[], want: number, tol = 1.5): string[] => bs.filter((b) => Math.abs(b.rect.w - want) > tol || Math.abs(b.rect.h - want) > tol).map((b) => `${b.id} ${b.rect.w.toFixed(1)}×${b.rect.h.toFixed(1)}`);

/** ボタンの 字が 1 行（折りかえさない）。字を 持たない（絵だけの）ボタンは 対象に しない。1 行に ならない ボタンの id を 返す */
async function wrapped(page: Page, ids: string[]): Promise<string[]> {
  return page.evaluate((ids) => {
    const out: string[] = [];
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="house-btn-${id}"]`);
      if (!el) continue;
      const c = el.cloneNode(true) as Element;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      if (!(c.textContent ?? '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set<number>();
      for (const r of Array.from(range.getClientRects())) if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top / 4));
      if (tops.size > 1) out.push(id);
    }
    return out;
  }, ids);
}

/** AC10: ぜんぶ おぼえた 世界の 画面の 数・ならび・大きさ。はみ出す・重なる・字の 大きさ・押せる 大きさは 共通の 検査（editorUiIssues）が 見る */
export async function recipeGateIssues(page: Page, kind: RecipeScreen): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  const issue = (target: string, detail: string) => found.push({ kind: 'recipe', target, detail });
  const c = await col(page);
  const bs = (await readButtons(page)).filter((b) => b.scope === (kind === 'need' ? 'need' : 'editor'));
  const mainBtn = LAYOUT.mainBtn[c];

  if (kind === 'soto') {
    found.push(...(await layoutTableIssues(page, 'soto')));
    const parts = bs.filter((b) => b.id.startsWith('part-'));
    const kinds = bs.filter((b) => /^(roof|wall|windowKind|door|deco)-/.test(b.id));
    if (parts.length !== 5) issue('ばしょの ボタン', `${parts.length} こ（5 こ: やね・かべ・まど・と・かざり）`);
    if (kinds.length !== 5) issue('しゅるいの ボタン', `${kinds.length} こ（やねで 5 こ）`);
    for (const [name, list] of [['ばしょ', parts], ['しゅるい', kinds]] as const) {
      if (list.length > 0 && !sameRow(list)) issue(`${name}の ボタン`, '1 つの 行に ならばない');
      const bad = SQUARE(list, mainBtn);
      if (bad.length > 0) issue(`${name}の ボタンの 大きさ`, `${bad.slice(0, 3).join(' ／ ')}（表は 正方形 ${mainBtn}px）`);
    }
    if (parts.length > 0 && kinds.length > 0 && !(Math.max(...parts.map((b) => b.rect.y)) < Math.min(...kinds.map((b) => b.rect.y)))) issue('ならび', 'ばしょの 行が しゅるいの 行の 上に ない');
    if (parts.filter((b) => b.pressed).length !== 1) issue('えらんで いる ばしょ', `✓ が ${parts.filter((b) => b.pressed).length} こ（1 こ）`);
    const widest = parts.length > 0 ? Math.max(...parts.map((b) => b.rect.x + b.rect.w)) - Math.min(...parts.map((b) => b.rect.x)) : 0;
    const panel = c === 0 ? 356 : c === 1 ? 432 : 468; // パネルの 中の はば（仕様 §3.2。388・480・532 − 内がわ×2）
    if (widest > panel + 1.5) issue('ばしょの 行の はば', `${widest.toFixed(1)}px（${panel}px 以内）`);
    const name = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-testid="editor-kind-name"]')).find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { h: r.height, text: (el.textContent ?? '').replace(/\s+/g, ''), fs: parseFloat(getComputedStyle(el).fontSize), scrollH: (el as HTMLElement).scrollHeight, clientH: (el as HTMLElement).clientHeight };
    });
    if (!name) issue('名前の 行', 'editor-kind-name が 見えない');
    else {
      if (name.fs < 23.95) issue('名前の 行', `字が ${name.fs}px（24px 以上）`);
      if (name.h > 40 * 1.5 + 1.5 || name.scrollH > name.clientH + 1) issue('名前の 行', `1 行に おさまらない（高さ ${name.h.toFixed(1)}px）`);
    }
    const w = await wrapped(page, [...parts, ...kinds].map((b) => b.id));
    if (w.length > 0) issue('ボタンの 字', `1 行に ならない: ${w.join('・')}`);
  }

  if (kind === 'naka') {
    const fb = bs.filter((b) => b.id.startsWith('furniture-')).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const rows: DomBtn[][] = [];
    for (const b of fb) {
      const row = rows.find((r) => Math.abs(r[0]!.rect.y - b.rect.y) <= 4);
      if (row) row.push(b);
      else rows.push([b]);
    }
    if (fb.length !== 14) issue('家具の ボタン', `${fb.length} こ（14 しゅるい）`);
    if (JSON.stringify(rows.map((r) => r.length)) !== JSON.stringify([7, 7])) issue('家具の ならび', `${JSON.stringify(rows.map((r) => r.length))}（上 7・下 7）`);
    if (rows.at(-1)?.at(-1)?.id !== 'furniture-maneki') issue('家具の ならび', 'まねきねこが 下の だんの いちばん 右に ない');
    const bad = SQUARE(fb, mainBtn);
    if (bad.length > 0) issue('家具の ボタンの 大きさ', `${bad.slice(0, 3).join(' ／ ')}（表は 正方形 ${mainBtn}px）`);
    const lights = bs.filter((b) => b.id.startsWith('light-'));
    if (lights.length !== 3) issue('あかりの ボタン', `${lights.length} こ（3 こ）`);
    else {
      if (!sameRow(lights)) issue('あかりの ボタン', '1 つの 行に ならばない');
      const badL = SQUARE(lights, mainBtn);
      if (badL.length > 0) issue('あかりの ボタンの 大きさ', `${badL.join(' ／ ')}（表は 正方形 ${mainBtn}px）`);
      const furBottom = Math.max(...fb.map((b) => b.rect.y + b.rect.h));
      if (lights[0]!.rect.y < furBottom - 1.5) issue('あかりの わく', '家具の ボタンの 下の 行に ない');
    }
    const pv = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-testid="editor-preview"]')).find((e) => e.getBoundingClientRect().width > 0);
      const r = el?.getBoundingClientRect();
      return r ? { w: r.width, h: r.height } : null;
    });
    const [pw, ph] = LAYOUT.previewNaka[c];
    if (!pv || Math.abs(pv.w - pw) > 1.5 || Math.abs(pv.h - ph) > 1.5) issue('② 見本', `${pv ? `${pv.w.toFixed(1)}×${pv.h.toFixed(1)}` : '見えない'}（表は ${pw}×${ph}px。あかりの わくを 足しても 見本は かえない）`);
    const w = await wrapped(page, [...fb, ...lights].map((b) => b.id));
    if (w.length > 0) issue('ボタンの 字', `1 行に ならない: ${w.join('・')}`);
  }

  if (kind === 'namae') {
    found.push(...(await layoutTableIssues(page, 'namae')));
    const sf = bs.filter((b) => b.id.startsWith('suffix-'));
    if (sf.length !== 8) issue('後ろの 文字', `${sf.length} こ（8 こ）`);
    const xs = [...new Set(sf.map((b) => Math.round(b.rect.x / 4)))].sort((a, b) => a - b);
    if (xs.length !== 2) issue('後ろの 文字の 列', `${xs.length} 列（2 列 × 4 だん）`);
    else {
      const left = sf.filter((b) => Math.round(b.rect.x / 4) === xs[0]);
      const right = sf.filter((b) => Math.round(b.rect.x / 4) === xs[1]);
      if (left.length !== 4 || right.length !== 4) issue('後ろの 文字の 列', `左 ${left.length}・右 ${right.length}（4 と 4）`);
      if (left.some((b) => [...b.text].length !== 3)) issue('左の 列', `3 字の 物だけ: ${left.map((b) => b.text).join('・')}`);
      if (right.some((b) => ![4, 5].includes([...b.text].length))) issue('右の 列', `4〜5 字の 物だけ: ${right.map((b) => b.text).join('・')}`);
    }
    const w = await wrapped(page, sf.map((b) => b.id));
    if (w.length > 0) issue('後ろの 文字の ボタン', `字が 1 行に ならない: ${w.join('・')}`);
  }

  if (kind === 'need') {
    const r = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="need-row"]'));
      if (rows.length === 0) return null;
      let scroller: HTMLElement | null = null;
      for (let p: HTMLElement | null = rows[0]!.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
          scroller = p;
          break;
        }
      }
      if (!scroller) return { count: rows.length, scrolls: false, fully: 0, lastReachable: false, items: rows.map((e) => e.getAttribute('data-item')) };
      const box = scroller.getBoundingClientRect();
      const fully = rows.filter((e) => {
        const b = e.getBoundingClientRect();
        return b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5;
      }).length;
      scroller.scrollTop = scroller.scrollHeight;
      const last = rows.at(-1)!.getBoundingClientRect();
      return { count: rows.length, scrolls: true, fully, lastReachable: last.bottom <= box.bottom + 1 && last.top >= box.top - 1, items: rows.map((e) => e.getAttribute('data-item')) };
    });
    if (!r) issue('ひつような もの', 'need-row が 見えない');
    else {
      if (r.count !== 17) issue('行の 数', `${r.count} 行（材料 17 しゅるい）`);
      if (!r.scrolls) issue('スクロール', '17 行は 3 つの 大きさ ぜんぶで スクロールする（入る 行は 9・11・13）');
      const want = [9, 11, 13][c]!;
      if (r.scrolls && r.fully < want) issue('見える 行', `${r.fully} 行（${want} 行 以上 入る）`);
      if (r.scrolls && !r.lastReachable) issue('スクロール', 'さいごの 行まで とどかない');
      if (r.items.filter((i) => (i ?? '').startsWith('flower')).length !== 1) issue('はなの 行', 'はなは 3 いろ あわせて 1 行');
    }
  }
  return found;
}
