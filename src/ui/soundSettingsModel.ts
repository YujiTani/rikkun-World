/**
 * 音の設定の保存（localStorage `rikkun.audio.v1`）。DOM を使わない。
 * ?nosave=1 でも 音の設定はいつも保存する（世界の保存とは別。SOUND-1-contract §4）。
 */
import type { AudioSettings } from '../fx/audioConfig';
import { MIX } from '../fx/audioConfig';
import { FX_SETTINGS, type FxSettings } from '../fx/config';

export const AUDIO_STORAGE_KEY = 'rikkun.audio.v1';

/** localStorage と同じ形（テストでは偽物を渡す） */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const inRange = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

export interface AudioPersistence {
  /** 保存を読んで設定に入れる（こわれた値・範囲外は はじめの値） */
  load(): void;
  /** いまの設定を書く */
  save(): void;
  /** 前に書いた物とちがうときだけ書く（毎ステップ呼んでよい。settings.set で変えた分も残る） */
  sync(): void;
}

export function createAudioPersistence(storage: KeyValueStorage | null, audio: AudioSettings, fx: Pick<FxSettings, 'fxVolume'>): AudioPersistence {
  let last = '';
  const snapshot = (): string => JSON.stringify({ master: audio.masterVolume, bgm: audio.bgmVolume, fx: fx.fxVolume, muted: audio.audioMuted });
  const write = (): void => {
    const s = snapshot();
    last = s;
    try {
      storage?.setItem(AUDIO_STORAGE_KEY, s);
    } catch {
      // 書けなくても遊べる
    }
  };
  return {
    load() {
      audio.masterVolume = MIX.masterDefault;
      audio.bgmVolume = MIX.bgmDefault;
      audio.audioMuted = false;
      fx.fxVolume = FX_SETTINGS.fxVolume;
      try {
        const raw = storage?.getItem(AUDIO_STORAGE_KEY);
        if (raw) {
          const o: unknown = JSON.parse(raw);
          if (typeof o === 'object' && o !== null && !Array.isArray(o)) {
            const r = o as Record<string, unknown>;
            if (inRange(r.master)) audio.masterVolume = r.master;
            if (inRange(r.bgm)) audio.bgmVolume = r.bgm;
            if (inRange(r.fx)) fx.fxVolume = r.fx;
            if (typeof r.muted === 'boolean') audio.audioMuted = r.muted;
          }
        }
      } catch {
        // こわれた保存は はじめの値
      }
      last = snapshot();
    },
    save: write,
    sync() {
      if (snapshot() !== last) write();
    },
  };
}
