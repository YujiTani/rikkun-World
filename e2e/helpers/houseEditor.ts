import { expect, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../../src/ui/text';
import { waitAnimationsDone } from './anim';
import { installAimHelpers } from './aim';
import { TID, clickUi, htmlOf, menuState, openHouse, press, setBag, shownTid, stepUi, talkTo, waitArchitects, type Architect, type HouseIssue } from './house';

/**
 * HOUSE-1B（#339 エディター・せっけいず。docs/design/HOUSE-1.md §2.5〜2.7・§3.2・§4.1〜4.3・§4.9・§6.1）の E2E・UI 検査が くり返し使う 準備。
 * 窓口・ボタンの id・画面の data-testid の 約束は e2e/helpers/house.ts の 先頭（「1B の 約束」）。ここは その 約束を 使う 関数。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun.house）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 */

export type Step = 'soto' | 'naka' | 'namae';
export type Wall = 'right' | 'back' | 'left';

export interface PlacedFurniture {
  kind: string;
  x: number;
  z: number;
  rot: 0 | 1 | 2 | 3;
}

export interface PreviewState {
  mode: 'outside' | 'inside';
  roof: boolean;
  angle: number;
  pitch: number;
  touched: boolean;
  builds: number;
  glow: unknown;
}

/** 仕様 §6.1 の `editor()` の 形 */
export interface EditorState {
  step: Step;
  size: { w: number; d: number };
  windows: number;
  windowMax: number;
  windowKind: string;
  roof: string;
  windowCells: { wall: Wall; i: number }[];
  furniture: PlacedFurniture[];
  selected: { x: number; z: number } | null;
  light: string;
  name: { front: string; back: string };
  canUndo: boolean;
  canRedo: boolean;
  confirm: 'reset' | 'futonOnly' | null;
  preview: PreviewState | null;
}

export type EditOp =
  | { op: 'size'; w?: number; d?: number }
  | { op: 'windows'; delta: 1 | -1 }
  | { op: 'windowKind'; kind: string }
  | { op: 'roof'; kind: string }
  | { op: 'place'; kind: string; x: number; z: number; rot?: number }
  | { op: 'remove'; x: number; z: number }
  | { op: 'rotate'; x: number; z: number; dir: 'right' | 'left' }
  | { op: 'select'; x: number; z: number }
  | { op: 'light'; kind: string }
  | { op: 'char'; ch: string }
  | { op: 'erase' }
  | { op: 'suffix'; back: string }
  | { op: 'undo' }
  | { op: 'redo' };

/** 家具 13 種（アイテムの id。仕様 §4.3・2.4）と 方眼の 大きさ { w: よこ, d: たて }（向き 0）。2.4 の 4 つ ＝ haniwa・long_table（3×1）・round_table・stool（まるいす） */
export const FURNITURE = {
  furnace: { w: 1, d: 1 },
  tansu: { w: 1, d: 1 },
  nukunuku: { w: 2, d: 2 },
  futon: { w: 1, d: 2 },
  table: { w: 2, d: 1 },
  long_table: { w: 3, d: 1 },
  round_table: { w: 1, d: 1 },
  chair: { w: 1, d: 1 },
  stool: { w: 1, d: 1 },
  andon: { w: 1, d: 1 },
  shelf: { w: 1, d: 1 },
  ofuro: { w: 2, d: 1 },
  haniwa: { w: 1, d: 1 },
} as const;
export type FurnitureKind = keyof typeof FURNITURE;

/** ② の 家具の ボタンの ならび（§4.3）: 1 行 7 こ。上 7 ＋ 下 6 */
export const FURNITURE_ROWS: readonly (readonly FurnitureKind[])[] = [
  ['furnace', 'tansu', 'nukunuku', 'futon', 'table', 'long_table', 'round_table'],
  ['chair', 'stool', 'andon', 'shelf', 'ofuro', 'haniwa'],
];

/** 後ろの 文字 5 つ（仕様 §2.6。ボタン suffix-0〜4 の 順） */
export const SUFFIXES = ['のいえ', 'ハウス', 'のおうち', 'ひみつきち', 'のやしき'] as const;

/** 文（仕様 §3 の 表。空白は くらべない） */
export const MSG = {
  noFuton: 'ふとんが ないと ねられないよ',
  noName: 'なまえを つけてね',
  noPaper: 'かみが ないと かけないよ。かみは からかさや ちょうちんの ようかいが おとすよ',
  noFude: 'ふでが ないと かけないよ。ふでは すみ と たけ で つくれるよ',
  full: 'もちものが いっぱい だよ',
  done: 'せっけいずが できたよ！',
  light: 'あかりは ひとつ ひつようだよ',
  cleaned: 'はいらない かぐを かたづけたよ',
  futonOnly: 'ふとん だけ で いい？ ほかの かぐも おけるよ',
  reset: 'いまの かたちを ぜんぶ けす？',
} as const;

/** タイトルと 見出し（漢字は ふりがなを のぞいた 字。仕様 §3 の 表） */
export const TITLE = 'おうちの 設計図を 作ろう';
export const HEADING: Record<Step, string> = {
  soto: 'おうちの 外観を かんがえよう',
  naka: 'おうちの 内装を かんがえよう',
  namae: '設計図に おなまえを つけよう',
};

/** 空白を のぞく（ふきだし・見出しの くらべ方） */
export const squash = (s: string): string => s.replace(/\s+/g, '');

// ---------------------------------------------------------------- 窓口（hook）

export const editor = (page: Page): Promise<EditorState | null> => page.evaluate(() => (window as any).__rikkun.house.editor());

/** editor() を 読む。エディターが 開いて いない（null）なら ここで 落とす */
export async function ed(page: Page): Promise<EditorState> {
  const e = await editor(page);
  expect(e, 'editor() が null（エディターが 開いて いない）').not.toBeNull();
  return e as EditorState;
}

/** edit(op) を 呼んで 1 ステップ 進める（画面が 追いつく）。できたら true */
export function edit(page: Page, op: EditOp): Promise<boolean> {
  return page.evaluate((op) => {
    const h = (window as any).__rikkun;
    const ok = h.house.edit(op);
    h.step(1);
    return ok === true;
  }, op);
}

/** 作りかけの 形（見本の 向き・家具の えらび・もどす の 記録・すすみ・確かめの まどは のぞく）。AC47 の「同じ」 */
export function shapeOf(e: EditorState) {
  return { size: e.size, windows: e.windows, windowMax: e.windowMax, windowKind: e.windowKind, roof: e.roof, windowCells: e.windowCells, furniture: e.furniture, light: e.light, name: e.name };
}
/** shapeOf ＋ すすみ（作りかけは すすみも のこる。AC32b・AC47） */
export const formOf = (e: EditorState) => ({ step: e.step, ...shapeOf(e) });

// ---------------------------------------------------------------- ボタン・画面（DOM）

export interface DomBtn {
  id: string;
  enabled: boolean;
  /** aria-pressed（えらんで いる）。属性が なければ null */
  pressed: boolean | null;
  /** 見える 字（ふりがなを のぞく。空白なし） */
  text: string;
  label: string | null;
  scope: 'confirm' | 'need' | 'editor' | 'other';
  tag: string;
  rect: { x: number; y: number; w: number; h: number };
}

/** 画面に 見えている house-btn-*（見えるとは 大きさが あり、visibility・display・opacity で 消えて いない） */
export function readButtons(page: Page): Promise<DomBtn[]> {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || (p as HTMLElement).hidden || parseFloat(cs.opacity) <= 0.01) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const out: any[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-testid^="house-btn-"]'))) {
      if (!visible(el)) continue;
      const c = el.cloneNode(true) as Element;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      const r = el.getBoundingClientRect();
      const pressed = el.getAttribute('aria-pressed');
      out.push({
        id: (el.getAttribute('data-testid') ?? '').slice('house-btn-'.length),
        enabled: !((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'),
        pressed: pressed === null ? null : pressed === 'true',
        text: (c.textContent ?? '').replace(/\s+/g, ''),
        label: el.getAttribute('aria-label'),
        scope: el.closest('[data-testid="house-confirm"]') ? 'confirm' : el.closest('[data-testid="house-need"]') ? 'need' : el.closest('[data-testid="house-editor"]') ? 'editor' : 'other',
        tag: el.tagName.toLowerCase(),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
    }
    return out;
  });
}

export const btn = (page: Page, id: string) => shownTid(page, TID.btn(id));

/** ボタンを マウスで 押して 2 ステップ 進める（見えて いなければ すぐ 落ちる） */
export const clickBtn = (page: Page, id: string): Promise<void> => clickUi(page, btn(page, id), `ボタン ${TID.btn(id)}`);

/** 見えている ボタン 1 つの 状態。なければ null（かくれて いる） */
export async function btnState(page: Page, id: string): Promise<DomBtn | null> {
  return (await readButtons(page)).find((b) => b.id === id) ?? null;
}

/** そのとき 見えて いる ボタンの id（エディターの 中。確かめの まど・ひつような ものが 出て いる 間は その 中だけ） */
export async function editorBtnIds(page: Page): Promise<string[]> {
  const all = await readButtons(page);
  const e = await editor(page);
  const m = await menuState(page);
  const scope = e?.confirm ? 'confirm' : m.page === 'need' ? 'need' : 'editor';
  return all.filter((b) => b.scope === scope).map((b) => b.id);
}

/** 見えている 要素の 字（ふりがなを のぞく・空白なし）。なければ null */
export function plainText(page: Page, testid: string): Promise<string | null> {
  return page.evaluate((id) => {
    for (const el of Array.from(document.querySelectorAll(`[data-testid="${id}"]`))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const c = el.cloneNode(true) as Element;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      return (c.textContent ?? '').replace(/\s+/g, '');
    }
    return null;
  }, testid);
}

/** 画面（DOM）が 窓口と 食いちがう ところ（空 = 同じ）: ボタンの 並び（順番は のぞく）・押せるか・ふきだしの 字 */
export async function editorMismatch(page: Page): Promise<string[]> {
  await waitAnimationsDone(page);
  const m = await menuState(page);
  const e = await editor(page);
  const out: string[] = [];
  const all = await readButtons(page);
  const scope = e?.confirm ? 'confirm' : m.page === 'need' ? 'need' : 'editor';
  const dom = all.filter((b) => b.scope === scope);
  const sortById = <T extends { id: string }>(l: T[]): T[] => [...l].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const want = sortById(m.buttons);
  const got = sortById(dom);
  if (JSON.stringify(want.map((b) => b.id)) !== JSON.stringify(got.map((b) => b.id))) {
    const missing = want.filter((w) => !got.some((g) => g.id === w.id)).map((b) => b.id);
    const extra = got.filter((g) => !want.some((w) => w.id === g.id)).map((b) => b.id);
    out.push(`ボタンの 並びが ちがう: menu() に あって 画面に 無い [${missing.join(',')}] / 画面に あって menu() に 無い [${extra.join(',')}]`);
  } else {
    want.forEach((w, i) => {
      if (got[i]!.enabled !== w.enabled) out.push(`${w.id}: 押せるか ちがう（画面 ${got[i]!.enabled} / menu() ${w.enabled}）`);
    });
  }
  const shown = await plainText(page, TID.bubble);
  const said = squash(m.bubble);
  if (said === '') {
    if (shown) out.push(`menu().bubble が 空なのに ふきだしが 見えて いる「${shown}」`);
  } else if (!shown) {
    out.push(`menu().bubble「${said}」なのに ふきだしが 画面に 見えない`);
  } else if (!(said.startsWith(shown) || shown.startsWith(said))) {
    out.push(`ふきだしの 字が ちがう: 画面「${shown}」/ menu()「${said}」`);
  }
  return out;
}

/** タイトルと 見出し（字・ふりがな）を たしかめる。ふきだしが 出て いる 間は 見出しが 見えない ので、出て いない とき だけ 呼ぶ */
export async function expectHeadings(page: Page, step: Step): Promise<void> {
  expect(await plainText(page, 'editor-title'), `${step}: 上の 帯の タイトル（ふりがなを のぞいた 字）`).toBe(squash(TITLE));
  expect(await plainText(page, 'editor-heading'), `${step}: 見出し（ふりがなを のぞいた 字）`).toBe(squash(HEADING[step]));
  const html = (await htmlOf(page, 'editor-title')) + (await htmlOf(page, 'editor-heading'));
  expect(findUnrubiedKanji(html), `${step}: ふりがなの ない 漢字（タイトル・見出し）`).toEqual([]);
  expect(html, `${step}: 「設計図」に ふりがな「せっけいず」`).toMatch(/<rt>\s*せっけいず\s*<\/rt>/);
}

export const cellAt = (page: Page, x: number, z: number) => page.locator(`[data-testid="editor-cell"][data-x="${x}"][data-z="${z}"]`);
export const furnitureAt = (page: Page, x: number, z: number) => page.locator(`[data-testid="editor-furniture"][data-x="${x}"][data-z="${z}"]`);

/** 方眼の マスを マウスで 押す（空いた マス。家具の 下の マスは 家具が うけるので 押せない） */
export const clickCell = (page: Page, x: number, z: number): Promise<void> => clickUi(page, cellAt(page, x, z), `方眼の マス (${x}, ${z})`);
/** 置いた 家具（左上の マス）を マウスで 押す */
export const clickFurniture = (page: Page, x: number, z: number): Promise<void> => clickUi(page, furnitureAt(page, x, z), `置いた 家具 (${x}, ${z})`);

/** Esc を 押して 1 ステップ 進める */
export async function pressEsc(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await stepUi(page);
}

/**
 * エディターの 中では ゲームの キーが 効かない（AC14）。W（歩く）・E（持ち物）・Q（すてる）・数字（持ちかえ）を 押しても
 * プレイヤーの 場所・持ち物（中身・選んだ マス・開いて いるか）が 変わらない。選んで いる マスが 空だと Q を たしかめられない ので、空なら 落とす。
 */
export async function gameKeysIgnored(page: Page, where: string): Promise<void> {
  const snap = () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      const inv = h.inventory.get();
      return { pos: [p.x, p.y, p.z].map((n: number) => Math.round(n * 1000) / 1000), slots: JSON.stringify(inv.slots), open: inv.open as boolean, selected: inv.selected as number };
    });
  const before = await snap();
  expect(JSON.parse(before.slots)[before.selected], `${where}: 選んで いる 持ち物の マスが 空（Q で すてる ことを たしかめられない）`).not.toBeNull();
  await page.keyboard.down('KeyW');
  await stepUi(page, 20);
  await page.keyboard.up('KeyW');
  for (const key of ['KeyE', 'KeyQ', 'Digit2', 'Digit5']) {
    await page.keyboard.press(key);
    await stepUi(page, 3);
  }
  expect(await snap(), `${where}: W・E・Q・数字キーで プレイヤー・持ち物が 動いた`).toEqual(before);
}

