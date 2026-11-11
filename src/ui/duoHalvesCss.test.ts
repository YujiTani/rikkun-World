import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HALF_SLOT_RATIO } from './duoHalves';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g)・§9.13、AC146・AC177・AC178）: css の 見はり。実装の前に書いた。
 * (1) 1 人の ときの 位置・css は かえない（AC146）: 今の 規則を ここで 固定する（この 部分は 今も 緑。かえたら 落ちる）。
 * (2) HALF_SLOT_RATIO（ui/duoHalves.ts の 表）が 1 人の ときの css の top と 同じ 数。
 * (3) 1.17: 時計は 2 人の とき 1P = 左上・2P = 右上、横断幕は 1P の 半分（紙ふぶきは JS）、ふち・倒れた 画面・すみの 暗さは 1P の 半分（右 50%）。
 * (4) 2 人の ときの 規則は 新しい `src/ui/duoHalves.css` に 書き、すべて `html[data-duo]` か `.duo-` で はじまる（1 人の ときは 何も 効かない）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   新しい `src/ui/duoHalves.css`（`ui/duoHalves.ts` が import）。1 人の ときの css（titleAnnounce.css・homeNotice.css・damageEdge.css・deathScreen.css・clock.css・inkDim.css・notice.css・celebrate.css）は 今の まま。
 *   1.17: `html[data-duo] #clock` が `left: var(--rk-sp-5); right: auto`（1P の 時計を 左上へ）、`duo-clock-p2`（2P の 時計）の 規則が `right: var(--rk-sp-5)`・`top: var(--rk-sp-5)`。
 *   `html[data-duo] .cel-banner-wrap`: `left: 25%`・はば ≦ `--duo-band-w`（半分の 90%）。紙ふぶきの 区画は css では なく JS（confettiAt。confetti.test.ts）。`.cel-layer`・`.cel-layer--band` は css で 切らない。
 *   `html[data-duo] #damage-edge`・`#death-screen`・`#ink-dim`: 1P の 半分（`right: 50%`）。
 *   半分ごとの 要素は data-testid（DUO_HALF_ID。例 duo-clock-p1／-p2・duo-title-announce-p1／-p2・duo-damage-edge-p1／-p2・duo-death-p1・duo-home-notice-p1／-p2・
 *   duo-cel-band-p1／-p2・duo-cel-banner-p1・duo-hud-notice-p1／-p2・duo-yokai-plate-p1／-p2・duo-notice-name-p1／-p2・duo-buff-plate-p1／-p2・duo-ink-dim-p1／-p2）を 持つ。
 *   1P の 要素は 今の 要素（#clock・#title-announce など）に 2 人の あいだ だけ data-testid を 足して 使い回して よい（5f-1 の duo-hotbar-p1 と 同じ）。
 */
const css = (p: string): string => readFileSync(p, 'utf8');
const squash = (s: string): string => s.replace(/\s+/g, ' ');

