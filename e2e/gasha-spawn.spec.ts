import { test, expect, type Page } from '@playwright/test';
import { openGasha, reopenGasha } from './helpers/gasha';
import { rollMorning } from '../src/gasha/spawnRule';
import { RELEASE } from '../src/gasha/releaseTuning';

/**
 * #293 がしゃどくろの 出方: 朝ごとの くじ・距離 150〜250・世界に 1 体・遠く はなれると 消える・spawn({distance})・保存して 読みなおし。
 * 時間では 待たず、ゲーム（__rikkun.gasha・時計の コマ）に 聞く。
 */
test.describe.configure({ timeout: 180_000 });

const R = RELEASE.spawn;

const stateOf = (page: Page) => page.evaluate(() => (window as any).__rikkun.gasha.state() as string);
const infoOf = (page: Page) => page.evaluate(() => (window as any).__rikkun.gasha.info() as { state: string; pos: { x: number; y: number; z: number } | null; distance: number | null; lastDay: number; kills: number });

/** 読みこみ（非同期）が おわって 出る まで 待つ。コマを 進めながら 状態に 聞く（時間では 待たない） */
async function untilState(page: Page, want: string, maxFrames = 600): Promise<boolean> {
  return page.evaluate(async ({ want, maxFrames }) => {
    const h = (window as any).__rikkun;
    for (let i = 0; i < maxFrames; i++) {
      if (h.gasha.state() === want) return true;
      h.step(1);
      await new Promise((r) => setTimeout(r, 0));
    }
    return h.gasha.state() === want;
  }, { want, maxFrames });
}

/** 世界の シードで、くじに 当たる 日・はずれる 日 */
function daysFor(seed: number, n = 400) {
  const hit: number[] = [], miss: number[] = [];
  for (let d = 1; d <= n; d++) (rollMorning(seed, d).appear ? hit : miss).push(d);
  return { hit, miss };
}

test.describe('朝の くじ', () => {
  test('自動テスト（webdriver）の ふだんの ページでは あさの くじで 出ない', async ({ page }) => {
    const errs = await openGasha(page);
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed() as number);
    const { hit } = daysFor(seed);
    await page.evaluate((d) => (window as any).__rikkun.gasha.morning(d), hit[0]!);
    await page.evaluate(() => (window as any).__rikkun.step(30));
    expect(await stateOf(page)).toBe('idle');
    expect(errs).toEqual([]);
  });

  test('当たる 確率は 調整表の 約 3 割（同じ シード・同じ 日なら いつも 同じ 結果）', async ({ page }) => {
    const errs = await openGasha(page);
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed() as number);
    const { hit } = daysFor(seed, 1000);
    expect(hit.length / 1000).toBeGreaterThan(R.chancePerMorning - 0.08);
    expect(hit.length / 1000).toBeLessThan(R.chancePerMorning + 0.08);
    // 同じ（シード, 日）は 同じ
    for (let d = 1; d <= 50; d++) expect(rollMorning(seed, d).appear).toBe(rollMorning(seed, d).appear);
    expect(errs).toEqual([]);
  });

  test('?gasha=on: くじに 当たる 日だけ 出る・はずれる 日は 出ない・同じ 日の 2 回目は 何も 起きない', async ({ page }) => {
    const errs = await openGasha(page, '?gasha=on');
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed() as number);
    const { hit, miss } = daysFor(seed);
    // はずれる 日
    await page.evaluate((d) => (window as any).__rikkun.gasha.morning(d), miss[0]!);
    await page.evaluate(() => (window as any).__rikkun.step(30));
    expect(await stateOf(page), 'はずれの 日').toBe('idle');
    // 当たる 日（海ばかりで 場所が なければ 出ないので、いくつか ためす）
    let appeared = false;
    for (const d of hit.slice(0, 6)) {
      await page.evaluate((day) => (window as any).__rikkun.gasha.morning(day), d);
      if (await untilState(page, 'present', 400)) { appeared = true; break; }
    }
    expect(appeared, '当たる 日に 出る').toBe(true);
    const first = await infoOf(page);
    expect(first.distance!).toBeGreaterThanOrEqual(R.minDistance - 2);
    expect(first.distance!).toBeLessThanOrEqual(R.maxDistance + 2);
    // 同じ 日の もういちど は むし（世界に 1 体）
    const day = first.lastDay;
    await page.evaluate((d) => (window as any).__rikkun.gasha.morning(d), day);
    await page.evaluate(() => (window as any).__rikkun.step(30));
    const again = await infoOf(page);
    expect(again.state).toBe('present');
    expect(again.pos).toEqual(first.pos);
    expect(errs).toEqual([]);
  });

  test('当たる 日に 出る 場所は いつも プレイヤーから 150〜250 ブロック', async ({ page }) => {
    const errs = await openGasha(page, '?gasha=on');
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed() as number);
    const { hit } = daysFor(seed);
    const dists: number[] = [];
    for (const d of hit.slice(0, 8)) {
      await page.evaluate((day) => (window as any).__rikkun.gasha.morning(day), d);
      if (await untilState(page, 'present', 400)) {
        dists.push((await infoOf(page)).distance!);
        await page.evaluate(() => (window as any).__rikkun.gasha.despawn());
        expect(await stateOf(page)).toBe('idle');
      }
    }
    expect(dists.length).toBeGreaterThanOrEqual(3);
    for (const x of dists) {
      expect(x).toBeGreaterThanOrEqual(R.minDistance - 2);
      expect(x).toBeLessThanOrEqual(R.maxDistance + 2);
    }
    expect(errs).toEqual([]);
  });

  test('世界に 1 体だけ: いる 間は くじに 当たっても 増えない', async ({ page }) => {
    const errs = await openGasha(page, '?gasha=on');
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed() as number);
    const { hit } = daysFor(seed);
    let first: Awaited<ReturnType<typeof infoOf>> | null = null;
    let used = 0;
    for (const d of hit.slice(0, 8)) {
      used++;
      await page.evaluate((day) => (window as any).__rikkun.gasha.morning(day), d);
      if (await untilState(page, 'present', 400)) { first = await infoOf(page); break; }
    }
    expect(first).not.toBeNull();
    const before = await page.evaluate(() => { const g = (window as any).__gashaBig; return { id: g.group.uuid as string, pos: g.info().pos }; });
    // 次の 当たりの 日が 来ても そのまま
    for (const d of hit.slice(used, used + 3)) {
      await page.evaluate((day) => (window as any).__rikkun.gasha.morning(day), d);
      await page.evaluate(() => (window as any).__rikkun.step(30));
      expect(await stateOf(page)).toBe('present');
    }
    const after = await page.evaluate(() => { const g = (window as any).__gashaBig; return { id: g.group.uuid as string, pos: g.info().pos }; });
    expect(after).toEqual(before);
    expect(errs).toEqual([]);
  });
});

