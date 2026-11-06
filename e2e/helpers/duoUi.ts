import type { Page } from '@playwright/test';
import { standOnGround } from './aim';

/**
 * COOP-1 作業 1（#395。docs/design/COOP-1.md §3.1・§9.4・AC12・AC13）の UI 検査の 部品。UI 検査ゲート（e2e/ui-gate.spec.ts の 'duo-hud'）が 使う。
 * 作業 2（#399）で ルーペ・分割・「つないでね」の 画面 `openDuoLoupe`・`openDuoSplit`・`openDuoPadLost` と 検査 `duoViewIssues`・`duoPadLostIssues` を 足した（AC24・AC33・AC33b・色の 案 B）。
 *
 * ---- 開発への つなぎ目の 約束（DOM の data-testid。仕様に 名前が ないので ここで 決めた）----
 *   duo-hotbar-p1 / duo-hotbar-p2   1P・2P の ホットバーの 外わく（2 人のとき だけ ある。1 人のときは 出さない）
 *   duo-hearts-p1 / duo-hearts-p2   1P・2P の ハート
 *   duo-meter                       距離メーターの 外わく。属性 data-tier="0|1|2"（色の 段。`duo.state().tier` と 同じ）
 *   duo-meter-bar                   メーターの 棒。見える 長さ（getBoundingClientRect().width）が `duo.state().meter` に 比例する。色は 段で かわる
 *   duo-meter-mark                  真ん中の 印「｜」（24 マス = 棒の 真ん中）
 * 2 人のときの ホットバーは 半分の はばの 90% 以下に 縮める（§3.1）。
 *
 * ---- 作業 2 で 足す data-testid（仕様に 名前が ないので ここで 決めた）----
 *   duo-loupe                   ルーペの 丸わく(1 画面+ルーペの ときだけ ある)。属性 data-tier="0|1|2"。CSS の border-width が 段で 4/6/8px、border-color が 段の 色
 *   duo-loupe-arrow             ルーペの 外の 2P を 指す 小さな 三角。属性 data-angle = 指す 向き(度。画面で 右 = 0・下 = 90。atan2(y, x))。ルーペの 外がわ(まん中から 遠い 方)に ある
 *   duo-split-line              分割の まん中の 線(分割の ときだけ ある。高さは 画面いっぱい・左右の まん中)
 *   duo-meter-badge-p1/-p2      メーターの「P1」「P2」の 丸いバッジ。背景色が 1P・2P の 色
 *   duo-hotbar-p1 / -p2         ふち(border-color)が 1P・2P の 色
 *   duo-pad-lost                (作業 1 で 決めた)パッドが ぬけた 表示。文字「コントローラーを つないでね」を ふくむ。子に duo-pad-lost-icon(パッドの 絵)
 *   duo-p2-question             2P の 頭の 上の「？」(HTML の 重ね。2P の 頭の 位置に 合わせて 動く)。padLost の あいだだけ 見える
 * 色は 案 B（§11.1。--rk-xp / --rk-rarity-3 / 段 --rk-text → --rk-accent → --rk-accent-2。CSS の 変数を 読んで 確かめる）。
 */

export interface DuoUiIssue {
  kind: string;
  /** 数字を ふくまない 目印（known.json と くらべる） */
  target: string;
  detail: string;
}

/** 2 人で 遊んでいる HUD を 出す（?duo=dev で 参加させる）。ロックして ポーズ */
export async function openDuoHud(page: Page): Promise<void> {
  await page.goto('/?nosave=1&duo=dev');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.duo.join();
    h.step(30);
  });
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

const boxOf = (page: Page, tid: string): Promise<Box | null> =>
  page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  }, tid);

const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** 2P を 1P の 真上 d マスの 空中に 置いて 1 コマ 進め、メーターを 読む（真上 = 地面の 読みこみに 関係なく 距離だけ 決まる） */
async function readMeterAt(page: Page, d: number) {
  return page.evaluate(async (d) => {
    const h = (window as any).__rikkun;
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y + d, z: p1.z });
    h.step(1);
    const s = h.duo.state();
    const bar = document.querySelector('[data-testid="duo-meter-bar"]') as HTMLElement | null;
    const meter = document.querySelector('[data-testid="duo-meter"]') as HTMLElement | null;
    return {
      distance: s.distance as number,
      meter: s.meter as number,
      tier: s.tier as number,
      domTier: meter?.getAttribute('data-tier') ?? null,
      width: bar ? bar.getBoundingClientRect().width : -1,
      color: bar ? getComputedStyle(bar).backgroundColor : '',
    };
  }, d);
}

