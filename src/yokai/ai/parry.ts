import { bearingOf } from '../../combat/parry';
import type { Vec3 } from '../../contracts';
import type { YokaiField } from './entity';
import type { YokaiParryPort, YokaiParryVerdict } from './managerTypes';

/** パリィに 聞く。パリィの 窓口が なければ null（今のまま） */
export function askParry(
  port: YokaiParryPort | undefined,
  f: YokaiField,
  by: 'attack' | 'fireball',
  yokaiId: number | null,
  from: Vec3,
  amount: number,
): YokaiParryVerdict | null {
  if (!port || f.who === 2) return null; // パリィは 1P だけ（2P は 段階 2）
  const dirDeg = bearingOf({ x: f.px, y: f.py, z: f.pz }, from);
  return port.hit({ by, yokaiId, dirDeg, amount });
}
