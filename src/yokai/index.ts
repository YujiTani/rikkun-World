import type { YokaiKind } from '../contracts';
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

/** 見本ページでの並び順（種類は content/yokai/ids.ts の 1 か所。全種類が 1 回ずつ 入っているかは content/yokai/registry.test.ts が 見張る） */
export const YOKAI_ORDER = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'] as const satisfies readonly YokaiKind[];
/** YokaiKind の 別名 */
export type YokaiId = YokaiKind;

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
    default: {
      const unreachable: never = id;
      throw new Error(`createYokai: 知らない妖怪 ${String(unreachable)}`);
    }
  }
}

export { YokaiManager } from './ai/YokaiManager';
export type { HookYokaiEvent, SpawnOptions, YokaiManagerOptions } from './ai/YokaiManager';
export { createYokaiConfig, YOKAI_DROPS, KIND_AI, AI_CONST } from './ai/config';
export type { YokaiConfig, DropRow } from './ai/config';
export { createYokaiHook } from './hook';
