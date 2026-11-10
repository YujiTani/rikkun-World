import { expect, test, type Page } from '@playwright/test';
import { openHouse, spawnPoint, stepUi, waitArchitects } from './helpers/house';
import { aimAtBlock } from './helpers/aim';
import { btnState, clickBtn, ed, editorBtnIds, firstArchitect, needOf, openEditor, plainText } from './helpers/houseEditor';
import { learn, recipeBand, recipeEd, recipes, waitBandGone } from './helpers/houseRecipe';
import { settleWorld } from './helpers/stream';

/**
 * HOUSE-2A（#364 レシピを 見つけて えらぶ。docs/tickets/HOUSE-2A.md・仕様 docs/design/HOUSE-2.md §2・§6.2）の E2E。1 本だけ（#311）。
 * 約束（窓口・ボタンの id・data-testid）は e2e/helpers/house.ts の「2A の 約束」。関数は e2e/helpers/houseRecipe.ts。時間では 待たず step の 数で 進める（#255）。
 *
 * 見つけて えらぶ 通し（AC1 → AC2 → AC3 → 見本の こたえ〔AC9〕）:
 *   新しい 世界で 坑道を さがし（まきものの ある 坑道を 先に。なければ はじまりの 坑道）→ いちばん 下の へやで レシピの マスを 右クリック（宝箱なら 宝箱。まきものなら まきもの）→
 *   1 まい目 roof_kawara を おぼえる（上の 帯の テロップ「…の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ」・taken・2 回目は 何も おきない）→
 *   建築士さんの エディターを 開く → ① に かわらの やねの ボタンが 出て「あたらしい！」の 印（ボタンと ばしょの ボタン）→
 *   マウスを のせると 名前の 行が かわる → 押すと editor().roof が kawara・印が 消える・見本の やねが 90 コマ 光る（glow.parts ＝ ['roof']）→ 90 コマで 消える。
 * 数・持ち物・選びの きまり・材料・保存・音の 細かい 基準は ユニット（src/house/recipes/*.test.ts・src/world/gen/mineRecipe.test.ts・src/house/preview/glowParts.test.ts）。
 * 画面の 数・大きさ（AC10）は e2e/ui-gate.spec.ts。見た目・音の 好みは オーナー確認（AC12）。
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

    // ---- AC3: 建築士さんの エディター ① に 出る
    await loadAround(page, sp.x, sp.z);
    await waitArchitects(page);
    const arch = await firstArchitect(page);
    await openEditor(page, arch.id);
    expect(await recipeEd(page), 'はじめの 形').toMatchObject({ part: 'roof', roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    const ids1 = await editorBtnIds(page);
    for (const id of ['part-roof', 'part-wall', 'part-window', 'part-door', 'roof-flat', 'roof-kawara']) expect(ids1, `① に ${id}`).toContain(id);
    for (const id of ['part-deco', 'roof-sankaku', 'roof-wara', 'roof-kin', 'wall-ki', 'windowKind-shoji']) expect(ids1, `① に ${id} は 出ない`).not.toContain(id);
    expect((await btnState(page, 'part-roof'))?.pressed, 'やねの ばしょ ✓').toBe(true);
    expect((await btnState(page, 'roof-flat'))?.pressed, 'たいら ✓').toBe(true);
    expect((await btnState(page, 'roof-kawara'))?.pressed, 'かわらは まだ えらんで いない').toBe(false);
    expect([...(await recipeEd(page)).marks].sort(), '「あたらしい！」の 印').toEqual(['part-roof', 'roof-kawara']);
    const marks = page.getByTestId('editor-new-mark').filter({ visible: true });
    await expect(marks, '印は 2 こ').toHaveCount(2);
    await expect(page.getByTestId('house-btn-roof-kawara').getByTestId('editor-new-mark'), '印は ボタンの 中').toBeVisible();
    await expect(page.getByTestId('house-btn-part-roof').getByTestId('editor-new-mark'), 'ばしょの ボタンにも 印').toBeVisible();
    const name0 = await plainText(page, 'editor-kind-name');
    expect(name0, '名前の 行（のせて いない 間は えらんで いる 物 ＝ たいら）').toBe('たいら');
    await page.getByTestId('house-btn-roof-kawara').hover();
    await stepUi(page, 2);
    const nameHover = await plainText(page, 'editor-kind-name');
    expect(nameHover, 'のせた ボタンの 名前に かわる（レシピの 名前。仕様 §4.1・§3.2）').toBe('かわらのやね');
    await page.screenshot({ path: `${SHOTS}/editor-soto-new.png` });

    // ---- 押すと 見本が かわる（AC9）
    await clickBtn(page, 'roof-kawara');
    const e1 = await recipeEd(page);
    expect(e1.roof, 'かわらの やね').toBe('kawara');
    expect(e1.marks, '印は 消える').toEqual([]);
    await expect(page.getByTestId('editor-new-mark').filter({ visible: true })).toHaveCount(0);
    expect(await recipes(page), 'fresh からは はずれ、learned には のこる').toMatchObject({ learned: ['roof_kawara'], fresh: [] });
    expect((await btnState(page, 'roof-kawara'))?.pressed, 'かわら ✓').toBe(true);
    expect((await btnState(page, 'roof-flat'))?.pressed, 'たいらの ✓ は はずれる').toBe(false);
    expect(e1.preview?.glow, '見本の やねが 光る').toMatchObject({ left: expect.any(Number) });
    expect(e1.preview!.glow!.parts, '光る 物').toEqual(['roof']);
    await page.mouse.move(0, 0);
    await stepUi(page, 2);
    expect(await plainText(page, 'editor-kind-name'), 'のせて いない 間は 最後に 押した しゅるい').toBe(nameHover);
    await page.screenshot({ path: `${SHOTS}/editor-soto-kawara.png` });
    await stepUi(page, 95);
    expect((await recipeEd(page)).preview?.glow, '90 コマで 消える').toBeNull();
    const rows = await needOf(page);
    expect(rows.find((r) => r.item === 'kawara')?.need, 'ひつような もの: かわら P（5×5 で 24）').toBe(24);
    expect((await ed(page)).canUndo, 'えらぶのは 1 回の 操作').toBe(true);

    // おぼえて いない 物は 出ない／ほかの ばしょの 印は ない
    await clickBtn(page, 'part-wall');
    expect(await editorBtnIds(page), 'かべは き だけ').toEqual(expect.arrayContaining(['wall-ki']));
    expect((await editorBtnIds(page)).filter((i) => i.startsWith('wall-'))).toEqual(['wall-ki']);
    await expect(page.getByTestId('editor-new-mark').filter({ visible: true })).toHaveCount(0);
    expect(await learn(page, 'roof_kawara'), 'もう おぼえた').toBe(false);
  });
});
