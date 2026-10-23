import type { Page } from '@playwright/test';
import { installAimHelpers } from './aim';
import { installArena } from './arena';

/**
 * LIVE-1（にわとり）の E2E の準備（docs/design/LIVE-1.md §6・§6.1）。
 * 数・角度は 決め打ちしない: ねらいは `animals.target()` に 聞いて 確かめ、1 日の長さは 設定から 読む。
 *
 * ページの中では `window.__A` として使う（`openAnimals(page)` のあと）。
 *   __A.base(half?)          床 y=8（0..half）＋空気、持ち物から・昼・やせい自動出現なし・妖怪なし・一時停止
 *   __A.chicken(x, z, opts?) (x, 9, z) に にわとりを置き、30 コマ進めて「こっちを見る」が落ち着いてから id を返す
 *   __A.aim(id)              その にわとり（x.5, z.5 に いる前提）を ねらう向きに して `animals.target() === id` を 返す
 *   __A.tap(action?)         ボタンを 1 ステップだけ 押す（押した 瞬間 だけ）
 *   __A.hold(item, n?)       持ち物を そのもの n 個だけに して 選ぶ
 *   __A.nextDay()            `time.day()` が 1 ふえる まで 進める（1 日の長さは 設定の 4 つの合計）
 *   __A.events(type?)        animals.events() を 読んで 種類で しぼる
 *   __A.one(id)              animals.list() の 1 行
 *   __A.sfx()                audio.sfx() を 読んで 名前の 配列
 *   __A.dist(a, b)           水平距離
 *
 * 版 3.2 で足した もの（docs/design/LIVE-1.md §6・§6.1）:
 *   __A.full()               ついてくる 時間の まんたん（設定 `animalFollowTicks`。まだ 無ければ 18000）
 *   __A.friend(x, z, opts?)  なかま（follow まんたん）を (x, 9, z) に 置き、35 コマ 進めて id を 返す
 *   __A.stand(id)            その にわとりの 2 マス 西（-x）に 立って ねらう。ねらえたら true
 *   __A.press(n, a?)         ボタンを 押して n ステップ 進める（はなさない）。はなす のは __A.release(a?)（1 ステップ 進める）
 *   __A.tree(x, y, z, kind?) き の ブロック（既定 leaves）を 置いて 2 ステップ 進める
 *   __A.aimBlock(x, y, z)    そのブロックの まん中 を ねらう。`target.get()` の ブロックが 同じなら true
 *   __A.swing()              あみ を 1 回 ふる（押して はなし、30 ステップ 進める）。その間の `swing` `bugCatch` の 出来事 を 返す
 *   __A.chip()               合図の チップ `#animal-hint` の 文字 と ルビの 外に ある 漢字
 *   __A.lift(id)             なかま を 40 ステップ 押して だっこ（はなして 1 ステップ）。だっこ できたら true
 *
 * LIVE-2.1 で足した もの: snap / solidBelow / put / putKit / flight / outsideWest / carryOne / draw（下の 定義の コメントを 見る）
 *
 * LIVE-2 で足した もの: kit / putEgg / coop / cinfo / face / kid / yawTo / inside / dayLen / night / bags / hintRight（下の 定義の コメントを 見る）
 */
