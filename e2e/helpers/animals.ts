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
    // 実績の おめでとう画面は 世界を 止める（仕様 §4.5）。テストの 流れを 止めないよう、1 ステップごとに 開いていたら 閉じる
    const rawStep = h.step.bind(h);
    h.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        rawStep(1);
        if (h.achievements.modal().open) {
          // ボタンが 押せる ように なるまで 画面だけ 進めて 閉じる（世界は 止まったまま）
          for (let k = 0; k < 600 && h.achievements.modal().open; k++) {
            h.achievements.close();
            if (h.achievements.modal().open) rawStep(1);
          }
          h.lock.simulate(true);
        }
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
    };
    (window as any).__A = A;
  });
}
