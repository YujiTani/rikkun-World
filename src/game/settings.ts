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
export function createSettingsHook(player: PlayerSettings, camera: CameraConfig, extras: Bag[] = []) {
  const bags: Bag[] = [player, ...extras];
  const find = (name: string): Record<string, SettingValue> => {
    for (const bag of bags) if (Object.prototype.hasOwnProperty.call(bag, name)) return bag as Record<string, SettingValue>;
    throw new Error(`知らない設定: ${name}`);
  };
  const names = (): string[] => bags.flatMap((b) => Object.keys(b));
  const copy = (v: SettingValue): SettingValue => (isRecord(v) ? { ...v } : v);
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
          if (typeof cur[k] === 'string') {
            if (typeof x !== 'string') throw new Error(`設定 ${name}.${k} は文字`);
          } else if (x !== null && !(typeof x === 'number' && Number.isFinite(x))) throw new Error(`設定 ${name}.${k} は有限の数か null`);
        }
        Object.assign(cur, value);
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
