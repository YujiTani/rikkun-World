import { expect, test, type Page } from '@playwright/test';
import { menuState, openHouse, press, stepUi } from './helpers/house';
import { aimBlock, digAimed, houses, makeBlueprint, standAt, tapRight, type HouseForm, type Pt } from './helpers/houseBuilt';
import { blueprints, firstArchitect } from './helpers/houseEditor';
import { blockOf, buildingOf, cursorOf, holdItem, itemCount, levelOf, setBuildTicks, setNight, sitesOf, stockMaterials, watchSpawns } from './helpers/houseSite';
import { TOWN } from '../src/town/townTuning';
import { AI_CONST } from '../src/yokai/ai/config';
import { holdItems, runTech, settle } from './helpers/blade';
import { setFakePad } from './helpers/duoUi';
import { findEdgeSpot, goTo, inSafe, openTown, place1P, place2P, townCall, townInfo, TOWN_OFF, yawOf, type P3, type TownInfo, type XZ } from './helpers/town';

/**
 * TOWN-1 区切り 1B-1（docs/design/TOWN-1.md §0・§6.1、TOWN-1-place.md の AC8・AC7b・AC41・AC29）の E2E。実装の 前に 書いた 赤の テスト。
 * 1.3 版（決定 2026-11-14 妖怪は 街に 入れる）: AC8 は「わかない・入って くる・たたかう」2 本、AC9 の 妖怪の 分を 1 本（ユニットに できない 通し）。2P・矢・がしゃどくろの たたきつけ・数の こまかい 所は ユニット。
 * 区切りの 表（TOWN-1.md §6）: 街に 入れる 2 本（AC8）＋ 用水路から 上がる 1 本（AC41）＋ あきちで 建てる 1 本（AC7b）＋ 性能の 数 1 本（AC29）。
 * 口（仕様 §6.1）: `town.info()`・`town.inSafe()`・`town.inTown()`・`town.smoke()`。まだ 無い（実装の 前は「…が まだ ない」で 赤）。
 * 数・座標は 決め打ちせず ゲームに 聞く。進めるのは step の 数。時間（ms）では 合否を 決めない（#255）。
 * 約束（あいまいな 所を この テストで こう 読んだ。報告に 書いた）:
 *  - `groundY` ＝ 地面の ブロックの y（`world.groundHeight` と 同じ）。立つ 高さ ＝ groundY + 1。`canal.bottomY` ＝ 底の 床ブロックの y。立つ 高さ ＝ bottomY + 1。
 *  - 街を 作らない 世界は URL に `town=off`（helpers/town.ts の TOWN_OFF）。
 *  - 街の 中の ブロックの ほり・置きの 条件・ユニットに 回した 物（AC7・AC9・AC12・AC38〜40・AC42・AC44・AC46）は src/**\/*.test.ts（developer）。
 *  - 建物・人・かざり・アスレチック（1B-2 の AC10・11・43・45・47）は この 区切りに 入れない。
 */

// ---- 性能の 上限（TOWN-1-place.md §4.11 の 表。数は 表の とおり。時間では 決めない）
const PERF_DRAW_MAX = TOWN.perf.drawMax; // 描画回数の ふえ（回）
const PERF_TRI_MAX = TOWN.perf.triMax; // 三角形の ふえ（こ）
const SMOKE_MAX = TOWN.perf.smokeMax; // けむりの つぶ（こ）
const LIGHTS_MAX = TOWN.lightsMax; // あかり（こ。§4.5）
const REBUILD_STEPS = 600; // 街が 見えて いる 間の ステップ（回）

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const gh = (page: Page, x: number, z: number): Promise<number> => page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [x, z] as const);
const hp = (page: Page, who: 1 | 2): Promise<number> => page.evaluate((w) => (window as any).__rikkun.duo.hearts(w).hp as number, who);

