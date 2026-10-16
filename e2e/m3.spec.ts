import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';

/**
 * M3 の受け入れ基準（docs/design/M3-combat.md 第 2 版）のうち、つないだ後の実際のゲームでしか
 * 確かめられないもの。ユニットで確かめ済みのものは docs/test-reports/M3.md に書いてある。
 * オーナーの途中決定（昼 15 分・夜 7 分 30 秒、暗い所に出る、おうちなし、AI は距離だけ、
 * ドロップ表、ばらまく落とし物）は決定のほうを優先して読みかえている（レポート参照）。
 */

const ASSETS = 'docs/test-reports/assets';

// クラウドは遅く、並列で動かすと 30 秒をこえることがある（長い場面を step で進めるため）
test.describe.configure({ timeout: 180_000 });

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T: any = {
      /** 床 (0..12, y=8)・空・P・妖怪なし・自動出現なし・うろうろなし */
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.settings.set('yokaiWander', false);
        h.yokai.clear();
        h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 12, 20, 12, 'air');
        h.inventory.clear();
        h.time.set(0);
        T.place(2.5, 9, 6.5, 90, 0);
        h.step(10);
        h.yokai.events();
        h.combat.events();
        h.dig.events();
      },
      place(x: number, y: number, z: number, yaw: number, pitch: number) {
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
        h.step(1);
      },
      one(id: number) {
        return h.yokai.list().find((y: any) => y.id === id);
      },
    };
    (window as any).T = T;
  });
}

test.describe('M3 昼と夜', () => {
  test('AC1/AC2: 時間帯の境目（昼 15 分・ゆうがた 1.5 分・夜 7.5 分・あさ 1.5 分）、空の色、明るさ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      const out: any = {};
      out.first = h.time.get();
      h.time.set(53999);
      out.beforeDusk = h.time.get().phase;
      h.step(1);
      out.dusk = h.time.get();
      h.time.set(59399);
      out.beforeNight = h.time.get().phase;
      h.step(1);
      out.night = h.time.get();
      h.time.set(86399);
      out.beforeDawn = h.time.get().phase;
      h.step(1);
      out.dawn = h.time.get();
      h.time.set(91799);
      h.step(1);
      out.nextDay = h.time.get();
      h.time.set(54000 + 2700);
      out.duskMid = h.time.get();
      h.time.set(10);
      out.day = h.time.get();
      // どの 2 ステップのあいだでも brightness の差が 0.01 以下（1 日ぜんぶを 1 ステップずつ）
      let prev = -1;
      let maxDiff = 0;
      for (let t = 0; t < 91800; t++) {
        h.time.set(t);
        const b = h.time.get().brightness;
        if (prev >= 0) maxDiff = Math.max(maxDiff, Math.abs(b - prev));
        prev = b;
      }
      out.maxDiff = maxDiff;
      return out;
    });
    expect(r.first).toMatchObject({ phase: 'day', dayTick: 0, day: 0, brightness: 1 });
    expect(r.first.skyColor.toLowerCase()).toBe('#8fd3ff');
    expect(r.beforeDusk).toBe('day');
    expect(r.dusk.phase).toBe('dusk');
    expect(r.beforeNight).toBe('dusk');
    expect(r.night.phase).toBe('night');
    expect(r.night.skyColor.toLowerCase()).toBe('#1b2350');
    expect(r.night.brightness).toBeCloseTo(0.45, 2);
    expect(r.night.dollBrightness).toBeCloseTo(0.75, 2);
    expect(r.beforeDawn).toBe('night');
    expect(r.dawn.phase).toBe('dawn');
    expect(r.nextDay).toMatchObject({ phase: 'day', dayTick: 0, day: 1 });
    expect(r.duskMid.brightness).toBeGreaterThan(0.6);
    expect(r.duskMid.brightness).toBeLessThan(0.85);
    expect(r.maxDiff).toBeLessThan(0.0101);
  });

  test('スクショ: ひる・ゆうがた・よる・あさ（空・時計・おひさま／おつきさま）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      const sp = h.world.spawn();
      h.player.set({ position: { x: sp.x, y: 40, z: sp.z }, yaw: 90, pitch: 12 });
      h.step(2);
    });
    const marks: [string, number][] = [
      ['day', 3000],
      ['dusk', 54000 + 2700],
      ['night', 59400 + 9000],
      ['dawn', 86400 + 2700],
    ];
    const info: any = {};
    for (const [name, t] of marks) {
      info[name] = await page.evaluate((tt) => {
        const h = (window as any).__rikkun;
        h.time.set(tt);
        h.step(2);
        const clock = document.querySelector('#clock') as HTMLElement | null;
        return { t: h.time.get(), clockPhase: clock?.dataset.phase, stats: h.renderStats() };
      }, t);
      await page.screenshot({ path: `${ASSETS}/M3-sky-${name}.png` });
    }
    expect(info.day.clockPhase).toBe('day');
    expect(info.dusk.clockPhase).toBe('dusk');
    expect(info.night.clockPhase).toBe('night');
    expect(info.dawn.clockPhase).toBe('dawn');
    expect(info.night.t.skyColor.toLowerCase()).not.toBe(info.day.t.skyColor.toLowerCase());
  });
});

