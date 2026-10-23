import type { Page } from '@playwright/test';
import { openAnimals } from './animals';

/**
 * LIVE-4（マッチョ にわとり と たたかう）の E2E の準備（docs/design/LIVE-4.md 版 2 §6・§6.1）。
 * `openAnimals(page)` の あとに ページの 中で `window.__M` として 使う（`__A` は LIVE-1 の 道具）。
 * 数・時間は 決め打ちしない: 当たる コマ・うかす 高さ・ダメージ は 設定（`bladeTech`・`bladeDamageMul`・`bladeKnock`・`machoAtk`）から 読んで 計算する。
 * ゲームの 試作 の 窓口（`animals.live4Proto`）は 使わない — 仕様書 §6.1 の 窓口（`animals.fighters()`・`list()` の `target`/`hits`・出来事 `macho*`）だけ を 見る。
 *
 *   __M.base()                  床 24×24・ぼくとう（中段）を 持つ・プレイヤー は (3.5, 9, 6.5) で +x を 向く・妖怪 も なかま も なし
 *   __M.macho(x, z, opts?)      たたかえる マッチョ（大人・なかま・follow まんたん）を (x, 9, z) に 置く（35 コマ 進む）。id
 *   __M.yokai(kind, x, z, o?)   妖怪 を (x, 9, z) に 止めて 置く（ai:false）。体力 は 既定 999。id
 *   __M.faceTo(id, dist?)       妖怪 の 手前 dist に プレイヤー を 置き直す（+x 向き）。ぼくとう が とどく なら true
 *   __M.one(id) / __M.yk(id)    animals.list() の 1 行 / yokai.list() の 1 行
 *   __M.row(i, ids)             1 ステップ ぶん の きろく { i, yev, aev, snd, m, y, php }（出来事・音 は 呼ぶと 空に なる ので その ステップ の 分 だけ）
 *   __M.rec(n, ids, until?)     1 ステップ ずつ n 回 進めて きろく の 配列（until が true を 返したら そこで やめる）
 *   __M.hit(id, ids?)           ぼくとう の 突き を 1 回（押して はなす）。妖怪 の 体力 が へる まで 1 ステップ ずつ きろく。{ rows, k } k = へった ステップ の 番号 か -1
 *   __M.hurtMe(yid, ids?, max?) その 妖怪 に `attackNow` させ、プレイヤー の 体力 が へる まで きろく。{ rows, k }
 *   __M.frozenNow() / nf(rows,i) / atNf(rows,n)  ヒットストップ（#276）で 世界 が 止まる ステップ を 数えない（ゲーム の ステップ = 止まって いない ステップ）
 *   __M.punchStart(rows)        最初に state が 'punch' に なった 番号（なければ -1）
 *   __M.bladeFrames()           `bladeTech.thrust` の { startup, active, recovery }
 *   __M.yaFrom(id, dist)        ゆみ で dist 先 の 妖怪 を ねらい（角度 は 当たる まで ためして 決める）。{ rows, k }
 *
 * 数え方: `rows[i]` は i + 1 回目 の `step(1)` の あと。`hit()` の 押した ステップ が rows[0]。
 */