test.describe('TOWN-1 1B-1 安全地帯', () => {
  test.describe.configure({ timeout: 240_000 });

  test('AC8 (a)(b)(c): 中では わかない・外では わく／外の 妖怪が 歩いて 街に 入る／中の 1P・2P の ハートが へる（1.3）', async ({ page }) => {
    await openTown(page, { duo: true });
    const info = await townInfo(page);
    const spot = await findEdgeSpot(page, info); // ふちから 3 マス 中の 立ち場所と、わかない はんいの 外 4 マスの 場所
    await place1P(page, spot.player);
    await place2P(page, { ...spot.player, x: spot.player.x + (spot.out.x === 0 ? 1 : 0), z: spot.player.z + (spot.out.z === 0 ? 1 : 0) });

    // ---- (a) 夜の 自動の 湧き: 湧いた 場所は ぜんぶ わかない はんいの 外。外では 1 ぴき 以上 わく（しらべが 動いて いる）。3 晩は ユニット・ここは 夜の 真ん中を 回す
    await setNight(page, true);
    const spawns = await watchSpawns(page, 1500);
    test.info().annotations.push({ type: 'night spawns', description: String(spawns.length) });
    expect(spawns.length, '外では 1 ぴき 以上 わく').toBeGreaterThanOrEqual(1);
    for (const s of spawns) expect(await inSafe(page, s), `湧いた 場所 ${JSON.stringify(s)} は わかない はんいの 外`).toBe(false);
    await setNight(page, false);
    await page.evaluate(() => (window as any).__rikkun.yokai.clear()); // (a) で わいた 妖怪が (b)(c) に まざらない ように

    // ---- (b) 外 4 マスの 妖怪が 1P・2P へ 歩いて、わかない はんい → 街の はんいへ 入る（ふちで 止まらない）
    await place1P(page, spot.player);
    const id = await page.evaluate(
      ({ x, y, z }) => {
        const h = (window as any).__rikkun;
        h.time.set(70000);
        return h.yokai.spawn('karakasa', x, y, z, { hp: 9999 }) as number;
      },
      spot.yokai,
    );
    const hp0 = [await hp(page, 1), await hp(page, 2)];
    let enteredSafe = -1;
    let enteredTown = -1;
    let hurt = -1;
    for (let k = 1; k <= 60; k++) {
      await stepN(page, 20);
      const y = await page.evaluate((id) => (window as any).__rikkun.yokai.list().find((q: any) => q.id === id)?.position as P3 | undefined, id);
      expect(y, '妖怪は まだ いる').toBeTruthy();
      if (enteredSafe < 0 && (await inSafe(page, y!))) enteredSafe = k * 20;
      if (enteredTown < 0 && (await townCall<boolean>(page, 'inTown', y!.x, y!.y, y!.z))) enteredTown = k * 20;
      // ---- (c) 中に 入った あと、1P か 2P の ハートが へる（街の 中でも 当たる）
      if (enteredTown > 0 && hurt < 0 && ((await hp(page, 1)) < hp0[0]! || (await hp(page, 2)) < hp0[1]!)) {
        hurt = k * 20;
        break;
      }
    }
    test.info().annotations.push({ type: 'steps safe/town/hurt', description: `${enteredSafe}/${enteredTown}/${hurt}` });
    expect(enteredSafe, '600 ステップ 以内に わかない はんいの 中へ 入る').toBeGreaterThan(0);
    expect(enteredSafe, '600 ステップ 以内に わかない はんいの 中へ 入る').toBeLessThanOrEqual(600);
    expect(enteredTown, 'そのあと 街の はんいの 中へも 入る（ふちで 止まらない）').toBeGreaterThanOrEqual(enteredSafe);
    expect(hurt, '街の 中で 1P・2P の ハートが へった').toBeGreaterThan(0);
  });

  test('AC8 (c)(d): 街の 中でも 外と 同じ 数 ハートが へる・刀が 同じ ダメージで 当たり、たおすと ようかいダマが ふえる', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const outX = Math.floor(info.safe.min.x) - 30;
    const outZ = Math.floor(info.center.z);
    await goTo(page, outX, outZ);
    const outY = (await gh(page, outX, outZ)) + 1;
    const places = {
      town: { x: info.plaza.x + 0.5, y: info.plaza.y, z: info.plaza.z + 0.5 },
      outside: { x: outX + 0.5, y: outY, z: outZ + 0.5 },
    };
    const lost: Record<string, number> = {};
    const dealt: Record<string, number> = {};
    const gained: Record<string, number> = {};
    for (const [name, pos] of Object.entries(places)) {
      await goTo(page, Math.floor(pos.x), Math.floor(pos.z));
      await place1P(page, pos, 90); // 東向き（+x）。妖怪は 東 1.5 マス
      // (c) 同じ 妖怪・同じ わざ（からかさ・攻撃 1 回）で へる ハートの 数
      const r = await page.evaluate(
        ({ pos }) => {
          const h = (window as any).__rikkun;
          h.combat.setHp(20);
          const id = h.yokai.spawn('karakasa', pos.x + 1.5, pos.y, pos.z, { ai: false, hp: 9999 }) as number;
          const hp0 = h.combat.get().hp as number;
          const a = h.yokai.attackNow(id) as { hitInSteps: number } | null;
          h.step((a?.hitInSteps ?? 30) + 40);
          const lostHp = hp0 - (h.combat.get().hp as number);
          h.yokai.clear();
          h.combat.setHp(20);
          return { lostHp, started: a !== null };
        },
        { pos },
      );
      expect(r.started, `${name}: 攻撃が 始まる`).toBe(true);
      lost[name] = r.lostHp;
      // (d) 刀の 1 回 → ダメージ。つぎに 体力 1 の 妖怪を たおして ようかいダマ
      await place1P(page, pos, 90);
      await holdItems(page, [{ item: 'katana' }]);
      const spawnAhead = (hpv: number): Promise<number> =>
        page.evaluate(
          ({ pos, hpv }) => {
            const h = (window as any).__rikkun;
            const id = h.yokai.spawn('karakasa', pos.x + 1.5, pos.y, pos.z, { ai: false }) as number;
            h.yokai.setHp(id, hpv); // spawn の hp オプションは 無い（無視される）。体力 1 は setHp で 決める
            h.yokai.events();
            return id;
          },
          { pos, hpv },
        );
      await spawnAhead(9999);
      const steps = await runTech(page, 40);
      await settle(page, 60);
      dealt[name] = steps.flatMap((t) => t.events).filter((e) => e.type === 'techHit').reduce((sum, e) => sum + (e.damage ?? 0), 0);
      await page.evaluate(() => (window as any).__rikkun.yokai.clear());
      const d0 = await page.evaluate(() => (window as any).__rikkun.dama.count(1) as number);
      await place1P(page, pos, 90);
      await spawnAhead(1);
      await runTech(page, 40);
      await settle(page, 200);
      gained[name] = (await page.evaluate(() => (window as any).__rikkun.dama.count(1) as number)) - d0;
    }
    test.info().annotations.push({ type: 'town vs outside', description: JSON.stringify({ lost, dealt, gained }) });
    expect(lost.outside, '外では ハートが へる（くらべる 基準）').toBeGreaterThan(0);
    expect(lost.town, '街の 中でも 外と 同じ 数 ハートが へる').toBe(lost.outside);
    expect(dealt.outside, '外では 刀が 当たる').toBeGreaterThan(0);
    expect(dealt.town, '街の 中でも 外と 同じ ダメージ').toBe(dealt.outside);
    expect(gained.outside, '外で たおすと ようかいダマが ふえる').toBeGreaterThan(0);
    expect(gained.town, '街の 中で たおしても ようかいダマが ふえる').toBeGreaterThan(0);
  });

  test('AC9 (妖怪): 街の 中・あきち・門で ぬりかべが たおれこんでも・水で 石に なっても ブロックは 1 こも かわらない。外では こわれる', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const lot = info.lots[0]!;
    const outX = Math.floor(info.safe.min.x) - 30;
    const outZ = Math.floor(info.center.z);
    const gx = Math.floor(info.gate.pos.x);
    const gz = Math.floor(info.gate.pos.z);
    /** ぬりかべを 地面に 立てて たおれこみを すぐ 起こし、まわり（11×7×11）の ブロックの ちがう マスの 数を 返す */
    const crushDiff = async (x: number, z: number): Promise<number> => {
      await goTo(page, x, z);
      const y = (await gh(page, x, z)) + 1;
      return page.evaluate(
        ({ x, y, z }) => {
          const h = (window as any).__rikkun;
          h.player.set({ position: { x: x + 4.5, y, z: z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: 0 });
          h.step(2);
          const cells: [number, number, number][] = [];
          for (let dz = -5; dz <= 5; dz++) for (let dy = -3; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) cells.push([x + dx, y + dy, z + dz]);
          const snap = (): string[] => cells.map(([a, b, c]) => h.world.getBlock(a, b, c) as string);
          const before = snap();
          const id = h.yokai.spawn('nurikabe', x + 0.5, y, z + 0.5, { ai: false, hp: 9999 }) as number;
          const a = h.yokai.attackNow(id) as { hitInSteps: number } | null;
          h.step((a?.hitInSteps ?? 60) + 60);
          h.yokai.clear();
          const after = snap();
          return before.filter((b, i) => b !== after[i]).length;
        },
        { x, y, z },
      );
    };
    expect(await crushDiff(outX, outZ), '外では たおれこみで こわれる（くらべる 基準）').toBeGreaterThan(0);
    const spots = { 広場: { x: Math.floor(info.plaza.x), z: Math.floor(info.plaza.z) }, あきち: { x: Math.floor((lot.min.x + lot.max.x) / 2), z: Math.floor((lot.min.z + lot.max.z) / 2) }, 門: { x: gx, z: gz } };
    for (const [name, p] of Object.entries(spots)) expect(await crushDiff(p.x, p.z), `${name}: たおれこみで 街の ブロックは かわらない`).toBe(0);

    // 用水路の 水の 中で 石に なる（かたまる 時間は 表 AI_CONST.stoneTicks）。まわりの ブロックは かわらない
    const w = info.canal.water[Math.floor(info.canal.water.length / 2)]!;
    await goTo(page, w.x, w.z);
    const changed = await page.evaluate(
      ({ w, y, ticks }) => {
        const h = (window as any).__rikkun;
        const cells: [number, number, number][] = [];
        for (let dz = -3; dz <= 3; dz++) for (let dy = -2; dy <= 4; dy++) for (let dx = -3; dx <= 3; dx++) cells.push([w.x + dx, y + dy, w.z + dz]);
        const snap = (): string[] => cells.map(([a, b, c]) => h.world.getBlock(a, b, c) as string);
        const before = snap();
        h.player.set({ position: { x: w.x + 0.5, y: y + 10, z: w.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.yokai.spawn('nurikabe', w.x + 0.5, y, w.z + 0.5, { ai: false, hp: 9999 });
        h.step(ticks + 120);
        const after = snap();
        return before.filter((b, i) => b !== after[i]).length;
      },
      { w, y: info.canal.bottomY + 1, ticks: AI_CONST.stoneTicks },
    );
    expect(changed, '水で 石に なっても 街の ブロックは かわらない').toBe(0);
  });
});

test.describe('TOWN-1 1B-1 用水路', () => {
  test.describe.configure({ timeout: 240_000 });

  /** 底の マス（water ＋ walk）の つながり。4 方向。キーは "x,z" */
  const key = (c: XZ): string => `${c.x},${c.z}`;
  function farthest(info: TownInfo): { start: XZ; path: XZ[]; stair: TownInfo['canal']['stairs'][number] } {
    const cells = [...info.canal.water, ...info.canal.walk];
    const set = new Set(cells.map(key));
    const dist = new Map<string, number>();
    const from = new Map<string, XZ | null>();
    const origin = new Map<string, number>();
    const q: XZ[] = [];
    info.canal.stairs.forEach((s, i) => {
      const c = { x: Math.floor(s.bottom.x), z: Math.floor(s.bottom.z) };
      if (!dist.has(key(c))) {
        dist.set(key(c), 0);
        from.set(key(c), null);
        origin.set(key(c), i);
        q.push(c);
      }
    });
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: c.x + dx, z: c.z + dz };
        if (!set.has(key(n)) || dist.has(key(n))) continue;
        dist.set(key(n), dist.get(key(c))! + 1);
        from.set(key(n), c);
        origin.set(key(n), origin.get(key(c))!);
        q.push(n);
      }
    }
    let best = q[0]!;
    for (const c of q) if (dist.get(key(c))! > dist.get(key(best))!) best = c;
    const path: XZ[] = [];
    for (let c: XZ | null = best; c; c = from.get(key(c)) ?? null) path.push(c);
    return { start: best, path, stair: info.canal.stairs[origin.get(key(best))!]! };
  }

  test('AC41: 1P も 2P も 底の いちばん 遠い マスから 石段まで 歩き、前に 歩く だけ（ジャンプ なし）で 地面に 上がれる', async ({ page }) => {
    await openTown(page, { duo: true });
    const info = await townInfo(page);
    expect(await page.evaluate(() => (window as any).__rikkun.settings.get('autoJump')), 'オートジャンプは はじめの 設定（オン）').toBe(true);
    expect(await gh(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z)), 'groundY ＝ 地面の ブロックの y').toBe(info.groundY);
    const standY = info.canal.bottomY + 1;
    const f = farthest(info);
    expect(f.path.length - 1, '底の いちばん 遠い マスから 石段まで（AC40 の 12 歩 以内）').toBeLessThanOrEqual(12);
    const stair = f.stair;
    const yaw = yawOf(stair.top.x - stair.bottom.x, stair.top.z - stair.bottom.z);

    for (const who of [1, 2] as const) {
      await goTo(page, Math.floor(stair.bottom.x), Math.floor(stair.bottom.z));
      // もう 1 人は 地面の 上の 見えない 所へ（じゃまを しない）
      const park = { x: info.plaza.x + 0.5, y: info.groundY + 1, z: info.plaza.z + 0.5 };
      const startPos = { x: f.start.x + 0.5, y: standY, z: f.start.z + 0.5 };
      if (who === 1) {
        await place2P(page, park);
        await place1P(page, startPos);
      } else {
        await place1P(page, park);
        await place2P(page, startPos);
      }
      const r = await page.evaluate(
        ({ who, path, bottom, yaw, groundY }) => {
          const h = (window as any).__rikkun;
          const pos = (): { x: number; y: number; z: number; ground: boolean } => {
            if (who === 1) {
              const p = h.player.get();
              return { ...p.position, ground: p.onGround as boolean };
            }
            const p = h.duo.pos(2);
            return { x: p.x, y: p.y, z: p.z, ground: true };
          };
          const walkDir = (x: number, z: number, yawDeg: number, on: boolean): void => {
            if (who === 1) {
              h.player.set({ yaw: yawDeg });
              if (on) h.input.press('moveForward');
              else h.input.release('moveForward');
            } else {
              h.duo.aimAt(2, { x: Math.floor(x), y: Math.floor(pos().y), z: Math.floor(z) });
              (window as any).__pads[1].axes = on ? [0, -1, 0, 0] : [0, 0, 0, 0];
            }
          };
          const toYaw = (dx: number, dz: number): number => (Math.atan2(dx, -dz) * 180) / Math.PI;
          // 1) 底を 歩いて 石段の bottom まで（path は 遠い マスから bottom の じゅん）
          let steps = 0;
          let i = 1;
          while (i < path.length && steps < 900) {
            const p = pos();
            const c = path[i];
            const cx = c.x + 0.5;
            const cz = c.z + 0.5;
            if (Math.hypot(p.x - cx, p.z - cz) < 0.35) {
              i++;
              continue;
            }
            walkDir(cx, cz, toYaw(cx - p.x, cz - p.z), true);
            h.step(1);
            steps++;
          }
          walkDir(0, 0, yaw, false);
          h.step(10);
          const atBottom = Math.hypot(pos().x - (bottom.x + 0.5), pos().z - (bottom.z + 0.5)) < 1.2;
          // 2) 石段の 向きに 前へ 歩く だけ（ジャンプは しない）。300 ステップ いない に 地面に 立つ
          const dx = Math.sin((yaw * Math.PI) / 180);
          const dz = -Math.cos((yaw * Math.PI) / 180);
          let climb = -1;
          for (let n = 0; n < 300; n++) {
            const p = pos();
            walkDir(p.x + dx * 3, p.z + dz * 3, yaw, true);
            h.step(1);
            const q = pos();
            if (q.y >= groundY + 1 - 0.05 && q.ground) {
              climb = n + 1;
              break;
            }
          }
          walkDir(0, 0, yaw, false);
          return { atBottom, walkSteps: steps, climb, y: pos().y };
        },
        { who, path: f.path, bottom: stair.bottom, yaw, groundY: info.groundY },
      );
      expect(r.atBottom, `${who}P: 石段の 下まで 歩けた`).toBe(true);
      expect(r.climb, `${who}P: ジャンプ なしで 300 ステップ 以内に 地面に 立てた（y ${r.y}）`).toBeGreaterThan(0);
    }
  });
});

