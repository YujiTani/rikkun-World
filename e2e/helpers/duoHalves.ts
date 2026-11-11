import { expect, type Page } from '@playwright/test';
import { aimWithItem, tid, visibleBox, type Box } from './duoAim';
import { installFakePads, openDuoHud, type DuoUiIssue } from './duoUi';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g)・§9.13・§12.0、AC177・AC178・AC181）: 2 人の とき 出る 物は ぜんぶ その人の 半分の 中。UI 検査の 部品。実装の 前に 書いた。
 * UI 検査ゲート（e2e/ui-gate.spec.ts の 'duo-half-all'・'duo-half-down'）が 使う。数・座標は 決め打ちせず ゲーム（window.__rikkun）に 聞く。時間（ms）で 合否を 決めない（ステップで 進める）。
 *
 * ---- 開発への つなぎ目の 約束（目印は src/ui/duoHalves.ts の DUO_HALF_ID。`halfId(key, who)` = `${DUO_HALF_ID[key]}-p${who}`）----
 *   duo-title-announce-p1／-p2   #13 世界の おしらせ（両方の 半分の 上に 同じ 物。どちらも 半分の 中・まん中の 線に またがらない）
 *   duo-home-notice-p1／-p2      #14 復活した 人の 半分の「スタートに もどったよ」（2P の「おともだちの そばに もどったよ」は ユニット homeText.test.ts。この 検査の 画面には 入れない）
 *   duo-damage-edge-p1／-p2      #15 ふち（その 半分の 矩形に ぴったり。出ている とき〔opacity > 0〕だけ 見える）
 *   duo-death-p1                 #16 1P が 倒れた あいだの 白い 画面（1P の 半分の 矩形に ぴったり。2P の 半分には かからない）
 *   duo-clock-p1／-p2            #17 時計（1.17: 各半分の 外がわの 上すみ＝ 1P は 画面の 左上・2P は 画面の 右上。同じ 絵・同じ ことば・同じ「N にちめ」。距離メーター・矢印・ほかの 物に かからない）
 *   duo-cel-band-p1／-p2         #18 実績の 帯・テロップ・家の 名前（持ち主の 半分）
 *   duo-cel-banner-p1            #19 はじめて つくった 横断幕（1P の 半分。数秒で 消える 上の 層なので この 検査の 画面には 入れない。css は duoHalvesCss.test.ts）
 *   duo-hud-notice-p1／-p2       #20 つくれる マークの かたまり（その人の ホットバーの 右上）
 *   duo-yokai-plate-p1／-p2      #21 妖怪の 名札（その 半分の カメラで 決めた 位置。半分の 中に おさまる）
 *   duo-notice-name-p1／-p2      #22a えらんだ 名前（その人の ホットバーの 上）
 *   duo-buff-plate-p1／-p2       #22 バフの 札（その人の ハートの かたまりの 上）
 *   duo-ink-dim-p1／-p2          #22b すみで 暗くなる 板（この 検査の 画面では 出さない。ユニット halves.test.ts）
 *   `duo.select(who, slot)`（DuoPlayHook。`?duo=dev` の とき だけ。その人の ホットバーの 選びを slot〔0 はじまり〕に する）… 2P の 名前の 表示を 出す ため（足りない 口）
 *   `duo.hurt(who, amount)`（今ある）・`h.yokai.spawn(kind, x, y, z, { ai: false, title: 'nushi', m: 1 })`（今ある）
 */

const stepN = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

const ids = (key: string, who: 1 | 2): string => `${key}-p${who}`;

/** 世界の 外の ほうへ ねらった 先に 妖怪を 出す（その人の 向きの 5 マス 先）。二つ名つき（名札と 世界の おしらせが 出る） */
async function spawnTitledAhead(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (const who of [1, 2] as const) {
      const p = h.duo.pos(who);
      const vp = h.duo.viewports().find((v: any) => v.who === who);
      const yaw = ((vp?.yawDeg ?? 0) * Math.PI) / 180;
      const x = p.x + Math.sin(yaw) * 6;
      const z = p.z - Math.cos(yaw) * 6;
      h.world.fill(Math.floor(x) - 1, Math.floor(p.y) - 1, Math.floor(z) - 1, Math.floor(x) + 1, Math.floor(p.y) - 1, Math.floor(z) + 1, 'stone');
      h.yokai.spawn('karakasa', x, p.y, z, { ai: false, title: 'nushi', m: 1 });
    }
  });
}

/**
 * 2 人で、1P も 2P も 風神剣（バフの 札）・材料（つくれる マーク）・ヒント・名前・二つ名の 妖怪（名札・世界の おしらせ）・ふち が ぜんぶ 出た いちばん 多い とき。
 * パッドは 偽物 2 本。ゲームは 一時停止のまま
 */