test.describe('M3 出現と帰る', () => {
  test('AC3(読みかえ): ひる・ゆうがたに外（空の下）には出ない。出るなら屋根の下だけ', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', true);
      const sp = h.world.spawn();
      h.player.set({ position: { x: sp.x, y: 40, z: sp.z }, yaw: 0, pitch: 0 });
      h.time.set(0);
      const bad: any[] = [];
      let spawns = 0;
      let phases = new Set<string>();
      // ひる 54,000 + ゆうがた 5,400 = 59,399 ステップ
      for (let i = 0; i < 59399; i += 60) {
        h.combat.setHp(20);
        h.step(Math.min(60, 59399 - i));
        phases.add(h.time.get().phase);
        for (const e of h.yokai.events()) {
          if (e.type !== 'spawn') continue;
          spawns++;
          // 屋根（はっぱ以外の固いブロック）が上にあるか
          let roofed = false;
          for (let y = Math.floor(e.position.y + 1.7); y < 48; y++) {
            const id = h.world.getBlock(Math.floor(e.position.x), y, Math.floor(e.position.z));
            if (id && id !== 'air' && id !== 'water' && id !== 'leaves') roofed = true;
          }
          if (!roofed) bad.push(e);
        }
      }
      return { bad, spawns, phases: [...phases], tick: h.time.get() };
    });
    expect(r.phases).toEqual(expect.arrayContaining(['day', 'dusk']));
    expect(r.tick.phase).toBe('dusk');
    expect(r.bad).toEqual([]);
    console.log('day spawns (roofed only):', r.spawns);
  });

  test('AC4/AC5: よるに出る（5 体まで・ぬりかべ 1 体まで・12〜28・水の上でない）、同じシードで同じ並び', async ({ page }) => {
    test.setTimeout(120_000);
    const run = async () => {
      await open(page);
      return page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.pause();
        h.lock.simulate(true);
        const sp = h.world.spawn();
        h.settings.set('yokaiAutoSpawn', true);
        h.settings.set('yokaiWander', true);
        h.time.set(59400);
        h.player.set({ position: { x: sp.x, y: 40, z: sp.z }, yaw: 0, pitch: 0 });
        h.step(1);
        const P = { x: sp.x, z: sp.z };
        const spawns: any[] = [];
        let maxN = 0;
        let maxNuri = 0;
        let fiveAt = -1;
        for (let i = 0; i < 3000; i += 10) {
          h.combat.setHp(20);
          h.player.set({ position: { x: sp.x, y: h.player.get().position.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 } });
          h.step(10);
          const list = h.yokai.list();
          maxN = Math.max(maxN, list.length);
          maxNuri = Math.max(maxNuri, list.filter((y: any) => y.kind === 'nurikabe').length);
          if (fiveAt < 0 && list.length >= 5) fiveAt = i + 10;
          for (const e of h.yokai.events()) if (e.type === 'spawn') spawns.push(e);
        }
        const below = spawns.map((e) => h.world.getBlock(Math.floor(e.position.x), Math.floor(e.position.y - 0.5), Math.floor(e.position.z)));
        return { sp, spawns, maxN, maxNuri, fiveAt, below, P };
      });
    };
    const a = await run();
    expect(a.spawns.length).toBeGreaterThanOrEqual(5);
    expect(a.spawns[0].tick).toBeLessThanOrEqual(5); // よるの始めの 1 回目（1 ステップ目）
    expect(a.maxN).toBeLessThanOrEqual(5);
    expect(a.maxNuri).toBeLessThanOrEqual(1);
    expect(a.fiveAt).toBeGreaterThan(0);
    expect(a.fiveAt).toBeLessThanOrEqual(1500);
    for (const e of a.spawns) {
      const d = Math.hypot(e.position.x - a.P.x, e.position.z - a.P.z);
      expect(d, `spawn ${e.kind} @${e.position.x.toFixed(1)},${e.position.z.toFixed(1)}`).toBeGreaterThanOrEqual(11.5);
      expect(d).toBeLessThanOrEqual(28.5);
    }
    expect(a.below.filter((b: string) => b === 'water')).toEqual([]);
    const b = await run();
    expect(b.spawns.map((e: any) => [e.kind, e.position.x, e.position.z])).toEqual(a.spawns.map((e: any) => [e.kind, e.position.x, e.position.z]));
    console.log('night spawns', a.spawns.length, 'fiveAt', a.fiveAt, 'first tick', a.spawns[0].tick);
  });

  test('AC6: あさ になると外の妖怪は 600 ステップ以内に全員帰る（defeat なし・持ち物そのまま）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.inventory.add('dirt', 3);
      const before = JSON.stringify(h.inventory.get?.() ?? h.inventory.count('dirt'));
      h.time.set(59400 + 100);
      h.yokai.spawn('karakasa', 8.5, 9, 3.5, { ai: false });
      h.yokai.spawn('chochin', 8.5, 9, 6.5, { ai: false });
      h.yokai.spawn('rokurokubi', 8.5, 9, 9.5, { ai: false });
      h.step(5);
      h.yokai.events();
      h.time.set(86400);
      h.step(660);
      const ev = h.yokai.events();
      return { ev: ev.map((e: any) => e.type), left: h.yokai.list().length, dirt: h.inventory.count('dirt'), before, after: JSON.stringify(h.inventory.get?.() ?? h.inventory.count('dirt')) };
    });
    expect(r.ev.filter((t: string) => t === 'leave').length).toBe(3);
    expect(r.ev.filter((t: string) => t === 'defeat').length).toBe(0);
    expect(r.left).toBe(0);
    expect(r.dirt).toBe(3);
    expect(r.after).toBe(r.before);
  });
});

