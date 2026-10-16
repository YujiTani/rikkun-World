import { describe, expect, it } from 'vitest';
import { createAudioSettings } from '../fx/audioConfig';
import { FX_SETTINGS } from '../fx/config';
import { AUDIO_STORAGE_KEY, createAudioPersistence, type KeyValueStorage } from './soundSettingsModel';

function memory(init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}
const fx = () => ({ ...FX_SETTINGS });

describe('B7 保存', () => {
  it('キーは rikkun.audio.v1', () => {
    expect(AUDIO_STORAGE_KEY).toBe('rikkun.audio.v1');
  });

  it('3 つの音量とミュートを書き、次に読む', () => {
    const st = memory();
    const a = createAudioSettings();
    const f = fx();
    const p = createAudioPersistence(st, a, f);
    a.masterVolume = 0.3;
    a.bgmVolume = 0.2;
    a.audioMuted = true;
    f.fxVolume = 0.9;
    p.save();
    expect(JSON.parse(st.data[AUDIO_STORAGE_KEY])).toEqual({ master: 0.3, bgm: 0.2, fx: 0.9, muted: true });

    const a2 = createAudioSettings();
    const f2 = fx();
    createAudioPersistence(st, a2, f2).load();
    expect([a2.masterVolume, a2.bgmVolume, f2.fxVolume, a2.audioMuted]).toEqual([0.3, 0.2, 0.9, true]);
  });

  it('保存が無ければ はじめの値のまま（0.6・0.4・今の fxVolume・ミュートなし）', () => {
    const a = createAudioSettings();
    const f = fx();
    createAudioPersistence(memory(), a, f).load();
    expect([a.masterVolume, a.bgmVolume, f.fxVolume, a.audioMuted]).toEqual([0.6, 0.4, FX_SETTINGS.fxVolume, false]);
  });

  it('こわれた値・範囲外は はじめの値', () => {
    const cases: string[] = [
      'これはJSONではない',
      'null',
      '[1,2]',
      '{"master":"x","bgm":null,"fx":{},"muted":"yes"}',
      '{"master":-1,"bgm":2,"fx":1.5,"muted":1}',
      '{"master":NaN}',
      '{"master":1e999,"bgm":-1e999}',
    ];
    for (const raw of cases) {
      const a = createAudioSettings();
      const f = fx();
      createAudioPersistence(memory({ [AUDIO_STORAGE_KEY]: raw }), a, f).load();
      expect([a.masterVolume, a.bgmVolume, f.fxVolume, a.audioMuted], raw).toEqual([0.6, 0.4, FX_SETTINGS.fxVolume, false]);
    }
  });

  it('一部だけ こわれていたら、こわれた所だけ はじめの値', () => {
    const a = createAudioSettings();
    const f = fx();
    createAudioPersistence(memory({ [AUDIO_STORAGE_KEY]: '{"master":0.8,"bgm":7,"fx":0.1,"muted":true}' }), a, f).load();
    expect([a.masterVolume, a.bgmVolume, f.fxVolume, a.audioMuted]).toEqual([0.8, 0.4, 0.1, true]);
  });

  it('保存先が使えなくても こわれない', () => {
    const bad: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const p = createAudioPersistence(bad, createAudioSettings(), fx());
    expect(() => p.load()).not.toThrow();
    expect(() => p.save()).not.toThrow();
    expect(() => p.sync()).not.toThrow();
    const none = createAudioPersistence(null, createAudioSettings(), fx());
    expect(() => {
      none.load();
      none.save();
      none.sync();
    }).not.toThrow();
  });

  it('sync(): 変わったときだけ書く（settings.set で変えても残る）', () => {
    const st = memory();
    let writes = 0;
    const counting: KeyValueStorage = { getItem: st.getItem, setItem: (k, v) => (writes++, st.setItem(k, v)) };
    const a = createAudioSettings();
    const f = fx();
    const p = createAudioPersistence(counting, a, f);
    p.load();
    p.sync();
    const w0 = writes;
    for (let i = 0; i < 50; i++) p.sync();
    expect(writes).toBe(w0);
    a.audioMuted = true;
    p.sync();
    expect(writes).toBe(w0 + 1);
    expect(JSON.parse(st.data[AUDIO_STORAGE_KEY]).muted).toBe(true);
    p.sync();
    expect(writes).toBe(w0 + 1);
  });
});
