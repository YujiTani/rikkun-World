import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 1（docs/design/LIVE-2.1.md 版 1.1 §2.1・§6）: 置く と たいら に なる。
 * AC1（たいら の 判定。ユニットの 本体は developer。ここは ゲームの 窓口 `placeCoop` と 右クリック で 同じ 表を 通し で 見る）
 * AC2 とりごや の たいら（通し） / AC3 こたつ の たいら（通し）。
 * 床 y=8（__A.base）・置き物の 足もとは y=9。穴の 深さは 下 y 2..7 を いしで うめて（__A.solidBelow）テストが きめる。
 * 数は 決め打ちせず 「この ブロック は 消える／のこる／うまる」だけ 見る。時間（ms）は 見ない（#255）。
 */
const GROUND_GONE = ['grass', 'dirt', 'stone', 'sand', 'snow', 'coal_ore', 'iron_ore'];
const FLORA_GONE = ['leaves', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'susuki', 'kusa', 'nobana'];
/** y に ひとつ あれば だめ（じゃま）の ブロック（§2.1 の 表） */
const BLOCKERS = ['bedrock', 'log', 'bamboo', 'brick', 'tansu', 'furnace', 'farmland', 'saku', 'torch', 'water', 'nukunuku_e', 'toriya_fence'];