test.describe('M3 妖怪の AI（距離だけ）', () => {
  test('AC7/AC8(読みかえ): 見つける距離の内側は追いかける・外側は気づかない。壁ごしでも見つける', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const sight: Record<string, number> = { karakasa: 18, chochin: 21, nurikabe: 12, rokurokubi: 18 };
      const out: any = {};
      for (const kind of Object.keys(sight)) {
        for (const delta of [-1, +1]) {
          T.base();
          h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
          T.place(1.5, 9, 1.5, 135, 0);
          // 対角線の距離 d（遠い所は床を 20 まで のばして置く）
          const d = sight[kind] + delta;
          const o = d / Math.SQRT2;
          let x = 1.5 + o;
          let z = 1.5 + o;
          if (x > 12 || z > 12) {
            // 床の外には置けないので、床をのばす
            h.world.fill(0, 8, 0, 20, 8, 20, 'stone');
          }
          h.world.fill(0, 9, 0, 20, 20, 20, 'air');
          const id = h.yokai.spawn(kind, x, 9, z, { yawDeg: 315 });
          h.yokai.list();
          let chaseAt = -1;
          const steps = delta < 0 ? 30 : 300;
          for (let i = 1; i <= steps; i++) {
            h.combat.setHp(20);
            h.step(1);
            const st = T.one(id)?.state;
            if (chaseAt < 0 && (st === 'chase' || st === 'attack')) chaseAt = i;
          }
          out[`${kind}${delta}`] = { chaseAt, state: T.one(id)?.state };
        }
      }
      // 壁ごし: からかさ (8.5,9,6.5)・P (2.5,9,6.5)・あいだに高さ 3 の壁
      T.base();
      h.world.fill(5, 9, 3, 5, 11, 10, 'stone');
      const k = h.yokai.spawn('karakasa', 8.5, 9, 6.5, { yawDeg: 270 });
      let at = -1;
      for (let i = 1; i <= 60; i++) {
        h.step(1);
        const st = T.one(k)?.state;
        if (at < 0 && (st === 'chase' || st === 'attack')) at = i;
      }
      out.wall = { at, state: T.one(k)?.state };
      return out;
    });
    console.log(JSON.stringify(r));
    for (const kind of ['karakasa', 'chochin', 'nurikabe', 'rokurokubi']) {
      expect(r[`${kind}-1`].chaseAt, `${kind} -1`).toBeGreaterThan(0);
      expect(r[`${kind}1`].chaseAt, `${kind} +1`).toBe(-1);
      expect(r[`${kind}1`].state, `${kind} +1 state`).not.toMatch(/chase|attack/);
    }
    // 決定: AI は距離だけ → 壁ごしでも 30 ステップ以内に追いかける
    expect(r.wall.at).toBeGreaterThan(0);
    expect(r.wall.at).toBeLessThanOrEqual(30);
  });

  test('AC14(廃止): おうちは無い。スタート地点の近くにも妖怪は入れる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const names = ['homeRadius', 'spawnSafeRadius'];
      return names.map((n) => {
        try {
          return [n, h.settings.get(n)];
        } catch {
          return [n, 'error'];
        }
      });
    });
    console.log('home settings', JSON.stringify(r));
    // おうち（homeRadius・spawnSafeRadius）の設定そのものが無い
    expect(r.map((x: any) => x[1])).toEqual(['error', 'error']);
  });
});