/** 話して メニューを 開き、「せっけいずを つくる」（house-btn-editor）を マウスで 押して エディターを 開く */
export async function openEditor(page: Page, architectId: Architect['id'], via: 'hook' | 'rightClick' = 'hook'): Promise<void> {
  const t = await talkTo(page, architectId, via);
  expect(t.menu, '話して メニューが 開く').toMatchObject({ open: true, page: 'top' });
  await clickBtn(page, 'editor');
  const m = await menuState(page);
  expect(m, 'せっけいずを つくる で エディターが 開く').toMatchObject({ open: true, page: 'editor' });
}

/** 窓口の press で エディターを 開く（準備用。マウスで 押す 確かめは openEditor） */
export async function openEditorFast(page: Page, architectId: Architect['id']): Promise<void> {
  await talkTo(page, architectId, 'hook');
  const m = await press(page, 'editor');
  expect(m, 'press(editor) で エディターが 開く').toMatchObject({ open: true, page: 'editor' });
}

/** 最初の 建築士さんを さがして 返す */
export async function firstArchitect(page: Page): Promise<Architect> {
  const first = (await waitArchitects(page)).find((a) => a.first);
  expect(first, '最初の 建築士さん').toBeTruthy();
  return first!;
}

/** 窓口 `need(source?)` の 行 */
export interface NeedRow {
  item: string;
  need: number;
  have: number;
  short: number;
  bonus?: number;
}
export const needOf = (page: Page, source?: number): Promise<NeedRow[]> => page.evaluate((s) => (window as any).__rikkun.house.need(s), source);

