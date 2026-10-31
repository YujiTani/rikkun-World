import { expect, type Page } from '@playwright/test';
import { doorIndex } from '../../src/house/editor/model';
import { architects, openHouse, press, putTansu, talkTo, tansuHas, type MenuState, type Pos3 } from './house';
import { blueprints, ed, firstArchitect, needOf, openEditorFast, setForm } from './houseEditor';
import { LONGEST_NAME, standAt, type CellInfo, type HouseForm, type Pt } from './houseBuilt';

/**
 * HOUSE-1C PR-2（#340 地盤と 建築。docs/tickets/HOUSE-1C.md「PR-2」・docs/design/HOUSE-1.md §2.8〜2.10・§3.4・§4.4〜4.7・§6.1）の E2E・UI 検査が くり返し使う 準備。
 * フック（level・sites・cursor・building・firstBonus・celebrate・houseBuildTicks）と 画面の data-testid の 約束は e2e/helpers/house.ts の 先頭（「1C PR-2 の 約束」）。
 * 数・座標は 決め打ちしない: 場所は ゲーム（window.__rikkun）に 聞き、形の 期待は src/house/editor/model.ts から 作る。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * まだ ない フックを 呼ぶと「…が まだ ない」で 落ちる（実装の 前の 赤）。
 */

// ---------------------------------------------------------------- 窓口（hook）の 形

export interface LevelCell {
  x: number;
  z: number;
  state: 'high' | 'low' | 'ok';
}
export interface Level {
  base: Pt | null;
  cells: LevelCell[];
}
export interface Cursor {
  x: number;
  z: number;
  ok: boolean;
  confirm: boolean;
  screen: { x: number; y: number };
}
export interface Building {
  name: string;
  w: number;
  d: number;
  progress: number;
  leftTicks: number;
  leftText: string;
  at: Pt;
}
export interface Celebrate {
  confetti: number;
  banner: { text: string; ticksLeft: number } | null;
}

/** 建築士さんの 言い方（決定 docs/decisions/2026-10-31-house-build-time-words.md）。空白は くらべない */
export const BUILD_WORDS = ['はじめた ばかり だよ', 'まだまだ かかるよ', 'もうすぐ おわりそう！'] as const;
/** 場所が ない ときの ふきだし（§3）・材料が たりない ときの ふきだし */
export const MSG_SITE = {
  noSite: 'かためた つちの ばしょが ないよ。みずもり と どうづき で つくってね',
  short: 'ざいりょうが たりないよ',
  noPlan: 'せっけいずが ないよ。「せっけいずを つくる」で かいてね',
} as const;

/** 窓口 house[name](...args) を 呼ぶ。まだ 無ければ 分かりやすく 落とす（実装の 前の 赤） */
export async function hook<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  const r = await page.evaluate(
    ({ name, args }) => {
      const f = (window as any).__rikkun.house?.[name];
      if (typeof f !== 'function') return { missing: true as const };
      return { value: f.apply((window as any).__rikkun.house, args) };
    },
    { name, args },
  );
  expect('missing' in r ? name : null, `window.__rikkun.house.${name}（1C PR-2 の テスト用 フック。e2e/helpers/house.ts の 先頭）が まだ ない`).toBeNull();
  return (r as { value: T }).value;
}

export const levelOf = (page: Page): Promise<Level> => hook<Level>(page, 'level');
export const sitesOf = (page: Page): Promise<Pt[]> => hook<Pt[]>(page, 'sites');
export const cursorOf = (page: Page): Promise<Cursor | null> => hook<Cursor | null>(page, 'cursor');
export const buildingOf = (page: Page): Promise<Building | null> => hook<Building | null>(page, 'building');
export const firstBonusOf = (page: Page): Promise<boolean> => hook<boolean>(page, 'firstBonus');
export const celebrateOf = (page: Page): Promise<Celebrate> => hook<Celebrate>(page, 'celebrate');

/** 建築の 長さを n ステップに 固定（0 で 仕様の 式。初期値も 0）。テスト用の 設定 */
export const setBuildTicks = (page: Page, n: number): Promise<void> =>
  page.evaluate((n) => {
    (window as any).__rikkun.settings.set('houseBuildTicks', n);
  }, n);

/** 効果音の 記録を 読んで 空に する（名前の 並び） */
export const drainSfx = (page: Page): Promise<string[]> =>
  page.evaluate(() => ((window as any).__rikkun.audio.sfx() as { name: unknown }[]).map((r) => String(r.name)));

