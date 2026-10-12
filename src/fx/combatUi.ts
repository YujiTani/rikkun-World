import type { DayPhase } from '../contracts';
import { Clock } from '../ui/clock';
import { DamageEdge } from '../ui/damageEdge';
import { DeathScreen } from '../ui/deathScreen';
import { Hearts } from '../ui/hearts';
import { HomeNotice } from '../ui/homeNotice';

export interface CombatUi {
  hearts: Hearts;
  deathScreen: DeathScreen;
  homeNotice: HomeNotice;
  edge: DamageEdge;
  clock: Clock & { set(phase: DayPhase): void };
}

/** M3 の画面の部品（ハート・やられた画面・おうちに もどったよ・ふちのピンク・時計）を #hud に作る */
export function createCombatUi(hud: HTMLElement): CombatUi {
  return {
    edge: new DamageEdge(hud),
    hearts: new Hearts(hud),
    deathScreen: new DeathScreen(hud),
    homeNotice: new HomeNotice(hud),
    clock: new Clock(hud),
  };
}
