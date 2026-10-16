import { afterEach, describe, expect, it } from 'vitest';
import { createAudioSettings } from '../audioConfig';
import { AudioMixer } from '../audioMixer';
import { BgmPlayer } from './BgmPlayer';
import { FakeAudioContext, type FakeNode } from './fakeAudio';
import { songInfo, tokens } from './compile';
import { BGM_SONGS } from './songs';

const players: BgmPlayer[] = [];
afterEach(() => {
  while (players.length) players.pop()!.dispose();
});

function mk() {
  const s = createAudioSettings();
  let ctx!: FakeAudioContext;
  const mixer = new AudioMixer(s, () => {
    ctx = new FakeAudioContext('running');
    return ctx.asContext();
  });
  mixer.unlock();
  const bgm = new BgmPlayer(mixer);
  players.push(bgm);
  const bgmIn = mixer.bgmInput() as unknown as FakeNode;
  /** 曲ごとのフェード（BGM バスへ直接つながる gain）を つくった順に */
  const fades = () => ctx.all('gain').filter((g) => g.outputs.includes(bgmIn));
  return { s, mixer, bgm, ctx, fades };
}

describe('B4 BGM の切り替え', () => {
  it('はじめは 1.5 秒で入る（0 → 1）', () => {
    const { bgm, ctx, fades } = mk();
    ctx.currentTime = 10;
    bgm.play('day');
    expect(bgm.current()).toBe('day');
    expect(bgm.songCount()).toBe(1);
    const f = fades()[0];
    const ev = f.gain.events;
    expect(ev[0]).toMatchObject({ type: 'set', value: 0, time: 10 });
    expect(ev[1]).toMatchObject({ type: 'linear', value: 1 });
    expect(ev[1].time - 10).toBeCloseTo(1.5, 5);
  });

  it('鳴っている曲から別の曲: 古い曲は 1.5 秒で 0、新しい曲は 0 → 1 を 1.5 秒', () => {
    const { bgm, ctx, fades } = mk();
    bgm.play('day');
    ctx.currentTime = 20;
    bgm.play('night');
    expect(bgm.current()).toBe('night');
    expect(bgm.songCount()).toBe(2);
    const [oldF, newF] = fades();
    const r = oldF.gain.lastRamp()!;
    expect(r.value).toBe(0);
    expect(r.time - 20).toBeCloseTo(1.5, 5);
    expect(newF.gain.events[0]).toMatchObject({ type: 'set', value: 0, time: 20 });
    expect(newF.gain.events[1]).toMatchObject({ type: 'linear', value: 1 });
    expect(newF.gain.events[1].time - 20).toBeCloseTo(1.5, 5);
  });

  it('止める（null）は 0.8 秒で 0。そのあと曲は無い', () => {
    const { bgm, ctx, fades } = mk();
    bgm.play('battle');
    ctx.currentTime = 7;
    bgm.play(null);
    expect(bgm.current()).toBeNull();
    const r = fades()[0].gain.lastRamp()!;
    expect(r.value).toBe(0);
    expect(r.time - 7).toBeCloseTo(0.8, 5);
    expect(bgm.chord()).toEqual({ name: 'C', root: 0, minor: false });
  });

  it('止めたあとに また入れると 1.5 秒で入る', () => {
    const { bgm, ctx, fades } = mk();
    bgm.play('day');
    ctx.currentTime = 3;
    bgm.play(null);
    ctx.currentTime = 4;
    bgm.play('day');
    const f = fades().at(-1)!;
    expect(f.gain.events[1].time - 4).toBeCloseTo(1.5, 5);
  });

  it('同じ曲の play は何もしない', () => {
    const { bgm, ctx, fades } = mk();
    bgm.play('day');
    const n = ctx.nodes.length;
    ctx.currentTime = 1;
    for (let i = 0; i < 100; i++) bgm.play('day');
    expect(ctx.nodes.length).toBe(n);
    expect(fades().length).toBe(1);
    expect(bgm.songCount()).toBe(1);
  });

  it('3 曲目が来たら いちばん古い曲を 0.1 秒で消し、songCount は 2 をこえない', () => {
    const { bgm, ctx, fades } = mk();
    bgm.play('day');
    ctx.currentTime = 5;
    bgm.play('night');
    ctx.currentTime = 5.5;
    bgm.play('battle');
    expect(bgm.songCount()).toBeLessThanOrEqual(2);
    const [a, b, c] = fades();
    const ra = a.gain.lastRamp()!;
    expect(ra.value).toBe(0);
    expect(ra.time - 5.5).toBeCloseTo(0.1, 5);
    const rb = b.gain.lastRamp()!;
    expect(rb.value).toBe(0);
    expect(rb.time - 5.5).toBeCloseTo(1.5, 5);
    expect(c.gain.events[1].time - 5.5).toBeCloseTo(1.5, 5);
    expect(bgm.current()).toBe('battle');
    // もう一回
    ctx.currentTime = 5.6;
    bgm.play('day');
    expect(bgm.songCount()).toBeLessThanOrEqual(2);
  });

  it('終わった曲は片づける（fade が 0 になって少したったら）', () => {
    const { bgm, ctx } = mk();
    bgm.play('day');
    ctx.currentTime = 1;
    bgm.play('night');
    expect(bgm.songCount()).toBe(2);
    ctx.currentTime = 10;
    bgm.tick();
    expect(bgm.songCount()).toBe(1);
  });

  it('unlock の前の play は 覚えておいて、unlock のあとに鳴らす', () => {
    const s = createAudioSettings();
    let ctx: FakeAudioContext | null = null;
    const mixer = new AudioMixer(s, () => (ctx = new FakeAudioContext('running')).asContext());
    const bgm = new BgmPlayer(mixer);
    players.push(bgm);
    bgm.play('night');
    expect(bgm.current()).toBeNull();
    expect(bgm.songCount()).toBe(0);
    mixer.unlock();
    bgm.play('night');
    expect(bgm.current()).toBe('night');
    expect(ctx).not.toBeNull();
  });
});