test.describe('M3 妖怪の攻撃とダメージ', () => {
  const SCENES: Record<string, { x: number; hit: number; hp: number }> = {
    karakasa: { x: 5.5, hit: 30, hp: 18 },
    chochin: { x: 8.5, hit: 30, hp: 18 },
    rokurokubi: { x: 7.5, hit: 30, hp: 18 },
    nurikabe: { x: 5.0, hit: 90, hp: 4 }  // #8: ぬりかべ の たおれこみ 16,
  };
  for (const [kind, view] of Object.keys(SCENES).flatMap((k) => [[k, ''], [k, '-third']] as const)) {
    test(`AC15${view}: ${kind} の攻撃（合図・当たる 1 ステップ・ダメージ・おし返し・30 ステップのむてき）とスクショ`, async ({ page }) => {
      await open(page);
      const sc = SCENES[kind]!;
      const r: any = await page.evaluate(
        ({ kind, sc, view }) => {
          const T = (window as any).T;
          const h = (window as any).__rikkun;
          T.base();
          h.world.fill(0, 8, 0, 20, 8, 12, 'stone');
          T.place(2.5, 9, 6.5, 90, 0);
          if (view) {
            h.input.press('toggleView');
            h.step(1);
            h.input.release('toggleView');
            // 横から見えるように、妖怪（東）が右ななめ前に見える向きにする
            h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, yaw: 40, pitch: 8 });
            h.step(1);
          }
          h.step(5);
          const id = h.yokai.spawn(kind, sc.x, 9, 6.5, { yawDeg: 270 });
          h.yokai.events();
          const out: any = { shots: [], events: [] };
          let startTick = -1;
          for (let i = 1; i <= 400; i++) {
            h.step(1);
            const evs = h.yokai.events();
            for (const e of evs) out.events.push({ ...e, i });
            const y = T.one(id);
            if (startTick < 0 && evs.some((e: any) => e.type === 'attackStart')) startTick = i;
            if (startTick > 0) {
              const k = i - startTick + 1;
              if (k === 14 || k === sc.hit - 1) out.shots.push({ k, attackTick: y?.attackTick, state: y?.state });
              if (k === 14) out.shot14 = true;
              if (k === sc.hit - 1) out.shotHit = true;
              if (k === sc.hit - 1 || k === 14) {
                // 画面を撮るために いったん外へ返す
                out.pending = k;
                return Object.assign(out, { id, startTick, i, paused: true });
              }
            }
          }
          return out;
        },
        { kind, sc, view },
      );
      expect(r.paused, JSON.stringify(r.events.slice(0, 6))).toBe(true);
      await page.screenshot({ path: `${ASSETS}/M3-attack-${kind}${view}-a-sign.png` });
      // 当たりの手前まで進める
      const r2: any = await page.evaluate(
        ({ sc, id }) => {
          const T = (window as any).T;
          const h = (window as any).__rikkun;
          const out: any = { events: [] };
          // k=14 の位置から、k = hit-1 まで進める
          for (let k = 15; k <= sc.hit - 1; k++) {
            h.step(1);
            for (const e of h.yokai.events()) out.events.push({ ...e, k });
          }
          out.stateAtHit1 = T.one(id)?.state;
          out.attackTick = T.one(id)?.attackTick;
          return out;
        },
        { sc, id: r.id },
      );
      await page.screenshot({ path: `${ASSETS}/M3-attack-${kind}${view}-b-peak.png` });
      const r3: any = await page.evaluate(
        ({ kind }) => {
          const h = (window as any).__rikkun;
          const P0 = { ...h.player.get().position };
          const out: any = { events: [], hp: [] };
          // hit-1 の次の 1 ステップが「当たり判定」のステップ
          for (let k = 0; k < 4; k++) {
            h.step(1);
            out.hp.push(h.combat.get().hp);
            for (const e of h.yokai.events()) out.events.push({ ...e, k });
            out.cev = (out.cev ?? []).concat(h.combat.events());
          }
          // さらに 40 ステップ: むてきのあいだ playerHit は 1 回だけ
          for (let k = 0; k < 40; k++) {
            h.step(1);
            for (const e of h.yokai.events()) out.events.push({ ...e, k: 10 + k });
            out.cev = out.cev.concat(h.combat.events());
          }
          if (kind === 'chochin') {
            // 火の玉がとどくまで待つ（とどけば 1、押し返しは水平 1.0）
            for (let k = 0; k < 150 && h.combat.get().hp === 20; k++) {
              h.step(1);
              for (const e of h.yokai.events()) out.events.push({ ...e, k: 100 + k });
              out.cev = out.cev.concat(h.combat.events());
            }
            out.fireballHitAfter = h.combat.get().hp;
            h.step(15);
            out.cev = out.cev.concat(h.combat.events());
          }
          const P1 = h.player.get().position;
          out.moved = Math.hypot(P1.x - P0.x, P1.z - P0.z);
          out.hpNow = h.combat.get().hp;
          return out;
        },
        { kind },
      );
      await page.screenshot({ path: `${ASSETS}/M3-attack-${kind}${view}-c-after.png` });
      console.log(kind, JSON.stringify({ shots: r.shots, startTick: r.startTick, r2: r2.events.map((e: any) => e.type + '@' + e.k), r3events: r3.events.map((e: any) => e.type + '@' + e.k), hp: r3.hp, moved: r3.moved, cev: r3.cev.map((e: any) => e.type + ':' + (e.amount ?? '')) }));
      // 当たり判定は 30 ステップ目（ぬりかべ 90）。その 1 つ前までは attackHit が出ない
      expect(r2.events.filter((e: any) => e.type === 'attackHit')).toEqual([]);
      expect(r3.events.find((e: any) => e.type === 'attackHit')?.k).toBe(0);
      if (kind === 'chochin') expect(r3.events.find((e: any) => e.type === 'fireball')?.k).toBe(0);
      else expect(r3.hp[0]).toBe(sc.hp);
      expect(r3.hpNow).toBe(sc.hp);
      // 同じ攻撃で 2 回へらない（playerHit は 1 回だけ）
      expect(r3.cev.filter((e: any) => e.type === 'playerHit').length).toBe(1);
      expect(r3.moved).toBeGreaterThan(1.7); // ノックバック 1.8
      expect(r3.moved).toBeLessThan(1.9);
    });
  }
});

