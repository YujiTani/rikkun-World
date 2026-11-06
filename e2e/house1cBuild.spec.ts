import { expect, test } from '@playwright/test';
import { doorIndex } from '../src/house/editor/model';
import { menuState, openHouse, press, shownTid, stepUi, talkTo } from './helpers/house';
import { blueprints, clickDisabled, firstArchitect, needOf, plainText, reopenHouse, squash } from './helpers/houseEditor';
import {
  aimBlock,
  bandOf,
  emptyHand,
  enterThroughDoor,
  houses,
  makeBlueprint,
  outsideDoor,
  scanBox,
  settleWorld,
  shapeMismatches,
  standAt,
  tapRight,
  walk,
  wantedCells,
  type HouseForm,
  type Pt,
} from './helpers/houseBuilt';
import {
  BUILD_WORDS,
  HAMMER_RE,
  MSG_SITE,
  afterBuild,
  buildingOf,
  celebrateOf,
  clickAt,
  countName,
  cursorOf,
  doorOf,
  drainSfx,
  firstBonusOf,
  inBox,
  layYard,
  pressKey,
  setBuildTicks,
  setNight,
  sitesOf,
  stockMaterials,
  stockNow,
  talkNear,
  tally,
  tryEditSite,
  watchSpawns,
} from './helpers/houseSite';

/**
 * HOUSE-1C PR-2（#340）の 建てる 通し 1 本（#311。docs/design/HOUSE-1.md §2.8〜2.10・§3.4・§4.1・§4.5〜4.7・§5、AC18〜AC23・AC25・AC26・AC31・AC32c・AC36・AC39〜AC41・AC49・AC51）:
 * せっけいず → けんちくを はじめる（材料が たりない → おまけで ふとんは 要らない）→ 場所が ない → 上空の 視点（緑の 場所・わく・決定・確かめ）→ ［ここに たてる］→
 * 建築中（進み・のこりの 言い方・足場・歩いて 入れない・夜でも 湧かない・置く／ほるが 失敗・40% で セーブ → 開きなおし）→ 完成（足場が 消える・紙ふぶき と ファンファーレ 1 回）→ 戸から 入れる。
 * 数式（建築の 時間・言い方の 分け目）の 細かい 境目と 場所の 判定は ユニット（票「テストの 準備（PR-2）」）。窓口の 約束は e2e/helpers/house.ts の 先頭「1C PR-2 の 約束」。
 * 時間では 待たず step の 数で 進める。建築の 長さは テスト用の 設定 houseBuildTicks で 短くする。
 */

/** 建築の 長さ（ステップ）。1/3 ＝ 600・4/5 ＝ 1,440 の 前後を サンプルする。仕様の 式〔5×5 は 9,000〕ではなく テスト用の 設定 */
const BUILD_TICKS = 1800;
const CHUNK = 100;
/** 建築中の 湧かない はんいの 半径（仕様 §4.6。まん中から 横 16 マス）。中心の ずれ 0.5 を 見こんで 1 マス 引く */
const NO_SPAWN_R = 16;

const FORM: HouseForm = {
  w: 5,
  d: 5,
  windows: 2,
  front: 'もも',
  back: 'のいえ',
  furniture: [
    { kind: 'futon', x: 0, z: 0, rot: 1 },
    { kind: 'chair', x: 4, z: 0, rot: 0 },
  ],
};
const NAME = FORM.front + FORM.back;
const OUT_W = FORM.w + 2;
const OUT_D = FORM.d + 2;

/** 進みから 期待する 言い方（決定 2026-10-31。分け目は 3 分の 1・5 分の 4） */
const wordFor = (elapsed: number, length: number): string => (elapsed * 3 < length ? BUILD_WORDS[0] : elapsed * 5 < length * 4 ? BUILD_WORDS[1] : BUILD_WORDS[2]);