describe('AC146: 1 人の ときの 規則は 今の まま', () => {
  it('#title-announce: 上から 14%・まん中（left 50%）', () => {
    expect(squash(css('src/ui/titleAnnounce.css'))).toMatch(/#title-announce \{ position: fixed; left: 50%; top: 14%; transform: translateX\(-50%\);/);
  });
  it('#home-notice: 上から 30%・まん中', () => {
    expect(squash(css('src/ui/homeNotice.css'))).toMatch(/#home-notice \{ position: fixed; left: 50%; top: 30%; transform: translateX\(-50%\);/);
  });
  it('#damage-edge・#death-screen・#ink-dim: 全面（inset: 0）', () => {
    expect(squash(css('src/ui/damageEdge.css'))).toMatch(/#damage-edge \{ position: fixed; inset: 0;/);
    expect(squash(css('src/ui/deathScreen.css'))).toMatch(/#death-screen \{ position: fixed; inset: 0;/);
    expect(squash(css('src/ui/inkDim.css'))).toMatch(/#ink-dim \{ position: fixed; inset: 0;/);
  });
  it('#clock: 右上（top・right とも sp-5）', () => {
    expect(squash(css('src/ui/clock.css'))).toMatch(/#clock \{ position: fixed; top: var\(--rk-sp-5\); right: var\(--rk-sp-5\);/);
  });
  it('#notice-name: まん中（left 50%）。#hud-notice: ホットバーの 右はしに そろえる', () => {
    expect(squash(css('src/ui/notice.css'))).toMatch(/#notice-name \{ position: fixed; left: 50%;/);
    expect(squash(css('src/ui/craftHint.css'))).toMatch(/#hud-notice \{ position: fixed; left: auto; right: calc\(50% - var\(--hb-w\) \/ 2\);/);
  });
  it('横断幕: 上から 22%・まん中・はば 720/12.8 vw', () => {
    expect(squash(css('src/ui/celebrate/celebrate.css'))).toMatch(/\.cel-banner-wrap \{ position: fixed; left: 50%; top: 22%; width: calc\(720 \/ 12\.8 \* 1vw\);/);
  });
  it('実績の 帯・つくれる マーク・ハートの 2 人の ときの 位置は 今の まま（1P は 25%・右はしの 計算）', () => {
    const d = squash(css('src/ui/duoHud.css'));
    expect(d).toMatch(/html\[data-duo\] \.cel-band \{ left: 25%; top: var\(--duo-band-top\);/);
    expect(d).toMatch(/html\[data-duo\] #hud-notice \{ right: calc\(75% - var\(--hb-w\) \* var\(--duo-scale\) \/ 2\);/);
  });
});

describe('HALF_SLOT_RATIO は 1 人の ときの css の top と 同じ 数', () => {
  const pct = (r: number): string => `top: ${Math.round(r * 100)}%`;
  it('titleAnnounce = 14%・homeNotice = 30%・banner = 22%', () => {
    expect(css('src/ui/titleAnnounce.css')).toContain(pct(HALF_SLOT_RATIO.titleAnnounce));
    expect(css('src/ui/homeNotice.css')).toContain(pct(HALF_SLOT_RATIO.homeNotice));
    expect(css('src/ui/celebrate/celebrate.css')).toContain(pct(HALF_SLOT_RATIO.banner));
  });
});

describe('2 人の ときの 規則は duoHalves.css に まとめ、1 人の ときは 何も 効かない', () => {
  const FILE = 'src/ui/duoHalves.css';
  it('src/ui/duoHalves.css が ある', () => {
    expect(existsSync(FILE)).toBe(true);
  });
  it('どの 規則の 選び手も `html[data-duo]` か `.duo-` か `[data-testid^="duo-"]` で はじまる（@media・@keyframes の 中は 見ない）', () => {
    const body = css(FILE).replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [...body.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].map((m) => m[2]!.trim());
    expect(sels.length).toBeGreaterThan(0);
    const bad = sels.flatMap((s) => s.split(',').map((x) => x.trim())).filter((x) => !/^(html\[data-duo\]|\.duo-|\[data-testid\^?="duo-)/.test(x) && !/^(from|to|\d+%)$/.test(x));
    expect(bad).toEqual([]);
  });
  it('1 人の ときの css の ファイルは 2 人の とき 用の 規則（data-duo・duo-）を 足さない', () => {
    for (const f of ['titleAnnounce', 'homeNotice', 'damageEdge', 'deathScreen', 'clock', 'inkDim']) {
      expect(css(`src/ui/${f}.css`), f).not.toMatch(/data-duo|\.duo-/);
    }
  });
  it('分割の 線の 上に のる まん中 `left: 50%` の 古い 規則を 2 人の ときに 打ち消している（title-announce・home-notice・notice-name）', () => {
    const d = css(FILE);
    for (const id of ['#title-announce', '#home-notice', '#notice-name']) expect(d, id).toContain(id);
  });
  const rule = (selRe: RegExp): string => {
    const body = css(FILE).replace(/\/\*[\s\S]*?\*\//g, '');
    let out = '';
    for (const m of body.matchAll(/(^|\})\s*([^{}@][^{}]*)\{([^}]*)\}/g)) if (selRe.test(m[2]!)) out += ` ${squash(m[3]!)}`; // 同じ 選び手の 規則は ぜんぶ つなぐ
    return out;
  };
  it('1.17: 2 人の とき 1P の 時計（#clock）は 左上（left: sp-5・right: auto）', () => {
    const r = rule(/html\[data-duo\]\s+#clock\b/);
    expect(r).toMatch(/left: var\(--rk-sp-5\)/);
    expect(r).toMatch(/right: auto/);
  });
  it('1.17: 2P の 時計（duo-clock-p2）は 右上（top・right とも sp-5）', () => {
    const r = rule(/duo-clock-p2/);
    expect(r).toMatch(/top: var\(--rk-sp-5\)/);
    expect(r).toMatch(/right: var\(--rk-sp-5\)/);
  });
  it('1.17: 横断幕は 1P の 半分の まん中（left 25%）で、はばは --duo-band-w（半分の 90%）まで', () => {
    const r = rule(/html\[data-duo\]\s+\.cel-banner-wrap\b/);
    expect(r).toMatch(/left: 25%/);
    expect(r).toMatch(/--duo-band-w/);
  });
  it('1.17: 紙ふぶきは css の 層で 切らない（紙は fixed で 親で 切れない。区画は confettiAt〔confetti.test.ts〕）。上の 帯の 層（.cel-layer--band）も 切らない', () => {
    const body = css(FILE).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of body.matchAll(/(^|\})\s*([^{}@][^{}]*)\{([^}]*)\}/g)) {
      if (!/\.cel-layer\b/.test(m[2]!)) continue;
      expect(m[3]!, m[2]!.trim()).not.toMatch(/right:\s*50%|overflow:|contain:|clip-path:|width:\s*50%/);
    }
  });
  it('1.17: 1P の ふち・倒れた 画面・すみの 暗さは 2 人の とき 1P の 半分（right: 50%）', () => {
    for (const id of ['#damage-edge', '#death-screen', '#ink-dim']) {
      const r = rule(new RegExp(`html\\[data-duo\\]\\s+${id}\\b`));
      expect(r, id).toMatch(/right: 50%/);
    }
  });
  it('1.17: 開いた 人の 半分の 分だけ 消す: 2P の 時計（duo-clock-p2）を 消す 規則が ある（1P の もちもの画面の 規則〔#clock〕とは 別。もう 1 人の 時計は のこる）', () => {
    const body = css(FILE).replace(/\/\*[\s\S]*?\*\//g, '');
    const hit = [...body.matchAll(/(^|\})\s*([^{}@][^{}]*)\{([^}]*)\}/g)].some((m) => /duo-clock-p2/.test(m[2]!) && /:has\(|\[data-/.test(m[2]!) && /opacity:\s*0|visibility:\s*hidden|display:\s*none/.test(m[3]!));
    expect(hit).toBe(true);
  });
});
