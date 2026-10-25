// rikkun-World の 起動。上から 順に 実行される 1 本の流れを、係ごとの 関数（src/game/wire/*.ts）に 分けて、同じ 順に 呼ぶ。
// 作る順・登録する順・乱数を 呼ぶ 順は 元の main.ts と 同じ。前の 段で 作った 物は w に たまっていく。
import { wireBoot, wireRender } from './game/wire/world';
import { wireInput, wirePlayer } from './game/wire/player';
import { wireInventory, wireDrops } from './game/wire/inventory';
import { wireWeapons, wireFighters } from './game/wire/combat';
import { wireYokai, wireAnimalView } from './game/wire/creatures';
import { wireHud, wireWeaponFx, wireAchievements } from './game/wire/ui';
import { wireSave, wireFrame, wireLoop } from './game/wire/save';
import { createStep } from './game/step';
import { installGameHook } from './debug/installTestHook';
import { wireGasha } from './game/wire/gasha';

const w1 = await wireBoot();
const w2 = Object.assign(w1, wireRender(w1));
const w3 = Object.assign(w2, wireInput(w2));
const w4 = Object.assign(w3, wirePlayer(w3));
const w5 = Object.assign(w4, wireInventory(w4));
const w6 = Object.assign(w5, wireDrops(w5));
const w7 = Object.assign(w6, wireWeapons(w6));
const w8 = Object.assign(w7, wireFighters(w7));
const w9 = Object.assign(w8, wireYokai(w8));
const w10 = Object.assign(w9, wireAnimalView(w9));
const w11 = Object.assign(w10, wireHud(w10));
const w12 = Object.assign(w11, wireWeaponFx(w11));
const w13 = Object.assign(w12, wireAchievements(w12));
const w14 = Object.assign(w13, wireSave(w13));
const w15 = Object.assign(w14, wireFrame(w14));
const { game } = w15;
game.onUpdate(createStep(w15));
const w16 = Object.assign(w15, wireLoop(w15));
installGameHook(w16);
wireGasha(w16);
