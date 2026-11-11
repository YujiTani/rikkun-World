// HOUSE-2A（3.3 版）: レシピの まきものを 使う・ほって 手に 入れる 口（ほる係の m4 `scroll`）。持ち物を へらして おぼえる のは 家の 係（house.recipes）。
// 家は あとから 作る（wireHouse）ので、使う ときに 関数で 取る。1P・2P で 1 つずつ（who は 持ち主）。
import type { DigScrollPort } from '../../dig/digPorts';
import type { HouseSystem } from '../../house/system';

export function createScrollPort(house: () => HouseSystem | null | undefined, owner: 1 | 2): DigScrollPort {
  return {
    read: (who) => void house()?.recipes.read(who),
    dug: () => house()?.recipes.welcome(owner),
  };
}