export const countName = (names: string[], re: RegExp): number => names.filter((n) => re.test(n)).length;
export const CALL_RE = /^dozukiCall[1-4]$/;
export const HAMMER_RE = /^tonkachi[23]?$/;

// ---------------------------------------------------------------- 手に 持つ・歩く・キー

/** 持ち物の ホットバーに item を 1 こ 用意して 手に 持つ（せっけいずなどの マスは つぶさない）。マスの 番号を 返す */
export const holdItem = (page: Page, item: string): Promise<number> =>
  page.evaluate((item) => {
    const h = (window as any).__rikkun;
    const slots = h.inventory.get().slots as ({ item: string } | null)[];
    let i = slots.findIndex((s, k) => k < 9 && s?.item === item);
    if (i < 0) {
      i = slots.findIndex((s, k) => k < 9 && !s);
      if (i < 0) return -1;
      h.inventory.setSlot(i, { item, count: 1 });
    }
    h.inventory.select(i);
    h.step(1);
    return i;
  }, item);

/** 本物の キーを 1 回 押して 2 ステップ 進める（Enter・Escape・ArrowRight …） */
export async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.evaluate(() => (window as any).__rikkun.step(2));
}

/** 本物の マウスで 画面の 位置を 押す（左クリック）。2 ステップ 進める */
export async function clickAt(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.mouse.move(p.x, p.y);
  await page.evaluate(() => (window as any).__rikkun.step(2));
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => (window as any).__rikkun.step(2));
}

// ---------------------------------------------------------------- 地面の 準備

/**
 * 四角 [xMin..xMax]×[zMin..zMax] を 平らな つち（dirt）の 床にして、その 上 14 段を 空気に する。床の 高さ gy（四角の まん中の 今の 地面）を 返す。
 * 草花・はっぱ・水も 消える。ライトと メッシュが おちつくまでは 進めない（呼ぶ 側が settleWorld）。
 */
export function layPad(page: Page, xMin: number, zMin: number, xMax: number, zMax: number): Promise<number> {
  return page.evaluate(
    ({ xMin, zMin, xMax, zMax }) => {
      const h = (window as any).__rikkun;
      const gy: number = h.world.groundHeight(Math.floor((xMin + xMax) / 2), Math.floor((zMin + zMax) / 2));
      h.world.fill(xMin, gy - 3, zMin, xMax, gy, zMax, 'dirt');
      h.world.fill(xMin, gy + 1, zMin, xMax, gy + 14, zMax, 'air');
      h.step(2);
      return gy;
    },
    { xMin, zMin, xMax, zMax },
  );
}

/** 床の 段（高さ y）の 四角 [x0..x0+w-1]×[z0..z0+d-1] を id の ブロックに する */
export function fillLayer(page: Page, x0: number, z0: number, w: number, d: number, y: number, id: string): Promise<void> {
  return page.evaluate(
    ({ x0, z0, w, d, y, id }) => {
      const h = (window as any).__rikkun;
      h.world.fill(x0, y, z0, x0 + w - 1, y, z0 + d - 1, id);
      h.step(2);
    },
    { x0, z0, w, d, y, id },
  );
}

export const blockOf = (page: Page, p: Pt): Promise<string> => page.evaluate(([x, y, z]) => (window as any).__rikkun.world.getBlock(x, y, z) as string, [p.x, p.y, p.z] as const);

export const itemCount = (page: Page, item: string): Promise<number> => page.evaluate((i) => (window as any).__rikkun.inventory.count(i) as number, item);

// ---------------------------------------------------------------- 建てる 場所（AC19）

export interface Yard {
  /** 床の 高さ */
  gy: number;
  /** 建てられる 場所（外の 箱の 北西の すみ。床の 段の 高さ） */
  site: Pt;
  /** 外の 寸法（よこ・たて） */
  outer: { w: number; d: number };
  /** 建てられない まぎらわしい 場所（外よこ × (外たて−1) だけ かためた つち）。北西の すみ */
  decoy: { x: number; z: number; w: number; d: number };
}

/**
 * 建築士さん a の 東 12 マスに、外の 寸法 outW×outD の かためた つちの 場所（1 か所）と、1 列 たりない まぎらわしい 場所（1 か所）を 用意する。
 * かためた つち（groundId。ふつうは `katame_tsuchi`）は `world.fill` で 直接 敷く（どうづきで たたく 通しは 地盤の spec）。ほかは つちの 平らな 床。
 */
