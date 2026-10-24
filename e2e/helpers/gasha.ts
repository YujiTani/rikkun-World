import type { Page } from '@playwright/test';

/**
 * #293 がしゃどくろの E2E が くり返し使う道具。時間（ms）では 待たず、ゲーム（window.__rikkun / window.__gashaBig）に 聞く。
 *  openGasha(page, search)   ゲームを 開き、エラーの 記録（pageerror・console.error）を 返す。時間は 止める（pause）。
 *  ページの 中に `window.__gt` を 作る（下の GT）。1 コマずつ 進める・プレイヤーを 立たせる・たおれない ように 回復する など。
 *
 * 場所の きまり: 世界の はじめは (64.5, 64.5)。がしゃどくろは `spawn({ distance, angleDeg })` で 置く（angleDeg 0 = +x、90 = +z、-90 = -z）。
 * 体は 置いた 場所から プレイヤーの 方を 向く。ふだんの 歩き回りは `walk(false)` で 止められる。
 */

export interface Vec3 { x: number; y: number; z: number }

/** ゲームを 開く。エラーの 記録を 返す（空のままが 正しい）。時間は 止めて ある */
export async function openGasha(page: Page, search = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await reopenGasha(page, search);
  return errors;
}

/** ページを 開きなおして（新しい ゲーム）、時間を 止め、道具を 入れなおす。エラーの 記録は そのまま つづく */
export async function reopenGasha(page: Page, search = ''): Promise<void> {
  await page.goto('/' + search);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.pause();
  });
  await page.evaluate(() => (window as any).__rikkun.world.settle({ full: true }));
  await installTools(page);
}

/** ページの 中に `window.__gt` を 作る（作り直しても 同じ） */
export async function installTools(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    const h = w.__rikkun;
    const gt: any = {
      h,
      big: () => w.__gashaBig,
      /** 1 コマずつ n 回。each(i) は 進める 前に 毎回 呼ぶ */
      run(n: number, each?: (i: number) => void) { for (let i = 0; i < n; i++) { if (each) each(i); h.step(1); } },
      /** pred() が 真に なるまで 1 コマずつ。max コマで 見つからなければ -1。見つけたら かかった コマ数 */
      until(pred: () => boolean, max: number, each?: (i: number) => void) {
        for (let i = 0; i < max; i++) { if (pred()) return i; if (each) each(i); h.step(1); }
        return pred() ? max : -1;
      },
      /** (x, z) の 立つ 面の 高さ（地面の いちばん 上の ブロック + 1） */
      groundTop(x: number, z: number) { return h.world.groundHeight(Math.floor(x), Math.floor(z)) + 1; },
      /** プレイヤーを (x, z) の 地面に 立たせる。up > 0 なら その 高さ 浮かせる（ジャンプの 代わり） */
      put(x: number, z: number, up = 0) {
        h.player.set({ position: { x, y: gt.groundTop(x, z) + up, z }, velocity: { x: 0, y: 0, z: 0 } });
      },
      /** 体力を まんたんに（たおれない ように） */
      heal() { h.combat.setHp(h.combat.get().maxHp); },
      hp() { return h.combat.get().hp as number; },
      /** 関節（Left/RightHand など）の 世界の 場所 */
      jointPos(name: string) {
        const j = w.__gashaBig.joints()[name];
        const v = w.__gashaBig.group.position.clone();
        j.getWorldPosition(v);
        return { x: v.x, y: v.y, z: v.z };
      },
      boss() { const i = w.__gashaBig.info(); return { x: i.pos[0] as number, y: i.pos[1] as number, z: i.pos[2] as number, yawDeg: i.yawDeg as number }; },
      /** プレイヤーが 受けた ダメージの きろく（combat.events() の playerHit を ためる。drain() で 読み出して ためる） */
      taken: [] as { tick: number; amount: number }[],
      drain() {
        for (const e of h.combat.events()) if (e.type === 'playerHit') gt.taken.push({ tick: e.tick, amount: e.amount });
      },
      takenTotal() { gt.drain(); return gt.taken.reduce((s: number, e: { amount: number }) => s + e.amount, 0) as number; },
      /**
       * 攻撃 name を 出して、終わる(mode が attack でなくなる)まで 1 コマずつ 進める。毎コマ 体力を まんたんに して 受けた ダメージを きろくする。
       * each(i) は 進める 前に 呼ぶ(プレイヤーの 立ち位置を 毎コマ 決める)。max コマで 打ち切り。かかった コマ数を 返す。
       */
      runAttack(name: string, each?: (i: number) => void, max = 4000) {
        const g = w.__gashaBig;
        gt.taken.length = 0;
        h.combat.events();
        g.attack(name);
        let i = 0;
        for (; i < max; i++) {
          if (each) each(i);
          h.step(1);
          gt.heal();
          if (i % 4 === 0) gt.drain();
          if (i > 10 && g.attackInfo().mode !== 'attack') break;
        }
        gt.drain();
        return i;
      },
      /** 攻撃の あとに のこる はずの ない 数を ぜんぶ 数える（Leftovers） */
      leftovers() {
        const g = (window as any).__gashaBig;
    const a = g.attackInfo();
    const s = g.shock();
    const bf = a.beamFx;
    const tf = a.thunder.fx;
    const ef = a.eruption.fx;
    return {
      fxWarn: !!a.fx.warn || !!a.warn, fxRocks: a.fx.rocks, fxCracks: a.fx.cracks, fxRings: s.fx.rings, fxDust: s.fx.dust,
      quakeLeft: a.quakeLeft, staggerLeft: s.staggerLeft, impacts: s.impacts, inputBlocked: s.inputBlocked,
      beam: bf.marks + bf.flames + bf.smoke + bf.beams + bf.sparkle, beamAimOn: !!a.beamAim,
      thunderCloud: a.thunder.cloud, thunderElec: a.thunder.elec, thunderStrikes: a.thunder.strikes,
      thunderFx: tf.bolts + tf.rings + tf.warns + tf.arcs + tf.cloud + tf.flash, thunderGlow: !!tf.glow,
      eruptionFlying: a.eruption.flying, eruptionFx: ef.ashes + ef.shadows + ef.burning + ef.smoke + ef.jet + ef.wind, eruptionEmbers: ef.embers, eruptionColumn: !!ef.column,
      mode: a.mode, attack: a.attack,
    } as any;
      },
      /** 出して 待つ（読みこみは 非同期）。止まって 立っている 状態から はじめる */
      async spawn(opts?: { distance?: number; angleDeg?: number }) {
        const ok = await h.gasha.spawn(opts);
        return ok as boolean;
      },
    };
    w.__gt = gt;
  });
}