/**
 * AC12・AC13 の 検査（3 つの 大きさごとに 呼ぶ）。見つけた くずれを 返す（空 = 合格）。
 * 終わったら 2P を 1P の 右 2 マスに 戻す（スクショと 次の 大きさの ため。作業 2 では 分割から 戻るのに 80 ステップ 進める）。
 */
export async function duoHudIssues(page: Page): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const half = vw / 2;

  // ---- AC12: ホットバー・ハート ----
  const hb1 = await boxOf(page, 'duo-hotbar-p1');
  const hb2 = await boxOf(page, 'duo-hotbar-p2');
  const ht1 = await boxOf(page, 'duo-hearts-p1');
  const ht2 = await boxOf(page, 'duo-hearts-p2');
  const mt = await boxOf(page, 'duo-meter');
  for (const [name, b] of [['duo-hotbar-p1', hb1], ['duo-hotbar-p2', hb2], ['duo-hearts-p1', ht1], ['duo-hearts-p2', ht2], ['duo-meter', mt]] as const) {
    if (!b) add('missing', name, `${name} が 見えない`);
  }
  if (hb1 && hb2) {
    const lineGap = half * 0.05; // まん中の 線から 半分の 幅の 5% 以上
    if (hb1.w > half * 0.9 + 0.5) add('too-wide', 'duo-hotbar-p1', `1P ホットバー ${hb1.w.toFixed(1)}px が 半分 ${half}px の 90% を こえる`);
    if (hb2.w > half * 0.9 + 0.5) add('too-wide', 'duo-hotbar-p2', `2P ホットバー ${hb2.w.toFixed(1)}px が 半分 ${half}px の 90% を こえる`);
    if (hb1.l < -0.5 || hb1.r > half - lineGap + 0.5) add('half', 'duo-hotbar-p1', `1P ホットバー ${hb1.l.toFixed(0)}〜${hb1.r.toFixed(0)} が 左半分（〜${(half - lineGap).toFixed(0)}）に おさまらない`);
    if (hb2.r > vw + 0.5 || hb2.l < half + lineGap - 0.5) add('half', 'duo-hotbar-p2', `2P ホットバー ${hb2.l.toFixed(0)}〜${hb2.r.toFixed(0)} が 右半分（${(half + lineGap).toFixed(0)}〜）に おさまらない`);
    if (overlap(hb1, hb2)) add('overlap', 'duo-hotbar-p1/p2', '左右の ホットバーが 重なる');
    if (hb1.b > vh + 0.5 || hb2.b > vh + 0.5) add('offscreen', 'duo-hotbar', 'ホットバーが 画面の 下に はみ出す');
  }
  if (hb1 && ht1 && overlap(hb1, ht1)) add('overlap', 'duo-hotbar-p1/duo-hearts-p1', '1P の ホットバーと ハートが 重なる');
  if (hb2 && ht2 && overlap(hb2, ht2)) add('overlap', 'duo-hotbar-p2/duo-hearts-p2', '2P の ホットバーと ハートが 重なる');
  if (ht1 && ht2 && overlap(ht1, ht2)) add('overlap', 'duo-hearts-p1/p2', '左右の ハートが 重なる');
  if (ht1 && (ht1.l < -0.5 || ht1.r > half + 0.5)) add('half', 'duo-hearts-p1', '1P の ハートが 左半分から はみ出す');
  if (ht2 && (ht2.r > vw + 0.5 || ht2.l < half - 0.5)) add('half', 'duo-hearts-p2', '2P の ハートが 右半分から はみ出す');
  if (mt) {
    for (const [name, b] of [['duo-hotbar-p1', hb1], ['duo-hotbar-p2', hb2], ['duo-hearts-p1', ht1], ['duo-hearts-p2', ht2]] as const) {
      if (b && overlap(mt, b)) add('overlap', `duo-meter/${name}`, `距離メーターと ${name} が 重なる`);
    }
    if (mt.t > vh * 0.2) add('place', 'duo-meter', '距離メーターが 上の 中央に ない');
    if (Math.abs((mt.l + mt.r) / 2 - half) > vw * 0.02) add('place', 'duo-meter', '距離メーターが 左右の まん中に ない');
  }

  // ---- AC13: 色の 段（近い方から 遠い方へ。作業 2 では 24 以上で 分割に なり 段は 2 の まま なので、遠い方へ だけ 順に 見る）----
  const lo = await readMeterAt(page, 8);
  const mid = await readMeterAt(page, 18);
  const hi = await readMeterAt(page, 30);
  for (const [want, r] of [[0, lo], [1, mid], [2, hi]] as const) {
    if (r.tier !== want) add('tier', 'duo-state', `距離 ${r.distance} の 色の 段は ${want} のはず（state().tier = ${r.tier}）`);
    if (r.domTier !== String(r.tier)) add('tier', 'duo-meter', `data-tier ${r.domTier} が state().tier ${r.tier} と ちがう`);
  }
  if (new Set([lo.color, mid.color, hi.color]).size !== 3) add('tier', 'duo-meter-bar', `棒の 色が 3 つの 段で 別々に ならない（${lo.color} / ${mid.color} / ${hi.color}）`);


  // ---- AC13: メーターの 長さ・色の 段 ----
  const at48 = await readMeterAt(page, 48);
  const at24 = await readMeterAt(page, 24);
  const at12 = await readMeterAt(page, 12);
  const at80 = await readMeterAt(page, 80);
  if (at48.width > vw * 0.3 + 1) add('meter', 'duo-meter-bar', `いちばん 長い とき ${at48.width.toFixed(0)}px が 画面の 幅の 30% を こえる`);
  for (const r of [at12, at24, at48, at80]) {
    if (Math.abs(r.meter - Math.min(1, r.distance / 48)) > 0.02) add('meter', 'duo-meter-state', `meter ${r.meter} が 距離 ${r.distance} に 比例しない`);
    if (at48.width > 0 && Math.abs(r.width / at48.width - r.meter) > 0.04) add('meter', 'duo-meter-bar', `棒の 長さの 比 ${(r.width / at48.width).toFixed(2)} が meter ${r.meter.toFixed(2)} と 合わない`);
  }
  if (Math.abs(at80.width - at48.width) > 1) add('meter', 'duo-meter-bar', '48 マスより 遠くても 長さは 止まる');
  const mark = await boxOf(page, 'duo-meter-mark');
  if (!mark) add('missing', 'duo-meter-mark', '真ん中の 印が 見えない');

  // 戻す
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x + 2, y: p1.y, z: p1.z });
    h.step(80); // 作業 2: 分割から 1 画面に 戻るのは 17 以下が 60 ステップ つづいたとき
  });
  return out;
}