export async function openDuoHalfAll(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y, z: p1.z + 6 });
    for (const who of [1, 2] as const) {
      h.duo.give(who, 'fujin_ken', 1); // 手に もつと バフの 札（速さ）
      h.duo.give(who, 'log', 4); // つくれる マーク（きの いたが つくれる）
    }
  });
  await stepN(page, 10);
  await aimWithItem(page, 1, 'dirt');
  await aimWithItem(page, 2, 'dirt');
  await spawnTitledAhead(page);
  await stepN(page, 4);
  // えらんだ 名前: 選びを かえて もどす（かえた ステップで 名前が 出る）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.select(1);
    h.duo.select(2, 1);
    h.step(1);
    h.inventory.select(0);
    h.duo.select(2, 0);
    h.step(1);
    // ふち: 当たった ステップから 少し 進めて いちばん 濃い あたりで 止める
    h.duo.hurt(1, 1);
    h.duo.hurt(2, 1);
    h.step(10);
  });
}

/**
 * 1P が 倒れて 復活した 直後（白い 画面が きえかけ・「スタートに もどったよ」）。2P は そのまま 遊んでいる（2P の 半分に 白い 画面は かからない）。
 */
export async function openDuoHalfDown(page: Page): Promise<void> {
  await openDuoHud(page);
  await installFakePads(page, 2);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y, z: p1.z + 6 });
    h.step(10);
    h.duo.hurt(1, 999);
    h.step(30);
  });
  // 倒れた 白い 画面の あいだ（1P の 半分だけ）
  const dead = await page.evaluate(() => (window as any).__rikkun.duo.hearts(1).down);
  expect(dead, '1P が 倒れている').toBe(true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    let n = 0;
    while (h.duo.hearts(1).down && n++ < 600) h.step(1); // 復活まで 数で 進める
    h.step(3);
  });
}

type Slot = { key: string; who: 1 | 2; need: boolean };

/** 画面の 検査の 対象。need = 出て いなければ ならない */
function targets(scene: 'all' | 'down'): Slot[] {
  const both = (key: string, need = true): Slot[] => [1, 2].map((who) => ({ key, who: who as 1 | 2, need }));
  if (scene === 'down') return [{ key: 'duo-death', who: 1, need: true }, { key: 'duo-home-notice', who: 1, need: true }, ...both('duo-clock')];
  return [
    ...both('duo-title-announce'),
    ...both('duo-damage-edge'),
    ...both('duo-clock'),
    ...both('duo-hud-notice'),
    ...both('duo-yokai-plate'),
    ...both('duo-notice-name'),
    ...both('duo-buff-plate'),
  ];
}

/** 半分の ふちどり・全面の 板は 半分の 矩形に ぴったり（重なりを 見ない） */
const OVERLAY = new Set(['duo-damage-edge', 'duo-death', 'duo-ink-dim']);
/** 世界の 物を 投げた 名札は 半分の 中に おさまれば よい（ほかと 重なる ことは ある） */
const PROJECTED = new Set(['duo-yokai-plate']);

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/**
 * AC177: 2 人の とき（3 つの 大きさごとに 呼ぶ）。出て いる 5f-2 の 表示は ぜんぶ その人の 半分の 中（まん中の 線に またがらない）に おさまり、
 * ホットバー・ハート・レベル・距離メーター・矢印・＋マーク・ヒントに かからない。ふち・白い 画面は その 半分の 矩形に ぴったり。
 * 時計（1.17）は 各半分の 外がわの 上すみ（1P = 画面の 左端から・2P = 画面の 右端から sp-5 くらい 内側、上から sp-5 くらい）で 同じ 絵・同じ ことば。
 * 時計の 箱は 距離メーター・矢印・ほかの 常に 出る 表示に かからない（下の 重なり検査に 時計も 入る）。空 = 合格
 */
