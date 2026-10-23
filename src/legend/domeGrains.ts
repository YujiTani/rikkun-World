import type { Vec3 } from '../contracts';

/**
 * WEAPON-9 §5.3・§5.3.1: ドームの「かけら」と「すいよせの つぶ」の 位置の 計算（見た目の 数だけ。描画は DomeFx の 点 1 回）。
 * - かけら 24（ドームが ある 間 ゆっくり 舞い上がる）。
 * - いつもの つぶ 16（とどまる F41〜200。ドームの 外 12 から ふちへ 流れこむ）。
 * - すわれて いる 妖怪の つぶ 最大 24（その 妖怪の まわりから ふちへ）。強く なる・弱く なるは 10 ステップ。
 * かけら ＋ つぶ ≦ 64。つぶは 外から 内へ だけ 動く（ふちで 消えて、別の id で また 外から）。
 */
export const SHARD_COUNT = 24;
export const IDLE_GRAINS = 16;
export const PULL_GRAINS_MAX = 24;
export const GRAIN_LIFE = 90;
export const PULL_LIFE = 45;
export const PULL_RAMP = 10;

export interface Grain {
  id: number;
  kind: 'shard' | 'idle' | 'pull';
  x: number;
  y: number;
  z: number;
}

export interface GrainsIn {
  /** はなした ステップ F（シャイニング中。なければ 0） */
  F: number;
  center: Vec3;
  /** ドームの 今の 半径（0 = ない） */
  radius: number;
  /** この ステップに すわれて いる 妖怪の 位置 */
  pulled: readonly Vec3[];
  reduced: boolean;
}

interface Slot {
  id: number;
  age: number;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
}

const GOLD = 2.399963;

export interface DomeGrains {
  step(i: GrainsIn): void;
  /** いま 見える かけら・つぶ（毎回 同じ 入れ物。長さは `count()`） */
  list(): readonly Grain[];
  count(): number;
  counts(): { shards: number; idle: number; pull: number };
}