test.describe('TOWN-1 1B-1 あきち', () => {
  test.describe.configure({ timeout: 420_000 });

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
  const OUT_W = FORM.w + 2;
  const OUT_D = FORM.d + 2;

  test('AC7b: あきちの 中は ほれる・置ける・みずもりで 同じ 高さ・かためた つちの 場所は 緑で 道・はみ出しは 入らない・建てた 家の 中も 妖怪が わかない', async ({ page }) => {
    await openHouse(page, '?nosave=1');
    // 先に（外の 建築士さんの そばで）せっけいずと 材料を 用意する
    const first = await firstArchitect(page);
    const number = await makeBlueprint(page, FORM);
    const slot = (await blueprints(page)).find((b) => b.number === number)!.slot;
    await stockMaterials(page, slot, {}, 'bag');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.add('mizumori', 1);
      h.inventory.add('dirt', 4);
      h.step(1);
    });

    const info = await townInfo(page);
    const lot = info.lots[0]!;
    const cx = Math.floor((lot.min.x + lot.max.x) / 2);
    const cz = Math.floor((lot.min.z + lot.max.z) / 2);
    await goTo(page, cx, cz);
    const gy = info.groundY;
    await page.evaluate(() => (window as any).__rikkun.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 }));

    // ---- みずもり: 区画の 中は ぜんぶ 同じ 高さ（ok）
    await test.step('みずもりを 当てると 区画の 中は ぜんぶ ok', async () => {
      expect(await holdItem(page, 'mizumori')).toBeGreaterThanOrEqual(0);
      await standAt(page, { x: cx + 0.5, y: gy + 1, z: cz + 3.5 }, 0);
      const t = await aimBlock(page, { x: cx, y: gy, z: cz }, 1);
      expect(t?.block, 'きじゅんを ねらえた').toEqual({ x: cx, y: gy, z: cz });
      await tapRight(page);
      const lv = await levelOf(page);
      const inLot = lv.cells.filter((c) => c.x >= lot.min.x && c.x <= lot.max.x && c.z >= lot.min.z && c.z <= lot.max.z);
      expect(inLot.length, '区画の 中の 列が 出る').toBeGreaterThan(0);
      expect(inLot.filter((c) => c.state !== 'ok'), '区画の 中は ぜんぶ 同じ 高さ').toEqual([]);
    });

    // ---- ほれる・置ける（街の ほかの 所は ほれない。それは ユニット AC9）
    await test.step('区画の 中の ブロックは ほれる・置ける', async () => {
      await standAt(page, { x: cx + 0.5, y: gy + 1, z: cz + 1.5 }, 0); // 穴の ふちに 視線が 当たらない よう 近くに 立つ
      await aimBlock(page, { x: cx, y: gy, z: cz }, 1);
      await digAimed(page);
      expect(await blockOf(page, { x: cx, y: gy, z: cz }), 'ほれた').toBe('air');
      expect(await holdItem(page, 'dirt')).toBeGreaterThanOrEqual(0);
      const t = await aimBlock(page, { x: cx, y: gy - 1, z: cz }, 1);
      expect(t?.block).toEqual({ x: cx, y: gy - 1, z: cz });
      await tapRight(page);
      expect(await blockOf(page, { x: cx, y: gy, z: cz }), '置けた').not.toBe('air');
    });

    // ---- 場所: 区画の 中に 外 7×7 の かためた つち → sites に 入る。区画から はみ出す 7×7 は 入らない
    const at: Pt = { x: lot.min.x + 2, y: gy, z: lot.min.z + 2 };
    // はみ出す 場所: 2 つ目の あきち（lots[1]）の 北の 線を またぐ。at とは かさならない（区画も ちがう）
    const lot1 = info.lots[1]!;
    const over: Pt = { x: lot1.min.x + 2, y: gy, z: lot1.min.z - 4 }; // 区画の ならびは x 方向。北の 線を またぐ
    await page.evaluate(
      ({ at, over, w, d }) => {
        const h = (window as any).__rikkun;
        for (const s of [at, over]) {
          h.world.fill(s.x, s.y, s.z, s.x + w - 1, s.y, s.z + d - 1, 'katame_tsuchi');
          h.world.fill(s.x - 1, s.y + 1, s.z - 1, s.x + w, s.y + 8, s.z + d + 2, 'air');
        }
        h.step(2);
      },
      { at, over, w: OUT_W, d: OUT_D },
    );
    await goTo(page, cx, cz);
    await standAt(page, { x: cx + 0.5, y: gy + 1, z: lot.max.z + 3.5 }, 0);

    // ---- 建てる 通し（HOUSE-1 の 通しは かえない。建築士さんに 話す → えらぶ → 上空の 視点 → 決定）
    await setBuildTicks(page, 300);
    await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.house.talk(id);
      for (let n = 0; n < 300 && !h.house.menu().open; n++) h.step(1);
      h.step(3);
    }, first.id);
    expect((await menuState(page)).open, '区画から 建築士さんに 話せた').toBe(true);
    expect((await press(page, 'build')).page, '一覧').toBe('pick');
    expect((await press(page, 'pick', slot)).page, '上空の 視点（場所が ある）').toBe('sky');
    expect(await sitesOf(page), '置ける 場所は 区画の 中の 1 か所だけ（はみ出す 場所は 入らない）').toEqual([at]);
    expect(await cursorOf(page), 'わくは 緑').toMatchObject({ x: at.x, z: at.z, ok: true });
    await page.keyboard.press('Enter');
    await stepUi(page, 2);
    await page.keyboard.press('Enter');
    await stepUi(page, 2);
    expect(await buildingOf(page), '建築が はじまった').not.toBeNull();
    for (let n = 0; n < 30 && (await buildingOf(page)); n++) await stepUi(page, 100);
    expect(await buildingOf(page), '建築が おわった').toBeNull();
    const built = await houses(page);
    expect(built.length, '家が できた').toBeGreaterThanOrEqual(1);
    // 家の 中（床の 上）も 妖怪が わかない
    expect(await inSafe(page, { x: at.x + 3.5, y: gy + 2, z: at.z + 3.5 }), '家の 中も 安全').toBe(true);
    expect(await itemCount(page, 'dirt')).toBeGreaterThanOrEqual(0);
  });
});

