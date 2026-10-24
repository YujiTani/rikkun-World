import type { Page } from '@playwright/test';

/**
 * HIT-1（ヒットストップと 画面の ゆれ・#276）の E2E 用の 道具。
 * 数（止まる 長さ・ゆれの 量）は 決め打ちせず ゲーム（window.__rikkun.impact）に 聞く:
 *   impact.stopLeft() = 止まりの のこり（ステップ）、impact.trauma() = ゆれの 量（0〜1）、
 *   impact.log() = できごとの 記録 [{ tick, level: 'mid' | 'large' }]。
 * 実装の 前は `impact` が ない ので、それを 使う テストは 赤になる。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 1 ステップの おわりの ようす */
export interface ImpactSnap {
  tick: number;
  stop: number;
  trauma: number;
  logLen: number;
  pos: Vec3;
  yokai: { id: number; x: number; y: number; z: number; hp: number }[];
  bladeF: number;
  /** blade.events() の techHit の これまでの 数 */
  hits: number;
  cam: { position: Vec3; eye: Vec3; pivot: Vec3; shoulder: Vec3 };
  selected: number;
  canvasTransform: string[];
  shape: string;
}

export interface ProbeResult {
  /** 当たりが あった ステップ（なければ null） */
  hit: ImpactSnap | null;
  /** 始める 前 */
  pre: ImpactSnap;
  /** 当たりの 次の ステップから after こ */
  post: ImpactSnap[];
  /** 当たりの 段（impact.log() の その 行） */
  level: string | null;
  /** 当たりまで 押した ステップの 数 */
  steps: number;
  /** 世界が 止まって いた ステップの 数（当たりの 次から、tick が 進まない 間） */
  frozen: number;
}

const SNAP = `(() => {
  const h = window.__rikkun;
  const p = h.player.get().position;
  const c = h.camera.get();
  const cp = (v) => ({ x: v.x, y: v.y, z: v.z });
  return {
    tick: h.tick(),
    stop: h.impact.stopLeft(),
    trauma: h.impact.trauma(),
    logLen: h.impact.log().length,
    pos: cp(p),
    yokai: h.yokai.list().map((y) => ({ id: y.id, x: y.position.x, y: y.position.y, z: y.position.z, hp: y.hp })),
    bladeF: h.blade.state().frame,
    hits: h.blade.events().filter((e) => e.type === 'techHit').length,
    cam: { position: cp(c.position), eye: cp(c.eye), pivot: cp(c.pivot), shoulder: cp(c.shoulder) },
    selected: h.inventory.get().selected,
    canvasTransform: [...document.querySelectorAll('canvas')].map((x) => x.style.transform),
    shape: JSON.stringify(h.blade.shape()),
  };
})()`;

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function impactHookShape(page: Page): Promise<{ stop: unknown; trauma: unknown; log: unknown } | null> {
  return page.evaluate(() => {
    const i = (window.__rikkun! as any).impact;
    return i ? { stop: i.stopLeft(), trauma: i.trauma(), log: i.log() } : null;
  });
}

/**
 * `before(h, i)` を 毎ステップの 前に 動かして 1 ステップずつ 進め、`impact.log()` が ふえた ステップ（= 当たり）を 見つける。
 * そのあと after ステップ 進め、毎回 きろくする。`during(h, k, hit)` は 当たりの 後の k 番目（0 はじまり）の ステップの「前」に 動く。
 */
export async function probe(
  page: Page,
  o: { before?: string; during?: string; max?: number; after?: number } = {},
): Promise<ProbeResult> {
  return page.evaluate(
    ({ o, snap }) => {
      const h = window.__rikkun! as any;
      const S = () => (0, eval)(snap);
      const before = o.before ? (0, eval)(o.before) : null;
      const during = o.during ? (0, eval)(o.during) : null;
      const pre = S();
      let hit: any = null;
      let steps = 0;
      // HURT-1: ぶつかって 怯むと わざが とぎれ、うしろへ 押される。怯みが おわるのを 待ち、はじめの 場所へ もどして、はじめから たたき直す
      const home = { x: pre.pos.x, y: pre.pos.y, z: pre.pos.z };
      let k = 0; // before に わたす 番号（たたき直すと 0 に もどる）
      let hurt = false;
      for (let i = 0; i < (o.max ?? 120) && !hit; i++) {
        if (h.combat.get().flinchTicks > 0) {
          hurt = true;
          h.input.release('primary');
          h.step(1);
          steps++;
          continue;
        }
        if (hurt) {
          h.player.set({ position: { ...home }, velocity: { x: 0, y: 0, z: 0 } });
          hurt = false;
          k = 0;
        }
        if (before) before(h, k);
        k++;
        h.step(1);
        steps++;
        const s = S();
        if (s.logLen > pre.logLen) hit = s;
      }
      const post: any[] = [];
      if (hit) {
        for (let k = 0; k < (o.after ?? 12); k++) {
          if (during) during(h, k, hit);
          h.step(1);
          post.push(S());
        }
      }
      let frozen = 0;
      if (hit) {
        for (const s of post) {
          if (s.tick !== hit.tick) break;
          frozen++;
        }
      }
      const level = hit ? (h.impact.log()[pre.logLen]?.level ?? null) : null;
      return { hit, pre, post, level, steps, frozen };
    },
    { o, snap: SNAP },
  ) as Promise<ProbeResult>;
}

/** n ステップ 1 つずつ 進め、毎回 きろくする（当たりが 「ない」ことを 見る とき） */
export async function watch(page: Page, n: number, before?: string): Promise<ImpactSnap[]> {
  return page.evaluate(
    ({ n, before, snap }) => {
      const h = window.__rikkun! as any;
      const b = before ? (0, eval)(before) : null;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (b) b(h, i);
        h.step(1);
        out.push((0, eval)(snap));
      }
      return out;
    },
    { n, before, snap: SNAP },
  ) as Promise<ImpactSnap[]>;
}

/** 前 d に 二つ名つきの からかさを 置く（止める = ai:false）。戻りは id */
export async function spawnTitled(page: Page, d: number, title: 'oyabun' | 'taisho' | 'nushi', hp = 9999, side = 0): Promise<number> {
  return page.evaluate(
    ({ d, title, hp, side }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const id = h.yokai.spawn('karakasa', p.x + side, p.y, p.z - d, { ai: false, title, m: 1 });
      h.yokai.setHp(id, hp);
      h.yokai.events();
      return id as number;
    },
    { d, title, hp, side },
  );
}

/** 左クリックで わざを 始める 動き（i = 0 で 押し、i = 1 で はなす） */
export const TAP = `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 1) h.input.release('primary'); }`;
