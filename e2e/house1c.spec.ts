import { expect, test, type Page } from '@playwright/test';
import { GADGET_TUNING } from '../src/content/items/gadgetTuning';
import { doorIndex } from '../src/house/editor/model';
import { futonInfo } from '../src/world/blocks/futon';
import { countOf, menuState, openHouse, press, stepUi, talkTo } from './helpers/house';
import { blueprints, clickBtn, firstArchitect, MSG, plainText, squash } from './helpers/houseEditor';
import {
  DAY,
  DOOR_PREFIX,
  HB,
  NIGHT,
  aimBlock,
  bandOf,
  blockAt,
  buildNow,
  digAimed,
  emptyHand,
  enterThroughDoor,
  futonCells,
  futonMismatches,
  houses,
  makeBlueprint,
  outsideDoor,
  prepareYard,
  rightHint,
  scanBox,
  settleWorld,
  shapeMismatches,
  standAt,
  tapRight,
  viewStats,
  walk,
  wantedCells,
  type HouseForm,
  type Pt,
} from './helpers/houseBuilt';

/**
 * HOUSE-1C PR-1（#340 家の 中身。docs/design/HOUSE-1.md §2.6・§2.11・§2.13・§3.3・§4.6・§4.8・§6.1、docs/tickets/HOUSE-1C.md の「PR-1」）の E2E。
 * E2E に 書くのは 画面・入力・描画が いる 確認と 遊びの 流れの 代表だけ（#311）。数・状態だけの 基準（家の 材料の 式・ほる アイテム・向きの 表・
 * 戸を 通りぬけた かの 判定・なまえを かえる の 並び順と 悪い ことば・案内の 中身 など）は ユニット（developer。票「ユニットの 期待」）:
 *   AC24 の しまった 戸が 妖怪に かべ・AC26 の 判定・AC27 の 向き・AC52 の 家具と ちょうちん・AC53 の 一覧の 順と よくない ことば・AC54 の ことば。
 *
 * 通し 1 本（AC34 ④・AC49・AC25・AC54・AC26・AC24・AC27・AC53・AC52）:
 *   せっけいずを 1 まい 作る → 平らな 場所に 家を その場に 建てる（フック `house.buildNow`）→ 同じ 場所・同じ カメラで 描画回数を 前と 後で くらべる（AC34 ④）
 *   → 形が せっけいず どおり（AC49）→ 戸を あける・しめる・しまった 戸は 通れない（AC25・AC54）→ 戸から 入ると 名前の 帯（AC26）→ 夜でも 家の 中は 湧かない（AC24）
 *   → ふとんで 寝る（AC27）→ なまえを かえる（AC53）→ かべを ほる・戸を ほると 記録が 消える（AC52）。
 * 約束（フック・testid）は e2e/helpers/house.ts の 先頭、関数は e2e/helpers/houseBuilt.ts。実装の 前は `house.buildNow` が 無くて 赤。
 */

/** 中 7×5・窓 4・家具 4 つ（ふとん みぎ向き・いす・ながい テーブル〔3 マス〕・たんす）。戸の 前の マス（3, 4）は あけて ある */
const FORM: HouseForm = {
  w: 7,
  d: 5,
  windows: 4,
  front: 'もも',
  back: 'のいえ',
  furniture: [
    { kind: 'futon', x: 0, z: 0, rot: 1 }, // まくらは みぎ（東）。(0,0)(1,0)
    { kind: 'chair', x: 6, z: 0, rot: 3 },
    { kind: 'long_table', x: 0, z: 2, rot: 0 }, // 3 マス (0,2)(1,2)(2,2)
    { kind: 'tansu', x: 6, z: 3, rot: 2 },
  ],
};
const NAME = FORM.front + FORM.back;
const NEW_FRONT = 'ねこ';
const NEW_BACK_BTN = 'suffix-3'; // ひみつきち
const NEW_NAME = `${NEW_FRONT}ひみつきち`;

const DROP_ONE = { common: 1, uncommon: 1, rare: 1, superRare: 1 };

const getBlock = (page: Page, p: Pt): Promise<string> => page.evaluate(([x, y, z]) => (window as any).__rikkun.world.getBlock(x, y, z) as string, [p.x, p.y, p.z] as const);

