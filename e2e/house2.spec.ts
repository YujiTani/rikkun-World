import { expect, test, type Page } from '@playwright/test';
import { openHouse, spawnPoint, stepUi, waitArchitects } from './helpers/house';
import { aimAtBlock } from './helpers/aim';
import { btnState, clickBtn, ed, editorBtnIds, editorMismatch, firstArchitect, needOf, openEditor, plainText, readButtons } from './helpers/houseEditor';
import { learn, recipeBand, recipeEd, recipeKinds, recipes, waitBandGone } from './helpers/houseRecipe';
import { settleWorld } from './helpers/stream';

/**
 * HOUSE-2A（#364 レシピを 見つけて えらぶ。docs/tickets/HOUSE-2A.md・仕様 3.2 版 docs/design/HOUSE-2.md §2・§6.2）の E2E。1 本だけ（#311）。
 * 約束（窓口・ボタンの id・data-testid）は e2e/helpers/house.ts の「2A の 約束」。関数は e2e/helpers/houseRecipe.ts。時間では 待たず step の 数で 進める（#255）。
 *
 * 見つけて えらぶ 通し（AC1 → AC2 → AC3 → AC4 → AC5 → 見本の こたえ〔AC8〕）:
 *   新しい 世界で 坑道を さがし（まきものの ある 坑道を 先に。なければ はじまりの 坑道）→ いちばん 下の へやで レシピの マスを 右クリック（宝箱なら 宝箱。まきものなら まきもの）→
 *   1 まい目 roof_kawara を おぼえる（上の 帯の テロップ「…の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ」・taken・2 回目は 何も おきない）→
 *   建築士さんの エディターを 開く → ① に ばしょの ボタン（やね・かべ・まど・と）。しゅるいの ボタンは まだ 出ない。やねの ボタンに「あたらしい！」→
 *   やねの ボタンに のせて 12 コマで 名前の ヘルプ（2 行: やね・いま: たいら。11 コマ目までは 出ない）→
 *   やねの ボタンを 押す ＝ ポップアップが 開く（見本は 見えた まま・下の パネルの ボタンは かくれる）→ いつもの 行（なし・たいら）＋ むら・おしろ・こうざんの 3 行（かわらの やね）。行の 見出し・印は ない。それぞれに 印 →
 *   マウスを のせて 12 コマで ヘルプ（1 行・マウスの 近く）が 出て、見本の やねが 光る（回らない）→ 押すと editor().roof が kawara_shiro・その ボタンの 印だけ 消える・ポップアップは 開いた まま・ヘルプも 消えない・見本の やねが 90 コマ 光る →
 *   ほかの 案も 押して くらべる → 「なし」を 押す（光らない）→ ✕・Esc で とじる（Esc は ポップアップだけ）。
 * 数・持ち物・選びの きまり・材料・保存・音の 細かい 基準は ユニット（src/house/recipes/*.test.ts・src/world/gen/mineRecipe.test.ts・src/house/preview/glowParts.test.ts）。
 * 画面の 数・大きさ（AC9）は e2e/ui-gate.spec.ts。見た目・音の 好みは オーナー確認（AC14）。
 * 赤の 確かめ（テストの 準備）: 実装の 前は shaft.recipe／house.recipes が 無くて 落ちる。
 */

interface Pt {
  x: number;
  y: number;
  z: number;
}
interface ShaftInfo {
  id: string;
  room: { x0: number; y: number; z0: number; x1: number; z1: number };
  chest: { x: number; y: number; z: number } | null;
  recipe?: { kind: 'chest' | 'scroll'; x: number; y: number; z: number; taken: boolean };
}

const squash = (s: string): string => s.replace(/\s+/g, '');

type Box = { l: number; t: number; r: number; b: number };
/** 見えて いる 名前の ヘルプ（editor-hover-tip）の 外わく・pointer-events と、ボタン id の 外わく */
async function tipBoxes(page: Page, id: string): Promise<{ tip: Box | null; pe: string; btn: Box | null; W: number; H: number }> {
  return page.evaluate((id) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const tip = Array.from(document.querySelectorAll('[data-testid="editor-hover-tip"]')).find((e) => e.getBoundingClientRect().width > 0) ?? null;
    return { tip: rect(tip), pe: tip ? getComputedStyle(tip).pointerEvents : '', btn: rect(document.querySelector(`[data-testid="house-btn-${id}"]`)), W: innerWidth, H: innerHeight };
  }, id);
}
/** マウスの 点（mx, my）から ふきだしの 外わくまでの きょり（中に あれば 0） */
const distTo = (t: Box, mx: number, my: number): number => Math.hypot(Math.max(t.l - mx, 0, mx - t.r), Math.max(t.t - my, 0, my - t.b));
/** カーソルの 先（mx, my）が ふきだしの 中に かくれて いない */
const covers = (t: Box, mx: number, my: number): boolean => mx > t.l + 0.5 && mx < t.r - 0.5 && my > t.t + 0.5 && my < t.b - 0.5;
/** カーソルの 近く: ふきだしの 外わくまで この px 以内（ずらし 幅は developer。共通の ツールチップ placeNear は 18・12） */
const TIP_NEAR = 48;

