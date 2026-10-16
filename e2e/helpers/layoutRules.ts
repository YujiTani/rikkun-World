/**
 * 画面の くずれを DOM でしらべる道具（UI 検査ゲート）。
 *
 * 使い方（テストから）:
 *   const bad = await checkLayout(page, ['#inventory-screen']);
 *   // bad は 見つけた くずれの列（空 = 合格）
 *
 * しらべること:
 * - offscreen: 画面（ビューポート）の外に はみ出している（スクロールで見られる所は のぞく）
 * - spill:     文字が 自分の わく（ボタンなど）から はみ出している
 * - clipped:   文字が 親の overflow:hidden で 切れている・「…」で 切れている
 * - overlap:   文字どうし・ボタンどうしが 重なっている（親子は のぞく）
 * - covered:   押せる物の まん中が ほかの物に かくれている
 * - small:     押せる物が 小さすぎる（はば・高さ 44px より小さい）
 * - wrap:      ボタンの文字・みじかい名前が 折り返して 2 行以上になっている（「あそぼ／う！」「た／ん／す」のような 切れ方）
 *
 * ページの中では 生の位置だけを集め（collectLayout）、判定は Node 側（judgeLayout）でする。
 * 1 つの くずれを 1 回だけ出すため、親で見つけた物の 子は 同じ種類では 出さない。
 */
import type { Page } from '@playwright/test';

export type LayoutKind = 'offscreen' | 'spill' | 'clipped' | 'overlap' | 'covered' | 'small' | 'wrap';

export interface LayoutIssue {
  kind: LayoutKind;
  /** 目印（tag#id.class「文字」）。数字（座標）を ふくまないので、知っている くずれの表と くらべられる */
  target: string;
  /** 数字つきの くわしい説明 */
  detail: string;
}

interface Box {
  x: number;
  y: number;
  r: number;
  b: number;
}

interface LayoutEl {
  i: number;
  parent: number;
  path: string;
  text: string;
  box: Box;
  /** 文字の行ごとの 箱（文字がなければ 空） */
  lines: Box[];
  /** overflow が visible でない 親 ぜんぶで 見える範囲 */
  clip: Box;
  /** スクロールしても 見られない 切れ目（いちばん近い スクロールの親より 内側の hidden・clip の親） */
  hardClip: Box;
  /** inline・ルビ（わくを持たない） */
  inline: boolean;
  /** スクロールする親が あるか（あれば 画面の外でも スクロールで見られる） */
  inScroller: boolean;
  /** text-overflow: ellipsis で 切れている */
  ellipsis: boolean;
  pressable: boolean;
  /** pointer-events が none でない（elementFromPoint で しらべられる） */
  hittable: boolean;
  /** まん中に いちばん上で 見えている物が 自分か 親子なら true。しらべられないときは null */
  centerOnTop: boolean | null;
  /** まん中で いちばん上に ある物の 目印 */
  topPath: string;
  /** 祖先の 番号（自分は ふくまない） */
  ancestors: number[];
}

export interface LayoutSnapshot {
  viewport: { w: number; h: number };
  els: LayoutEl[];
}