export function createDomeGrains(): DomeGrains {
  const out: Grain[] = [];
  for (let i = 0; i < SHARD_COUNT + IDLE_GRAINS + PULL_GRAINS_MAX; i++) out.push({ id: i, kind: 'shard', x: 0, y: 0, z: 0 });
  let n = 0;
  let c = { shards: 0, idle: 0, pull: 0 };
  let t = 0;
  const idle: Slot[] = [];
  const pull: Slot[] = [];
  let idleCycle = 0;
  let pullCycle = 0;
  let level = 0;
  let wasHold = false;

  function put(kind: Grain['kind'], id: number, x: number, y: number, z: number): void {
    const g = out[n++]!;
    g.kind = kind;
    g.id = id;
    g.x = x;
    g.y = y;
    g.z = z;
  }

  function idleSlot(i: number, center: Vec3, R: number): Slot {
    const a = i * GOLD + idleCycle * 0.7;
    const el = (((i * 5) % 7) - 3) * 0.2; // 上下に ばらす
    const cx = Math.cos(el);
    const dx = Math.cos(a) * cx;
    const dz = Math.sin(a) * cx;
    const dy = Math.sin(el);
    return { id: 100 + idleCycle * IDLE_GRAINS + i, age: (i * 11) % GRAIN_LIFE, sx: center.x + dx * (R + 5), sy: center.y + dy * (R + 5), sz: center.z + dz * (R + 5), ex: center.x + dx * R, ey: center.y + dy * R, ez: center.z + dz * R };
  }

  function pullSlot(i: number, from: Vec3, center: Vec3, R: number): Slot {
    const dx = center.x - from.x;
    const dz = center.z - from.z;
    const h = Math.hypot(dx, dz) || 1;
    const sy = from.y + 0.6 + (i % 3) * 0.3;
    // ふちの 点: 妖怪から 体の 中心への 線が 半径 R の 球に 入る 所（水平で 近づける）
    const dist = Math.max(0, h - R);
    const ex = from.x + (dx / h) * dist;
    const ez = from.z + (dz / h) * dist;
    return { id: 1000 + pullCycle * PULL_GRAINS_MAX + i, age: 0, sx: from.x + ((i * 7) % 5 - 2) * 0.12, sy, sz: from.z + ((i * 3) % 5 - 2) * 0.12, ex, ey: center.y + (sy - center.y) * 0.4, ez };
  }

  return {
    step(i: GrainsIn): void {
      n = 0;
      t += 1 / 60;
      const R = i.radius;
      const k = i.reduced ? 0.5 : 1;
      let shards = 0;
      let idleN = 0;
      let pullN = 0;
      if (R > 0) {
        shards = SHARD_COUNT;
        for (let s = 0; s < SHARD_COUNT; s++) {
          const a = s * GOLD + 0.7;
          const rad = (0.25 + ((s * 0.37) % 0.65)) * R * 0.9;
          const rise = (s * 0.173 + (i.reduced ? 0 : t * 0.12)) % 1;
          const y = -2 + rise * 8;
          const rh = Math.sqrt(Math.max(0, rad * rad - y * y * 0.3));
          const ang = a + (i.reduced ? 0 : t * 0.1);
          put('shard', s, i.center.x + Math.cos(ang) * rh, i.center.y + y, i.center.z + Math.sin(ang) * rh);
        }
      }
      // いつもの つぶ: とどまる F41〜200 だけ（F は ドームの 半径が 7 の 間）
      const hold = i.F >= 41 && i.F <= 200 && R > 0;
      if (hold && !wasHold) {
        idle.length = 0;
        for (let s = 0; s < IDLE_GRAINS; s++) idle.push(idleSlot(s, i.center, R));
      }
      wasHold = hold;
      if (hold) {
        const want = Math.round(IDLE_GRAINS * k);
        for (let s = 0; s < idle.length; s++) {
          const sl = idle[s]!;
          sl.age++;
          if (sl.age >= GRAIN_LIFE) {
            idleCycle++;
            idle[s] = idleSlot(s, i.center, R);
            continue;
          }
          if (s >= want) continue;
          const f = sl.age / GRAIN_LIFE;
          put('idle', sl.id, sl.sx + (sl.ex - sl.sx) * f, sl.sy + (sl.ey - sl.sy) * f, sl.sz + (sl.ez - sl.sz) * f);
          idleN++;
        }
      }
      // すわれて いる 妖怪の つぶ: 10 ステップで ふえる・へる
      const pulling = hold && i.pulled.length > 0;
      level = pulling ? Math.min(1, level + 1 / PULL_RAMP) : Math.max(0, level - 1 / PULL_RAMP);
      if (!hold) level = 0;
      if (level > 0 && hold) {
        const target = Math.round(Math.min(PULL_GRAINS_MAX, 6 * Math.max(1, i.pulled.length)) * level * k);
        while (pull.length < PULL_GRAINS_MAX) pull.push({ id: -1, age: PULL_LIFE, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0 });
        for (let s = 0; s < target; s++) {
          let sl = pull[s]!;
          sl.age++;
          if (sl.age >= PULL_LIFE) {
            pullCycle++;
            const src = i.pulled.length > 0 ? i.pulled[s % i.pulled.length]! : { x: sl.sx, y: sl.sy, z: sl.sz };
            sl = pullSlot(s, src, i.center, R);
            pull[s] = sl;
          }
          const f = sl.age / PULL_LIFE;
          put('pull', sl.id, sl.sx + (sl.ex - sl.sx) * f, sl.sy + (sl.ey - sl.sy) * f, sl.sz + (sl.ez - sl.sz) * f);
          pullN++;
        }
      } else if (!hold) pull.length = 0;
      c = { shards, idle: idleN, pull: pullN };
    },
    list: () => out,
    count: () => n,
    counts: () => c,
  };
}