/**
 * 名前の ヘルプ（editor-hover-tip）が カーソルの 近くに 出て、マウスに ついて うごく（仕様 3.2.1 §2.3・§3.2・PO の 答え その 2 の 13）。
 * 画面の 外へ 出ない・押せない・カーソルの 先を かくさない。同じ ボタンの 上で マウスを 下へ うごかすと、ヘルプは 待ちなおさず 同じだけ 下へ うごく。
 * マウスは ボタンの まん中に のって いる こと（Playwright の hover() の あと）。おわると マウスは ボタンの まん中に もどす。数の 細部は UI 検査（AC9）。
 */
async function expectTipNear(page: Page, id: string): Promise<void> {
  const r = await tipBoxes(page, id);
  expect(r.tip, 'editor-hover-tip が 見える').not.toBeNull();
  expect(r.btn, 'のせた ボタンが 見える').not.toBeNull();
  const t = r.tip!;
  const b = r.btn!;
  expect(r.pe, '押せない 物（マウスを 通す）').toBe('none');
  expect(t.l >= -0.5 && t.t >= -0.5 && t.r <= r.W + 0.5 && t.b <= r.H + 0.5, `画面の 外へ 出ない（${JSON.stringify(t)}）`).toBe(true);
  const cx = (b.l + b.r) / 2;
  const cy = (b.t + b.b) / 2;
  const d0 = distTo(t, cx, cy);
  expect(d0, `カーソルの 近く（${d0.toFixed(1)}px）`).toBeLessThanOrEqual(TIP_NEAR);
  expect(covers(t, cx, cy), `カーソルの 先を かくさない（${JSON.stringify(t)}・マウス ${cx.toFixed(1)},${cy.toFixed(1)}）`).toBe(false);
  // マウスに ついて うごく: 同じ ボタンの 中で 下へ dy うごかす（ボタンは 56px 以上 ＝ まん中から 10px は ボタンの 中）
  const dy = 10;
  await page.mouse.move(cx, cy + dy);
  await stepUi(page, 1);
  expect((await recipeEd(page)).hoverTip?.id, '同じ ボタンの 中で うごかしても ヘルプは 出た まま（待ちなおさない）').toBe(id);
  const t1 = (await tipBoxes(page, id)).tip;
  expect(t1, 'うごかした あとも 見える').not.toBeNull();
  expect(t1!.t - t.t, `マウスに ついて 下へ ${dy}px うごく（固定 では ない）`).toBeCloseTo(dy, 0);
  expect(t1!.l - t.l, 'よこには うごかない').toBeCloseTo(0, 0);
  expect(covers(t1!, cx, cy + dy), 'うごかした あとも カーソルの 先を かくさない').toBe(false);
  await page.mouse.move(cx, cy);
  await stepUi(page, 1);
}
const SHOTS = 'test-shots/HOUSE-2A';

/** まきものの ある 坑道（スタートに ちかい 順）。なければ はじまりの 坑道 */
async function pickShaft(page: Page, sp: { x: number; z: number }): Promise<ShaftInfo> {
  const s = await page.evaluate((sp) => {
    const h = (window as any).__rikkun;
    const list = h.mine.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535) as ShaftInfo[];
    const d = (q: ShaftInfo): number => Math.hypot(q.room.x0 - sp.x, q.room.z0 - sp.z);
    const scrolls = list.filter((q) => q.recipe?.kind === 'scroll').sort((a, b) => d(a) - d(b));
    return (scrolls[0] ?? (h.mine.startShaft() as ShaftInfo)) as ShaftInfo;
  }, sp);
  expect(s.recipe, '坑道に recipe（仕様 §6.1）').toBeTruthy();
  return s;
}

