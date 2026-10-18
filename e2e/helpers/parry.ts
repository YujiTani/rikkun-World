import type { Page } from '@playwright/test';
import { openBladeWorld, stage, takeKatana, type Vec3 } from './blade';

/**
 * 刀のパリィの E2E 用の 道具（WEAPON-5 仕様書 §4.8・§6）。
 * 数（長さ・F・火の玉の 速さ）は 決め打ちせず ゲーム（window.__rikkun）に 聞く:
 * `settings.get`・`parry.state/events`・`yokai.attackNow/stagger/fireballList`・`hud.staggerIcon`・`player.glow`・`combat.get/sounds`。
 * 妖怪は `ai: false` で 置き、`yokai.attackNow` が 返す `hitInSteps` から 押す ステップを 決める。
 */

export type ParryKind = 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi';

export interface ParryEvent {
  type: string;
  tick: number;
  frame?: number;
  by?: 'attack' | 'fireball' | 'parry' | 'reflect';
  yokaiId?: number | null;
  amount?: number;
  damage?: number;
  behind?: boolean;
  success?: boolean;
}

export interface ParryState {
  phase: 'idle' | 'ready' | 'guard' | 'recover' | 'kime';
  frame: number;
  buffered: boolean;
  slowLeft: number;
  timeScale: number;
  glowLeft: number;
}

/** 刀を 持って 平らな 地面に 立つ（北向き）。floorY を 返す */
export async function parryWorld(page: Page, item = 'katana', stance: 'chudan' | 'jodan' | 'gedan' = 'chudan'): Promise<number> {
  await openBladeWorld(page);
  await takeKatana(page, stance, item);
  const { floorY } = await stage(page);
  return floorY;
}

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function hasParryHook(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const h = window.__rikkun! as any;
    return typeof h.parry?.state === 'function' && typeof h.parry?.events === 'function' && typeof h.yokai?.attackNow === 'function' && typeof h.yokai?.stagger === 'function';
  });
}

export const setting = <T = any>(page: Page, key: string): Promise<T> =>
  page.evaluate((key) => (window.__rikkun! as any).settings.get(key), key) as Promise<T>;

export const parryState = (page: Page) => page.evaluate(() => (window.__rikkun! as any).parry.state() as ParryState);
/** `parry.events()` は 読んでも 空に ならない。`place()` の 時点より あとの 分だけ 返す（同じ ページで 何回も 置いても 数が 混ざらない） */
export const parryEvents = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    const all = JSON.parse(JSON.stringify(w.__rikkun.parry.events())) as ParryEvent[];
    return all.slice(w.__parryBase ?? 0);
  });
export const hpOf = (page: Page) => page.evaluate(() => (window.__rikkun! as any).combat.get().hp as number);
export const playerPos = (page: Page) => page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
export const yokaiInfo = (page: Page, id: number) =>
  page.evaluate((id) => (window.__rikkun! as any).yokai.list().find((y: any) => y.id === id) as { hp: number; attack: number; state: string; position: Vec3 } | undefined, id);
export const staggerOf = (page: Page, id: number) =>
  page.evaluate((id) => (window.__rikkun! as any).yokai.stagger(id) as { ticksLeft: number; double: boolean } | null, id);

/** 音の 名前を 空にして おく（`combat.sounds()` は 読むと 空になる） */
export const drainSounds = (page: Page) => page.evaluate(() => (window.__rikkun! as any).combat.sounds() as string[]);

/** Shift を 押したまま 左クリックを 押す（1 ステップ進める）。Shift は 押したまま、クリックは はなす */
export async function pressParry(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.input.press('run');
    h.input.press('primary');
    h.step(1);
    h.input.release('primary');
  });
}

/** 押しっぱなしを 全部 はなして 落ちつくまで 進める */
export async function calmDown(page: Page, n = 130): Promise<void> {
  await page.evaluate((n) => {
    const h = window.__rikkun! as any;
    h.input.releaseAll();
    h.step(n);
  }, n);
}

/** `attackNow` が 返す hitInSteps を 先に 調べる（置いて 攻撃させて すぐ 消す。ステップは 進めない） */
export async function probeHit(page: Page, kind: ParryKind, d: number, o: { side?: number; up?: number; back?: boolean } = {}): Promise<number> {
  return page.evaluate(
    ({ kind, d, o }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const id = h.yokai.spawn(kind, p.x + (o.side ?? 0), p.y + (o.up ?? 0), p.z + (o.back ? d : -d), { ai: false });
      const r = h.yokai.attackNow(id) as { hitInSteps: number } | null;
      h.yokai.clear();
      return r ? r.hitInSteps : -1;
    },
    { kind, d, o },
  );
}

/** 前 d（back なら 後ろ d）・横 side・上 up に 置く。体力は 多め。id を 返す */
export async function place(page: Page, kind: ParryKind, d: number, o: { side?: number; up?: number; hp?: number; back?: boolean } = {}): Promise<number> {
  return page.evaluate(
    ({ kind, d, o }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const id = h.yokai.spawn(kind, p.x + (o.side ?? 0), p.y + (o.up ?? 0), p.z + (o.back ? d : -d), { ai: false });
      h.yokai.setHp(id, o.hp ?? 400);
      h.yokai.events();
      (window as any).__parryBase = h.parry.events().length; // 空には ならない: ここまでを 記録して 差で 見る
      h.combat.sounds();
      return id as number;
    },
    { kind, d, o },
  );
}