/** 窓口 `blueprints()` の 行 */
export interface BlueprintRow {
  slot: number;
  number: number;
  name: { front: string; back: string };
  w: number;
  d: number;
  windows: number;
  windowKind: string;
  roof: string;
  furniture: PlacedFurniture[];
  light: string;
}
export const blueprints = (page: Page): Promise<BlueprintRow[]> => page.evaluate(() => (window as any).__rikkun.house.blueprints());

/** 見本を 描いた その コマの 描画回数・三角形（renderStats() が たまった 描画を 1 回 描いて から 返す） */
export const drawStats = (page: Page): Promise<{ calls: number; triangles: number }> =>
  page.evaluate(() => {
    const s = (window as any).__rikkun.renderStats();
    return { calls: s.drawCalls as number, triangles: s.triangles as number };
  });

/**
 * 準備用（窓口 edit だけ。画面は 通さない）: 大きさ・まどの かず・家具・名前を 決めた 形に する。
 * 家具は 置けなければ 落とす。名前の 字は 1 字ずつ char で 入れる（前の 文字を 空に してから）。
 */
export async function setForm(
  page: Page,
  f: { w?: number; d?: number; windows?: number; furniture?: { kind: string; x: number; z: number; rot?: number }[]; front?: string; back?: string },
): Promise<void> {
  if (f.w !== undefined || f.d !== undefined) expect(await edit(page, { op: 'size', w: f.w, d: f.d }), `大きさ ${f.w}×${f.d}`).toBe(true);
  if (f.windows !== undefined) {
    const cur = (await ed(page)).windows;
    const delta = f.windows > cur ? 1 : -1;
    for (let i = cur; i !== f.windows; i += delta) expect(await edit(page, { op: 'windows', delta }), `まどの かず ${i} → ${i + delta}`).toBe(true);
  }
  for (const p of f.furniture ?? []) expect(await edit(page, { op: 'place', ...p }), `家具 ${p.kind} (${p.x}, ${p.z})`).toBe(true);
  if (f.front !== undefined) {
    while ((await ed(page)).name.front.length > 0) await edit(page, { op: 'erase' });
    for (const ch of Array.from(f.front)) expect(await edit(page, { op: 'char', ch }), `字 ${ch}`).toBe(true);
  }
  // 今と 同じ 後ろの 文字は 変えない（変わらない 操作が false を 返す かは 決まって いないので 呼ばない）
  if (f.back !== undefined && (await ed(page)).name.back !== f.back) {
    expect(await edit(page, { op: 'suffix', back: f.back }), `後ろの 文字 ${f.back}`).toBe(true);
  }
}

