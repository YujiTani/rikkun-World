import { expect, test, type Page } from '@playwright/test';
import { countOf, menuState, openHouse, press, setBag, stepUi, talkTo } from './helpers/house';
import {
  MSG,
  NG_SAFE_NAMES,
  PREVIEW,
  SUFFIXES,
  angleGap,
  bandMarkIssues,
  blueprints,
  btn,
  cellKeys,
  changedCells,
  clickBtn,
  drawStats,
  ed,
  edit,
  editNoStep,
  editorMismatch,
  expectBubble,
  expectResumesAfter600,
  firstArchitect,
  glowTarget,
  handMarkIssues,
  handMarks,
  hover,
  injectDraftName,
  mouseDragPreview,
  norm360,
  openEditorFast,
  previewBox,
  previewDrag,
  previewOf,
  previewWheel,
  readButtons,
  reopenHouse,
  setForm,
  squash,
  turnedFrom,
  typeWords,
  visibleCount,
  type PreviewState,
} from './helpers/houseEditor';

/**
 * HOUSE-1B PR-2（#339。docs/design/HOUSE-1.md §2.5〜2.6・§4.9・§6.1、docs/tickets/HOUSE-1B.md の「PR-2」の 行と「2.4 で かわる テスト」の PR-2）の E2E。
 * 見本を 自分で まわす（ドラッグ・wheel・さわった 印・10 秒で また 回り出す）・窓と 戸の 光り・② の かべの 帯の 印・名前に よくない ことば。
 * E2E に 書くのは 画面・入力・描画が いる 確認と、数が 実際の 流れで 合うかの 確かめ（#311）。計算そのものの 細かい 組み合わせ（端・全部の 窓の 並べ方・表の 全部の ことば）は ユニット（developer）。
 * 通しの 中の 分（本物の マウスの ドラッグ → 押した まま 700 コマ 回らない → 600 コマで 回り出す・② の 帯の 印）は e2e/house1b.spec.ts の 通し 1 本。ここは その ほかを まとめる:
 *   1. ドラッグ・wheel の 計算（AC50）  2. また 回り出す（wait。AC50）  3. すすみの 行き来（AC50）  4. 本物の マウス・wheel（AC50・AC57）  5. DPR 2（AC50）
 *   6. 窓を かえる 光り（AC56・AC34 ③ の builds）  7. 手で 止めて いる 時の 光り（AC56）  8. ① に なった 戸の 光り（AC56）  9. hover（AC56・AC34 ③）  10. ② の かべの 帯の 印（AC56）
 *   11. よくない ことば（AC58）  12. 読みこんだ 作りかけに よくない ことば（AC58・AC44）  13. 動きを へらす 設定（AC50・AC56）
 * 時間（ms）では 合否を 決めない: 進めるのは step の 数。コマの 数え方は 窓口を 呼んだ その場から（step を 進めない 窓口: previewDrag・previewWheel・hover・editNoStep）。
 * 窓口・画面の 約束は e2e/helpers/house.ts の 先頭（「1B PR-2 の 約束」）。実装の 前は previewDrag などが 無いので 赤。
 */

/** 開いた ばかりの エディター（① そと・5×5）。最初の 建築士さんに 話して「せっけいずを つくる」 */
async function openFresh(page: Page): Promise<void> {
  await openHouse(page);
  await openEditorFast(page, (await firstArchitect(page)).id);
}

/** 窓口を 呼んだ その場（step なし）から n コマ たった ときの 見本を 読む 時計。前に すすめる だけ */
function clockFrom(page: Page): (n: number) => Promise<PreviewState> {
  let done = 0;
  return async (n: number) => {
    expect(n, '時計は もどせない').toBeGreaterThanOrEqual(done);
    await stepUi(page, n - done);
    done = n;
    return previewOf(page);
  };
}

const between = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