// ===================================================================== 作業 2（#399）

/** CSS の 変数(例 --rk-xp)を、画面で 実際に 使われる rgb(...) の 形に する */
async function tokenRgb(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const el = document.createElement('div');
    el.style.color = `var(${name})`;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, name);
}

const TIER_TOKENS = ['--rk-text', '--rk-accent', '--rk-accent-2'] as const;
const LOUPE_BORDER_PX = [4, 6, 8] as const;

async function openDuoBase(page: Page): Promise<void> {
  await openDuoHud(page);
}

/** 2P を 1P の 向きを もとに (前, 右) マスに 置く(yaw 90 = 前が +x・右が +z)。足もとは 平らに ならす */
async function placeP2(page: Page, fwd: number, right: number): Promise<void> {
  await page.evaluate(
    ({ fwd, right }) => {
      const h = (window as any).__rikkun;
      const p1 = h.duo.pos(1);
      const x = p1.x + fwd;
      const z = p1.z + right;
      const fy: number = h.world.groundHeight(Math.floor(x), Math.floor(z));
      h.world.fill(Math.floor(x) - 4, fy, Math.floor(z) - 4, Math.floor(x) + 4, fy, Math.floor(z) + 4, 'stone');
      h.world.fill(Math.floor(x) - 4, fy + 1, Math.floor(z) - 4, Math.floor(x) + 4, fy + 12, Math.floor(z) + 4, 'air');
      h.duo.place(2, { x, y: fy + 1, z });
    },
    { fwd, right },
  );
}

/** 1 画面 + ルーペ(2P は 1P の うしろ 21 マス = 2 段目・画面の 外)を 出す。わくは いちばん 太い 8px */
export async function openDuoLoupe(page: Page): Promise<void> {
  await openDuoBase(page);
  await placeP2(page, -21, 0);
  await page.evaluate(() => (window as any).__rikkun.step(80));
}