describe('ループ（先読みの予約）', () => {
  it('先読み 0.2 秒ぶんだけ予約し、時間が進むと続きを予約する。つなぎ目も切れない', () => {
    const { bgm, ctx } = mk();
    bgm.play('battle');
    const info = songInfo(BGM_SONGS.battle);
    const start = 0.05;
    // 1 周ぶん ＋ 少し先まで時間を進める（25ms ごとに tick）
    const oscStarts: number[] = [];
    for (let t = 0; t < info.seconds + 2; t += 0.025) {
      ctx.currentTime = t;
      bgm.tick();
    }
    for (const o of ctx.all('osc')) oscStarts.push(o.startedAt!);
    // 1 周ののち、2 周目の頭の拍が 予約されている
    const second = start + info.seconds;
    expect(oscStarts.some((x) => Math.abs(x - second) < 1e-6)).toBe(true);
    // 前もって予約しすぎない: いまから 0.2 秒より先の音は無い
    ctx.currentTime = 1;
    const before = ctx.all('osc').length;
    bgm.tick();
    expect(ctx.all('osc').length).toBe(before);
    // 全部の音の開始時刻は、曲のステップの格子の上に乗る（ゆれない）
    for (const x of oscStarts) {
      const k = (x - start) / info.stepDur;
      // 楽器の音は 格子 ＋ 0（エコーなどは別ノード）。ずれがあるのは ドラムの delay だけ
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });

  it('chord(): 音の時計で、いまの和音（曲の始まりから）', () => {
    const { bgm, ctx } = mk();
    ctx.currentTime = 100;
    bgm.play('day');
    const info = songInfo(BGM_SONGS.day);
    const bar = info.stepDur * info.stepsPerBar;
    const names = tokens(BGM_SONGS.day.chords);
    ctx.currentTime = 100.05 + 0.01;
    expect(bgm.chord().name).toBe('G');
    ctx.currentTime = 100.05 + 4 * bar + 0.01;
    expect(bgm.chord()).toEqual({ name: 'Em', root: 4, minor: true });
    ctx.currentTime = 100.05 + info.seconds + 0.01;
    expect(bgm.chord().name).toBe(names[0]);
  });

  it('voices(): 予約した音の数（時間がたつと へる）', () => {
    const { bgm, ctx } = mk();
    expect(bgm.voices()).toBe(0);
    bgm.play('day');
    expect(bgm.voices()).toBeGreaterThan(0);
    ctx.currentTime = 3000;
    expect(bgm.voices()).toBe(0);
  });

  it('1 ステップで鳴らす音の部品の数は SOUND.md の上限（8 音）の中', () => {
    const { bgm, ctx } = mk();
    bgm.play('day');
    for (let t = 0; t < 30; t += 0.025) {
      ctx.currentTime = t;
      bgm.tick();
    }
    const starts = new Map<number, number>();
    for (const o of ctx.all('osc')) {
      const k = Math.round(o.startedAt! * 1e6);
      starts.set(k, (starts.get(k) ?? 0) + 1);
    }
    // オシレーター 1 つ = 部品の倍音 1 つ。音（和音の 1 音 = 3 倍音まで）× 8 まで
    const worst = Math.max(...starts.values());
    expect(worst).toBeLessThanOrEqual(8 * 3);
  });
});
