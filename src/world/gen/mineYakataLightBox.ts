import type { YakataLightBox } from '../light/yakataLight';
import { YAKATA_TABLE as T } from './mineYakataConfig';
import type { Yakata } from './mineYakataTypes';

/** 光の 見え方に わたす やかたの 箱〔世界の 座標。両はし ふくむ〕: 大広間と あやしい 横穴の 2 つ。数は 表から */
export function yakataLightBoxes(y: Yakata): YakataLightBox[] {
  const xs = y.passage.map((p) => p.x);
  const zs = y.passage.map((p) => p.z);
  const half = Math.floor(T.passage.width / 2);
  const py = y.passage[0]!.y;
  return [
    { x0: y.hall.x0, y0: y.hall.y, z0: y.hall.z0, x1: y.hall.x1, y1: y.hall.y + T.hall.height - 1, z1: y.hall.z1, look: y.look },
    { x0: Math.min(...xs) - half, y0: py, z0: Math.min(...zs) - half, x1: Math.max(...xs) + half, y1: py + T.passage.height - 1, z1: Math.max(...zs) + half, look: y.look },
  ];
}
