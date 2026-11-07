import type { AnimalEvent, CraftEvent, DigEvent, FarmEvent, StorageEvent } from '../contracts';
import { CROP_KINDS } from '../contracts';
import { MINE_ITEM } from '../content/items/ids';
import { baseRecipeId } from '../craft/recipes';
import { isChalkMarkId } from '../world/blocks/chalkMark';
import type { CaveKind } from '../world/gen/mineCaveConfig';
import { ARMOR_RECIPES, CRAFT_RECIPE_NAMES, KIN_RECIPES, PICKAXE_RECIPES, WEAPON_RECIPES, type MineAreaKind } from './defs';

/** 出来事から記録をふやすために AchievementSystem が見せる口（記録の数え方だけ） */
export interface StatSink {
  bump(key: string, n: number): void;
  setMax(key: string, v: number): void;
  stat(key: string): number;
}

/** たね の ありか 4 つ（ふるい たんす・やせい・くさ・ようかい） */
function derivedFind(s: StatSink): void {
  const n = [s.stat('seedFrom:oldfarm'), s.stat('wild:*'), s.stat('seedFrom:grass'), s.stat('seedFrom:yokai')].filter((v) => v > 0).length;
  s.setMax('seedFrom:all', n);
}

/** 農業の出来事（M7 §4.7）を記録にする */
export function applyFarmEvents(s: StatSink, events: readonly FarmEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'till':
        s.bump('till', 1);
        break;
      case 'plant':
        s.bump(`plant:${e.kind}`, 1);
        s.bump('plant:*', 1);
        break;
      case 'harvest':
        s.bump(`harvest:${e.kind}`, 1);
        s.bump('harvest:*', 1);
        if (e.wet) s.bump('harvestWet', 1);
        // M7-2: ごきげん の 作物（A が `happy` を 入れる。契約 の 型に 無い 間 は 読み取り だけ）
        if (e.happy) s.bump('harvestPet', 1);
        s.setMax('harvest:kinds', CROP_KINDS.filter((k) => s.stat(`harvest:${k}`) > 0).length);
        break;
      case 'wild':
        s.bump(`wild:${e.kind}`, 1);
        s.bump('wild:*', 1);
        s.setMax('wild:kinds', CROP_KINDS.filter((k) => s.stat(`wild:${k}`) > 0).length);
        derivedFind(s);
        break;
      case 'eat':
        s.bump(`eat:${e.item}`, 1);
        // LIVE-1 §4.5: `eat:*` は やさい だけ（たまご では ふやさない）。LIVE-3: やいた もも にく も ふやさない
        if (e.item !== 'egg' && e.item !== 'momo_yaki' && e.item !== MINE_ITEM.kabita_pan) s.bump('eat:*', 1); // MINE-1E: かびた パンも やさいでは ない
        break;
      case 'seedFound':
        s.bump(`seedFrom:${e.from}`, 1);
        derivedFind(s);
        break;
      case 'visitOldFarm':
        s.bump('visit:oldfarm', 1);
        break;
      case 'pour':
        // はたけ 0 の まく は 数えない
        if (e.tiles > 0) s.bump('water:*', 1);
        break;
      case 'bucketPlace':
        s.bump('bucketPlace', 1);
        break;
      case 'ripened':
        s.bump('ishibai', 1); // MINE-1B: 自然に みのった 'stage' は 数えない
        break;
      case 'pet':
        // ごきげん に した 回数（'again'・'wild' は 数えない）
        if (e.result === 'happy') s.bump('pet:*', 1);
        break;
      default:
        break;
    }
  }
}

/**
 * LIVE-1 畜産の出来事（§4.5）を記録にする。
 * feed = やさい を たべた、friend = なかま に なった、pet = なかま を なでた（やせい は 数えない）、egg = たまご を おとした
 */
export function applyAnimalEvents(s: StatSink, events: readonly AnimalEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'feed':
        s.bump('feed:chicken', 1);
        s.bump('feed:*', 1);
        break;
      case 'friend':
        s.bump('friend:chicken', 1);
        s.bump('friend:*', 1);
        break;
      case 'pet':
        if (e.friend) {
          s.bump('petAnimal:chicken', 1);
          s.bump('petAnimal:*', 1);
        }
        break;
      case 'egg':
        s.bump('egg:chicken', 1);
        s.bump('egg:*', 1);
        break;
      // 版 3.2: 持ち物 に 入った か 足もと に おちた むし の 数 / だっこ した 回数
      case 'bugCatch':
        s.bump('bug:*', 1);
        break;
      case 'carry':
        s.bump('carry:chicken', 1);
        s.bump('carry:*', 1);
        break;
      // LIVE-2（§4.5）: かえった（マッチョ は 別の 記録）・小屋 の 子 に なった・大人 に なった・金 の たまご
      case 'hatch':
        s.bump('hatch:chicken', 1);
        s.bump('hatch:*', 1);
        if (e.breed === 'macho') s.bump('hatch:macho', 1);
        break;
      case 'home':
        s.bump('home:chicken', 1);
        s.bump('home:*', 1);
        break;
      case 'grow':
        s.bump('grow:chicken', 1);
        s.bump('grow:*', 1);
        break;
      // LIVE-3（§4.4）: いただいた 数 を 数える だけ（実績 は 作らない。命 を ごほうび に しない）
      case 'meat':
        s.bump('meat:chicken', 1);
        s.bump('meat:*', 1);
        break;
      // LIVE-4（§2.4・§4.5）: マッチョ の パンチ で たおした（2 回目 から も 数える。実績 は はじめて だけ）
      case 'machoKO':
        s.bump('machoKO:*', 1);
        break;
      default:
        break;
    }
    if (e.type === 'egg' && e.gold) {
      s.bump('goldenEgg:chicken', 1);
      s.bump('goldenEgg:*', 1);
    }
  }
}