/** 押せない ボタン（disabled）は locator.click() だと 押せる ように なるまで 待ち続ける ので、本物の マウスで 中心を 押す（何も 起きない はず） */
export async function clickDisabled(page: Page, id: string): Promise<void> {
  const b = await btnState(page, id);
  expect(b, `押せない ボタン ${TID.btn(id)} が 画面に 見えない`).not.toBeNull();
  expect(b!.enabled, `${TID.btn(id)} は 押せない はず`).toBe(false);
  await page.mouse.click(b!.rect.x + b!.rect.w / 2, b!.rect.y + b!.rect.h / 2);
  await stepUi(page);
}

/** 持ち物を 開いて せっけいずの マス（slot）に マウスを のせ、ツールチップの 名前を 返す。そのあと 持ち物を とじる */
export async function tooltipNameOf(page: Page, slot: number): Promise<string> {
  const toggle = () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(2);
    });
  await toggle();
  await page.hover(`.inv-slot[data-index="${slot}"]`);
  await stepUi(page, 2);
  const name = await page.locator('#tooltip .tip-name').first().evaluate((el) => {
    const c = el.cloneNode(true) as Element;
    c.querySelectorAll('rt, rp').forEach((n) => n.remove());
    return (c.textContent ?? '').trim();
  });
  await page.mouse.move(0, 0);
  await toggle();
  return name;
}

/** セーブした あと 読みこみなおす（持ち物は 空に しない）。openHouse と 同じ 準備を 持ち物 以外 だけ する */
export async function reopenHouse(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.mouse.click(0, 0);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    document.exitPointerLock();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.settings.set('animalAutoSpawn', false);
    h.yokai.clear();
    h.animals.clear();
    h.step(2);
    h.audio.sfx();
  });
  await page.waitForFunction(() => !document.pointerLockElement);
}

// ---------------------------------------------------------------- UI 検査（AC35。e2e/ui-gate.spec.ts の Screen.open・extra）

export const EDITOR_ROOT = '[data-testid="house-editor"]';
export const EDITOR_ROOTS = [EDITOR_ROOT, `[data-testid="${TID.bubble}"]`];
export const CONFIRM_ROOTS = ['[data-testid="house-confirm"]'];
export const NEED_ROOTS = ['[data-testid="house-need"]'];
export const SEKKEIZU_NAME_ROOTS = ['#tooltip'];

/**
 * UI 検査の 数（AC35）: 外わく（セレクタ）の 中の 字は 24 px 以上（ふりがな rt は のぞく）、ボタン（<button>・role="button"・house-btn-*）は 高さ 56 px 以上・
 * はば 48 px 以上、方眼の マス（editor-cell）は 48 px 以上。ぴょこんの 動きが おわって から はかる。見つけた くずれの 一覧（空 = 合格）。
 */
