import type { Vec3 } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';

/**
 * 黒龍の 墨の すじ（LEGEND-4 §3.5・§3.7）の 決まり。見た目だけ（当たりには かかわらない）。three なし。
 * すじ = 矢が 通った 一直線の うち 最近 `trailSteps` ステップに 通った 所（先は 矢の 今の 場所。うしろは 速さ × 時間）。
 * 矢が 消えて（ささる・つらぬき おわる・きょりで 消える）からも `trailSteps` ステップの あいだ のこって、うしろから 先へ 縮みながら 消える。
 * 同時に 出る のは `trailMax` 本まで（古い 物から 消す）。「動きを へらす」では のこさない（矢が 消えたら すぐ 消える）。毎ステップ new しない。
 */
const T = LEGEND4_TUNING.kokuryu;
const DT = 1 / 60;
/** さいごの この ステップ数で すうっと うすく なる */
export const INK_FADE_STEPS = 10;

/** 窓口（`step` の 入力）: 飛んで いる 矢の 見た目に 要る 項目だけ */
export interface InkArrowIn {
  id: number;
  position: Vec3;
  velocity: Vec3;
  /** まっすぐな 矢（黒龍）だけ すじが 出る */
  straight?: boolean;
}

/** 1 本の すじの 今の 形（毎ステップ 書きかわる。読むだけ） */
export interface InkTrail {
  id: number;
  /** うしろの はし（古い 方） */
  tail: Vec3;
  /** 先（矢の 今の 場所。消えた あとは 最後の 場所） */
  head: Vec3;
  /** 向き（長さ 1） */
  dir: Vec3;
  /** 長さ（マス） */
  length: number;
  /** 0〜1 */
  opacity: number;
  /** 矢が 消えてから の ステップ（まだ 飛んで いる 間は -1） */
  ended: number;
}

interface Entry extends InkTrail {
  start: Vec3;
  speed: number;
  born: number;
}

export interface InkModel {
  step(arrows: readonly InkArrowIn[], reduced: boolean): readonly InkTrail[];
  list(): readonly InkTrail[];
}

const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export function createInkModel(max: number = T.trailMax, steps: number = T.trailSteps): InkModel {
  const entries: Entry[] = [];
  const view: InkTrail[] = [];
  const seen = new Set<number>();
  let clock = 0;

  function refresh(e: Entry): void {
    const traveled = Math.hypot(e.head.x - e.start.x, e.head.y - e.start.y, e.head.z - e.start.z);
    const live = e.ended < 0 ? steps : steps - e.ended;
    e.length = Math.max(0, Math.min(traveled, e.speed * DT * live));
    e.tail.x = e.head.x - e.dir.x * e.length;
    e.tail.y = e.head.y - e.dir.y * e.length;
    e.tail.z = e.head.z - e.dir.z * e.length;
    e.opacity = e.ended < 0 ? 1 : Math.max(0, Math.min(1, (steps - e.ended) / INK_FADE_STEPS));
  }

  return {
    step(arrows, reduced) {
      clock++;
      seen.clear(); // 本数は 3 本まで の 小さな 数。使いまわす
      for (const a of arrows) {
        if (a.straight !== true) continue;
        seen.add(a.id);
        let e = entries.find((x) => x.id === a.id);
        if (!e) {
          if (entries.length >= max) {
            // 古い 物から 消す
            let oldest = 0;
            for (let i = 1; i < entries.length; i++) if (entries[i]!.born < entries[oldest]!.born) oldest = i;
            entries.splice(oldest, 1);
          }
          e = { id: a.id, tail: v3(), head: v3(), dir: v3(), length: 0, opacity: 1, ended: -1, start: { ...a.position }, speed: 0, born: clock };
          entries.push(e);
        }
        const sp = Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) || 1;
        e.dir.x = a.velocity.x / sp;
        e.dir.y = a.velocity.y / sp;
        e.dir.z = a.velocity.z / sp;
        e.speed = sp;
        e.head.x = a.position.x;
        e.head.y = a.position.y;
        e.head.z = a.position.z;
        e.ended = -1;
        refresh(e);
      }
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i]!;
        if (seen.has(e.id)) continue;
        e.ended += 1;
        if (reduced || e.ended >= steps) {
          entries.splice(i, 1);
          continue;
        }
        refresh(e);
      }
      view.length = 0;
      for (const e of entries) view.push(e);
      return view;
    },
    list: () => view,
  };
}