export async function layYard(page: Page, a: { x: number; z: number }, outW: number, outD: number, groundId = 'katame_tsuchi'): Promise<Yard> {
  const x0 = Math.floor(a.x) + 12;
  const z0 = Math.floor(a.z) - 12;
  const zDecoy = z0 + outD + 8;
  const gy = await layPad(page, x0 - 4, z0 - 4, x0 + outW - 1 + 4, zDecoy + outD - 1 + 4);
  await fillLayer(page, x0, z0, outW, outD, gy, groundId);
  await fillLayer(page, x0, zDecoy, outW, outD - 1, gy, groundId);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(2);
  });
  return { gy, site: { x: x0, y: gy, z: z0 }, outer: { w: outW, d: outD }, decoy: { x: x0, z: zDecoy, w: outW, d: outD - 1 } };
}

/** 戸の 下の マス（PR-1 の houses()[i].door と 同じ）。at ＝ 場所の 北西の すみ（床の 段）、form ＝ せっけいずの 形 */
export const doorOf = (form: Pick<HouseForm, 'w' | 'd'>, at: Pt): Pt => ({ x: at.x + 1 + doorIndex(form), y: at.y + 1, z: at.z + form.d + 1 });

// ---------------------------------------------------------------- せっけいず・材料

/**
 * せっけいずを 1 まい 足す（持ち物は 空に しない。前に 作った せっけいずは のこる）。作りかけが のこって いれば まっさらに してから 形を 決める。
 * 紙 2・ふで 1 を 持ち物に 足して 「できた！」まで 進め、メニューを とじる。せっけいずの 番号を 返す。
 */
export async function addBlueprint(page: Page, form: HouseForm): Promise<number> {
  const first = await firstArchitect(page);
  await openEditorFast(page, first.id);
  const cur = await ed(page);
  if (cur.furniture.length > 0 || cur.name.front.length > 0 || cur.windows > 0) {
    await press(page, 'new');
    await press(page, 'yes'); // ぜんぶ けす
  }
  const now = (await ed(page)).size;
  await setForm(page, {
    w: form.w === now.w ? undefined : form.w,
    d: form.d === now.d ? undefined : form.d,
    windows: form.windows,
    furniture: form.furniture,
    front: form.front,
    back: form.back,
  });
  const before = (await blueprints(page)).length;
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.add('paper', 2);
    h.inventory.add('fude', 1);
    h.step(1);
  });
  await press(page, 'done');
  const bps = await blueprints(page);
  expect(bps.length, 'せっけいずが 1 まい ふえた').toBe(before + 1);
  await press(page, 'close');
  return bps[bps.length - 1]!.number;
}

/** 材料の 置き場: もちもの（bag）と 置いた たんす（at）の 中の 数。数えるのは 材料の 種類〔items〕だけ */
export interface Stock {
  /** 置いた たんすの 場所 */
  at: Pos3;
  bag: Record<string, number>;
  tansu: Record<string, number>;
}

/** たんすを 置く 場所（足もとから）。建築士さんの 東 12 マスの 場所〔layYard〕とは はんたいがわの 西に 置く */
const STOCK_TANSU = { dx: -8, dz: 4 } as const;

/** いまの もちもの・たんす（at）の 中の items の 数 */
export async function stockNow(page: Page, at: Pos3, items: string[]): Promise<Stock> {
  const bag: Record<string, number> = {};
  const tansu: Record<string, number> = {};
  for (const item of items) {
    bag[item] = await page.evaluate((i) => (window as any).__rikkun.inventory.count(i) as number, item);
    tansu[item] = await tansuHas(page, at, item);
  }
  return { at, bag, tansu };
}

/**
 * せっけいず slot の 材料（need() の need）を ちょうど そろえる（extra は その 分 ふやす）。
 * 1E: 材料は もちもの＋近くの たんす。where 'split'〔はじめ〕＝ 半分〔切り上げ〕を たんす・のこりを もちもの、'bag' ＝ ぜんぶ もちもの、'tansu' ＝ ぜんぶ たんす。
 * 近くの たんすを 1 つ 足もとの 西に 置く（置いた 場所は 返す Stock の at）。持ち物に 足す ので、せっけいずなどは へらない。そろえた あとの 数を 返す。
 */
