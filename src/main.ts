// rikkun-World の 起動。上から 順に 実行される 1 本の流れを、係ごとの 関数（src/game/wire/*.ts）に 分けて、同じ 順に 呼ぶ。
// 作る順・登録する順・乱数を 呼ぶ 順は 元の main.ts と 同じ。前の 段で 作った 物は w に たまっていく。
import { loadIconAtlas } from './ui/iconAtlas';
import { wireBoot, wireRender } from './game/wire/world';
import { wireInput, wirePlayer } from './game/wire/player';
import { wireInventory, wireDrops } from './game/wire/inventory';
import { wireWeapons, wireFighters } from './game/wire/combat';
import { wireYokai, wireAnimalView } from './game/wire/creatures';
import { wireHouse } from './game/wire/house';
import { wireHud, wireWeaponFx, wireAchievements } from './game/wire/ui';
import { wireSave, wireFrame, wireLoop } from './game/wire/save';
import { createStep } from './game/step';
import { installGameHook } from './debug/installTestHook';
import { wireGasha } from './game/wire/gasha';
import { wireDuo } from './game/wire/duo';
import { wireMine } from './game/wire/mine';
import { installDrift, wantsDrift } from './game/wire/drift';
import { buildMagmaDemo, wantsMagmaDemo } from './debug/magmaDemo';

await loadIconAtlas().catch(() => undefined); // ICON-32: 32×32 の アイコン（失敗しても 16×16 で 動く）
const w1 = await wireBoot();
const w2 = Object.assign(w1, wireRender(w1));
const w3 = Object.assign(w2, wireInput(w2));
const w4 = Object.assign(w3, wirePlayer(w3));
const w5 = Object.assign(w4, wireInventory(w4));
const w6 = Object.assign(w5, wireDrops(w5));
const w7 = Object.assign(w6, wireWeapons(w6));
const w8 = Object.assign(w7, wireFighters(w7));
const w9 = Object.assign(w8, wireYokai(w8));
const w10 = Object.assign(w9, wireHouse(w9)); // 建築士さん（HOUSE-1A）
const w11 = Object.assign(w10, wireAnimalView(w10));
const w12 = Object.assign(w11, wireHud(w11));
const w13 = Object.assign(w12, wireWeaponFx(w12));
const w14 = Object.assign(w13, wireAchievements(w13));
const w15 = Object.assign(w14, wireSave(w14));
const w16 = Object.assign(w15, wireFrame(w15));
const { game } = w16;
game.onUpdate(createStep(w16));
const w17 = Object.assign(w16, wireLoop(w16));
const w18 = Object.assign(w17, wireDuo(w17)); // 2 人で あそぶ（COOP-1。2 本目の ＋ で 2P が 参加する。?duo=dev は E2E 用）
const w19 = Object.assign(w18, wireMine(w18)); // 坑道の 宝箱（MINE-1C）
installGameHook(w19);
wireGasha(w19);
// ゆきやまの 雪・もみじやまの 紅葉の 舞い（既定で 出す。?drift=0 で 出さない）
if (wantsDrift(location.search)) installDrift(w19);
// MAGMA-SPAWN: ?demo=magma の ときだけ、はじめの 場所の 前に マグマの 見本を 1 回 置く（列が 読みこまれた ステップで）
if (wantsMagmaDemo(location.search)) {
  let done = false;
  w19.game.onUpdate(() => {
    if (!done) done = buildMagmaDemo(w19.world, w19.water, w19.spawnPlain());
  });
}