test.describe('M3 プレイヤーの攻撃（パンチ）', () => {
  test('AC16: 30 ステップ目に当たる・hp 4→3・1.0 押される。ぬりかべは押されない。スクショ（星・まる）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const out: any = {};
      const id = h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.combat.events();
      h.input.press('primary');
      h.step(1);
      out.firstEvents = h.combat.events().map((e: any) => e.type);
      h.input.release('primary');
      h.step(28); // 29 ステップ目
      out.hp29 = T.one(id).hp;
      out.ev29 = h.combat.events().map((e: any) => e.type);
      h.step(1); // 30 ステップ目
      out.ev30 = h.combat.events().map((e: any) => e.type + (e.yokaiId !== undefined ? ':' + e.yokaiId : ''));
      out.hp30 = T.one(id).hp;
      h.step(3);
      out.shot = true;
      out.id = id;
      return out;
    });
    await page.screenshot({ path: `${ASSETS}/M3-punch-hit-marks.png` });
    const r2 = await page.evaluate((id) => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      h.step(12);
      return { x: T.one(id).position.x };
    }, r.id);
    expect(r.firstEvents).toContain('punchStart');
    expect(r.hp29).toBe(4);
    expect(r.ev29).not.toContain('punchHit');
    expect(r.ev30.some((e: string) => e.startsWith('punchHit'))).toBe(true);
    expect(r.hp30).toBe(3);
    expect(r2.x).toBeGreaterThan(5.4);
    expect(r2.x).toBeLessThan(5.6);
    // ぬりかべは押されない
    const r3 = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      const id = h.yokai.spawn('nurikabe', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.input.press('primary');
      h.step(30);
      h.input.release('primary');
      h.step(15);
      return { x: T.one(id).position.x, hp: T.one(id).hp };
    });
    expect(r3.x).toBeCloseTo(4.5, 2);
    expect(r3.hp).toBe(47); // ぬりかべ 体力 48（#8）
  });

  test('AC17: 押しっぱなしで 30・60・90・120 ステップ目に当たり 4 回でたおれる。ドロップ表で入る', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const out: any = {};
      const kinds: Record<string, number> = { karakasa: 4, chochin: 2, rokurokubi: 4, nurikabe: 48 };
      for (const kind of Object.keys(kinds)) {
        T.base();
        h.world.fill(0, 8, 0, 20, 8, 12, 'stone');
        const y = h.yokai.spawn(kind, kind === 'nurikabe' ? 4.5 : 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
        // ちょうちんは 0.5 浮いている。箱の高さの都合で目の高さの線が当たるよう 4.5 のまま
        h.combat.events();
        h.yokai.events();
        h.input.press('primary');
        const hits: number[] = [];
        let defeatAt = -1;
        let removeAt = -1;
        let dropEv: any[] = [];
        let size36: number | null = null;
        for (let i = 1; i <= 1700; i++) {
          h.step(1);
          for (const e of h.combat.events()) if (e.type === 'punchHit') hits.push(i);
          for (const e of h.yokai.events()) {
            if (e.type === 'defeat') defeatAt = i;
            if (e.type === 'drop') dropEv.push({ item: e.item, count: e.count, added: e.added });
            if (e.type === 'remove') removeAt = i;
          }
          if (defeatAt > 0 && i === defeatAt + 36) size36 = T.one(y)?.scale ?? 0;
          // たたくたびに押されるので、P を 2 ブロック西に置き直す
          const yy = T.one(y);
          if (yy && i % 30 === 0) h.player.set({ position: { x: yy.position.x - 2, y: 9, z: 6.5 } });
          if (removeAt > 0) break;
        }
        h.input.release('primary');
        out[kind] = { hits: hits.slice(0, 50), defeatAt, removeAt, dropEv, size36, need: kinds[kind] };
      }
      return out;
    });
    console.log(JSON.stringify(r));
    for (const [kind, v] of Object.entries<any>(r)) {
      expect(v.hits.length, kind + ' hits').toBeGreaterThanOrEqual(v.need);
      expect(v.hits.slice(0, v.need), kind).toEqual(Array.from({ length: v.need }, (_, i) => (i + 1) * 30));
      expect(v.defeatAt, kind + ' defeat').toBe(v.need * 30);
      expect(v.removeAt, kind + ' remove').toBe(v.defeatAt + 66);
      expect(v.size36, kind + ' scale@36').toBeLessThan(0.05);
      for (const d of v.dropEv) expect(d.count).toBeGreaterThanOrEqual(1);
    }
  });

  test('AC18: とどく距離（3.4 で当たる・3.9 は からぶり。#8 で 3.0→3.5）と、妖怪のうしろのブロックはほれない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const out: any = {};
      const run = (faceDist: number) => {
        T.base();
        // からかさの箱の手前の面は x + (-0.75)。目 x=2.5 から faceDist
        const x = 2.5 + faceDist + 0.75;
        const id = h.yokai.spawn('karakasa', x, 9, 6.5, { ai: false, yawDeg: 270 });
        h.combat.events();
        h.input.press('primary');
        h.step(30);
        h.input.release('primary');
        const evs = h.combat.events().map((e: any) => e.type);
        return { evs, hp: T.one(id).hp };
      };
      out.near = run(3.4);
      out.far = run(3.9);
      return out;
    });
    expect(r.near.evs).toContain('punchHit');
    expect(r.near.hp).toBe(3);
    expect(r.far.hp).toBe(4);
    expect(r.far.evs).not.toContain('punchHit');
    // 仕様 AC18 は 3.1 で punchMiss（からぶり）。実装は「とどかない妖怪は無視」で何も出さない（NG・軽微。下の test.fail と同じ原因）
  });

  test('AC18(b): 3.9 の妖怪のうしろ 4.0 の dirt は、妖怪がじゃまをしてほれない（既知の NG: 実装はほれてしまう）', async ({ page }) => {
    test.fail();
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const out: any = {};
      // 3.1 の妖怪のうしろ 4.0 の dirt
      T.base();
      const x = 2.5 + 3.9 + 0.75;
      h.yokai.spawn('karakasa', x, 9, 6.5, { ai: false, yawDeg: 270 });
      h.world.setBlock(6, 10, 6, 'dirt'); // 目の高さの線 (y=10.62) ではなく足の高さ
      h.world.setBlock(6, 9, 6, 'dirt');
      h.world.setBlock(Math.floor(2.5 + 4.0), 10, 6, 'dirt');
      h.step(1);
      h.input.press('primary');
      let maxProgress = 0;
      for (let i = 0; i < 60; i++) {
        h.step(1);
        maxProgress = Math.max(maxProgress, h.dig.get().progress ?? 0);
      }
      h.input.release('primary');
      out.maxProgress = maxProgress;
      out.dirtStill = h.world.getBlock(6, 10, 6);
      return out;
    });
    expect(r.maxProgress).toBe(0);
  });

  test('AC19: ほる か パンチか（手前にあるほうが受ける）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const out: any = {};
      // 目の高さ 10.62 の線: dirt は y=10 の列にある
      // (a) 前 1.5 に dirt、その先 2.5 に妖怪 → ほる
      T.base();
      h.world.setBlock(4, 10, 6, 'dirt'); // x=4..5: 目から 1.5
      h.yokai.spawn('karakasa', 7.0, 9, 6.5, { ai: false, yawDeg: 270 });
      h.combat.events();
      h.input.press('primary');
      h.step(10);
      out.a = { active: h.dig.get().active, evs: h.combat.events().map((e: any) => e.type), progress: h.dig.get().progress };
      h.input.release('primary');
      // (b) 前 1.5 に妖怪、その先 2.5 に dirt → パンチ
      T.base();
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.world.setBlock(6, 10, 6, 'dirt');
      h.combat.events();
      h.input.press('primary');
      h.step(10);
      out.b = { evs: h.combat.events().map((e: any) => e.type), progress: h.dig.get().progress, dirt: h.world.getBlock(6, 10, 6) };
      h.input.release('primary');
      // (c) dirt をほっている途中（15 ステップ）に、あいだに妖怪を置く → 次のステップでパンチ
      T.base();
      h.world.setBlock(6, 10, 6, 'dirt');
      h.combat.events();
      h.input.press('primary');
      h.step(15);
      const before = h.combat.events().map((e: any) => e.type);
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.step(1);
      out.c = { before, after: h.combat.events().map((e: any) => e.type) };
      h.input.release('primary');
      return out;
    });
    expect(r.a.active).toBe(true);
    expect(r.a.evs).not.toContain('punchStart');
    expect(r.b.evs).toContain('punchStart');
    expect(r.b.progress).toBe(0);
    expect(r.b.dirt).toBe('dirt');
    expect(r.c.before).not.toContain('punchStart');
    expect(r.c.after).toContain('punchStart');
  });
});

