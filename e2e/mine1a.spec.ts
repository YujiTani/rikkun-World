import { expect, test, type Page } from '@playwright/test';

/**
 * MINE-1A（issue #348。docs/design/MINE-1.md §4.3・受け入れ基準 A10 と、A6 の つなぎ込み）: 通し。
 *
 *   シード 固定。地面から 30 マス いじょう 下に 暗い 部屋（20×20×4）を つくり、プレイヤーを 部屋の すみに 置く
 *   （部屋の まわりの 足 ±8 の はばは いしで うめて、ほかの ほらあなが 出る 場所に かからない ように する。外の ほらあなは のこす）。
 *   ひる 4,800 ステップ（地下の 間かく〔設定 yokaiSpawnIntervalUnder〕の 10 回）→ `yokai.events()` の spawn が 1 回 いじょうで、
 *   どれも 足が プレイヤー ±8（設定 yokaiSpawnHeight）・横 12〜28（設定 yokaiSpawnMinDist・yokaiSpawnMaxDist）。
 *   部屋に たいまつを 置いて やりなおすと、たいまつの 8 マス 以内には 出ない。
 *   窓口 `mine.underground()`（§6.1）が、部屋の 中は 地下・地上は 地上と 答え、掘っても 答えが かわらない。
 *
 * 数は ゲームに 聞く（間かく・高さの はば・横の きょりは 設定から。部屋の 高さは 地面の 高さを 聞いて きめる）。
 * 時間では 合否を 決めない（ステップ数だけ）。妖怪は 出た ステップの うちに `yokai.clear()` で 消す
 * （プレイヤーを おそわない・出る 場所だけを 見る）。
 *
 * 赤の 確かめ（テストの 準備）: MINE-1 の 前〔今の 生成と 湧き〕では 「知らない設定: yokaiSpawnIntervalUnder」で 落ちる。
 * 設定の 読みを 480 に 固定した ためしでは、足が ±8 の 外の ほらあな（上下に ある 自然の ほらあな）の 床にも 妖怪が 出て
 * 「どれも ±8」で 落ちた（シード 20261012・この 部屋の 場所）。
 */
test.describe.configure({ timeout: 300_000 });

/** ふだんの シード（固定）。かえるときは「赤の 確かめ」を やりなおす（前でも 赤に なる シードを つかう） */
const SEED = 20261012;

interface Spawn {
  x: number;
  y: number;
  z: number;
  /** 出た ステップの おわりの プレイヤーの 足 */
  px: number;
  py: number;
  pz: number;
}

interface Room {
  x0: number;
  z0: number;
  floorY: number;
  /** 部屋の まわりの 地面の いちばん 低い 高さ（世界に 聞いた 値） */
  lowestGround: number;
}

