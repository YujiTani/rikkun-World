import type { PlayerSettings } from '../player/config';
import type { CameraConfig } from '../camera/config';

export type SettingName = keyof PlayerSettings;
export type SettingValue = number | boolean;

/** `settings.get/set/all`（M1-02 §4.1）。プレイヤーの数値とカメラの数値を同じ名前で読み書きする */
export function createSettingsHook(player: PlayerSettings, camera: CameraConfig) {
  const names = (): SettingName[] => Object.keys(player) as SettingName[];
  const check = (name: string): SettingName => {
    if (!names().includes(name as SettingName)) throw new Error(`知らない設定: ${name}`);
    return name as SettingName;
  };
  return {
    get: (name: string): SettingValue => player[check(name)],
    set: (name: string, value: SettingValue): void => {
      const key = check(name);
      if (typeof value !== typeof player[key]) throw new Error(`設定 ${key} の型がちがう`);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`設定 ${key} は有限の数`);
      (player as unknown as Record<string, SettingValue>)[key] = value;
      // カメラ側にも同じ名前があれば合わせる
      if (key in camera) (camera as unknown as Record<string, SettingValue>)[key] = value;
    },
    all: (): Record<SettingName, SettingValue> => ({ ...player }),
  };
}