export async function openAnimals(page: Page, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // 最初のクリックで音が使えるようになる（unlock）。ないと audio.sfx() の記録が空のまま（SOUND-1 の openGame と同じ）
  await page.mouse.click(0, 0);
  await installAimHelpers(page);
  await installArena(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    // 実績の おしらせは 画面の 上の 帯で、世界を 止めない・ロックも 外さない（WEAPON-7 O8）。出た ことだけ 記録する（AC6 が 見る）
    const rawStep = h.step.bind(h);
    h.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        rawStep(1);
        if (h.achievements.modal().open) (window as any).__modalSeen = true;
      }
    };
    const A: any = {
      base(half = 24) {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('animalAutoSpawn', false);
        h.settings.set('yokaiAutoSpawn', false);
        h.settings.set('yokaiWander', false);
        h.yokai.clear();
        h.animals.clear();
        (window as any).__arena.floor(0, 0, half, half);
        h.inventory.clear();
        h.armor.set(null, null, null, null);
        h.combat.setHp(h.combat.get().maxHp ?? 20);
        h.time.set(12000);
        (window as any).__aim.standForS(2.5, 6.5, 90, -20, 9);
        h.step(5);
        h.animals.events();
        h.animals.fxReset();
        h.audio.sfx();
        h.yokai.events();
      },
      chicken(x: number, z: number, opts: any = {}) {
        const id = h.animals.spawn(x, 9, z, opts);
        h.step(35);
        return id;
      },
      aim(id: number) {
        const c = h.animals.list().find((a: any) => a.id === id);
        (window as any).__aim.solve(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), 0.5);
        h.step(1);
        return h.animals.target() === id;
      },
      tap(a = 'secondary') {
        h.input.release(a);
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      hold(item: string, n = 1) {
        h.inventory.clear();
        h.inventory.add(item, n);
        h.inventory.select(0);
        h.step(1);
      },
      nextDay() {
        const s = h.settings;
        const len = s.get('dayTicks') + s.get('duskTicks') + s.get('nightTicks') + s.get('dawnTicks');
        const d0 = h.time.get().day;
        h.time.set(len - 1);
        h.step(2);
        return h.time.get().day - d0;
      },
      events(type?: string) {
        const e = h.animals.events();
        return type ? e.filter((x: any) => x.type === type) : e;
      },
      one(id: number) {
        return h.animals.list().find((a: any) => a.id === id) ?? null;
      },
      sfx() {
        return h.audio.sfx().map((r: any) => r.name);
      },
      dist(a: any, b: any) {
        return Math.hypot(a.x - b.x, a.z - b.z);
      },
      stat(k: string) {
        return h.achievements.stats()[k] ?? 0;
      },
      unlocked(id: string) {
        return !!h.achievements.list().find((a: any) => a.id === id)?.unlocked;
      },
      full() {
        try {
          return h.settings.get('animalFollowTicks') as number;
        } catch {
          return 18000;
        }
      },
      friend(x: number, z: number, opts: any = {}) {
        return A.chicken(x, z, { friend: true, follow: A.full(), ...opts });
      },
      stand(id: number) {
        const c = h.animals.list().find((a: any) => a.id === id);
        (window as any).__aim.standForS(c.x - 2, c.z, 90, -20, 9);
        h.step(1);
        return A.aim(id);
      },
      press(n: number, a = 'secondary') {
        h.input.press(a);
        h.step(n);
      },
      release(a = 'secondary') {
        h.input.release(a);
        h.step(1);
      },
      tree(x: number, y: number, z: number, kind = 'leaves') {
        h.world.setBlock(x, y, z, kind);
        h.step(2);
      },
      aimBlock(x: number, y: number, z: number) {
        (window as any).__aim.solve(x, y, z, 0.5);
        h.step(1);
        const t = h.target.get();
        return !!t && t.block.x === x && t.block.y === y && t.block.z === z;
      },
      swing() {
        h.animals.events();
        h.input.press('secondary');
        h.step(1);
        h.input.release('secondary');
        h.step(29);
        return h.animals.events().filter((e: any) => e.type === 'swing' || e.type === 'bugCatch');
      },
      chip() {
        const el = document.querySelector('#animal-hint');
        const bare: string[] = [];
        if (el) {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n: Node | null;
          while ((n = w.nextNode())) {
            if (/[一-鿿]/.test(n.textContent ?? '') && !n.parentElement?.closest('ruby')) bare.push(n.textContent!);
          }
        }
        return { text: (el as HTMLElement | null)?.innerText ?? '', hidden: !el || (el as HTMLElement).hidden, bare };
      },
      lift(id: number) {
        A.aim(id);
        h.input.press('secondary');
        h.step(41);
        h.input.release('secondary');
        h.step(1);
        return A.one(id).carried === true;
      },

      // ---- LIVE-2（docs/design/LIVE-2.md §6・§6.1）で足した もの。窓口の 仮の 名前は docs/test-reports/LIVE-2.md の「仮の 窓口」
      /** (x, y, z) を 本体（北西 の マス）に して こたつ 2×2（`nukunuku`＋のこり 3 マス）を 置いて 2 ステップ 進める。返す {x, y, z} は 本体 */
      kit(x: number, z: number, y = 9) {
        h.world.setBlock(x, y, z, 'nukunuku');
        h.world.setBlock(x + 1, y, z, 'nukunuku_e');
        h.world.setBlock(x, y, z + 1, 'nukunuku_s');
        h.world.setBlock(x + 1, y, z + 1, 'nukunuku_se');
        h.step(2);
        return { x, y, z };
      },
      /** 古い セーブ の 1 マス こたつ（まわり に 3 マス が 無い `nukunuku`）。1 マス の まま こたつ として 動く */
      kit1(x: number, z: number, y = 9) {
        h.world.setBlock(x, y, z, 'nukunuku');
        h.step(2);
        return { x, y, z };
      },
      /** こたつ k の 2 マス 西に 立って まん中を ねらい、`item` を n こ 持って 右クリック 1 回。出来事と 合図を 返す */
      putEgg(k: any, item = 'egg', n = 1) {
        A.hold(item, n);
        (window as any).__aim.standForS(k.x - 1.5, k.z + 0.5, 90, 0, k.y);
        h.step(1);
        const aimed = A.aimBlock(k.x, k.y, k.z);
        h.animals.events();
        A.tap();
        const ev = h.animals.events();
        const hints = ev.filter((e: any) => e.type === 'hint').map((e: any) => e.hint);
        return { aimed, ev, hint: hints.length ? hints[hints.length - 1] : null, left: h.inventory.count(item) };
      },
      /** 小屋を 置く（placeCoop は x・z が 5×5 の まん中、y が いちばん 下の 空気の 高さ）。小屋 id か 理由 を 返す */
      coop(x: number, z: number, dir = 0, y = 9) {
        const r = h.animals.placeCoop(x, y, z, dir);
        h.step(3);
        return r;
      },
      cinfo(id: number) {
        return h.animals.coops().find((c: any) => c.id === id) ?? null;
      },
      /** もん の むき（まん中から もん への ほうこう。-1/0/1 の 組） */
      face(c: any) {
        return { fx: Math.sign(c.gate.x - c.x), fz: Math.sign(c.gate.z - c.z) };
      },
      /** 小屋 c の 中 3×3 の 中（まん中が 0,0）の 場所 に 子を 置く */
      kid(c: any, opts: any = {}, dx = 0, dz = 0) {
        const id = h.animals.spawn(c.x + 0.5 + dx, c.y, c.z + 0.5 + dz, { friend: true, home: c.id, ...opts });
        h.step(3);
        return id;
      },
      yawTo(dx: number, dz: number) {
        return (Math.atan2(dx, -dz) * 180) / Math.PI;
      },
      /** 小屋 の 中 3×3 に 足が はいって いるか */
      inside(c: any, p: { x: number; z: number }) {
        return Math.abs(p.x - (c.x + 0.5)) < 1.5 && Math.abs(p.z - (c.z + 0.5)) < 1.5;
      },
      /** 1 日の 長さ（設定の 4 つの 合計） */
      dayLen() {
        const s = h.settings;
        return s.get('dayTicks') + s.get('duskTicks') + s.get('nightTicks') + s.get('dawnTicks');
      },
      /** 夜に する（night の まんなか） */
      night() {
        const s = h.settings;
        h.time.set(s.get('dayTicks') + s.get('duskTicks') + 100);
        h.step(2);
      },
      bags(item?: string) {
        const b = h.combat.bags();
        return item ? b.filter((x: any) => x.slots.some((s: any) => s.item === item)) : b;
      },
      /** 照準の 下の 右がわ（`hud.actionHint().right`） */
      hintRight() {
        return h.hud.actionHint().right ?? null;
      },

      // ---- LIVE-2.1（docs/design/LIVE-2.1.md §6）で足した もの
      /** 範囲の ブロック id を 1 本の 文字に する（前と 後を くらべて 「何も かわらない」を 見る） */
      snap(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
        const out: string[] = [];
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push(String(h.world.getBlock(x, y, z)));
        return out.join(',');
      },
      /** (cx, cz) の まわり r マスの 下（y 2..7）を いしで うめる。穴の 深さを テストが 決める ため（床 y=8 の 下が 空気か 土かに たよらない） */
      solidBelow(cx: number, cz: number, r = 5) {
        h.world.fill(cx - r, 2, cz - r, cx + r, 7, cz + r, 'stone');
        h.step(2);
      },
      /** 世界で 1 マス ちがう だけ を 作る 小さな 道具: (x, y) に ブロックを 置いて 1 ステップ */
      put(x: number, y: number, z: number, id: string) {
        h.world.setBlock(x, y, z, id);
        h.step(1);
      },
      /**
       * こたつ（nukunuku）を 持って 床の ブロック (tx, 8, tz) の 上の 面を 西 から ねらい、右クリック 1 回（ゲームの 置くと 同じ）。
       * 置けたか・合図・のこりの 数・本体 {x,y,z}（nukunuku の 北西 の マス）を 返す。
       */
      putKit(tx: number, tz: number, y = 9) {
        A.hold('nukunuku', 1);
        (window as any).__aim.standForS(tx - 1.5, tz + 0.5, 90, 0, y);
        h.step(1);
        (window as any).__aim.solve(tx, y - 1, tz, 1);
        h.step(1);
        h.animals.events();
        A.tap();
        const hints = h.animals.events().filter((e: any) => e.type === 'hint').map((e: any) => e.hint);
        let body: any = null;
        for (let x = tx - 3; x <= tx + 3 && !body; x++) for (let z = tz - 3; z <= tz + 3 && !body; z++) {
          if (h.world.getBlock(x, y, z) === 'nukunuku') body = { x, y, z };
        }
        return { placed: !!body, body, hint: hints.length ? hints[hints.length - 1] : null, left: h.inventory.count('nukunuku') };
      },
      /**
       * 右クリック 1 回（押して はなす）の あと、着地（putDown か home）まで 1 ステップ ずつ 進めて 記録する。
       * 返す {rows, ev, tossAt, landAt}: rows は ステップごとの その 子の 1 行（i は 押した ステップ から 数える）、ev は 出来事（i つき）。
       * 時間(ms)ではなく 「ゲームの ステップ」で 数える（#255）。
       */
      flight(id: number, opts: { max?: number; press?: boolean } = {}) {
        const max = opts.max ?? 600;
        h.animals.events();
        if (opts.press !== false) {
          h.input.release('secondary');
          h.input.press('secondary');
        }
        const rows: any[] = [];
        const ev: any[] = [];
        let tossAt = -1;
        let landAt = -1;
        for (let i = 0; i <= max; i++) {
          h.step(1);
          if (i === 0 && opts.press !== false) h.input.release('secondary');
          const c = A.one(id);
          rows.push({ i, ...(c ? { x: c.x, y: c.y, z: c.z, vy: c.vy, carried: c.carried, fluttering: c.fluttering, state: c.state, home: c.home ?? null } : {}) });
          for (const e of h.animals.events()) {
            ev.push({ ...e, i });
            if (e.type === 'toss' && tossAt < 0) tossAt = i;
            if ((e.type === 'putDown' || e.type === 'home') && landAt < 0 && e.id === id) landAt = i;
          }
          if (landAt >= 0 && i >= landAt + 3) break;
        }
        return { rows, ev, tossAt, landAt };
      },
      /** 小屋 c の 外の 西がわ 1 マス（さくの すぐ 外）に プレイヤーを 立たせ、東（小屋の ほう）を 向く */
      outsideWest(c: any, pitch = 0) {
        h.player.set({ position: { x: c.x - 2 + 0.5 - 1, y: c.y, z: c.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch });
        h.step(1);
      },
      /**
       * (px, pz) に 立って、2 マス 西に いる なかま（ひよこ または 大人。ついてくる 時間 まんたん）を だっこ する。
       * だっこ できたら ok。そのあと プレイヤーの 向きは 呼ぶ ほうが 決める（ここでは 西向きの まま）
       */
      carryOne(px: number, pz: number, stage = 'chick') {
        // 先に プレイヤー を 立たせる（あとから だと なかま が 古い 位置 へ 歩いて 2 マス 西 から ずれ、だっこ の 40 ステップ 中 に ねらい が はずれる）
        h.player.set({ position: { x: px, y: 9, z: pz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: 0 });
        h.step(1);
        const id = A.friend(px - 2, pz, { stage });
        h.player.set({ position: { x: px, y: 9, z: pz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: 0 });
        h.step(1);
        const ok = A.lift(id);
        return { id, ok };
      },
      /** 画面の 描画回数と 三角形 */
      draw() {
        const r = h.renderStats();
        return { dc: r.drawCalls as number, tri: r.triangles as number };
      },
    };
    (window as any).__A = A;
  });
}