/** 左右に 分割(2P は 1P の 左 40 マス。画面の 左右の 割り当ては 入れかわらない)を 出す */
export async function openDuoSplit(page: Page): Promise<void> {
  await openDuoBase(page);
  await placeP2(page, 0, -40);
  await page.evaluate(() => (window as any).__rikkun.step(100));
}

/** 2P の パッドが ぬけた 画面。view = 'one'(2P は 1P の 右 2 マス) か 'split' */
export async function openDuoPadLost(page: Page, view: 'one' | 'split'): Promise<void> {
  await openDuoBase(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__pads = [0, 1].map((index) => ({
      id: 'Xbox Wireless Controller',
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 0,
    }));
    w.__rikkun.gamepad.injectPads(w.__pads);
    w.__rikkun.step(3);
  });
  if (view === 'split') {
    await placeP2(page, 0, -40);
    await page.evaluate(() => (window as any).__rikkun.step(100));
  }
  await page.evaluate(() => {
    const w = window as any;
    w.__rikkun.gamepad.injectPads([w.__pads[0], null]);
    w.__rikkun.step(3);
  });
}

/**
 * AC24・AC33・色（案 B）の 検査: いまの ようす expect('one' | 'loupe' | 'split')で、メーター・ホットバー・ハート・ルーペ・線が 重ならず、
 * ルーペは 下 22%・上 12% に かからず、わくの 太さと 色が 段と 合い、棒・バッジ・ホットバーの 色が 案 B。空 = 合格。
 */
