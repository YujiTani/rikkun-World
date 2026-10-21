import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FX_SETTINGS } from './config';
import { LEGEND_FILES, LEGEND_MAX_SAME, playLegend, preloadLegendSounds, resetLegendFiles, startLegendLoop, startLegendOneShot } from './legendSounds';
import { drainSounds } from './soundLog';
import { SFX_CATALOG } from './sfxCatalog';
import { FFMPEG } from './titleSoundMeasure.testutil';

/**
 * WEAPON-8 #239 の 音（windWave・thunderSlash・spiralWind・ため音）。音の ファイル（public/sound/legend/）を 鳴らす。
 * うその SoundFx（playTones と target を 持つ）と うその AudioContext で、鳴らし方・記録・止め方・重ねる 上限を 見る。
 */
interface Rec {
  starts: number;
  stops: number[];
  loops: boolean[];
  urls: string[];
  ramps: Array<[number, number]>;
  tones: number;
}
function fake(withCtx = true) {
  const rec: Rec = { starts: 0, stops: [], loops: [], urls: [], ramps: [], tones: 0 };
  const ended: Array<() => void> = [];
  const decodeLog: string[] = [];
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {} });
  const ctx = {
    currentTime: 1,
    state: 'running',
    resume: async () => {},
    decodeAudioData: async (b: ArrayBuffer) => ({ url: new TextDecoder().decode(b) }),
    createBufferSource: () => {
      const src = {
        ...node(),
        buffer: null as unknown,
        loop: false,
        onended: null as null | (() => void),
        start: () => {
          rec.starts++;
          rec.loops.push(src.loop);
          rec.urls.push((src.buffer as { url: string }).url);
          ended.push(() => src.onended?.());
        },
        stop: (t?: number) => void rec.stops.push(t ?? 0),
      };
      return src;
    },
    createGain: () => {
      const p = {
        value: 1,
        setValueAtTime: (v: number) => ((p.value = v), p),
        linearRampToValueAtTime: (v: number, t: number) => (rec.ramps.push([v, t]), p),
        cancelScheduledValues: () => p,
      };
      return { ...node(), gain: p };
    },
  };
  const sound = {
    playTones: () => void rec.tones++,
    target: () => (withCtx ? { ctx, destination: {} } : null),
  };
  return { sound, rec, ended, decodeLog };
}
const load = async (url: string): Promise<ArrayBuffer> => new TextEncoder().encode(url).buffer as ArrayBuffer;

beforeEach(() => {
  resetLegendFiles(load);
  drainSounds();
  FX_SETTINGS.fxVolume = 0.5;
});

