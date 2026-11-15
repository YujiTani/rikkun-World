import { expect, test, type Page } from '@playwright/test';
import { findEdgeSpot, openTown, place1P, place2P, townInfo, type P3, type TownInfo } from './helpers/town';
import { countOf, damaOf, hpOf, shopCall, shopState, shopStand, stepN, talkByClick1P, talkByPad2P, tid, type Who } from './helpers/shop';
import { setFakePad } from './helpers/duoUi';

/**
 * TOWN-1 区切り 1C（よろずやの 画面と たからばこ。docs/design/TOWN-1-shop.md §2.6・§2.7・§3.2・§4.2・§4.3、AC13・AC16・AC19・AC20）。実装の 前に 書いた 赤の テスト。
 * 画面の ならべ方（左に 一覧＋右に 大きな 絵 か、上に たからばこ＋下に 棚 か）は オーナーが まだ えらんで いない。このため
 * 位置・大きさは「画面の 中に 入る・カードが 重ならない・ボタン 高さ 56 以上」だけ 見る。
 *
 * ---- 開発への つなぎ目の 約束（置く 所は developer。TOWN-1.md §6.1 の `shop` を ふくらませた 物）----
 * 窓口 `window.__rikkun.shop`（p ＝ 1 | 2。2P が いなければ open は false）:
 *   shop.open(p) → boolean      よろずやさんに 話した のと 同じ（きょりは 見ない。画面が 開けば true）
 *   shop.close(p)               ✕ と 同じ
 *   shop.select(p, id | null)   カードを えらんだ のと 同じ
 *   shop.buy(p, id) → 'ok' | 'short' | 'soldOut'   えらんで「こうかん」を 押した のと 同じ（id は 品の id・'kobako'・'obako'。箱は 'ok' の とき state.result に 中身が 入り、画面が あれば 中身の 表示が 出る）
 *   shop.state(p) → { open, dama, items: { id, price, canBuy, soldOut }[], selected, result: { box, items: { item, count, rarity }[] } | null,
 *                     bubble: string | null（よろずやさんの ふきだしの 文）, opens: { kobako: number, obako: number }（その 人が その 箱を あけた 回数） }
 *     items は 仕様 §4.2 の 順。いちばん 後ろ 2 つの id が 'kobako'・'obako'。ねだんは ここから 読む（決め打ちしない）
 *   （ようかいダマの 数は 今ある dama.count(p)・dama.give(p, n)。もちものの 数は 今ある duo.count(p, item)。体力は duo.hearts(p)）
 * data-testid（画面の 目印。1 人も 2 人も 同じ 名前。2 人の ときは 開いた 人の 画面だけ DOM に ある）:
 *   shop-screen        画面の 根。`data-owner="1|2"`。開いて いる 間だけ DOM に ある。2 人の ときは 開いた 人の 半分（1P ＝ 左・2P ＝ 右）の 中に 入る
 *   shop-dama          上の「もっている ようかいダマ」の 数の 所（文字に 数を ふくむ）
 *   shop-bubble        よろずやさんの ふきだし（ない ときは DOM に ない）。たりない とき「ようかいダマが あと □ こ たりないよ」
 *   shop-card-<id>     カード（品の 数だけ。箱も）。`data-can="1|0"`・`data-sold="1|0"`。カードに 名前は 書かない（絵と ねだん だけ）
 *   shop-detail        えらんだ 品の 下の 帯（大きな 絵・名前・中身の 数）。えらんで いる 間だけ 見える
 *   shop-sample        箱を えらんだ とき だけ 出る「こんな ものが でるかも」
 *   shop-buy           「こうかん」ボタン。`aria-disabled`（たりない・ぜんぶ もってる とき "true"。`disabled` 属性は 使わず、押すと ふきだしが 出る）。高さ 56 以上
 *   shop-close         ✕。56×56 以上
 *   shop-result        たからばこの 中身の 表示。`shop-result-card`（中身の 数だけ。`data-item`・`data-rarity`）。`shop-result-close`「とじる」（高さ 56 以上）。「もう 1 かい」は 置かない（`shop-again` は ない）
 * 話す: 1P は よろずやさんを ねらって 右クリック（secondary）、2P は ZL（パッド 6）。どちらも `shop.state(p).open` が true に なる。
 */

const OPEN_MAX = 300; // 話してから 画面が 開くまでの 上限 ステップ（回）
const FREEZE_STEPS = 600; // 1 人で 開いて いる 間 ステップ（AC20。仕様の 数）
const BTN_MIN = 56; // ボタンの 高さ（px。仕様 §3.2）