/** 列を 読みこませる: (x, z) へ テレポート → そろうまで 進める */
async function loadAround(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x, z });
  await settleWorld(page, true);
}

/** 右クリック 1 回（おして 2 ステップ・はなして 1 ステップ） */
async function rightClick(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('secondary');
    h.step(2);
    h.input.release('secondary');
    h.step(1);
  });
}

test.describe('HOUSE-2A 見つけて えらぶ 通し', () => {
  test('坑道の まきもの（か 宝箱）→ おぼえる → ① に 出る → 押すと 見本が かわる', async ({ page }) => {
    await openHouse(page);
    const r0 = await recipes(page);
    expect(r0.all.length, '表の レシピ').toBeGreaterThan(0);
    expect(r0, 'はじめは 何も おぼえて いない').toMatchObject({ learned: [], fresh: [] });

    // ---- AC1: 坑道の いちばん 下の へやで レシピの マスを 右クリック
    const sp = await spawnPoint(page);
    const shaft = await pickShaft(page, sp);
    const at = shaft.recipe!;
    test.info().annotations.push({ type: 'レシピの 場所', description: `${at.kind} ${shaft.id}` });
    expect(at.taken, 'まだ 拾って いない').toBe(false);
    await loadAround(page, at.x, at.z);
    const stand = await page.evaluate(
      ({ room, at }) => {
        const h = (window as any).__rikkun;
        const cx = (room.x0 + room.x1) / 2 + 0.5 - (at.x + 0.5);
        const cz = (room.z0 + room.z1) / 2 + 0.5 - (at.z + 0.5);
        // レシピの マスから へやの まん中の ほうへ 2 マス（まきものは おくの かべに そって いる）
        const sx = Math.abs(cx) >= Math.abs(cz) ? Math.sign(cx) : 0;
        const sz = Math.abs(cx) >= Math.abs(cz) ? 0 : Math.sign(cz);
        h.player.set({ position: { x: at.x + 0.5 + sx * 2, y: at.y, z: at.z + 0.5 + sz * 2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(10);
        const p = h.player.get().position;
        return { x: p.x, y: p.y, z: p.z };
      },
      { room: shaft.room, at },
    );
    expect(Math.abs(stand.y - at.y), '足もとは へやの 床の 高さ').toBeLessThan(1.5);
    await aimAtBlock(page, at.x, at.y, at.z, 0.5);
    const aimed = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1);
      return h.target.get()?.block as Pt | undefined;
    });
    expect(aimed, 'ねらいが レシピの マスに 乗った').toMatchObject({ x: at.x, y: at.y, z: at.z });

    await rightClick(page);
    await stepUi(page, 40); // 宝箱の ふたが 動く 間
    const after = await recipes(page);
    expect(after.learned, 'かわらの やねを おぼえた（1 まい目）').toEqual(['roof_kawara']);
    expect(after.fresh).toEqual(['roof_kawara']);
    const band = await recipeBand(page);
    expect(band, '上の 帯の テロップ').not.toBeNull();
    expect(squash(band!.text)).toMatch(/^.+のレシピをおぼえた！けんちくしさんのせっけいずでえらべるよ$/);
    expect(squash(band!.text)).toContain('かわらのやね');
    await expect(page.getByTestId('recipe-band').filter({ visible: true }), '画面の 上の 帯').toBeVisible();
    await page.screenshot({ path: `${SHOTS}/found-band.png` });
    const taken = await page.evaluate(({ id, at }) => ((window as any).__rikkun.mine.shafts(at.x, at.z, at.x, at.z) as ShaftInfo[]).find((q) => q.id === id)?.recipe?.taken, { id: shaft.id, at });
    expect(taken, '拾った').toBe(true);
    await rightClick(page);
    await stepUi(page, 40);
    expect((await recipes(page)).learned, '2 回目は 何も おきない（1 坑道に 1 まい）').toEqual(['roof_kawara']);
    await waitBandGone(page);

    // ---- AC3: 建築士さんの エディター ① に 出る（ばしょの ボタンだけ。しゅるいは ポップアップの 中）
    await loadAround(page, sp.x, sp.z);
    await waitArchitects(page);
    const arch = await firstArchitect(page);
    await openEditor(page, arch.id);
    expect(await recipeEd(page), 'はじめの 形').toMatchObject({ popup: null, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    const kawara = await recipeKinds(page, 'roof_kawara');
    expect(kawara.length, 'かわらの やねは 1 まいで 複数の しゅるい（むら・おしろ・こうざん）').toBeGreaterThan(1);
    expect(kawara.every((id) => id.startsWith('roof-kawara_')), 'ボタンの id は roof-kawara_<案>').toBe(true);
    const ids1 = await editorBtnIds(page);
    for (const id of ['part-roof', 'part-wall', 'part-window', 'part-door']) expect(ids1, `① に ${id}`).toContain(id);
    for (const id of ['part-deco', 'roof-none', 'roof-flat', 'wall-ki', 'window-shoji', 'popupClose', ...kawara]) expect(ids1, `① に ${id} は 出ない（ポップアップを 開くまで）`).not.toContain(id);
    expect([...(await recipeEd(page)).marks].sort(), '「あたらしい！」の 印（やねの ばしょ ＋ かわらの しゅるいごと）').toEqual(['part-roof', ...kawara].sort());
    await expect(page.getByTestId('editor-new-mark').filter({ visible: true }), '見えて いる 印は やねの ばしょの 1 こ').toHaveCount(1);
    await expect(page.getByTestId('house-btn-part-roof').getByTestId('editor-new-mark'), 'やねの ばしょの ボタンに 印').toBeVisible();
    // 名前の ヘルプ（AC9b）: ばしょは 2 行。11 コマ目までは 出ない・12 コマ目で 出る
    await page.getByTestId('house-btn-part-roof').hover();
    await stepUi(page, 11);
    expect((await recipeEd(page)).hoverTip, 'のせて 11 コマ目までは 出ない').toBeNull();
    await expect(page.getByTestId('editor-hover-tip').filter({ visible: true }), '画面にも 出ない').toHaveCount(0);
    await stepUi(page, 1);
    const tip0 = (await recipeEd(page)).hoverTip;
    expect(tip0?.id, '12 コマ目で のせた ボタンの ヘルプ').toBe('part-roof');
    expect(squash((tip0?.lines ?? []).join('')), 'ばしょは 名前 ＋「いま: 〇〇」の 2 行').toBe('やねいま:たいら');
    expect(tip0?.lines.length, '2 行').toBe(2);
    expect(await plainText(page, 'editor-hover-tip'), '画面の ヘルプ').toBe('やねいま:たいら');
    await expectTipNear(page, 'part-roof');
    expect(await plainText(page, 'editor-part-name'), '名前の 行は やめた（ヘルプに おきかえ）').toBeNull();
    await page.screenshot({ path: `${SHOTS}/editor-soto-new.png` });

    // ---- AC4: やねの ボタンを 押すと ポップアップ（見本は 見えた まま）
    await clickBtn(page, 'part-roof');
    expect((await recipeEd(page)).popup, 'ポップアップが やねで 開いた').toBe('roof');
    expect((await ed(page)).canUndo, '開く のは もどす に 入らない').toBe(false);
    const ids2 = await editorBtnIds(page);
    for (const id of ['roof-none', 'roof-flat', ...kawara, 'popupClose', 'undo', 'redo', 'next', 'done']) expect(ids2, `ポップアップに ${id}`).toContain(id);
    for (const id of ['part-roof', 'width-5', 'depth-5', 'windowsUp', 'windowsDown']) expect(ids2, `下の パネルの ${id} は かくれる`).not.toContain(id);
    expect(await editorMismatch(page), '画面と menu() の ちがい（ポップアップ）').toEqual([]);
    expect((await recipeEd(page)).popupRows, '行: いつもの（なし・たいら）→ むら → おしろ → こうざん（1 行に 1 つの なかま）').toEqual([['roof-none', 'roof-flat'], ...kawara.map((k) => [k])]);
    const bs = (await readButtons(page)).filter((b) => /^roof-/.test(b.id)).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    expect(bs.map((b) => b.id), '画面の 順').toEqual(['roof-none', 'roof-flat', ...kawara]);
    const ys = [...new Set(bs.map((b) => Math.round(b.rect.y)))];
    expect(ys.length, '行は ＋ むら・おしろ・こうざんの 3 行（空の 行も 折りかえしも ない）').toBe(1 + kawara.length);
    for (const y of ys) expect(Math.min(...bs.filter((b) => Math.round(b.rect.y) === y).map((b) => b.rect.x)), '行の 中は 左 つめ（どの 行も 同じ x から）').toBeCloseTo(bs[0]!.rect.x, 0);
    const pv = await page.getByTestId('editor-preview').filter({ visible: true }).boundingBox();
    const pop = await page.getByTestId('editor-popup').boundingBox();
    expect(pv && pop && pv.x + pv.width <= pop.x + 1.5, '見本は かくれない（ポップアップと 重ならない）').toBe(true);
    await expect(page.getByTestId('popup-row-mark').filter({ visible: true }), '行の 印・見出しは ない（行が かわる ことで なかまが 分かる）').toHaveCount(0);
    expect([...(await recipeEd(page)).marks].sort(), '開いた だけでは 印は 消えない').toEqual(['part-roof', ...kawara].sort());
    await expect(page.getByTestId('editor-new-mark').filter({ visible: true }), '見える 印は しゅるいの ボタンごと').toHaveCount(kawara.length);
    expect((await btnState(page, 'roof-flat'))?.pressed, 'たいら ✓').toBe(true);
    expect(await plainText(page, 'popup-kind-name'), '名前の 行は やめた').toBeNull();
    await page.mouse.move(0, 0);
    await stepUi(page, 2);
    expect((await recipeEd(page)).hoverTip, 'ポップアップを 開いた 直後は ヘルプは 出ない（マウスは どの ボタンにも のって いない）').toBeNull();

    // ---- 見本の こたえ（AC8）: のせて いる 間は その ばしょが 光る（回らない）
    const angle0 = (await recipeEd(page)).preview!.angle;
    await page.getByTestId(`house-btn-${kawara[1]}`).hover();
    await stepUi(page, 11);
    expect((await recipeEd(page)).hoverTip, 'のせて 11 コマ目までは ヘルプは 出ない').toBeNull();
    expect((await recipeEd(page)).preview?.glow?.parts, '光るのは すぐ（ヘルプの 待ちとは べつ）').toEqual(['roof']);
    await stepUi(page, 1);
    expect((await recipeEd(page)).hoverTip, '12 コマ目で ヘルプ（しゅるいは 1 行: 案の 名前 ＋ レシピの 名前）').toEqual({ id: kawara[1], lines: [expect.stringMatching(/^おしろ\s*の\s*かわら\s*の\s*やね$/)] });
    expect(await plainText(page, 'editor-hover-tip'), '画面の ヘルプ').toBe('おしろのかわらのやね');
    await expectTipNear(page, kawara[1]!);
    const hov = (await recipeEd(page)).preview!;
    expect(hov.glow, 'のせて いる 間 見本の やねが 光る').toMatchObject({ left: null });
    expect(hov.glow!.parts, '光る 物').toEqual(['roof']);
    await stepUi(page, 30);
    const hov2 = (await recipeEd(page)).preview!;
    expect(hov2.glow!.parts, 'のせた まま ずっと').toEqual(['roof']);
    const gap = Math.abs(((hov2.angle - angle0 + 540) % 360) - 180); // 向きの ずれ（0〜180°）
    expect(gap, `回って 135／225 へ 行かない（ふつうの 自動の 回りだけ。${gap.toFixed(1)}°）`).toBeLessThan(45);
    await page.screenshot({ path: `${SHOTS}/popup-hover.png` });
    await page.mouse.move(0, 0);
    await stepUi(page, 2);
    expect((await recipeEd(page)).preview?.glow, 'はなすと 消える').toBeNull();
    expect((await recipeEd(page)).hoverTip, 'はなすと ヘルプも 次の コマで 消える').toBeNull();
    await expect(page.getByTestId('editor-hover-tip').filter({ visible: true })).toHaveCount(0);

    // ---- 押すと 見本が かわる（AC5）。その ボタンの 印だけ 消え、ポップアップは 開いた まま
    await clickBtn(page, kawara[1]!);
    const e1 = await recipeEd(page);
    expect(e1.roof, 'おしろの かわらの やね').toBe('kawara_shiro');
    expect(e1.popup, '開いた まま').toBe('roof');
    expect([...e1.marks].sort(), 'その ボタンの 印だけ 消える（ほかの 案と ばしょの 印は のこる）').toEqual(['part-roof', kawara[0], kawara[2]].sort());
    await expect(page.getByTestId('house-btn-' + kawara[1]).getByTestId('editor-new-mark')).toHaveCount(0);
    expect(await recipes(page), 'まだ 印が のこる ので fresh に のこる').toMatchObject({ learned: ['roof_kawara'], fresh: ['roof_kawara'] });
    expect((await btnState(page, kawara[1]!))?.pressed, 'おしろの かわら ✓').toBe(true);
    expect((await btnState(page, 'roof-flat'))?.pressed, 'たいらの ✓ は はずれる').toBe(false);
    expect(e1.preview?.glow, '見本の やねが 光る').toMatchObject({ left: expect.any(Number) });
    expect(e1.preview!.glow!.parts, '光る 物').toEqual(['roof']);
    await page.getByTestId(`house-btn-${kawara[1]}`).hover(); // 押した ボタンに のせ なおす（押しても ヘルプは 消えない）
    await stepUi(page, 13);
    expect((await recipeEd(page)).hoverTip?.id, 'のせると ヘルプ').toBe(kawara[1]);
    await clickBtn(page, kawara[1]!);
    await stepUi(page, 1);
    expect((await recipeEd(page)).hoverTip?.id, '押しても ヘルプは 消えない').toBe(kawara[1]);
    await page.screenshot({ path: `${SHOTS}/popup-kawara-shiro.png` });
    await stepUi(page, 95);
    expect((await recipeEd(page)).preview?.glow, '90 コマで 消える').toBeNull();
    const rows = await needOf(page);
    expect(rows.find((r) => r.item === 'kawara')?.need, 'ひつような もの: かわら P（5×5 で 24）').toBe(24);
    expect((await ed(page)).canUndo, 'えらぶのは 1 回の 操作').toBe(true);

    // ほかの 案も 押して くらべる（ぜんぶ 押すと 印が ぜんぶ 消える）。同じ ざいりょう
    await clickBtn(page, kawara[0]!);
    await clickBtn(page, kawara[2]!);
    const e2 = await recipeEd(page);
    expect(e2.roof, 'さいごに 押した 案').toBe(kawara[2]!.replace(/^roof-/, ''));
    expect(e2.marks, 'ぜんぶ 押したので 印は ひとつも ない').toEqual([]);
    expect(await recipes(page), 'fresh からも はずれる').toMatchObject({ learned: ['roof_kawara'], fresh: [] });
    expect((await needOf(page)).find((r) => r.item === 'kawara')?.need, '案を かえても ざいりょうは 同じ').toBe(24);
    await expect(page.getByTestId('editor-new-mark').filter({ visible: true })).toHaveCount(0);

    // ---- 「なし」（AC9c）: 押すと やねが なくなる・見本は 光らない・ひつような もの から かわらが 消える。もどすと もどる
    await clickBtn(page, 'roof-none');
    expect((await recipeEd(page)).roof, 'やね なし').toBe('none');
    expect((await recipeEd(page)).popup, '開いた まま').toBe('roof');
    expect((await btnState(page, 'roof-none'))?.pressed, 'なし ✓').toBe(true);
    expect((await recipeEd(page)).preview?.glow?.parts ?? [], 'なしを えらんでも 光らない').toEqual([]);
    expect((await needOf(page)).find((r) => r.item === 'kawara')?.need ?? 0, 'やね なしは かわらが いらない').toBe(0);
    await clickBtn(page, 'undo');
    expect((await recipeEd(page)).roof, 'もどすと もとの やね').toBe(kawara[2]!.replace(/^roof-/, ''));
    expect((await recipeEd(page)).popup, 'もどしても その ばしょの まま 開いて いる').toBe('roof');

    // ---- とじる: ✕・Esc（Esc は ポップアップだけ）
    await clickBtn(page, 'popupClose');
    expect((await recipeEd(page)).popup, '✕ で とじる').toBeNull();
    expect(await editorBtnIds(page), '下の パネルが もどる').toEqual(expect.arrayContaining(['part-roof', 'width-5']));
    await expect(page.getByTestId('house-btn-part-roof').getByTestId('editor-new-mark'), 'やねの ばしょの 印も 消えた').toHaveCount(0);
    await clickBtn(page, 'part-wall');
    expect((await recipeEd(page)).popup).toBe('wall');
    expect((await editorBtnIds(page)).filter((i) => i.startsWith('wall-')), 'かべは なし・き だけ（まだ かべの レシピは ない）').toEqual(['wall-none', 'wall-ki']);
    await page.keyboard.press('Escape');
    await stepUi(page, 2);
    expect((await recipeEd(page)).popup, 'Esc で ポップアップだけ とじる').toBeNull();
    await expect(page.getByTestId('house-editor'), 'エディターは 開いた まま').toBeVisible();
    expect(await learn(page, 'roof_kawara'), 'もう おぼえた').toBe(false);
  });
});
