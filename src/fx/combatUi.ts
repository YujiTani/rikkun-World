import type { DayPhase } from '../contracts';
import { Clock } from '../ui/clock';
import type { ClockPhases } from '../ui/clockModel';
import { DamageEdge } from '../ui/damageEdge';
import { DeathScreen } from '../ui/deathScreen';
import { Hearts } from '../ui/hearts';
import { HomeNotice } from '../ui/homeNotice';
import { InkDim } from '../ui/inkDim';

export interface CombatUi {
  hearts: Hearts;
  deathScreen: DeathScreen;
  homeNotice: HomeNotice;
  edge: DamageEdge;
  /** TAKO-1: すみの けむりの 中で 画面が 少し 暗くなる 板 */
  inkDim: InkDim;
  clock: Clock & { set(phase: DayPhase): void };
}

/** M3 の画面の部品（ハート・やられた画面・おうちに もどったよ・ふちのピンク・時計）を #hud に作る */
export function createCombatUi(hud: HTMLElement, clockPhases?: ClockPhases): CombatUi {
  return {
    edge: new DamageEdge(hud),
    inkDim: new InkDim(hud),
    hearts: new Hearts(hud),
    deathScreen: new DeathScreen(hud),
    homeNotice: new HomeNotice(hud),
    clock: new Clock(hud, clockPhases),
  };
}
