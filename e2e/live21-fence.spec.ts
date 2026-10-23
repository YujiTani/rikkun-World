import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 6（docs/design/LIVE-2.1.md 版 1.1 §3.2「さく・もん」・§4.4・§6 AC15）: さく・もん の 当たり と ねらい（かわらない）。
 * TODO(LIVE-2.1 fence look): さく・もん の 見た目（板 の 作り。ブロック の 箱 に 見せない・草花 と 同じ なかま）は オーナーが 案を えらぶ まで
 *   見た目 の 確かめ（`world` の 描き かた の 印・絵）は 書かない。えらんだ あと に ここへ 足す（UI 検査 と オーナー確認 AC17 (5)）。
 * ここで 見る のは 「当たり と ねらう 箱 は 今 の ブロック の まま」と 「小屋 3 つ の 描画回数・三角形 が ふえすぎない」だけ。
 * 描画の 数は 「小屋 なし」と くらべた ふえ で 見る（#255。時間 では 見ない）。
 */
test.describe('LIVE-2.1 さく・もん（当たり と ねらい は かわらない）', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC15 当たり: さく の 1 マス の 箱 の どこ を ねらって も その さく に 当たる（ねらう 箱 は 今 の ブロック）。右クリック で あつめる・左 で ほる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = { aimed: [] as any[] };
      // すばこ に たまご 2 こ（保存の 形 で 入れる）
      const sv = h.animals.serialize();
      for (const cc of sv.coops) if (cc.id === cid) cc.nest = { egg: 2, gold: 0 };
      h.animals.deserialize(sv);
      h.step(2);
      // もん と 反対 がわ の さく（外から ねらう）
      const sx = c.x - f.fx * 2;
      const sz = c.z - f.fz * 2;
      const stand = () => h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      for (const top of [0.1, 0.5, 0.9]) {
        stand();
        h.step(1);
        (window as any).__aim.solve(sx, c.y, sz, top);
        h.step(1);
        const t = h.target.get();
        out.aimed.push(!!t && t.block.x === sx && t.block.y === c.y && t.block.z === sz);
      }
      // 右クリック で あつめる
      stand();
      h.step(1);
      A.aimBlock(sx, c.y, sz);
      h.inventory.clear();
      h.animals.events();
      A.tap();
      out.egg = h.inventory.count('egg');
      out.collect = A.events('coopCollect').length;
      // 左で ほる（子 0 の 小屋）: ひび が 入る
      stand();
      h.step(1);
      (window as any).__aim.solve(sx, c.y, sz, 0.15);
      h.step(1);
      h.input.press('primary');
      h.step(30);
      out.crack = h.dig.get().crackStage;
      h.input.release('primary');
      return out;
    });
    expect(r.aimed, '上・まん中・下 の どこ を ねらって も その さく').toEqual([true, true, true]);
    expect(r.egg, '右クリック で あつめる').toBe(2);
    expect(r.collect).toBe(1);
    expect(r.crack, '左で ほる').toBeGreaterThan(0);
  });

  test('AC15b 当たり: 歩いて さく に 向かっても 中へ 入れない（高さ 2 のまま）・もん からは 入れる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const out: any = {};
      const sx = -f.fz;
      const sz = f.fx;
      h.player.set({ position: { x: cx + sx * 3, y: 9, z: cz + sz * 3 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-sx, -sz), pitch: 0 });
      h.step(2);
      let inside = false;
      h.input.press('moveForward');
      h.input.press('jump');
      for (let i = 0; i < 240; i++) {
        h.step(1);
        const p = h.player.get().position;
        if (A.inside(c, p)) inside = true;
      }
      h.input.release('moveForward');
      h.input.release('jump');
      out.fenceInside = inside;
      out.maxY = h.player.get().position.y;
      // もん から
      h.player.set({ position: { x: cx + f.fx * 4, y: 9, z: cz + f.fz * 4 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      h.step(2);
      h.input.press('moveForward');
      h.step(120);
      h.input.release('moveForward');
      out.gateInside = A.inside(c, h.player.get().position);
      return out;
    });
    expect(r.fenceInside, 'さく は こえられない').toBe(false);
    expect(r.gateInside, 'もん から は 入れる').toBe(true);
  });

  test('AC15c 描画: 小屋 3 つ（子 なし）を 置いた ふえ は 描画 と 三角形 が 少ない（小屋 1 つ の 三角形 3,600 以下・描画回数 は チャンク の 面 に 入れる）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      (window as any).__aim.standForS(2.5, 30.5, 90, -10, 9);
      h.step(30);
      const out: any = {};
      out.zero = A.draw();
      A.coop(20, 20);
      (window as any).__aim.standForS(2.5, 30.5, 90, -10, 9);
      h.step(30);
      out.one = A.draw();
      A.coop(20, 34);
      A.coop(20, 48);
      (window as any).__aim.standForS(2.5, 34.5, 90, -10, 9);
      h.step(30);
      out.three = A.draw();
      return out;
    });
    console.log('LIVE2.1 AC15 draw', JSON.stringify(r));
    expect(r.one.tri - r.zero.tri, '小屋 1 つ の 三角形').toBeLessThanOrEqual(3600);
    expect(r.three.tri - r.zero.tri, '小屋 3 つ の 三角形').toBeLessThanOrEqual(3600 * 3);
    // 小屋 を 板 に しても チャンク の 面 に 入る ので、小屋 1 つ ごとに 描画 が ふえ続ける ことは ない
    // はかった 値（板 の 試作 で +4）に 2 割 の ゆとり
    expect(r.three.dc - r.zero.dc, '小屋 3 つ で 描画回数').toBeLessThanOrEqual(5);
  });
});