test.describe('M3 体力・ハート・ダメージ', () => {
  test('AC20: ハート 10 こ（満タン 6・半分 1・から 3）、28px 以上、ホットバーの上', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.combat.setHp(13);
      h.step(60); // ハートがはじける動き（0.4 秒）が終わるまで
      const cells = [...document.querySelectorAll('#hearts .heart')] as HTMLElement[];
      const rect = (document.querySelector('#hearts .heart') as HTMLElement).getBoundingClientRect();
      const hb = document.querySelector('#hotbar')?.getBoundingClientRect();
      const heartsRect = document.querySelector('#hearts')!.getBoundingClientRect();
      const states = cells.map((c) => c.dataset.state);
      h.combat.setHp(20);
      h.step(2);
      return {
        states,
        w: rect.width,
        h: rect.height,
        left: heartsRect.left,
        bottom: heartsRect.bottom,
        hotbarTop: hb?.top ?? null,
        innerW: window.innerWidth,
      };
    });
    expect(r.states.length).toBe(10);
    expect(r.states.filter((s) => s === 'full').length).toBe(6);
    expect(r.states.filter((s) => s === 'half').length).toBe(1);
    expect(r.states.filter((s) => s === 'empty').length).toBe(3);
    expect(r.innerW).toBe(1280);
    expect(r.w).toBeGreaterThanOrEqual(28);
    expect(r.h).toBeGreaterThanOrEqual(28);
    expect(r.hotbarTop).not.toBeNull();
    expect(r.bottom).toBeLessThanOrEqual(r.hotbarTop! + 1);
  });

  test('AC21: 自然回復（600 ステップ待ち、1,500 で +1、2,400 で +2、半分まで、ダメージで待ち直し）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.combat.damage(15);
      const hp = (n: number) => {
        h.step(n);
        return h.combat.get().hp;
      };
      const out: any = {};
      out.s0 = h.combat.get().hp;
      out.s1499 = hp(1499);
      out.s1500 = hp(1);
      out.s2399 = hp(899);
      out.s2400 = hp(1);
      // もう一度ダメージ → そこから待ち直し
      h.combat.damage(2);
      out.after = h.combat.get().hp;
      out.d1499 = hp(1499);
      out.d1500 = hp(1);
      // 半分（10）で止まる
      out.long = hp(900 * 10);
      return out;
    });
    expect(r.s0).toBe(5);
    expect(r.s1499).toBe(5);
    expect(r.s1500).toBe(6);
    expect(r.s2399).toBe(6);
    expect(r.s2400).toBe(7);
    expect(r.after).toBe(5);
    expect(r.d1499).toBe(5);
    expect(r.d1500).toBe(6);
    expect(r.long).toBe(10);
  });

  test('ダメージのスクショ: ふちのピンク・ハートがへる（赤い全画面の点滅なし）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.yokai.spawn('karakasa', 4.5, 9, 6.5, { yawDeg: 270 });
      h.yokai.events();
      h.combat.events();
      for (let i = 0; i < 200; i++) {
        h.step(1);
        if (h.combat.get().hp < 20) break;
      }
      h.step(5);
    });
    await page.screenshot({ path: `${ASSETS}/M3-damage-edge.png` });
    const edge = await page.evaluate(() => {
      const e = document.querySelector('#damage-edge, .damage-edge') as HTMLElement | null;
      return e ? { opacity: getComputedStyle(e).opacity, hidden: e.hidden } : null;
    });
    console.log('edge', JSON.stringify(edge));
  });
});