test.describe('HOUSE-1C PR-1 家の 中身', () => {
  test('AC34④・AC49・AC25・AC54・AC26・AC24・AC27・AC53・AC52: 建てる → 戸 → 帯 → 夜 → ねる → なまえ → ほる', async ({ page }) => {
    test.setTimeout(300_000);
    await openHouse(page);
    const first = await firstArchitect(page);

    // ---- 家が 0 けん: なまえを かえる は 押せない（AC53）
    await talkTo(page, first.id, 'hook');
    const m0 = await menuState(page);
    expect(m0.buttons.find((b) => b.id === 'rename')?.enabled, '家が 0 けんの とき なまえを かえる は 押せない').toBe(false);
    await press(page, 'close');

    // ---- せっけいずを 1 まい 作り、平らな 場所を 用意する
    const bpNumber = await makeBlueprint(page, FORM);
    await emptyHand(page);
    const ow = FORM.w + 2;
    const od = FORM.d + 2;
    const x0 = Math.floor(first.x) + 14; // 建築士さんの 立ち位置(±4)から はなす
    const z0 = Math.floor(first.z) - 4;
    const gy = await prepareYard(page, x0, z0, ow, od);
    const at: Pt = { x: x0, y: gy, z: z0 };
    const eye: Pt = { x: x0 + ow / 2, y: gy + 1, z: z0 + od + 8 }; // 家の 南 8 マス（まえ）から 北を 見る
    const before = await viewStats(page, eye, 0, 0);

    // ---- 建てる（フック）→ 描画回数（AC34 ④）
    const rec = await test.step('せっけいずから 家を その場に 建てる', () => buildNow(page, bpNumber, at));
    const door: Pt = { x: x0 + 1 + doorIndex(FORM), y: gy + 1, z: z0 + od - 1 };
    expect(rec, '家の 記録（名前・番号・外の 寸法・戸の 場所〔下の マス〕・しまって いる）').toMatchObject({ name: NAME, number: bpNumber, outer: { w: ow, d: od }, door, doorOpen: false });
    expect(await houses(page), '家が 1 けん').toEqual([rec]);

    await test.step('AC34 ④ 同じ 場所・同じ カメラで 家の ある なしの 描画回数', async () => {
      const after = await viewStats(page, eye, 0, 0);
      expect(after.triangles, '家が 見えて いる（三角形が ふえた）').toBeGreaterThan(before.triangles);
      expect(after.calls - before.calls, `描画回数の ふえ（前 ${before.calls} → 後 ${after.calls}）は +10 まで`).toBeLessThanOrEqual(10);
    });

    // ---- 形が せっけいず どおり（AC49）
    await test.step('AC49 形が せっけいず どおり', async () => {
      const got = await scanBox(page, at, ow, od);
      const bad = shapeMismatches(wantedCells(FORM, at), got);
      expect(bad.slice(0, 10), `ちがう マスが ${bad.length} こ（床・かべ・やね・戸・窓・ちょうちん・家具・空気）`).toEqual([]);
      expect(await futonMismatches(page, FORM.furniture[0]!, at), 'ふとん 2 マス（頭と 足・向き）').toEqual([]);
      // 戸は 1・2 段目の 2 マス、3 段目は かべ
      expect((await getBlock(page, door)).startsWith(DOOR_PREFIX), '戸の 下').toBe(true);
      expect((await getBlock(page, { ...door, y: door.y + 1 })).startsWith(DOOR_PREFIX), '戸の 上').toBe(true);
      expect(await getBlock(page, { ...door, y: door.y + 2 }), '戸の 上は かべ').toBe(HB.wall);
    });

    // ---- 戸を あける・しめる（AC25）・右の 案内（AC54）
    await test.step('AC25・AC54 戸を あける・しめる。しまった 戸は 通れない', async () => {
      await standAt(page, outsideDoor(door), 0);
      const t0 = await aimBlock(page, door, 0.5);
      expect(t0?.id.startsWith(DOOR_PREFIX), `しまった 戸を ねらえる（今: ${t0?.id}）`).toBe(true);
      const hintClosed = await rightHint(page);
      expect(hintClosed?.word, '右の 案内（しまって いる 戸）').toBeTruthy();
      await tapRight(page);
      expect((await houses(page))[0]!.doorOpen, '右クリックで あく').toBe(true);
      const t1 = await aimBlock(page, door, 0.5);
      expect(t1?.id.startsWith(DOOR_PREFIX), `あいた 戸も ねらえる（今: ${t1?.id}）`).toBe(true);
      const hintOpen = await rightHint(page);
      expect(hintOpen?.word, '右の 案内（あいて いる 戸）').toBeTruthy();
      expect(hintOpen!.word, 'あけると しめる に かわる').not.toBe(hintClosed!.word);
      await tapRight(page);
      expect((await houses(page))[0]!.doorOpen, 'もう 1 回で しまる').toBe(false);

      // しまった 戸は プレイヤーが 通れない
      const from = outsideDoor(door);
      const blocked = await walk(page, { from, yaw: 0, axis: 'z', dir: -1, until: door.z - 1.5, max: 120 });
      expect(from.z - blocked.end.z, '前へ 歩いた（歩けない 場所で 通れないと 見まちがえない）').toBeGreaterThan(1);
      expect(Math.floor(blocked.end.z), 'しまった 戸の マスに 入れない').toBeGreaterThan(door.z);
      expect(blocked.trace.every((s) => s.band === null), 'しまった 戸の 外では 帯は 出ない').toBe(true);

      // あける → 通れる
      await standAt(page, outsideDoor(door), 0);
      await aimBlock(page, door, 0.5);
      await tapRight(page);
      expect((await houses(page))[0]!.doorOpen, 'また あける').toBe(true);
    });

    // ---- 戸から 入ると 名前の 帯（AC26）
    await test.step('AC26 外 → 戸 → 中で 名前の 帯。中・外へ 出る・あな・テレポートでは 出ない', async () => {
      const inWalk = await enterThroughDoor(page, door);
      expect(inWalk.end.z, 'あいた 戸を 通って 中に 入った').toBeLessThan(door.z);
      expect(
        inWalk.trace.filter((s) => Math.floor(s.z) > door.z).every((s) => s.band === null),
        '戸の マスに とどく 前の 外では 帯は 出ない',
      ).toBe(true);
      const seen = inWalk.trace.findIndex((s) => s.band !== null);
      expect(seen, '戸を 通ると 帯が 出る').toBeGreaterThanOrEqual(0);
      expect(inWalk.trace[seen]!.band, '帯の 字は 家の 名前').toBe(NAME);
      expect([179, 180], '出はじめは 180 ステップ').toContain(inWalk.trace[seen]!.left);
      for (let i = seen + 1; i < inWalk.trace.length; i++) expect(inWalk.trace[i]!.left, '1 ステップごとに 1 へる').toBe(inWalk.trace[i - 1]!.left! - 1);
      const band = await bandOf(page);
      expect(band?.text, '中に 入った あとも 出ている').toBe(NAME);
      expect(await plainText(page, 'house-name-band'), '画面に 名前の 帯（house-name-band）').toContain(NAME);
      await stepUi(page, band!.ticksLeft - 1);
      expect((await bandOf(page))?.ticksLeft, 'あと 1 ステップ').toBe(1);
      await stepUi(page, 1);
      expect(await bandOf(page), '180 ステップで 消える').toBeNull();
      await expect(page.locator('[data-testid="house-name-band"]:visible'), '帯の 画面も 消える').toHaveCount(0);

      // 中で 歩いても 出ない（テレポートで 中に 入っても 出ない）
      const inside: Pt = { x: door.x + 0.5, y: door.y, z: door.z - 0.5 };
      await standAt(page, outsideDoor(door), 0); // 外に 立って から 中へ 飛ぶ（外 → 中を 戸の マスを 通らずに）
      const wIn = await walk(page, { from: inside, yaw: 0, axis: 'z', dir: -1, until: z0 + 2, max: 200 });
      expect(wIn.trace.length, '中で 歩いた').toBeGreaterThan(5);
      expect(wIn.trace.every((s) => s.band === null), '中で 歩いても・テレポートで 入っても 帯は 出ない').toBe(true);
      // 中から 外へ 出ても 出ない
      const wOut = await walk(page, { from: { x: door.x + 0.5, y: door.y, z: door.z - 1.5 }, yaw: 180, axis: 'z', dir: 1, until: door.z + 2.5, max: 200 });
      expect(wOut.end.z, '戸を 通って 外へ 出た').toBeGreaterThan(door.z + 1);
      expect(wOut.trace.every((s) => s.band === null), '中から 外へ 出ても 帯は 出ない').toBe(true);
      // もう 1 度 外から 戸を 通ると また 出る
      const again = await enterThroughDoor(page, door);
      expect(again.trace.find((s) => s.band !== null)?.band, 'もう 1 度 入ると また 出る').toBe(NAME);
      await stepUi(page, 200);
      expect(await bandOf(page), '消えた').toBeNull();

      // かべに あけた あなから 入っても 出ない（東の かべ、窓でない 所）
      const hole: Pt[] = [0, 1].map((i) => ({ x: x0 + ow - 1, y: gy + 1 + i, z: z0 + 2 }));
      for (const p of hole) expect(await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.setBlock(x, y, z, 'air'), [p.x, p.y, p.z] as const), 'かべに あなを あける').toBe(true);
      const wHole = await walk(page, { from: { x: x0 + ow - 1 + 3, y: gy + 1, z: z0 + 2.5 }, yaw: 270, axis: 'x', dir: -1, until: x0 + ow - 1 - 1.5, max: 200 });
      expect(wHole.end.x, 'あなから 中に 入った').toBeLessThan(x0 + ow - 1);
      expect(wHole.trace.every((s) => s.band === null), 'かべの あなから 入っても 帯は 出ない').toBe(true);
      for (const p of hole) await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.setBlock(x, y, z, 'house_wall'), [p.x, p.y, p.z] as const);
    });

    // ---- 夜でも 家の 中は 湧かない（AC24）
    const lantern: Pt = { x: x0 + 1 + (FORM.w - 1) / 2, y: gy + 3, z: z0 + 1 + (FORM.d - 1) / 2 };
    await test.step('AC24 夜でも 家の 中は 湧かない場所。ちょうちんを ほると もどる', async () => {
      await page.evaluate((t) => (window as any).__rikkun.time.set(t), NIGHT);
      expect((await page.evaluate(() => (window as any).__rikkun.time.get())).phase, '夜').toBe('night');
      await settleWorld(page);
      const lit = await page.evaluate(
        ({ x0, z0, gy, w, d }) => {
          const h = (window as any).__rikkun;
          const dark: string[] = [];
          let checked = 0;
          for (let gx = 0; gx < w; gx++) {
            for (let gz = 0; gz < d; gz++) {
              for (let y = gy + 1; y <= gy + 3; y++) {
                const x = x0 + 1 + gx;
                const z = z0 + 1 + gz;
                if (h.world.getBlock(x, y, z) !== 'air') continue; // 家具や ちょうちんの マスは 見ない
                checked++;
                if (h.world.darkForSpawn(x, y, z)) dark.push(`${x},${y},${z}`);
              }
            }
          }
          return { dark, checked };
        },
        { x0, z0, gy, w: FORM.w, d: FORM.d },
      );
      expect(lit.checked, '家の 中の 空気の マスを しらべた').toBeGreaterThan(10);
      expect(lit.dark, '夜でも 家の 中の どの マスも 湧かない').toEqual([]);
      // 家の 場所で 湧きを 止めて いない: ちょうちんを ほると まん中の 床の 上が 湧ける 場所に もどる
      const mid = { x: lantern.x, y: gy + 1, z: lantern.z };
      expect(await getBlock(page, lantern), 'まん中の 天井に ちょうちん').toBe(HB.lantern);
      await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.setBlock(x, y, z, 'air'), [lantern.x, lantern.y, lantern.z] as const);
      await settleWorld(page);
      expect(await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.darkForSpawn(x, y, z), [mid.x, mid.y, mid.z] as const), 'ちょうちんを ほると 湧ける').toBe(true);
      await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.setBlock(x, y, z, 'lantern'), [lantern.x, lantern.y, lantern.z] as const);
      await settleWorld(page);
      expect(await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.darkForSpawn(x, y, z), [mid.x, mid.y, mid.z] as const), 'もどすと また 湧かない').toBe(false);
    });

    // ---- ふとんで 寝る（AC27）。夜のまま
    await test.step('AC27 建てた 家の ふとんで 寝ると ひるの はじめ', async () => {
      const head = futonCells(FORM.furniture[0]!, at).head;
      await standAt(page, { x: x0 + 1 + 2 + 0.5, y: gy + 1, z: z0 + 1 + 1 + 0.5 }, 0); // 中の (2, 1)
      const t = await aimBlock(page, head, 1);
      expect(futonInfo(t?.id ?? ''), `ふとんを ねらえる（今: ${t?.id}）`).not.toBeNull();
      const before = await page.evaluate(() => (window as any).__rikkun.time.get());
      expect(before.phase).toBe('night');
      await tapRight(page);
      expect((await page.evaluate(() => (window as any).__rikkun.sleep.get())).sleeping, '右クリックで ねる').toBe(true);
      await page.evaluate((max) => {
        const h = (window as any).__rikkun;
        for (let i = 0; i < max && h.sleep.get().sleeping; i++) h.step(1);
      }, GADGET_TUNING.futon.sleepSteps + 300);
      const after = await page.evaluate(() => (window as any).__rikkun.time.get());
      expect((await page.evaluate(() => (window as any).__rikkun.sleep.get())).sleeping, 'おきた').toBe(false);
      expect(after.phase, 'ひるの はじめに おきる').toBe('day');
      expect(after.day, '次の 日').toBe(before.day + 1);
      await page.evaluate((t) => (window as any).__rikkun.time.set(t), DAY);
    });

    // ---- なまえを かえる（AC53）
    await test.step('AC53 なまえを かえる: 一覧 → 名前の 画面 → これで いい！ → つぎに 戸から 入ると 新しい 名前', async () => {
      await talkTo(page, first.id, 'hook');
      expect((await menuState(page)).buttons.find((b) => b.id === 'rename')?.enabled, '家が あれば なまえを かえる は 押せる').toBe(true);
      await clickBtn(page, 'rename');
      let m = await menuState(page);
      expect(m.page, '建てた 家の 一覧').toBe('rename');
      expect(squash(m.bubble), '一覧の ふきだし').toBe(squash('どの いえの なまえを かえる？'));
      expect(m.buttons.map((b) => b.id), '家 1 けんを えらぶ ボタン').toContain(`renamePick-${rec.id}`);
      await clickBtn(page, `renamePick-${rec.id}`);
      m = await menuState(page);
      expect(m.page, '名前の 画面').toBe('renameName');
      const renaming = () => page.evaluate(() => (window as any).__rikkun.house.renaming());
      expect(await renaming(), 'はじめは 今の 名前').toEqual({ id: rec.id, name: { front: FORM.front, back: FORM.back } });
      // やめる: 何も かわらない
      await clickBtn(page, 'erase');
      await clickBtn(page, 'renameCancel');
      expect((await houses(page))[0]!.name, 'やめると 名前は かわらない').toBe(NAME);
      expect((await menuState(page)).page, 'やめると 上の メニューに もどる').toBe('top');
      await clickBtn(page, 'rename');
      await clickBtn(page, `renamePick-${rec.id}`);
      expect((await renaming())?.name, 'やめた 分は のこらない').toEqual({ front: FORM.front, back: FORM.back });
      // 前の 文字 0 字では かわらない
      for (let i = 0; i < [...FORM.front].length; i++) await clickBtn(page, 'erase');
      await clickBtn(page, 'renameOk');
      m = await menuState(page);
      expect(squash(m.bubble), '前の 文字が 0 字').toBe(squash(MSG.noName));
      expect(m.page, '名前の 画面の まま').toBe('renameName');
      expect((await houses(page))[0]!.name, '0 字では かわらない').toBe(NAME);
      // 新しい 名前
      for (const ch of [...NEW_FRONT]) await clickBtn(page, `char-${ch}`);
      await clickBtn(page, NEW_BACK_BTN);
      expect((await renaming())?.name, '打った 名前').toEqual({ front: NEW_FRONT, back: 'ひみつきち' });
      await clickBtn(page, 'renameOk');
      expect((await houses(page))[0]!.name, '家の 名前が かわる').toBe(NEW_NAME);
      expect((await blueprints(page))[0]!.name, 'その 家を 建てた せっけいずの 名前は かわらない').toEqual({ front: FORM.front, back: FORM.back });
      await press(page, 'close');
      // つぎに 戸から 入ると 新しい 名前
      expect(await bandOf(page), '帯は 消えて いる').toBeNull();
      const w = await enterThroughDoor(page, door);
      expect(w.trace.find((s) => s.band !== null)?.band, '新しい 名前の 帯').toBe(NEW_NAME);
      await stepUi(page, 200);
    });

    // ---- ほる（AC52）
    await test.step('AC52 かべを ほる → いえの かべ 1 こ。戸を ほると 2 マス 消えて 記録も 消える', async () => {
      await page.evaluate((d) => (window as any).__rikkun.settings.set('dropMax', d), DROP_ONE);
      await emptyHand(page);
      const wall: Pt = { x: x0 + 1, y: gy + 1, z: z0 + od - 1 }; // まえの かべの 左はし・1 段目
      await standAt(page, { x: wall.x + 0.5, y: gy + 1, z: wall.z + 3 }, 0);
      const tw = await aimBlock(page, wall, 0.5);
      expect(tw?.id, 'かべを ねらえる').toBe(HB.wall);
      const wallsBefore = await countOf(page, HB.wall);
      const dw = await digAimed(page);
      expect(dw.ready, 'かべを ほれる').toBe(true);
      expect(await getBlock(page, wall), 'かべが 消える').toBe('air');
      expect(await countOf(page, HB.wall), 'いえの かべが 1 こ ふえる').toBe(wallsBefore + 1);
      expect(await houses(page), 'かべを ほっても 家の 記録は のこる').toHaveLength(1);

      // 戸（上の マスを ねらう）
      const upper: Pt = { ...door, y: door.y + 1 };
      await standAt(page, outsideDoor(door), 0);
      const td = await aimBlock(page, upper, 0.5);
      expect(td?.id.startsWith(DOOR_PREFIX), `戸の 上の マスを ねらえる（今: ${td?.id}）`).toBe(true);
      const doorsBefore = await countOf(page, HB.door);
      const dd = await digAimed(page);
      expect(dd.ready, '戸を ほれる').toBe(true);
      expect(await getBlock(page, door), '戸の 下も 消える').toBe('air');
      expect(await getBlock(page, upper), '戸の 上も 消える').toBe('air');
      expect(await countOf(page, HB.door), 'いえの と が 1 こ（2 こに ならない）').toBe(doorsBefore + 1);
      expect(await houses(page), '戸を ほると 家の 記録が 消える').toEqual([]);
      expect((await blockAt(page, door.x, door.y, door.z)).item, '戸の あとは 空気').toBeNull();

      // 記録が ないので 入っても 帯は 出ない
      const wGap = await enterThroughDoor(page, door);
      expect(wGap.end.z, '戸の あとから 中に 入れる').toBeLessThan(door.z);
      expect(wGap.trace.every((s) => s.band === null), '記録が ない 家では 帯は 出ない').toBe(true);

      // 同じ 所に 置き直しても 記録は もどらない
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const i = (h.inventory.get().slots as ({ item: string } | null)[]).findIndex((s) => s?.item === 'house_door');
        h.inventory.select(i);
        h.step(1);
      });
      await standAt(page, outsideDoor(door), 0);
      await aimBlock(page, { x: door.x, y: door.y - 1, z: door.z }, 1); // 戸の 下の 床の 上の 面
      await tapRight(page);
      expect((await getBlock(page, door)).startsWith(DOOR_PREFIX), '戸を 置き直せた').toBe(true);
      expect(await houses(page), '置き直しても 記録は もどらない').toEqual([]);

      // なまえを かえる にも 出ない
      await talkTo(page, first.id, 'hook');
      expect((await menuState(page)).buttons.find((b) => b.id === 'rename')?.enabled, '記録が 無いので なまえを かえる は 押せない').toBe(false);
      await press(page, 'close');
    });
  });
});
