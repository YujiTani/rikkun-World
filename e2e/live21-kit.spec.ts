import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 4（docs/design/LIVE-2.1.md 版 1.1 §2.4・§3.2・§4.3・§6）: こたつ に 3 こ。
 * AC10 3 こ まで / AC11 かえる（通し）/ AC12 こたつ の 表示 / AC13 こわす / AC14 保存 v 4。
 * 窓口: `animals.kits()` = [{ x, y, z, size, eggs: [{ egg, left, wobble }], egg, left, wobble }]（後ろ 3 つは 先頭 の たまご）・
 * `animals.fx().kitIcons`・`animals.lastHint()` の `kitFull`。時間は 設定 `kitHatchTicks` と ステップ で 決める（#255）。
 * 「こたつ の 中 の たまご の 3D の 物 が 0」は `animals.fx().kitEggMeshes === 0`（PO 決定。仕様 §6.2）。
 */
test.describe('LIVE-2.1 こたつ に 3 こ', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC10 3 こ まで: から の こたつ に egg で 3 回（60 ステップ ごと）→ eggs 3 行（入れた 順・left が 60 ずつ へる）・egg −3。4 回目 → へらない・kitFull。kin_tamago → 行 egg gold', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = { total: h.settings.get('kitHatchTicks') };
      const k = A.kit(8, 6);
      A.hold('egg', 4);
      (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
      h.step(1);
      out.aimed = A.aimBlock(k.x, k.y, k.z);
      h.animals.events();
      // 3 回目 の tap の すぐ あと（ステップ を 進める 前）に 読む（さきに 進めると left が へる）
      for (let n = 0; n < 3; n++) {
        A.tap();
        if (n < 2) h.step(58);
      }
      const row = h.animals.kits()[0];
      out.kits = h.animals.kits().length;
      out.eggs = row ? row.eggs.map((e: any) => ({ egg: e.egg, left: e.left, wobble: e.wobble })) : null;
      out.legacy = row ? { egg: row.egg, left: row.left, wobble: row.wobble } : null;
      out.left3 = h.inventory.count('egg');
      // 4 回目
      h.animals.events();
      A.tap();
      out.hint4 = h.animals.lastHint();
      out.left4 = h.inventory.count('egg');
      out.eggs4 = h.animals.kits()[0]?.eggs.length ?? null;
      // kin_tamago を まぜる（べつの こたつ）
      const k2 = A.kit(8, 12);
      A.putEgg(k2, 'egg', 1);
      A.putEgg(k2, 'kin_tamago', 1);
      out.mixed = h.animals.kits().find((q: any) => q.z === 12)?.eggs.map((e: any) => e.egg) ?? null;
      return out;
    });
    expect(r.aimed).toBe(true);
    expect(r.kits).toBe(1);
    expect(r.eggs, 'eggs 3 行').toHaveLength(3);
    expect(r.eggs.map((e: any) => e.egg)).toEqual(['egg', 'egg', 'egg']);
    expect(r.eggs[2].left, '3 こ目 が いちばん あたらしい').toBeLessThanOrEqual(r.total);
    expect(r.eggs[2].left).toBeGreaterThanOrEqual(r.total - 10);
    // 入れた 順。さき に 入れた ほう が 時計 が すすんで いる（left が 小さい）
    expect(r.eggs[1].left - r.eggs[0].left, '60 ステップ ごと').toBeGreaterThanOrEqual(57);
    expect(r.eggs[1].left - r.eggs[0].left).toBeLessThanOrEqual(63);
    expect(r.eggs[2].left - r.eggs[1].left).toBeGreaterThanOrEqual(57);
    expect(r.eggs[2].left - r.eggs[1].left).toBeLessThanOrEqual(63);
    expect(r.legacy, '前の 形（先頭 の たまご）').toMatchObject({ egg: 'egg', left: r.eggs[0].left, wobble: r.eggs[0].wobble });
    expect(r.left3, 'egg −3').toBe(1);
    expect(r.hint4).toBe('kitFull');
    expect(r.left4, '4 回目 は へらない').toBe(1);
    expect(r.eggs4).toBe(3);
    expect(r.mixed).toEqual(['egg', 'gold']);
  });

  test('AC10b たまご 6 こ まで（世界ぜんぶ）: こたつ 2 台 に 3 こ ずつ → 3 台目 に egg → へらない・kitMax。1 こ 入り ＋ トマト → kitWait、＋ つち → となり に つち', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = { active: h.settings.get('kitActiveMax') };
      const fill = (k: any, n: number) => {
        A.hold('egg', n);
        (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
        h.step(1);
        A.aimBlock(k.x, k.y, k.z);
        for (let i = 0; i < n; i++) { A.tap(); h.step(3); }
      };
      const k1 = A.kit(8, 6);
      const k2 = A.kit(8, 12);
      fill(k1, 3);
      fill(k2, 3);
      out.total = h.animals.kits().reduce((s: number, q: any) => s + q.eggs.length, 0);
      const k3 = A.kit(8, 18);
      const m = A.putEgg(k3, 'egg', 2);
      out.seven = { left: m.left, hint: m.hint, rows: h.animals.kits().length };
      return out;
    });
    expect(r.active, 'kitActiveMax は たまご の 数').toBe(6);
    expect(r.total, 'こたつ 2 台 を いっぱい に すると ちょうど 6').toBe(6);
    expect(r.seven.left, '7 こ目 は へらない').toBe(2);
    expect(r.seven.hint).toBe('kitMax');
    expect(r.seven.rows).toBe(2);
  });

  test('AC10c 1 こ 入り の こたつ ＋ トマト → kitWait（へらない）、＋ つち → となり に つち。1〜2 こ 入って いて egg を 持てば 入れる', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const out: any = {};
      const k = A.kit(8, 6);
      A.putEgg(k, 'egg', 1);
      const t = A.putEgg(k, 'tomato', 2);
      out.tomato = { left: t.left, hint: t.hint };
      // egg を さきに（つち を 先に 置くと となり の つち が 照準 を さえぎる）
      const e = A.putEgg(k, 'egg', 2);
      out.egg = { aimed: e.aimed, left: e.left, hint: e.hint, rows: h.animals.kits()[0].eggs.length };
      const d = A.putEgg(k, 'dirt', 3);
      out.dirt = { aimed: d.aimed, left: d.left, rows: h.animals.kits()[0].eggs.length };
      return out;
    });
    expect(r.egg.aimed, 'egg の とき こたつ を ねらえた').toBe(true);
    expect(r.dirt.aimed, 'つち の とき こたつ を ねらえた（照準 を さえぎらない）').toBe(true);
    expect(r.tomato.hint).toBe('kitWait');
    expect(r.tomato.left, 'トマト は たべない').toBe(2);
    expect(r.dirt.left, 'つち は となり に 置く').toBe(2);
    expect(r.dirt.rows, 'つち は となり に 置く ので たまご は そのまま（さきに egg を 1 こ 入れた ので 2）').toBe(2);
    expect(r.egg.hint, '1 こ 入って いても 入れる（kitWait に ならない）').not.toBe('kitWait');
    expect(r.egg.left).toBe(1);
    expect(r.egg.rows).toBe(2);
  });

  test('AC11 こたつ で かえる（通し）: kitHatchTicks 600・3 こ を 30 ステップ ごと・プレイヤー 5 マス → 1 こ目 hatchStart、60 後 hatch、2 こ目 の hatchStart は 1 こ目 の hatch の 20 ステップ 後、3 わ かえる と kits() から 消える。ひよこ は プレイヤー に いちばん 近い 辺 の すぐ 外', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 600);
      h.settings.set('machoChance', 0);
      const k = A.kit(8, 10);
      A.hold('egg', 3);
      (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
      h.step(1);
      A.aimBlock(k.x, k.y, k.z);
      for (let n = 0; n < 3; n++) {
        A.tap();
        h.step(28);
      }
      h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 1.0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.animals.events();
      const starts: number[] = [];
      const hatches: number[] = [];
      const chicks: any[] = [];
      const seen = new Set<number>();
      let overlap = false;
      let open = 0;
      for (let i = 1; i <= 1600 && hatches.length < 3; i++) {
        h.step(1);
        for (const e of h.animals.events()) {
          if (e.type === 'hatchStart') { starts.push(i); open++; if (open > 1) overlap = true; }
          if (e.type === 'hatch') {
            hatches.push(i);
            open--;
            const row = h.animals.list().filter((q: any) => !seen.has(q.id)).sort((a: any, b: any) => b.id - a.id)[0];
            if (row) { seen.add(row.id); chicks.push({ x: row.x, z: row.z, stage: row.stage }); }
          }
        }
      }
      const out: any = { starts, hatches, overlap, chicks, kits: h.animals.kits().length, block: String(h.world.getBlock(k.x, k.y, k.z)), k };
      out.rows = h.animals.list().length;
      return out;
    });
    expect(r.starts, 'hatchStart 3 回').toHaveLength(3);
    expect(r.hatches, 'hatch 3 回').toHaveLength(3);
    expect(r.overlap, '同時 に 2 つ の hatchStart が 無い').toBe(false);
    expect(r.hatches[0] - r.starts[0], 'かえる 動き 60').toBeGreaterThanOrEqual(58);
    expect(r.hatches[0] - r.starts[0]).toBeLessThanOrEqual(62);
    expect(r.starts[1] - r.hatches[0], '前の 子 の あと 20 ステップ あけて 次').toBeGreaterThanOrEqual(18);
    expect(r.starts[1] - r.hatches[0]).toBeLessThanOrEqual(22);
    expect(r.starts[2] - r.hatches[1]).toBeGreaterThanOrEqual(18);
    expect(r.starts[2] - r.hatches[1]).toBeLessThanOrEqual(22);
    expect(r.kits, '3 わ とも かえる と kits() から 消える').toBe(0);
    expect(r.block, 'こたつ は のこる').toBe('nukunuku');
    expect(r.rows).toBe(3);
    // ひよこ の 出た 所: こたつ(8..10 × 10..12) の 外・西の 辺 の まん中(x=8, z=11) から 1 マス いない（ゆとり 0.6）
    for (const c of r.chicks) {
      const inside = c.x > r.k.x && c.x < r.k.x + 2 && c.z > r.k.z && c.z < r.k.z + 2;
      expect(inside, `こたつ の 上 では ない (${c.x}, ${c.z})`).toBe(false);
      expect(Math.hypot(c.x - r.k.x, c.z - (r.k.z + 1)), `西の 辺 の まん中 の すぐ 外 (${c.x}, ${c.z})`).toBeLessThanOrEqual(1.6);
      expect(c.x, '西がわ（プレイヤー の ほう）').toBeLessThanOrEqual(r.k.x + 0.05);
    }
  });

  test('AC11b マッチョ は 80 ステップ（hatchStart → hatch）。1 台 で 同時 に かえる の は 1 こ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(48);
      h.settings.set('kitHatchTicks', 300);
      h.settings.set('machoChance', 1);
      const k = A.kit(8, 10);
      A.putEgg(k, 'egg', 1);
      h.player.set({ position: { x: k.x - 4.5, y: 9, z: k.z + 1 }, yaw: 90, pitch: 0 });
      h.animals.events();
      let s = -1;
      let t = -1;
      let hatch: any = null;
      for (let i = 1; i <= 600 && t < 0; i++) {
        h.step(1);
        for (const e of h.animals.events()) {
          if (e.type === 'hatchStart') s = i;
          if (e.type === 'hatch') { t = i; hatch = e; }
        }
      }
      return { dur: t - s, hatch };
    });
    expect(r.hatch).toMatchObject({ breed: 'macho' });
    expect(r.dur).toBeGreaterThanOrEqual(78);
    expect(r.dur).toBeLessThanOrEqual(82);
  });

  test('AC12 こたつ の 表示: eggs[i].wobble が のこり で 0／1／2。fx().kitIcons に こたつ ごと { x, y, z, slots(いつも 3) }・8 マス 以内 で 出る・20 マス で 出ない・egg を 持って から の こたつ を ねらう と 3 わく とも null で 出る', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      h.settings.set('kitHatchTicks', 3000);
      const out: any = { total: 3000 };
      const k = A.kit(8, 10);
      A.hold('egg', 3);
      (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
      h.step(1);
      A.aimBlock(k.x, k.y, k.z);
      A.tap();
      h.step(1098);
      A.tap();
      h.step(1098);
      A.tap();
      h.step(2);
      h.inventory.clear();
      h.step(1);
      const row = h.animals.kits()[0];
      out.eggs = row.eggs.map((e: any) => ({ egg: e.egg, left: e.left, wobble: e.wobble }));
      out.first = { wobble: row.wobble, left: row.left };
      out.icons = h.animals.fx().kitIcons ?? null;
      out.eggMeshes = h.animals.fx().kitEggMeshes;
      const mine = (ic: any) => (ic ?? []).find((q: any) => q.x === k.x && q.y === k.y && q.z === k.z) ?? null;
      out.near = mine(out.icons);
      // 遠く（20 マス）
      h.player.set({ position: { x: k.x + 20.5, y: 9, z: k.z + 0.5 }, yaw: 270, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
      out.far = mine(h.animals.fx().kitIcons ?? null);
      // から の こたつ: egg を 持って ねらう
      const k2 = A.kit(30, 40);
      (window as any).__aim.standForS(k2.x - 1.5, k2.z + 0.5, 90, 0, k2.y);
      h.step(3);
      out.emptyNoEgg = mine2(h.animals.fx().kitIcons ?? null);
      function mine2(ic: any) { return (ic ?? []).find((q: any) => q.x === k2.x && q.z === k2.z) ?? null; }
      A.hold('egg', 1);
      (window as any).__aim.standForS(k2.x - 1.5, k2.z + 0.5, 90, 0, k2.y);
      h.step(1);
      A.aimBlock(k2.x, k2.y, k2.z);
      h.step(2);
      out.emptyAim = mine2(h.animals.fx().kitIcons ?? null);
      return out;
    });
    expect(r.eggs).toHaveLength(3);
    expect(r.eggs.map((e: any) => e.wobble), '3 こ の ゆれ（のこり 3分の2 以上 0・3分の1〜3分の2 は 1・3分の1 未満 2）').toEqual([2, 1, 0]);
    expect(r.first.wobble, 'kits()[0].wobble は 先頭 の たまご').toBe(r.eggs[0].wobble);
    expect(r.near, '8 マス 以内 で 出る').not.toBeNull();
    expect(r.near.slots, 'slots は いつも 3').toHaveLength(3);
    expect(r.near.slots.map((s: any) => s.egg)).toEqual(['egg', 'egg', 'egg']);
    expect(r.near.slots[0].fill, 'あたため の すすみ 0〜1').toBeGreaterThan(r.near.slots[1].fill);
    expect(r.near.slots[1].fill).toBeGreaterThan(r.near.slots[2].fill);
    for (const s of r.near.slots) {
      expect(s.fill).toBeGreaterThanOrEqual(0);
      expect(s.fill).toBeLessThanOrEqual(1);
    }
    expect(r.near.slots.map((s: any) => s.wobble)).toEqual(r.eggs.map((e: any) => e.wobble));
    expect(r.eggMeshes, 'こたつ の 中 の たまご の 3D の 物 が 0（窓口 fx().kitEggMeshes）').toBe(0);
    expect(r.far, '20 マス では 出ない').toBeNull();
    expect(r.emptyNoEgg, 'から で たまご を 持たない なら 出ない').toBeNull();
    expect(r.emptyAim, 'から でも egg を 持って ねらえば 3 わく とも null で 出る').not.toBeNull();
    expect(r.emptyAim.slots).toHaveLength(3);
    expect(r.emptyAim.slots.map((s: any) => s.egg)).toEqual([null, null, null]);
  });

  test('AC13 こたつ を こわす: egg 2・kin_tamago 1 入り を ほる → おとしもの egg 2・kin_tamago 1・nukunuku 1・kits() から 消える', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(40);
      const k = A.kit(8, 6);
      A.putEgg(k, 'egg', 1);
      A.putEgg(k, 'egg', 1);
      A.putEgg(k, 'kin_tamago', 1);
      const out: any = { before: h.animals.kits()[0].eggs.map((e: any) => e.egg) };
      h.inventory.clear();
      (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
      h.step(1);
      out.aimed = A.aimBlock(k.x, k.y, k.z);
      for (let i = 0; i < 20 && h.world.getBlock(k.x, k.y, k.z) !== 'air'; i++) {
        h.input.press('primary');
        h.step(60);
        h.input.release('primary');
        h.step(1);
      }
      h.step(3);
      const sum = (item: string) => {
        let n = h.inventory.count(item);
        for (const b of A.bags(item)) for (const s of b.slots) if (s.item === item) n += s.count ?? 1;
        return n;
      };
      out.egg = sum('egg');
      out.gold = sum('kin_tamago');
      out.nuku = sum('nukunuku');
      out.kits = h.animals.kits().length;
      return out;
    });
    expect(r.before).toEqual(['egg', 'egg', 'gold']);
    expect(r.aimed).toBe(true);
    expect(r.egg).toBe(2);
    expect(r.gold).toBe(1);
    expect(r.nuku).toBe(1);
    expect(r.kits).toBe(0);
  });

  test('AC14 保存 v 4: こたつ 2 台（3 こ〈egg 1,000・gold 3,000・egg 7,200〉・1 こ）→ 取り出して 読み直す と 同じ（順 も）。v 3 の kits 行 → eggs 1 行。5 こ → 3 こ。9 こ → 6 こ', async ({ page }) => {
    await openAnimals(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base(60);
      h.settings.set('kitHatchTicks', 7200);
      const out: any = {};
      const ks = [A.kit(8, 6), A.kit(8, 12), A.kit(8, 18), A.kit(8, 24)];
      const shape = (a: any[]) => a.map((q: any) => ({ x: q.x, z: q.z, eggs: q.eggs.map((e: any) => ({ egg: e.egg, left: e.left })) }));
      // v 4 を 流しこむ
      h.animals.deserialize({
        v: 4, friends: [], coops: [], machoMiss: 0,
        kits: [
          { x: ks[0].x, y: ks[0].y, z: ks[0].z, eggs: [{ egg: 'egg', left: 1000 }, { egg: 'gold', left: 3000 }, { egg: 'egg', left: 7200 }] },
          { x: ks[1].x, y: ks[1].y, z: ks[1].z, eggs: [{ egg: 'egg', left: 500 }] },
        ],
      });
      h.step(2);
      out.loaded = shape(h.animals.kits());
      const ser = h.animals.serialize();
      out.v = (ser as any).v;
      const text = JSON.stringify(ser);
      out.len = text.length;
      h.animals.deserialize(JSON.parse(text));
      h.step(1);
      out.again = shape(h.animals.kits());
      // v 3 の 行
      h.animals.deserialize({ v: 3, friends: [], coops: [], machoMiss: 0, kits: [{ x: ks[2].x, y: ks[2].y, z: ks[2].z, egg: 'gold', left: 500 }] });
      h.step(2);
      out.v3 = shape(h.animals.kits());
      // 5 こ の 行
      h.animals.deserialize({
        v: 4, friends: [], coops: [], machoMiss: 0,
        kits: [{ x: ks[0].x, y: ks[0].y, z: ks[0].z, eggs: [1, 2, 3, 4, 5].map((n) => ({ egg: 'egg', left: 1000 * n })) }],
      });
      h.step(2);
      out.five = shape(h.animals.kits());
      // 9 こ ぶん（3 + 3 + 3）→ 6 こ だけ
      h.animals.deserialize({
        v: 4, friends: [], coops: [], machoMiss: 0,
        kits: [0, 1, 2].map((i) => ({ x: ks[i].x, y: ks[i].y, z: ks[i].z, eggs: [1, 2, 3].map((n) => ({ egg: 'egg', left: 1000 * n })) })),
      });
      h.step(2);
      out.nine = shape(h.animals.kits());
      // eggs が 0 こ の 行 は すてる
      h.animals.deserialize({ v: 4, friends: [], coops: [], machoMiss: 0, kits: [{ x: ks[3].x, y: ks[3].y, z: ks[3].z, eggs: [] }] });
      h.step(2);
      out.zero = h.animals.kits().length;
      return out;
    });
    expect(r.v, '保存の 形 は v 4').toBe(4);
    for (const [i, want] of [[0, [1000, 3000, 7200]], [1, [500]]] as const) {
      want.forEach((w, j) => expect(Math.abs(r.loaded[i].eggs[j].left - w), `読んだ直後 left 近い (${i},${j})`).toBeLessThanOrEqual(3));
      expect(r.loaded[i].eggs.map((e: any) => e.egg)).toEqual(i === 0 ? ['egg', 'gold', 'egg'] : ['egg']);
    }
    expect(r.again.map((k: any) => k.eggs.map((e: any) => e.egg)), '取り出して 読み直しても 同じ（順 も）').toEqual(r.loaded.map((k: any) => k.eggs.map((e: any) => e.egg)));
    for (let i = 0; i < r.loaded.length; i++) r.loaded[i].eggs.forEach((e: any, j: number) => expect(Math.abs(r.again[i].eggs[j].left - e.left)).toBeLessThanOrEqual(3));
    expect(r.v3, 'v 3 の 行 → eggs 1 行').toHaveLength(1);
    expect(r.v3[0].eggs).toHaveLength(1);
    expect(r.v3[0].eggs[0].egg).toBe('gold');
    expect(Math.abs(r.v3[0].eggs[0].left - 500)).toBeLessThanOrEqual(3);
    expect(r.five[0].eggs, '5 こ の 行 → 先の 3 こ').toHaveLength(3);
    expect(r.five[0].eggs.map((e: any) => Math.round(e.left / 1000))).toEqual([1, 2, 3]);
    expect(r.nine.reduce((s: number, k: any) => s + k.eggs.length, 0), '世界 ぜんぶ で 6 こ').toBe(6);
    expect(r.nine, '前の 行 から 数える').toHaveLength(2);
    expect(r.zero, 'eggs が 0 こ の 行 は すてる').toBe(0);
    expect(r.len).toBeLessThanOrEqual(4000);
  });
});