export async function duoHalvesIssues(page: Page, scene: 'all' | 'down'): Promise<DuoUiIssue[]> {
  const out: DuoUiIssue[] = [];
  const add = (kind: string, target: string, detail: string) => out.push({ kind, target, detail });
  const vw: number = await page.evaluate(() => innerWidth);
  const vh: number = await page.evaluate(() => innerHeight);
  const mid = Math.floor(vw / 2);
  const range = (who: 1 | 2): [number, number] => (who === 1 ? [0, mid] : [mid, vw]);

  const st = await page.evaluate(() => (window as any).__rikkun.duo.state());
  if (st.view !== 'split') add('view', 'duo-state', `左右に わかれて いない（view = ${st.view}）`);

  // 2 人の あいだ 画面の まん中に 古い 1 つ だけの 物が 残って いない（まん中の 線に またがる）
  for (const old of ['#title-announce', '#home-notice', '#notice-name', '#death-screen', '#damage-edge', '#ink-dim']) {
    const b = await visibleBox(page, old);
    if (b && b.l < mid && b.r > mid) add('split-line', old, '2 人の あいだ まん中の 線に またがる 古い 1 つ だけの 物が 残っている');
  }

  const hud: [string, Box | null][] = [];
  for (const who of [1, 2] as const) {
    for (const part of ['hotbar', 'hearts', 'levelbar'] as const) hud.push([`duo-${part}-p${who}`, await visibleBox(page, tid(`duo-${part}-p${who}`))]);
    hud.push([`duo-arrow-p${who}`, await visibleBox(page, tid(`duo-arrow-p${who}`))]);
    hud.push([`duo-crosshair-p${who}`, await visibleBox(page, tid(`duo-crosshair-p${who}`))]);
    hud.push([`duo-action-hint-p${who}`, await visibleBox(page, tid(`duo-action-hint-p${who}`))]);
  }
  hud.push(['duo-meter', await visibleBox(page, tid('duo-meter'))]);

  const boxes = new Map<string, Box>();
  for (const t of targets(scene)) {
    const name = ids(t.key, t.who);
    const b = await visibleBox(page, tid(name));
    if (!b) {
      if (t.need) add('missing', name, `${t.who}P の 半分に 出る はずの 表示が 見えない`);
      continue;
    }
    boxes.set(name, b);
    const [lo, hi] = range(t.who);
    if (OVERLAY.has(t.key)) {
      if (!near(b.l, lo, 2) || !near(b.r, hi, 2)) add('half', name, `その 半分の 矩形に ぴったり では ない（${b.l.toFixed(0)}〜${b.r.toFixed(0)}。半分は ${lo}〜${hi}）`);
      continue;
    }
    if (b.l < lo - 1 || b.r > hi + 1) add('half', name, `その人の 半分（${lo}〜${hi}）の 外に はみ出す（${b.l.toFixed(0)}〜${b.r.toFixed(0)}）`);
    if (b.l < mid && b.r > mid) add('split-line', name, '分割の 線に またがる');
    if (b.t < -1 || b.b > vh + 1) add('offscreen', name, '画面の 上下から はみ出す');
    if (PROJECTED.has(t.key)) continue;
    for (const [hn, hb] of hud) {
      if (!hb || hn === name) continue;
      if (b.l < hb.r && b.r > hb.l && b.t < hb.b && b.b > hb.t) add('overlap', `${name}/${hn}`, `${hn} に かかる`);
    }
  }

  // 時計（1.17）: 各半分の 外がわの 上すみ（1P = 左上・2P = 右上）・同じ 絵 と ことば
  if (scene === 'all' || scene === 'down') {
    for (const who of [1, 2] as const) {
      const c = boxes.get(ids('duo-clock', who));
      if (!c) continue;
      const edge = who === 1 ? c.l : vw - c.r; // 1P = 画面の 左はし から・2P = 画面の 右はし から
      if (edge < 0 || edge > 64 || c.t > 64) add('place', ids('duo-clock', who), `${who === 1 ? '左上' : '右上'}の すみに ない（${who === 1 ? '左' : '右'}はし から ${edge.toFixed(0)}px・上から ${c.t.toFixed(0)}px）`);
      // 距離メーターに かからない（まん中）: 外がわの すみなら メーターから はなれる
      const m = hud.find(([n]) => n === 'duo-meter')?.[1];
      if (m && c.l < m.r && c.r > m.l && c.t < m.b && c.b > m.t) add('overlap', `${ids('duo-clock', who)}/duo-meter`, '時計が 距離メーターに かかる');
    }
    const same = await page.evaluate(() => {
      const q = (who: number) => {
        const el = document.querySelector(`[data-testid="duo-clock-p${who}"]`) as HTMLElement | null;
        if (!el) return null;
        return { scene: el.dataset.scene ?? '', phase: el.dataset.phase ?? '', text: (el.textContent ?? '').trim(), img: (el.querySelector('.clock-img') as HTMLImageElement | null)?.src ?? '' };
      };
      return [q(1), q(2)];
    });
    if (same[0] && same[1] && JSON.stringify(same[0]) !== JSON.stringify(same[1])) add('clock', 'duo-clock', `2 つの 時計の 時刻が ちがう（${JSON.stringify(same[0])} / ${JSON.stringify(same[1])}）`);
  }

  if (scene === 'down') {
    // 2P の 半分に 白い 画面が かからない（1P の 白い 画面の 右はしが まん中の 線を こえない）
    const d = boxes.get('duo-death-p1');
    if (d && d.r > mid + 1) add('half', 'duo-death-p1', '1P の 白い 画面が 2P の 半分に かかる');
    const hp = await page.evaluate(() => (window as any).__rikkun.duo.hearts(2));
    if (hp.down) add('state', 'duo-hearts-p2', '2P は 遊びつづけて いるはず（倒れて いない）');
  }
  return out;
}
