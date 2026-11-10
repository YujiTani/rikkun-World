import { expect, type Page } from '@playwright/test';
import { openHouse, press, stepUi, type HouseIssue } from './house';
import { LAYOUT, EDITOR_ROOTS, NEED_ROOTS, ed, edit as editRaw, firstArchitect, layoutTableIssues, openEditorFast, plainText, readButtons, setForm, type DomBtn } from './houseEditor';

/**
 * HOUSE-2A（#364 レシピを 見つけて えらぶ。docs/tickets/HOUSE-2A.md・仕様 3.2 版 docs/design/HOUSE-2.md）の E2E の 道具。
 * 約束（窓口・ボタンの id・data-testid）は e2e/helpers/house.ts の 先頭「2A の 約束」。レシピの 数・しゅるいの 数は どこにも 書かない（recipes().all・recipeKinds・画面の 表から）。
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
  popup: string | null;
  /** ポップアップの 行ごとの ボタンの id（上から。3.2 版） */
  popupRows: string[][];
  /** 名前の ヘルプ（のせて 12 コマで 出る。3.2 版） */
  hoverTip: { id: string; lines: string[] } | null;
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

/** 新しい op（popup・wall・door・deco・light）も 送る（型の 表には まだ 無い） */
const edit = (page: Page, op: Record<string, unknown>): Promise<boolean> => editRaw(page, op as never);

export const recipes = (page: Page): Promise<Recipes> => page.evaluate(() => (window as any).__rikkun.house.recipes());
export const learn = (page: Page, id: string): Promise<boolean> => page.evaluate((id) => (window as any).__rikkun.house.learn(id), id);
/** そのレシピで 出る ボタンの id の 列（窓口 recipeKinds） */
export const recipeKinds = (page: Page, id: string): Promise<string[]> => page.evaluate((id) => (window as any).__rikkun.house.recipeKinds(id), id);
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

// ---------------------------------------------------------------- UI 検査（AC9）

export type RecipeScreen = 'soto' | 'popup' | 'popupDeco' | 'naka' | 'namae' | 'need';

/** 仕様 §3.2 の 表（1024×700・1280×800・1440×900）。パネル・ポップアップの はば／ポップアップの x／まん中の 高さ／ポップアップの 中身の 高さ（4 行） */
const POPUP = {
  width: [388, 480, 532],
  /** 画面の 左はし から（まん中の 左はし から 604・752・844 ＋ 画面の ふち 16・24・32） */
  left: [620, 776, 876],
  height: [484, 540, 604],
  /** 一覧の 1 行 ＝ ボタン ＋ 行 → 行 */
  rowGap: [12, 12, 16],
} as const;

/** ばしょの ボタン（仕様 §3.2。絵 ＋ 字。左から やね・かべ・まど・と・かざり）: 高さ／はば（3 つの 大きさ）／ボタンの あき */
const PLACE = {
  h: [72, 80, 80],
  w: [[60, 60, 60, 56, 84], [64, 64, 64, 64, 84], [64, 64, 64, 64, 84]],
  gap: [8, 12, 16],
  text: ['やね', 'かべ', 'まど', 'と', 'かざり'],
  ids: ['part-roof', 'part-wall', 'part-window', 'part-door', 'part-deco'],
} as const;
/** ポップアップの 1 行に ならぶ 数の 上限（仕様 §2.3） */
const ROW_MAX = 5;
/** 名前の ヘルプの 外わく（仕様 §3.2）: しゅるい 1 行 44・ばしょ 2 行 76（漢字の ふりがな こみで ＋12 まで）。画面の ふちの あき */
const TIP = { h1: 44, h2: 76, ruby: 12, margin: [16, 24, 32], near: 100 } as const;