/** roots（CSS セレクタ）の中の 見えている要素の 位置を集める */
export async function collectLayout(page: Page, roots: string[]): Promise<LayoutSnapshot> {
  return page.evaluate((rootSels) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: unknown[] = [];
    const index = new Map<Element, number>();
    const toBox = (r: DOMRect | { left: number; top: number; right: number; bottom: number }): Box => ({ x: r.left, y: r.top, r: r.right, b: r.bottom });
    const inter = (a: Box, b: Box): Box => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
    const label = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = Array.from(el.classList).slice(0, 3);
      return `${tag}${id}${cls.length ? '.' + cls.join('.') : ''}`;
    };
    const visible = (el: Element): boolean => {
      let opacity = 1;
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if ((p as HTMLElement).hidden) return false;
        opacity *= parseFloat(cs.opacity);
      }
      return opacity > 0.01;
    };
    for (const sel of rootSels) {
      for (const root of Array.from(document.querySelectorAll(sel))) {
        const nodes: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
        for (const el of nodes) {
          if (index.has(el)) continue;
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'br' || tag === 'wbr') continue;
          if (el.closest('svg') && tag !== 'svg') continue;
          if (!visible(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const cs = getComputedStyle(el);
          // 自分の 文字（子の要素の 文字は ふくまない）の 行の箱
          let text = '';
          const lines: Box[] = [];
          for (const n of Array.from(el.childNodes)) {
            if (n.nodeType !== 3 || !(n.textContent ?? '').trim()) continue;
            text += n.textContent;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const lr of Array.from(range.getClientRects())) if (lr.width > 0 && lr.height > 0) lines.push(toBox(lr));
          }
          text = text.replace(/\s+/g, ' ').trim();
          // 親の 切りとり
          // clip: overflow が visible でない 親 ぜんぶ（見えている範囲）
          // hardClip: いちばん近い スクロールの親 より 内側の、hidden・clip の親だけ（スクロールしても 見られない 切れ目）
          let clip: Box = { x: -1e9, y: -1e9, r: 1e9, b: 1e9 };
          let hardClip: Box = clip;
          let inScroller = false;
          const ancestors: number[] = [];
          for (let p = el.parentElement; p; p = p.parentElement) {
            const pi = index.get(p);
            if (pi !== undefined) ancestors.push(pi);
            const pcs = getComputedStyle(p);
            const ox = pcs.overflowX;
            const oy = pcs.overflowY;
            if (ox === 'visible' && oy === 'visible') continue;
            const pr = toBox(p.getBoundingClientRect());
            clip = inter(clip, pr);
            const scroll = (v: string) => v === 'auto' || v === 'scroll';
            if (scroll(ox) || scroll(oy)) inScroller = true;
            if (!inScroller) hardClip = inter(hardClip, pr);
          }
          const pressable =
            tag === 'button' || el.classList.contains('rk-btn') || el.classList.contains('rk-tab') || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'button';
          const hittable = cs.pointerEvents !== 'none';
          let centerOnTop: boolean | null = null;
          let topPath = '';
          if (pressable && hittable) {
            const vis = inter(inter(toBox(rect), clip), { x: 0, y: 0, r: vw, b: vh });
            if (vis.r - vis.x > 2 && vis.b - vis.y > 2) {
              const hit = document.elementFromPoint((vis.x + vis.r) / 2, (vis.y + vis.b) / 2);
              centerOnTop = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
              topPath = hit ? label(hit) : '';
            }
          }
          const i = out.length;
          index.set(el, i);
          out.push({
            i,
            parent: el.parentElement ? (index.get(el.parentElement) ?? -1) : -1,
            path: label(el),
            text,
            box: toBox(rect),
            lines,
            clip,
            hardClip,
            inScroller,
            inline: cs.display === 'inline' || cs.display.startsWith('ruby') || !!el.closest('ruby'),
            ellipsis: cs.textOverflow === 'ellipsis' && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1,
            pressable,
            hittable,
            centerOnTop,
            topPath,
            ancestors,
          });
        }
      }
    }
    return { viewport: { w: vw, h: vh }, els: out };
  }, roots) as Promise<LayoutSnapshot>;
}

const TOL = 1.5; // 小数の ずれは 見のがす（px）
const MIN_TAP = 44; // 押せる物の いちばん小さい はば・高さ（px）

function name(e: LayoutEl): string {
  return `${e.path}${e.text ? `「${e.text.slice(0, 16)}」` : ''}`;
}

function union(bs: Box[]): Box | null {
  if (!bs.length) return null;
  return bs.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) }));
}

function inter(a: Box, b: Box): Box {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
}

function outside(inner: Box, outer: Box): number {
  return Math.max(outer.x - inner.x, inner.r - outer.r, outer.y - inner.y, inner.b - outer.b, 0);
}

function overlapArea(a: Box, b: Box): { w: number; h: number } {
  return { w: Math.min(a.r, b.r) - Math.max(a.x, b.x), h: Math.min(a.b, b.b) - Math.max(a.y, b.y) };
}

const fx = (n: number): string => n.toFixed(0);