export async function duoViewIssues(page: Page, expect: 'one' | 'loupe' | 'split'): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const st = await page.evaluate(() => (window as any).__rikkun.duo.state());
  if (st.view !== expect) add('view', 'duo-state', `ようすは ${expect} のはず（state().view = ${st.view}）`);

  const ids = ['duo-hotbar-p1', 'duo-hotbar-p2', 'duo-hearts-p1', 'duo-hearts-p2', 'duo-meter', 'duo-loupe', 'duo-split-line'] as const;
  const b: Record<string, Box | null> = {};
  for (const id of ids) b[id] = await boxOf(page, id);
  for (const id of ['duo-hotbar-p1', 'duo-hotbar-p2', 'duo-hearts-p1', 'duo-hearts-p2', 'duo-meter']) if (!b[id]) add('missing', id, `${id} が 見えない`);

  // ---- 重なり(AC33): ルーペ・メーター・ホットバー・ハート ----
  const names = ['duo-hotbar-p1', 'duo-hotbar-p2', 'duo-hearts-p1', 'duo-hearts-p2', 'duo-meter', 'duo-loupe'] as const;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = b[names[i]!];
      const c = b[names[j]!];
      if (a && c && overlap(a, c)) add('overlap', `${names[i]}/${names[j]}`, `${names[i]} と ${names[j]} が 重なる`);
    }
  }

  // ---- ようすごとの 部品 ----
  if (expect === 'loupe') {
    const lp = b['duo-loupe'];
    if (!lp) add('missing', 'duo-loupe', 'ルーペが 見えない');
    else {
      if (lp.l < 16 - 0.5 || lp.r > vw - 16 + 0.5) add('loupe', 'duo-loupe', `ルーペが 左右の ふちから 16px 内側に おさまらない（${lp.l.toFixed(0)}〜${lp.r.toFixed(0)}）`);
      if (lp.t < vh * 0.12 - 0.5) add('loupe', 'duo-loupe', 'ルーペが 上の 12% に かかる');
      if (lp.b > vh * 0.78 + 0.5) add('loupe', 'duo-loupe', 'ルーペが 下の 22% に かかる');
      if (Math.abs(lp.w - vh * 0.2) > 2) add('loupe', 'duo-loupe', `直径 ${lp.w.toFixed(0)}px が 画面の 高さの 20% ${(vh * 0.2).toFixed(0)}px と ちがう`);
      const s = st.loupe as { x: number; y: number; d: number } | null;
      if (!s) add('loupe', 'duo-state', 'state().loupe が null');
      else if (Math.abs(s.x - (lp.l + lp.r) / 2) > 2 || Math.abs(s.y - (lp.t + lp.b) / 2) > 2 || Math.abs(s.d - lp.w) > 2) add('loupe', 'duo-state', 'state().loupe が 画面の ルーペと 合わない');
      const info = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="duo-loupe"]') as HTMLElement;
        const cs = getComputedStyle(el);
        return { bw: parseFloat(cs.borderTopWidth), bc: cs.borderTopColor, tier: el.getAttribute('data-tier'), radius: cs.borderTopLeftRadius };
      });
      if (info.bw !== LOUPE_BORDER_PX[st.tier as 0 | 1 | 2]) add('loupe', 'duo-loupe', `わくの 太さ ${info.bw}px が 段 ${st.tier} の ${LOUPE_BORDER_PX[st.tier as 0 | 1 | 2]}px と ちがう`);
      const want = await tokenRgb(page, TIER_TOKENS[st.tier as 0 | 1 | 2]);
      if (info.bc !== want) add('color', 'duo-loupe', `わくの 色 ${info.bc} が 段 ${st.tier} の ${TIER_TOKENS[st.tier as 0 | 1 | 2]}（${want}）と ちがう`);
      if (info.tier !== String(st.tier)) add('tier', 'duo-loupe', `data-tier ${info.tier} が state().tier ${st.tier} と ちがう`);
      if (!/50%|9999|\d{2,}px/.test(info.radius)) add('loupe', 'duo-loupe', `丸く ない（border-radius ${info.radius}）`);
      const ar = await boxOf(page, 'duo-loupe-arrow');
      if (!ar) add('missing', 'duo-loupe-arrow', 'ルーペの 外の 三角が 見えない');
      else {
        const lc = { x: (lp.l + lp.r) / 2, y: (lp.t + lp.b) / 2 };
        const ac = { x: (ar.l + ar.r) / 2, y: (ar.t + ar.b) / 2 };
        const angle = await page.evaluate(() => Number((document.querySelector('[data-testid="duo-loupe-arrow"]') as HTMLElement).getAttribute('data-angle')));
        // 2P の 方向: 画面の まん中から ルーペへ(ルーペは 2P の 方向の はしに 置く)。三角は そちらを 指す(45° 以内)
        const toward = (Math.atan2(lc.y - vh / 2, lc.x - vw / 2) * 180) / Math.PI;
        const dd = Math.abs((((angle - toward) % 360) + 540) % 360 - 180);
        if (!Number.isFinite(angle)) add('loupe', 'duo-loupe-arrow', 'data-angle が ない');
        else if (dd > 45) add('loupe', 'duo-loupe-arrow', `三角の 向き ${angle.toFixed(0)}° が 2P の 方向 ${toward.toFixed(0)}° と 45° 以上 ちがう`);
        if (Math.hypot(ac.x - lc.x, ac.y - lc.y) < lp.w / 2) add('loupe', 'duo-loupe-arrow', '三角が ルーペの 外に ない');
      }
    }
    if (b['duo-split-line']) add('place', 'duo-split-line', 'ルーペのときに 分割の 線が 出ている');
  } else {
    if (b['duo-loupe']) add('place', 'duo-loupe', `${expect} のときに ルーペが 出ている`);
  }
  if (expect === 'split') {
    const ln = b['duo-split-line'];
    if (!ln) add('missing', 'duo-split-line', '分割の 線が 見えない');
    else {
      if (Math.abs((ln.l + ln.r) / 2 - vw / 2) > 1.5) add('place', 'duo-split-line', '線が 左右の まん中に ない');
      if (ln.h < vh - 2) add('place', 'duo-split-line', '線が 画面の 高さいっぱいに ない');
    }
  } else if (b['duo-split-line']) add('place', 'duo-split-line', `${expect} のときに 分割の 線が 出ている`);

  // ---- 色(案 B): 棒は 段の 色・バッジは 1P/2P の 色・ホットバーの ふちは 1P/2P の 色 ----
  const colors = await page.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const bg = (id: string) => (q(id) ? getComputedStyle(q(id)!).backgroundColor : '');
    const bd = (id: string) => (q(id) ? getComputedStyle(q(id)!).borderTopColor : '');
    return { bar: bg('duo-meter-bar'), b1: bg('duo-meter-badge-p1'), b2: bg('duo-meter-badge-p2'), h1: bd('duo-hotbar-p1'), h2: bd('duo-hotbar-p2') };
  });
  const [t, xp, r3] = [await tokenRgb(page, TIER_TOKENS[st.tier as 0 | 1 | 2]), await tokenRgb(page, '--rk-xp'), await tokenRgb(page, '--rk-rarity-3')];
  if (colors.bar !== t) add('color', 'duo-meter-bar', `棒の 色 ${colors.bar} が 段 ${st.tier} の 色 ${t} と ちがう`);
  if (colors.b1 !== xp) add('color', 'duo-meter-badge-p1', `P1 バッジの 色 ${colors.b1} が --rk-xp ${xp} と ちがう`);
  if (colors.b2 !== r3) add('color', 'duo-meter-badge-p2', `P2 バッジの 色 ${colors.b2} が --rk-rarity-3 ${r3} と ちがう`);
  if (colors.h1 !== xp) add('color', 'duo-hotbar-p1', `1P ホットバーの ふち ${colors.h1} が --rk-xp ${xp} と ちがう`);
  if (colors.h2 !== r3) add('color', 'duo-hotbar-p2', `2P ホットバーの ふち ${colors.h2} が --rk-rarity-3 ${r3} と ちがう`);
  return out;
}