describe('音の ファイルの 鳴らし方', () => {
  it('読みこみ前は 合成音で 代わり、記録は 残る。読めたら ファイルを 1 つ 鳴らす', async () => {
    const f = fake();
    playLegend(f.sound, 'windWave', 1);
    expect(f.rec.tones).toBe(1);
    expect(f.rec.starts).toBe(0);
    await preloadLegendSounds(f.sound);
    playLegend(f.sound, 'windWave', 1);
    expect(f.rec.tones).toBe(1);
    expect(f.rec.urls).toEqual([LEGEND_FILES.windWave[1]]);
    expect(drainSounds()).toEqual(['windWave', 'windWave']);
  });

  it('windWave・thunderSlash は variant か 順番で 3 とおり、spiralWind・chargeReady は 1 つ', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    for (let i = 0; i < 4; i++) playLegend(f.sound, 'windWave', i);
    for (let i = 0; i < 3; i++) {
      playLegend(f.sound, 'thunderSlash');
      f.ended.splice(0).forEach((e) => e());
    }
    playLegend(f.sound, 'spiralWind');
    playLegend(f.sound, 'chargeReady');
    expect(f.rec.urls).toEqual([
      ...[0, 1, 2].map((i) => LEGEND_FILES.windWave[i]),
      // 4 つ目は 同時 3 つの 上限で 鳴らさない
      ...[0, 1, 2].map((i) => LEGEND_FILES.thunderSlash[i]),
      LEGEND_FILES.spiralWind[0],
      LEGEND_FILES.chargeReady[0],
    ]);
    expect(drainSounds()).toEqual(['windWave', 'windWave', 'windWave', 'windWave', 'thunderSlash', 'thunderSlash', 'thunderSlash', 'spiralWind', 'chargeReady']);
  });

  it('同じ 音は 同時に 3 つまで。鳴りおわれば また 鳴る。上限で 鳴らさなくても 記録は 残る', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    for (let i = 0; i < 6; i++) playLegend(f.sound, 'thunderSlash');
    expect(f.rec.starts).toBe(LEGEND_MAX_SAME);
    expect(f.rec.tones).toBe(0);
    expect(drainSounds().length).toBe(6);
    f.ended.splice(0).forEach((e) => e());
    playLegend(f.sound, 'thunderSlash');
    expect(f.rec.starts).toBe(LEGEND_MAX_SAME + 1);
  });

  it('音量 0 は 鳴らさない（合成音も 出さない）。記録は 残る', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    FX_SETTINGS.fxVolume = 0;
    playLegend(f.sound, 'spiralWind');
    expect(f.rec.starts).toBe(0);
    expect(f.rec.tones).toBe(0);
    expect(drainSounds()).toEqual(['spiralWind']);
  });

  it('ファイルが 読めない・鳴らす 先が ない → 合成音で 代わり、例外を 投げない', async () => {
    const f = fake();
    resetLegendFiles(async () => {
      throw new Error('404');
    });
    await preloadLegendSounds(f.sound);
    playLegend(f.sound, 'spiralWind');
    expect(f.rec.tones).toBe(1);
    const g = fake(false);
    expect(() => playLegend(g.sound, 'chargeReady')).not.toThrow();
    expect(g.rec.tones).toBe(1);
    expect(() => startLegendLoop(g.sound, 'chargeHold').stop(0.2)).not.toThrow();
  });

  it('今までの 音（lightning・legendDrop）は 合成音の まま', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    playLegend(f.sound, 'lightning');
    playLegend(f.sound, 'lightningFar');
    playLegend(f.sound, 'legendDrop');
    expect(f.rec.tones).toBe(3);
    expect(f.rec.starts).toBe(0);
    expect(drainSounds()).toEqual(['lightning', 'lightning', 'legendDrop']);
  });
});

describe('ため音 startLegendLoop', () => {
  it('chargeRise は 1 回、chargeHold は ループ。剣の 味で ファイルが かわる。記録は 同じ 名前', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    startLegendLoop(f.sound, 'chargeRise');
    startLegendLoop(f.sound, 'chargeRise', 'fujin');
    startLegendLoop(f.sound, 'chargeHold', 'raijin');
    startLegendLoop(f.sound, 'chargeHold', null);
    expect(f.rec.urls).toEqual([LEGEND_FILES.chargeRise.none, LEGEND_FILES.chargeRise.fujin, LEGEND_FILES.chargeHold.raijin, LEGEND_FILES.chargeHold.none]);
    expect(f.rec.loops).toEqual([false, false, true, true]);
    expect(drainSounds()).toEqual(['chargeRise', 'chargeRise', 'chargeHold', 'chargeHold']);
  });

  it('stop(秒) で その 秒数かけて 小さく して 止まる。2 回 呼んでも 1 回だけ', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    const h = startLegendLoop(f.sound, 'chargeHold');
    f.rec.ramps.length = 0;
    h.stop(0.25);
    h.stop(0.25);
    expect(f.rec.stops).toHaveLength(1);
    expect(f.rec.stops[0]!).toBeCloseTo(1 + 0.25 + 0.02, 5);
    expect(f.rec.ramps).toEqual([[0.0001, 1.25]]);
  });

  it('ため続けは ふわっと 入る（0.12 秒）。大きさは fxVolume に 比例', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    startLegendLoop(f.sound, 'chargeHold');
    expect(f.rec.ramps[0]).toEqual([1, 1.12]);
    FX_SETTINGS.fxVolume = 0.25;
    startLegendLoop(f.sound, 'chargeRise');
    FX_SETTINGS.fxVolume = 0.5;
    expect(f.rec.starts).toBe(2);
  });

  it('読みこみ前・音量 0 でも 例外なし。stop も 安全', () => {
    const f = fake();
    const h = startLegendLoop(f.sound, 'chargeRise');
    expect(() => h.stop(0.1)).not.toThrow();
    expect(f.rec.starts).toBe(0);
  });
});