test.describe('TOWN-1 1B-1 あきち 2P', () => {
  test.describe.configure({ timeout: 240_000 });

  test('AC7b: 2P も あきちの 中の ブロックを ほれる', async ({ page }) => {
    await openTown(page, { duo: true });
    const info = await townInfo(page);
    const lot = info.lots[0]!;
    const cx = Math.floor((lot.min.x + lot.max.x) / 2);
    const cz = Math.floor((lot.min.z + lot.max.z) / 2);
    const gy = info.groundY;
    await goTo(page, cx, cz);
    await place1P(page, { x: lot.min.x + 1.5, y: gy + 1, z: lot.min.z + 1.5 });
    await place2P(page, { x: cx + 0.5, y: gy + 1, z: cz + 1.5 });
    await page.evaluate(([x, y, z]) => (window as any).__rikkun.duo.aimAt(2, { x, y, z }), [cx, gy, cz] as const);
    await stepN(page, 3);
    const tgt = await page.evaluate(() => {
      (window as any).__rikkun.duo.sample(2);
      return (window as any).__rikkun.duo.target(2);
    });
    test.info().annotations.push({ type: '2P target', description: JSON.stringify(tgt) });
    expect(tgt?.block, '2P は あきちの ブロックを ねらえて いる').toEqual({ x: cx, y: gy, z: cz });
    // ZR を おしつづけて ひびを MAX に して、おし直して こわす（duoPlay と 同じ）
    for (let n = 0; n < 60 && (await blockOf(page, { x: cx, y: gy, z: cz })) !== 'air'; n++) {
      await setFakePad(page, 1, { buttons: [7] });
      await stepN(page, 30);
      await setFakePad(page, 1, {});
      await stepN(page, 2);
      await setFakePad(page, 1, { buttons: [7] });
      await stepN(page, 2);
      await setFakePad(page, 1, {});
    }
    expect(await blockOf(page, { x: cx, y: gy, z: cz }), '2P が あきちの ブロックを ほれた').toBe('air');
  });
});