export async function editorUiIssues(page: Page, rootSels: string[]): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  for (const rootSel of rootSels) {
    await waitAnimationsDone(page, rootSel);
    found.push(
      ...(await page.evaluate((rootSel) => {
        const out: { kind: string; target: string; detail: string }[] = [];
        const root = document.querySelector(rootSel);
        if (!root) return out;
        const label = (el: Element): string => {
          const cls = Array.from(el.classList).slice(0, 3);
          return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.length ? '.' + cls.join('.') : ''}`;
        };
        const visible = (el: Element): boolean => {
          for (let p: Element | null = el; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden' || (p as HTMLElement).hidden || parseFloat(cs.opacity) <= 0.01) return false;
          }
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
          if (!visible(el)) continue;
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'rt' || tag === 'rp' || el.closest('rt')) continue;
          let text = '';
          for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? '';
          text = text.replace(/\s+/g, ' ').trim();
          if (text) {
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs < 23.95) out.push({ kind: 'font24', target: `${label(el)}「${text.slice(0, 16)}」`, detail: `字が ${fs}px（24px 以上）` });
          }
          const t = el.getAttribute('data-testid') ?? '';
          const r = el.getBoundingClientRect();
          if (tag === 'button' || el.getAttribute('role') === 'button' || t.startsWith('house-btn-')) {
            if (r.height < 55.5 || r.width < 47.5) {
              out.push({ kind: 'tap56', target: `${label(el)}${t ? `[${t}]` : ''}${text ? `「${text.slice(0, 16)}」` : ''}`, detail: `押せる 大きさが ${r.width.toFixed(0)}×${r.height.toFixed(0)}px（高さ 56px 以上・はば 48px 以上）` });
            }
          }
          if (t === 'editor-cell' && (r.width < 47.5 || r.height < 47.5)) {
            out.push({ kind: 'cell48', target: `${label(el)}[editor-cell]`, detail: `方眼の マスが ${r.width.toFixed(0)}×${r.height.toFixed(0)}px（48px 以上）` });
          }
        }
        return out;
      }, rootSel)),
    );
  }
  return found;
}

/**
 * 家具の そばの ボタン（AC57・AC35）: 5×5 と 9×9 の 4 すみと まん中に 1×1（いす）と 2×2（こたつ）を 置いて えらぶと、
 * とる・↻・↺ の ボタンが 方眼の はこから はみ出さず、えらんだ 家具に かさならない。始めは 家具が 1 つも ない 形で 呼ぶ。
 */
export async function besideIssues(page: Page): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  let tried = 0; // ためした 数（5 か所 × 2 種 × 2 サイズ ＝ 20）
  for (const side of [5, 9]) {
    expect(await edit(page, { op: 'size', w: side, d: side }), `大きさ ${side}×${side}`).toBe(true);
    // 家具を ぜんぶ とる
    for (const f of (await ed(page)).furniture) await edit(page, { op: 'remove', x: f.x, z: f.z });
    for (const kind of ['chair', 'nukunuku'] as const) {
      const n = FURNITURE[kind].w;
      const spots: [string, number, number][] = [
        ['左うえ', 0, 0],
        ['右うえ', side - n, 0],
        ['左した', 0, side - n],
        ['右した', side - n, side - n],
        ['まん中', Math.floor((side - n) / 2), Math.floor((side - n) / 2)],
      ];
      for (const [name, x, z] of spots) {
        const tag = `${side}×${side} ${kind} ${name}`;
        // 5 か所は どれも 戸の 前（まえの まん中の 1 マス）に かからない ので、ぜんぶ 置ける はず。置けなければ くずれ（無言で とばさない）
        tried++;
        if (!(await edit(page, { op: 'place', kind, x, z }))) {
          found.push({ kind: 'beside', target: `${tag} 置けない`, detail: `${kind} を (${x}, ${z}) に 置けない（edit(place) が false）` });
          continue;
        }
        await edit(page, { op: 'select', x, z });
        await stepUi(page, 2);
        const r = await page.evaluate(({ x, z }) => {
          const rect = (el: Element | null) => {
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { l: b.left, t: b.top, r: b.right, b: b.bottom };
          };
          const grid = rect(document.querySelector('[data-testid="editor-grid"]'));
          const sel = rect(document.querySelector(`[data-testid="editor-furniture"][data-x="${x}"][data-z="${z}"]`));
          const bs = ['take', 'turnRight', 'turnLeft'].map((id) => ({ id, r: rect(document.querySelector(`[data-testid="house-btn-${id}"]`)) }));
          return { grid, sel, bs };
        }, { x, z });
        if (!r.grid) {
          found.push({ kind: 'beside', target: tag, detail: 'editor-grid が 見つからない' });
          continue;
        }
        for (const b of r.bs) {
          if (!b.r) {
            found.push({ kind: 'beside', target: `${tag} ${b.id}`, detail: 'そばの ボタンが 出て いない' });
            continue;
          }
          const o = 0.5;
          if (b.r.l < r.grid.l - o || b.r.t < r.grid.t - o || b.r.r > r.grid.r + o || b.r.b > r.grid.b + o) {
            found.push({ kind: 'beside', target: `${tag} ${b.id}`, detail: `方眼の はこから はみ出す（ボタン ${JSON.stringify(b.r)} / 方眼 ${JSON.stringify(r.grid)}）` });
          }
          if (r.sel && b.r.l < r.sel.r - o && b.r.r > r.sel.l + o && b.r.t < r.sel.b - o && b.r.b > r.sel.t + o) {
            found.push({ kind: 'beside', target: `${tag} ${b.id}`, detail: 'えらんだ 家具に かさなる' });
          }
        }
        await edit(page, { op: 'remove', x, z });
      }
    }
  }
  expect(tried, '5 か所 × 2 種（いす・ぬくぬく）× 2 サイズ（5×5・9×9）を ぜんぶ ためした').toBe(20);
  return found;
}

/** ② の 家具の ボタンを 上から 下・左から 右に 読んで 行ごとに 家具の id（furniture- を とった 物）を ならべる（同じ 行 ＝ 上の ふちが 4px 以内） */
export function furnitureButtonRows(btns: DomBtn[]): string[][] {
  const fb = btns.filter((b) => b.id.startsWith('furniture-')).sort((a, c) => a.rect.y - c.rect.y || a.rect.x - c.rect.x);
  const rows: { y: number; ids: string[] }[] = [];
  for (const b of fb) {
    const row = rows.find((r) => Math.abs(r.y - b.rect.y) <= 4);
    if (row) row.ids.push(b.id.slice('furniture-'.length));
    else rows.push({ y: b.rect.y, ids: [b.id.slice('furniture-'.length)] });
  }
  return rows.map((r) => r.ids);
}

/** §3.2 の 余白の 表（2.4）の 数。列は 1024×700・1280×800・1440×900 の 順 */
export const LAYOUT = {
  /** #1 画面の ふち（上・下・左・右 とも） */
  edge: [16, 24, 32],
  /** #7 下の 帯の ボタンの 高さ */
  barBtn: [56, 64, 64],
  /** #21 ① ② の ボタンの 高さ（② の 家具の ボタンは 正方形） */
  mainBtn: [56, 64, 64],
  /** #22 ③ の キー（正方形）・後ろの 文字・カタカナ・1 もじ けすの 高さ */
  keyBtn: [56, 56, 64],
  /** 表から 出る 大きさ: ① 見本 はば×高さ（高さ ＝ まん中の 高さ 484・540・604） */
  previewSoto: [[580, 484], [720, 540], [796, 604]],
  /** 表から 出る 大きさ: ② 見本 */
  previewNaka: [[480, 276], [658, 288], [723, 332]],
  /** 表から 出る 大きさ: ② の マス（9×9 の とき） */
  cell: [48, 54, 61],
} as const;

/**
 * 余白の 表の 数（AC35・§3.2 の 2.4）: 画面の ふちから ボタンまで 表の あき 以上（上下左右）、下の 帯・① ② ③ の ボタンの 高さ、見本の 大きさ、② の マスの 大きさ、
 * ② の 家具の ボタンは 上 7・下 6 で §4.3 の ならび。「余白が 少ない」に もどらない ための 数（±1.5px）。見る 画面は soto・naka・namae と ふきだし。
 */
export async function layoutTableIssues(page: Page, kind: EditorScreen): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const col = vp.w <= 1100 ? 0 : vp.w <= 1360 ? 1 : 2;
  const tol = 1.5;
  const near = (v: number, want: number): boolean => Math.abs(v - want) <= tol;
  const bs = (await readButtons(page)).filter((b) => b.scope === 'editor');
  const issue = (target: string, detail: string) => found.push({ kind: 'table', target, detail });
  // 同じ ならびの ボタンは 1 つの くずれに まとめる（きまりの 表〔known.json〕を 大きく しない）
  const groups = new Map<string, string[]>();
  const group = (target: string, detail: string) => groups.set(target, [...(groups.get(target) ?? []), detail]);

  // #1 画面の ふち
  const edge = LAYOUT.edge[col]!;
  const minL = Math.min(...bs.map((b) => b.rect.x));
  const minT = Math.min(...bs.map((b) => b.rect.y));
  const maxR = Math.max(...bs.map((b) => b.rect.x + b.rect.w));
  const maxB = Math.max(...bs.map((b) => b.rect.y + b.rect.h));
  if (bs.length === 0) issue('ボタン', 'エディターの ボタンが 見えない');
  else {
    if (minL < edge - tol) issue('画面の ふち 左', `ボタンの 左が ふちから ${minL.toFixed(1)}px（表は ${edge}px 以上）`);
    if (minT < edge - tol) issue('画面の ふち 上', `ボタンの 上が ふちから ${minT.toFixed(1)}px（表は ${edge}px 以上）`);
    if (vp.w - maxR < edge - tol) issue('画面の ふち 右', `ボタンの 右が ふちから ${(vp.w - maxR).toFixed(1)}px（表は ${edge}px 以上）`);
    if (vp.h - maxB < edge - tol) issue('画面の ふち 下', `ボタンの 下が ふちから ${(vp.h - maxB).toFixed(1)}px（表は ${edge}px 以上）`);
  }
  // #7 下の 帯
  for (const b of bs.filter((x) => ['prev', 'next', 'done', 'new', 'need'].includes(x.id))) {
    if (!near(b.rect.h, LAYOUT.barBtn[col]!)) group('下の 帯の ボタン', `${b.id} 高さ ${b.rect.h.toFixed(1)}px（表は ${LAYOUT.barBtn[col]}px）`);
  }
  const box = (testid: string) =>
    page.evaluate((id) => {
      const el = Array.from(document.querySelectorAll(`[data-testid="${id}"]`)).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }, testid);

  if (kind === 'soto' || kind === 'bubbleSoto') {
    for (const b of bs.filter((x) => /^(width|depth)-\d$|^windows(Up|Down)$|^windowKind-|^roof-/.test(x.id))) {
      if (!near(b.rect.h, LAYOUT.mainBtn[col]!)) group('① の ボタン', `${b.id} 高さ ${b.rect.h.toFixed(1)}px（表は ${LAYOUT.mainBtn[col]}px）`);
    }
    const pv = await box('editor-preview');
    const [pw, ph] = LAYOUT.previewSoto[col]!;
    if (!pv) issue('① 見本', 'editor-preview が 見えない');
    else if (!near(pv.w, pw) || !near(pv.h, ph)) issue('① 見本', `${pv.w.toFixed(1)}×${pv.h.toFixed(1)}px（表は ${pw}×${ph}px）`);
  }
  if (kind === 'naka') {
    const fb = bs.filter((x) => x.id.startsWith('furniture-'));
    for (const b of fb) {
      if (!near(b.rect.w, LAYOUT.mainBtn[col]!) || !near(b.rect.h, LAYOUT.mainBtn[col]!)) group('② の 家具の ボタン', `${b.id} ${b.rect.w.toFixed(1)}×${b.rect.h.toFixed(1)}px（表は 正方形 ${LAYOUT.mainBtn[col]}px）`);
    }
    // 上 7・下 6 の ならび（§4.3）。上から 下、左から 右の 順に 読む
    const rows = furnitureButtonRows(bs);
    if (JSON.stringify(rows) !== JSON.stringify(FURNITURE_ROWS)) issue('② の 家具の ならび', `${JSON.stringify(rows)}（§4.3 は 上 7・下 6: ${JSON.stringify(FURNITURE_ROWS)}）`);
    const pv = await box('editor-preview');
    const [pw, ph] = LAYOUT.previewNaka[col]!;
    if (!pv) issue('② 見本', 'editor-preview が 見えない');
    else if (!near(pv.w, pw) || !near(pv.h, ph)) issue('② 見本', `${pv.w.toFixed(1)}×${pv.h.toFixed(1)}px（表は ${pw}×${ph}px）`);
    const cell = await box('editor-cell');
    if (!cell) issue('② の マス', 'editor-cell が 見えない');
    else if (!near(cell.w, LAYOUT.cell[col]!) || !near(cell.h, LAYOUT.cell[col]!)) issue('② の マス', `${cell.w.toFixed(1)}×${cell.h.toFixed(1)}px（表は 9×9 で ${LAYOUT.cell[col]}px 角）`);
  }
  if (kind === 'namae' || kind === 'bubbleNamae') {
    for (const b of bs) {
      if (/^char-|^dakuten$|^handakuten$/.test(b.id)) {
        if (!near(b.rect.w, LAYOUT.keyBtn[col]!) || !near(b.rect.h, LAYOUT.keyBtn[col]!)) group('③ の キー', `${b.id} ${b.rect.w.toFixed(1)}×${b.rect.h.toFixed(1)}px（表は 正方形 ${LAYOUT.keyBtn[col]}px）`);
      } else if (/^suffix-|^katakana$|^erase$/.test(b.id) && !near(b.rect.h, LAYOUT.keyBtn[col]!)) {
        group('③ の 後ろの 文字・カタカナ・けす', `${b.id} 高さ ${b.rect.h.toFixed(1)}px（表は ${LAYOUT.keyBtn[col]}px）`);
      }
    }
  }
  for (const [target, list] of groups) issue(target, `${list.length} こ: ${list.slice(0, 3).join(' ／ ')}${list.length > 3 ? ' …' : ''}`);
  return found;
}

/**
 * ひつような もの（AC35・2.4）: 10 行（材料 10 しゅるい）が ぜんぶ 画面の 中に 入って いて、1024×700 だけ 行の ところが スクロールする（1280×800・1440×900 は スクロールしない）。
 * スクロールする とき は 先頭の 行が 見えて いて、スクロールの 中の 最後の 行まで とどく（scrollHeight）。
 */
export async function needScrollIssues(page: Page): Promise<HouseIssue[]> {
  const r = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="need-row"]'));
    const root = document.querySelector('[data-testid="house-need"]');
    if (rows.length === 0 || !root) return null;
    let scroller: HTMLElement | null = null;
    for (let p: HTMLElement | null = rows[0]!.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
        scroller = p;
        break;
      }
    }
    const inScreen = (el: Element): boolean => {
      const b = el.getBoundingClientRect();
      return b.top >= -0.5 && b.bottom <= innerHeight + 0.5 && b.left >= -0.5 && b.right <= innerWidth + 0.5;
    };
    return {
      count: rows.length,
      scrolls: scroller !== null,
      scrollerInScreen: scroller ? inScreen(scroller) : true,
      firstVisible: inScreen(rows[0]!),
      allInScreen: rows.every(inScreen),
      w: innerWidth,
    };
  });
  const found: HouseIssue[] = [];
  const issue = (target: string, detail: string) => found.push({ kind: 'need', target, detail });
  if (!r) return [{ kind: 'need', target: 'ひつような もの', detail: 'need-row が 見えない' }];
  if (r.count < 10) issue('行の 数', `${r.count} 行（材料 10 しゅるいで 10 行）`);
  if (r.w <= 1100) {
    if (!r.scrolls) issue('スクロール', '1024×700 では 行の ところが スクロールする（スクロールする 入れ物が ない）');
    if (!r.scrollerInScreen) issue('スクロール', 'スクロールする 入れ物が 画面から はみ出す');
    if (!r.firstVisible) issue('先頭の 行', '先頭の 行が 見えない');
  } else {
    if (r.scrolls) issue('スクロール', '1280×800・1440×900 では スクロールしない（10 行 ぜんぶ 入る）');
    if (!r.allInScreen) issue('行', '10 行が 画面の 中に ぜんぶ 入って いない');
  }
  return found;
}

/**
 * 持ち物の せっけいずの 名前（AC35）: 出し方は 今の 共有の ツールチップの まま（PO の 決め。#339 の 票）。字の 大きさを 見るのは `.tip-name` だけで、
 * ほかの アイテムの ツールチップの `.tip-name` と 同じ 大きさ（同じ 大きさの 基準。1024×700 で 小さくなるのも 同じ）。星・説明・「たいきゅう」は 見ない。
 * ツールチップが 見えて いる・名前が ぜんぶ 出て いる（折りかえし 可。切れない・外へ はみ出さない）。ツールチップを 持ち物の せっけいずの マスに 合わせた まま 返す。
 */
export async function sekkeizuTooltipIssues(page: Page): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  const setup = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const bp = h.house.blueprints()[0];
    const slots: ({ item: string } | null)[] = h.inventory.get().slots;
    return {
      sek: bp ? (bp.slot as number) : -1,
      name: bp ? `${bp.name.front}${bp.name.back}の せっけいず` : '',
      ref: slots.findIndex((st) => st !== null && st.item !== 'sekkeizu'), // ほかの アイテム（ツールチップの 大きさの 基準）
    };
  });
  if (setup.sek < 0) return [{ kind: 'tooltip', target: 'せっけいず', detail: 'blueprints() に せっけいずが 無い' }];

  const measure = async (slot: number) => {
    await page.hover(`.inv-slot[data-index="${slot}"]`);
    await stepUi(page, 2);
    return page.evaluate(() => {
      const tip = document.querySelector('#tooltip') as HTMLElement | null;
      const nameEl = document.querySelector('#tooltip .tip-name') as HTMLElement | null;
      if (!tip || !nameEl) return null;
      const shown = (el: HTMLElement): boolean => {
        for (let p: HTMLElement | null = el; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden' || p.hidden || parseFloat(cs.opacity) <= 0.01) return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const c = nameEl.cloneNode(true) as Element;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      const t = tip.getBoundingClientRect();
      const n = nameEl.getBoundingClientRect();
      return {
        visible: shown(tip) && shown(nameEl),
        text: (c.textContent ?? '').replace(/\s+/g, ''),
        fontSize: parseFloat(getComputedStyle(nameEl).fontSize),
        clipped: nameEl.scrollWidth > nameEl.clientWidth + 1 || nameEl.scrollHeight > nameEl.clientHeight + 1,
        outOfTooltip: n.left < t.left - 0.5 || n.right > t.right + 0.5 || n.top < t.top - 0.5 || n.bottom > t.bottom + 0.5,
        outOfScreen: n.left < -0.5 || n.top < -0.5 || n.right > innerWidth + 0.5 || n.bottom > innerHeight + 0.5,
      };
    });
  };

  let refSize = 0;
  if (setup.ref >= 0) {
    const ref = await measure(setup.ref);
    if (!ref?.visible) found.push({ kind: 'tooltip', target: 'くらべる アイテム', detail: 'ほかの アイテムの ツールチップが 見えない（くらべられない）' });
    else refSize = ref.fontSize;
  } else {
    found.push({ kind: 'tooltip', target: 'くらべる アイテム', detail: '持ち物に ほかの アイテムが 無い（字の 大きさを くらべられない）' });
  }
  const m = await measure(setup.sek);
  if (!m?.visible) return [...found, { kind: 'tooltip', target: 'せっけいず', detail: 'せっけいずの ツールチップが 見えて いない' }];
  if (m.text !== setup.name.replace(/\s+/g, '')) found.push({ kind: 'tooltip', target: '名前', detail: `名前が ちがう（「${m.text}」/ 本当は「${setup.name}」）` });
  if (m.clipped) found.push({ kind: 'tooltip', target: '名前', detail: '名前が 切れて いる（折りかえしは よい。切れては いけない）' });
  if (m.outOfTooltip) found.push({ kind: 'tooltip', target: '名前', detail: '名前が ツールチップの 外に はみ出す' });
  if (m.outOfScreen) found.push({ kind: 'tooltip', target: '名前', detail: '名前が 画面の 外に はみ出す' });
  if (refSize > 0 && m.fontSize < refSize - 0.05) found.push({ kind: 'tooltip', target: '名前', detail: `名前の 字が ${m.fontSize}px（ほかの アイテムの 名前は ${refSize}px。同じ 大きさ）` });
  return found;
}

/** UI 検査の 画面ごとの 追加の 検査（e2e/ui-gate.spec.ts の Screen.extra） */
export async function editorGateIssues(page: Page, g: { kind: EditorScreen; roots: string[]; beside?: boolean }): Promise<HouseIssue[]> {
  if (g.kind === 'sekkeizu') return sekkeizuTooltipIssues(page);
  const found = await editorUiIssues(page, g.roots);
  if (g.kind === 'need') found.push(...(await needScrollIssues(page)));
  if (['soto', 'naka', 'namae', 'bubbleSoto', 'bubbleNamae'].includes(g.kind)) found.push(...(await layoutTableIssues(page, g.kind)));
  if (g.beside) found.push(...(await besideIssues(page))); // 方眼の 大きさを かえる ので いちばん さいごに
  return found;
}

// ---- UI 検査の 画面の 開き方（e2e/ui-gate.spec.ts の Screen.open）

/** 家具の しゅるいを 全部（13 しゅるい。FURNITURE の ならび）まぜて 方眼いっぱいに（いちばん 多い 形。AC34 ③・AC35）。置けた 数と、置いた 家具の しゅるいの 一覧を 返す */
export async function fillFurniture(page: Page): Promise<{ placed: number; kinds: string[] }> {
  return page.evaluate((kinds) => {
    const h = (window as any).__rikkun;
    const { w, d } = h.house.editor().size;
    let i = 0;
    let placed = 0;
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const kind = (kinds as string[])[i % (kinds as string[]).length]!;
        if (h.house.edit({ op: 'place', kind, x, z })) {
          placed++;
          i++;
        }
      }
    }
    h.step(2);
    const used = new Set<string>((h.house.editor().furniture as { kind: string }[]).map((f) => f.kind));
    return { placed, kinds: [...used].sort() };
  }, Object.keys(FURNITURE));
}

/** 置いた 家具を ぜんぶ とる（窓口の remove） */
export async function clearFurniture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (const f of h.house.editor().furniture as { x: number; z: number }[]) h.house.edit({ op: 'remove', x: f.x, z: f.z });
    h.step(2);
  });
}

/** 見本は 動きを へらす 設定で 止める（光り おわって から 撮る）。エディターを 窓口で 開く */
async function openEditorForGate(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHouse(page);
  await openEditorFast(page, (await firstArchitect(page)).id);
}

/** いちばん 大きい 形: 9×9・まどの かず 上限 */
async function maxOutside(page: Page): Promise<void> {
  expect(await edit(page, { op: 'size', w: 9, d: 9 }), '大きさ 9×9').toBe(true);
  const max = (await ed(page)).windowMax;
  for (let i = 0; i < max; i++) await edit(page, { op: 'windows', delta: 1 });
  expect((await ed(page)).windows, 'まどの かず 上限').toBe(max);
}

export type EditorScreen = 'soto' | 'naka' | 'beside' | 'namae' | 'confirmFuton' | 'confirmReset' | 'need' | 'bubbleSoto' | 'bubbleNamae' | 'sekkeizu';

const LONGEST_FRONT = 'あいうえおかきく'; // 前の 文字 いちばん 長い（8 字）

/** UI 検査の 画面を 出す（AC35）。画面ごとの 形は 仕様 §6.2 AC35 */
export async function openEditorScreen(page: Page, kind: EditorScreen): Promise<void> {
  await openEditorForGate(page);
  const next = async (n: number) => {
    for (let i = 0; i < n; i++) await press(page, 'next');
  };
  switch (kind) {
    case 'soto':
      await maxOutside(page);
      break;
    case 'naka':
    case 'beside':
      await maxOutside(page);
      await next(1);
      expect((await ed(page)).step).toBe('naka');
      if (kind === 'naka') {
        const filled = await fillFurniture(page);
        expect(filled.placed, '方眼いっぱいに 家具').toBeGreaterThan(0);
        expect(filled.kinds, '13 しゅるいが ぜんぶ まざる（2.4）').toEqual(Object.keys(FURNITURE).sort());
        const f = (await ed(page)).furniture[0]!;
        await edit(page, { op: 'select', x: f.x, z: f.z });
      }
      break;
    case 'namae':
      await setForm(page, { front: LONGEST_FRONT, back: 'ひみつきち' });
      await next(2);
      expect((await ed(page)).step).toBe('namae');
      break;
    case 'confirmFuton':
      await setForm(page, { furniture: [{ kind: 'futon', x: 0, z: 0 }], front: 'ふ' });
      await setBag(page, { paper: 2, fude: 1 });
      await next(2);
      await press(page, 'done');
      expect((await ed(page)).confirm, '確かめの まど（ふとん だけ）').toBe('futonOnly');
      break;
    case 'confirmReset':
      await press(page, 'new');
      expect((await ed(page)).confirm, '確かめの まど（あたらしい せっけいず）').toBe('reset');
      break;
    case 'need': {
      await setForm(page, {
        windows: 1,
        furniture: [
          { kind: 'futon', x: 0, z: 0 },
          { kind: 'tansu', x: 2, z: 0 },
          { kind: 'nukunuku', x: 3, z: 0 },
          { kind: 'andon', x: 0, z: 3 },
          { kind: 'furnace', x: 1, z: 3 },
          { kind: 'haniwa', x: 2, z: 3 }, // ねんど 2（2.4）。これで 材料は 10 しゅるい
        ],
      });
      await press(page, 'need');
      expect((await menuState(page)).page, 'ひつような もの').toBe('need');
      const rows = await needOf(page);
      expect(rows.length, 'ひつような ものの 行（材料は 10 種まで。2.4 で はにわの ねんどが 足された）').toBeGreaterThanOrEqual(10);
      expect(rows.map((r: { item: string }) => r.item), 'はにわの ねんど').toContain('clay');
      break;
    }
    case 'bubbleSoto':
    case 'bubbleNamae':
      await setForm(page, { furniture: [{ kind: 'futon', x: 0, z: 0 }, { kind: 'chair', x: 2, z: 0 }], front: kind === 'bubbleNamae' ? LONGEST_FRONT : 'あ', back: 'ひみつきち' });
      await setBag(page, { fude: 1 }); // かみが ない → いちばん 長い ふきだし（全角 35 字）
      if (kind === 'bubbleNamae') await next(2);
      await press(page, 'done');
      expect((await menuState(page)).bubble, 'いちばん 長い ふきだし').not.toBe('');
      expect(squash((await menuState(page)).bubble)).toBe(squash(MSG.noPaper));
      break;
    case 'sekkeizu': {
      await setForm(page, { furniture: [{ kind: 'futon', x: 0, z: 0 }, { kind: 'chair', x: 2, z: 0 }], front: LONGEST_FRONT, back: 'ひみつきち' });
      await setBag(page, { paper: 2, fude: 1 });
      await press(page, 'done');
      const bp = await blueprints(page);
      expect(bp, 'せっけいずが できた').toHaveLength(1);
      await press(page, 'close');
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
        h.step(2);
      });
      await page.hover(`.inv-slot[data-index="${bp[0]!.slot}"]`);
      await stepUi(page, 2);
      break;
    }
  }
  await stepUi(page, 2);
}

/** 画面の 名前（e2e/ui-gate.spec.ts の SCREENS の id）と 外わく・検査 */
export const EDITOR_GATE: { id: string; kind: EditorScreen; roots: string[]; beside?: boolean }[] = [
  { id: 'house-editor-soto', kind: 'soto', roots: EDITOR_ROOTS },
  { id: 'house-editor-naka', kind: 'naka', roots: EDITOR_ROOTS },
  { id: 'house-editor-beside', kind: 'beside', roots: EDITOR_ROOTS, beside: true },
  { id: 'house-editor-namae', kind: 'namae', roots: EDITOR_ROOTS },
  { id: 'house-confirm-futon', kind: 'confirmFuton', roots: CONFIRM_ROOTS },
  { id: 'house-confirm-reset', kind: 'confirmReset', roots: CONFIRM_ROOTS },
  { id: 'house-need', kind: 'need', roots: NEED_ROOTS },
  { id: 'house-bubble-soto', kind: 'bubbleSoto', roots: EDITOR_ROOTS },
  { id: 'house-bubble-namae', kind: 'bubbleNamae', roots: EDITOR_ROOTS },
  { id: 'house-sekkeizu-name', kind: 'sekkeizu', roots: SEKKEIZU_NAME_ROOTS },
];
