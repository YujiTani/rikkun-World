import { describe, expect, it } from 'vitest';
import { TitleSound, type TitleAudio } from './titleSound';

/** G12: 読みこみが 失敗したら、次に 鳴らす頼みのときに 1 回だけ やりなおす */
function audio(): TitleAudio {
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {} });
  return {
    currentTime: 0,
    destination: {},
    state: 'running',
    decodeAudioData: async () => ({}),
    createBufferSource: () => ({ ...node(), buffer: null, onended: null, start: () => {}, stop: () => {} }),
    createGain: () => ({ ...node(), gain: { value: 1, setValueAtTime: () => {} } }),
  } as unknown as TitleAudio;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('TitleSound の やりなおし（G12）', () => {
  it('失敗 → 次の play で 1 回 読みなおし、そのあと 鳴る。何度も 連打しない', async () => {
    let calls = 0;
    let ok = false;
    const s = new TitleSound({
      audio: () => audio(),
      load: async () => {
        calls++;
        if (!ok) throw new Error('x');
        return new ArrayBuffer(8);
      },
      volume: () => 1,
    });
    await s.preload();
    expect(calls).toBe(3);
    expect(s.play('nushi')).toBe(false); // やりなおしを 始める
    await tick();
    expect(calls).toBe(6);
    for (let i = 0; i < 5; i++) s.play('nushi'); // もう やりなおさない
    await tick();
    expect(calls).toBe(6);
  });

  it('やりなおしで 読めたら 鳴る', async () => {
    let ok = false;
    const s = new TitleSound({ audio: () => audio(), load: async () => (ok ? new ArrayBuffer(8) : Promise.reject(new Error('x'))), volume: () => 1 });
    await s.preload();
    ok = true;
    s.play('taisho');
    await tick();
    expect(s.ready()).toBe(true);
    expect(s.play('taisho')).toBe(true);
  });
});