test.describe('TOWN-1 1B-1 性能', () => {
  test.describe.configure({ timeout: 300_000 });

  const SEED = '&seed=7';
  /** 見る 所 2 か所で 描画回数・三角形を はかる（カメラの 向きは 街の まん中） */
  async function measure(page: Page, spots: { name: string; pos: P3; yaw: number }[]): Promise<Record<string, { dc: number; tri: number }>> {
    const out: Record<string, { dc: number; tri: number }> = {};
    for (const s of spots) {
      await goTo(page, Math.floor(s.pos.x), Math.floor(s.pos.z));
      await place1P(page, s.pos, s.yaw);
      await stepN(page, 40);
      const r = await page.evaluate(() => {
        const st = (window as any).__rikkun.renderStats();
        return { dc: st.drawCalls as number, tri: st.triangles as number };
      });
      out[s.name] = r;
    }
    return out;
  }

  test('AC29: 街 なしの 世界と くらべて 描画回数の ふえ・三角形の ふえが 上限 以下。600 ステップで 作りなおし 0。けむり・あかりは 上限 以下', async ({ page }) => {
    await openTown(page, { extra: SEED });
    const info = await townInfo(page);
    const start = await page.evaluate(() => (window as any).__rikkun.world.spawn() as { x: number; y: number; z: number });
    const toward = (from: P3, to: XZ): number => yawOf(to.x - from.x, to.z - from.z);
    const fx = (info.fountain.min.x + info.fountain.max.x) / 2;
    const fz = (info.fountain.min.z + info.fountain.max.z) / 2;
    const spots = [
      { name: 'start', pos: { x: start.x, y: start.y, z: start.z }, yaw: toward(start, info.center) },
      { name: 'fountain', pos: { x: info.plaza.x + 0.5, y: info.groundY + 1, z: info.plaza.z + 0.5 }, yaw: toward(info.plaza, { x: fx, z: fz }) },
    ];
    const on = await measure(page, spots);

    // 街が 見えて いる 600 ステップの 間は チャンクを 作りなおさない
    await page.evaluate(() => (window as any).__rikkun.world.rebuildLog(true));
    await stepN(page, REBUILD_STEPS);
    const rebuilt = await page.evaluate(() => (window as any).__rikkun.world.rebuildLog(true).length as number);
    expect(rebuilt, `${REBUILD_STEPS} ステップで 作りなおし 0 回`).toBe(0);

    expect(await townCall<number>(page, 'smoke'), 'けむりの つぶ').toBeLessThanOrEqual(SMOKE_MAX);
    expect(info.lights.length, 'あかりの 数').toBeLessThanOrEqual(LIGHTS_MAX);

    // 同じ シード・同じ 場所で 街を 作らなかった 世界
    await openTown(page, { extra: `${SEED}&${TOWN_OFF}` });
    const off = await measure(page, spots);
    for (const s of spots) {
      const dDraw = on[s.name]!.dc - off[s.name]!.dc;
      const dTri = on[s.name]!.tri - off[s.name]!.tri;
      console.log(`TOWN1 AC29 ${s.name}`, JSON.stringify({ on: on[s.name], off: off[s.name], dDraw, dTri }));
      expect(dDraw, `${s.name}: 描画回数の ふえ`).toBeLessThanOrEqual(PERF_DRAW_MAX);
      expect(dTri, `${s.name}: 三角形の ふえ`).toBeLessThanOrEqual(PERF_TRI_MAX);
    }
  });
});