const rect = (page: Page, id: string) =>
  page.evaluate((id) => {
    const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height } : null;
  }, id);

/** よろずやの 画面の ならべ方に よらない 見た目の きまり（AC19 の うち 6 歳向けの 最小）。もんだいの 文の 一覧を 返す */
async function layoutIssues(page: Page, p: Who, duo: boolean): Promise<string[]> {
  const issues: string[] = [];
  const st = await shopState(page, p);
  const vw = await page.evaluate(() => innerWidth);
  const vh = await page.evaluate(() => innerHeight);
  const scr = await rect(page, 'shop-screen');
  if (!scr) return ['shop-screen が ない'];
  const half = duo ? (p === 1 ? { l: 0, r: vw / 2 } : { l: vw / 2, r: vw }) : { l: 0, r: vw };
  if (scr.left < half.l - 1 || scr.right > half.r + 1 || scr.top < -1 || scr.bottom > vh + 1) issues.push(`画面が ${duo ? `2P 用の 半分（${p === 1 ? '左' : '右'}）` : '画面'}を はみだす ${JSON.stringify(scr)}`);
  const cards: { id: string; r: NonNullable<Awaited<ReturnType<typeof rect>>> }[] = [];
  for (const it of st.items) {
    const r = await rect(page, `shop-card-${it.id}`);
    if (!r) issues.push(`カード ${it.id} が ない`);
    else cards.push({ id: it.id, r });
  }
  for (const c of cards) {
    if (c.r.left < scr.left - 1 || c.r.right > scr.right + 1 || c.r.top < scr.top - 1 || c.r.bottom > scr.bottom + 1) issues.push(`カード ${c.id} が 画面の 外`);
    if (c.r.w < 48 || c.r.h < 48) issues.push(`カード ${c.id} が 小さい（48 未満）`);
  }
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!.r;
      const b = cards[j]!.r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push(`カード ${cards[i]!.id} と ${cards[j]!.id} が 重なる`);
    }
  // カードの 字: 名前は 書かない（数字と 空白だけ）
  const texts = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="shop-card-"]')].map((e) => [e.getAttribute('data-testid'), (e.textContent ?? '').trim()] as const));
  for (const [id, t] of texts) if (!/^[\d\s,×]*$/.test(t)) issues.push(`${id} に 名前らしい 字が ある「${t}」`);
  // 上の 帯の ようかいダマの 数が 画面の 中
  const dm = await rect(page, 'shop-dama');
  if (!dm || dm.left < scr.left - 1 || dm.right > scr.right + 1) issues.push('shop-dama が 画面の 外か ない');
  const dmOver = await page.evaluate(() => { const e = document.querySelector('[data-testid="shop-dama"]'); return e ? e.scrollWidth - e.clientWidth : 0; });
  if (dmOver > 1) issues.push(`shop-dama の 字が はみだす（${dmOver}px）`);
  // ボタン: ✕ と こうかん（えらぶと 出る）
  const cl = await rect(page, 'shop-close');
  if (!cl || cl.w < BTN_MIN - 0.5 || cl.h < BTN_MIN - 0.5) issues.push(`shop-close が 56×56 未満か ない ${JSON.stringify(cl)}`);
  await shopCall(page, 'select', p, st.items[0]!.id);
  await stepN(page, 2);
  const by = await rect(page, 'shop-buy');
  if (!by || by.h < BTN_MIN - 0.5) issues.push(`shop-buy の 高さが 56 未満か ない ${JSON.stringify(by)}`);
  else if (by.left < scr.left - 1 || by.right > scr.right + 1 || by.bottom > scr.bottom + 1) issues.push('shop-buy が 画面の 外');
  return issues;
}

/** 2 人の 世界で 1P を ひろばの そばの 立てる 所に、2P を 街の ふちの 立てる 所に 置く（開いた 人を そのまま 置いて 使う） */
async function duoWorld(page: Page, extra = ''): Promise<{ info: TownInfo; spot: Awaited<ReturnType<typeof findEdgeSpot>> }> {
  await openTown(page, { duo: true, extra });
  const info = await townInfo(page);
  const spot = await findEdgeSpot(page, info);
  return { info, spot };
}