test.describe('HOUSE-1B PR-2 見本を まわす', () => {
  test('AC50: ドラッグ（previewDrag）と wheel（previewWheel）— 向きの 計算・端で 止まる・さわった 印・もどす に 入らない・ひつような もの の 間は まわせない', async ({ page }) => {
    test.setTimeout(150_000);
    await openFresh(page);

    /** 1 回 かけて、かける 前の 状態・かけた 直後の 状態を 返す（窓口の 返り値は 直後の { angle, pitch } と 同じ） */
    const apply = async (kind: 'drag' | 'wheel', dx: number, dy: number) => {
      const before = await previewOf(page);
      const ret = await (kind === 'drag' ? previewDrag : previewWheel)(page, dx, dy);
      const after = await previewOf(page);
      expect(ret, `${kind}(${dx}, ${dy}) の 返り値は 直後の { angle, pitch }`).toEqual({ angle: after.angle, pitch: after.pitch });
      return { before, after };
    };

    // ---- ① そと: さわる 前
    let p = await previewOf(page);
    expect(p, '① さわる 前').toMatchObject({ mode: 'outside', pitch: 26, touched: false, wait: null });
    await stepUi(page, 1);
    expect(await handMarks(page), '① さわる 前は 手の 印が 1 こ').toBe(1);
    expect(await handMarkIssues(page), '手の 印（見本の 右下・「くるっ」）').toEqual([]);
    expect((await ed(page)).canUndo, 'まだ なにも して いない').toBe(false);

    // ---- ドラッグ: よこ 1 px ＝ 0.5°（右へ で angle が へる・0 を こえたら 360 から）、たて 1 px ＝ 0.5°（下へ で pitch が ふえる）
    let r = await apply('drag', 100, 0);
    expect(r.after.angle, '右へ 100 px → angle が 50 へる').toBeCloseTo(norm360(r.before.angle - 50), 3);
    expect(r.after.angle, '28 − 50 は 0 を こえて 360 から（338 ぐらい）').toBeGreaterThan(300);
    expect(r.after.angle < 360, 'angle は 360 未満').toBe(true);
    expect(r.after.pitch, 'よこ だけ なら pitch は そのまま').toBe(r.before.pitch);
    expect(r.after, 'ドラッグ した あとは touched: true・wait: 600').toMatchObject({ touched: true, wait: PREVIEW.wait });
    r = await apply('drag', -100, 0);
    expect(r.after.angle, '左へ 100 px → angle が 50 ふえる').toBeCloseTo(norm360(r.before.angle + 50), 3);
    r = await apply('drag', 0, 40);
    expect(r.after.pitch, '下へ 40 px → pitch が 20 ふえる').toBeCloseTo(r.before.pitch + 20, 3);
    expect(r.after.angle, 'たて だけ なら angle は そのまま').toBe(r.before.angle);
    r = await apply('drag', 0, -20);
    expect(r.after.pitch, '上へ 20 px → pitch が 10 へる').toBeCloseTo(r.before.pitch - 10, 3);
    r = await apply('drag', 60, 20);
    expect(r.after.angle, 'ななめ: よこ').toBeCloseTo(norm360(r.before.angle - 30), 3);
    expect(r.after.pitch, 'ななめ: たて').toBeCloseTo(r.before.pitch + 10, 3);
    // 端で 止まる（そと 10〜80）。端を こえて 動かした 分は ためない（もどす 向きに 動かすと すぐ 動く）
    r = await apply('drag', 0, 1000);
    expect(r.after.pitch, 'そと: 下の 端 80').toBe(80);
    r = await apply('drag', 0, -1000);
    expect(r.after.pitch, 'そと: 上の 端 10').toBe(10);
    r = await apply('drag', 0, 20);
    expect(r.after.pitch, '端で 止まった あとは そこから 20 px ＝ 10 ふえる').toBeCloseTo(20, 3);
    // 0 ぴったり（360 に ならず 0）と、そこから 少し 右へ（359 ぐらい）
    r = await apply('drag', 2 * (await previewOf(page)).angle, 0);
    expect(r.after.angle, 'angle が ちょうど 0').toBeCloseTo(0, 3);
    r = await apply('drag', 4, 0);
    expect(r.after.angle, '0 から 右へ 4 px → 358').toBeCloseTo(358, 3);

    // ---- wheel: (deltaX ＋ deltaY) px を よこの ドラッグと 同じ 0.5°／px（＋ なら 右へ ドラッグと 同じ 向き）。pitch は かわらない
    for (const [dx, dy, deg] of [
      [100, 0, -50],
      [0, 100, -50],
      [40, 60, -50],
      [-100, 0, 50],
      [-60, 20, 20],
    ] as const) {
      const w = await apply('wheel', dx, dy);
      expect(turnedFrom(w.before.angle, w.after.angle), `wheel(${dx}, ${dy}) → angle が ${deg}°`).toBeCloseTo(norm360(deg), 3);
      expect(w.after.pitch, `wheel(${dx}, ${dy}): pitch は そのまま`).toBe(w.before.pitch);
      expect(w.after, `wheel(${dx}, ${dy}): touched: true・wait: 600`).toMatchObject({ touched: true, wait: PREVIEW.wait });
    }
    await stepUi(page, 1);
    expect(await handMarks(page), 'さわったら 手の 印は 0 こ').toBe(0);

    // ---- もどす／すすむ に 入らない・もどす／すすむ で angle・pitch は かわらない
    let e = await ed(page);
    expect({ canUndo: e.canUndo, canRedo: e.canRedo }, 'ドラッグ・wheel だけでは もどす の 記録は ふえない').toEqual({ canUndo: false, canRedo: false });
    expect(await edit(page, { op: 'size', w: 7, d: 5 }), '大きさ 7×5').toBe(true);
    await previewDrag(page, 30, 0);
    const dragged = await previewOf(page);
    expect(await edit(page, { op: 'undo' }), 'もどす').toBe(true);
    e = await ed(page);
    expect(e.size, 'もどす 1 回は 大きさの 操作を もどす（ドラッグは 記録に 入らない）').toEqual({ w: 5, d: 5 });
    let q = await previewOf(page);
    expect(q.angle, 'もどす で angle は かわらない').toBeCloseTo(dragged.angle, 3);
    expect(q.pitch, 'もどす で pitch は かわらない').toBeCloseTo(dragged.pitch, 3);
    expect(await edit(page, { op: 'redo' }), 'すすむ').toBe(true);
    q = await previewOf(page);
    expect(q.angle, 'すすむ で angle は かわらない').toBeCloseTo(dragged.angle, 3);
    expect(q.pitch, 'すすむ で pitch は かわらない').toBeCloseTo(dragged.pitch, 3);
    expect(q.touched, 'もどす／すすむ で touched は かわらない').toBe(true);

    // ---- 「ひつような もの」・確かめの まどが 出て いる 間は まわせない
    await press(page, 'need');
    expect((await menuState(page)).page, 'ひつような もの').toBe('need');
    let n0 = await previewOf(page);
    await previewDrag(page, 100, 40);
    await previewWheel(page, 100, 0);
    let n1 = await previewOf(page);
    expect({ angle: n1.angle, pitch: n1.pitch, touched: n1.touched, wait: n1.wait }, 'ひつような もの が 出て いる 間は まわせない').toEqual({ angle: n0.angle, pitch: n0.pitch, touched: n0.touched, wait: n0.wait });
    await press(page, 'needClose');
    await press(page, 'new');
    expect((await ed(page)).confirm, '確かめの まど（あたらしい せっけいず）').toBe('reset');
    n0 = await previewOf(page);
    await previewDrag(page, 100, 40);
    n1 = await previewOf(page);
    expect({ angle: n1.angle, pitch: n1.pitch, wait: n1.wait }, '確かめの まどが 出て いる 間は まわせない').toEqual({ angle: n0.angle, pitch: n0.pitch, wait: n0.wait });
    await press(page, 'no');
    expect((await ed(page)).confirm).toBeNull();

    // ---- ② なか: ① と べつ（① を まわしても ② は さわる 前）。pitch は なか 30〜80
    await press(page, 'next');
    p = await previewOf(page);
    expect(p, '② は さわる 前').toMatchObject({ mode: 'inside', pitch: 50, touched: false, wait: null });
    expect(p.angle >= 28 && p.angle < 28 + 3, '② は まえ ＋28° から').toBe(true);
    await stepUi(page, 1);
    expect(await handMarks(page), '② さわる 前は 手の 印が 1 こ').toBe(1);
    r = await apply('wheel', 100, 0); // wheel だけで さわった ことに なる
    expect(r.after.angle, '② wheel → angle が 50 へる').toBeCloseTo(norm360(r.before.angle - 50), 3);
    expect(r.after, '② wheel: pitch は そのまま・touched: true・wait: 600').toMatchObject({ pitch: 50, touched: true, wait: PREVIEW.wait });
    r = await apply('drag', 0, -1000);
    expect(r.after.pitch, 'なか: 上の 端 30').toBe(30);
    r = await apply('drag', 0, 1000);
    expect(r.after.pitch, 'なか: 下の 端 80').toBe(80);
    r = await apply('drag', 0, -20);
    expect(r.after.pitch, 'なか: 端から 上へ 20 px ＝ 10 へる').toBeCloseTo(70, 3);
    await stepUi(page, 1);
    expect(await handMarks(page), '② さわったら 手の 印は 0 こ').toBe(0);

    // ---- 見本を 押すと 置いた 家具の えらびは はずれる（AC57）
    expect(await edit(page, { op: 'place', kind: 'futon', x: 1, z: 1 }), 'ふとんを 置く').toBe(true);
    expect(await edit(page, { op: 'select', x: 1, z: 1 }), 'ふとんを えらぶ').toBe(true);
    expect((await ed(page)).selected, 'えらんだ').toEqual({ x: 1, z: 1 });
    await previewDrag(page, 10, 0);
    expect((await ed(page)).selected, '見本を 押すと 置いた 家具の えらびは はずれる').toBeNull();
  });

  test('AC50: また 回り出す（wait）— 599 コマ 止まる・600 コマ目から 回る・pitch そのまま・数えつづける・wheel で 600 から・また ドラッグすると 600 から', async ({ page }) => {
    test.setTimeout(180_000);
    await openFresh(page);
    const p0 = await previewOf(page);
    expect(p0, '① さわる 前').toMatchObject({ touched: false, wait: null });

    await previewDrag(page, 100, 40);
    const p1 = await previewOf(page);
    expect(p1, 'ドラッグ した 直後').toMatchObject({ touched: true, wait: PREVIEW.wait });
    expect(p1.pitch, 'pitch は ドラッグで 決めた 46').toBeCloseTo(p0.pitch + 20, 3);

    // はなして n コマ たつ 間は angle・pitch は かわらず、wait は 600 − n（大きさを かえても・見本 いがいの ボタンを 押しても 600 に もどらない）
    let n = 0;
    const holds = async (why: string) => {
      const p = await previewOf(page);
      expect(p.wait, `${why}: wait は ${PREVIEW.wait} − ${n}`).toBe(PREVIEW.wait - n);
      expect(p.angle, `${why}: angle は かわらない`).toBeCloseTo(p1.angle, 3);
      expect(p.pitch, `${why}: pitch は かわらない`).toBeCloseTo(p1.pitch, 3);
      expect(p.touched, `${why}: touched`).toBe(true);
    };
    await stepUi(page, 100);
    n = 100;
    await holds('100 コマ');
    expect(await edit(page, { op: 'size', w: 7, d: 5 }), '大きさ 7×5').toBe(true); // 1 コマ
    n += 1;
    await holds('大きさを かえても');
    await clickBtn(page, 'width-9'); // 見本 いがいの ボタン（2 コマ）
    n += 2;
    await holds('見本 いがいの ボタンを 押しても 600 に もどらない');
    await stepUi(page, PREVIEW.wait - 1 - n);
    n = PREVIEW.wait - 1;
    await holds('599 コマ');
    expect((await previewOf(page)).wait, '599 コマ すすめても wait 1').toBe(1);
    await stepUi(page, 1);
    const p2 = await previewOf(page);
    expect(p2.wait, '600 コマ目で wait が null').toBeNull();
    expect(p2.touched, 'また 回り出しても touched は true のまま').toBe(true);
    expect([0, PREVIEW.perFrame].some((v) => Math.abs(turnedFrom(p1.angle, p2.angle) - v) < 0.01), '600 コマ目の angle は そのまま か 0.3° まで').toBe(true);
    expect(p2.pitch, '回り出しても pitch は 46 の まま（26 には もどらない）').toBeCloseTo(p1.pitch, 3);
    await stepUi(page, 60);
    const p3 = await previewOf(page);
    expect(turnedFrom(p2.angle, p3.angle), '60 コマで 18°（1 コマ 0.3°）').toBeCloseTo(60 * PREVIEW.perFrame, 1);
    expect(p3.angle, '28 には もどらない（その 向きから 回る）').not.toBeCloseTo(28, 0);
    await stepUi(page, 1);
    expect(await handMarks(page), '回り出しても 手の 印は 0 こ').toBe(0);

    // 回り出した 後に また ドラッグすると 止まって wait 600 から
    const r = await previewDrag(page, -40, 0);
    const p4 = await previewOf(page);
    expect(p4, '回り出した 後の ドラッグ').toMatchObject({ touched: true, wait: PREVIEW.wait });
    expect(r.angle).toBeCloseTo(p4.angle, 3);
    await stepUi(page, 30);
    const p5 = await previewOf(page);
    expect(p5.angle, 'また 止まって いる').toBeCloseTo(p4.angle, 3);
    expect(p5.wait, '30 コマ たって wait 570').toBe(PREVIEW.wait - 30);

    // wheel は 1 回ごとに 600 から（まだ 数えて いる 途中でも）
    await stepUi(page, 270);
    expect((await previewOf(page)).wait, '300 コマ たった').toBe(PREVIEW.wait - 300);
    await previewWheel(page, 0, 60);
    const p6 = await previewOf(page);
    expect(p6, 'wheel で 600 に もどる').toMatchObject({ touched: true, wait: PREVIEW.wait });
    expect(turnedFrom(p5.angle, p6.angle), 'wheel(0, 60) → angle が 30 へる').toBeCloseTo(norm360(-30), 3);
    expect(p6.pitch, 'wheel は pitch を かえない').toBeCloseTo(p5.pitch, 3);
    // その まま 600 コマで また 回り出す（pitch は かわらない）
    await expectResumesAfter600(page, p6, 'wheel のあと');
  });

  test('AC50: すすみの 行き来 — touched・wait・angle は のこる・見えて いない すすみは へらない／すすまない・とじて 開くと はじめに もどる・① ② は べつ', async ({ page }) => {
    test.setTimeout(180_000);
    await openFresh(page);

    // ① で ドラッグ → 300 コマ → ② で 600 コマ → ① に もどると wait は 300 の まま
    await previewDrag(page, 100, 40);
    const a1 = await previewOf(page);
    await stepUi(page, 300);
    expect((await previewOf(page)).wait, '① で 300 コマ たった').toBe(PREVIEW.wait - 300);
    await press(page, 'next');
    let b = await previewOf(page);
    expect(b, '② は ① と べつ（さわって いない）').toMatchObject({ mode: 'inside', touched: false, wait: null });
    await stepUi(page, 1);
    expect(await handMarks(page), '② さわる 前は 手の 印が 1 こ（① を まわしても）').toBe(1);
    await stepUi(page, 600);
    await press(page, 'prev');
    let a = await previewOf(page);
    expect(a.mode, '① に もどった').toBe('outside');
    expect(a.touched, '① の touched は のこる').toBe(true);
    expect(a.angle, '① の angle は のこる').toBeCloseTo(a1.angle, 3);
    expect(a.pitch, '① の pitch は のこる').toBeCloseTo(a1.pitch, 3);
    expect(between(a.wait ?? -1, PREVIEW.wait - 300 - 4, PREVIEW.wait - 300), `① に もどると wait は 300 の まま（② の 600 コマで へらない）。今は ${a.wait}`).toBe(true);
    await stepUi(page, 1);
    expect(await handMarks(page), '① は さわった ので 手の 印は 0 こ').toBe(0);

    // ② で ドラッグ → ① で 700 コマ（② は 見えて いない ので へらない・すすまない。① は 回り出す）→ ② に もどる
    await press(page, 'next');
    await previewDrag(page, 0, -30);
    const b1 = await previewOf(page);
    expect(b1, '② ドラッグ').toMatchObject({ mode: 'inside', touched: true, wait: PREVIEW.wait });
    expect(b1.pitch, '② の pitch').toBeCloseTo(35, 3);
    await press(page, 'prev');
    a = await previewOf(page);
    const aWait = a.wait ?? 0;
    await stepUi(page, 700);
    a = await previewOf(page);
    expect(a.wait, '① は 700 コマの 間に wait が 0 に なって 回り出す').toBeNull();
    expect(between(turnedFrom(a1.angle, a.angle), (700 - aWait - 2) * PREVIEW.perFrame, (700 - aWait + 2) * PREVIEW.perFrame), `① は wait が なくなった あと 回りつづけた（${turnedFrom(a1.angle, a.angle).toFixed(1)}°）`).toBe(true);
    expect(a.pitch, '① は 回り出しても pitch は ドラッグで 決めた まま').toBeCloseTo(a1.pitch, 3);
    await press(page, 'next');
    b = await previewOf(page);
    expect(b.angle, '② の angle は ① の 間 すすまない').toBeCloseTo(b1.angle, 3);
    expect(b.pitch, '② の pitch').toBeCloseTo(b1.pitch, 3);
    expect(between(b.wait ?? -1, PREVIEW.wait - 6, PREVIEW.wait), `② の wait は ① の 700 コマで へらない。今は ${b.wait}`).toBe(true);

    // ③ では 見本が 出ない（preview: null）。③ の 700 コマで ② は へらない
    await press(page, 'next');
    expect((await ed(page)).preview, '③ では preview が null').toBeNull();
    await stepUi(page, 700);
    await press(page, 'prev');
    b = await previewOf(page);
    expect(b.angle, '③ の 間 ② の angle は すすまない').toBeCloseTo(b1.angle, 3);
    expect(between(b.wait ?? -1, PREVIEW.wait - 10, PREVIEW.wait), `③ の 間 ② の wait は へらない。今は ${b.wait}`).toBe(true);

    // もどす／すすむ では angle・pitch・touched は かわらない（形だけ もどる）
    expect(await edit(page, { op: 'place', kind: 'futon', x: 1, z: 1 }), 'ふとんを 置く').toBe(true);
    const c0 = await previewOf(page);
    expect(await edit(page, { op: 'undo' }), 'もどす').toBe(true);
    expect((await ed(page)).furniture, 'もどす で ふとんが 消える').toEqual([]);
    let c = await previewOf(page);
    expect(c.angle, 'もどす で angle は かわらない').toBeCloseTo(c0.angle, 3);
    expect(c.pitch, 'もどす で pitch は かわらない').toBeCloseTo(c0.pitch, 3);
    expect(c.touched, 'もどす で touched は かわらない').toBe(true);
    expect(await edit(page, { op: 'redo' }), 'すすむ').toBe(true);
    c = await previewOf(page);
    expect(c.angle, 'すすむ で angle は かわらない').toBeCloseTo(c0.angle, 3);
    expect(c.pitch, 'すすむ で pitch は かわらない').toBeCloseTo(c0.pitch, 3);

    // エディターを とじて 開くと ① ② とも はじめに もどる（作りかけの すすみ ＝ ② で 開く）
    await press(page, 'close');
    await openEditorFast(page, (await firstArchitect(page)).id);
    b = await previewOf(page);
    expect(b, 'とじて 開くと ② は はじめに もどる').toMatchObject({ mode: 'inside', touched: false, wait: null, pitch: 50 });
    expect(b.angle >= 28 && b.angle < 28 + 3, 'とじて 開くと ② は まえ ＋28° から').toBe(true);
    await stepUi(page, 1);
    expect(await handMarks(page), 'とじて 開くと 手の 印が また 出る（②）').toBe(1);
    await press(page, 'prev');
    a = await previewOf(page);
    expect(a, 'とじて 開くと ① も はじめに もどる').toMatchObject({ mode: 'outside', touched: false, wait: null, pitch: 26 });
    expect(a.angle >= 28 && a.angle < 28 + 3, 'とじて 開くと ① は まえ ＋28° から').toBe(true);
    await stepUi(page, 1);
    expect(await handMarks(page), 'とじて 開くと 手の 印が また 出る（①）').toBe(1);
  });

  test('AC50・AC57: 本物の マウス — 見本の 外へ 出ても はなすまで まわせる・はなした 所の ボタンは 押さない・本物の wheel・見本を 押すと 家具の えらびが はずれる', async ({ page }) => {
    test.setTimeout(150_000);
    await openFresh(page);
    const vp = page.viewportSize()!;

    // ---- ① ドラッグ: 見本の まん中で 押す → +100・+40 → 見本の 外（よこ）へ → 「つぎへ」の 上で はなす
    const box = await previewBox(page);
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    const before = await previewOf(page);
    await page.mouse.down();
    await page.mouse.move(start.x + 100, start.y + 40, { steps: 5 });
    await stepUi(page, 1);
    let held = await previewOf(page);
    expect(held.angle, '見本の 中で 右へ 100 px → angle が 50 へる').toBeCloseTo(norm360(before.angle - 50), 1);
    expect(held.pitch, '下へ 40 px → pitch が 20 ふえる').toBeCloseTo(before.pitch + 20, 1);
    expect(held, '押して いる 間も touched: true・wait: 600').toMatchObject({ touched: true, wait: PREVIEW.wait });
    const rightRoom = vp.width - (box.x + box.width);
    const outX = rightRoom >= box.x ? box.x + box.width + Math.min(40, rightRoom - 4) : box.x - Math.min(40, box.x - 4);
    expect(outX < box.x || outX > box.x + box.width, '見本の はこの 外').toBe(true);
    await page.mouse.move(outX, start.y + 40, { steps: 5 });
    held = await previewOf(page);
    expect(held.angle, 'ドラッグ中に 見本の 外へ 出ても はなすまで まわせる').toBeCloseTo(norm360(before.angle - 0.5 * (outX - start.x)), 1);
    const next = (await readButtons(page)).find((b) => b.id === 'next');
    expect(next?.enabled, '「つぎへ」が 押せる').toBe(true);
    const nx = next!.rect.x + next!.rect.w / 2;
    const ny = next!.rect.y + next!.rect.h / 2;
    await page.mouse.move(nx, ny, { steps: 5 });
    held = await previewOf(page);
    expect(held.angle, '「つぎへ」の 上まで 動かしても まわる').toBeCloseTo(norm360(before.angle - 0.5 * (nx - start.x)), 1);
    expect(held.pitch >= before.pitch + 20 && held.pitch <= 80, 'pitch は 下へ ふえて 80 まで').toBe(true);
    await page.mouse.up();
    await stepUi(page, 2);
    const e = await ed(page);
    expect(e.step, 'はなした 所に ある「つぎへ」は 押さない（① の まま）').toBe('soto');
    expect(e.preview, 'はなした あと').toMatchObject({ touched: true });
    expect((e.preview!.wait ?? 0) >= PREVIEW.wait - 2, 'はなした あとは wait 600 から').toBe(true);

    // ---- 本物の wheel（page.mouse.wheel）: (deltaX ＋ deltaY) px で angle が 0.5°／px・pitch は そのまま・wait は 600 から
    await page.mouse.move(start.x, start.y);
    await stepUi(page, 300);
    const w0 = await previewOf(page);
    expect(w0.wait, 'wheel の 前: wait が へって いる').toBeLessThan(PREVIEW.wait - 250);
    await page.mouse.wheel(40, 60);
    await expect.poll(async () => (await previewOf(page)).wait, 'wheel を うけると wait が 600 に もどる').toBe(PREVIEW.wait);
    const w1 = await previewOf(page);
    expect(turnedFrom(w0.angle, w1.angle), 'wheel(40, 60) → angle が 50 へる').toBeCloseTo(norm360(-50), 2);
    expect(w1.pitch, 'wheel は pitch を かえない').toBeCloseTo(w0.pitch, 3);

    // ---- ② なか: 置いた 家具を えらんで 見本を 押すと えらびが はずれる（AC57）
    await press(page, 'next');
    expect(await edit(page, { op: 'place', kind: 'futon', x: 1, z: 1 }), 'ふとんを 置く').toBe(true);
    expect(await edit(page, { op: 'select', x: 1, z: 1 }), 'ふとんを えらぶ').toBe(true);
    expect((await ed(page)).selected).toEqual({ x: 1, z: 1 });
    const box2 = await previewBox(page);
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await stepUi(page, 1);
    const e2 = await ed(page);
    expect(e2.selected, '見本を 押すと 置いた 家具の えらびは はずれる').toBeNull();
    expect(e2.furniture, '見本を 押しても 家具は ふえも へりも しない').toEqual([{ kind: 'futon', x: 1, z: 1, rot: 0 }]);
  });

  test.describe('devicePixelRatio 2', () => {
    test.use({ deviceScaleFactor: 2 });

    test('AC50: ドラッグの px は CSS px（devicePixelRatio に よらない）', async ({ page }) => {
      test.setTimeout(120_000);
      expect(await page.evaluate(() => devicePixelRatio), 'この テストは devicePixelRatio 2').toBe(2);
      await openFresh(page);
      const d = await mouseDragPreview(page, 100, 40, { hold: 5 });
      expect(d.held.angle, 'DPR 2 でも 右へ 100 CSS px で angle が 50 へる').toBeCloseTo(norm360(d.before.angle - 50), 1);
      expect(d.held.pitch, 'DPR 2 でも 下へ 40 CSS px で pitch が 20 ふえる').toBeCloseTo(d.before.pitch + 20, 1);
    });
  });
});