/** ぜんぶ おぼえた 世界で、いちばん 多い 形の 画面を 出す（AC9）。popup ＝ やねの ポップアップ（4 行）、popupDeco ＝ かざりの ポップアップ（名前が いちばん 長い） */
export async function openRecipeScreen(page: Page, kind: RecipeScreen): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHouse(page);
  await learnAllRecipes(page);
  await openEditorFast(page, (await firstArchitect(page)).id); // エディターを 窓口で 開く
  const next = async (n: number) => {
    for (let i = 0; i < n; i++) await press(page, 'next');
  };
  if (kind === 'soto' || kind === 'popup' || kind === 'popupDeco' || kind === 'need') {
    expect(await edit(page, { op: 'size', w: 9, d: 9 }), '大きさ 9×9').toBe(true);
    const max = (await ed(page)).windowMax;
    for (let i = 0; i < max; i++) await edit(page, { op: 'windows', delta: 1 });
  }
  if (kind === 'need') {
    // 材料の 表の ぜんぶ: 10 しゅるい（き・いし・かみ・ぬの・いと・てつ・くさ・たいまつ・あぶら・ねんど）＋ かわら・しっくい・レンガ・すいしょう・ほたるいし・きん・はな。案は まぜて よい
    for (const [op, k] of [['roof', 'kawara_shiro'], ['wall', 'shikkui_mura'], ['windowKind', 'maru_kozan'], ['light', 'suisho'], ['deco', 'hanadan_shiro'], ['deco', 'shachi'], ['deco', 'entotsu_kozan']] as const) {
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
  if (kind === 'popup' || kind === 'popupDeco') {
    expect(await edit(page, { op: 'popup', part: kind === 'popup' ? 'roof' : 'deco' }), 'ポップアップを 開く').toBe(true);
    await stepUi(page, 4);
    await hoverLongestName(page);
  }
  if (kind === 'soto') {
    await page.getByTestId('house-btn-part-deco').hover(); // 名前の ヘルプに いちばん 長い ばしょの 名前（かざり）
    await stepUi(page, 14);
  }
  if (kind === 'naka' || kind === 'namae') {
    await next(1);
    expect((await ed(page)).step).toBe('naka');
    if (kind === 'namae') {
      await setForm(page, { front: 'あいうえおかき', back: 'のとりで' });
      await next(1);
      expect((await ed(page)).step).toBe('namae');
    }
  }
  await stepUi(page, 110);
}

/** ポップアップの しゅるいの ボタンを 1 つずつ のせて、ヘルプの 字が いちばん 長い 物に のせた まま にする（名前の 長さは 窓口 hoverTip から。決め打ちしない） */
async function hoverLongestName(page: Page): Promise<string> {
  const ids = (await readButtons(page)).filter((b) => /^(roof|wall|window|door|deco)-/.test(b.id)).map((b) => b.id);
  let best = { id: ids[0] ?? '', len: -1 };
  for (const id of ids) {
    await page.getByTestId(`house-btn-${id}`).hover();
    await stepUi(page, 13); // 12 コマで 出る
    const tip = (await recipeEd(page)).hoverTip;
    const len = (tip?.lines ?? []).join('').length;
    if (len > best.len) best = { id, len };
  }
  if (best.id) {
    await page.getByTestId(`house-btn-${best.id}`).hover();
    await stepUi(page, 14);
  }
  return best.id;
}

export const RECIPE_GATE: { id: string; kind: RecipeScreen; roots: string[] }[] = [
  { id: 'house-editor-soto-recipes', kind: 'soto', roots: EDITOR_ROOTS },
  { id: 'house-editor-popup-recipes', kind: 'popup', roots: EDITOR_ROOTS },
  { id: 'house-editor-popup-deco-recipes', kind: 'popupDeco', roots: EDITOR_ROOTS },
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

/**
 * 名前の ヘルプ（AC9）: ボタン anchorId に 実際の マウスを のせて 14 コマ 進め、画面の 外へ 出ない・マウス〔ボタン〕の 近く・字 24px 以上・押せない・行の 数が 合う、を 見る。
 * 左右は 画面の ふち（16・24・32）で 止める
 */
async function tipIssues(page: Page, anchorId: string, place: boolean, c: 0 | 1 | 2): Promise<{ target: string; detail: string }[]> {
  const out: { target: string; detail: string }[] = [];
  const label = `名前の ヘルプ（${anchorId}）`;
  await page.getByTestId(`house-btn-${anchorId}`).hover();
  await stepUi(page, 14);
  const tip = (await recipeEd(page)).hoverTip;
  const r = await page.evaluate((id) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    };
    const tipEl = Array.from(document.querySelectorAll('[data-testid="editor-hover-tip"]')).find((e) => e.getBoundingClientRect().width > 0) ?? null;
    const cs = tipEl ? getComputedStyle(tipEl) : null;
    return {
      tip: rect(tipEl),
      text: tipEl
        ? (() => {
            const cl = tipEl.cloneNode(true) as Element;
            cl.querySelectorAll('rt, rp').forEach((n) => n.remove());
            return (cl.textContent ?? '').replace(/\s+/g, '');
          })()
        : null,
      fs: cs ? parseFloat(cs.fontSize) : 0,
      pe: cs ? cs.pointerEvents : '',
      anchor: rect(document.querySelector(`[data-testid="house-btn-${id}"]`)),
      W: innerWidth,
      H: innerHeight,
    };
  }, anchorId);
  if (!tip || tip.id !== anchorId) out.push({ target: label, detail: `hoverTip が ${tip ? `「${tip.id}」` : 'null'}（のせて 12 コマ たったので ${anchorId} の ヘルプが 出る）` });
  if (!r.tip) return [...out, { target: label, detail: 'editor-hover-tip が 見えない' }];
  if (!r.anchor) return [...out, { target: label, detail: 'のせた ボタンが 見えない' }];
  const t = r.tip;
  const a = r.anchor;
  const want = place ? 2 : 1;
  if (tip && tip.lines.length !== want) out.push({ target: label, detail: `${tip.lines.length} 行（${place ? 'ばしょは 2 行: 名前・「いま: …」' : 'しゅるいは 1 行'}）` });
  const h1 = place ? TIP.h2 : TIP.h1;
  if (t.h < h1 - 1.5 || t.h > h1 + TIP.ruby + 1.5) out.push({ target: label, detail: `高さ ${t.h.toFixed(1)}px（表は ${h1}px。漢字の ふりがな こみで ${h1 + TIP.ruby}px まで）` });
  if (r.fs < 23.95) out.push({ target: label, detail: `字が ${r.fs}px（24px 以上）` });
  if (r.pe !== 'none') out.push({ target: label, detail: `pointer-events が ${r.pe}（押せない 物。マウスを 通す）` });
  const m = TIP.margin[c];
  if (t.l < m - 1.5 || t.r > r.W - m + 1.5 || t.t < -0.5 || t.b > r.H + 0.5) out.push({ target: label, detail: `画面の 外に 近すぎる／出る（x ${t.l.toFixed(1)}〜${t.r.toFixed(1)}・y ${t.t.toFixed(1)}〜${t.b.toFixed(1)}、画面 ${r.W}×${r.H}、ふち ${m}px）` });
  // 置き場所: マウス〔ボタンの まん中〕の 近く。仕様 §2.3 は「ボタンに 合わせて 固定・上 8」、チケットの PO の 答え 13 は「カーソルの 近く〔ついて 動く〕」で 食い違う
  // ので、どちらでも 通る 形（マウスから ふきだしの 外わくまで NEAR px 以内。ボタンの 上に かぶっても 押せない ので よい）だけを 見る。決まったら ここを きびしく する
  const cx = (a.l + a.r) / 2;
  const cy = (a.t + a.b) / 2;
  const dx = Math.max(t.l - cx, 0, cx - t.r);
  const dy = Math.max(t.t - cy, 0, cy - t.b);
  const dist = Math.hypot(dx, dy);
  if (dist > TIP.near) out.push({ target: label, detail: `マウスから ${dist.toFixed(1)}px 離れて いる（${TIP.near}px 以内。カーソル〔のせた ボタン〕の 近く）` });
  if (r.text && tip && r.text !== tip.lines.join('').replace(/\s+/g, '')) out.push({ target: label, detail: `画面の 字「${r.text}」が hoverTip の 字「${tip.lines.join('')}」と ちがう` });
  return out;
}

