import { expect, test } from '@playwright/test';
import { aimAtBlock, installAimHelpers, standOnGround } from './helpers/aim';
import { openStream } from './helpers/stream';

/**
 * MINE-1B（issue #349。docs/design/MINE-1.md §4.4・§4.10・受け入れ基準 B9）: 通し。きんの いしを ほって、かまどで やく。
 *
 *   ① いしの つるはしで きんの いし〔`kin_ore`〕を ほる → ほれず、ログに「てつの つるはし が いるよ」。実績は まだ 出ない。
 *   ② てつの つるはしに 持ちかえて ほる → 持ち物に きんの いし 1・実績「はじめて きんの いし を ほった！」。
 *   ③ かまどで やく → きん〔`kin`〕1。きんの いしは 0。
 *
 * ほる 時間〔150 ステップ〕・やく 時間〔60 ステップ〕は 数で 決めうちせず、ひびが MAX に なるまで／やき終わるまで 十分な ステップを 進めて 結果だけを 見る。
 * 時間〔ms〕では 合否を 決めない。実績の id は 決まって いない ので、画面に 出る 文〔名前〕で さがす。
 * 窓口は 今の ものだけ〔world.setBlock/getBlock・inventory・target・dig.get/events・log.history・achievements.list・craft.openFurnace・furnace.list/click・step〕。
 *
 * 赤の 確かめ（テストの 準備）: MINE-1B の 前〔今の 登録表〕では `kin_ore` が ブロックに なく、「きんの いし〔kin_ore〕を 置けない」で 落ちる。
 */
test.describe.configure({ timeout: 120_000 });

const BLOCK = 'kin_ore';
const NEED_IRON = 'てつの つるはし が いるよ';
const ACHIEVEMENT = 'はじめて きんの いし を ほった！';

/** きんの いしを 置く 所〔床の 上の 段。立つ 所 (10.5, 10.5) の 東〕と かまどを 置く 所〔同じ 段〕。x・z だけ。高さは 床に あわせる */
const AT = { x: 12, z: 10 } as const;
const FURNACE = { x: 14, z: 12 } as const;