/** 集めた位置から くずれを 見つける */
export function judgeLayout(snap: LayoutSnapshot): LayoutIssue[] {
  const out: LayoutIssue[] = [];
  const { w: vw, h: vh } = snap.viewport;
  const screen: Box = { x: 0, y: 0, r: vw, b: vh };
  const byIndex = new Map(snap.els.map((e) => [e.i, e]));
  const reported = new Map<LayoutKind, Set<number>>();
  const add = (kind: LayoutKind, e: LayoutEl, detail: string): void => {
    const seen = reported.get(kind) ?? new Set<number>();
    reported.set(kind, seen);
    // 親で もう出していたら 子は 出さない（1 つの くずれを 何回も 数えない）
    if (e.ancestors.some((a) => seen.has(a))) {
      seen.add(e.i);
      return;
    }
    seen.add(e.i);
    out.push({ kind, target: name(e), detail });
  };
  const visibleBox = (e: LayoutEl): Box => inter(e.box, e.clip);

  for (const e of snap.els) {
    // 画面の外（親に 切りとられて 見えない分と、スクロールで 見られる分は のぞく）
    if (!e.inScroller) {
      const vis = visibleBox(e);
      if (vis.r - vis.x > 0 && vis.b - vis.y > 0) {
        const d = outside(vis, screen);
        if (d > TOL) add('offscreen', e, `画面 ${vw}×${vh} の外に ${fx(d)}px はみ出す`);
      }
    }
    const tb = union(e.lines);
    if (tb && !e.inline) {
      // 文字が 自分の わくから はみ出す（ボタン・マスなど わくを持つ物だけ）
      const d = outside(tb, e.box);
      if (d > TOL + 1) add('spill', e, `文字が わくから ${fx(d)}px はみ出す`);
    }
    // 親の overflow:hidden で 文字の 行が とちゅうで 切れる（ぜんぶ かくれている行は「たたんである」ので のぞく）
    for (const line of e.lines) {
      const v = inter(line, e.hardClip);
      const seen = v.r - v.x > 4 && v.b - v.y > 4;
      const c = outside(line, e.hardClip);
      if (seen && c > TOL) {
        add('clipped', e, `文字が ${fx(c)}px 切れている`);
        break;
      }
    }
    // ボタンの中の 文字・みじかい名前（8 文字まで）が 折り返す
    if (e.lines.length > 1) {
      const rows = new Set(e.lines.map((l) => Math.round(l.y))).size;
      const inButton = e.pressable || e.ancestors.some((a) => byIndex.get(a)?.pressable);
      const short = e.text.replace(/\s/g, '').length <= 8;
      if (rows > 1 && (inButton || short)) add('wrap', e, `${inButton ? 'ボタンの' : 'みじかい '}文字が ${rows} 行に 折り返す`);
    }
    if (e.ellipsis) add('clipped', e, '文字が「…」で 切れている');
    if (e.pressable) {
      const w = e.box.r - e.box.x;
      const h = e.box.b - e.box.y;
      if (w < MIN_TAP - 0.5 || h < MIN_TAP - 0.5) add('small', e, `押せる大きさが ${fx(w)}×${fx(h)}px（${MIN_TAP}px より小さい）`);
      if (e.centerOnTop === false) add('covered', e, `まん中が ${e.topPath} に かくれている`);
    }
  }

  // 重なり（文字どうし・押せる物どうし。親子は のぞく）
  const related = (a: LayoutEl, b: LayoutEl): boolean => a.ancestors.includes(b.i) || b.ancestors.includes(a.i);
  const seenLines = (e: LayoutEl): Box[] =>
    e.lines.map((l) => inter(inter(l, e.clip), screen)).filter((l) => l.r - l.x > 0 && l.b - l.y > 0);
  const texts = snap.els.map((e) => ({ ...e, lines: seenLines(e) })).filter((e) => e.lines.length);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (related(a, b)) continue;
      const hit = a.lines.some((la) => b.lines.some((lb) => {
        const o = overlapArea(la, lb);
        return o.w > 2 && o.h > 2;
      }));
      if (hit) out.push({ kind: 'overlap', target: `${name(a)} と ${name(b)}`, detail: '文字どうしが 重なる' });
    }
  }
  const pressables = snap.els.filter((e) => e.pressable);
  for (let i = 0; i < pressables.length; i++) {
    for (let j = i + 1; j < pressables.length; j++) {
      const a = pressables[i];
      const b = pressables[j];
      if (related(a, b)) continue;
      const o = overlapArea(visibleBox(a), visibleBox(b));
      if (o.w > 2 && o.h > 2) out.push({ kind: 'overlap', target: `${name(a)} と ${name(b)}`, detail: `押せる物どうしが ${fx(o.w)}×${fx(o.h)}px 重なる` });
    }
  }
  return out;
}

export async function checkLayout(page: Page, roots: string[]): Promise<LayoutIssue[]> {
  return judgeLayout(await collectLayout(page, roots));
}
