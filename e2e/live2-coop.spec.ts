import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 3（docs/design/LIVE-2.md 版 3 §6）: とりごや。
 * AC7 つくる・置く（通し）/ AC8 プレイヤーが もん・さくを 通れる か / AC29 こわせない しらせ（チップの 文）。
 * 数・状態だけの 確認（#311）は ユニットへ: src/animals/live2.test.ts（AC7〜AC14・AC29）・src/dig/rightClick.live2.test.ts。
 * 小屋の 場所・もんの 向きは `animals.coops()` に 聞く（仮の 窓口: gate）。ブロックの id は 仮に toriya_fence / toriya_gate / toriya_nest / toriya_box。
 */
const COOP_BLOCKS = ['toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box'];

test.describe('LIVE-2 とりごや', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC7 つくる・置く: log 8・grass 4 で toriya。たいらに 置く → 5×5 の 小屋（もん・ねぐら・すばこ・さく）・もんが プレイヤーの 方・coops 1・animal.coop.1', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate((blocks) => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      h.inventory.add('log', 8);
      h.inventory.add('grass', 4);
      out.make = h.craft.make('toriya');
      h.step(3);
      out.have = h.inventory.count('toriya');
      out.craftUnlock = A.unlocked('craft.toriya.1');
      // 置く: プレイヤーは 西、もんは 西（プレイヤーの 方）を 向く
      A.hold('toriya', 2);
      (window as any).__aim.standForS(10.5, 20.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(14, 8, 20, 1);
      h.step(1);
      out.preview = A.hintRight();
      A.tap();
      const cs = h.animals.coops();
      out.coops = cs.length;
      if (cs[0]) {
        const c = cs[0];
        out.left = h.inventory.count('toriya');
        const seen: Record<string, number> = {};
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) {
          const b = h.world.getBlock(c.x + dx, c.y + dy, c.z + dz);
          if (blocks.includes(b)) seen[b] = (seen[b] ?? 0) + 1;
        }
        out.seen = seen;
        out.face = A.face(c);
        out.gate = c.gate;
        out.inner = [] as string[];
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.inner.push(h.world.getBlock(c.x + dx, c.y, c.z + dz));
        out.playerX = h.player.get().position.x;
        out.cx = c.x;
        out.unlock = A.unlocked('animal.coop.1');
        out.sfx = A.sfx();
      }
      return out;
    }, COOP_BLOCKS);
    expect(r.make.ok).toBe(true);
    expect(r.have).toBe(1);
    expect(r.craftUnlock).toBe(true);
    expect(r.preview).toMatchObject({ icon: 'toriya', word: 'おく' });
    expect(r.coops).toBe(1);
    expect(r.left).toBe(1);
    expect(r.seen.toriya_gate, 'もん').toBeGreaterThanOrEqual(1);
    expect(r.seen.toriya_nest, 'ねぐら').toBeGreaterThanOrEqual(1);
    expect(r.seen.toriya_box, 'すばこ').toBe(1);
    expect(r.seen.toriya_fence, 'さく').toBeGreaterThanOrEqual(10);
    expect(r.face.fx, 'もんは プレイヤー（西）の 方').toBe(-1);
    expect(r.face.fz).toBe(0);
    expect(r.unlock).toBe(true);
    expect(r.sfx).toContain('coopPlace');
  });

  test('AC8 通れる か: プレイヤーは もんは 通れる・さくは こえられない（歩き＋ジャンプ 300 ステップ）。やせい・小屋の 子・なかまの 通れるかは ユニット（live2.test.ts AC8）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalWanderSpeed', h.settings.get('animalWanderSpeed'));
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = { face: f };
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const walk = (n: number, jump: boolean) => {
        h.input.press('moveForward');
        if (jump) h.input.press('jump');
        const samples: any[] = [];
        for (let i = 0; i < n; i++) {
          h.step(1);
          const p = h.player.get();
          samples.push({ x: p.position.x, y: p.position.y, z: p.position.z, g: p.onGround });
        }
        h.input.release('moveForward');
        h.input.release('jump');
        return samples;
      };
      // もんから 入る: もんの 外 3 マス から まん中へ
      h.player.set({ position: { x: cx + f.fx * 4, y: 9, z: cz + f.fz * 4 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      h.step(2);
      const s1 = walk(120, false);
      const end = s1[s1.length - 1];
      out.gateInside = A.inside(c, end);
      // さく: よこの さくの 外 1 マス
      const sx = -f.fz;
      const sz = f.fx;
      h.player.set({ position: { x: cx + sx * 3, y: 9, z: cz + sz * 3 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-sx, -sz), pitch: 0 });
      h.step(2);
      const s2 = walk(300, true);
      out.fenceInside = s2.some((p) => A.inside(c, p));
      out.fenceTop = s2.some((p) => p.g && p.y >= c.y + 1 && Math.abs(p.x - cx) <= 2.5 && Math.abs(p.z - cz) <= 2.5);
      return out;
    });
    expect(r.gateInside, 'もんから 入れる').toBe(true);
    expect(r.fenceInside, 'さくを こえて 入れない').toBe(false);
    expect(r.fenceTop, 'さくの 上に のらない').toBe(false);
  });

  test('AC29 こわせない しらせ: 子が いる 小屋の さくを すでで 押す → 押した ステップに coopNotEmpty・animalHint・coopLocked 1 回・チップに 文（漢字 0）。つるはしで 600 ステップ → ひび 0・ブロックは そのまま・毎 120 ステップ チップ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate((blocks) => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = {};
      const kid = A.kid(c, { stage: 'chick' });
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      const sx = c.x - f.fx * 2;
      const sz = c.z - f.fz * 2;
      const count = () => {
        let n = 0;
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) if (blocks.includes(h.world.getBlock(c.x + dx, c.y + dy, c.z + dz))) n++;
        return n;
      };
      const n0 = count();
      out.aimed = A.aimBlock(sx, c.y, sz);
      h.inventory.clear();
      h.input.release('primary');
      h.animals.events();
      h.audio.sfx();
      h.input.press('primary');
      h.step(1);
      out.hint1 = h.animals.lastHint();
      out.sfx = A.sfx();
      out.locked1 = A.events('coopLocked').length;
      out.chip = A.chip();
      // 600 ステップ 押しつづけ
      let maxCrack = 0;
      let chipMissing = 0;
      let lockedMore = 0;
      for (let i = 1; i <= 600; i++) {
        h.step(1);
        maxCrack = Math.max(maxCrack, h.dig.get().crackStage);
        lockedMore += A.events('coopLocked').length;
        if (i % 120 === 0 && A.chip().hidden) chipMissing++;
      }
      h.input.release('primary');
      h.step(2);
      out.maxCrack = maxCrack;
      out.chipMissing = chipMissing;
      out.lockedMore = lockedMore;
      out.same = count() === n0;
      out.coops = h.animals.coops().length;
      out.kids = A.cinfo(cid).kids.length;
      // 子を だっこで 外に → こわれる
      A.stand(kid);
      A.lift(kid);
      // 外（さく の 6 マス 先）で 小屋 に 背を 向けて なげる（LIVE-2.1: 前 3 マス = 外）
      h.player.set({ position: { x: c.x + 0.5 + f.fx * 7, y: 9, z: c.z + 0.5 + f.fz * 7 }, yaw: A.yawTo(f.fx, f.fz), pitch: 20 });
      h.step(2);
      A.flight(kid, { max: 400 });
      out.kidsAfter = A.cinfo(cid)?.kids.length ?? -1;
      return out;
    }, COOP_BLOCKS);
    expect(r.hint1).toBe('coopNotEmpty');
    expect(r.sfx).toContain('animalHint');
    expect(r.locked1).toBe(1);
    expect(r.chip.text).toContain('こ が いる から こわせない よ');
    expect(r.chip.bare, '漢字 0').toEqual([]);
    expect(r.maxCrack, 'ひび 0').toBe(0);
    expect(r.chipMissing, '押している あいだ チップが 出ている').toBe(0);
    expect(r.lockedMore, 'coopLocked は 押した 1 回 だけ').toBe(0);
    expect(r.same).toBe(true);
    expect(r.coops).toBe(1);
    expect(r.kids).toBe(1);
    expect(r.kidsAfter, 'だっこで 外へ なげると 子 0').toBe(0);
  });

});