test.describe('TOWN-1 1C よろずやの 画面と たからばこ', () => {
  test.describe.configure({ timeout: 300_000 });

  for (const p of [1, 2] as const) {
    test(`AC13・AC16 通し（${p}P）: 話す → たいまつを こうかん → たりない → こばこを あける → とじる`, async ({ page }) => {
      const { info } = await duoWorld(page);
      const { npc, stand } = shopStand(info as never);
      const other: Who = p === 1 ? 2 : 1;
      // 開かない ほうの 人は ひろばに 置く
      const plaza = { x: info.plaza.x + 0.5, y: info.plaza.y, z: info.plaza.z + 0.5 };
      if (other === 1) await place1P(page, plaza);
      else await place2P(page, plaza);
      await page.evaluate(([p]) => (window as any).__rikkun.dama.give(p, 40), [p] as const);
      expect(await damaOf(page, p), 'ようかいダマを 40 わたした').toBeGreaterThanOrEqual(40);

      // 話す（入力の 道）
      if (p === 1) await talkByClick1P(page, npc, stand, OPEN_MAX);
      else await talkByPad2P(page, npc, stand, OPEN_MAX);
      let st = await shopState(page, p);
      expect(st.open, `${p}P が よろずやさんに 話すと 画面が 開く`).toBe(true);
      expect((await shopState(page, other)).open, '話して いない 人の 画面は 開かない').toBe(false);
      await expect(tid(page, 'shop-screen')).toBeVisible();
      expect(await tid(page, 'shop-screen').getAttribute('data-owner')).toBe(String(p));
      expect(await tid(page, 'shop-dama').textContent(), '上の 帯に ようかいダマの 数').toContain(String(st.dama));
      expect(st.items.length, '売り物が ある（§4.2 は 15 行。おふだ〔1E〕が まだ なければ 14）').toBeGreaterThanOrEqual(14);
      expect(st.items.slice(-2).map((i) => i.id), 'カードの いちばん 後ろ 2 つは こばこ・おおばこ').toEqual(['kobako', 'obako']);
      expect(st.items.map((i) => i.id), '売り物に ようかいダマは ない（AC15 の 見える 側）').not.toContain('yokai_orb');
      await test.info().attach(`shop-open-${p}P`, { body: await page.screenshot({ path: `test-shots/town1c-open-${p}P.png` }), contentType: 'image/png' });

      // こうかん: たいまつ（AC13）。ねだんは 表から 読む
      const torch = st.items.find((i) => i.id === 'torch');
      expect(torch, '売り物に たいまつ').toBeTruthy();
      const d0 = await damaOf(page, p);
      const otherD0 = await damaOf(page, other);
      const t0 = await countOf(page, p, 'torch');
      await tid(page, 'shop-card-torch').click();
      await stepN(page, 2);
      expect((await shopState(page, p)).selected).toBe('torch');
      await expect(tid(page, 'shop-detail')).toBeVisible();
      expect(await tid(page, 'shop-buy').getAttribute('aria-disabled')).not.toBe('true');
      await tid(page, 'shop-buy').click();
      await stepN(page, 2);
      expect(await damaOf(page, p), 'ようかいダマが ねだん だけ へる').toBe(d0 - torch!.price);
      expect(await countOf(page, p, 'torch'), 'たいまつが 8 ほん ふえる（§4.2）').toBe(t0 + 8);
      expect(await damaOf(page, other), 'もう 1 人の ようかいダマは かわらない').toBe(otherD0);

      // たりない: おおばこ（100）。何も へらない・ふきだし・ボタンは 灰色
      const d1 = await damaOf(page, p);
      const obako = (await shopState(page, p)).items.find((i) => i.id === 'obako')!;
      expect(d1, 'おおばこの ねだんには たりない（この テストの まえ）').toBeLessThan(obako.price);
      expect(obako.canBuy, 'たりない 箱は canBuy false').toBe(false);
      expect(await tid(page, 'shop-card-obako').getAttribute('data-can'), 'カードが うすく なる').toBe('0');
      await tid(page, 'shop-card-obako').click();
      await stepN(page, 2);
      expect(await tid(page, 'shop-buy').getAttribute('aria-disabled'), 'こうかん ボタンは 灰色').toBe('true');
      await tid(page, 'shop-buy').click({ force: true });
      await stepN(page, 2);
      expect(await damaOf(page, p), 'たりない ときは 何も へらない').toBe(d1);
      await expect(tid(page, 'shop-bubble')).toBeVisible();
      const need = obako.price - d1;
      expect(await tid(page, 'shop-bubble').textContent(), 'ふきだしに たりない 数').toMatch(new RegExp(`ようかいダマ.*あと.*${need}.*たりない`));
      expect(await shopCall(page, 'buy', p, 'obako')).toBe('short');
      expect((await shopState(page, p)).result, 'たりない とき 中身は 出ない').toBeNull();

      // こばこ（AC16）: ダマ −ねだん・中身が 出る・もちものに 入る・とじる
      const kobako = (await shopState(page, p)).items.find((i) => i.id === 'kobako')!;
      expect(kobako.canBuy, 'こばこは 買える').toBe(true);
      const before = (await shopState(page, p)).opens.kobako;
      await tid(page, 'shop-card-kobako').click();
      await stepN(page, 2);
      await expect(tid(page, 'shop-sample'), 'こばこを えらぶと「こんな ものが でるかも」').toBeVisible();
      const d2 = await damaOf(page, p);
      await tid(page, 'shop-buy').click();
      await stepN(page, 3);
      st = await shopState(page, p);
      expect(await damaOf(page, p), 'こばこの ねだんだけ へる').toBe(d2 - kobako.price);
      expect(st.opens.kobako, 'あけた 回数が 1 ふえる').toBe(before + 1);
      expect(st.result?.box).toBe('kobako');
      expect(st.result!.items.length, '中身が 1 こ 以上').toBeGreaterThan(0);
      await expect(tid(page, 'shop-result')).toBeVisible();
      await expect(page.getByTestId('shop-result-card')).toHaveCount(st.result!.items.length);
      const got = new Map<string, number>();
      for (const r of st.result!.items) {
        expect(r.rarity, '中身は めずらしさ（★）つき').toBeGreaterThanOrEqual(1);
        got.set(r.item, (got.get(r.item) ?? 0) + r.count);
      }
      for (const [item, n] of got) expect(await countOf(page, p, item), `中身 ${item} が もちものに 入る（あきは たっぷり ある）`).toBeGreaterThanOrEqual(n);
      expect(await page.getByTestId('shop-result-card').evaluateAll((els) => els.every((e) => !!e.getAttribute('data-rarity') && !!e.getAttribute('data-item'))), '中身の カードに めずらしさ').toBe(true);
      await expect(page.getByTestId('shop-again'), '「もう 1 かい」は 置かない').toHaveCount(0);
      await test.info().attach(`shop-result-${p}P`, { body: await page.screenshot({ path: `test-shots/town1c-result-${p}P.png` }), contentType: 'image/png' });
      const rc = await rect(page, 'shop-result-close');
      expect(rc && rc.h >= BTN_MIN - 0.5, '「とじる」は 高さ 56 以上').toBe(true);
      await tid(page, 'shop-result-close').click();
      await stepN(page, 2);
      expect((await shopState(page, p)).result, '中身の 表示が とじる').toBeNull();
      expect((await shopState(page, p)).open, 'よろずやの 画面は まだ 開いて いる').toBe(true);

      // ✕ で とじる
      await tid(page, 'shop-close').click();
      await stepN(page, 2);
      expect((await shopState(page, p)).open, '✕ で とじる').toBe(false);
      await expect(tid(page, 'shop-screen')).toHaveCount(0);
    });
  }

  test('AC16: くじは シードで 決まる（同じ シード・同じ 順で 同じ 中身）・1P と 2P の 回数は 別（2P が あけても 1P の 中身は かわらない）', async ({ page }) => {
    // order: '2P が 先' = 2P → 1P → 1P / '2P が 後' = 1P → 1P → 2P
    const run = async (order: 'p2first' | 'p2last'): Promise<{ a: unknown; b: unknown; opens: Record<Who, number> }> => {
      await openTown(page, { duo: true, extra: '&seed=11' });
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.dama.give(1, 60);
        h.dama.give(2, 60);
      });
      const open = async (p: Who) => {
        expect(await shopCall(page, 'open', p), `${p}P の 画面が 開く`).toBe(true);
        expect(await shopCall(page, 'buy', p, 'kobako')).toBe('ok');
        const r = (await shopState(page, p)).result;
        expect(r, `${p}P の こばこの 中身が ある`).not.toBeNull();
        await shopCall(page, 'close', p);
        return r;
      };
      if (order === 'p2first') await open(2);
      const a = await open(1);
      const b = await open(1);
      if (order === 'p2last') await open(2);
      return { a, b, opens: { 1: (await shopState(page, 1)).opens.kobako, 2: (await shopState(page, 2)).opens.kobako } };
    };
    const r1 = await run('p2first');
    const r2 = await run('p2first'); // もう 1 回 同じ シード・同じ 順
    expect(r2.a, '同じ シード・同じ 順なら 1P の 1 回目は 同じ 中身').toEqual(r1.a);
    expect(r2.b, '2 回目も 同じ').toEqual(r1.b);
    expect(r1.opens[1], '1P は 2 回 あけた').toBe(2);
    expect(r1.opens[2], '2P は 1 回（回数は 人ごと）').toBe(1);
    // 2P が 先でも 後でも 1P の 中身は かわらない
    const r3 = await run('p2last');
    expect(r3.opens, '回数は 人ごと').toEqual({ 1: 2, 2: 1 });
    expect(r3.a, '2P が 先に あけても 後に あけても 1P の 1 回目は 同じ').toEqual(r1.a);
    expect(r3.b, '1P の 2 回目も 同じ').toEqual(r1.b);
  });

  test('AC20 (1 人): 開いて いる 600 ステップ 世界が 止まる（妖怪の 場所も ハートも かわらない）。とじると 動く・街を 出たら 自動で とじる', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const spot = await findEdgeSpot(page, info);
    await place1P(page, spot.player);
    const yPos = { x: spot.player.x + spot.out.x * 2, y: spot.player.y, z: spot.player.z + spot.out.z * 2 };
    const id = await page.evaluate((pos) => {
      const h = (window as any).__rikkun;
      h.time.set(70000);
      return h.yokai.spawn('karakasa', pos.x, pos.y, pos.z, { hp: 9999 }) as number;
    }, yPos);
    const where = (): Promise<P3> => page.evaluate((id) => (window as any).__rikkun.yokai.list().find((q: any) => q.id === id)?.position as P3, id);
    expect(await shopCall(page, 'open', 1)).toBe(true);
    await expect(tid(page, 'shop-screen')).toBeVisible();
    const pos0 = await where();
    const hp0 = await hpOf(page, 1);
    await stepN(page, FREEZE_STEPS);
    expect(await where(), '開いて いる 間 妖怪の 場所が かわらない').toEqual(pos0);
    expect(await hpOf(page, 1), '1P の ハートが へらない').toBe(hp0);
    // Esc で とじる
    await page.keyboard.press('Escape');
    await stepN(page, 3);
    expect((await shopState(page, 1)).open, 'Esc で とじる').toBe(false);
    // とじたら 世界が 動く
    let moved = false;
    for (let i = 0; i < 30 && !moved; i++) {
      await stepN(page, 20);
      const w = await where();
      moved = Math.hypot(w.x - pos0.x, w.z - pos0.z) > 0.2 || (await hpOf(page, 1)) < hp0;
    }
    expect(moved, 'とじると 妖怪が 動く・当たる').toBe(true);
    // 街の はんいを 出たら 自動で とじる
    await page.evaluate(() => (window as any).__rikkun.yokai.clear());
    await place1P(page, spot.player);
    expect(await shopCall(page, 'open', 1)).toBe(true);
    await place1P(page, spot.yokai); // 外 4 マス（わかない はんいの 外）
    await stepN(page, 5);
    expect((await shopState(page, 1)).open, '街を 出ると 自動で とじる').toBe(false);
  });

  for (const opener of [1, 2] as const) {
    test(`AC20 (2 人・${opener}P が 開く, 1.3): 世界は 止まらない・相手は 動ける・画面は 開いた 人の 半分・当たると ハートが へって 画面は 開いた まま・やられたら とじる`, async ({ page }) => {
      const { info, spot } = await duoWorld(page);
      const other: Who = opener === 1 ? 2 : 1;
      const place = (who: Who, pos: P3) => (who === 1 ? place1P(page, pos) : place2P(page, pos));
      const plaza = { x: info.plaza.x + 0.5, y: info.plaza.y, z: info.plaza.z + 0.5 };
      await place(other, plaza);
      await place(opener, spot.player);
      const yPos = { x: spot.player.x + spot.out.x * 2, y: spot.player.y, z: spot.player.z + spot.out.z * 2 };
      await page.evaluate((pos) => {
        const h = (window as any).__rikkun;
        h.time.set(70000);
        h.yokai.spawn('karakasa', pos.x, pos.y, pos.z, { hp: 9999 });
      }, yPos);
      expect(await shopCall(page, 'open', opener)).toBe(true);
      await expect(tid(page, 'shop-screen')).toBeVisible();
      // 画面は 開いた 人の 半分の 中
      const vw = await page.evaluate(() => innerWidth);
      const scr = (await rect(page, 'shop-screen'))!;
      if (opener === 1) expect(scr.right, '1P の 画面は 左半分').toBeLessThanOrEqual(vw / 2 + 1);
      else expect(scr.left, '2P の 画面は 右半分').toBeGreaterThanOrEqual(vw / 2 - 1);
      expect(await page.evaluate(() => (window as any).__rikkun.duo.timeScale()), '世界は 止まらない（時間の 倍率 1）').toBe(1);
      // 相手は 動ける（パッドの スティックで 前へ。1P も 2P も パッド）
      const o0 = await page.evaluate((w) => (window as any).__rikkun.duo.pos(w) as P3, other);
      const c0 = await page.evaluate((w) => (window as any).__rikkun.duo.pos(w) as P3, opener);
      await setFakePad(page, other - 1, { axes: [0, -1, 0, 0] });
      await stepN(page, 40);
      await setFakePad(page, other - 1, {});
      const o1 = await page.evaluate((w) => (window as any).__rikkun.duo.pos(w) as P3, other);
      expect(Math.hypot(o1.x - o0.x, o1.z - o0.z), '相手は 動ける').toBeGreaterThan(0.5);
      // 開いた 人は その場に 止まり、妖怪に ねらわれて 当たる。画面は 開いたまま
      const hp0 = await hpOf(page, opener);
      let hit = false;
      for (let i = 0; i < 60 && !hit; i++) {
        await stepN(page, 20);
        hit = (await hpOf(page, opener)) < hp0;
      }
      expect(hit, '開いて いる 人にも 妖怪の こうげきが 当たる（1.3）').toBe(true);
      expect((await shopState(page, opener)).open, '当たっても 画面は とじない').toBe(true);
      const c1 = await page.evaluate((w) => (window as any).__rikkun.duo.pos(w) as P3, opener);
      expect(Math.hypot(c1.x - c0.x, c1.z - c0.z), '開いた 人は その場に 止まる').toBeLessThan(1.5);
      await test.info().attach(`shop-hit-${opener}P`, { body: await page.screenshot({ path: `test-shots/town1c-hit-${opener}P.png` }), contentType: 'image/png' });
      // やられたら とじる（当たった あとは 無敵時間 hurtInvincibleTicks 90 ステップ。妖怪を 消して 切れるまで 進めてから hurt）
      await page.evaluate(() => (window as any).__rikkun.yokai.clear());
      await stepN(page, 120);
      await page.evaluate((w) => (window as any).__rikkun.duo.hurt(w, 999), opener);
      await stepN(page, 10);
      expect((await shopState(page, opener)).open, 'やられたら 画面が とじる').toBe(false);
      await expect(tid(page, 'shop-screen')).toHaveCount(0);
    });
  }

  test('AC19 (E2E の 見える 範囲): 3 つの 大きさで カード ぜんぶ 画面に 入って 重ならない・ボタン 56 以上・ようかいダマ 9,999 でも 上の 帯に 入る（1 人）', async ({ page }) => {
    await openTown(page);
    await page.evaluate(() => (window as any).__rikkun.dama.give(1, 9999));
    expect(await shopCall(page, 'open', 1)).toBe(true);
    for (const [w, h] of [[1024, 700], [1280, 800], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await stepN(page, 3);
      const issues = await layoutIssues(page, 1, false);
      await page.screenshot({ path: `test-shots/town1c-layout-1P-${w}.png` });
      expect(issues, `${w}×${h} の もんだい`).toEqual([]);
    }
  });

  for (const p of [1, 2] as const) {
    test(`AC19 (2 人の 半分・${p}P): 1024×700 の 半分に カード ぜんぶ 入って 重ならない・ボタン 56 以上`, async ({ page }) => {
      await duoWorld(page);
      await page.setViewportSize({ width: 1024, height: 700 });
      await page.evaluate((p) => (window as any).__rikkun.dama.give(p, 9999), p);
      expect(await shopCall(page, 'open', p)).toBe(true);
      await stepN(page, 3);
      const issues = await layoutIssues(page, p, true);
      await page.screenshot({ path: `test-shots/town1c-layout-${p}P-half.png` });
      expect(issues, `2 人の 半分（${p}P）の もんだい`).toEqual([]);
    });
  }
});
