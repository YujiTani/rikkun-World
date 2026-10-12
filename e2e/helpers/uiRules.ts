/**
 * UI の きまりを DOM でしらべる道具（M6 S1。仕様 AC31〜AC33・AC35・AC36）。
 *
 * 使い方（テストから）:
 *   const snap = await snapshotUi(page, { root: '#inventory-screen' });
 *   expect(checkColors(snap)).toEqual([]);
 *   expect(checkFontSizes(snap)).toEqual([]);
 *   expect(checkContrast(snap)).toEqual([]);
 *   expect(checkComponents(snap)).toEqual([]);
 *   expect(await checkRootVars(page)).toEqual([]);
 *   expect(await checkAnimations(page)).toEqual([]);
 *   expect(await checkPressedShift(page, '.rk-btn--primary')).toEqual([]);
 * どれも「見つけた まちがい」の文の列を返す（空 = 合格）。
 *
 * ページの中では 生の値だけを集め（snapshotUi）、判定は Node 側（src/ui/theme/colorMath.ts）でする。
 */
import type { Page } from '@playwright/test';
import { composite, contrastRatio, isAllowedColor, parseCssColor, requiredContrast, type Rgba } from '../../src/ui/theme/colorMath';
import { ALL_RK_VARS, FONT_SIZES_PX, RADII_PX, SPACING_PX } from '../../src/ui/theme/palette';

export interface UiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UiEl {
  /** 目印（tag#id.class） */
  path: string;
  tag: string;
  classes: string[];
  /** その要素が自分で持つ文字（子の文字は ふくまない） */
  text: string;
  color: string;
  bg: string;
  bgImage: string;
  /** 太さ 0 でない ふちの色 */
  borderColors: string[];
  fontSize: number;
  fontWeight: number;
  numeric: string;
  rect: UiRect;
  /** 4 すみの丸さ（px 文字列。% など） */
  radii: string[];
  /** padding 4 辺（px） */
  padding: number[];
  /** [行のすき間, 列のすき間]（px。normal は 0） */
  gap: number[];
  /** 自分から html まで（自分が先頭）の 背景色と背景画像 */
  chain: { bg: string; bgImage: string }[];
  /** 自分から上の opacity の積 */
  opacity: number;
  inHud: boolean;
  /** ボタン・タブか */
  pressable: boolean;
  /** 案内画面のタブか（.rk-tab--guide） */
  guideTab: boolean;
  inRt: boolean;
}

export interface UiSnapshot {
  viewport: { w: number; h: number };
  els: UiEl[];
}

export interface SnapshotOptions {
  /** しらべる範囲のはじまり（CSS セレクタ）。なければ body ぜんぶ */
  root?: string;
}

/** 見えている要素の 計算後の値を 集める（ドット絵の img・canvas の中は のぞく） */
export async function snapshotUi(page: Page, opts: SnapshotOptions = {}): Promise<UiSnapshot> {
  return page.evaluate((rootSel) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const root = rootSel ? document.querySelector(rootSel) : document.body;
    const out: unknown[] = [];
    if (!root) return { viewport: { w: vw, h: vh }, els: [] };
    const px = (v: string): number => (v.endsWith('px') ? parseFloat(v) : 0);
    const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const el of nodes) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'canvas' || tag === 'img' || tag === 'svg') continue;
      if (el.closest('.rk-art, [data-rk-art], canvas')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      // 上のどこかが 見えない（hidden / display:none / 不透明度 0）なら のぞく
      let opacity = 1;
      let hidden = false;
      const chain: { bg: string; bgImage: string }[] = [];
      for (let p: Element | null = el; p; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (pcs.display === 'none' || pcs.visibility === 'hidden') hidden = true;
        opacity *= parseFloat(pcs.opacity);
        chain.push({ bg: pcs.backgroundColor, bgImage: pcs.backgroundImage });
      }
      if (hidden || opacity <= 0.01) continue;
      let text = '';
      for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? '';
      text = text.trim();
      const borders: string[] = [];
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        const w = parseFloat((cs as unknown as Record<string, string>)[`border${side}Width`]);
        const st = (cs as unknown as Record<string, string>)[`border${side}Style`];
        if (w > 0 && st !== 'none' && st !== 'hidden') borders.push((cs as unknown as Record<string, string>)[`border${side}Color`]);
      }
      const classes = Array.from(el.classList);
      const id = el.id ? `#${el.id}` : '';
      out.push({
        path: `${tag}${id}${classes.length ? '.' + classes.join('.') : ''}`,
        tag,
        classes,
        text,
        color: cs.color,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        borderColors: borders,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10),
        numeric: cs.fontVariantNumeric,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
        gap: [px(cs.rowGap), px(cs.columnGap)],
        chain,
        opacity,
        inHud: !!el.closest('#hud'),
        pressable: tag === 'button' || el.classList.contains('rk-btn') || el.classList.contains('rk-tab') || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'button',
        guideTab: el.classList.contains('rk-tab--guide'),
        inRt: !!el.closest('rt'),
      });
    }
    return { viewport: { w: vw, h: vh }, els: out };
  }, opts.root ?? null) as Promise<UiSnapshot>;
}