test.describe('M3 やられたとき・落とし物', () => {
  test('AC22: やられた画面 120 ステップ・復活・むてき 180。文字はひらがな・カタカナ。スクショ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      T.place(6.5, 9, 6.5, 90, 0);
      h.combat.events();
      h.combat.damage(20);
      const out: any = {};
      const ev0 = h.combat.events();
      out.death = ev0.some((e: any) => e.type === 'death');
      out.dead = h.combat.get().dead;
      const p0 = { ...h.player.get().position };
      h.input.press('moveForward');
      h.step(40);
      out.deadScreen40 = {
        text: document.querySelector('#death-screen')?.textContent ?? '',
        white: (document.querySelector('#death-screen') as HTMLElement)?.dataset.white,
        hidden: (document.querySelector('#death-screen') as HTMLElement)?.hidden,
      };
      out.shot40 = true;
      return Object.assign(out, { p0 });
    });
    await page.screenshot({ path: `${ASSETS}/M3-death-a-fading.png` });
    await page.evaluate(() => (window as any).__rikkun.step(50));
    await page.screenshot({ path: `${ASSETS}/M3-death-b-white.png` });
    const r2 = await page.evaluate((p0) => {
      const h = (window as any).__rikkun;
      const out: any = {};
      h.step(29); // 119 ステップ目
      const pos119 = { ...h.player.get().position };
      out.moved119 = Math.hypot(pos119.x - p0.x, pos119.z - p0.z);
      out.deadAt119 = h.combat.get().dead;
      h.step(1); // 120 ステップ目
      h.input.release('moveForward');
      const c = h.combat.get();
      out.dead120 = c.dead;
      out.hp = c.hp;
      out.inv = c.invincibleTicks;
      out.events = h.combat.events().map((e: any) => e.type);
      const sp = h.world.spawn();
      const pp = h.player.get().position;
      out.spawn = sp;
      out.pos = { ...pp };
      out.homeText = document.querySelector('#home-notice')?.textContent;
      out.homeHidden = (document.querySelector('#home-notice') as HTMLElement)?.hidden;
      h.step(5);
      out.homeShown = !(document.querySelector('#home-notice') as HTMLElement)?.hidden;
      out.shot = true;
      return out;
    }, r.p0);
    await page.screenshot({ path: `${ASSETS}/M3-death-c-respawn.png` });
    const r3 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const out: any = {};
      // むてき: 復活から 5 ステップたっている → あと 175
      out.invNow = h.combat.get().invincibleTicks;
      h.combat.damage(5);
      out.hpDuring = h.combat.get().hp;
      h.step(out.invNow - 1);
      h.combat.damage(5);
      out.hpLast = h.combat.get().hp;
      h.step(2);
      h.combat.damage(5);
      out.hpAfter = h.combat.get().hp;
      return out;
    });
    console.log('AC22', JSON.stringify({ r2, r3 }), r.deadScreen40);
    expect(r.death).toBe(true);
    expect(r.dead).toBe(true);
    expect(r.deadScreen40.hidden).toBe(false);
    expect(r.deadScreen40.text).toContain('やられちゃった');
    expect(r2.moved119).toBeLessThan(0.01);
    expect(r2.deadAt119).toBe(true);
    expect(r2.dead120).toBe(false);
    expect(r2.events).toContain('respawn');
    expect(r2.hp).toBe(20);
    expect(r2.inv).toBe(180);
    expect(Math.hypot(r2.pos.x - r2.spawn.x, r2.pos.z - r2.spawn.z)).toBeLessThan(0.5);
    // 決定「おうちなし」: 文言は『おうち』ではなく『スタート』（実装の文言。レポート参照）
    expect(r2.homeText).toContain('もどったよ');
    expect(r2.homeShown).toBe(true);
    expect(r3.hpDuring).toBe(20);
    expect(r3.hpLast).toBe(20);
    expect(r3.hpAfter).toBeLessThan(20);
  });

  test('AC23(読みかえ): 持ち物 36 マス・selected 3 でやられる。ばらまかれる。10 回で 125〜225。手に持つマスは守る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      let total = 0;
      let slot3Dropped = 0;
      const rows: any[] = [];
      for (let n = 0; n < 10; n++) {
        h.inventory.clear();
        for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 1 });
        h.inventory.select(3);
        T.place(6.5, 9, 6.5, 90, 0);
        h.combat.events();
        const bagsBefore = h.combat.bags().length;
        h.combat.damage(20);
        const death = h.combat.events().find((e: any) => e.type === 'death');
        const left = h.inventory.get().slots.filter((s: any) => s).length;
        const bags = h.combat.bags();
        rows.push({ dropped: death.dropped.length, left, bagsAdded: bags.length - bagsBefore });
        total += death.dropped.length;
        if (death.dropped.includes(3)) slot3Dropped++;
        const slot3 = h.inventory.get().slots[3];
        if (!slot3) slot3Dropped += 100;
        h.step(125 + 185); // 復活まで・むてきが切れるまで
        h.combat.events();
      }
      return { total, slot3Dropped, rows, kinds: h.combat.bags().map((b: any) => b.slots[0].item) };
    });
    console.log('AC23', r.total, JSON.stringify(r.rows[0]));
    expect(r.slot3Dropped).toBe(0);
    expect(r.total).toBeGreaterThanOrEqual(125);
    expect(r.total).toBeLessThanOrEqual(225);
    for (const row of r.rows) {
      expect(row.left + row.dropped).toBe(36);
      expect(row.bagsAdded).toBe(row.dropped); // 1 マス = 1 つの落ちたアイコン
    }
  });

  test('AC24(読みかえ): 落ちたアイコンは遠いと拾わず、近づくと入る。保存して開き直しても残る。スクショ（柱の色）', async ({ page }) => {
    await open(page, '');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await open(page, '?reset=1');
    const r = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.inventory.clear();
      h.inventory.add('dirt', 5);
      h.inventory.add('paper', 3);
      h.inventory.add('oil', 2);
      h.inventory.add('crystal', 1);
      h.inventory.add('stone', 7);
      h.inventory.add('iron_ore', 2);
      for (let i = 0; i < 6; i++) h.inventory.select(0);
      h.inventory.select(8);
      T.place(8.5, 9, 6.5, 270, 0);
      h.combat.events();
      h.combat.damage(20);
      const death = h.combat.events().find((e: any) => e.type === 'death');
      h.step(125); // 復活（スタート地点）
      h.step(60);
      return { death, bags: h.combat.bags(), invLeft: h.inventory.get().slots.filter((s: any) => s).length };
    });
    console.log('AC24 bags', JSON.stringify(r.bags.map((b: any) => [b.slots[0].item, b.slots[0].count, b.rarity, +b.position.x.toFixed(1), +b.position.z.toFixed(1), b.ticksLeft])));
    expect(r.bags.length).toBe(r.death.dropped.length);
    for (const b of r.bags) expect(b.ticksLeft).toBeGreaterThan(35000);
    // スクショ: 落とし物を遠くから見る（昼）と、夜
    await page.evaluate(() => {
      const T = (window as any).T;
      T.place(3.0, 9, 6.5, 90, 5);
    });
    await page.screenshot({ path: `${ASSETS}/M3-drops-day.png` });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.time.set(59400 + 9000);
      h.step(2);
    });
    await page.screenshot({ path: `${ASSETS}/M3-drops-night.png` });
    // 拾う: 近づくと持ち物に入り、そのアイコンは消える
    const r2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const before = h.combat.bags();
      const b = before[0];
      // 1.6 の所では拾わない
      h.player.set({ position: { x: b.position.x - 1.6, y: b.position.y, z: b.position.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      const still = h.combat.bags().length;
      h.player.set({ position: { x: b.position.x - 1.0, y: b.position.y, z: b.position.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      const after = h.combat.bags().length;
      const ev = h.combat.events().map((e: any) => e.type);
      return { n: before.length, still, after, ev };
    });
    expect(r2.still).toBe(r2.n);
    expect(r2.after).toBeLessThan(r2.n);
    expect(r2.ev).toContain('pickup');
  });

  test('AC24(保存): 保存して開き直すと落ちたアイコンの場所・中身・のこりが同じ。妖怪 0・hp 20・ひる', async ({ page }) => {
    await open(page, '?reset=1');
    const before = await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.inventory.clear();
      h.inventory.add('dirt', 5);
      h.inventory.add('paper', 3);
      h.inventory.add('crystal', 1);
      h.inventory.add('stone', 7);
      h.inventory.select(2);
      T.place(8.5, 9, 6.5, 270, 0);
      h.combat.damage(20);
      h.step(125);
      h.step(300);
      h.save.now();
      return { tick: h.tick(), bags: h.combat.bags() };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => window.__rikkun!.achievements.mute(true));
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      return { bags: h.combat.bags(), yokai: h.yokai.list().length, hp: h.combat.get().hp, phase: h.time.get().phase };
    });
    console.log('AC24 save', before.bags.length, after.bags.length);
    const key = (b: any) => `${b.slots[0].item}:${b.slots[0].count}:${b.position.x.toFixed(1)}:${b.position.z.toFixed(1)}`;
    expect(after.bags.map(key).sort()).toEqual(before.bags.map(key).sort());
    for (const b of after.bags) {
      const pre = before.bags.find((x: any) => key(x) === key(b));
      expect(Math.abs(b.ticksLeft - pre.ticksLeft)).toBeLessThanOrEqual(2);
    }
    expect(after.yokai).toBe(0);
    expect(after.hp).toBe(20);
    expect(after.phase).toBe('day');
  });
});