/** AC33b の 検査: 「コントローラーを つないでね」・パッドの 絵・2P の 頭の 上の「？」が 見えて、ホットバー・ハート・メーターと 重ならない。空 = 合格 */
export async function duoPadLostIssues(page: Page, expect: 'one' | 'split'): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const st = await page.evaluate(() => (window as any).__rikkun.duo.state());
  if (st.view !== expect) add('view', 'duo-state', `ようすは ${expect} のはず（state().view = ${st.view}）`);
  if (!st.padLost) add('state', 'duo-state', 'padLost が true のはず');
  const box = await boxOf(page, 'duo-pad-lost');
  const icon = await boxOf(page, 'duo-pad-lost-icon');
  const q = await boxOf(page, 'duo-p2-question');
  if (!box) add('missing', 'duo-pad-lost', '「コントローラーを つないでね」が 見えない');
  if (!icon) add('missing', 'duo-pad-lost-icon', 'パッドの 絵が 見えない');
  if (!q) add('missing', 'duo-p2-question', '2P の 頭の 上の「？」が 見えない');
  const text: string = await page.evaluate(() => (document.querySelector('[data-testid="duo-pad-lost"]') as HTMLElement | null)?.textContent ?? '');
  if (box && !text.replace(/\s/g, '').includes('コントローラーをつないでね')) add('text', 'duo-pad-lost', `文字が「コントローラーを つないでね」でない（${text}）`);
  const qText: string = await page.evaluate(() => (document.querySelector('[data-testid="duo-p2-question"]') as HTMLElement | null)?.textContent ?? '');
  if (q && !/[？?]/.test(qText)) add('text', 'duo-p2-question', `「？」の 文字が ない（${qText}）`);
  const hud: Array<[string, Box | null]> = [];
  for (const id of ['duo-hotbar-p1', 'duo-hotbar-p2', 'duo-hearts-p1', 'duo-hearts-p2', 'duo-meter']) hud.push([id, await boxOf(page, id)]);
  for (const [name, mine] of [['duo-pad-lost', box], ['duo-pad-lost-icon', icon], ['duo-p2-question', q]] as const) {
    if (!mine) continue;
    for (const [id, other] of hud) if (other && overlap(mine, other)) add('overlap', `${name}/${id}`, `${name} が ${id} と 重なる`);
    if (mine.l < -0.5 || mine.r > vw + 0.5) add('offscreen', name, `${name} が 画面の よこに はみ出す`);
  }
  if (box) {
    const cx = (box.l + box.r) / 2;
    if (cx < vw / 2) add('place', 'duo-pad-lost', '2P の 側(右半分)に ない');
    if (expect === 'split' && Math.abs(cx - vw * 0.75) > vw * 0.1) add('place', 'duo-pad-lost', '分割では 右半分の 中央に あるはず');
    const hb2 = hud.find(([id]) => id === 'duo-hotbar-p2')?.[1];
    if (expect === 'one' && hb2 && box.b > hb2.t + 0.5) add('place', 'duo-pad-lost', '1 画面では 2P の ホットバーの 上に あるはず');
  }
  return out;
}

/**
 * ---- COOP-1 作業 2.5（#401。docs/design/COOP-1.md §3.2・§12.0・AC59・AC60・AC62）: せっていの「つかう コントローラー」タブ ----
 * 目印（data-testid。仕様 §12.0）: ctrl-tab-use / ctrl-panel-use / use-p1-c1・use-p1-c2…・use-p2-c1… / use-note / use-none。
 *   決まっている 物は aria-pressed="true"、待ちの 物は data-pending="true"、待ちの 行は data-waiting="true"、光る 物は data-lit="true"、ボタンに data-pad-index。
 *   ヘルプ帯は settings-help。
 * 偽パッドは index と 並びの 場所を そろえる(`injectPads([a, b])` なら a.index = 0・b.index = 1)。
 */