async function open(page: Page) {
  await page.goto(`/?nosave=1&seed=${SEED}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}

/** 光とメッシュの 作りなおしが おちつくまで（コマ数の ステップを つかう。時間では ない） */
const settle = (page: Page) =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
  });

/** ひる。自動で 出す。`steps` ステップ すすめて、出た 妖怪の 場所を ぜんぶ 集める */
const measure = (page: Page, steps: number) =>
  page.evaluate((n): Spawn[] => {
    const h = (window as any).__rikkun;
    h.time.set(0); // ひる（ひるは 54,000 ステップ つづく）
    h.settings.set('yokaiAutoSpawn', true);
    h.yokai.clear();
    h.yokai.events();
    const out: Spawn[] = [];
    for (let i = 0; i < n; i++) {
      h.step(1);
      const p = h.player.get().position;
      for (const e of h.yokai.events()) {
        if (e.type === 'spawn') out.push({ x: e.position.x, y: e.position.y, z: e.position.z, px: p.x, py: p.y, pz: p.z });
      }
      h.yokai.clear(); // 出た ステップの うちに 消す（おそわれない）
      if (i % 30 === 0) h.combat.setHp(20);
    }
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    return out;
  }, steps);

const lateral = (s: Spawn): number => Math.hypot(s.x - s.px, s.z - s.pz);

/** 足が プレイヤー ±height・横 minD〜maxD に ならない 出方 */
function badSpawns(spawns: Spawn[], height: number, minD: number, maxD: number): string[] {
  const eps = 1e-6;
  return spawns
    .filter((s) => Math.abs(s.y - s.py) > height + eps || lateral(s) < minD - eps || lateral(s) > maxD + eps)
    .map((s) => `足 y=${s.y}（プレイヤー ${s.py}・ずれ ${(s.y - s.py).toFixed(2)}）横 ${lateral(s).toFixed(2)}`);
}

test.describe('MINE-1A A10: 地下の 部屋で 妖怪が 出る 場所', () => {
  test('ひる 地下の 間かく 10 回: 妖怪は ぜんぶ 足 ±8・横 12〜28。たいまつの 8 マス 以内には 出ない', async ({ page }) => {
    await open(page);

    // --- 部屋を つくる（地面から 30 マス いじょう 下。まわりは いしで とじて 暗くする） ---
    const room: Room = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.input.releaseAll();
      h.achievements.mute(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const sp = h.world.spawn();
      const x0 = Math.floor(sp.x) - 10;
      const z0 = Math.floor(sp.z) - 10;
      let lowest = Infinity;
      for (let x = x0 - 1; x <= x0 + 20; x++) for (let z = z0 - 1; z <= z0 + 20; z++) lowest = Math.min(lowest, h.world.groundHeight(x, z));
      const floorY = lowest - 40; // 天井（floorY + 4）でも 地面より 35 マス 下
      // 妖怪が 出る 高さの はば（足 ±これ）の 中を いしで うめて、ほかの ほらあなが かからない ように する（この はばの 中の 空気は 部屋だけ）。
      // 外〔足 ±これ の 上と 下〕の ほらあなは そのまま のこす（前の 出方は そこにも 出る）。うめた あとで 部屋を くりぬく
      const height = h.settings.get('yokaiSpawnHeight') as number;
      h.world.fill(x0 - 32, floorY - height - 1, z0 - 32, x0 + 51, floorY + height + 1, z0 + 51, 'stone');
      h.world.fill(x0, floorY, z0, x0 + 19, floorY + 3, z0 + 19, 'air');
      return { x0, z0, floorY, lowestGround: lowest };
    });
    await settle(page);

    // プレイヤーを 部屋の すみに 置く
    const feet = { x: room.x0 + 0.5, y: room.floorY, z: room.z0 + 0.5 };
    const setup = await page.evaluate((f) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: f, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(10);
      const cfg = {
        interval: h.settings.get('yokaiSpawnIntervalUnder') as number,
        height: h.settings.get('yokaiSpawnHeight') as number,
        minD: h.settings.get('yokaiSpawnMinDist') as number,
        maxD: h.settings.get('yokaiSpawnMaxDist') as number,
      };
      return { cfg, p: h.player.get().position, u: h.mine.underground() };
    }, feet);
    const { interval, height, minD, maxD } = setup.cfg;

    // 部屋の 前提: 地面から 30 マス いじょう 下・床と 空気が 本当に ある・プレイヤーは 床に 立つ・部屋の ぜんぶの 床が 暗い（妖怪が 出てよい）
    expect(room.floorY, '部屋の 高さ（世界の 中。地面の 高さが 読めている）').toBeGreaterThan(10);
    expect(room.lowestGround - room.floorY, '部屋は 地面から 30 マス いじょう 下').toBeGreaterThanOrEqual(30);
    const blocks = await page.evaluate((r: Room) => {
      const h = (window as any).__rikkun;
      return { floor: h.world.getBlock(r.x0 + 19, r.floorY - 1, r.z0 + 19), air: h.world.getBlock(r.x0 + 19, r.floorY + 3, r.z0 + 19), ceiling: h.world.getBlock(r.x0 + 19, r.floorY + 4, r.z0 + 19) };
    }, room);
    expect(blocks, '部屋の 床・空気・天井').toEqual({ floor: 'stone', air: 'air', ceiling: 'stone' });
    expect(Math.abs(setup.p.y - feet.y), 'プレイヤーは 部屋の 床に 立っている').toBeLessThan(0.01);
    const lit = await page.evaluate((r: Room) => {
      const h = (window as any).__rikkun;
      let n = 0;
      for (let x = r.x0; x < r.x0 + 20; x++) for (let z = r.z0; z < r.z0 + 20; z++) if (!h.world.darkForSpawn(x, r.floorY, z)) n++;
      return n;
    }, room);
    expect(lit, '部屋の 明るい 床の 数（暗い 部屋）').toBe(0);

    // 窓口: 部屋の 中は 地下。出る 高さの はばは 足 ±height
    expect(setup.u.under, '部屋の 中は 地下').toBe(true);
    expect(setup.u.feetY).toBeCloseTo(setup.p.y, 3);
    expect(setup.u.groundY - setup.u.feetY, '地面から 30 マス いじょう 下').toBeGreaterThanOrEqual(30);
    expect(setup.u.minY).toBeCloseTo(setup.u.feetY - height, 3);
    expect(setup.u.maxY).toBeCloseTo(setup.u.feetY + height, 3);

    // --- 1 回め: ひる、地下の 間かく 10 回 ---
    const steps = 10 * interval;
    // たいまつを 置く 場所（部屋の 中。プレイヤーから 横 12〜28 の 床の ちょうど まんなか あたり）。8 マス = マンハッタンきょり（光は 1 マスずつ 弱まる）
    const torch = { x: room.x0 + 12, y: room.floorY, z: room.z0 + 12 };
    const torchDist = (s: Spawn): number => Math.abs(Math.floor(s.x) - torch.x) + Math.abs(Math.floor(s.y) - torch.y) + Math.abs(Math.floor(s.z) - torch.z);
    const first = await measure(page, steps);
    expect(first.length, `${steps} ステップで 妖怪が 1 体も 出なかった`).toBeGreaterThanOrEqual(1);
    expect(badSpawns(first, height, minD, maxD), `出た ${first.length} 体の うち、足が ±${height}・横 ${minD}〜${maxD} の 外`).toEqual([]);
    expect(first.filter((s) => torchDist(s) <= 8).length, '対照: たいまつを 置く 前は、あとで たいまつを 置く 所の 8 マス 以内にも 出る').toBeGreaterThanOrEqual(1);

    // --- 2 回め: たいまつを 置いて やりなおす ---
    await page.evaluate((t) => (window as any).__rikkun.world.setBlock(t.x, t.y, t.z, 'torch'), torch);
    await settle(page);
    expect(
      await page.evaluate((t) => (window as any).__rikkun.world.darkForSpawn(t.x + 1, t.y, t.z), torch),
      '対照: たいまつの となりは 暗く ない',
    ).toBe(false);
    const second = await measure(page, steps);
    expect(second.length, `たいまつを 置いた あと、${steps} ステップで 妖怪が 1 体も 出なかった`).toBeGreaterThanOrEqual(1);
    expect(badSpawns(second, height, minD, maxD), `（たいまつ あり）出た ${second.length} 体の うち、足が ±${height}・横 ${minD}〜${maxD} の 外`).toEqual([]);
    expect(second.map(torchDist).filter((d) => d <= 8), 'たいまつから 8 マス 以内に 出た 妖怪の きょり（マス）').toEqual([]);

    // --- 窓口: 掘っても 地下の 判定は かわらない・地面に 出ると 地上 ---
    const after = await page.evaluate(
      ({ r, f }) => {
        const h = (window as any).__rikkun;
        const before = h.mine.underground();
        // 部屋の 天井から 地面の 上まで たてあなを 掘る
        h.world.fill(Math.floor(f.x), r.floorY + 4, Math.floor(f.z), Math.floor(f.x), r.lowestGround + 20, Math.floor(f.z), 'air');
        h.step(2);
        const dug = h.mine.underground();
        // 地面から 6 マス 下は 地下・5 マス 下は 地上（同じ 列。たてあなの 中）
        const at = (feetY: number) => {
          h.player.set({ position: { x: f.x, y: feetY, z: f.z }, velocity: { x: 0, y: 0, z: 0 } });
          return h.mine.underground();
        };
        const six = at(dug.groundY - 6);
        const five = at(dug.groundY - 5);
        // スタート地点（地上）
        const sp = h.world.spawn();
        h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(2);
        const top = h.mine.underground();
        return { before, dug, six, five, top, spawnY: sp.y };
      },
      { r: room, f: feet },
    );
    expect(after.dug.under, '掘っても 地下のまま').toBe(true);
    expect(after.dug.groundY, '掘っても 地形の 高さは かわらない').toBe(after.before.groundY);
    expect(after.six.under, '地面から 6 マス 下').toBe(true);
    expect(after.five.under, '地面から 5 マス 下').toBe(false);
    expect(after.six.groundY).toBe(after.before.groundY);
    expect(after.top.under, 'スタート地点は 地上').toBe(false);
    expect(after.top.minY).toBeCloseTo(after.top.feetY - height, 3);
    expect(after.top.maxY).toBeCloseTo(after.top.feetY + height, 3);
    expect(after.top.feetY).toBeCloseTo(after.spawnY, 1);
  });
});