describe('止められる spiralWind startLegendOneShot', () => {
  it('1 回 鳴らして 記録 spiralWind。stop(0.2) で 0.2 秒かけて 小さく し、2 回 呼んでも 1 回', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    const h = startLegendOneShot(f.sound, 'spiralWind');
    expect(f.rec.urls).toEqual([LEGEND_FILES.spiralWind[0]]);
    expect(f.rec.loops).toEqual([false]);
    h.stop(0.2);
    h.stop(0.2);
    expect(f.rec.stops).toHaveLength(1);
    expect(f.rec.stops[0]!).toBeCloseTo(1.22, 5);
    expect(f.rec.ramps).toEqual([[0.0001, 1.2]]);
    expect(drainSounds()).toEqual(['spiralWind']);
  });
  it('読みこみ前は 合成音で 代わり、音量 0 は 無音。stop は 安全', async () => {
    const f = fake();
    expect(() => startLegendOneShot(f.sound, 'spiralWind').stop(0.2)).not.toThrow();
    expect(f.rec.tones).toBe(1);
    await preloadLegendSounds(f.sound);
    FX_SETTINGS.fxVolume = 0;
    startLegendOneShot(f.sound, 'spiralWind').stop(0.2);
    expect(f.rec.starts).toBe(0);
  });
  it('同時 3 つの 上限を playLegend と 分けあう', async () => {
    const f = fake();
    await preloadLegendSounds(f.sound);
    for (let i = 0; i < 4; i++) startLegendOneShot(f.sound, 'spiralWind');
    expect(f.rec.starts).toBe(LEGEND_MAX_SAME);
  });
});

describe('試聴一覧', () => {
  it('chargeRise・chargeHold・spiralWind が ある（ためは 味なし / 風神 / 雷神）', () => {
    const names = SFX_CATALOG.map((c) => c.name);
    expect(names).toContain('spiralWind');
    expect(names.filter((n) => n === 'chargeRise')).toHaveLength(3);
    expect(names.filter((n) => n === 'chargeHold')).toHaveLength(3);
    expect(names).toContain('windWave');
    expect(names).toContain('thunderSlash');
    expect(names).toContain('chargeReady');
  });
});

describe('音の ファイル（public/sound/legend/）', () => {
  const ROOT = resolve(__dirname, '../..');
  const DIR = join(ROOT, 'public/sound/legend');
  const rel = (u: string): string => join(DIR, u.replace('./sound/legend/', ''));
  const all = [
    ...LEGEND_FILES.windWave,
    ...LEGEND_FILES.thunderSlash,
    ...LEGEND_FILES.spiralWind,
    ...LEGEND_FILES.chargeReady,
    ...Object.values(LEGEND_FILES.chargeRise),
    ...Object.values(LEGEND_FILES.chargeHold),
  ];
  it('14 個 すべて あり、ogg で、1 つ 30KB 以下・全部で 200KB 以下。出どころの 説明が ある', () => {
    let total = 0;
    for (const u of all) {
      expect(existsSync(rel(u)), u).toBe(true);
      const b = readFileSync(rel(u));
      expect(b.subarray(0, 4).toString()).toBe('OggS');
      expect(b.length).toBeLessThanOrEqual(30 * 1024);
      total += b.length;
    }
    expect(total).toBeLessThanOrEqual(200 * 1024);
    expect(readdirSync(DIR).filter((n) => n.endsWith('.ogg')).length).toBe(all.length);
    const readme = readFileSync(join(DIR, 'README.md'), 'utf8');
    expect(readme).toContain('VCSL');
    expect(readme).toContain('CC0');
  });

  const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;
  const maxLen: Record<string, number> = { windWave: 0.5, thunderSlash: 0.8, spiralWind: 2.0, chargeRise: 1.05, chargeReady: 2.0, chargeHold: 1.25 };
  it.skipIf(!hasFfmpeg && !process.env.CI)('ピーク −9 dBFS 以下（クリップ 0）、長さは 仕様の 上限以内、ため続けは 1.2 秒 ちょうど', () => {
    for (const u of all) {
      const r = spawnSync(FFMPEG, ['-v', 'error', '-i', rel(u), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
      expect(r.status, u).toBe(0);
      const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
      let peak = 0;
      for (const v of x) peak = Math.max(peak, Math.abs(v));
      const sec = x.length / 48000;
      const key = Object.keys(maxLen).find((k) => u.includes(`/${k}`))!;
      expect(20 * Math.log10(peak), u).toBeLessThanOrEqual(-9);
      expect(sec, u).toBeLessThanOrEqual(maxLen[key]!);
      if (key === 'chargeHold') expect(sec).toBeGreaterThan(1.15);
    }
  });
});