/** 偽パッドを n 本 入れる(window.__pads)。押していない 状態を 覚えさせるため 3 ステップ 進める */
export async function installFakePads(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    const w = window as any;
    w.__pads = Array.from({ length: n }, (_, index) => ({
      id: 'Xbox Wireless Controller',
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 0,
    }));
    w.__rikkun.gamepad.injectPads(w.__pads);
    w.__rikkun.step(3);
  }, n);
}

/** 偽パッドの ボタン・スティックを 書きかえる(押す・倒す)。ステップは 進めない */
export async function setFakePad(page: Page, index: number, o: { buttons?: number[]; axes?: number[] }): Promise<void> {
  await page.evaluate(
    ({ index, o }) => {
      const pad = (window as any).__pads[index];
      pad.buttons.forEach((b: any, i: number) => {
        const on = (o.buttons ?? []).includes(i);
        b.pressed = on;
        b.touched = on;
        b.value = on ? 1 : 0;
      });
      pad.axes = o.axes ?? [0, 0, 0, 0];
    },
    { index, o },
  );
}

/** ゲームを 開いて、せってい →「コントローラー」→「つかう コントローラー」タブまで 出す(`?duo=dev`。ふつうの URL は query を わたす) */
export async function openUsePadTab(page: Page, query = '?nosave=1&duo=dev'): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
  });
  await page.getByTestId('settings-open').click();
  await page.getByTestId('tab-controls').click();
  const tab = page.getByTestId('ctrl-tab-use');
  if (await tab.count()) await tab.click();
}

/**
 * UI 検査の 画面: つかう コントローラー タブに 偽パッドを n 本 入れる。pending なら 2P の 行の コントローラー 1 を おして 待ちにする。
 */
export async function openDuoUsePad(page: Page, opts: { pads: number; pending?: boolean }): Promise<void> {
  await openUsePadTab(page);
  if (opts.pads > 0) {
    await installFakePads(page, opts.pads);
    await page.evaluate(() => (window as any).__rikkun.step(2));
  }
  if (opts.pending && opts.pads > 0) {
    await page.getByTestId('use-p2-c1').click();
    await page.evaluate(() => (window as any).__rikkun.step(2));
  }
}

/**
 * AC62 の 検査(空 = 合格): パネルが 見える・スクロールなしで 入る・えらぶ ボタンは 高さ 56 以上・字 20px・角 14px・すきま 12px(段の すきま 8px)・
 * 3 本から あとは 2 段に おりかえす(1 段に 3 つまで)・「コントローラーなし」の 札は 1 行・待ちに なっても 下(use-note)が ずれない・
 * 0 本の ときは えらぶ ボタンが なく use-none が ある。
 */