test.describe('MINE-1B B9 通し: きんの いし', () => {
  test('いしの つるはしでは ほれず「てつの つるはし が いるよ」→ てつの つるはしで ほる → きんの いし 1・実績 → かまどで きん 1', async ({ page }) => {
    await openStream(page, '?nosave=1'); // 開く・実績の 音を 消す・一時停止・自動で 出すのを 切る
    await installAimHelpers(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.input.releaseAll();
      h.yokai.clear();
      h.inventory.clear();
      h.log.clear();
    });
    const { floorY } = await standOnGround(page, 10.5, 10.5, { floorY: 8 });
    const y = floorY + 1;

    // --- 準備: きんの いしを 1 つ 置く〔床の 上の 段。立つ 所から 東へ 1.5 マス〕 ---
    const placed = await page.evaluate(
      ({ x, y, z, id }) => {
        const h = (window as any).__rikkun;
        try {
          h.world.setBlock(x, y, z, id);
        } catch {
          // 知らない id は 下の 確かめで 落とす
        }
        h.step(2);
        return h.world.getBlock(x, y, z) as string;
      },
      { x: AT.x, y, z: AT.z, id: BLOCK },
    );
    expect(placed, `きんの いし〔${BLOCK}〕を 置けない`).toBe(BLOCK);

    const held = (item: string) =>
      page.evaluate((item) => {
        const h = (window as any).__rikkun;
        h.inventory.clear();
        h.inventory.setSlot(0, { item, count: 1 });
        h.inventory.select(0);
        h.step(2);
      }, item);
    const names = () =>
      page.evaluate(
        (name) =>
          (window as any).__rikkun.achievements
            .list()
            .filter((a: any) => a.name === name)
            .map((a: any) => ({ id: a.id, unlocked: a.unlocked })),
        ACHIEVEMENT,
      );

    const rows = await names();
    expect(rows, `実績「${ACHIEVEMENT}」の 行`).toHaveLength(1);
    expect(rows[0]!.unlocked, '最初は まだ').toBe(false);

    // --- ① いしの つるはし: ほれない ---
    await held('stone_pickaxe');
    await aimAtBlock(page, AT.x, y, AT.z, 0.5);
    const blocked = await page.evaluate(
      ({ x, y, z }) => {
        const h = (window as any).__rikkun;
        const aimed = h.target.get();
        h.dig.events();
        h.input.press('primary');
        h.step(300); // きんの いしは てつの つるはしで 150 ステップ。いしの つるはしでは いくら おしても ほれない
        const during = h.dig.get();
        const ev = h.dig.events();
        h.input.release('primary');
        h.step(2);
        const log = h.log.history().map((e: any) => ({ k: e.kind, c: e.category, t: e.text }));
        return {
          aimed: aimed ? { id: aimed.id, block: aimed.block } : null,
          during: { progress: during.progress, crackStage: during.crackStage, ready: during.ready, reason: during.blockedReason },
          blockedEvents: ev.filter((e: any) => e.type === 'blocked').map((e: any) => e.reason),
          after: h.world.getBlock(x, y, z) as string,
          bag: h.inventory.count('kin_ore') as number,
          log,
        };
      },
      { x: AT.x, y, z: AT.z },
    );
    expect(blocked.aimed, 'ねらいが きんの いしに 乗った').toMatchObject({ id: BLOCK, block: { x: AT.x, y, z: AT.z } });
    // ほれない わけの 名前〔needTool か 新しい 名前か〕は 決めない。「ほれない」と 1 回 しらせて、こわせない ブロック〔unbreakable〕では ないこと
    expect(blocked.blockedEvents, '「ほれない」の 知らせが 1 回').toHaveLength(1);
    expect(blocked.during.reason, 'ほれない わけ').not.toBeNull();
    expect(blocked.during.reason).not.toBe('unbreakable');
    expect(blocked.during.progress, 'ひびは 入らない').toBe(0);
    expect(blocked.during.ready).toBe(false);
    expect(blocked.after, 'ほれない').toBe(BLOCK);
    expect(blocked.bag, '持ち物に 入らない').toBe(0);
    expect(
      blocked.log.filter((e: { k: string; t: string }) => e.k === 'signal').map((e: { t: string }) => e.t),
      `ログの しらせ。「${NEED_IRON}」〔今の「つるはし が いるよ」ではない〕`,
    ).toEqual([NEED_IRON]);
    expect((await names())[0]!.unlocked, 'ほれなかった ので 実績は まだ').toBe(false);

    // --- ② てつの つるはし: ほれる ---
    await held('iron_pickaxe');
    await aimAtBlock(page, AT.x, y, AT.z, 0.5);
    const dug = await page.evaluate(
      ({ x, y, z }) => {
        const h = (window as any).__rikkun;
        // ひびが MAX〔ready〕に なるまで 長おし → はなして もう 1 回 おすと こわれる〔kongo1・bal-d と おなじ〕
        let readyAt = -1;
        h.input.press('primary');
        for (let i = 1; i <= 1200; i++) {
          h.step(1);
          if (h.dig.get().ready) {
            readyAt = i;
            break;
          }
        }
        h.input.release('primary');
        h.step(2);
        let brokeAt = -1;
        h.input.press('primary');
        for (let i = 1; i <= 30; i++) {
          h.step(1);
          if (h.world.getBlock(x, y, z) === 'air') {
            brokeAt = i;
            break;
          }
        }
        h.input.release('primary');
        h.step(30); // 掘った 物が 持ち物に 入る まで
        return { readyAt, brokeAt, after: h.world.getBlock(x, y, z) as string, kinOre: h.inventory.count('kin_ore') as number, kin: h.inventory.count('kin') as number };
      },
      { x: AT.x, y, z: AT.z },
    );
    expect(dug.readyAt, 'ひびが MAX に なる').toBeGreaterThan(0);
    expect(dug.brokeAt, 'こわれる').toBeGreaterThan(0);
    expect(dug.after).toBe('air');
    expect(dug.kinOre, '持ち物に きんの いし 1〔かまどを 通る 前の まま〕').toBe(1);
    expect(dug.kin, 'ほった だけでは きんに ならない').toBe(0);
    expect((await names())[0]!.unlocked, `実績「${ACHIEVEMENT}」`).toBe(true);

    // --- ③ かまどで やく ---
    const baked = await page.evaluate(
      ({ x, y, z }) => {
        const h = (window as any).__rikkun;
        h.world.setBlock(x, y, z, 'furnace');
        h.inventory.add('coal_ore', 1); // ねんりょう 1
        h.step(2);
        h.craft.openFurnace(x, y, z);
        if (!h.inventory.get().open) {
          h.input.press('toggleInventory');
          h.input.release('toggleInventory');
        }
        h.step(4);
        // きんの カードは 作り方が 2 つ〔きんの たまご／きんの いし〕。きんの いしを つかう 作り方の 行を さがす
        // 〔たいまつの 足した 作り方と 同じく 別の 行の id か、1 つの 行かは 決めない〕
        const kinRows = h.furnace.list().filter((r: any) => r.output?.item === 'kin');
        const row = kinRows.find((r: any) => r.inputs?.some((i: any) => i.item === 'kin_ore')) ?? kinRows.find((r: any) => r.canBake);
        const before = row ? { canBake: row.canBake, fuelOk: row.fuelOk } : null;
        const click = row ? h.furnace.click(row.id) : null;
        h.step(120); // やき終わるまで〔60 ステップ〕。ゆとりを 見て 2 倍
        return { before, click: click?.ok ?? false, kin: h.inventory.count('kin') as number, kinOre: h.inventory.count('kin_ore') as number, coal: h.inventory.count('coal_ore') as number };
      },
      { x: FURNACE.x, y, z: FURNACE.z },
    );
    expect(baked.before, 'きんの カードで やける〔きんの いし 1・ねんりょう 1〕').toEqual({ canBake: true, fuelOk: true });
    expect(baked.click, 'やく').toBe(true);
    expect(baked.kin, 'きん 1').toBe(1);
    expect(baked.kinOre, 'きんの いしは 0').toBe(0);
    expect(baked.coal, 'ねんりょうが へる').toBe(0);
  });
});
