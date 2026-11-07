import { bearingOf } from '../../combat/parry';
import type { Vec3 } from '../../contracts';
import type { YokaiField } from './entity';
import type { YokaiParryPort, YokaiParryVerdict } from './managerTypes';

/** パリィに 聞く（ねらっている 人 f.who の パリィ）。パリィの 窓口が なければ null（今のまま） */
export function askParry(
  port: YokaiParryPort | undefined,
  f: YokaiField,
  by: 'attack' | 'fireball',
  yokaiId: number | null,
  from: Vec3,
  amount: number,
): YokaiParryVerdict | null {
  if (!port) return null;
  const dirDeg = bearingOf({ x: f.px, y: f.py, z: f.pz }, from);
  return port.hit({ by, yokaiId, dirDeg, amount }, f.who); // COOP-1 4d-1: ねらっている 人の パリィに 聞く
}
