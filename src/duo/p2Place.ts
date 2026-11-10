// COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ⑤・AC151）: 場所の 実績（ダンジョンの いちばん 下・ほらあな・かくしべや など）と 国の 見はりを 人ごとに。
// `game/wire/save.ts` が 1P 用と 2P 用に 1 つずつ 作って 毎ステップ step を 呼ぶ。どちらかが 入ったら 実績・出来事が 出る（種類ごとに 1 回は 実績の 側が 1 回に する）。
import type { CountryWatch } from '../achievements/countryWatch';
import type { MineAchEvent } from '../achievements/feedStats';
import type { Vec3 } from '../contracts';
import type { MineAreaKind } from '../achievements/defs';
import type { CaveKind } from '../world/gen/mineCaveConfig';

/** 足が 床から 少し 上に ういている ぶん（マス）。判定には 足もとの y に この ぶんを 足して わたす */
const FOOT_LIFT = 0.1;

export interface PlaceWatch {
  /** 毎ステップ。pos は 足もと。倒れて いる（down）あいだは 場所に「いない」と 見て、国の 見はりにも 0 歩を わたす */
  step(pos: Vec3, down: boolean, screenSteps: number): void;
  /** セーブを 読んだ とき: 「入っている」記憶と 国の 見はりを 消す */
  reset(): void;
}

export function createPlaceWatch(d: {
  country: Pick<CountryWatch, 'step' | 'reset'>;
  /** 足が いちばん 下の へやに いるか。高さの ふるい込みは ここで 足の y（y - 0.1）で 見る */
  bottom(x: number, y: number, z: number): boolean;
  cave(x: number, y: number, z: number): CaveKind | null;
  area(x: number, y: number, z: number): MineAreaKind | null;
  feedMine(events: MineAchEvent[]): void;
  tick(): number;
}): PlaceWatch {
  let wasInBottom = false;
  let wasCave: CaveKind | null = null;
  let wasArea: MineAreaKind | null = null;
  return {
    step(pos, down, screenSteps) {
      d.country.step(pos, down ? 0 : screenSteps);
      const y = pos.y + FOOT_LIFT;
      const bottom = !down && d.bottom(pos.x, y, pos.z);
      if (bottom && !wasInBottom) d.feedMine([{ type: 'bottom', tick: d.tick() }]);
      wasInBottom = bottom;
      const cave = down ? null : d.cave(pos.x, y, pos.z);
      if (cave !== null && cave !== wasCave) d.feedMine([{ type: 'cave', tick: d.tick(), kind: cave }]);
      wasCave = cave;
      const area = down ? null : d.area(pos.x, y, pos.z);
      if (area !== null && area !== wasArea) d.feedMine([{ type: 'area', tick: d.tick(), kind: area }]);
      wasArea = area;
    },
    reset() {
      wasInBottom = false;
      wasCave = null;
      wasArea = null;
      d.country.reset();
    },
  };
}