export async function openLive4(page: Page, query = '?nosave=1'): Promise<void> {
  await openAnimals(page, query);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const A = (window as any).__A;
    const M: any = {
      PX: 3.5,
      PZ: 6.5,
      base() {
        A.base(24);
        h.inventory.clear();
        h.inventory.setSlot(0, { item: 'bokuto', count: 1 });
        h.inventory.select(0);
        h.step(1);
        h.blade.setStance('chudan');
        h.player.set({ position: { x: M.PX, y: 9, z: M.PZ }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(5);
        h.yokai.events();
        h.combat.events();
        h.animals.events();
        h.audio.sfx();
      },
      macho(x: number, z: number, opts: any = {}) {
        return A.friend(x, z, { stage: 'adult', breed: 'macho', ...opts });
      },
      yokai(kind: string, x: number, z: number, o: any = {}) {
        const id = h.yokai.spawn(kind, x, o.y ?? 9, z, { ai: false, yawDeg: 270, ...(o.opts ?? {}) });
        h.yokai.setHp(id, o.hp ?? 999);
        return id;
      },
      one(id: number) {
        return A.one(id);
      },
      yk(id: number) {
        return h.yokai.list().find((y: any) => y.id === id) ?? null;
      },
      faceTo(id: number, dist = 2) {
        const y = M.yk(id);
        if (!y) return false;
        h.player.set({ position: { x: y.position.x - dist, y: y.position.y, z: y.position.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
        const eye = h.camera.get().eye;
        const hit = h.yokai.raycast(eye, { x: 1, y: 0, z: 0 }, dist + 2);
        return hit?.id === id;
      },
      row(i: number, ids: { m?: number; y?: number } = {}, frozen = false) {
        const yev = JSON.parse(JSON.stringify(h.yokai.events()));
        const aev = JSON.parse(JSON.stringify(h.animals.events()));
        const snd = A.sfx();
        const m = ids.m != null ? A.one(ids.m) : null;
        const y = ids.y != null ? M.yk(ids.y) : null;
        const p = h.player.get().position;
        return {
          i,
          frozen,
          yev,
          aev,
          snd,
          m: m && { x: m.x, y: m.y, z: m.z, state: m.state, target: m.target ?? null, hits: m.hits ?? null, follow: m.follow, carried: m.carried },
          y: y && { hp: y.hp, x: y.position.x, y: y.position.y, z: y.position.z, state: y.state },
          php: h.combat.get().hp,
          p: { x: p.x, y: p.y, z: p.z },
        };
      },
      rec(n: number, ids: { m?: number; y?: number } = {}, until?: (r: any) => boolean) {
        const rows: any[] = [];
        for (let i = 0; i < n; i++) {
          const fz = M.frozenNow();
          h.step(1);
          const r = M.row(i, ids, fz);
          rows.push(r);
          if (until && until(r)) break;
        }
        return rows;
      },
      hit(id: number, ids: { m?: number } = {}) {
        const hp0 = M.yk(id).hp;
        h.input.release('primary');
        h.input.press('primary');
        const rows: any[] = [];
        let k = -1;
        for (let i = 0; i < 20; i++) {
          const fz = M.frozenNow();
          h.step(1);
          if (i === 0) h.input.release('primary');
          const r = M.row(i, { ...ids, y: id }, fz);
          rows.push(r);
          if (k < 0 && r.y && r.y.hp < hp0) {
            k = i;
            break;
          }
        }
        return { rows, k };
      },
      hurtMe(yid: number, ids: { m?: number } = {}, max = 400) {
        const hp0 = h.combat.get().hp;
        const r0 = h.yokai.attackNow(yid);
        const rows: any[] = [];
        let k = -1;
        for (let i = 0; i < max; i++) {
          const fz = M.frozenNow();
          h.step(1);
          const r = M.row(i, { ...ids, y: yid }, fz);
          rows.push(r);
          if (r.php < hp0) {
            k = i;
            break;
          }
        }
        return { rows, k, attackNow: r0 };
      },
      /** ヒットストップ（#276）で 世界 が 止まって いる ステップ か（次の step が 止まる なら true）。ゲームの 窓口 `impact.stopLeft()` */
      frozenNow() {
        return (h.impact?.stopLeft?.() ?? 0) > 0;
      },
      /** 止まって いない ステップ だけ 数えた 番号（0 はじまり）。止まった 行 は -1 */
      nf(rows: any[], i: number) {
        if (rows[i].frozen) return -1;
        return rows.slice(0, i + 1).filter((r: any) => !r.frozen).length - 1;
      },
      /** 止まって いない ステップ だけ 数えて n 番目 の 行（なければ undefined） */
      atNf(rows: any[], n: number) {
        return rows.filter((r: any) => !r.frozen)[n];
      },
      punchStart(rows: any[]) {
        return rows.findIndex((r) => r.m && r.m.state === 'punch');
      },
      bladeFrames() {
        const t = h.settings.get('bladeTech').thrust;
        return { startup: t.startup, active: t.active, recovery: t.recovery };
      },
      yaFrom(id: number, dist: number, ids: { m?: number } = {}) {
        h.inventory.setSlot(1, { item: 'yumi', count: 1 });
        h.inventory.setSlot(2, { item: 'ya', count: 30 });
        h.inventory.select(1);
        h.step(12);
        const y0 = M.yk(id);
        const hp0 = y0.hp;
        const rows: any[] = [];
        let k = -1;
        for (const pitch of [0, 3, 6, 9, 12, 15, 18, 21, 24]) {
          h.player.set({ position: { x: y0.position.x - dist, y: 9, z: y0.position.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch });
          h.step(1);
          h.input.press('primary');
          h.step(45);
          h.input.release('primary');
          for (let i = 0; i < 90; i++) {
            h.step(1);
            const r = M.row(rows.length, { ...ids, y: id });
            rows.push(r);
            if (r.y && r.y.hp < hp0) {
              k = rows.length - 1;
              break;
            }
          }
          if (k >= 0) break;
        }
        h.inventory.select(0);
        return { rows, k };
      },
    };
    (window as any).__M = M;
  });
}