test.describe('HOUSE-1B PR-2 窓と 戸の 光り', () => {
  /**
   * 回って いる とき（さわる 前）に まどの かずを かえる（AC56・AC34 ③）: 30 コマで 135 か 225 の 近い ほう（pitch は そのまま）・光る マス ＝ かわった 窓・
   * left は 90 → 0 で glow: null・光り おわって から また 回り出す・builds は 形の 変化と 光りの 始まり（1〜2）・光りの 終わり（＋1）だけ ふえる。呼ぶ 前に 光りは 終わって いる こと。
   */
  async function untouchedWindowGlow(page: Page, delta: 1 | -1, why: string): Promise<{ want: string[] }> {
    const e0 = await ed(page);
    const p0 = await previewOf(page);
    expect(p0.glow, `${why}: はじめる 前は 光って いない`).toBeNull();
    expect(p0.wait, `${why}: さわって いない（回って いる）`).toBeNull();
    expect(await editNoStep(page, { op: 'windows', delta }), `${why}: まどの かず ${delta > 0 ? '＋1' : '−1'}`).toBe(true);
    const e1 = await ed(page);
    const want = changedCells(e0.windowCells, e1.windowCells);
    expect(want.length, `${why}: かわった 窓の マスが ある`).toBeGreaterThan(0);
    const target = glowTarget(p0.angle);
    const at = clockFrom(page);

    let p = await at(1);
    expect(p.glow, `${why}: 窓を かえると 光る`).not.toBeNull();
    expect(p.glow!.door, `${why}: 戸ではなく 窓`).toBe(false);
    expect(cellKeys(p.glow!.cells), `${why}: 光る マス ＝ かわった 窓の マス（ふえた 窓と なくなった 窓の あと）`).toEqual(want);
    expect(between(p.glow!.left ?? -1, PREVIEW.glow - 3, PREVIEW.glow), `${why}: 光りの のこりは 90 から。今は ${p.glow!.left}`).toBe(true);
    const started = p.builds;
    expect(between(started - p0.builds, 1, 2), `${why}: 形が かわった ことと 光りの 始まりで 作りなおす（1〜2 回。今は ${started - p0.builds}）`).toBe(true);
    p = await at(15);
    expect(angleGap(p.angle, target) < angleGap(p0.angle, target) - 1 && angleGap(p.angle, target) > 1, `${why}: 15 コマ目は ${target} へ 回る 途中（${p0.angle.toFixed(1)} → ${p.angle.toFixed(1)}）`).toBe(true);
    expect(p.pitch, `${why}: pitch は かわらない`).toBe(p0.pitch);
    p = await at(PREVIEW.turn + 2);
    expect(angleGap(p.angle, target), `${why}: 30 コマで ${target}`).toBeLessThan(0.01);
    expect(p.pitch, `${why}: pitch は かわらない`).toBe(p0.pitch);
    p = await at(60);
    expect(angleGap(p.angle, target), `${why}: 光って いる 間は その 向きで 止まる（さわる 前でも 光り おわるまで 回らない）`).toBeLessThan(0.01);
    expect(between(p.glow?.left ?? -1, PREVIEW.glow - 60 - 2, PREVIEW.glow - 60 + 2), `${why}: 60 コマ目の のこり。今は ${p.glow?.left}`).toBe(true);
    p = await at(85);
    expect(p.glow, `${why}: 85 コマ目は まだ 光って いる`).not.toBeNull();
    expect(p.builds, `${why}: 光って いる 間は 作りなおさない`).toBe(started);
    p = await at(100);
    expect(p.glow, `${why}: 光りが おわる（glow: null）`).toBeNull();
    expect(p.builds, `${why}: 光りの 終わりで 作りなおす（＋1）`).toBe(started + 1);
    expect(between(turnedFrom(target, p.angle), 0, 4), `${why}: 光り おわって から また 回り出す（${turnedFrom(target, p.angle).toFixed(1)}° 回った）`).toBe(true);
    p = await at(150);
    expect(between(turnedFrom(target, p.angle), 17, 18.8), `${why}: 光りが おわった 60 コマ後 ＝ 18° 回った（今は ${turnedFrom(target, p.angle).toFixed(1)}°）`).toBe(true);
    return { want };
  }

  test('AC56・AC34 ③: まどの かずを かえると 30 コマで 135／225 — 光る マス・left 90 → 0・光り おわって から また 回る・builds', async ({ page }) => {
    test.setTimeout(240_000);
    await openFresh(page);
    await stepUi(page, 100); // ① に なった 戸の 光りが おわる まで
    const e0 = await ed(page);
    expect(e0.size, '5×5').toEqual({ w: 5, d: 5 });

    const g1 = await untouchedWindowGlow(page, 1, '窓 0 → 1');
    expect(g1.want, '窓 0 → 1: うしろの まん中').toEqual(['back:2']);
    const g2 = await untouchedWindowGlow(page, 1, '窓 1 → 2');
    expect(g2.want, '5×5・窓 1 → 2 で うしろ 2 が なくなり ひだり 2・みぎ 2 が できる').toEqual(['back:2', 'left:2', 'right:2']);
    const g3 = await untouchedWindowGlow(page, -1, '窓 2 → 1');
    expect(g3.want, '窓 2 → 1: ひだり 2・みぎ 2 が なくなり うしろ 2 が できる').toEqual(['back:2', 'left:2', 'right:2']);

    // 600 コマ 回っても 作りなおさない（光りの あと）
    let p = await previewOf(page);
    const b = p.builds;
    await stepUi(page, 600);
    p = await previewOf(page);
    expect(p.builds, '光りの あと 600 コマ 回っても 作りなおさない').toBe(b);
    expect(p.glow).toBeNull();

    // 大きさを かえた ときは 回らず・光らない（家 ぜんたいが かわる）
    const a0 = p.angle;
    expect(await edit(page, { op: 'size', w: 7, d: 5 }), '大きさ 7×5').toBe(true);
    await stepUi(page, 29);
    p = await previewOf(page);
    expect(p.glow, '大きさを かえても 光らない').toBeNull();
    expect(turnedFrom(a0, p.angle), '大きさを かえても 窓を 見せに 回らない（1 コマ 0.3° の まま 30 コマ ＝ 9°）').toBeCloseTo(30 * PREVIEW.perFrame, 1);
  });

  test('AC56: 手で 止めて いる 時（wait が 数）は 光り おわっても その 向きの まま・wait は へりつづける・光りの 間に wait が 0 に なっても 回るのは 光り おわって から・同じ なら 135', async ({ page }) => {
    test.setTimeout(240_000);
    await openFresh(page);
    await setForm(page, { windows: 2 });
    await stepUi(page, 200);
    const stopAt = async (deg: number) => {
      const cur = (await previewOf(page)).angle;
      await previewDrag(page, 2 * (cur - deg), 0); // angle を deg に する（右へ 動かすと へる）
      const p = await previewOf(page);
      expect(p.angle, `手で ${deg}° に した`).toBeCloseTo(deg, 3);
      expect(p, '手で とめた').toMatchObject({ touched: true, wait: PREVIEW.wait, pitch: 26 });
      return p;
    };

    // ---- 止まって いる（wait 500）: 300° から 窓を ふやす → 225 へ 回って、光り おわっても そのまま。wait は 600 に もどらず へりつづけ、0 で また 回る
    await stopAt(300);
    await stepUi(page, 100);
    expect((await previewOf(page)).wait, '100 コマ たった').toBe(PREVIEW.wait - 100);
    expect(glowTarget(300), '300° からは 225 の ほうが 近い').toBe(225);
    expect(await editNoStep(page, { op: 'windows', delta: 1 }), '窓を ふやす').toBe(true);
    let at = clockFrom(page);
    let p = await at(15);
    expect(p.pitch, '回る 途中も pitch は かわらない').toBe(26);
    expect(angleGap(p.angle, 225) < angleGap(300, 225) - 1 && angleGap(p.angle, 225) > 1, '15 コマ目は 225 へ 回る 途中').toBe(true);
    p = await at(PREVIEW.turn + 2);
    expect(angleGap(p.angle, 225), '30 コマで 225').toBeLessThan(0.01);
    expect(p.pitch, 'pitch は そのまま').toBe(26);
    expect(p.wait, '光って いる 間も wait は へる（600 に もどらない）').toBe(PREVIEW.wait - 100 - 32);
    p = await at(100);
    expect(p.glow, '光りが おわった').toBeNull();
    expect(angleGap(p.angle, 225), '止まって いる 時は 光り おわっても その 向きの まま').toBeLessThan(0.01);
    expect(p, '手で 止めた まま').toMatchObject({ touched: true, wait: PREVIEW.wait - 200 });
    await stepUi(page, PREVIEW.wait - 200);
    p = await previewOf(page);
    expect(p.wait, '手で 止めてから 600 コマで wait null').toBeNull();
    const t0 = p.angle;
    await stepUi(page, 60);
    expect(turnedFrom(t0, (await previewOf(page)).angle), 'そこから また 回る（その 向きから 18°）').toBeCloseTo(18, 1);

    // ---- 光って いる 間に wait が 0 に なる: 回り出すのは 光りが おわって から
    await previewDrag(page, 40, 0);
    await stepUi(page, 560);
    const o = await previewOf(page);
    expect(o.wait, 'あと 40 コマ').toBe(40);
    const target = glowTarget(o.angle);
    expect(await editNoStep(page, { op: 'windows', delta: 1 }), '窓を ふやす').toBe(true);
    at = clockFrom(page);
    p = await at(PREVIEW.turn + 2);
    expect(angleGap(p.angle, target), '30 コマで 行き先').toBeLessThan(0.01);
    expect(p.wait, '光って いる 間も wait は へる').toBe(40 - 32);
    p = await at(60);
    expect(p.wait, 'wait は 0 に なった').toBeNull();
    expect(p.glow, 'まだ 光って いる').not.toBeNull();
    expect(angleGap(p.angle, target), 'wait が null でも 光って いる 間は まだ 回らない').toBeLessThan(0.01);
    p = await at(85);
    expect(angleGap(p.angle, target), '光りの 終わりぎわまで 回らない').toBeLessThan(0.01);
    p = await at(100);
    expect(p.glow, '光りが おわった').toBeNull();
    expect(between(turnedFrom(target, p.angle), 0, 4), `光りが おわって から 回り出す（${turnedFrom(target, p.angle).toFixed(1)}°）`).toBe(true);
    p = await at(150);
    expect(between(turnedFrom(target, p.angle), 17, 18.8), `光りが おわった 60 コマ後 ＝ 18°（今は ${turnedFrom(target, p.angle).toFixed(1)}°）`).toBe(true);

    // ---- 同じ きょりなら 135（今の 向きが ちょうど 180°）
    await stopAt(180);
    expect(glowTarget(180), '180° は どちらも 同じ ちかさ').toBe(135);
    expect(await editNoStep(page, { op: 'windows', delta: -1 }), '窓を へらす').toBe(true);
    at = clockFrom(page);
    p = await at(PREVIEW.turn + 2);
    expect(angleGap(p.angle, 135), '180° からは 同じ ちかさ なので 135（みぎ）').toBeLessThan(0.01);
    expect(angleGap(p.angle, 225) > 80, '225 では ない').toBe(true);
  });

  test('AC56: ① に なると 戸が 光る（90 コマ）— 回って いる 時は その 間も 回る・止まって いる 時は その 向きの まま・まえへ もどっても', async ({ page }) => {
    test.setTimeout(150_000);
    await openFresh(page);
    let p = await previewOf(page);
    expect(p.glow, '① を 開くと 戸が 光る').toMatchObject({ door: true, cells: [] });
    expect(between(p.glow!.left ?? -1, PREVIEW.glow - 8, PREVIEW.glow), `光りの のこりは 90 から。今は ${p.glow!.left}`).toBe(true);
    const a0 = p.angle;
    const bGlow = p.builds;
    await stepUi(page, 30);
    p = await previewOf(page);
    expect(p.glow?.door, '30 コマ後も 戸が 光って いる').toBe(true);
    expect(turnedFrom(a0, p.angle), '戸が 光って いる 間も 回る（1 コマ 0.3° ＝ 30 コマで 9°）').toBeCloseTo(30 * PREVIEW.perFrame, 1);
    expect(p.builds, '光って いる 間は 作りなおさない').toBe(bGlow);
    await stepUi(page, 100);
    p = await previewOf(page);
    expect(p.glow, '光りが おわる').toBeNull();
    expect(p.builds, '光りの 終わりで 作りなおす（＋1）').toBe(bGlow + 1);
    const bEnd = p.builds;
    await stepUi(page, 600);
    expect((await previewOf(page)).builds, '光りの あと 600 コマ 回っても 作りなおさない').toBe(bEnd);

    // ② から もどる（まえへ）と また 戸が 光る。回って いる 間は 回りつづける
    await press(page, 'next');
    await press(page, 'prev');
    p = await previewOf(page);
    expect(p.glow, '② から もどると 戸が 光る').toMatchObject({ door: true, cells: [] });
    expect(between(p.glow!.left ?? -1, PREVIEW.glow - 8, PREVIEW.glow), `光りの のこりは 90 から。今は ${p.glow!.left}`).toBe(true);
    const a1 = p.angle;
    await stepUi(page, 30);
    expect(turnedFrom(a1, (await previewOf(page)).angle), '② から もどった 戸の 光りの 間も 回る').toBeCloseTo(30 * PREVIEW.perFrame, 1);

    // 手で 止めて いる 時: ② から もどって 戸が 光って いる 間も その 向きの まま
    await stepUi(page, 100);
    await previewDrag(page, 100, 40);
    const s = await previewOf(page);
    await press(page, 'next');
    await press(page, 'prev');
    p = await previewOf(page);
    expect(p.glow, '止めて いても ① に もどると 戸が 光る').toMatchObject({ door: true });
    expect(p.touched, '止めて いる').toBe(true);
    await stepUi(page, 80);
    p = await previewOf(page);
    expect(p.glow?.door, '80 コマ後も 光って いる').toBe(true);
    expect(p.angle, '止まって いる 時は 戸が 光って いる 間も その 向きの まま').toBeCloseTo(s.angle, 3);
    expect(p.pitch, 'pitch も そのまま').toBeCloseTo(s.pitch, 3);
  });

  test('AC56・AC34 ③: ボタンに のせる（hover）と 窓が ぜんぶ 光る — 回らない・left は null・はなすと 消える・builds は のせた 直後の 1 回 だけ・光って いる 間も 描画回数 24 以下', async ({ page }) => {
    test.setTimeout(240_000);
    const MAX_CALLS = 24;
    await openFresh(page);
    await setForm(page, { w: 9, d: 9 });
    const max = (await ed(page)).windowMax;
    await setForm(page, { windows: max - 1 }); // ふやす も へらす も 押せる
    await stepUi(page, 200);
    let p = await previewOf(page);
    expect(p.glow, '光りは おわった').toBeNull();
    const cells = cellKeys((await ed(page)).windowCells);
    expect(cells.length, '窓の マス ＝ まどの かず').toBe(max - 1);

    // ---- のせる: 窓 ぜんぶ・left null・回らない（窓を 見せに 回らない）
    const b0 = p.builds;
    const a0 = p.angle;
    await hover(page, 'windowsUp');
    await stepUi(page, 1);
    p = await previewOf(page);
    expect(p.glow, 'windowsUp に のせると 窓が ぜんぶ 光る').toMatchObject({ door: false, left: null });
    expect(cellKeys(p.glow!.cells), '光る マス ＝ 窓 ぜんぶ').toEqual(cells);
    expect(between(p.builds - b0, 0, 1), `のせた 直後の 1 回 だけ 作りなおす（今は ${p.builds - b0}）`).toBe(true);
    const draw = await drawStats(page);
    expect(draw.calls, `のせて 光らせて いる コマの 描画回数（9×9・窓 ${max - 1}）は 24 以下`).toBeLessThanOrEqual(MAX_CALLS);
    expect(draw.calls, '見本を 描いた').toBeGreaterThan(0);
    const b1 = p.builds;
    await stepUi(page, 30);
    p = await previewOf(page);
    expect(turnedFrom(a0, p.angle) <= 31 * PREVIEW.perFrame + 0.01, `のせても 135／225 へは 回らない（${turnedFrom(a0, p.angle).toFixed(1)}° しか 動いて いない）`).toBe(true);
    expect(p.glow, 'のせて いる 間は ずっと 光る（left は null の まま）').toMatchObject({ left: null });
    await stepUi(page, 570);
    p = await previewOf(page);
    expect(p.glow, '600 コマ のせた まま').not.toBeNull();
    expect(p.builds, 'のせた まま 600 コマで 作りなおさない').toBe(b1);

    // ---- はなす: 消える。builds は 光りの 終わりで 0〜1。そのあと 600 コマ ふえない
    await hover(page, null);
    await stepUi(page, 1);
    p = await previewOf(page);
    expect(p.glow, 'はなすと 光りが 消える').toBeNull();
    expect(between(p.builds - b1, 0, 1), `はなした 直後の 作りなおしは 0〜1 回（今は ${p.builds - b1}）`).toBe(true);
    const b2 = p.builds;
    await stepUi(page, 600);
    expect((await previewOf(page)).builds, 'はなした あと 600 コマで 作りなおさない').toBe(b2);

    // ---- 光る ボタンは windowsDown・windowsUp・windowKind だけ
    for (const id of ['windowsDown', 'windowKind-shoji']) {
      await hover(page, id);
      await stepUi(page, 1);
      p = await previewOf(page);
      expect(p.glow, `${id} に のせると 窓が ぜんぶ 光る`).toMatchObject({ door: false, left: null });
      expect(cellKeys(p.glow!.cells), `${id}: 光る マス`).toEqual(cells);
      await hover(page, null);
      await stepUi(page, 2);
      expect((await previewOf(page)).glow, `${id}: はなすと 消える`).toBeNull();
    }
    for (const id of ['next', 'width-7', 'depth-9', 'roof-flat', 'undo']) {
      await hover(page, id);
      await stepUi(page, 2);
      expect((await previewOf(page)).glow, `${id} に のせても 光らない`).toBeNull();
      await hover(page, null);
    }

    // ---- 本物の マウスで のせても 同じ
    await btn(page, 'windowsDown').hover();
    await stepUi(page, 2);
    p = await previewOf(page);
    expect(p.glow, '本物の マウスで windowsDown に のせる').toMatchObject({ door: false, left: null });
    expect(cellKeys(p.glow!.cells), '光る マス ＝ 窓 ぜんぶ').toEqual(cells);
    await page.mouse.move(0, 0);
    await stepUi(page, 2);
    expect((await previewOf(page)).glow, '本物の マウスを はなすと 消える').toBeNull();

    // ---- 手で 止めて いる 時: のせても angle は そのまま
    await previewDrag(page, 2 * ((await previewOf(page)).angle - 20), 0); // 135／225 から とおい 20° に 止める
    const s = await previewOf(page);
    expect(s.angle).toBeCloseTo(20, 3);
    await hover(page, 'windowsUp');
    await stepUi(page, 60);
    p = await previewOf(page);
    expect(p.angle, '止まって いる 時に のせても angle は かわらない（135／225 へ 回らない）').toBeCloseTo(20, 3);
    expect(p.glow, '光って いる').not.toBeNull();
    await hover(page, null);
    await stepUi(page, 2);

    // ---- 描画回数: いちばん 多い 形（9×9・窓 上限）で 窓を ふやした 光り・ぜんぶ 光る・戸の 光り（どれも 24 以下）
    expect(await edit(page, { op: 'windows', delta: 1 }), '窓 上限').toBe(true);
    expect((await ed(page)).windows).toBe(max);
    const g1 = await drawStats(page);
    expect(g1.calls, `窓を ふやした 光りの コマ（9×9・窓 ${max}）の 描画回数は 24 以下`).toBeLessThanOrEqual(MAX_CALLS);
    await stepUi(page, 45);
    const g2 = await drawStats(page);
    expect(g2.calls, '光って いる 途中（窓 上限）の 描画回数は 24 以下').toBeLessThanOrEqual(MAX_CALLS);
    expect(g2.calls).toBeGreaterThan(0);
    await stepUi(page, 100);
    await hover(page, 'windowsDown');
    await stepUi(page, 1);
    expect((await previewOf(page)).glow?.cells.length, '窓 ぜんぶ（上限）が 光る').toBe(max);
    const g3 = await drawStats(page);
    expect(g3.calls, `窓 ${max} こ ぜんぶ 光る コマの 描画回数は 24 以下`).toBeLessThanOrEqual(MAX_CALLS);
    await hover(page, null);
    await press(page, 'close');
    await openEditorFast(page, (await firstArchitect(page)).id);
    expect((await previewOf(page)).glow?.door, '開き なおすと 戸が 光る').toBe(true);
    const g4 = await drawStats(page);
    expect(g4.calls, '戸が 光って いる コマ（9×9・窓 上限）の 描画回数は 24 以下').toBeLessThanOrEqual(MAX_CALLS);
    expect(g4.calls).toBeGreaterThan(0);
  });

  test('AC56: ② の 方眼の かべの 帯に 窓の 印（まどの かず こ・windowCells の 場所）と 戸の 印（まえの まん中に 1 こ）— 5×5・9×9 の 窓 0 と 上限', async ({ page }) => {
    test.setTimeout(150_000);
    await openFresh(page);
    await press(page, 'next');
    expect((await ed(page)).step).toBe('naka');
    for (const side of [5, 9]) {
      if ((await ed(page)).size.w !== side || (await ed(page)).size.d !== side) expect(await edit(page, { op: 'size', w: side, d: side }), `大きさ ${side}×${side}`).toBe(true);
      const max = (await ed(page)).windowMax;
      for (const windows of [0, max]) {
        await setForm(page, { windows });
        await stepUi(page, 2);
        expect((await ed(page)).windows, `${side}×${side}: まどの かず ${windows}`).toBe(windows);
        expect(await bandMarkIssues(page), `${side}×${side}・窓 ${windows}: 帯の 印`).toEqual([]);
        expect(await visibleCount(page, 'editor-mark-window'), `${side}×${side}・窓 ${windows}: 窓の 印の 数`).toBe(windows);
        expect(await visibleCount(page, 'editor-mark-door'), `${side}×${side}・窓 ${windows}: 戸の 印は 1 こ`).toBe(1);
      }
    }
    // 家具を 置いても・ふきだしが 出ても 帯の 印は のこる
    expect(await edit(page, { op: 'place', kind: 'futon', x: 1, z: 1 }), 'ふとん').toBe(true);
    await stepUi(page, 2);
    expect(await bandMarkIssues(page), '家具を 置いても 帯の 印は のこる').toEqual([]);
  });
});