/** 出して、プレイヤーを 基準の 場所（世界の はじめ）に 立たせ、体力を まんたんに する。歩き回りは 止める */
export async function setupBoss(page: Page, opts: { distance?: number; angleDeg?: number; walk?: boolean } = {}): Promise<void> {
  await page.evaluate(async (o) => {
    const gt = (window as any).__gt;
    const ok = await gt.spawn({ distance: o.distance ?? 60, angleDeg: o.angleDeg ?? -90 });
    if (!ok) throw new Error('がしゃどくろを 出せなかった');
    if (!o.walk) gt.big().walk(false);
    gt.put(64.5, 64.5);
    gt.heal();
  }, opts);
}

/** 攻撃の あとに のこる はずの ない 数（エフェクト・当たり・雲・電気・揺れ）を ぜんぶ 数える。0 が 正しい */
export interface Leftovers {
  fxWarn: boolean; fxRocks: number; fxCracks: number; fxRings: number; fxDust: number;
  quakeLeft: number; staggerLeft: number; impacts: number; inputBlocked: boolean;
  beam: number; beamAimOn: boolean;
  thunderCloud: number; thunderElec: number; thunderStrikes: number; thunderFx: number; thunderGlow: boolean;
  eruptionFlying: number; eruptionFx: number; eruptionEmbers: number; eruptionColumn: boolean;
  mode: string; attack: string | null;
}

export async function leftovers(page: Page): Promise<Leftovers> {
  return page.evaluate(() => (window as any).__gt.leftovers() as Leftovers);
}

/** 「片づいている」状態: 数が 0・フラグが false */
export const CLEAN: Omit<Leftovers, 'mode' | 'attack'> = {
  fxWarn: false, fxRocks: 0, fxCracks: 0, fxRings: 0, fxDust: 0,
  quakeLeft: 0, staggerLeft: 0, impacts: 0, inputBlocked: false,
  beam: 0, beamAimOn: false,
  thunderCloud: 0, thunderElec: 0, thunderStrikes: 0, thunderFx: 0, thunderGlow: false,
  eruptionFlying: 0, eruptionFx: 0, eruptionEmbers: 0, eruptionColumn: false,
};

/** Leftovers から mode・attack を のぞく */
export const bare = (l: Leftovers): Omit<Leftovers, 'mode' | 'attack'> => {
  const { mode: _m, attack: _a, ...rest } = l;
  return rest;
};

/** 次の 攻撃が 始まらない ように ならしを 長くする（攻撃の 片づきを 見る とき）。攻撃を 出す 前に 呼ぶ */
export async function quietCycle(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__gashaBig.tune({ attack: { gapSec: [1e6, 1e6], firstGapSec: 1e6 } }));
}