/** 掘る・置くの 出来事（チョークの しるしは 数えない） */
export function applyDigEvents(s: StatSink, events: readonly DigEvent[]): void {
  for (const e of events) {
    if (isChalkMarkId(e.id)) continue; // MINE-1B: チョークの しるしは ブロックを おいた・こわした 数に 入れない
    if (e.type === 'break') {
      s.bump(`break:${e.id}`, 1);
      s.bump('break:*', 1);
    } else if (e.type === 'place') {
      s.bump(`place:${e.id}`, 1);
      s.bump('place:*', 1);
      // LIVE-2: 小屋 を 置く と DigSystem が さく の ブロック で 出す。ブロック 1 こ ではなく toriya を 1 回 置いた 数
      if (e.id === 'toriya_fence') s.bump('place:toriya', 1);
    }
  }
}

/** 作る・やく・ひろう の 出来事 */
export function applyCraftEvents(s: StatSink, events: readonly CraftEvent[]): void {
  for (const e of events) {
    if (e.type === 'craft') {
      s.bump(`craft:${baseRecipeId(e.recipe)}`, 1);
      s.bump('craft:*', 1);
      if (e.recipe === 'ya') s.bump('craftItems:ya', e.count);
      derivedCraft(s);
    } else if (e.type === 'bakeDone') {
      s.bump(`bake:${e.recipe}`, 1);
      s.bump('bake:*', 1);
    } else if (e.type === 'pickup') {
      s.bump(`obtain:${e.item}`, e.count);
      s.bump('pickup:*', e.count);
    }
  }
}

/** 作った 種類から 決まる 記録（つるはし・武器・防具・金・ぜんぶ） */
function derivedCraft(s: StatSink): void {
  const count = (ids: readonly string[]): number => ids.filter((r) => s.stat(`craft:${r}`) > 0).length;
  s.setMax('craft:pickaxes', count(PICKAXE_RECIPES));
  s.setMax('craft:weapons', count(WEAPON_RECIPES));
  s.setMax('craft:armors', count(ARMOR_RECIPES));
  s.setMax('craft:kinKinds', count(KIN_RECIPES));
  s.setMax('craft:everything', count(CRAFT_RECIPE_NAMES.map(([id]) => id)));
}

/** たんすの 出来事 */
export function applyStorageEvents(s: StatSink, events: readonly StorageEvent[]): void {
  for (const e of events) {
    if (e.type === 'drop') s.bump('drop:*', e.count);
    else if (e.type === 'store') s.bump('store:*', e.count);
    else s.bump('storeFull', 1);
  }
}

/** WEAPON-2: たいきゅうの 出来事（こわれた: マス番号 = 道具、部位 = 防具） */
export function applyWearEvents(s: StatSink, events: ReadonlyArray<{ type: 'wearLow' | 'toolBreak'; slot: number | string }>): void {
  for (const e of events) {
    if (e.type !== 'toolBreak') continue;
    s.bump(typeof e.slot === 'number' ? 'toolBroken' : 'armorBroken', 1);
  }
}

/** 坑道の 出来事（実績へ）。bottom = いちばん 下の へや、chestOpen = 宝箱、cave = ほらあなの 部屋、area = 坑道の 場所 */
export type MineAchEvent =
  | { type: 'bottom' | 'chestOpen'; tick: number; tier?: number }
  | { type: 'cave'; tick: number; kind: CaveKind }
  | { type: 'area'; tick: number; kind: MineAreaKind };

/** 坑道の 出来事を 記録にする（どれも 1 回で 足りる = 最大 1） */
export function applyMineEvents(s: StatSink, events: readonly MineAchEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'cave':
        s.setMax(`cave:${e.kind}`, 1);
        break;
      case 'area':
        s.setMax(`area:${e.kind}`, 1);
        break;
      case 'bottom':
        s.setMax('mineBottom', 1);
        break;
      case 'chestOpen':
        s.setMax('mineChest', 1);
        break;
      default: {
        const never: never = e;
        return never;
      }
    }
  }
}