const GRADIENT_COLOR = /(rgba?\([^)]*\)|color\(srgb[^)]*\))/g;

function gradientStops(bgImage: string): Rgba[] {
  const out: Rgba[] = [];
  for (const m of bgImage.matchAll(GRADIENT_COLOR)) {
    const c = parseCssColor(m[1]);
    if (c) out.push(c);
  }
  return out;
}

function tag(e: UiEl): string {
  return `${e.path}${e.text ? `「${e.text.slice(0, 16)}」` : ''}`;
}

const near = (v: number, list: readonly number[], tol = 0.6): boolean => list.some((x) => Math.abs(v - x) <= tol);

// ---------------------------------------------------------------- AC31 色

/** 計算後の color・background-color・border-color・グラデーションの止まりが §3.5 (2) の色か */
export function checkColors(snap: UiSnapshot): string[] {
  const bad: string[] = [];
  const test = (e: UiEl, what: string, raw: string): void => {
    const c = parseCssColor(raw);
    if (!c) {
      bad.push(`${tag(e)}: ${what} が読めない (${raw})`);
      return;
    }
    if (!isAllowedColor(c)) bad.push(`${tag(e)}: ${what} ${raw} は 決まりの色ではない`);
  };
  for (const e of snap.els) {
    if (e.text) test(e, 'color', e.color);
    test(e, 'background-color', e.bg);
    e.borderColors.forEach((b) => test(e, 'border-color', b));
    for (const s of gradientStops(e.bgImage)) test(e, 'グラデーションの止まり', `rgb(${s.r} ${s.g} ${s.b} / ${s.a})`);
  }
  return bad;
}

/** `:root` に §3.5 の変数が ぜんぶ あるか */
export async function checkRootVars(page: Page): Promise<string[]> {
  const missing = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return names.filter((n) => cs.getPropertyValue(n).trim() === '');
  }, ALL_RK_VARS as string[]);
  return missing.map((n) => `:root に ${n} がない`);
}

// ---------------------------------------------------------------- AC32 文字

/** 文字の大きさが 16・20・24・32・48（rt は 12 以上）。数字の要素は tabular-nums */
export function checkFontSizes(snap: UiSnapshot): string[] {
  const bad: string[] = [];
  for (const e of snap.els) {
    if (!e.text) continue;
    if (e.tag === 'rt' || e.inRt) {
      if (e.fontSize < 11.9) bad.push(`${tag(e)}: ルビが 12px より小さい (${e.fontSize}px)`);
      continue;
    }
    if (!near(e.fontSize, FONT_SIZES_PX)) bad.push(`${tag(e)}: font-size ${e.fontSize}px は 16/20/24/32/48 のどれでもない`);
    if (e.fontSize < 15.9) bad.push(`${tag(e)}: 16px より小さい (${e.fontSize}px)`);
    if (/^[\d\s/×.,:%+x-]+$/.test(e.text) && /\d/.test(e.text) && !e.numeric.includes('tabular-nums')) {
      bad.push(`${tag(e)}: 数字なのに tabular-nums ではない`);
    }
  }
  return bad;
}

// ---------------------------------------------------------------- AC33 コントラスト

export interface ContrastOptions {
  /** HUD の中の 下地にする 世界の色（いちばん明るい空） */
  hudWorld?: string;
  /** HUD の外で 下地が 透明のままのときの色 */
  pageBase?: string;
}

