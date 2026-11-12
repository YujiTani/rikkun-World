import { AZUMAYA } from './azumaya';
import { HASHI } from './hashi';
import { ISHIDOUROU_CHU } from './ishidourouChu';
import { ISHIDOUROU_DAI } from './ishidourouDai';
import { ISHIDOUROU_SHO } from './ishidourouSho';
import { ODOU } from './odou';
import { TORII } from './torii';
import type { StructureShape } from './types';

/** 図で 書く 建物の 登録表（名前 → 形。並べるだけ。足すときは 1 ファイル 1 レコードを 作って ここに 1 行）。石段は 道に そって 置く 物なので ishidan.ts（図では ない） */
export const STRUCTURES = {
  torii: TORII,
  odou: ODOU,
  hashi: HASHI,
  azumaya: AZUMAYA,
  'ishidourou-dai': ISHIDOUROU_DAI,
  'ishidourou-chu': ISHIDOUROU_CHU,
  'ishidourou-sho': ISHIDOUROU_SHO,
} as const satisfies Record<string, StructureShape>;
