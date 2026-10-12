import type { YokaiBase } from './common';
import { Chochin } from './models/chochin';
import { Karakasa } from './models/karakasa';
import { Nurikabe } from './models/nurikabe';
import { Rokurokubi } from './models/rokurokubi';

export * from './common';
export * from './stats';
export { COURSE, courseState } from './models/karakasa';
export type { CourseState } from './models/karakasa';
export { FIREBALL_BOX, FIREBALL_RANGE, FIREBALL_SPEED, Fireball } from './models/chochin';
export { Chochin, Karakasa, Nurikabe, Rokurokubi };

/** 見本ページでの並び順 */
export const YOKAI_ORDER = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'] as const;
export type YokaiId = (typeof YOKAI_ORDER)[number];

export function createYokai(id: YokaiId): YokaiBase {
  switch (id) {
    case 'karakasa':
      return new Karakasa();
    case 'chochin':
      return new Chochin();
    case 'nurikabe':
      return new Nurikabe();
    case 'rokurokubi':
      return new Rokurokubi();
  }
}