export async function stockMaterials(
  page: Page,
  slot: number,
  extra: Record<string, number> = {},
  where: 'split' | 'bag' | 'tansu' = 'split',
): Promise<Stock> {
  const rows = await needOf(page, slot);
  expect(rows.length, `need(${slot}) に 行が ある`).toBeGreaterThan(0);
  const toBag: Record<string, number> = {};
  const toTansu: Record<string, number> = {};
  const items: string[] = [];
  for (const r of rows) {
    const n = r.need + (extra[r.item] ?? 0);
    items.push(r.item);
    if (n <= 0) continue;
    const t = where === 'bag' ? 0 : where === 'tansu' ? n : Math.ceil(n / 2);
    if (t > 0) toTansu[r.item] = t;
    if (n - t > 0) toBag[r.item] = n - t;
  }
  await page.evaluate((toBag) => {
    const h = (window as any).__rikkun;
    for (const [item, n] of Object.entries(toBag) as [string, number][]) h.inventory.add(item, n);
    h.step(1);
  }, toBag);
  const at = await putTansu(page, STOCK_TANSU.dx, STOCK_TANSU.dz, toTansu);
  return stockNow(page, at, items);
}

/** 建てる 前の 数 before から、need の 分だけ たんす〔近い 順。ここでは 1 つ〕→ もちもの の 順に へらした あとの 数（AC20b） */
export function afterBuild(before: Stock, needs: Array<{ item: string; need: number }>): Stock {
  const bag = { ...before.bag };
  const tansu = { ...before.tansu };
  for (const r of needs) {
    const fromTansu = Math.min(tansu[r.item] ?? 0, r.need);
    tansu[r.item] = (tansu[r.item] ?? 0) - fromTansu;
    bag[r.item] = (bag[r.item] ?? 0) - (r.need - fromTansu);
  }
  return { at: before.at, bag, tansu };
}

// ---------------------------------------------------------------- 建築中の 見張り

/**
 * steps ステップ すすめながら、湧いた 妖怪の 位置を ぜんぶ 集める（出た ステップの うちに 消す＝おそわれない。体力も もどす）。
 * 夜・自動の 湧きは 呼ぶ 側が 先に 入れる。見るのは「湧いた 場所」（yokai.events() の spawn）。
 */
export const watchSpawns = (page: Page, steps: number): Promise<{ x: number; y: number; z: number }[]> =>
  page.evaluate((n) => {
    const h = (window as any).__rikkun;
    const out: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      h.step(1);
      for (const e of h.yokai.events()) if (e.type === 'spawn') out.push({ x: e.position.x as number, y: e.position.y as number, z: e.position.z as number });
      h.yokai.clear();
      if (i % 30 === 0) h.combat.setHp(20);
    }
    return out;
  }, steps);

/** 夜に して 妖怪の 自動の 湧きを 入れる（見張りの 前に 1 回）。切る ときは on = false */
export const setNight = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((on) => {
    const h = (window as any).__rikkun;
    h.settings.set('yokaiAutoSpawn', on);
    if (on) h.time.set(67400); // 夜の 真ん中（night76.spec.ts と 同じ）
    h.yokai.clear();
    h.yokai.events();
    h.step(1);
  }, on);

/**
 * 建築士さんに 話す（地面を いじらない）。建築士さんの 2 マス 南に 立って house.talk(id)、メニューが 開くまで 進める。
 * （talkTo は 立つ 場所に 石の 床を 敷くので、建築中の 場所の そばでは 使わない）
 */
export async function talkNear(page: Page, id: number | string, max = 300): Promise<MenuState> {
  const a = (await architects(page)).find((x) => x.id === id);
  expect(a, `建築士さん ${String(id)} が 読みこまれて いる`).toBeTruthy();
  await standAt(page, { x: a!.x, y: a!.y, z: a!.z + 2 }, 0);
  return page.evaluate(
    ({ id, max }) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.house.talk(id);
      for (let n = 0; n < max && !h.house.menu().open; n++) h.step(1);
      h.step(3);
      return h.house.menu();
    },
    { id, max },
  );
}

// ---------------------------------------------------------------- 場所の 中の ブロック