test.describe('spawn と 消える 距離', () => {
  test('gasha.spawn({ distance, angleDeg }) は その 距離・向きに 出す', async ({ page }) => {
    const errs = await openGasha(page);
    const p = await page.evaluate(() => { const q = (window as any).__rikkun.player.get().position; return { x: q.x as number, z: q.z as number }; });
    for (const [distance, angleDeg] of [[60, -90], [150, 0], [250, 180]] as const) {
      const ok = await page.evaluate(([d, a]) => (window as any).__rikkun.gasha.spawn({ distance: d, angleDeg: a }), [distance, angleDeg]);
      expect(ok).toBe(true);
      const info = await infoOf(page);
      expect(info.state).toBe('present');
      const rad = (angleDeg * Math.PI) / 180;
      expect(info.pos!.x).toBeCloseTo(p.x + Math.cos(rad) * distance, 0);
      expect(info.pos!.z).toBeCloseTo(p.z + Math.sin(rad) * distance, 0);
      expect(info.distance!).toBeCloseTo(distance, 0);
    }
    expect(errs).toEqual([]);
  });

  test('いる 時の spawn は 置きなおす だけ（2 体に ならない）', async ({ page }) => {
    const errs = await openGasha(page);
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }));
    const a = await page.evaluate(() => (window as any).__gashaBig.info().pos as number[]);
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 100, angleDeg: 0 }));
    const b = await page.evaluate(() => (window as any).__gashaBig.info().pos as number[]);
    expect(b[0]).toBeGreaterThan(a[0]! + 20);
    expect(await stateOf(page)).toBe('present');
    // 体の かたまりは 1 つだけ（親の ある group が 同じ 名前で 2 つ ない）
    const n = await page.evaluate(() => {
      const g = (window as any).__gashaBig.group;
      let root = g; while (root.parent) root = root.parent;
      let c = 0; root.traverse((o: any) => { if (o === g) c++; });
      return c;
    });
    expect(n).toBe(1);
    expect(errs).toEqual([]);
  });

  test('遠く（despawnDistance = 400）より 先に いると 消え、手前なら のこる', async ({ page }) => {
    const errs = await openGasha(page);
    // 手前（390）: 距離の 見はりが 何回 回っても のこる
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 390, angleDeg: 0 }));
    await page.evaluate(() => (window as any).__rikkun.step(150));
    expect(await stateOf(page)).toBe('present');
    // 先（410）: 見はりの 間かく（checkEverySec）ぶん コマを 進めると 消える
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 410, angleDeg: 0 }));
    const frames = Math.ceil(R.checkEverySec * 60) * 2 + 5; // 時間でない: コマの 数
    await page.evaluate((n) => (window as any).__rikkun.step(n), frames);
    expect(await stateOf(page)).toBe('idle');
    const gone = await page.evaluate(() => { const g = (window as any).__gashaBig; return { hp: g.hp(), parented: !!g.group.parent && g.group.visible, colliders: g.colliders().length, geysers: g.geysers().length }; });
    expect(gone.colliders).toBe(0);
    expect(gone.geysers).toBe(0);
    // 消えた あとでも、もういちど 出せる
    expect(await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }))).toBe(true);
    expect(await stateOf(page)).toBe('present');
    expect(errs).toEqual([]);
  });
});

test.describe('保存して 読みなおし', () => {
  test('ボスは 保存しない: 出して 保存して ページを 開きなおすと いない（エラー なし・たおした 数も 0）', async ({ page }) => {
    const errs = await openGasha(page);
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }));
    expect(await stateOf(page)).toBe('present');
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await reopenGasha(page);
    expect(await stateOf(page)).toBe('idle');
    const info = await infoOf(page);
    expect(info.kills).toBe(0);
    expect(info.pos).toBeNull();
    // 読みなおしの あとも、また 出せる
    expect(await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }))).toBe(true);
    expect(errs).toEqual([]);
  });
});
