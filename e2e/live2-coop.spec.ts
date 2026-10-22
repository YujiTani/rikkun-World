import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 3（docs/design/LIVE-2.md 版 3 §6）: とりごや。
 * AC7 つくる・置く / AC8 通れる か / AC9 小屋の 子に する / AC10 出す / AC12 小屋の たまご / AC13 ねる /
 * AC14 こわす / AC19・AC20 の 小屋の ぶん / AC22 の 窓口 / AC29 こわせない しらせ。
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
      out.have = h.inventory.count('toriya');
      out.craftUnlock = A.unlocked('craft.toriya.1');
      // 置く: プレイヤーは 西、もんは 西（プレイヤーの 方）を 向く
      A.hold('toriya', 2);
      (window as any).__aim.standForS(2.5, 20.5, 90, 0, 9);
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

  test('AC7b 置く: ねらいが 1 マス ずれて 入らない 所 でも まわりで 入れば 置ける。でこぼこ（下に 穴 3）→ 置かない・coopNoRoom・toriya へらない。4 つ目 coopMax', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      const out: any = {};
      // 1 マス ずれ: 12..16 の 5×5 の すぐ そばに 高い 柱（ねらった 所は 入らない）、でも まわりに 空きが ある
      h.world.setBlock(12, 9, 12, 'stone');
      h.world.setBlock(12, 10, 12, 'stone');
      h.step(2);
      const r1 = A.coop(14, 14);
      out.shifted = typeof r1 === 'number' ? 'id' : r1;
      out.n1 = h.animals.coops().length;
      const c1 = h.animals.coops()[0];
      // 柱 (12, 12) が 5×5 の 中に 入って いない（ずらして 置かれた）
      out.avoids = !!c1 && (Math.abs(c1.x - 12) > 2 || Math.abs(c1.z - 12) > 2);
      // でこぼこ: 別の 場所の 5×5 の 下に 穴 3
      h.world.setBlock(44, 8, 44, 'air');
      h.world.setBlock(46, 8, 44, 'air');
      h.world.setBlock(45, 8, 46, 'air');
      h.step(2);
      A.hold('toriya', 5);
      (window as any).__aim.standForS(40.5, 45.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(45, 8, 45, 1);
      h.step(1);
      const before = h.animals.coops().length;
      h.animals.events();
      A.tap();
      out.after = h.animals.coops().length - before;
      out.hint = h.animals.lastHint();
      out.left = h.inventory.count('toriya');
      return out;
    });
    expect(r.shifted, 'ずれても 置ける').toBe('id');
    expect(r.n1).toBe(1);
    expect(r.avoids, '柱を さけて ずらして 置く').toBe(true);
    expect(r.hint, 'でこぼこ').toBe('coopNoRoom');
    expect(r.after).toBe(0);
    expect(r.left).toBe(5);
  });

  test('AC7c 小屋は 3 つまで: 4 つ目 → coopMax・数は 3 のまま', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      const out: any = { ids: [] as any[] };
      for (const z of [8, 20, 32, 44]) out.ids.push(A.coop(20, z));
      out.n = h.animals.coops().length;
      A.hold('toriya', 1);
      (window as any).__aim.standForS(40.5, 20.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(50, 8, 20, 1);
      h.step(1);
      h.animals.events();
      A.tap();
      out.hint = h.animals.lastHint();
      out.left = h.inventory.count('toriya');
      out.n2 = h.animals.coops().length;
      return out;
    });
    expect(r.ids.slice(0, 3).every((x: any) => typeof x === 'number')).toBe(true);
    expect(r.ids[3]).toBe('max');
    expect(r.n).toBe(3);
    expect(r.hint).toBe('coopMax');
    expect(r.left).toBe(1);
    expect(r.n2).toBe(3);
  });

  test('AC8 通れる か: もんは 通れる・さくは こえられない（歩き＋ジャンプ 300 ステップ）・やせいは 入らない・小屋の 子は 出ない・なかまは もんから 入れる', async ({ page }) => {
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
      // やせい: もんの 前に 置いて 1,200 ステップ
      h.animals.clear();
      h.player.set({ position: { x: cx + f.fx * 12, y: 9, z: cz + f.fz * 12 }, yaw: 0 });
      const w = h.animals.spawn(cx + f.fx * 3, 9, cz + f.fz * 3, {});
      let wildIn = false;
      for (let i = 0; i < 1200; i++) {
        h.step(1);
        const a = A.one(w);
        if (a && A.inside(c, a)) wildIn = true;
      }
      out.wildIn = wildIn;
      out.wildAlive = !!A.one(w); // きえて いたら「入らない」が ただの みかけに なる
      // 小屋の 子 は さくに 向かって 歩いても 出ない
      h.animals.clear();
      const kid = A.kid(c, { stage: 'chick' });
      const kid2 = A.kid(c, { stage: 'adult' }, 1, 1);
      let kidOut = false;
      for (let i = 0; i < 1200; i++) {
        h.step(1);
        for (const k of [kid, kid2]) {
          const a = A.one(k);
          if (a && !A.inside(c, a)) kidOut = true;
        }
      }
      out.kidOut = kidOut;
      return out;
    });
    expect(r.gateInside, 'もんから 入れる').toBe(true);
    expect(r.fenceInside, 'さくを こえて 入れない').toBe(false);
    expect(r.fenceTop, 'さくの 上に のらない').toBe(false);
    expect(r.wildAlive, 'やせいは 1,200 ステップ たっても いる').toBe(true);
    expect(r.wildIn, 'やせいは 入らない').toBe(false);
    expect(r.kidOut, '小屋の 子は 出ない').toBe(false);
  });

  test('AC8b ついてくる なかまは プレイヤーに ついて もんから 入れる', async ({ page }) => {
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
      h.player.set({ position: { x: cx + f.fx * 5, y: 9, z: cz + f.fz * 5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: A.yawTo(-f.fx, -f.fz), pitch: 0 });
      const id = A.friend(cx + f.fx * 6.5, cz + f.fz * 6.5);
      h.step(20);
      h.input.press('moveForward');
      h.step(150);
      h.input.release('moveForward');
      h.step(240);
      const row = A.one(id);
      return { inside: A.inside(c, row), warps: A.events('warp').length };
    });
    expect(r.inside, 'なかまも もんから 入る（ワープでなく）').toBe(true);
    expect(r.warps).toBe(0);
  });

  test('AC9 小屋の 子に する: 中で 90 ステップ → home 0.45〜0.55・179 は null・180 で 小屋 id・home 出来事・home:* 1。120 で 出る → なかまのまま。だっこで おろす → すぐ。6 わ → coopFull', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const enter = h.settings.get('coopEnterTicks');
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const out: any = { enter };
      const mark = (id: number) => h.animals.fx().marks.find((m: any) => m.id === id) ?? null;
      // 中に プレイヤーと なかま（follow まんたん）
      h.player.set({ position: { x: cx, y: 9, z: cz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      const id = h.animals.spawn(cx + 0.8, 9, cz, { friend: true, follow: A.full() });
      h.animals.events();
      h.step(90);
      out.at90 = mark(id)?.home ?? null;
      h.step(89);
      out.at179 = A.one(id).home ?? null;
      out.mark179 = mark(id)?.home ?? null;
      h.step(1);
      out.at180 = A.one(id).home;
      out.homeEv = A.events('home').length;
      out.stat = A.stat('home:*');
      out.unlock = A.unlocked('animal.home.1');
      out.follow = A.one(id).follow;
      out.markSteps = mark(id)?.steps ?? null;
      out.kids = A.cinfo(cid).kids.length;
      out.cid = cid;
      // 出ると なかまの まま（別の 子）
      h.animals.clear();
      const id2 = h.animals.spawn(cx + 0.8, 9, cz, { friend: true, follow: A.full() });
      h.step(120);
      h.player.set({ position: { x: cx + f.fx * 5, y: 9, z: cz + f.fz * 5 } });
      h.step(150); // もんまで あるいて 出る のを 待つ（60 だと まだ 中の ことが ある）
      out.out = { home: A.one(id2).home ?? null, follow: A.one(id2).follow, mark: mark(id2)?.home ?? null };
      return out;
    });
    expect(r.at90).toBeGreaterThanOrEqual(0.45);
    expect(r.at90).toBeLessThanOrEqual(0.55);
    expect(r.at179, 'まだ').toBeNull();
    expect(r.at180).toBe(r.cid);
    expect(r.homeEv).toBe(1);
    expect(r.stat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.markSteps, '小屋の 子は ついてくる 時間 を 使わない').toBeNull();
    expect(r.kids).toBe(1);
    expect(r.out.home, '出れば なかまの まま').toBeNull();
    expect(r.out.follow).toBeGreaterThan(0);
    expect(r.out.mark, 'しるしが 消える').toBeNull();
  });

  test('AC9b だっこで 中に おろす → すぐ home。6 わの 小屋 → おろさない・coopFull。小屋の 子は なかま 8 に 数えない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const out: any = {};
      // 外で だっこ → 中に おろす（プレイヤーは 中に 立つ）
      const id = A.friend(cx + 6, cz + 6);
      h.player.set({ position: { x: cx + 6 - 2, y: 9, z: cz + 6 }, yaw: 90 });
      A.stand(id);
      out.lift = A.lift(id);
      h.player.set({ position: { x: cx, y: 9, z: cz }, yaw: 90, pitch: 30 });
      h.step(2);
      A.tap(); // おろす
      h.step(5);
      out.after = { home: A.one(id)?.home ?? null, carried: A.one(id)?.carried };
      // 6 わに する
      for (let i = 0; i < 5; i++) A.kid(A.cinfo(cid), { stage: 'adult' }, (i % 3) - 1, Math.floor(i / 3) - 1);
      out.kids = A.cinfo(cid).kids.length;
      const id7 = A.friend(cx + 6, cz + 6);
      A.stand(id7);
      A.lift(id7);
      h.player.set({ position: { x: cx, y: 9, z: cz }, yaw: 90, pitch: 30 });
      h.step(2);
      h.animals.events();
      A.tap();
      out.full = { hint: h.animals.lastHint(), carried: A.one(id7).carried, home: A.one(id7).home ?? null };
      // なかま 8 ＋ 小屋 6
      return out;
    });
    expect(r.lift).toBe(true);
    expect(r.after.home).not.toBeNull();
    expect(r.kids).toBe(6);
    expect(r.full.hint).toBe('coopFull');
    expect(r.full.carried, 'おろさない').toBe(true);
    expect(r.full.home).toBeNull();
  });

  test('AC9c 小屋の 子は なかまの 数に 入らない: なかま 8 ＋ 小屋の 子 6 が 同時に いられる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(30, 30);
      const c = A.cinfo(cid);
      for (let i = 0; i < 6; i++) A.kid(c, { stage: 'adult' }, (i % 3) - 1, Math.floor(i / 3) - 1);
      for (let i = 0; i < 8; i++) A.friend(5.5 + i, 6.5);
      h.step(60);
      const rows = h.animals.list();
      return { homed: rows.filter((a: any) => a.home).length, friends: rows.filter((a: any) => a.friend && !a.home).length, total: rows.length };
    });
    expect(r.homed).toBe(6);
    expect(r.friends).toBe(8);
    expect(r.total).toBe(14);
  });

  test('AC10 出す: 小屋の 子を だっこ して 外に おろす → home null・follow 0。なかま 8 わの とき → おろさない・friendFull', async ({ page }) => {
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
      const id = A.kid(c, { stage: 'adult' });
      // 中から だっこ して もんの 外に 出て おろす
      h.player.set({ position: { x: cx - 1.5 * f.fx || cx, y: 9, z: cz - 1.5 * f.fz || cz }, yaw: 0 });
      A.stand(id);
      out.lift = A.lift(id);
      h.player.set({ position: { x: cx + f.fx * 6, y: 9, z: cz + f.fz * 6 }, yaw: A.yawTo(f.fx, f.fz), pitch: 30 });
      h.step(2);
      A.tap();
      h.step(30);
      const row = A.one(id);
      out.row = { home: row.home ?? null, follow: row.follow, friend: row.friend, carried: row.carried };
      out.kids = A.cinfo(cid).kids.length;
      // なかま 8 わ
      h.animals.clear();
      const k2 = A.kid(A.cinfo(cid), { stage: 'adult' });
      for (let i = 0; i < 8; i++) A.friend(3.5 + i, 36.5);
      A.stand(k2);
      out.lift2 = A.lift(k2);
      h.player.set({ position: { x: cx + f.fx * 6, y: 9, z: cz + f.fz * 6 }, yaw: A.yawTo(f.fx, f.fz), pitch: 30 });
      h.step(2);
      h.animals.events();
      A.tap();
      out.full = { hint: h.animals.lastHint(), carried: A.one(k2).carried, home: A.one(k2).home ?? null };
      return out;
    });
    expect(r.lift).toBe(true);
    expect(r.row.home).toBeNull();
    expect(r.row.follow).toBe(0);
    expect(r.row.friend).toBe(true);
    expect(r.kids).toBe(0);
    expect(r.full.hint).toBe('friendFull');
    expect(r.full.carried).toBe(true);
  });

  test('AC12 小屋の たまご: animalEggChance 1 の 小屋の 大人に むし → 59 ステップ目は nest.egg 0・60 で 1・足もとに おとしもの なし。12 こ ある とき → 足もとに おとしもの', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1);
      const delay = h.settings.get('animalEggDelay');
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const id = A.kid(c, { stage: 'adult', raised: true });
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
      A.hold('mushi', 20);
      const out: any = { delay };
      A.aim(id);
      h.animals.events();
      h.input.press('secondary');
      h.step(5);
      h.input.release('secondary');
      let t = 0;
      const eggs: number[] = [];
      for (t = 1; t <= delay + 5; t++) {
        h.step(1);
        eggs.push(A.cinfo(cid).nest.egg);
      }
      out.at59 = eggs[delay - 2]; // はなして 59 ステップ目（release の 1 ステップを 除く）
      out.at61 = eggs[delay];
      out.final = A.cinfo(cid).nest.egg;
      out.drops = A.bags('egg').length;
      // 12 こ まで ためて あふれる
      out.nestMax = h.settings.get('coopNestMax');
      return out;
    });
    expect(r.nestMax).toBe(12);
    expect(r.at59, '59 ステップ目 は まだ').toBe(0);
    expect(r.at61, '60 ステップ 目 を すぎれば 1').toBe(1);
    expect(r.final).toBe(1);
    expect(r.drops, 'すばこに 入る').toBe(0);
  });

  test('AC12b あつめる・あふれる: すばこ 12 こ → 足もとに おとしもの。さくを 外から 右クリック → egg が 持ち物に・nest.egg 0・coopCollect。0 こ で すで → coopNoEgg・つち → となりに 置く', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = {};
      const id = A.kid(c, { stage: 'adult', raised: true });
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
      A.hold('mushi', 20);
      const delay = h.settings.get('animalEggDelay');
      const full = h.settings.get('animalFullTicks');
      for (let i = 0; i < 13; i++) {
        A.aim(id);
        A.tap();
        h.step(delay + 3);
        h.step(full + 40);
      }
      out.nest = A.cinfo(cid).nest.egg;
      out.floor = A.bags('egg').length;
      // 外から さくを 右クリック（もんと 反対がわ の さく）
      h.inventory.clear();
      const sx = c.x - f.fx * 2;
      const sz = c.z - f.fz * 2;
      h.player.set({ position: { x: sx + 0.5 - f.fx * 2.5, y: 9, z: sz + 0.5 - f.fz * 2.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      A.aimBlock(sx, c.y, sz);
      h.animals.events();
      A.tap();
      out.egg = h.inventory.count('egg');
      out.nestAfter = A.cinfo(cid).nest.egg;
      out.collect = A.events('coopCollect').length;
      out.sfx = A.sfx();
      // 0 こ で すで
      h.animals.events();
      A.tap();
      out.hintBare = h.animals.lastHint();
      // 0 こ で つち
      A.hold('dirt', 3);
      A.aimBlock(sx, c.y, sz);
      A.tap();
      out.dirt = h.inventory.count('dirt');
      return out;
    });
    expect(r.nest).toBe(12);
    expect(r.floor, '12 こ の とき うんだ たまごは 足もとに').toBeGreaterThanOrEqual(1);
    expect(r.egg).toBe(12);
    expect(r.nestAfter).toBe(0);
    expect(r.collect).toBe(1);
    expect(r.sfx).toContain('collect');
    expect(r.hintBare).toBe('coopNoEgg');
    expect(r.dirt, 'つちは となりに 置かれる').toBe(2);
  });

  test('AC12c かならず: animalEggChance 0・animalEggPity 7 の まま 小屋の 大人に 600 ステップごと 8 回 → 8 回目だけ すばこ +1', async ({ page }) => {
    test.setTimeout(150_000);
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 0);
      const pity = h.settings.get('animalEggPity');
      const delay = h.settings.get('animalEggDelay');
      const gap = h.settings.get('animalFullTicks') + 40;
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const id = A.kid(c, { stage: 'adult', raised: true });
      A.hold('mushi', 20);
      const counts: number[] = [];
      for (let n = 1; n <= 8; n++) {
        h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
        A.aim(id);
        A.tap();
        h.step(delay + 3);
        counts.push(A.cinfo(cid).nest.egg);
        h.step(gap);
      }
      return { pity, counts };
    });
    expect(r.pity).toBe(7);
    expect(r.counts.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.counts[7]).toBe(1);
  });

  test('AC13 ねる: night で 小屋の 子 state sleep・fx().zzz が 子の 数。むし → へらない・sleepHint。dawn で ねない。外の なかまは ねない', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const a = A.kid(c, { stage: 'adult' }, -1, 0);
      const b = A.kid(c, { stage: 'chick' }, 1, 0);
      const out_f = A.friend(6.5, 6.5);
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
      A.night();
      h.step(120);
      const out: any = { phase: h.time.get().phase };
      out.states = [A.one(a).state, A.one(b).state];
      out.zzz = h.animals.fx().zzz;
      out.outside = A.one(out_f).state;
      A.hold('mushi', 3);
      A.aim(a);
      h.animals.events();
      A.tap();
      h.step(70);
      out.mushi = h.inventory.count('mushi');
      out.hint = h.animals.lastHint();
      const s = h.settings;
      h.time.set(s.get('dayTicks') + s.get('duskTicks') + s.get('nightTicks') + 100);
      h.step(300);
      out.dawn = [A.one(a).state, A.one(b).state];
      out.phaseDawn = h.time.get().phase;
      return out;
    });
    expect(r.states).toEqual(['sleep', 'sleep']);
    expect(r.zzz).toBe(2);
    expect(r.outside).not.toBe('sleep');
    expect(r.mushi, 'ねている 子は たべない').toBe(3);
    expect(r.hint).toBe('sleepHint');
    expect(r.dawn).not.toContain('sleep');
  });

  test('AC14 小屋を こわす: 子 0 で さくを ほる → 小屋の ブロックが 1 つも のこらない・coops 0・toriya 1 と すばこの たまごが おちる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate((blocks) => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = {};
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      const sx = c.x - f.fx * 2;
      const sz = c.z - f.fz * 2;
      A.aimBlock(sx, c.y, sz);
      h.input.press('primary');
      h.step(600);
      h.input.release('primary');
      h.step(30);
      out.left = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) {
        if (blocks.includes(h.world.getBlock(c.x + dx, c.y + dy, c.z + dz))) out.left++;
      }
      out.coops = h.animals.coops().length;
      out.drops = A.bags('toriya').length;
      return out;
    }, COOP_BLOCKS);
    expect(r.left).toBe(0);
    expect(r.coops).toBe(0);
    expect(r.drops, 'toriya が おちる').toBeGreaterThanOrEqual(1);
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
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 20 });
      h.step(2);
      A.tap(); // おろす
      h.step(5);
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
    expect(r.kidsAfter, 'だっこで 外に おろすと 子 0').toBe(0);
  });

  test('AC29b もん・ねぐら・すばこ でも 同じ（中から ねらう）。だっこ中に 押しても 小屋は のこる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = { hints: {}, aimed: {}, found: {} };
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      // 子は 中の すみ に（ねらいの 線から はずす）
      const kid = A.kid(c, { stage: 'chick' }, -f.fz, f.fx);
      h.inventory.clear();
      const find = (id: string) => {
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) {
          if (h.world.getBlock(c.x + dx, c.y + dy, c.z + dz) === id) return { x: c.x + dx, y: c.y + dy, z: c.z + dz };
        }
        return null;
      };
      // 中の 手前の 列（もんの 内がわ）に 立って、ブロックを ねらう
      const inside = () => h.player.set({ position: { x: cx + f.fx * 1, y: 9, z: cz + f.fz * 1 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      for (const [name, id] of [['gate', 'toriya_gate'], ['nest', 'toriya_nest'], ['box', 'toriya_box']] as const) {
        const p = find(id);
        out.found[name] = !!p;
        if (!p) continue;
        inside();
        h.step(2);
        out.aimed[name] = A.aimBlock(p.x, p.y, p.z);
        h.animals.events();
        h.input.press('primary');
        h.step(5);
        out.hints[name] = { hint: h.animals.lastHint(), crack: h.dig.get().crackStage };
        h.input.release('primary');
        h.step(2);
      }
      out.stillThere = h.animals.coops().length;
      // だっこ中に 押しても のこる（だっこ中の 子も 数える。左クリックは 何も しない）
      inside();
      h.step(2);
      out.lift = A.lift(kid);
      const back = { x: c.x - f.fx * 2, y: c.y, z: c.z - f.fz * 2 };
      out.aimedCarry = A.aimBlock(back.x, back.y, back.z);
      h.input.press('primary');
      h.step(300);
      h.input.release('primary');
      h.step(2);
      out.carry = { coops: h.animals.coops().length, kids: h.animals.coops()[0]?.kids.length ?? -1, crack: h.dig.get().crackStage, carried: A.one(kid)?.carried };
      return out;
    });
    for (const k of ['gate', 'nest', 'box']) {
      expect(r.found[k], `${k} の ブロックが 小屋に ある`).toBe(true);
      expect(r.aimed[k], `${k} を ねらえた`).toBe(true);
      expect(r.hints[k].hint, k).toBe('coopNotEmpty');
      expect(r.hints[k].crack, k).toBe(0);
    }
    expect(r.stillThere).toBe(1);
    expect(r.lift).toBe(true);
    expect(r.aimedCarry).toBe(true);
    expect(r.carry.carried, 'だっこ したまま').toBe(true);
    expect(r.carry.coops, 'だっこ中は 小屋は のこる').toBe(1);
    expect(r.carry.kids, 'だっこ中の 子も 数える').toBe(1);
    expect(r.carry.crack).toBe(0);
  });

  test('AC29c いえの しるしの とちゅうの なかま だけが 中に いる 小屋は こわれる（子 0）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate((blocks) => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      // 3 秒（180）の うちに ほり おわる のは むずかしい ので、小屋の 子に なる のを 十分 おそく する
      h.settings.set('coopEnterTicks', 1_000_000);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      const id = h.animals.spawn(cx, 9, cz, { friend: true, follow: A.full() });
      h.step(30);
      const out: any = { mark: h.animals.fx().marks.find((m: any) => m.id === id)?.home ?? null, kids0: A.cinfo(cid).kids.length };
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
      h.inventory.clear();
      h.animals.events();
      h.input.press('primary');
      h.step(600);
      h.input.release('primary');
      h.step(30);
      out.locked = A.events('coopLocked').length;
      out.coops = h.animals.coops().length;
      out.left = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 4; dy++) if (blocks.includes(h.world.getBlock(c.x + dx, c.y + dy, c.z + dz))) out.left++;
      const row = A.one(id);
      out.friend = !!row && row.friend === true && !row.home;
      return out;
    }, COOP_BLOCKS);
    expect(r.kids0, 'まだ 小屋の 子 ではない').toBe(0);
    expect(r.locked, 'こわせない しらせは 出ない').toBe(0);
    expect(r.coops).toBe(0);
    expect(r.left).toBe(0);
    expect(r.friend, 'なかまの まま').toBe(true);
  });

  test('AC19(小屋) ふりわけ: 小屋の すばこを ねらって つち → 置かず あつめる。だっこ中に 小屋を ねらう → おろす だけ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      h.settings.set('animalEggChance', 1);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const f = A.face(c);
      const out: any = {};
      const id = A.kid(c, { stage: 'adult', raised: true });
      h.player.set({ position: { x: c.x + 0.5 - 1.5, y: 9, z: c.z + 0.5 }, yaw: 90 });
      A.hold('mushi', 3);
      A.aim(id);
      A.tap();
      h.step(h.settings.get('animalEggDelay') + 5);
      out.nest = A.cinfo(cid).nest.egg;
      // つち を 持って 小屋の さく を ねらう
      A.hold('dirt', 3);
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
      A.tap();
      out.dirt = h.inventory.count('dirt');
      out.egg = h.inventory.count('egg');
      out.nestAfter = A.cinfo(cid).nest.egg;
      // だっこ中に 小屋を ねらう → おろす だけ（つち は 置かず、あつめ も しない）
      const w = h.animals.spawn(c.x + 0.5 - f.fx * 3.5, 9, c.z + 0.5 - f.fz * 3.5, { friend: true, follow: A.full(), stage: 'chick' });
      h.step(3);
      A.hold('dirt', 3);
      out.lift = A.lift(w);
      A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
      h.animals.events();
      A.tap();
      out.dropped = A.one(w)?.carried === false;
      out.dirt2 = h.inventory.count('dirt');
      out.collect2 = A.events('coopCollect').length;
      return out;
    });
    expect(r.nest).toBe(1);
    expect(r.dirt, '置かない').toBe(3);
    expect(r.egg, 'あつめる').toBe(1);
    expect(r.nestAfter).toBe(0);
    expect(r.lift).toBe(true);
    expect(r.dropped, 'おろす').toBe(true);
    expect(r.dirt2, 'だっこ中は つち を 置かない').toBe(3);
    expect(r.collect2, 'だっこ中は あつめない').toBe(0);
  });

  test('AC20(小屋) 照準の 下: 小屋 → あつめる、toriya + 地面 → おく（入らない 所 は disabled true）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      // toriya ＋ 地面（入る）
      A.hold('toriya', 1);
      (window as any).__aim.standForS(2.5, 20.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(14, 8, 20, 1);
      h.step(2);
      out.ok = A.hintRight();
      // 入らない: 5×5 の 上に 高い 柱を 立てる
      for (let y = 9; y < 14; y++) for (const [x, z] of [[24, 34], [26, 34], [28, 34], [24, 36], [28, 36], [26, 36], [24, 38], [26, 38], [28, 38]]) h.world.setBlock(x, y, z, 'stone');
      h.step(2);
      (window as any).__aim.standForS(20.5, 36.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(25, 8, 36, 1);
      h.step(2);
      out.ng = A.hintRight();
      // 小屋
      const cid = A.coop(12, 12);
      const c = A.cinfo(cid);
      A.kid(c, { stage: 'adult', raised: true });
      A.hold('mushi', 1);
      const f = A.face(c);
      h.player.set({ position: { x: c.x + 0.5 - f.fx * 4.5, y: 9, z: c.z + 0.5 - f.fz * 4.5 }, yaw: A.yawTo(f.fx, f.fz), pitch: 0 });
      h.step(2);
      A.aimBlock(c.x - f.fx * 2, c.y, c.z - f.fz * 2);
      h.step(2);
      out.coop = A.hintRight();
      return out;
    });
    expect(r.ok).toMatchObject({ icon: 'toriya', word: 'おく' });
    expect(r.ok.disabled).toBeFalsy();
    expect(r.ng).toMatchObject({ icon: 'toriya', word: 'おく', disabled: true });
    expect(r.coop).toMatchObject({ word: 'あつめる' });
  });

  test('AC22(窓口) list() の 行に stage・breed・home・raised、coops() に kids（id の 配列）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const A = (window as any).__A;
      A.base(40);
      const cid = A.coop(20, 20);
      const c = A.cinfo(cid);
      const a = A.kid(c, { stage: 'adult', raised: true, breed: 'macho' });
      const f = A.friend(5.5, 6.5, { stage: 'chick' });
      return { a: A.one(a), f: A.one(f), kids: A.cinfo(cid).kids, cid, aid: a };
    });
    expect(r.a).toMatchObject({ stage: 'adult', breed: 'macho', home: r.cid, raised: true });
    expect(r.f).toMatchObject({ stage: 'chick', breed: 'normal', raised: false });
    expect(r.f.home ?? null).toBeNull();
    expect(r.kids).toEqual([r.aid]);
  });
});
