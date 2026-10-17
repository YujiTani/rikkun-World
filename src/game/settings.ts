import { isRarity } from '../drops/rarityTable';
import type { PlayerSettings } from '../player/config';
import type { CameraConfig } from '../camera/config';

export type SettingName = string;
export type SettingValue = number | boolean | Record<string, number | string | null>;

/** 設定の入れ物（プレイヤー・ほる・画面・演出など）。名前は全体で重ならないこと */
type Bag = object;

const isRecord = (v: unknown): v is Record<string, number | string | null> => typeof v === 'object' && v !== null;

/**
 * `settings.get/set/all`（M1-02 §4.1, M2 §6.1）。プレイヤー・カメラ・ほる・画面・演出の数値を同じ名前で読み書きする。
 * hardness / harvestLevel のような Record は、まるごと読み書きできる（set は一部のキーだけでもよい）。
 */
const deepCopy = <T extends object>(v: T): T => structuredClone(v);

export function createSettingsHook(player: PlayerSettings, camera: CameraConfig, extras: Bag[] = []) {
  const bags: Bag[] = [player, ...extras];
  const find = (name: string): Record<string, SettingValue> => {
    for (const bag of bags) if (Object.prototype.hasOwnProperty.call(bag, name)) return bag as Record<string, SettingValue>;
    throw new Error(`知らない設定: ${name}`);
  };
  const names = (): string[] => bags.flatMap((b) => Object.keys(b));
  const copy = (v: SettingValue): SettingValue =>
    isRecord(v) ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'object' && x !== null ? deepCopy(x) : x])) as SettingValue) : v;
  return {
    get: (name: string): SettingValue => {
      const bag = find(name);
      return copy(bag[name]);
    },
    set: (name: string, value: SettingValue): void => {
      const bag = find(name);
      const cur = bag[name];
      if (isRecord(cur)) {
        if (!isRecord(value)) throw new Error(`設定 ${name} の型がちがう`);
        for (const k of Object.keys(value)) {
          if (!(k in cur)) throw new Error(`設定 ${name} に ${k} はない`);
          const x = value[k];
          // 入れ子（M7 の farmGrowDays など）: 中の数も 有限か しらべて、一段ふかく 合わせる
          if (typeof cur[k] === 'object' && cur[k] !== null) {
            if (!isRecord(x)) throw new Error(`設定 ${name}.${k} は入れ子`);
            const inner = cur[k] as unknown as Record<string, number>;
            for (const kk of Object.keys(x)) {
              const xx = x[kk] as unknown;
              if (!(kk in inner)) throw new Error(`設定 ${name}.${k} に ${kk} はない`);
              // CHAR-2: bladeAdvance の ticks・advance は 数の列
              if (Array.isArray(xx) && Array.isArray(inner[kk]) && xx.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
              if (typeof xx !== 'number' || !Number.isFinite(xx)) throw new Error(`設定 ${name}.${k}.${kk} は有限の数`);
            }
            continue;
          }
          if (typeof cur[k] === 'string') {
            if (typeof x !== 'string') throw new Error(`設定 ${name}.${k} は文字`);
            if ((name === 'rarity' || name === 'itemRarity') && !isRarity(x)) throw new Error(`設定 ${name}.${k} は めずらしさの id だけ`);
          } else if (x !== null && !(typeof x === 'number' && Number.isFinite(x))) throw new Error(`設定 ${name}.${k} は有限の数か null`);
        }
        for (const k of Object.keys(value)) {
          const c = cur[k] as unknown;
          if (typeof c === 'object' && c !== null) Object.assign(c, deepCopy(value[k] as unknown as object));
          else (cur as Record<string, unknown>)[k] = value[k];
        }
        return;
      }
      if (typeof value !== typeof cur) throw new Error(`設定 ${name} の型がちがう`);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`設定 ${name} は有限の数`);
      bag[name] = value;
      // カメラ側にも同じ名前があれば合わせる
      if (bag === (player as object) && name in camera) (camera as unknown as Record<string, SettingValue>)[name] = value;
    },
    all: (): Record<SettingName, SettingValue> => {
      const out: Record<string, SettingValue> = {};
      for (const n of names()) out[n] = copy(find(n)[n]);
      return out;
    },
  };
}
