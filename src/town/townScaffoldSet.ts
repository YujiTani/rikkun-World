import { TOWN } from './townTuning';

/**
 * TOWN-1 1.4 §2.16 の 9・14: 足場の 一覧（まとまりごとに 1 つ）。朝に まとまりが きまる たびに 作りなおし、
 * もどしきった まとまりは `scaffoldGoneSteps` ステップ あとに きえる。計算だけ（three なし）。
 */
export interface ScaffoldRect {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** `town.scaffolds()` に 出す 四角: まとまりの 四角を 横に 1 マス ずつ かこむ（わく・柱は この 線。高さは そのまま） */
export function scaffoldFrame(r: ScaffoldRect): ScaffoldRect {
  return { min: { x: r.min.x - 1, y: r.min.y, z: r.min.z - 1 }, max: { x: r.max.x + 1, y: r.max.y, z: r.max.z + 1 } };
}

/** もどす 仕事の うち 足場が 見る 所（townRepairs の RepairJob の 一部） */
export interface JobLike {
  finished: boolean;
}

interface Item extends ScaffoldRect {
  /** ぜんぶ もどす 仕事（半分の 日は null。つぎの 朝まで のこる） */
  job: JobLike | null;
  /** きえる ステップ（-1 ＝ まだ） */
  goneAt: number;
}

export class ScaffoldSet {
  private items: Item[] = [];
  /** 一覧が かわる たびに ふえる（見せる 係が 作りなおす 合図） */
  version = 0;

  /** 朝: まだ のこる まとまり ぜんぶ（job ＝ そのまとまりを ぜんぶ もどす 仕事。半分 だけの ときは null） */
  reset(list: readonly { rect: ScaffoldRect; job: JobLike | null }[]): void {
    this.items = list.map((l) => ({ min: l.rect.min, max: l.rect.max, job: l.job, goneAt: -1 }));
    this.version++;
  }

  /** 毎ステップ（t ＝ 通しの ステップ） */
  step(t: number): void {
    let changed = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i]!;
      if (s.job === null || !s.job.finished) continue;
      if (s.goneAt < 0) s.goneAt = t + TOWN.repair.scaffoldGoneSteps;
      else if (t >= s.goneAt) {
        this.items.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.version++;
  }

  list(): readonly ScaffoldRect[] {
    return this.items;
  }

  /** 見せる 係へ: きえる とき ほこり（もう きえて いる 数は 数えない） */
  size(): number {
    return this.items.length;
  }
}