const styleOf = (id: string): 'usual' | 'mura' | 'shiro' | 'kozan' => {
  const m = /_(mura|shiro|kozan)$/.exec(id);
  if (m) return m[1] as 'mura' | 'shiro' | 'kozan';
  return id === 'deco-shachi' ? 'shiro' : 'usual'; // しゃちほこ は おしろの 行（仕様 §2.3）
};
const STYLE_ORDER = ['usual', 'mura', 'shiro', 'kozan'] as const;

/** AC9: ぜんぶ おぼえた 世界の 画面の 数・ならび・大きさ。はみ出す・重なる・字の 大きさ・押せる 大きさは 共通の 検査（editorUiIssues）が 見る */
export async function recipeGateIssues(page: Page, kind: RecipeScreen): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  const issue = (target: string, detail: string) => found.push({ kind: 'recipe', target, detail });
  const c = await col(page);
  const bs = (await readButtons(page)).filter((b) => b.scope === (kind === 'need' ? 'need' : 'editor'));
  const mainBtn = LAYOUT.mainBtn[c];

  if (kind === 'soto') {
    found.push(...(await layoutTableIssues(page, 'soto')));
    const parts = bs.filter((b) => b.id.startsWith('part-')).sort((a, d) => a.rect.x - d.rect.x);
    const kinds = bs.filter((b) => /^(roof|wall|window|door|deco)-/.test(b.id));
    if (parts.map((b) => b.id).join() !== PLACE.ids.join()) issue('ばしょの ボタン', `${parts.map((b) => b.id).join('・')}（左から ${PLACE.ids.join('・')}。かざりは ぜんぶ おぼえて いるので 出る）`);
    if (kinds.length > 0) issue('しゅるいの ボタン', `ポップアップが とじて いる のに ${kinds.length} こ 見えて いる`);
    if (parts.length > 0 && !sameRow(parts)) issue('ばしょの ボタン', '1 つの 行に ならばない');
    // 絵 ＋ 字（3.2 版）: 正方形では ない。高さと はばは 表（仕様 §3.2）、あきは 左 よせで 8・12・16
    parts.forEach((b, i) => {
      if (Math.abs(b.rect.h - PLACE.h[c]) > 2) issue(`${b.id} の 高さ`, `${b.rect.h.toFixed(1)}px（表は ${PLACE.h[c]}px）`);
      if (Math.abs(b.rect.w - PLACE.w[c][i]!) > 2) issue(`${b.id} の はば`, `${b.rect.w.toFixed(1)}px（表は ${PLACE.w[c][i]}px）`);
      if (b.text !== PLACE.text[i]) issue(`${b.id} の 字`, `「${b.text}」（「${PLACE.text[i]}」。絵 ＋ 字）`);
      if (i > 0) {
        const gap = b.rect.x - (parts[i - 1]!.rect.x + parts[i - 1]!.rect.w);
        if (Math.abs(gap - PLACE.gap[c]) > 2) issue(`${b.id} の 左の あき`, `${gap.toFixed(1)}px（表は ${PLACE.gap[c]}px）`);
      }
    });
    const widest = parts.length > 0 ? Math.max(...parts.map((b) => b.rect.x + b.rect.w)) - Math.min(...parts.map((b) => b.rect.x)) : 0;
    const panel = c === 0 ? 356 : c === 1 ? 432 : 468; // パネルの 中の はば（仕様 §3.2。388・480・532 − 内がわ×2）
    if (widest > panel + 1.5) issue('ばしょの 行の はば', `${widest.toFixed(1)}px（${panel}px 以内）`);
    for (const gone of ['editor-part-name', 'editor-kind-name', 'popup-kind-name']) {
      if ((await plainText(page, gone)) !== null) issue('名前の 行', `${gone} が まだ ある（3.2 版は 名前の 行を やめて 名前の ヘルプに した）`);
    }
    const w = await wrapped(page, parts.map((b) => b.id));
    if (w.length > 0) issue('ボタンの 字', `1 行に ならない: ${w.join('・')}`);
    for (const t of await tipIssues(page, 'part-deco', true, c)) issue(t.target, t.detail);
    for (const t of await tipIssues(page, 'part-roof', true, c)) issue(t.target, t.detail);
    await page.getByTestId('house-btn-part-deco').hover(); // 撮る 画面は いちばん 長い ばしょの 名前
    await stepUi(page, 14);
  }

  if (kind === 'popup' || kind === 'popupDeco') {
    const pop = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-testid="editor-popup"]')).find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const pv = Array.from(document.querySelectorAll('[data-testid="editor-preview"]')).find((e) => e.getBoundingClientRect().width > 0);
      const pr = pv?.getBoundingClientRect();
      const list = el.querySelector('[data-testid="popup-list"]') as HTMLElement | null;
      const rows = Array.from(el.querySelectorAll('[data-testid="popup-row"]')).map((row) => ({
        top: row.getBoundingClientRect().top,
        n: row.querySelectorAll('[data-testid^="house-btn-"]').length,
      }));
      // 行の 見出し・印は ない（3.2 版）
      const heads = el.querySelectorAll('[data-testid="popup-row-mark"], [data-testid="popup-row-title"], [data-testid="popup-kind-name"]').length;
      const title = el.querySelector('[data-testid="popup-title"]');
      return {
        x: r.x, y: r.y, w: r.width, h: r.height, preview: pr ? { r: pr.right } : null,
        scrolls: list ? list.scrollHeight > list.clientHeight + 1 : null, hasList: list !== null,
        rows, heads, title: title ? (title.textContent ?? '').replace(/\s+/g, '') : null,
      };
    });
    if (!pop) return [...found, { kind: 'recipe', target: 'ポップアップ', detail: 'editor-popup が 見えない' }];
    const near = (v: number, want: number): boolean => Math.abs(v - want) <= 1.5;
    if (!near(pop.x, POPUP.left[c]) || !near(pop.w, POPUP.width[c])) issue('ポップアップの 場所', `x ${pop.x.toFixed(1)}・はば ${pop.w.toFixed(1)}（表は x ${POPUP.left[c]}・はば ${POPUP.width[c]}。① の パネルと 同じ x・はば）`);
    if (!near(pop.h, POPUP.height[c])) issue('ポップアップの 高さ', `${pop.h.toFixed(1)}px（表は まん中の 高さ ${POPUP.height[c]}px いっぱい）`);
    if (pop.preview && pop.preview.r > pop.x + 1.5) issue('見本', `見本の 右はし ${pop.preview.r.toFixed(1)} が ポップアップの 左 ${pop.x.toFixed(1)} に かかる（見本は かくさない）`);
    if (!pop.title || pop.title.length === 0) issue('上の だん', 'popup-title が 見えない（ばしょの 絵と 名前）');
    if (!pop.hasList) issue('一覧', 'popup-list が ない');
    if (pop.scrolls) issue('スクロール', '一覧が スクロールする（ぜんぶ おぼえた ときの いちばん 多い 形でも スクロール なしで 入る。仕様 §3.2）');

    const kinds = bs.filter((b) => /^(roof|wall|window|door|deco)-/.test(b.id));
    const closeBtn = bs.find((b) => b.id === 'popupClose');
    if (!closeBtn) issue('✕', 'popupClose が 見えない');
    else if (closeBtn.rect.w < 55.5 || closeBtn.rect.h < 55.5) issue('✕', `${closeBtn.rect.w.toFixed(1)}×${closeBtn.rect.h.toFixed(1)}px（56px 以上。表は ${mainBtn}px 角）`);
    else if (Math.abs(closeBtn.rect.w - closeBtn.rect.h) > 1.5 || !near(closeBtn.rect.w, mainBtn)) issue('✕', `${closeBtn.rect.w.toFixed(1)}×${closeBtn.rect.h.toFixed(1)}px（表は 正方形 ${mainBtn}px）`);
    const bad = SQUARE(kinds, mainBtn);
    if (bad.length > 0) issue('しゅるいの ボタンの 大きさ', `${bad.slice(0, 3).join(' ／ ')}（表は 正方形 ${mainBtn}px）`);
    if (kinds.some((b) => b.rect.y + b.rect.h > pop.y + pop.h + 0.5 || b.rect.x + b.rect.w > pop.x + pop.w + 0.5)) issue('ボタン', 'ポップアップの 外に はみ出す');

    // 行: y で まとめる。1 行 5 こ まで・左 つめ・行ごとに 同じ 案・上から いつもの → むら → おしろ → こうざん・空の 行 なし・すき間 なし・見出し／印 なし
    const rows: DomBtn[][] = [];
    for (const b of [...kinds].sort((a, d) => a.rect.y - d.rect.y || a.rect.x - d.rect.x)) {
      const row = rows.find((r) => Math.abs(r[0]!.rect.y - b.rect.y) <= 4);
      if (row) row.push(b);
      else rows.push([b]);
    }
    const left0 = rows[0] ? Math.min(...rows[0].map((b) => b.rect.x)) : 0;
    rows.forEach((row, i) => {
      row.sort((a, d) => a.rect.x - d.rect.x);
      if (row.length > ROW_MAX) issue(`${i + 1} 行目`, `${row.length} こ（1 行 ${ROW_MAX} こ まで。こえたら 同じ なかまの 次の 行へ 折りかえす）`);
      const styles = new Set(row.map((b) => styleOf(b.id)));
      if (styles.size !== 1) issue(`${i + 1} 行目`, `ちがう なかまが まざって いる: ${[...styles].join('・')}`);
      const xs = row.map((b) => b.rect.x);
      if (Math.abs(xs[0]! - left0) > 1.5) issue(`${i + 1} 行目`, `左 つめに なって いない（x ${xs[0]!.toFixed(1)}、1 行目は ${left0.toFixed(1)}）`);
      for (let k = 1; k < xs.length; k++) {
        if (Math.abs(xs[k]! - xs[k - 1]! - (row[0]!.rect.w + POPUP.rowGap[c])) > 1.5) issue(`${i + 1} 行目`, `ボタンの あいだが 表（あき ${POPUP.rowGap[c]}px）と ちがう（${(xs[k]! - xs[k - 1]!).toFixed(1)}px おき）`);
      }
    });
    const order = rows.map((r) => STYLE_ORDER.indexOf(styleOf(r[0]!.id)));
    if (order.some((o, i) => i > 0 && o < order[i - 1]!)) issue('行の 順', `いつもの → むら → おしろ → こうざん の 順に ならんで いない: ${rows.map((r) => styleOf(r[0]!.id)).join(' → ')}`);
    if (rows.length > 1) {
      const gaps = rows.slice(1).map((r, i) => r[0]!.rect.y - (rows[i]![0]!.rect.y + rows[i]![0]!.rect.h));
      if (gaps.some((g) => Math.abs(g - POPUP.rowGap[c]) > 1.5)) issue('行 → 行の あき', `${gaps.map((g) => g.toFixed(1)).join('・')}px（表は ${POPUP.rowGap[c]}px。空の 行で すき間を あけない）`);
    }
    if (pop.rows.some((r) => r.n === 0)) issue('空の 行', 'popup-row に ボタンが 1 つも ない（空の 行は 出さない）');
    if (pop.heads > 0) issue('行の 見出し・印', `${pop.heads} こ 見える（3.2 版は 行の 見出し・印・名前の 行を 付けない。行が かわる ことで なかまが 分かる）`);
    // 画面の 行の ならびは 窓口 popupRows と 同じ
    const edNow = await recipeEd(page);
    if (JSON.stringify(rows.map((r) => r.map((b) => b.id))) !== JSON.stringify(edNow.popupRows)) issue('行の 中身', `画面 ${JSON.stringify(rows.map((r) => r.map((b) => b.id)))} ≠ 窓口 popupRows ${JSON.stringify(edNow.popupRows)}`);
    // やね・かべ・まどは「なし」が いちばん 左（いつもの 行）
    const place = edNow.popup;
    if ((place === 'roof' || place === 'wall' || place === 'window') && rows[0]?.[0]?.id !== `${place}-none`) issue('なし', `${place} の いちばん 左は ${place}-none（今は ${rows[0]?.[0]?.id ?? '行なし'}）`);
    const w = await wrapped(page, [...kinds.map((b) => b.id), 'popupClose']);
    if (w.length > 0) issue('ボタンの 字', `1 行に ならない: ${w.join('・')}`);
    if (kind === 'popup' && rows.length < 2) issue('一覧', 'やねの ポップアップに 行が 1 つしか ない（ぜんぶ おぼえた）');
    // 名前の ヘルプ: いちばん 右・いちばん 上の ボタンに のせても 画面の 外へ 出ない／いちばん 長い 名前に のせた まま 撮る
    const topRight = [...kinds].sort((a, d) => a.rect.y - d.rect.y || d.rect.x - a.rect.x)[0];
    if (topRight) for (const t of await tipIssues(page, topRight.id, false, c)) issue(t.target, t.detail);
    const longest = await hoverLongestName(page);
    if (longest) for (const t of await tipIssues(page, longest, false, c)) issue(t.target, t.detail);
  }

  if (kind === 'naka') {
    const fb = bs.filter((b) => b.id.startsWith('furniture-')).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const rows: DomBtn[][] = [];
    for (const b of fb) {
      const row = rows.find((r) => Math.abs(r[0]!.rect.y - b.rect.y) <= 4);
      if (row) row.push(b);
      else rows.push([b]);
    }
    // 家具の 数は 画面の ボタンから（窓口と の くい違いは editorMismatch が 見る）。上の 行が ⌈n÷2⌉（1 行 7 こまで）・下が のこり
    const top = Math.ceil(fb.length / 2);
    if (top > 7) issue('家具の ならび', `${fb.length} こ は 上 7・下 7 に 入らない（1 行 7 こまで。15 しゅるい目からは 3 行目）`);
    if (JSON.stringify(rows.map((r) => r.length)) !== JSON.stringify([top, fb.length - top])) issue('家具の ならび', `${JSON.stringify(rows.map((r) => r.length))}（上 ${top}・下 ${fb.length - top}）`);
    if (rows.at(-1)?.at(-1)?.id !== 'furniture-maneki') issue('家具の ならび', 'まねきねこが 下の だんの いちばん 右に ない');
    const bad = SQUARE(fb, mainBtn);
    if (bad.length > 0) issue('家具の ボタンの 大きさ', `${bad.slice(0, 3).join(' ／ ')}（表は 正方形 ${mainBtn}px）`);
    const lights = bs.filter((b) => b.id.startsWith('light-'));
    for (const want of ['light-lantern', 'light-hotaru', 'light-suisho']) if (!lights.some((b) => b.id === want)) issue('あかりの ボタン', `${want} が ない（ぜんぶ おぼえた）`);
    if (lights.length > 0) {
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
    for (const want of ['suffix-5', 'suffix-6', 'suffix-7']) if (!sf.some((b) => b.id === want)) issue('後ろの 文字', `${want} が ない（ぜんぶ おぼえた）`);
    const xs = [...new Set(sf.map((b) => Math.round(b.rect.x / 4)))].sort((a, b) => a - b);
    if (xs.length !== 2) issue('後ろの 文字の 列', `${xs.length} 列（2 列 × 4 だん まで）`);
    else {
      const left = sf.filter((b) => Math.round(b.rect.x / 4) === xs[0]);
      const right = sf.filter((b) => Math.round(b.rect.x / 4) === xs[1]);
      if (left.length > 4 || right.length > 4) issue('後ろの 文字の 列', `左 ${left.length}・右 ${right.length}（どちらも 4 まで）`);
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
      const fit = [9, 11, 13][c]!; // 入る 行の 数（仕様 §3.2）
      if (r.count > fit && !r.scrolls) issue('スクロール', `${r.count} 行は 入る 行（${fit}）を こえる ので 行の ところが スクロールする`);
      if (r.scrolls && r.fully < fit) issue('見える 行', `${r.fully} 行（${fit} 行 以上 入る）`);
      if (r.scrolls && !r.lastReachable) issue('スクロール', 'さいごの 行まで とどかない');
      if (r.items.filter((i) => (i ?? '').startsWith('flower')).length !== 1) issue('はなの 行', 'はなは 3 いろ あわせて 1 行');
    }
  }
  return found;
}