/**
 * 妖怪の 攻撃の 当たりが パリィの F になるように 押す。終わったときは 当たった ステップの おわり。
 * `hitInSteps`（probeHit で 先に 調べた数）より F が 大きいときは、パリィを 先に 押してから 攻撃させる。
 * 戻りは `attackNow` の 答え。
 */
export async function parryAtF(page: Page, id: number, hitInSteps: number, F: number): Promise<{ hitInSteps: number } | null> {
  return page.evaluate(
    ({ id, hit, F }) => {
      const h = window.__rikkun! as any;
      const press = () => {
        h.input.press('run');
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
      };
      let r: { hitInSteps: number } | null;
      if (F <= hit) {
        r = h.yokai.attackNow(id);
        h.step(hit - F);
        press();
        h.step(F - 1);
      } else {
        press();
        h.step(F - 1 - hit);
        r = h.yokai.attackNow(id);
        h.step(hit);
      }
      return r;
    },
    { id, hit: hitInSteps, F },
  );
}

export interface Trace {
  parry: ParryState;
  glow: { visible: boolean; ticksLeft: number; level: number };
  stagger: { ticksLeft: number; double: boolean } | null;
  icon: { visible: boolean } | null;
  pos: Vec3;
  yokaiPos: Vec3 | null;
}

/** いまの 状態を 1 回 きろくして、そのあと 1 ステップ ずつ n 回 進めて きろくする（n + 1 個） */
export async function trace(page: Page, id: number, n: number): Promise<Trace[]> {
  return page.evaluate(
    ({ id, n }) => {
      const h = window.__rikkun! as any;
      const out: any[] = [];
      const snap = () => {
        const y = h.yokai.list().find((q: any) => q.id === id);
        const p = h.player.get().position;
        out.push({
          parry: h.parry.state(),
          glow: h.player.glow(),
          stagger: h.yokai.stagger(id),
          icon: h.hud.staggerIcon(id),
          pos: { x: p.x, y: p.y, z: p.z },
          yokaiPos: y ? { x: y.position.x, y: y.position.y, z: y.position.z } : null,
        });
      };
      snap();
      for (let i = 0; i < n; i++) {
        h.step(1);
        snap();
      }
      return out;
    },
    { id, n },
  ) as Promise<Trace[]>;
}

/**
 * ちょうちんの 火の玉が 受けの 中に 当たるように 押す。
 * 火の玉が 出るまで 進め、火の玉の 位置・向き・速さ（`fireballList`）と プレイヤーの 体の 箱から
 * 「あと 何ステップで 当たるか」を 数え、F ステップ以内に なった ステップで 押す。
 * 戻りは 押したときの 「あと 何ステップ」の 見積もり。
 */
export async function parryFireballAtF(page: Page, F: number, maxSteps = 200): Promise<number> {
  return page.evaluate(
    ({ F, maxSteps }) => {
      const h = window.__rikkun! as any;
      const FB_HALF = 0.45; // 火の玉の 当たりの箱（0.9）の 半分
      const stepsToHit = (): number | null => {
        const fb = h.yokai.fireballList().find((f: any) => !f.reflected);
        if (!fb) return null;
        const p = h.player.get().position;
        // 体の 箱を 火の玉の 半分だけ ふくらませ、火の玉の 中心の 線と 交わる 距離を 求める（スラブ法）
        const lo = [p.x - 0.3 - FB_HALF, p.y - FB_HALF, p.z - 0.3 - FB_HALF];
        const hi = [p.x + 0.3 + FB_HALF, p.y + 1.8 + FB_HALF, p.z + 0.3 + FB_HALF];
        const o = [fb.position.x, fb.position.y, fb.position.z];
        const d = [fb.dir.x, fb.dir.y, fb.dir.z];
        let t0 = 0;
        let t1 = 1e9;
        for (let i = 0; i < 3; i++) {
          if (Math.abs(d[i]) < 1e-9) {
            if (o[i] < lo[i] || o[i] > hi[i]) return null;
          } else {
            const a = (lo[i] - o[i]) / d[i];
            const b = (hi[i] - o[i]) / d[i];
            t0 = Math.max(t0, Math.min(a, b));
            t1 = Math.min(t1, Math.max(a, b));
          }
        }
        if (t0 > t1) return null;
        return t0 / (fb.speed / 60);
      };
      for (let i = 0; i < maxSteps; i++) {
        const s = stepsToHit();
        if (s !== null && s <= F) {
          h.input.press('run');
          h.input.press('primary');
          h.step(1);
          h.input.release('primary');
          return s;
        }
        h.step(1);
      }
      return -1;
    },
    { F, maxSteps },
  );
}

/** 刀の 出来事（techHit など）。読んでも 空に ならない */
export const bladeEvents = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify((window.__rikkun! as any).blade.events())) as { type: string; damage?: number; yokaiId?: number; tech?: string }[]);

/** 妖怪の 出来事（attackStart など）。読むと 空に なる */
export const takeYokaiEvents = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify((window.__rikkun! as any).yokai.events())) as { type: string; id?: number }[]);