/** 文字の色と 下地（下の半透明をかさねた色）の 明るさの比。24px 以上で 太さ 700 以上は 3、ほかは 4.5。グラデーションは 一番ひどい止まりで見る */
export function checkContrast(snap: UiSnapshot, opts: ContrastOptions = {}): string[] {
  const bad: string[] = [];
  const hudWorld = parseCssColor(opts.hudWorld ?? '#ffffff') ?? { r: 255, g: 255, b: 255, a: 1 };
  const pageBase = parseCssColor(opts.pageBase ?? 'rgb(0, 0, 0)') ?? { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  void white;
  for (const e of snap.els) {
    if (!e.text) continue;
    const fg = parseCssColor(e.color);
    if (!fg) continue;
    // 外側 → 内側へ かさねる
    let cands: Rgba[] = [e.inHud ? hudWorld : pageBase];
    for (let i = e.chain.length - 1; i >= 0; i--) {
      const lv = e.chain[i];
      const bg = parseCssColor(lv.bg);
      const stops = lv.bgImage.includes('gradient') ? gradientStops(lv.bgImage) : [];
      if (stops.length) cands = cands.flatMap((base) => stops.map((s) => composite(s, base)));
      else if (bg && bg.a > 0) cands = cands.map((base) => composite(bg, base));
    }
    const need = requiredContrast(e.fontSize, e.fontWeight);
    const worst = Math.min(...cands.map((bgc) => contrastRatio(composite({ ...fg, a: fg.a * 1 }, bgc), bgc)));
    if (worst < need) bad.push(`${tag(e)}: 比 ${worst.toFixed(2)} < ${need} (文字 ${e.color})`);
  }
  return bad;
}

// ---------------------------------------------------------------- AC35 部品の一貫性

/** ボタン・タブの高さ（56 以上、案内のタブは 64 以上）、角の丸さ、padding・gap の段階 */
export function checkComponents(snap: UiSnapshot): string[] {
  const bad: string[] = [];
  const k = snap.viewport.w / 1280; // 1280 のときの数字で比べる（それ以外は 拡大ぶんを割る）
  for (const e of snap.els) {
    if (e.pressable) {
      const need = e.guideTab ? 64 : 56;
      if (e.rect.h < need * Math.min(k, 1) - 0.6) bad.push(`${tag(e)}: 高さ ${e.rect.h.toFixed(1)}px < ${need}px`);
    }
    for (const r of e.radii) {
      if (r === '0px') continue;
      if (!r.endsWith('px')) {
        bad.push(`${tag(e)}: 角の丸さ ${r} は px ではない`);
        continue;
      }
      const v = parseFloat(r);
      if (!near(v, RADII_PX) && v < 500) bad.push(`${tag(e)}: 角の丸さ ${v}px は 8/14/24/999 のどれでもない`);
    }
    for (const v of [...e.padding, ...e.gap]) {
      if (!near(v / k, SPACING_PX, 0.8) && !near(v, SPACING_PX, 0.8)) bad.push(`${tag(e)}: padding/gap ${v}px は 4/8/12/16/24/32/48 のどれでもない`);
    }
  }
  // 主ボタンは 同じ背景
  const primaries = snap.els.filter((e) => e.classes.includes('rk-btn--primary'));
  const first = primaries[0];
  for (const p of primaries.slice(1)) {
    if (p.bgImage !== first.bgImage || p.bg !== first.bg) bad.push(`${tag(p)}: 主ボタンの背景が ${tag(first)} とちがう`);
  }
  return bad;
}

/**
 * `:active` を DOM で再現して（CDP の forcePseudoState）、ボタンが translateY(2px) になるかしらべる。
 * selector に合う最初の 見えている 1 つを見る。
 */
export async function checkPressedShift(page: Page, selector: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const doc = await cdp.send('DOM.getDocument', { depth: 0 });
    const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
    if (!q.nodeId) return [`${selector} が見つからない`];
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: ['active'] });
    await page.waitForTimeout(250); // 120ms の動きが終わるまで
    const ty = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return m.m42;
    }, selector);
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: [] });
    if (ty === null) return [`${selector} が見つからない`];
    return Math.abs(ty - 2) < 0.6 ? [] : [`${selector}: :active で translateY(2px) にならない (${ty}px)`];
  } finally {
    await cdp.detach();
  }
}

// ---------------------------------------------------------------- AC36 点滅

export interface AnimInfo {
  target: string;
  props: string[];
  /** 1 回の長さ（ミリ秒） */
  iterationMs: number;
  repeats: boolean;
  /** 対象の面積 ÷ 画面 */
  areaRatio: number;
}

/** 今 動いている アニメーションを集める */
export async function collectAnimations(page: Page): Promise<AnimInfo[]> {
  return page.evaluate(() => {
    const vwh = window.innerWidth * window.innerHeight;
    const flashing = /^(opacity|color|backgroundColor|background-color|borderColor|border-color|[a-z]+Color|filter|boxShadow|box-shadow|textShadow|text-shadow|background|backgroundImage)$/;
    const res: unknown[] = [];
    for (const a of document.getAnimations()) {
      const eff = a.effect as KeyframeEffect | null;
      if (!eff || !('target' in eff) || !eff.target) continue;
      const props = new Set<string>();
      for (const kf of eff.getKeyframes()) for (const k of Object.keys(kf)) if (flashing.test(k)) props.add(k);
      if (props.size === 0) continue;
      const t = eff.getTiming();
      const iterations = t.iterations ?? 1;
      const dur = typeof t.duration === 'number' ? t.duration : parseFloat(String(t.duration));
      const target = eff.target as Element;
      const r = target.getBoundingClientRect();
      res.push({
        target: `${target.tagName.toLowerCase()}${target.id ? '#' + target.id : ''}${target.className && typeof target.className === 'string' ? '.' + target.className.split(' ').join('.') : ''}`,
        props: Array.from(props),
        iterationMs: dur,
        repeats: iterations > 1,
        areaRatio: (r.width * r.height) / vwh,
      });
    }
    return res;
  }) as Promise<AnimInfo[]>;
}

/** くり返す 明るさ・色の動きが 1 回 400ms 以上 で、画面の 25% より大きい要素では くり返さない */
export async function checkAnimations(page: Page): Promise<string[]> {
  const bad: string[] = [];
  for (const a of await collectAnimations(page)) {
    if (!a.repeats) continue;
    if (a.iterationMs < 400) bad.push(`${a.target}: ${a.props.join(',')} が 1 回 ${a.iterationMs}ms (< 400ms)`);
    if (a.areaRatio > 0.25) bad.push(`${a.target}: 画面の ${(a.areaRatio * 100).toFixed(0)}% の要素が ${a.props.join(',')} をくり返す`);
  }
  return bad;
}
