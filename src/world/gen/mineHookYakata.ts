import type { SaveBlockOverride } from '../../save/saveOverride';
import { YAKATA_TABLE } from './mineYakataConfig';
import { yakataHit, yakataLook } from './mineYakataRoll';
import type { ChestPorts, ChestWorld } from './mineHookShaft';
import type { ShaftWorld } from './mineShafts';
import { foesOf, yakataPlanIn, type YakataPlan } from './mineYakataPlan';
import type { YakataPorts } from './mineYakataPorts';
import { createYakataRun, type YakataStateInfo } from './mineYakataRun';
import type { Foe } from './mineYakataTypes';
import { regionOfShaftId } from './mineYakataRoll';

/**
 * 窓口 `__rikkun.mine` の 1F の 足し（MINE-1F §6.1）: 表・くじ・7 ひき・挑戦の 係・保存の 置きかえ。
 */

export interface YakataRoll {
  shaft: string;
  hit: boolean;
  placed: boolean;
  look: 'maou' | 'otera' | null;
}

export interface YakataHookOptions {
  seed: number;
  world?: ChestWorld;
  chest?: ChestPorts;
  yakata?: YakataPorts;
}

export function createYakataHook(o: YakataHookOptions, shafts: () => ShaftWorld) {
  const planOf = (id: string): YakataPlan | null => yakataPlanIn(shafts(), o.seed, id);
  const run = createYakataRun({
    world: o.world,
    chest: o.chest,
    ports: o.yakata,
    planAtChest: (x, y, z) => {
      const b = shafts().yakataBuilt(x, y, z);
      return b && b.yakata.chest.cells.some((p) => p.x === x && p.y === y && p.z === z) ? planOf(b.yakata.id) : null;
    },
    builtReady: (x, y, z) => shafts().yakataReady(x, y, z),
    builtAt: (x, y, z) => shafts().yakataBuilt(x, y, z),
  });
  return {
    yakataTable: () => structuredClone(YAKATA_TABLE),
    yakataRolls(x0: number, z0: number, x1: number, z1: number): YakataRoll[] {
      const out: YakataRoll[] = [];
      for (const s of shafts().shafts(x0, z0, x1, z1)) {
        const r = regionOfShaftId(s.id);
        if (!r || s.gen !== 'e' || s.style?.depth !== 'fukai') continue;
        const hit = yakataHit(o.seed, r.rx, r.rz);
        out.push({ shaft: s.id, hit, placed: hit && !!s.yakata, look: hit ? yakataLook(o.seed, r.rx, r.rz) : null });
      }
      return out;
    },
    yakataFoes(id: string): Foe[] {
      const y = shafts().yakataOfShaft(id)?.yakata;
      return y ? foesOf(o.seed, y) : [];
    },
    yakataState(id: string): YakataStateInfo {
      return run.state(id, shafts().yakataOfShaft(id)?.yakata ?? null);
    },
    yakataPlanFor: (id: string, opt?: Parameters<typeof yakataPlanIn>[3]): YakataPlan | null => yakataPlanIn(shafts(), o.seed, id, opt),
    yakataStep: (): void => run.step(),
    yakataLocked: (x: number, y: number, z: number): boolean => run.locked(Math.floor(x), Math.floor(y), Math.floor(z)),
    yakataSaveOverrides: (): SaveBlockOverride[] => run.saveOverrides(),
    /** やかたの 宝箱なら 挑戦の 係が あつかう〔true〕 */
    yakataOpen: (x: number, y: number, z: number, who: 1 | 2 = 1): boolean => run.open(Math.floor(x), Math.floor(y), Math.floor(z), who),
  };
}
