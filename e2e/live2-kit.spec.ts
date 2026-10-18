import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 E2E その 1（docs/design/LIVE-2.md 版 3 §6）: こたつ。
 * AC1 つくる・置く・こわす / AC2 入れる / AC3 かえる（通し）/ AC4 ゆれ / AC17 しゅるい（E2E の 分）/
 * AC19・AC20 の こたつ の ぶん（ふりわけ・照準の 下）。
 * 時間・数は 設定（kitHatchTicks など）と 窓口（kits / events / list）に 聞く。乱数は machoChance を 0 か 1 に して 決める。
 */
test.describe('LIVE-2 こたつ（たまご を あたためる）', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC1 つくる: grass 3・log 2・torch 1 → nukunuku 1・craft.nukunuku.1。置ける・こわすと nukunuku 1。カードの いちばん うしろは toriya の まえ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      const out: any = {};
      const list = h.craft.list();
      out.ids = list.map((x: any) => x.id).slice(-3);
      h.inventory.add('grass', 3);
      h.inventory.add('log', 2);
      h.inventory.add('torch', 1);
      out.make = h.craft.make('nukunuku');
      out.nuku = h.inventory.count('nukunuku');
      out.left = [h.inventory.count('grass'), h.inventory.count('log'), h.inventory.count('torch')];
      out.stat = A.stat('craft:nukunuku');
      out.unlock = A.unlocked('craft.nukunuku.1');
      out.name = h.achievements.list().find((a: any) => a.id === 'craft.nukunuku.1')?.name ?? null;
      out.type = h.inventory.itemTypes().find((t: any) => t.id === 'nukunuku') ?? null;
      // 置く: 床 (4, 8, 6) の 上
      A.hold('nukunuku', 1);
      (window as any).__aim.standForS(2.5, 6.5, 90, 0, 9);
      h.step(1);
      (window as any).__aim.solve(4, 8, 6, 1);
      h.step(1);
      const t = h.target.get();
      out.placeAt = t ? { ...t.place } : null;
      A.tap();
      out.placed = t ? h.world.getBlock(t.place.x, t.place.y, t.place.z) : null;
      out.nukuAfterPlace = h.inventory.count('nukunuku');
      // こわす（手で。たんす と 同じ くらいの 時間）
      if (t) {
        (window as any).__aim.solve(t.place.x, t.place.y, t.place.z, 0.5);
        h.step(1);
        h.input.press('primary');
        h.step(600);
        h.input.release('primary');
        h.step(2);
        out.broken = h.world.getBlock(t.place.x, t.place.y, t.place.z);
        out.nukuAfterBreak = h.inventory.count('nukunuku');
      }
      return out;
    });
    expect(r.ids.at(-2), 'いちばん うしろ から 2 つ目').toBe('nukunuku');
    expect(r.make.ok).toBe(true);
    expect(r.nuku).toBe(1);
    expect(r.left).toEqual([0, 0, 0]);
    expect(r.stat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.name).toBe('はじめて こたつ を つくった！');
    expect(r.type).toMatchObject({ name: 'こたつ' });
    expect(r.placed).toBe('nukunuku');
    expect(r.nukuAfterPlace).toBe(0);
    expect(r.broken).toBe('air');
    expect(r.nukuAfterBreak).toBe(1);
  });

  test('AC2 入れる: から + egg → egg -1・kits に { egg: egg, left: kitHatchTicks }。もう 1 回 kitWait。すで kitNeedEgg。kin_tamago → gold。7 つ目 kitMax。つち は となり に 置く', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = { total: h.settings.get('kitHatchTicks') };
      const k1 = A.kit(8, 6);
      // すで
      h.inventory.clear();
      const bare = A.putEgg(k1, 'egg', 0);
      out.bare = { aimed: bare.aimed, hint: bare.hint, kits: h.animals.kits().length };
      // egg
      const a = A.putEgg(k1, 'egg', 3);
      out.egg1 = { aimed: a.aimed, left: a.left, kits: h.animals.kits().map((k: any) => ({ x: k.x, y: k.y, z: k.z, egg: k.egg, left: k.left })), sfx: A.sfx() };
      // もう 1 回
      const b = A.putEgg(k1, 'egg', 2);
      out.egg2 = { left: b.left, hint: b.hint, kits: h.animals.kits().length };
      // kin_tamago
      const k2 = A.kit(8, 10);
      const g = A.putEgg(k2, 'kin_tamago', 1);
      out.gold = { left: g.left, egg: h.animals.kits().find((k: any) => k.x === 8 && k.z === 10)?.egg ?? null };
      // つち は となり に 置く
      const k3 = A.kit(8, 14);
      const d = A.putEgg(k3, 'dirt', 3);
      out.dirt = { left: d.left, hint: d.hint, kits: h.animals.kits().length };
      // 6 つ に 入れて 7 つ目
      for (const z of [18, 22, 26, 30]) {
        const k = A.kit(8, z);
        A.putEgg(k, 'egg', 1);
      }
      out.six = h.animals.kits().length; // k1, k2, + 4 = 6
      const k7 = A.kit(8, 34);
      const m = A.putEgg(k7, 'egg', 2);
      out.seven = { left: m.left, hint: m.hint, kits: h.animals.kits().length };
      return out;
    });
    expect(r.bare.hint).toBe('kitNeedEgg');
    expect(r.bare.kits).toBe(0);
    expect(r.egg1.left, 'egg が 1 つ へる').toBe(2);
    expect(r.egg1.kits).toEqual([{ x: 8, y: 9, z: 6, egg: 'egg', left: r.total }]);
    expect(r.egg1.sfx).toContain('kitPut');
    expect(r.egg2.left, '入って いる こたつ には 入れない').toBe(2);
    expect(r.egg2.hint).toBe('kitWait');
    expect(r.egg2.kits).toBe(1);
    expect(r.gold.left).toBe(0);
    expect(r.gold.egg).toBe('gold');
    expect(r.dirt.left, 'から の こたつ を つち で 右クリック → となり に 置く').toBe(2);
    expect(r.dirt.kits).toBe(2);
    expect(r.six).toBe(6);
    expect(r.seven.left, '7 つ目 は へらない').toBe(2);
    expect(r.seven.hint).toBe('kitMax');
    expect(r.seven.kits).toBe(6);
  });

  test('AC3 かえる（通し）: kitHatchTicks 600・5 マス → 600 ステップ目 hatchStart・60 後 hatch・chick・friend・follow まんたん・こたつ は から・hatch:* 1・animal.hatch.1', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 600);
      h.settings.set('machoChance', 0);
      const k = A.kit(8, 10);
      A.putEgg(k, 'egg', 1);
      h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 0.5 }, yaw: 90, pitch: 0 });
      h.animals.events();
      const out: any = { startAt: -1, hatchAt: -1, early: 0 };
      for (let i = 1; i <= 800; i++) {
        h.step(1);
        const ev = h.animals.events();
        if (ev.some((e: any) => e.type === 'hatchStart') && out.startAt < 0) out.startAt = i;
        if (ev.some((e: any) => e.type === 'hatch') && out.hatchAt < 0) {
          out.hatchAt = i;
          out.hatchEv = ev.find((e: any) => e.type === 'hatch');
          break;
        }
      }
      const rows = h.animals.list();
      out.rows = rows.map((a: any) => ({ stage: a.stage, friend: a.friend, follow: a.follow, breed: a.breed, id: a.id }));
      out.full = A.full();
      out.kits = h.animals.kits().length;
      out.block = h.world.getBlock(k.x, k.y, k.z);
      out.stat = A.stat('hatch:*');
      out.unlock = A.unlocked('animal.hatch.1');
      out.sfx = A.sfx();
      out.shell = h.animals.fx().shell;
      // 遠くに いる あいだは かえらない
      const k2 = A.kit(8, 30);
      h.settings.set('kitHatchTicks', 600);
      A.putEgg(k2, 'egg', 1);
      h.player.set({ position: { x: k2.x + 30, y: 9, z: k2.z + 0.5 }, yaw: 270, pitch: 0 });
      h.animals.events();
      h.step(1200);
      out.farHatch = A.events('hatch').length + A.events('hatchStart').length;
      out.farLeft = h.animals.kits().find((x: any) => x.z === 30)?.left ?? null;
      h.player.set({ position: { x: k2.x - 4.5, y: 9, z: k2.z + 0.5 } });
      h.animals.events();
      let near = -1;
      for (let i = 1; i <= 70 && near < 0; i++) {
        h.step(1);
        if (A.events('hatchStart').length) near = i;
      }
      out.nearStart = near;
      return out;
    });
    expect(r.startAt, '600 ステップ目に hatchStart').toBeGreaterThanOrEqual(597);
    expect(r.startAt).toBeLessThanOrEqual(603);
    expect(r.hatchAt - r.startAt, 'かえる 動き 60').toBeGreaterThanOrEqual(58);
    expect(r.hatchAt - r.startAt).toBeLessThanOrEqual(62);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ stage: 'chick', friend: true, follow: r.full, breed: 'normal' });
    expect(r.kits, 'こたつ は から（たまご 入りは 0）').toBe(0);
    expect(r.block).toBe('nukunuku');
    expect(r.stat).toBe(1);
    expect(r.unlock).toBe(true);
    expect(r.sfx).toContain('hatch');
    expect(r.shell, 'から の かけら').toBeGreaterThan(0);
    expect(r.farHatch, '30 マス はなれて いると かえらない').toBe(0);
    expect(r.nearStart, '5 マス に もどる と 60 ステップ 以内').toBeGreaterThan(0);
    expect(r.nearStart).toBeLessThanOrEqual(61);
  });

  test('AC3b なかま 8 わ → かえらず friendFull（くり返しは 600 ステップに 1 回）', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 300);
      const k = A.kit(8, 10);
      A.putEgg(k, 'egg', 1);
      for (let i = 0; i < 8; i++) A.friend(2.5 + (i % 4), 6.5 + Math.floor(i / 4) * 2);
      h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 0.5 }, yaw: 90, pitch: 0 });
      h.animals.events();
      h.step(1300);
      const ev = h.animals.events();
      return {
        friends: h.animals.list().filter((a: any) => a.friend).length,
        hatch: ev.filter((e: any) => e.type === 'hatch').length,
        full: ev.filter((e: any) => e.type === 'hint' && e.hint === 'friendFull').length,
        kit: h.animals.kits().length,
      };
    });
    expect(r.hatch).toBe(0);
    expect(r.friends).toBe(8);
    expect(r.kit, 'まだ 入って いる').toBe(1);
    expect(r.full, '600 に 1 回 くらい').toBeGreaterThanOrEqual(1);
    expect(r.full).toBeLessThanOrEqual(3);
  });

  test('AC4 ゆれ: のこり 2/3 以上 wobble 0・1/3〜2/3 は 1・1/3 未満 は 2', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 3000);
      const k = A.kit(8, 10);
      A.putEgg(k, 'egg', 1);
      h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 0.5 }, yaw: 90, pitch: 0 });
      const out: any = {};
      const w = () => h.animals.kits()[0];
      out.w0 = { ...w() };
      h.step(500);
      out.a = { left: w().left, wobble: w().wobble };
      h.step(1000);
      out.b = { left: w().left, wobble: w().wobble };
      h.step(1000);
      out.c = { left: w().left, wobble: w().wobble };
      return out;
    });
    expect(r.w0.wobble).toBe(0);
    expect(r.a.left).toBeGreaterThanOrEqual(2000);
    expect(r.a.wobble).toBe(0);
    expect(r.b.left).toBeGreaterThanOrEqual(1000);
    expect(r.b.left).toBeLessThan(2000);
    expect(r.b.wobble).toBe(1);
    expect(r.c.left).toBeLessThan(1000);
    expect(r.c.wobble).toBe(2);
  });

  test('AC17 しゅるい: machoChance 1 → macho・かえる 80 ステップ・hatch(breed macho・gold false)・animal.macho.1。kin_tamago（machoChance 0・machoMiss 5）→ macho・80・gold true・machoMiss 5 の まま', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 300);
      const out: any = {};
      const hatchOne = (item: string, z: number) => {
        const k = A.kit(8, z);
        A.putEgg(k, item, 1);
        h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 0.5 }, yaw: 90, pitch: 0 });
        h.animals.events();
        let s = -1;
        let t = -1;
        let hatch: any = null;
        for (let i = 1; i <= 500 && t < 0; i++) {
          h.step(1);
          for (const e of h.animals.events()) {
            if (e.type === 'hatchStart') s = i;
            if (e.type === 'hatch') {
              t = i;
              hatch = e;
            }
          }
        }
        return { dur: t - s, hatch };
      };
      h.settings.set('machoChance', 1);
      out.egg = hatchOne('egg', 6);
      out.eggRow = h.animals.list()[0];
      out.macho = A.unlocked('animal.macho.1');
      out.machoMissAfterEgg = h.animals.machoMiss();
      h.animals.clear();
      h.settings.set('machoChance', 0);
      h.animals.machoMiss(5);
      out.gold = hatchOne('kin_tamago', 12);
      out.goldRow = h.animals.list()[0];
      out.machoMissGold = h.animals.machoMiss();
      return out;
    });
    expect(r.egg.hatch).toMatchObject({ breed: 'macho', gold: false });
    expect(r.egg.dur, 'ポーズ 20 を 足して 80').toBeGreaterThanOrEqual(78);
    expect(r.egg.dur).toBeLessThanOrEqual(82);
    expect(r.eggRow.breed).toBe('macho');
    expect(r.macho).toBe(true);
    expect(r.gold.hatch).toMatchObject({ breed: 'macho', gold: true });
    expect(r.gold.dur).toBeGreaterThanOrEqual(78);
    expect(r.gold.dur).toBeLessThanOrEqual(82);
    expect(r.goldRow.breed).toBe('macho');
    expect(r.machoMissGold, 'kin_tamago は くじに 数えない').toBe(5);
  });

  test('AC17b 20 回に 1 回: machoChance 0 で 19 回 かえして normal・20 回目 は かならず macho。100 回 かえして breed は normal か macho だけ。大人に なっても かわらない', async ({ page }) => {
    test.setTimeout(150_000);
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 60);
      h.settings.set('machoChance', 0);
      const pity = h.settings.get('machoPity');
      h.animals.machoMiss(0);
      const k = A.kit(8, 10);
      const breeds: string[] = [];
      h.player.set({ position: { x: k.x - 3.5, y: 9, z: k.z + 0.5 }, yaw: 90, pitch: 0 });
      const once = () => {
        A.putEgg(k, 'egg', 1);
        h.player.set({ position: { x: k.x - 3.5, y: 9, z: k.z + 0.5 } });
        h.animals.events();
        for (let i = 0; i < 400; i++) {
          h.step(1);
          const e = h.animals.events().find((x: any) => x.type === 'hatch');
          if (e) return e.breed as string;
        }
        return 'none';
      };
      for (let n = 0; n < 20; n++) {
        breeds.push(once());
        h.animals.clear(); // なかま 8 わ の 上限に ならない ように
      }
      const out: any = { pity, breeds, miss: h.animals.machoMiss() };
      // さらに 80 回（machoChance 0.05 に もどして）
      h.settings.set('machoChance', 0.05);
      const more: string[] = [];
      for (let n = 0; n < 80; n++) {
        more.push(once());
        h.animals.clear();
      }
      out.more = more;
      return out;
    });
    expect(r.pity).toBe(19);
    expect(r.breeds.slice(0, 19)).toEqual(Array(19).fill('normal'));
    expect(r.breeds[19]).toBe('macho');
    expect(r.miss, '20 回目で 0 に もどる').toBe(0);
    expect(new Set(r.more.concat(r.breeds))).toEqual(new Set(['normal', 'macho']));
  });

  test('AC19(こたつ) ふりわけ: こたつ + トマト → たべない・kitNeedEgg。egg を 持って 空 → たべる。から の こたつ + egg → 入れる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const k = A.kit(8, 6);
      const out: any = {};
      const t = A.putEgg(k, 'tomato', 3);
      out.tomato = { left: t.left, hint: t.hint };
      // 空 を ねらって egg
      h.combat.setHp(10);
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9);
      A.hold('egg', 3);
      A.tap();
      out.eatEgg = { left: h.inventory.count('egg'), hp: h.combat.get().hp, kits: h.animals.kits().length };
      const e = A.putEgg(k, 'egg', 2);
      out.put = { left: e.left, kits: h.animals.kits().length };
      return out;
    });
    expect(r.tomato.left, 'トマトは たべない').toBe(3);
    expect(r.tomato.hint).toBe('kitNeedEgg');
    expect(r.eatEgg.left).toBe(2);
    expect(r.eatEgg.hp).toBeGreaterThan(10);
    expect(r.eatEgg.kits).toBe(0);
    expect(r.put.left).toBe(1);
    expect(r.put.kits).toBe(1);
  });

  test('AC20(こたつ) 照準の 下: こたつ + egg → egg・いれる。入って いる → まってね。previewRightClick と 実際 が 同じ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const k = A.kit(8, 6);
      A.hold('egg', 2);
      (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
      h.step(1);
      A.aimBlock(k.x, k.y, k.z);
      h.step(2);
      const out: any = { empty: A.hintRight() };
      A.tap();
      A.aimBlock(k.x, k.y, k.z);
      h.step(2);
      out.full = A.hintRight();
      return out;
    });
    expect(r.empty).toMatchObject({ icon: 'egg', word: 'いれる' });
    expect(r.full).toMatchObject({ word: 'まってね' });
  });
});