export async function duoUsePadIssues(page: Page, opts: { pads: number; pending?: boolean }): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const measure = () =>
    page.evaluate(() => {
      const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      const note = r('use-note');
      const panel = r('ctrl-panel-use');
      return { noteTop: note?.top ?? null, noteH: note?.height ?? null, panelH: panel?.height ?? null };
    });
  // 待ちの 前(ほかの タブを おして 待ちを やめる)と 待ちの あいだを くらべる。大きさは 今の まま
  let before: Awaited<ReturnType<typeof measure>> | null = null;
  if (opts.pending && opts.pads > 0) {
    await page.getByTestId('ctrl-tab-use').click();
    await page.evaluate(() => (window as any).__rikkun.step(2));
    before = await measure();
    await page.getByTestId('use-p2-c1').click();
    await page.evaluate(() => (window as any).__rikkun.step(2));
  }
  const info = await page.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const panel = q('ctrl-panel-use');
    const vis = (el: HTMLElement | null) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const buttons = [...document.querySelectorAll<HTMLElement>('[data-testid^="use-p"]')].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { id: el.dataset.testid!, l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height, font: parseFloat(cs.fontSize), radius: parseFloat(cs.borderTopLeftRadius) };
    });
    let scrolls = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="settings-panel"], [data-testid="settings-panel"] *')) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) scrolls++;
    }
    const tags = [...document.querySelectorAll<HTMLElement>('#ctrl-panel-use *, [data-testid="ctrl-panel-use"] *')]
      .filter((el) => el.children.length === 0 && (el.textContent ?? '').includes('コントローラーなし'))
      .map((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3 }));
    const note = q('use-note')?.getBoundingClientRect();
    return {
      panelVisible: vis(panel),
      noneVisible: vis(q('use-none')),
      buttons,
      scrolls,
      tags,
      note: note ? { top: note.top, h: note.height } : null,
      panelH: panel?.getBoundingClientRect().height ?? null,
      vh: innerHeight,
      noteBottom: note ? note.bottom : null,
    };
  });
  if (!info.panelVisible) add('missing', 'ctrl-panel-use', 'つかう コントローラー タブの 中身が 見えない');
  if (info.scrolls > 0) add('scroll', 'settings-panel', `スクロールなしで 入るはずが、中で スクロールが 要る(${info.scrolls} か所)`);
  if (info.noteBottom !== null && info.noteBottom > info.vh + 0.5) add('offscreen', 'use-note', '下の 1 行が 画面の 下に はみ出す');
  if (opts.pads === 0) {
    if (!info.noneVisible) add('missing', 'use-none', '0 本の ときの「コントローラーを つないでね」が 出ていない');
    if (info.buttons.some((b) => b.id !== 'use-none' && /^use-p[12]-c\d+$/.test(b.id))) add('extra', 'use-p*', '0 本なのに えらぶ ボタンが ある');
  } else {
    const pick = info.buttons.filter((b) => /^use-p[12]-c\d+$/.test(b.id));
    if (pick.length !== opts.pads * 2) add('count', 'use-p*', `えらぶ ボタンは ${opts.pads * 2} 個のはず(${pick.length})`);
    for (const b of pick) {
      if (b.h < 55.5) add('size', b.id, `押せる 高さが 56 未満(${b.h})`);
      if (Math.abs(b.font - 20) > 0.5) add('font', b.id, `字が 20px でない(${b.font})`);
      if (Math.abs(b.radius - 14) > 0.5) add('radius', b.id, `角が 14px でない(${b.radius})`);
    }
    for (const who of ['p1', 'p2']) {
      const row = pick.filter((b) => b.id.startsWith(`use-${who}-`)).sort((a, b) => a.t - b.t || a.l - b.l);
      const lines: Array<typeof row> = [];
      for (const b of row) {
        const line = lines.find((l) => Math.abs(l[0]!.t - b.t) < 2);
        if (line) line.push(b);
        else lines.push([b]);
      }
      if (lines.some((l) => l.length > 3)) add('wrap', `use-${who}`, '3 本から あとは 2 段に おりかえすはず(1 段に 4 つ いる)');
      if (opts.pads >= 4 && lines.length < 2) add('wrap', `use-${who}`, '4 本は 2 段に おりかえすはず');
      for (const l of lines) {
        const s = [...l].sort((a, b) => a.l - b.l);
        for (let i = 1; i < s.length; i++) {
          const gap = s[i]!.l - s[i - 1]!.r;
          if (Math.abs(gap - 12) > 1) add('gap', `use-${who}`, `ボタンの すきまが 12px でない(${gap})`);
        }
      }
      for (let i = 1; i < lines.length; i++) {
        const gap = lines[i]![0]!.t - lines[i - 1]![0]!.b;
        if (Math.abs(gap - 8) > 1) add('gap', `use-${who}`, `段の すきまが 8px でない(${gap})`);
      }
    }
  }
  for (const t of info.tags) if (t.h > t.lh * 1.6) add('wrap', 'use-tag', '「コントローラーなし(キーボードだけ)」の 札が 2 行に なっている');
  const prev = before;
  if (prev && info.note) {
    if (prev.noteTop !== null && Math.abs(prev.noteTop - info.note.top) > 0.5) add('shift', 'use-note', `待ちに なって 下の 1 行が ずれた(${prev.noteTop} → ${info.note.top})`);
    if (prev.noteH !== null && Math.abs(prev.noteH - info.note.h) > 0.5) add('shift', 'use-note', `下の 1 行の 高さが かわった(${prev.noteH} → ${info.note.h})`);
    if (prev.panelH !== null && info.panelH !== null && Math.abs(prev.panelH - info.panelH) > 0.5) add('shift', 'ctrl-panel-use', '待ちに なって パネルの 高さが かわった');
  }
  return out;
}
