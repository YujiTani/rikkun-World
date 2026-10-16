import { afterEach, describe, expect, it } from 'vitest';
import { createAudioSettings } from '../audioConfig';
import { AudioMixer } from '../audioMixer';
import { FX_SETTINGS } from '../config';
import { BgmPlayer } from './BgmPlayer';
import { FakeAudioContext } from './fakeAudio';
import { createAudioHook } from './hook';
import { BgmSceneTracker } from './scene';

const players: BgmPlayer[] = [];
afterEach(() => {
  while (players.length) players.pop()!.dispose();
});

describe('window.__rikkun.audio（SOUND.md §8）', () => {
  it('state() の形と値', () => {
    const s = createAudioSettings();
    const fx = { ...FX_SETTINGS };
    const ctx = new FakeAudioContext();
    const mixer = new AudioMixer(s, () => ctx.asContext());
    const bgm = new BgmPlayer(mixer);
    players.push(bgm);
    const tracker = new BgmSceneTracker(s);
    const records = [{ name: 'dig' }];
    const hook = createAudioHook({ mixer, bgm, tracker, audio: s, fx, sfx: () => records.splice(0), sfxVoices: () => 3 });

    expect(hook.state()).toEqual({
      context: 'none',
      scene: 'day',
      song: null,
      songs: 0,
      screenLevel: 1,
      ducking: false,
      chord: 'C',
      master: 0.6,
      bgm: 0.4,
      fx: FX_SETTINGS.fxVolume,
      muted: false,
    });
    mixer.unlock();
    tracker.update({ tick: 0, phase: 'night', player: { x: 0, y: 0, z: 0 }, yokai: [], dead: false });
    bgm.play(tracker.scene());
    mixer.setScreenLevel(0.7);
    s.audioMuted = true;
    fx.fxVolume = 0.25;
    const st = hook.state();
    expect(st.context).toBe('running');
    expect(st.scene).toBe('night');
    expect(st.song).toBe('night');
    expect(st.songs).toBe(1);
    expect(st.screenLevel).toBe(0.7);
    expect(st.muted).toBe(true);
    expect(st.fx).toBe(0.25);
    ctx.currentTime = 0.06;
    expect(hook.chord()).toEqual({ name: 'F', root: 5, minor: false });
    expect(st.chord).toBe('C'); // 始まる前の 0.05 秒
    expect(hook.state().chord).toBe('F');
    expect(hook.voices().bgm).toBeGreaterThan(0);
    expect(hook.voices().sfx).toBe(3);
    expect(hook.sfx()).toEqual([{ name: 'dig' }]);
    expect(hook.sfx()).toEqual([]);
  });
});