/** 箱の 中の ブロックの 数え方。足場 ＝ アイテムに ならない 固い ブロック（item が null で 空気でない） */
export function tally(cells: Record<string, CellInfo>): { scaffold: number; wall: number; roof: number; lantern: number; floor: number; solid: number } {
  const t = { scaffold: 0, wall: 0, roof: 0, lantern: 0, floor: 0, solid: 0 };
  for (const c of Object.values(cells)) {
    if (c.id === 'air') continue;
    t.solid++;
    if (c.item === null) t.scaffold++;
    else if (c.id === 'house_wall') t.wall++;
    else if (c.id === 'house_roof') t.roof++;
    else if (c.id === 'house_floor') t.floor++;
    else if (c.id === 'lantern') t.lantern++;
  }
  return t;
}

export const inBox = (p: Pt, at: Pt, outW: number, outD: number): boolean => p.x >= at.x && p.x < at.x + outW && p.z >= at.z && p.z < at.z + outD && p.y >= at.y && p.y <= at.y + 4;

/**
 * 建築中の 場所に ブロックを 置く・ほる を ためす（AC39）。
 * まえ（南）の かべの 列（戸の 列を のぞく）の うち、いちばん 上の ブロックの 上が 箱の 中で 空気の 列を えらび、
 * その 列の すぐ 南の 外の 空中に 立って（毎ステップ 同じ 場所へ もどす）いちばん 上の ブロックの 上の 面を ねらう
 * （ねらいは 箱の 中の ブロック・置く 場所も 箱の 中。足場が じゃまで ねらえない 列は とばす）。
 * 返すのは ためした 結果: ほろうと した ブロックの 前後・置こうと した 場所の 前後・持ち物の つちの 数の 前後。
 */
export async function tryEditSite(
  page: Page,
  at: Pt,
  outW: number,
  outD: number,
  doorX: number,
): Promise<{ dig: { block: Pt; before: string; after: string }; place: { cell: Pt; before: string; after: string }; bag: { before: number; after: number } }> {
  const zRing = at.z + outD - 1;
  const cols = await page.evaluate(
    ({ at, outW, zRing, doorX }) => {
      const h = (window as any).__rikkun;
      const out: { x: number; topY: number }[] = [];
      for (let x = at.x + 1; x <= at.x + outW - 2; x++) {
        if (x === doorX) continue;
        let topY = -1;
        for (let y = at.y; y <= at.y + 4; y++) if (h.world.getBlock(x, y, zRing) !== 'air') topY = y;
        if (topY < 0 || topY + 1 > at.y + 4) continue;
        if (h.world.getBlock(x, topY + 1, zRing) !== 'air') continue;
        out.push({ x, topY });
      }
      return out;
    },
    { at, outW, zRing, doorX },
  );
  let found: { block: Pt; place: Pt; from: Pt } | null = null;
  for (const c of cols) {
    const from: Pt = { x: c.x + 0.5, y: c.topY + 2, z: at.z + outD + 0.5 };
    const t = await page.evaluate(
      ({ c, zRing, from }) => {
        const h = (window as any).__rikkun;
        h.input.releaseAll();
        h.player.set({ position: from, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        (window as any).__aim.solve(c.x, c.topY, zRing, 1);
        h.player.set({ position: from, velocity: { x: 0, y: 0, z: 0 } });
        h.step(1);
        const t = h.target.get();
        return t ? { block: { ...t.block }, place: { ...t.place } } : null;
      },
      { c, zRing, from },
    );
    if (t && t.block.x === c.x && t.block.y === c.topY && t.block.z === zRing && t.place.y === c.topY + 1 && inBox(t.place, at, outW, outD)) {
      found = { block: t.block, place: t.place, from };
      break;
    }
  }
  expect(found, '南の かべの 列の いちばん 上の ブロックの 上の 面を、箱の 外の 空中から ねらえた（箱の 中の 置く 場所つき）').not.toBeNull();
  const from = found!.from;
  // 置く ために つちを 1 こ 持って おく（ほる ほうが 先に 動いても 数が 合う ように 先に 足す）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.add('dirt', 1);
    h.step(1);
  });
  const blockBefore = await blockOf(page, found!.block);
  const placeBefore = await blockOf(page, found!.place);
  const bagBefore = await itemCount(page, 'dirt');
  // ほる（ひびが MAX に なるか 360 ステップ まで 押す → 押し直して ほる）。空中に とどまる ため 毎ステップ 同じ 場所へ もどす
  await page.evaluate((from) => {
    const h = (window as any).__rikkun;
    const hold = () => h.player.set({ position: from, velocity: { x: 0, y: 0, z: 0 } });
    h.input.release('primary');
    h.input.press('primary');
    for (let i = 0; i < 360 && !h.dig.get().ready; i++) {
      hold();
      h.step(1);
    }
    h.input.release('primary');
    h.input.press('primary');
    hold();
    h.step(1);
    h.input.release('primary');
    hold();
    h.step(2);
  }, from);
  const blockAfter = await blockOf(page, found!.block);
  // 置く（つちを 手に 持って 右クリック）。ねらいは ほる とき と 同じ
  await page.evaluate((from) => {
    const h = (window as any).__rikkun;
    const hold = () => h.player.set({ position: from, velocity: { x: 0, y: 0, z: 0 } });
    const slots = h.inventory.get().slots as ({ item: string } | null)[];
    let i = slots.findIndex((s, k) => k < 9 && s?.item === 'dirt');
    if (i < 0) {
      i = slots.findIndex((s, k) => k < 9 && !s);
      h.inventory.setSlot(i, { item: 'dirt', count: 1 });
    }
    h.inventory.select(i);
    hold();
    h.step(1);
    h.input.release('secondary');
    h.input.press('secondary');
    hold();
    h.step(1);
    h.input.release('secondary');
    hold();
    h.step(2);
  }, from);
  const placeAfter = await blockOf(page, found!.place);
  return {
    dig: { block: found!.block, before: blockBefore, after: blockAfter },
    place: { cell: found!.place, before: placeBefore, after: placeAfter },
    bag: { before: bagBefore, after: await itemCount(page, 'dirt') },
  };
}