test.describe('HOUSE-1B PR-2 よくない ことば', () => {
  /** 止まる 名前（ngwords.md 1 章の ことば）を 1 字ずつ 入れて、入らなかった 所（最後の 1 字）。front ＝ 入った ところまでの 前の 文字 */
  const BLOCKED: { why: string; word: string; front: string }[] = [
    { why: '「し」の あとに「ね」', word: 'しね', front: 'し' },
    { why: 'カタカナ「シ」の あとに「ネ」（そろえると「しね」）', word: 'シネ', front: 'シ' },
    { why: '「しー」の あとに「ね」（ー は とって そろえる）', word: 'しーね', front: 'しー' },
    { why: '「でふ」に ゛ で「でぶ」に なる とき（゛ ゜ は つけた あとで しらべる）', word: 'でぶ', front: 'でふ' },
    { why: '「ぶっころ」', word: 'ぶっころ', front: 'ぶっこ' },
    { why: '大きい つの「ぶつころ」も「ぶっころ」と 同じ', word: 'ぶつころ', front: 'ぶつこ' },
    { why: '「ちびっこ」から はみ出して つながる「ころす」', word: 'ちびっころす', front: 'ちびっころ' },
    { why: '名前の まん中でも（あしね ＝ 「しね」が 入る）', word: 'あしね', front: 'あし' },
  ];

  test('AC58: 名前に よくない ことばは 入れられない — 止まらない 名前 29 こ・止める ことば（フック）と マウス・ふきだし・もどす に 入らない', async ({ page }) => {
    test.setTimeout(240_000);
    expect(NG_SAFE_NAMES.length, 'ngwords.md 4 章の 名前の 例 29 こを うつした').toBe(29);
    await openFresh(page);
    await press(page, 'next');
    await press(page, 'next');
    expect((await ed(page)).step, '③ なまえ').toBe('namae');

    // ---- 止まらない 名前（29 こ ＋ 「てふ」「はか」）: 1 字ずつ 入れて どこでも 止まらない・ふきだしも 出ない
    const safe = await typeWords(page, [...NG_SAFE_NAMES, 'てふ', 'はか']);
    const safeIssues: string[] = [];
    for (const r of safe) {
      const bad = r.steps.filter((s) => !s.ok || s.bubble.trim() !== '');
      if (bad.length > 0) safeIssues.push(`「${r.word}」: ${bad.map((s) => `${s.ch}${s.ok ? '' : '（入らない）'}${s.bubble.trim() ? `「${s.bubble.trim()}」` : ''}`).join('・')}`);
      if (r.front !== r.word) safeIssues.push(`「${r.word}」: 入った 名前が「${r.front}」`);
    }
    expect(safeIssues, '止まらない 名前（ふつうの なまえ）は ぜんぶ 入る').toEqual([]);

    // ---- 止める ことば: false・名前は 入った ところまで・ふきだし・もどす の 記録は かわらない
    const blocked = await typeWords(
      page,
      BLOCKED.map((c) => c.word),
    );
    const blockedIssues: string[] = [];
    blocked.forEach((r, i) => {
      const c = BLOCKED[i]!;
      const last = r.steps[r.steps.length - 1]!;
      const early = r.steps.slice(0, -1).filter((s) => !s.ok);
      if (early.length > 0) blockedIssues.push(`${c.why}: 最後の 前で 止まった（${early.map((s) => s.ch).join('')}）`);
      if (last.ok) blockedIssues.push(`${c.why}: 「${c.word}」が 入ってしまった`);
      if (squash(last.bubble) !== squash(MSG.ngWord)) blockedIssues.push(`${c.why}: ふきだしが「${last.bubble.trim()}」`);
      if (last.canUndoBefore !== last.canUndoAfter) blockedIssues.push(`${c.why}: 止まった のに canUndo が かわった`);
      if (r.front !== c.front) blockedIssues.push(`${c.why}: 名前が「${r.front}」（「${c.front}」の まま の はず）`);
    });
    expect(blockedIssues, '止める ことばは 入れられない').toEqual([]);

    // ---- もどす の 記録に 入らない: 止まった 操作は 1 回に 数えない（1 字 入れる → 止まる → もどす 1 回で 空に もどる）
    expect(await edit(page, { op: 'char', ch: 'し' })).toBe(true);
    expect(await edit(page, { op: 'char', ch: 'ね' }), 'しね').toBe(false);
    expect(await edit(page, { op: 'undo' }), 'もどす').toBe(true);
    expect((await ed(page)).name.front, '止まった 操作は もどす の 1 回に 入らない（もどす 1 回で「し」が 消える）').toBe('');

    // ---- マウスでも: 「し」「ね」を 押す → 入らない・ふきだし（画面）・次に 押すと 消える
    await clickBtn(page, 'char-し');
    expect((await ed(page)).name.front).toBe('し');
    const undo0 = (await ed(page)).canUndo;
    await clickBtn(page, 'char-ね');
    let e = await ed(page);
    expect(e.name.front, '「し」の あとに「ね」は 入らない').toBe('し');
    expect(e.canUndo, 'もどす の 記録は かわらない').toBe(undo0);
    await expectBubble(page, MSG.ngWord, 'よくない ことば（マウス）');
    expect(await editorMismatch(page), '画面と menu() の ちがい（ふきだし）').toEqual([]);
    await clickBtn(page, 'char-あ');
    expect((await menuState(page)).bubble.trim(), '次に どこかを 押すと ふきだしは すぐ 消える').toBe('');
    expect((await ed(page)).name.front, '「あ」は 入る').toBe('しあ');
    await clickBtn(page, 'erase');
    await clickBtn(page, 'erase');
    // 「でふ」→ ゛ で「でぶ」: 押しても 変わらない
    await clickBtn(page, 'char-て');
    await clickBtn(page, 'dakuten');
    await clickBtn(page, 'char-ふ');
    expect((await ed(page)).name.front).toBe('でふ');
    await clickBtn(page, 'dakuten');
    e = await ed(page);
    expect(e.name.front, '゛ で「でぶ」に なる とき は 押しても「でふ」の まま').toBe('でふ');
    await expectBubble(page, MSG.ngWord, 'よくない ことば（゛）');
    // カタカナ: 「シ」「ネ」
    await clickBtn(page, 'erase');
    await clickBtn(page, 'erase');
    await clickBtn(page, 'katakana');
    await clickBtn(page, 'char-し');
    await clickBtn(page, 'char-ね');
    expect((await ed(page)).name.front, 'カタカナの「シ」の あとに「ネ」も 入らない').toBe('シ');
    await expectBubble(page, MSG.ngWord, 'よくない ことば（カタカナ）');
    expect((await ed(page)).name.back, '後ろの 文字は かわらない').toBe(SUFFIXES[0]);
  });

  test('AC58・AC44: 読みこんだ 作りかけに よくない ことばが ある — すすみに よらず ③ で 開いて 同じ ふきだし・できた！も 止まる・erase 1 回で なくなるまで けす', async ({ page }) => {
    test.setTimeout(240_000);
    await openHouse(page, '?seed=7'); // ?nosave=1 を つけない（保存する 世界）
    await openEditorFast(page, (await firstArchitect(page)).id);
    await setForm(page, {
      furniture: [
        { kind: 'futon', x: 0, z: 0 },
        { kind: 'chair', x: 2, z: 0 },
      ],
      front: 'あ',
      back: SUFFIXES[0],
    });
    await setBag(page, { paper: 2, fude: 1 });
    await press(page, 'close');
    // 保存の 作りかけの 前の 文字を「しねこ」に・すすみを ① に かきかえて 読みこみなおす
    await injectDraftName(page, 'しねこ');
    await reopenHouse(page);
    await talkTo(page, (await firstArchitect(page)).id, 'hook');
    const m = await press(page, 'editor');
    expect(m, 'せっけいずを つくる').toMatchObject({ open: true, page: 'editor' });
    let e = await ed(page);
    expect(e.step, 'よくない ことばが ある 作りかけは ① で 保存して あっても ③ なまえ で 開く').toBe('namae');
    expect(e.name.front, '名前は 保存の まま').toBe('しねこ');
    await expectBubble(page, MSG.ngWord, '③ で 開いた とき');

    // ---- できた！も 止まる（③ の まま・かみ・ふで・せっけいずは かわらない）
    const bag0 = { paper: await countOf(page, 'paper'), fude: await countOf(page, 'fude') };
    expect(bag0, '保存した 持ち物').toEqual({ paper: 2, fude: 1 });
    await press(page, 'done');
    e = await ed(page);
    expect(e.step, 'できた！でも 止まる（③ の まま）').toBe('namae');
    await expectBubble(page, MSG.ngWord, 'できた！で 止まった');
    expect(await blueprints(page), 'せっけいずは ふえない').toEqual([]);
    expect({ paper: await countOf(page, 'paper'), fude: await countOf(page, 'fude') }, 'かみ・ふでは かわらない').toEqual(bag0);

    // ---- erase は 止まらない: 1 回で よくない ことばが なくなるまで けす（「しねこ」→「し」）
    expect(await edit(page, { op: 'erase' }), 'erase').toBe(true);
    expect((await ed(page)).name.front, '1 回の erase で なくなるまで けす（「しねこ」→「し」）').toBe('し');
    await press(page, 'done');
    expect(await blueprints(page), 'よくない ことばが なければ できる').toHaveLength(1);
  });
});