test.describe('HOUSE-1C PR-2 建築', () => {
  test('AC18〜AC22・AC31（建築中は 1 けんだけ）・AC32c・AC39〜AC41・AC51・AC36・AC49: せっけいず → 上空の 視点 → 確かめ → 建築中 → 完成 → 戸から 入る', async ({ page }) => {
    test.setTimeout(420_000);
    await openHouse(page, '?seed=7'); // ?nosave=1 を つけない（保存する 世界。AC32c で セーブ → 開きなおす）
    const first = await firstArchitect(page);
    // 紙ふぶきの 基準（AC36）。あずける・話す・せっけいずを 作る・建築中では ふえない ことを あとで 見る
    const confetti0 = (await celebrateOf(page)).confetti;

    // ---- せっけいずが 1 まいも ない（AC18）: 押せて、一覧に ならず ふきだしだけ
    await test.step('AC18 せっけいずが 0 まい → 一覧に ならず ふきだし', async () => {
      expect(await blueprints(page), 'せっけいずは まだ ない').toEqual([]);
      await talkTo(page, first.id, 'hook');
      expect((await menuState(page)).buttons.find((b) => b.id === 'build')?.enabled, 'せっけいずが なくても「けんちくを はじめる」は 押せる').toBe(true);
      const m = await press(page, 'build');
      expect(m.page, '一覧には ならない').toBe('top');
      expect(squash(m.bubble), 'ふきだし').toBe(squash(MSG_SITE.noPlan));
      await press(page, 'close');
    });

    // ---- せっけいずを 1 まい（PR-1 と 同じ 道）。この 世界は まだ 1 けんも 建て はじめて いない
    const number = await makeBlueprint(page, FORM);
    const slot = (await blueprints(page)).find((b) => b.number === number)!.slot;
    expect(await firstBonusOf(page), 'まだ 1 けんも 建て はじめて いない').toBe(true);
    const rows0 = await needOf(page, slot);
    const rowOf = (item: string) => rows0.find((r) => r.item === item);
    expect(rowOf('cloth'), 'ふとんの ぬの ＝ おまけ（必要 0・おまけ 3）').toMatchObject({ need: 0, bonus: 3 });
    expect(rowOf('string'), 'ふとんの いと ＝ おまけ（必要 0・おまけ 1）').toMatchObject({ need: 0, bonus: 1 });
    expect(rowOf('log')?.need, '材料の 計算は 1B の まま（き が いる）').toBeGreaterThan(0);

    // ---- けんちくを はじめる（AC18）: 材料が たりない → 押せない（押すと ひつような もの）
    await test.step('AC18 材料が たりない せっけいずは 押せない（押すと ひつような もの）', async () => {
      await talkTo(page, first.id, 'hook');
      const top = await menuState(page);
      expect(top.buttons.find((b) => b.id === 'build')?.enabled, '建築中でなければ「けんちくを はじめる」は 押せる').toBe(true);
      const pick = await press(page, 'build');
      expect(pick.page, 'せっけいずの 一覧').toBe('pick');
      expect(pick.buttons.find((b) => b.id === `pick-${slot}`)?.enabled, 'もちものにも 近くの たんすにも 材料が ない → たりなくて 押せない').toBe(false);
      await clickDisabled(page, `pick-${slot}`); // うすい カード（aria-disabled。disabled では ない）を 本物の マウスで 1 回
      const need = await menuState(page);
      expect(need.page, '押すと ひつような もの').toBe('need');
      expect((await needOf(page, slot)).some((r) => r.short >= 1), 'たりない 物が ある').toBe(true);
      expect(squash(need.bubble), 'ふきだし').toBe(squash(MSG_SITE.short));
      await press(page, 'close');
    });

    // ---- 材料を そろえる（1E: 半分は 近くの たんす・のこりは もちもの。+5 は き だけ）。ふとんの ぬの・いとは 0 のまま（おまけ）→ 押せる
    const stock = await stockMaterials(page, slot, { log: 5 });
    const stockItems = rows0.map((r) => r.item);
    const stockOf = (): Promise<Awaited<ReturnType<typeof stockNow>>> => stockNow(page, stock.at, stockItems);
    expect(stock.bag.cloth! + stock.tansu.cloth!, 'ぬの・いとは そろえて いない（おまけ）').toBe(0);
    expect(stock.bag.string! + stock.tansu.string!).toBe(0);
    expect(stock.tansu.log, 'き の 半分より 多い 分は たんすに ある').toBeGreaterThan(0);
    expect(stock.bag.log, 'き の のこりは もちものに ある').toBeGreaterThan(0);

    // ---- 場所が ない（かためた つちが 1 か所も ない）→ 上空の 視点に ならず ふきだし
    await test.step('AC19 かためた つちの 場所が ない → 上空の 視点に ならない', async () => {
      await talkTo(page, first.id, 'hook');
      const pick = await press(page, 'build');
      expect(pick.buttons.find((b) => b.id === `pick-${slot}`)?.enabled, 'ぬの・いとが 0 でも（おまけ）ほかが そろえば 押せる').toBe(true);
      const m = await press(page, 'pick', slot);
      expect(m.page, '上空の 視点には ならない').toBe('pick');
      expect(squash(m.bubble), 'ふきだし').toBe(squash(MSG_SITE.noSite));
      expect(await sitesOf(page), '置ける 場所は ない').toEqual([]);
      await press(page, 'close');
    });

    // ---- 場所を 用意: 外 7×7 の かためた つち（1 か所）と、1 列 たりない まぎらわしい 場所
    const yard = await layYard(page, first, OUT_W, OUT_D);
    const at: Pt = yard.site;
    const door = doorOf(FORM, at);
    expect(door.x, '戸の 場所は model.ts の 式').toBe(at.x + 1 + doorIndex(FORM));
    await settleWorld(page);

    // ---- 上空の 視点（AC19・AC20）
    await test.step('AC19・AC20 上空の 視点: 緑の 場所は 1 か所 → わく → 決定 → 確かめの まど → やめる／［ここに たてる］', async () => {
      await talkTo(page, first.id, 'hook');
      await press(page, 'build');
      const sky = await press(page, 'pick', slot);
      expect(sky.page, '上空の 視点').toBe('sky');
      expect(sky.open, '上空の 視点の 間は メニュー扱い（時間が 止まる）').toBe(true);
      // 上空の 視点の 間も 時が 止まる（AC41）。わくも 勝手には うごかない（screen は カメラの なめらかな 動きで かわりうるので 見ない）
      const dayTick = (): Promise<number> => page.evaluate(() => (window as any).__rikkun.time.get().dayTick as number);
      const skyTick = await dayTick();
      const skyCursor = await cursorOf(page);
      await stepUi(page, 60);
      expect(await dayTick(), '上空の 視点の 間は 時刻が 止まる').toBe(skyTick);
      const skyAfter = await cursorOf(page);
      expect({ x: skyAfter?.x, z: skyAfter?.z, ok: skyAfter?.ok, confirm: skyAfter?.confirm }, 'わくは そのまま').toEqual({ x: skyCursor?.x, z: skyCursor?.z, ok: skyCursor?.ok, confirm: skyCursor?.confirm });
      expect(await sitesOf(page), '置ける 場所は 1 か所だけ（1 列 たりない 場所は 数えない）').toEqual([at]);
      const c0 = await cursorOf(page);
      expect(c0, 'わく').toMatchObject({ x: at.x, z: at.z, ok: true, confirm: false });
      expect(await buildingOf(page), 'まだ 建築は 始まって いない').toBeNull();

      // 矢印で 1 マス（置けない 所は ok false）→ もどす
      await pressKey(page, 'ArrowRight');
      expect(await cursorOf(page), '矢印で 1 マス').toMatchObject({ x: at.x + 1, z: at.z, ok: false });
      await pressKey(page, 'ArrowLeft');
      expect(await cursorOf(page), 'もどす').toMatchObject({ x: at.x, z: at.z, ok: true });

      // 左クリックで 決定 → 確かめの まど。［やめる］で まどだけ とじる（わくは そのまま）
      await clickAt(page, c0!.screen);
      expect(await cursorOf(page), '左クリックで 確かめの まど').toMatchObject({ x: at.x, z: at.z, confirm: true });
      expect(await buildingOf(page), '確かめの 間は まだ 建築しない').toBeNull();
      expect(await stockOf(), '確かめの 間は 材料が へらない').toEqual(stock);
      await expect(shownTid(page, 'house-confirm').first(), '確かめの まど').toBeVisible();
      expect(await plainText(page, 'house-confirm'), '2 行目に せっけいずの 名前').toContain(NAME);
      const no = await press(page, 'no');
      expect(no.page, '［やめる］で 上空の 視点に もどる').toBe('sky');
      expect(await cursorOf(page), 'わくは そのまま').toMatchObject({ x: at.x, z: at.z, confirm: false });

      // Enter で 決定 → Esc で まどだけ とじる → もう 1 度 Esc で 一覧へ（何も へらない）
      await pressKey(page, 'Enter');
      expect((await cursorOf(page))?.confirm, 'Enter で 確かめの まど').toBe(true);
      await pressKey(page, 'Escape');
      expect(await cursorOf(page), 'Esc で まどだけ とじる').toMatchObject({ confirm: false });
      expect((await menuState(page)).page).toBe('sky');
      await pressKey(page, 'Escape');
      expect((await menuState(page)).page, 'まどが ない ときの Esc で 一覧へ').toBe('pick');
      expect(await stockOf(), 'もどっても 材料は へらない').toEqual(stock);
      expect(await buildingOf(page)).toBeNull();

      // もう 1 度 えらんで Enter → Enter（［ここに たてる］）
      await press(page, 'pick', slot);
      expect((await menuState(page)).page).toBe('sky');
      await setBuildTicks(page, BUILD_TICKS);
      await drainSfx(page);
      await pressKey(page, 'Enter');
      expect((await cursorOf(page))?.confirm).toBe(true);
      await pressKey(page, 'Enter');
    });

    // ---- 建築開始（AC20・AC51）
    const b0 = await buildingOf(page);
    await test.step('AC20・AC51 建築開始: 材料が ちょうど へる・せっけいずは のこる・おまけ', async () => {
      expect(b0, '建築が 始まった').not.toBeNull();
      expect((await menuState(page)).open, '上空の 視点は おわった').toBe(false);
      expect(b0).toMatchObject({ name: NAME, w: FORM.w, d: FORM.d, at });
      expect(b0!.leftTicks + Math.round(b0!.progress * BUILD_TICKS), '長さ ＝ のこり ＋ たった').toBe(BUILD_TICKS);
      expect(b0!.progress, '始まった ばかり').toBeLessThan(CHUNK / BUILD_TICKS);
      expect(squash(b0!.leftText)).toBe(squash(BUILD_WORDS[0]));
      // 1E AC20b: たんす〔近い 順〕→ もちもの の 順に 必要な 分だけ へった（たんすが 先に 空に なる）
      const after = await stockOf();
      expect(after, '必要な 分だけ・たんす → もちもの の 順に へった').toEqual(afterBuild(stock, rows0));
      for (const r of rows0) expect(after.tansu[r.item]! + after.bag[r.item]!, `${r.item}: 合計から 必要な 分だけ へった`).toBe(stock.tansu[r.item]! + stock.bag[r.item]! - r.need);
      expect(await firstBonusOf(page), 'はじめての 家の おまけを 使った').toBe(false);
      expect((await blueprints(page)).map((b) => b.number), 'せっけいずは のこる').toContain(number);
      expect(countName(await drainSfx(page), /^tonkachiStart$/), '［ここに たてる］の 合図').toBe(1);
      // 建築を 始めた 建築士さんは 戸の 前に うつる（AC40）
      const a = (await page.evaluate(() => (window as any).__rikkun.house.architects())).find((x: { id: unknown }) => x.id === first.id);
      expect(Math.hypot(a.x - (door.x + 0.5), a.z - (door.z + 1.5)), '戸の 前（3 マス 以内で うろうろ）に うつった').toBeLessThanOrEqual(4);
    });

    // ---- 足場・歩いて 入れない（AC39）・時間が 止まる 間は 進まない（AC41）
    await test.step('AC39・AC41 足場が 立つ・歩いて 入れない・メニューの 間は 進まない', async () => {
      await settleWorld(page);
      const t0 = tally(await scanBox(page, at, OUT_W, OUT_D));
      expect(t0.scaffold, '足場が 立って いる（アイテムに ならない 固い ブロック）').toBeGreaterThan(0);
      expect(t0.wall, '進み 15% までは 足場だけ（かべは まだ）').toBe(0);
      await emptyHand(page);
      const w = await walk(page, { from: { x: door.x + 0.5, y: door.y, z: door.z + 4 }, yaw: 0, axis: 'z', dir: -1, until: at.z + 1, max: 90 });
      expect(w.end.z, '戸の 方へ 歩いても 場所の 外の まま').toBeGreaterThanOrEqual(at.z + OUT_D);
      // 建築士さんに 話す: メニューの 間は 建築の 進みも 時刻も 止まる
      const m = await talkNear(page, first.id);
      expect(m.page).toBe('top');
      expect(m.buttons.find((x) => x.id === 'build')?.enabled, '建築中は「けんちくを はじめる」が 押せない').toBe(false);
      const b1 = await buildingOf(page);
      expect(squash(m.bubble), 'ふきだしに 名前と 言い方').toContain(squash(NAME));
      expect(squash(m.bubble)).toContain(squash(b1!.leftText));
      const time0 = await page.evaluate(() => (window as any).__rikkun.time.get().dayTick as number);
      await stepUi(page, 600);
      const b2 = await buildingOf(page);
      expect(b2!.leftTicks, 'メニューが 開いて いる 間は 建築が 進まない').toBe(b1!.leftTicks);
      expect(await page.evaluate(() => (window as any).__rikkun.time.get().dayTick as number), '時刻も 止まる').toBe(time0);
      await press(page, 'close');
    });

    // ---- とんかち: 戸から 16 マス 以内だけ 鳴る（PO 決め。音 案 A の 決定文書）。1 秒に 1 回 ふりおろす ので 180 ステップで 数回
    await test.step('AC37 とんかちは 戸から 16 マス 以内で 鳴り、それより 遠いと 鳴らない', async () => {
      await drainSfx(page);
      await standAt(page, { x: door.x + 0.5, y: door.y, z: door.z + 4 }, 0);
      await page.evaluate(() => (window as any).__rikkun.step(180));
      expect(countName(await drainSfx(page), HAMMER_RE), '戸の 4 マス 南では とんかちが 鳴る').toBeGreaterThan(0);
      await standAt(page, { x: door.x + 0.5, y: door.y, z: door.z + 18 }, 0);
      await drainSfx(page);
      await page.evaluate(() => (window as any).__rikkun.step(180));
      expect(countName(await drainSfx(page), HAMMER_RE), '戸から 18 マス はなれると とんかちは 鳴らない').toBe(0);
    });

    // ---- 夜でも 建築中の まわりでは 湧かない（AC23）。40% まで すすめながら 湧いた 場所を 集める
    const spawns: { x: number; y: number; z: number }[] = [];
    const cx = at.x + OUT_W / 2;
    const cz = at.z + OUT_D / 2;
    const stand: Pt = { x: door.x + 0.5, y: door.y, z: door.z + 4 };
    const phraseCheck = async (): Promise<{ b: NonNullable<Awaited<ReturnType<typeof buildingOf>>>; elapsed: number }> => {
      const b = (await buildingOf(page))!;
      const elapsed = BUILD_TICKS - b.leftTicks;
      expect(b.progress, '進み ＝ たった ÷ 長さ').toBeCloseTo(elapsed / BUILD_TICKS, 3);
      expect(squash(b.leftText), `進み ${Math.round((elapsed / BUILD_TICKS) * 100)}% の 言い方`).toBe(squash(wordFor(elapsed, BUILD_TICKS)));
      return { b, elapsed };
    };
    const runTo = async (target: number): Promise<number> => {
      let last = BUILD_TICKS - (await buildingOf(page))!.leftTicks;
      while (last < target) {
        spawns.push(...(await watchSpawns(page, Math.min(CHUNK, target - last))));
        const { elapsed } = await phraseCheck();
        expect(elapsed, '建築は 進む').toBeGreaterThan(last);
        last = elapsed;
      }
      return last;
    };
    await standAt(page, stand, 0);
    await setNight(page, true);
    const prog: number[] = [];
    await test.step('AC21・AC22・AC23 進み: のこりの 言い方が 3 つに かわる・夜でも 湧かない・かべが ふえる（40% まで）', async () => {
      await runTo(Math.floor(BUILD_TICKS * 0.4));
      prog.push(tally(await scanBox(page, at, OUT_W, OUT_D)).wall);
      expect(prog[0], '15% を すぎたら かべが 立ちはじめる').toBeGreaterThan(0);
    });

    // ---- 40% で セーブ → 開きなおす（AC32c）
    const beforeSave = await buildingOf(page);
    const cellsBefore = await scanBox(page, at, OUT_W, OUT_D);
    await test.step('AC32c 建築中に セーブ → 開きなおすと 同じ 進み・同じ 世界の ブロック', async () => {
      await page.evaluate(() => (window as any).__rikkun.save.now());
      await reopenHouse(page);
      const after = await buildingOf(page);
      expect(after, '建築は つづいて いる').not.toBeNull();
      expect({ name: after!.name, w: after!.w, d: after!.d, at: after!.at }, '名前・大きさ・場所が 同じ').toEqual({ name: beforeSave!.name, w: beforeSave!.w, d: beforeSave!.d, at: beforeSave!.at });
      // ページを 開きなおす 間（読みこみ〜一時停止）に 世界の 時計が 数ステップ（実測 7〜8）すすむ ので、のこりは その ぶんだけ 少なくなる。40% の まま つづく（0 から やりなおし でも 先へ とんでも ない）ことを 見る ため、1 秒（60 ステップ）まで ゆるす
      expect(beforeSave!.leftTicks - after!.leftTicks, 'のこりは 保存の ときより 増えない').toBeGreaterThanOrEqual(0);
      expect(beforeSave!.leftTicks - after!.leftTicks, 'のこりは 保存の とおり（開きなおしの 読みこみ 中の 数ステップ ぶんだけ 進む）').toBeLessThanOrEqual(60);
      expect(after!.leftTicks + Math.round(after!.progress * BUILD_TICKS), '長さは 保存した 長さの まま（設定を もう 1 度 入れなくても）').toBe(BUILD_TICKS);
      const cellsAfter = await scanBox(page, at, OUT_W, OUT_D);
      expect(tally(cellsAfter).scaffold, '足場は 保存の とおりに もどる（数は 同じ）').toBe(tally(cellsBefore).scaffold);
      const diff = Object.keys(cellsBefore).filter((k) => cellsBefore[k]!.id !== cellsAfter[k]?.id);
      expect(diff.filter((k) => cellsBefore[k]!.id !== 'house_wall' && cellsAfter[k]?.id !== 'house_wall'), 'ちがう マスは かべだけ').toEqual([]);
      expect(diff.length, 'かべが 保存の とおりに もどる（開きなおしの 数ステップ ぶんの ずれは ゆるす）').toBeLessThanOrEqual(6);
      expect(await houses(page), 'まだ 完成して いないので 家の 記録は ない').toEqual([]);
    });

    // ---- 55%: 建築士さんに 話す・置く／ほるが 失敗（AC39）。保存から もどした あとでも 守られる
    await standAt(page, stand, 0);
    await setNight(page, true);
    await test.step('AC39 建築中の 場所は 置けない・ほれない（開きなおした あとも）', async () => {
      await runTo(Math.floor(BUILD_TICKS * 0.55));
      await page.evaluate(() => (window as any).__rikkun.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 }));
      await page.evaluate(() => (window as any).__rikkun.settings.set('yokaiAutoSpawn', false)); // 空中で ためす 間は 妖怪を 出さない
      const r = await tryEditSite(page, at, OUT_W, OUT_D, door.x);
      expect(r.dig.after, 'ほろうと しても ブロックは そのまま').toBe(r.dig.before);
      expect(r.place.after, '置こうと しても そのまま').toBe(r.place.before);
      expect(r.bag.after, '持ち物の つちは ふえも へりも しない（ほれて いない・置けて いない）').toBe(r.bag.before);
      expect(inBox(r.dig.block, at, OUT_W, OUT_D) && inBox(r.place.cell, at, OUT_W, OUT_D), '箱の 中で ためした').toBe(true);
      await standAt(page, stand, 0);
      await setNight(page, true);
    });

    // ---- 85% すぎ: 屋根・ちょうちん。かべは ふえつづけて きた
    await test.step('AC21 85% すぎは 屋根・家具・ちょうちん', async () => {
      const cells55 = await scanBox(page, at, OUT_W, OUT_D);
      const t55 = tally(cells55);
      expect(t55.roof, '55% では 屋根は まだ').toBe(0);
      expect(t55.wall, 'かべは 40% より ふえた').toBeGreaterThanOrEqual(prog[0]!);
      await runTo(Math.floor(BUILD_TICKS * 0.93));
      const cells93 = await scanBox(page, at, OUT_W, OUT_D);
      const t93 = tally(cells93);
      // 屋根・床・家具・ちょうちんの どれから 立つかは 決めない: 55% に 無かった 種類（かべ・足場・窓・戸 いがい）が ふえて いれば よい
      const lateKinds = (cells: Awaited<ReturnType<typeof scanBox>>): Set<string> =>
        new Set(Object.values(cells).filter((c) => c.id !== 'air' && c.item !== null && !['house_wall', 'shoji', 'house_door'].includes(c.id)).map((c) => c.id));
      const k55 = lateKinds(cells55);
      expect([...lateKinds(cells93)].filter((k) => !k55.has(k)), '85% を すぎたら 屋根・床・家具・ちょうちんの どれかが 立ちはじめる').not.toEqual([]);
      expect(t93.wall, 'かべは そろって いる').toBeGreaterThanOrEqual(t55.wall);
    });

    // ---- 夜の 見張りの 結果（AC23）
    await test.step('AC23 建築中の まわり（まん中から 横 16 マス 以内）には 夜でも 湧かなかった。そとでは 湧いた（対照）', async () => {
      const inside = spawns.filter((p) => Math.hypot(p.x - cx, p.z - cz) <= NO_SPAWN_R - 1);
      expect(spawns.length, '対照: 同じ 間に 湧きは ある（0 回で 通って しまわない）').toBeGreaterThan(0);
      expect(inside, '建築中の まわりには 湧かない').toEqual([]);
    });

    // ---- 完成の 1 ステップ 前 → 完成（AC21・AC36・AC49）
    await setNight(page, false);
    await page.evaluate(() => (window as any).__rikkun.time.set(14000)); // ひるに する（夜の 見張りは おわり。完成の ステップで 夜の 湧きが 入りこまない ように）
    await standAt(page, stand, 0);
    expect((await celebrateOf(page)).confetti, 'あずける・話す・せっけいずが できた・建築中では 紙ふぶきは 出ない').toBe(confetti0);
    await drainSfx(page);
    await test.step('AC21 完成の 1 ステップ 前は まだ 建築中・次の ステップで 完成', async () => {
      let b = (await buildingOf(page))!;
      while (b.leftTicks > 1) {
        await page.evaluate((n) => (window as any).__rikkun.step(n), Math.min(CHUNK, b.leftTicks - 1));
        b = (await buildingOf(page))!;
        expect(squash(b.leftText)).toBe(squash(wordFor(BUILD_TICKS - b.leftTicks, BUILD_TICKS)));
      }
      expect(b.leftTicks, '完成の 1 ステップ 前').toBe(1);
      expect(squash(b.leftText), '終わりごろは もうすぐ').toBe(squash(BUILD_WORDS[2]));
      expect((await celebrateOf(page)).confetti, 'まだ 紙ふぶきは 出ない').toBe(confetti0);
      expect(await houses(page), 'まだ 家の 記録は ない').toEqual([]);
      await stepUi(page, 1);
      expect(await buildingOf(page), '完成: 建築中でなくなる').toBeNull();
    });
    await test.step('AC36・AC49 完成: 形は せっけいずどおり・足場が 消える・紙ふぶき と ファンファーレ 1 回', async () => {
      await settleWorld(page);
      const cells = await scanBox(page, at, OUT_W, OUT_D);
      expect(tally(cells).scaffold, '足場は ぜんぶ 消えた').toBe(0);
      expect(shapeMismatches(wantedCells(FORM, at), cells), '形が せっけいずどおり（ゆか・かべ・やね・戸・窓・ちょうちん・家具）').toEqual([]);
      const hs = await houses(page);
      expect(hs, '家の 記録が 1 件').toHaveLength(1);
      expect(hs[0]).toMatchObject({ name: NAME, number, outer: { w: OUT_W, d: OUT_D }, doorOpen: false });
      expect(hs[0]!.door, '戸の 場所').toEqual(door);
      const cel = await celebrateOf(page);
      expect(cel.confetti - confetti0, '紙ふぶきは ちょうど 1 回').toBe(1);
      expect(squash(cel.banner?.text ?? ''), '上の 帯「<名前> が できた！」').toBe(squash(`${NAME} が できた！`));
      await expect(shownTid(page, 'house-done-banner').first()).toBeVisible();
      expect(countName(await drainSfx(page), /^houseDone$/), 'ファンファーレは ちょうど 1 回').toBe(1);
      await stepUi(page, 300);
      expect((await celebrateOf(page)).confetti - confetti0, 'そのあと 出つづけない').toBe(1);
      const later = await drainSfx(page);
      expect(countName(later, /^houseDone$/), 'ファンファーレは くり返さない').toBe(0);
      expect(countName(later, HAMMER_RE), 'もう とんかちは 鳴らない').toBe(0);
    });

    // ---- 戸から 入れる（AC25・AC26）
    await test.step('AC25・AC26 戸は しまって いる → あけると 戸から 入れて 名前の 帯が 出る', async () => {
      await emptyHand(page);
      const blocked = await walk(page, { from: outsideDoor(door), yaw: 0, axis: 'z', dir: -1, until: door.z - 1.5, max: 120 });
      expect(blocked.end.z, 'しまった 戸は 通れない').toBeGreaterThan(door.z + 0.5);
      await standAt(page, outsideDoor(door), 0);
      await aimBlock(page, door, 0.5);
      await tapRight(page);
      expect((await houses(page))[0]!.doorOpen, '右クリックで 戸が あく').toBe(true);
      const w = await enterThroughDoor(page, door);
      expect(w.end.z, 'あいた 戸から 中へ 入れた').toBeLessThan(door.z);
      expect(w.trace.find((s) => s.band !== null)?.band, '戸から 入ると 家の 名前の 帯').toBe(NAME);
      expect((await bandOf(page))?.text).toBe(NAME);
    });

    // ---- 家の 数に 上限は ない / 建築中は もう 1 けん 始まらない（AC31）は ユニット。ここでは 2 けん目を 始められる ことだけ（材料は 要る）
    await test.step('AC51 2 けん目は おまけが ない（ぬの・いとが いる）', async () => {
      expect(await firstBonusOf(page), 'おまけは 1 けん目だけ').toBe(false);
      const rows = await needOf(page, slot);
      expect(rows.find((r) => r.item === 'cloth'), '2 けん目から ぬの 3').toMatchObject({ need: 3, bonus: 0 });
      expect(rows.find((r) => r.item === 'string'), '2 けん目から いと 1').toMatchObject({ need: 1, bonus: 0 });
    });
  });
});