// ---------------------------------------------------------------- UI 検査の 画面（e2e/ui-gate.spec.ts）

export type SiteScreen = 'pick' | 'sky' | 'confirm';

/** 一覧を 6 行より 長く する せっけいずの 数（6 行を こえたら スクロール。§3.2） */
const GATE_PLANS = 7;

export const PICK_ROOTS = ['[data-testid="house-pick"]', '[data-testid="house-bubble"]'];
export const SKY_ROOTS = ['[data-testid="house-sky"]', '[data-testid="house-bubble"]'];
export const SKY_CONFIRM_ROOTS = ['[data-testid="house-confirm"]'];

/**
 * UI 検査の 画面を 出す: いちばん 長い 名前の せっけいずを 何まいか 作り、
 *   pick ＝ けんちくを はじめる の 一覧（7 まい。窓 0 の 4 まいは 材料が そろい、窓 1 の 3 まいは かみが たりなくて うすい カード）／sky ＝ 上空の 視点（わく）／confirm ＝ 上空の 視点の 確かめの まど（名前が いちばん 長い）。
 */
export async function openSiteScreen(page: Page, kind: SiteScreen): Promise<void> {
  await openHouse(page);
  const first = await firstArchitect(page);
  const plans = kind === 'pick' ? GATE_PLANS : 1;
  const numbers: number[] = [];
  for (let i = 0; i < plans; i++) {
    numbers.push(
      await addBlueprint(page, {
        w: 5,
        d: 5,
        windows: i % 2,
        front: LONGEST_NAME.front,
        back: LONGEST_NAME.back,
        furniture: [
          { kind: 'futon', x: 0, z: 0, rot: 0 },
          { kind: 'chair', x: 2, z: 0, rot: 0 },
        ],
      }),
    );
  }
  const bps = await blueprints(page);
  // 1E: かみは もちものの 数も 材料に 数える。せっけいずを 作った あまりの かみを すてて から（窓 1 の 3 まいは かみが たりない まま に する）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const n = h.inventory.count('paper') as number;
    if (n > 0) h.inventory.remove('paper', n);
    h.step(1);
  });
  await stockMaterials(page, bps[0]!.slot); // 窓 0 の 4 まい（0・2・4・6 まい目）は 同じ 材料 なので まとめて そろう。窓 1 の 3 まいは かみが たりない
  if (kind === 'pick') {
    await talkTo(page, first.id, 'hook');
    const m = await press(page, 'build');
    expect(m.page, 'けんちくを はじめる の 一覧').toBe('pick');
    return;
  }
  await layYard(page, first, 7, 7);
  await talkTo(page, first.id, 'hook');
  await press(page, 'build');
  const m = await press(page, 'pick', bps[0]!.slot);
  expect(m.page, '上空の 視点').toBe('sky');
  if (kind === 'confirm') {
    await pressKey(page, 'Enter');
    const c = await cursorOf(page);
    expect(c?.confirm, '確かめの まど').toBe(true);
  }
  await page.evaluate(() => (window as any).__rikkun.step(2));
}