test.describe('M3 見た目・文字', () => {
  test('AC25: 夜に 4 体（暗すぎない・ちょうちんが明るい）と、ひるの同じ場面のスクショ', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.world.fill(0, 8, 0, 20, 8, 14, 'stone');
      T.place(1.5, 9, 7.0, 90, 4);
      h.yokai.spawn('karakasa', 5.5, 9, 4.5, { ai: false, yawDeg: 270 });
      h.yokai.spawn('chochin', 6.5, 9, 7.5, { ai: false, yawDeg: 270 });
      h.yokai.spawn('rokurokubi', 7.5, 9, 10.0, { ai: false, yawDeg: 270 });
      h.yokai.spawn('nurikabe', 10.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.step(3);
    });
    await page.screenshot({ path: `${ASSETS}/M3-yokai-day-lineup.png` });
    const info = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.time.set(59400 + 9000);
      h.step(3);
      return { t: h.time.get(), stats: h.renderStats() };
    });
    await page.screenshot({ path: `${ASSETS}/M3-yokai-night-lineup.png` });
    expect(info.t.phase).toBe('night');
  });

  test('AC25: 画面の文字（やられた画面・もどったよ・ようかいだま・ドロップのアイテム名）に漢字がない', async ({ page }) => {
    await open(page);
    const texts = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: Record<string, string> = {};
      h.combat.damage(20);
      h.step(40);
      out.death = document.querySelector('#death-screen')?.textContent ?? '';
      h.step(100);
      out.home = document.querySelector('#home-notice')?.textContent ?? '';
      // アイテム名: 持ち物に入れて選ぶと名前が出る
      const names: string[] = [];
      h.inventory.select(1);
      h.step(2);
      for (const item of ['yokai_orb', 'paper', 'string', 'cloth', 'oil', 'clay', 'crystal', 'iron_ore', 'coal_ore', 'log']) {
        h.inventory.clear();
        h.inventory.add(item, 1);
        h.inventory.select(0);
        h.step(2);
        names.push((item + '=' + (document.querySelector('#notice-name')?.textContent ?? '')));
        h.inventory.select(1);
        h.step(2);
      }
      out.names = names.join('|');
      out.hud = (document.querySelector('#hud') as HTMLElement)?.innerText ?? '';
      return out;
    });
    console.log('texts', JSON.stringify(texts));
    for (const [k, v] of Object.entries(texts)) {
      expect(findUnrubiedKanji(v.replace(/[a-z_]+=/g, '')), k).toEqual([]);
    }
    expect(texts.death).toContain('やられちゃった');
    expect(texts.names).toContain('ようかいだま');
  });
});