test.describe('LIVE-2.1 置くと たいら', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC1(とりごや・通し) たいら＝変える 0／くうきの 穴・段差 3・じゃま ブロック＝置けない（ブロックは 1 つも かわらない）／消える なかま・うめる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate((args) => {
      const { blockers, gone } = args;
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      A.solidBelow(20, 20, 6);
      A.solidBelow(40, 20, 6);
      const out: any = { noRoom: {} as Record<string, any> };
      const region = (cx: number, cz: number) => A.snap(cx - 5, 3, cz - 5, cx + 5, 14, cz + 5);
      // ---- たいら（サイト A: 20,20）: 変える 0
      const below = () => A.snap(14, 4, 14, 26, 8, 26);
      const above = () => A.snap(14, 13, 14, 26, 14, 26);
      const b0 = [below(), above()];
      out.flat = A.coop(20, 20, 0, 9);
      out.flatBelowSame = below() === b0[0];
      out.flatAboveSame = above() === b0[1];
      // ---- 置けない ばかり（サイト C: 40,20。真ん中の 1 列に ひとつ。ずらし 9 か所 ぜんぶ が 通る 列）
      const C = { x: 40, z: 20 };
      const trial = (name: string, set: () => void, restore: () => void) => {
        const before = region(C.x, C.z);
        set();
        h.step(1);
        const mid = region(C.x, C.z);
        const res = h.animals.placeCoop(C.x, 9, C.z, 0);
        h.step(2);
        out.noRoom[name] = { res, same: region(C.x, C.z) === mid, coops: h.animals.coops().length };
        restore();
        h.step(1);
        out.noRoom[name].restored = region(C.x, C.z) === before;
      };
      for (const id of blockers as string[]) {
        trial(id, () => h.world.setBlock(C.x, 9, C.z, id), () => h.world.setBlock(C.x, 9, C.z, 'air'));
      }
      // y−1 が 他の 置き物（とりごや の さく）
      trial('under_fence', () => h.world.setBlock(C.x, 8, C.z, 'toriya_fence'), () => h.world.setBlock(C.x, 8, C.z, 'stone'));
      // 段差 3（y+2 に つち）
      trial('step3', () => { for (const y of [9, 10, 11]) h.world.setBlock(C.x, y, C.z, 'dirt'); }, () => { for (const y of [9, 10, 11]) h.world.setBlock(C.x, y, C.z, 'air'); });
      // 深い あな（y−1・y−2・y−3 が くうき）
      trial('deep3', () => { for (const y of [8, 7, 6]) h.world.setBlock(C.x, y, C.z, 'air'); }, () => { for (const y of [8, 7, 6]) h.world.setBlock(C.x, y, C.z, 'stone'); });
      // ---- 置ける のこり（サイト B: 34 → 20 と かさならない 所 = 30..38）
      const B = { x: 32, z: 40 };
      A.solidBelow(B.x, B.z, 6);
      const col = (dx: number, dz: number) => ({ x: B.x + dx, z: B.z + dz });
      const g1 = col(-2, -2); h.world.setBlock(g1.x, 9, g1.z, 'grass');                          // ＋1
      const g2 = col(2, -2); h.world.setBlock(g2.x, 9, g2.z, 'dirt'); h.world.setBlock(g2.x, 10, g2.z, 'dirt'); // ＋2
      const g3 = col(-2, 2); h.world.setBlock(g3.x, 12, g3.z, 'leaves');                          // y+3 の はっぱ
      const g4 = col(2, 2); h.world.setBlock(g4.x, 8, g4.z, 'air');                               // y−1 が くうき
      const g5 = col(0, 2); h.world.setBlock(g5.x, 8, g5.z, 'air'); h.world.setBlock(g5.x, 7, g5.z, 'air'); // y−1・y−2 が くうき（y−3 は いし）
      const g6 = col(-1, -1); h.world.setBlock(g6.x, 9, g6.z, 'kusa');                            // 草花（中の あき）
      h.step(2);
      const hole = (c: { x: number; z: number }, y: number) => String(h.world.getBlock(c.x, y, c.z));
      const dig0 = A.stat('break:*');
      const bags0 = h.combat.bags().length;
      const inv0 = [h.inventory.count('grass'), h.inventory.count('dirt'), h.inventory.count('stone'), h.inventory.count('kusa')];
      out.mixed = A.coop(B.x, B.z, 0, 9);
      out.g1 = hole(g1, 9);
      out.g2 = [hole(g2, 9), hole(g2, 10)];
      out.g3 = hole(g3, 12);
      out.g4 = hole(g4, 8);
      out.g5 = [hole(g5, 7), hole(g5, 8)];
      out.g6 = hole(g6, 9);
      out.digSame = A.stat('break:*') === dig0;
      out.bagsSame = h.combat.bags().length === bags0;
      out.invSame = [h.inventory.count('grass'), h.inventory.count('dirt'), h.inventory.count('stone'), h.inventory.count('kusa')].join() === inv0.join();
      out.gone = gone;
      return out;
    }, { blockers: BLOCKERS, gone: [...GROUND_GONE, ...FLORA_GONE] });
    expect(typeof r.flat, 'たいらなら 置ける').toBe('number');
    expect(r.flatBelowSame, '変える マス 0（足もと）').toBe(true);
    expect(r.flatAboveSame, '変える マス 0（上）').toBe(true);
    for (const [name, v] of Object.entries<any>(r.noRoom)) {
      expect(v.res, `${name} は 置けない`).toBe('noRoom');
      expect(v.same, `${name}: ブロック は 1 つも かわらない`).toBe(true);
    }
    // 小屋は サイト A（flat）と サイト B（mixed）の 2 つ だけ
    expect(typeof r.mixed).toBe('number');
    expect(r.g1, '＋1 の くさ は 消える').not.toBe('grass');
    expect(r.g2, '＋2 の つち 2 マス は 消える').not.toContain('dirt');
    expect(r.g3, 'y+3 の はっぱ は 消える').not.toBe('leaves');
    expect(r.g4, 'y−1 が くうき → くさ').toBe('grass');
    expect(r.g5, 'y−2 は つち・y−1 は くさ').toEqual(['dirt', 'grass']);
    expect(r.g6, '草花 は 消える').not.toBe('kusa');
    expect(r.digSame, 'ほった 記録 が ふえない').toBe(true);
    expect(r.bagsSame, '落とし物 に しない').toBe(true);
    expect(r.invSame, '持ち物 に 入らない').toBe(true);
  });

  test('AC1(こたつ・通し) こたつ（高さ 1）: y+1 の つち は のこる（置ける・けずらない）／あな y−1・y−2（y−3 は いし）は つち と くさ で うめて 置く', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      A.solidBelow(20, 20, 8);
      const out: any = {};
      // y+1 に つち（足もとの 上）は のこる。どの むき の 2×2 でも 何か 1 つ は 入る ように まわりに ならべる
      const up = [[20, 21], [20, 19], [21, 21], [21, 19], [19, 21], [19, 19], [21, 20]];
      for (const [x, z] of up) h.world.setBlock(x, 10, z, 'dirt');
      // ヨコの となり 2 つ は 深さ 2 の あな（y−1・y−2 が くうき・y−3 は いし）
      for (const [x, z] of [[21, 20], [19, 20]]) for (const y of [8, 7]) h.world.setBlock(x, y, z, 'air');
      h.step(2);
      const put = A.putKit(20, 20);
      out.put = { placed: put.placed, left: put.left };
      out.dirtKept = up.map(([x, z]) => String(h.world.getBlock(x, 10, z)));
      const cells: string[] = [];
      for (let x = 18; x <= 22; x++) for (let z = 18; z <= 22; z++) if (String(h.world.getBlock(x, 9, z)).startsWith('nukunuku')) cells.push(`${x},${z}`);
      out.cells = cells;
      out.holes = [[21, 20], [19, 20]].map(([x, z]) => ({ inKit: cells.includes(`${x},${z}`), under: [String(h.world.getBlock(x, 7, z)), String(h.world.getBlock(x, 8, z))] }));
      return out;
    });
    expect(r.put.placed, 'y+1 の つち や あな が あっても 置ける').toBe(true);
    expect(r.put.left).toBe(0);
    expect(r.cells).toHaveLength(4);
    expect(r.dirtKept, 'こたつ（H 1）は y+1 を けずらない').toEqual(Array(7).fill('dirt'));
    for (const hole of r.holes) expect(hole.under, `あな は うまる（${JSON.stringify(hole)}）`).toEqual(hole.inKit ? ['dirt', 'grass'] : ['air', 'air']);
  });

  test('AC2 とりごや の たいら（通し）: 3 列 くさ・2 列 y−1 くうき → 置ける・くさ が のこらない・y−1 が grass・落とし物 0・持ち物 と ほった 記録 が ふえない。段差 3 → noRoom・coopNoRoom・toriya へらない・ブロック かわらない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      A.solidBelow(20, 20, 6);
      A.solidBelow(44, 20, 6);
      const out: any = {};
      const grassCols = [[18, 18], [22, 20], [20, 22]];
      const airCols = [[19, 18], [21, 22]];
      for (const [x, z] of grassCols) h.world.setBlock(x, 9, z, 'grass');
      for (const [x, z] of airCols) h.world.setBlock(x, 8, z, 'air');
      h.step(2);
      const dig0 = A.stat('break:*');
      const inv0 = [h.inventory.count('grass'), h.inventory.count('dirt')];
      const bags0 = h.combat.bags().length;
      A.hold('toriya', 2);
      (window as any).__aim.standForS(14.5, 20.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(20, 8, 20, 1);
      h.step(1);
      h.animals.events();
      A.tap();
      out.coops = h.animals.coops().length;
      out.left = h.inventory.count('toriya');
      out.grassLeft = grassCols.map(([x, z]) => String(h.world.getBlock(x, 9, z)));
      out.airFilled = airCols.map(([x, z]) => String(h.world.getBlock(x, 8, z)));
      out.dig = A.stat('break:*') === dig0;
      out.inv = [h.inventory.count('grass'), h.inventory.count('dirt')].join() === inv0.join();
      out.bags = h.combat.bags().length === bags0;
      // 段差 3 の つち柱 を、9 か所の どの ずらしにも 入る 列（ねらった マスの まわり）に
      for (const [x, z] of [[43, 19], [45, 19], [44, 21]]) for (const y of [9, 10, 11]) h.world.setBlock(x, y, z, 'dirt');
      h.step(2);
      const before = A.snap(38, 3, 14, 50, 14, 26);
      (window as any).__aim.standForS(38.5, 20.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(44, 8, 20, 1);
      h.step(1);
      h.animals.events();
      const n0 = h.animals.coops().length;
      const left0 = h.inventory.count('toriya');
      A.tap();
      const hints = h.animals.events().filter((e: any) => e.type === 'hint').map((e: any) => e.hint);
      out.step3 = { hint: hints.length ? hints[hints.length - 1] : null, coops: h.animals.coops().length - n0, left: h.inventory.count('toriya') - left0, same: A.snap(38, 3, 14, 50, 14, 26) === before };
      out.res = h.animals.placeCoop(44, 9, 20, 0);
      return out;
    });
    expect(r.coops).toBe(1);
    expect(r.left, 'toriya は 1 つ へる').toBe(1);
    for (const g of r.grassLeft) expect(['grass', 'dirt'], 'くさ が のこらない').not.toContain(g);
    expect(r.airFilled).toEqual(['grass', 'grass']);
    expect(r.dig, 'ほった 記録 が ふえない').toBe(true);
    expect(r.inv, '持ち物 の くさ・つち が ふえない').toBe(true);
    expect(r.bags, '落とし物 0').toBe(true);
    expect(r.step3.hint).toBe('coopNoRoom');
    expect(r.step3.coops).toBe(0);
    expect(r.step3.left, 'toriya は へらない').toBe(0);
    expect(r.step3.same, 'ブロック が 1 つも かわらない').toBe(true);
    expect(r.res).toBe('noRoom');
  });

  test('AC3 こたつ の たいら（通し）: すな 1 マス・y−1 くうき 1 マス → 置ける・4 マス が こたつ・y−1 が grass・nukunuku −1。かこい（4 むき とも brick）→ 置かない・coopNoRoom。y−1〜y−3 くうき の あな → 置かない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      A.solidBelow(20, 20, 8);
      A.solidBelow(40, 20, 8);
      A.solidBelow(20, 40, 8);
      const out: any = {};
      const parts = (cx: number, cz: number) => {
        const cells: string[] = [];
        for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) if (String(h.world.getBlock(x, 9, z)).startsWith('nukunuku')) cells.push(`${x},${z}`);
        return cells;
      };
      // ねらう マス (20, 20)。タテの となりに すな、ヨコの となりの 下が くうき（どの むき の 2×2 にも どちらか が 入る）
      h.world.setBlock(20, 9, 21, 'sand');
      h.world.setBlock(20, 9, 19, 'sand');
      h.world.setBlock(21, 8, 20, 'air');
      h.world.setBlock(19, 8, 20, 'air');
      h.step(2);
      const put = A.putKit(20, 20);
      out.put = { placed: put.placed, left: put.left };
      out.cells = parts(20, 20);
      out.sandLeft = ['20,21', '20,19'].filter((k) => out.cells.includes(k) && String(h.world.getBlock(+k.split(',')[0], 9, +k.split(',')[1])) === 'sand');
      out.holes = [[21, 20], [19, 20]].map(([x, z]) => ({ inKit: out.cells.includes(`${x},${z}`), below: String(h.world.getBlock(x, 8, z)) }));
      // かこい: 4 つの ななめ に brick
      for (const [x, z] of [[39, 19], [41, 19], [39, 21], [41, 21]]) h.world.setBlock(x, 9, z, 'brick');
      h.step(2);
      const k2 = A.putKit(40, 20);
      out.fence = { placed: k2.placed, hint: k2.hint, left: k2.left };
      // 深い あな: ねらう マス(20, 40) の まわり 4 マスの 下 (y 8..6) が くうき
      for (const [x, z] of [[21, 40], [19, 40], [20, 41], [20, 39]]) for (const y of [8, 7, 6]) h.world.setBlock(x, y, z, 'air');
      h.step(2);
      const k3 = A.putKit(20, 40);
      out.air = { placed: k3.placed, hint: k3.hint, left: k3.left };
      return out;
    });
    expect(r.put.placed).toBe(true);
    expect(r.put.left, 'nukunuku −1').toBe(0);
    expect(r.cells, '4 マス').toHaveLength(4);
    expect(r.sandLeft, 'すな は 消える').toEqual([]);
    for (const hole of r.holes) expect(hole.below, `こたつの 下の あな は うまる（${JSON.stringify(hole)}）`).toBe(hole.inKit ? 'grass' : 'air');
    expect(r.fence.placed, 'かこい は 置かない').toBe(false);
    expect(r.fence.hint).toBe('coopNoRoom');
    expect(r.fence.left, 'nukunuku は へらない').toBe(1);
    expect(r.air.placed, '深い あな（y−1〜y−3 が くうき）は 置かない').toBe(false);
    expect(r.air.hint).toBe('coopNoRoom');
    expect(r.air.left).toBe(1);
  });

  test('AC3b こたつを 置けない 所で 右クリック → 同じ 合図 coopNoRoom（今の こたつは 何も 出さない）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      A.solidBelow(20, 20, 8);
      for (const [x, z] of [[19, 19], [21, 19], [19, 21], [21, 21]]) h.world.setBlock(x, 9, z, 'brick');
      h.step(2);
      const k = A.putKit(20, 20);
      return { hint: k.hint, placed: k.placed };
    });
    expect(r.placed).toBe(false);
    expect(r.hint).toBe('coopNoRoom');
  });
});