test.describe('HOUSE-1B PR-2 動きを へらす 設定', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('AC50・AC56: 回らず（angle 28）手の 印は 出る・ドラッグは できて 回り出さない（wait null）・窓を かえると 回る 途中なしで すぐ 135／225（光りは 同じ 長さ）', async ({ page }) => {
    test.setTimeout(150_000);
    await openFresh(page);
    let p = await previewOf(page);
    expect(p, '① さわる 前').toMatchObject({ mode: 'outside', pitch: 26, touched: false, wait: null });
    expect(p.angle, '動きを へらす 設定では まえ ＋28° で 止まる').toBeCloseTo(28, 5);
    expect(p.glow, '戸の 光りは 同じ').toMatchObject({ door: true });
    await stepUi(page, 1);
    expect(await handMarks(page), '動きを へらす 設定でも 手の 印は 出る').toBe(1);
    expect(await handMarkIssues(page), '手の 印').toEqual([]);
    await stepUi(page, 100);
    expect((await previewOf(page)).angle, '戸が 光っても 回らない').toBeCloseTo(28, 5);

    // 窓を かえる: 回る 途中を 出さず 1 コマ目で 135（光りは 90 コマ・おわっても その まま）
    const e0 = await ed(page);
    expect(await editNoStep(page, { op: 'windows', delta: 1 }), '窓を ふやす').toBe(true);
    const want = changedCells(e0.windowCells, (await ed(page)).windowCells);
    const at = clockFrom(page);
    p = await at(1);
    expect(angleGap(p.angle, 135), '1 コマ目で 135（回る 途中が ない）').toBeLessThan(0.01);
    expect(p.pitch, 'pitch は かわらない').toBe(26);
    expect(p.glow, '光りは 同じ 長さ').toMatchObject({ door: false });
    expect(cellKeys(p.glow!.cells), '光る マス').toEqual(want);
    expect(between(p.glow!.left ?? -1, PREVIEW.glow - 3, PREVIEW.glow), `光りの のこりは 90 から。今は ${p.glow!.left}`).toBe(true);
    p = await at(60);
    expect(p.glow, '60 コマ目も 光って いる').not.toBeNull();
    p = await at(100);
    expect(p.glow, '光りが おわる').toBeNull();
    expect(angleGap(p.angle, 135), '光り おわっても その まま（回らない）').toBeLessThan(0.01);
    p = await at(700);
    expect(angleGap(p.angle, 135), '600 コマ たっても 回らない').toBeLessThan(0.01);

    // ドラッグは できる（フック・本物の マウス）。はなした あとも wait は null で 回り出さない
    const r = await previewDrag(page, 100, 40);
    p = await previewOf(page);
    expect(p, 'ドラッグ した').toMatchObject({ touched: true, wait: null });
    expect(r.angle).toBeCloseTo(p.angle, 3);
    expect(p.angle, '135 から 右へ 100 px ＝ 85').toBeCloseTo(85, 3);
    expect(p.pitch, '下へ 40 px ＝ 46').toBeCloseTo(46, 3);
    await stepUi(page, 1000);
    const q = await previewOf(page);
    expect(q.angle, 'ドラッグ した あとも 回り出さない').toBeCloseTo(85, 3);
    expect(q.wait, 'wait は null の まま').toBeNull();
    expect(await handMarks(page), 'さわったら 手の 印は 0 こ').toBe(0);
    const d = await mouseDragPreview(page, -100, 0, { hold: 10 });
    expect(d.held.angle, '本物の マウスでも ドラッグ できる（左へ 100 px ＝ 50 ふえる）').toBeCloseTo(norm360(d.before.angle + 50), 1);
    expect(d.after, 'はなした あとも wait は null').toMatchObject({ touched: true, wait: null });
    await stepUi(page, 700);
    expect((await previewOf(page)).angle, '本物の マウスの あとも 回り出さない').toBeCloseTo(d.after.angle, 3);

    // ② も 同じ: 手の 印が 出る・回らない
    await press(page, 'next');
    p = await previewOf(page);
    expect(p, '② さわる 前').toMatchObject({ mode: 'inside', pitch: 50, touched: false, wait: null });
    expect(p.angle, '② も まえ ＋28° で 止まる').toBeCloseTo(28, 5);
    await stepUi(page, 1);
    expect(await handMarks(page), '② でも 手の 印は 出る').toBe(1);
  });
});
