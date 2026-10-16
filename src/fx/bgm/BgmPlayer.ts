/**
 * BGM を鳴らす（SOUND.md §4）。音の時計で先読み 0.2 秒ぶんずつ予約するので、ループのつなぎ目で切れない
 * （ゲームのステップには合わせない）。曲の入れかえは 1.5 秒のクロスフェード、同時に鳴る曲は 2 つまで。
 */
import { MIX } from '../audioConfig';
import type { AudioMixer } from '../audioMixer';
import { chordAtSeconds, compileSong, NO_SONG_CHORD, songInfo, type BgmChord, type SongInfo, type StepEvent } from './compile';
import { BGM_INSTRUMENTS, BGM_KIT, playTones, playVoice } from './instruments';
import { BGM_SONGS, type BgmSong } from './songs';

export type { BgmChord } from './compile';
export type { BgmSong } from './songs';

interface LiveSong {
  key: BgmSong;
  info: SongInfo;
  events: StepEvent[][];
  input: GainNode;
  echoIn: GainNode | null;
  fade: GainNode;
  /** 曲の頭の時刻（音の時計） */
  start: number;
  /** 次に予約するステップ */
  step: number;
  /** この時刻で予約をやめる（Infinity = ずっと） */
  stopAt: number;
  /** 3 曲目が来て 0.1 秒で消す曲（songCount に数えない） */
  killed: boolean;
}

const TIMER_MS = 25;

export class BgmPlayer {
  private songs: LiveSong[] = [];
  private cur: LiveSong | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ends: number[] = [];
  private readonly compiled = new Map<BgmSong, StepEvent[][]>();
  private readonly noteVoice = (end: number): void => {
    this.ends.push(end);
  };

  constructor(private readonly mixer: AudioMixer) {}

  /** 同じ曲なら何もしない。null は fadeOut（0.8 秒）。AudioContext が まだ無いときは何もしない（あとで また呼ぶ） */
  play(song: BgmSong | null): void {
    const out = this.mixer.output();
    const bus = this.mixer.bgmInput();
    if (!out || !bus) return;
    const ctx = out.ctx;
    if (song === null) {
      if (this.cur) {
        this.fadeOutSong(this.cur, MIX.fadeOut);
        this.cur = null;
      }
      return;
    }
    if (this.cur && this.cur.key === song) return;
    const now = ctx.currentTime;
    // 3 曲目: 鳴っている曲が 2 つあるなら いちばん古い曲を 0.1 秒で消す
    const audible = this.songs.filter((s) => !s.killed);
    if (audible.length >= 2) this.fadeOutSong(audible[0], MIX.quickFade, true);
    const sec = this.cur ? MIX.crossfade : MIX.fadeIn;
    if (this.cur) this.fadeOutSong(this.cur, MIX.crossfade);

    const def = BGM_SONGS[song];
    const fade = ctx.createGain();
    fade.connect(bus);
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + sec);
    const input = ctx.createGain();
    input.gain.value = def.level;
    input.connect(fade);
    let echoIn: GainNode | null = null;
    const info = songInfo(def);
    if (def.echo) {
      const dl = ctx.createDelay(2);
      dl.delayTime.value = def.echo.steps * info.stepDur;
      const fb = ctx.createGain();
      fb.gain.value = def.echo.feedback;
      const wet = ctx.createGain();
      wet.gain.value = def.echo.mix;
      echoIn = ctx.createGain();
      echoIn.connect(dl);
      dl.connect(fb);
      fb.connect(dl);
      dl.connect(wet);
      wet.connect(input);
    }
    let events = this.compiled.get(song);
    if (!events) {
      events = compileSong(def, BGM_INSTRUMENTS, BGM_KIT);
      this.compiled.set(song, events);
    }
    const live: LiveSong = { key: song, info, events, input, echoIn, fade, start: now + 0.05, step: 0, stopAt: Infinity, killed: false };
    this.songs.push(live);
    this.cur = live;
    if (this.timer === null) this.timer = setInterval(() => this.tick(), TIMER_MS);
    this.tick();
  }

  /** 先読みして予約する（タイマーが呼ぶ。テストは直接呼んでよい） */
  tick(): void {
    const out = this.mixer.output();
    if (!out) return;
    const ctx = out.ctx;
    const horizon = ctx.currentTime + MIX.lookahead;
    for (const s of this.songs) {
      for (;;) {
        const t = s.start + s.step * s.info.stepDur;
        if (t >= horizon || t >= s.stopAt) break;
        this.scheduleStep(ctx, s, s.step % s.info.steps, t);
        s.step++;
      }
    }
    this.songs = this.songs.filter((s) => {
      if (ctx.currentTime > s.stopAt + 0.1) {
        s.fade.disconnect();
        s.input.disconnect();
        return false;
      }
      return true;
    });
    this.pruneVoices(ctx.currentTime);
    if (this.songs.length === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** いま鳴っている和音（音の時計で）。曲が無ければ C */
  chord(): BgmChord {
    const out = this.mixer.output();
    const c = this.cur;
    if (!out || !c) return { ...NO_SONG_CHORD };
    const t = out.ctx.currentTime;
    if (t < c.start) return { ...NO_SONG_CHORD };
    return chordAtSeconds(BGM_SONGS[c.key], t - c.start);
  }

  current(): BgmSong | null {
    return this.cur ? this.cur.key : null;
  }

  /** いま鳴っている曲の数（3 曲目で消している曲は数えない） */
  songCount(): number {
    return this.songs.filter((s) => !s.killed).length;
  }

  /** いま鳴っている音の部品の数（予約ずみで、まだ終わっていないもの） */
  voices(): number {
    const out = this.mixer.output();
    if (!out) return 0;
    this.pruneVoices(out.ctx.currentTime);
    return this.ends.length;
  }

  /** タイマーを止める（テスト・画面を閉じるとき） */
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private pruneVoices(now: number): void {
    if (this.ends.length === 0) return;
    let w = 0;
    for (let i = 0; i < this.ends.length; i++) if (this.ends[i] > now) this.ends[w++] = this.ends[i];
    this.ends.length = w;
  }

  private fadeOutSong(s: LiveSong, sec: number, killed = false): void {
    const out = this.mixer.output();
    if (!out) return;
    const now = out.ctx.currentTime;
    s.fade.gain.cancelScheduledValues(now);
    s.fade.gain.setValueAtTime(s.fade.gain.value, now);
    s.fade.gain.linearRampToValueAtTime(0, now + sec);
    s.stopAt = now + sec;
    if (killed) s.killed = true;
  }

  private scheduleStep(ctx: BaseAudioContext, s: LiveSong, i: number, t: number): void {
    for (const ev of s.events[i]) {
      if ('drum' in ev) {
        playTones(ctx, s.input, BGM_KIT[ev.drum], t, ev.vol, this.noteVoice);
        continue;
      }
      const tail = playVoice(ctx, BGM_INSTRUMENTS[ev.inst], ev.freq, t, ev.dur, ev.vol, this.noteVoice);
      tail.connect(s.input);
      if (ev.echo && s.echoIn) {
        const send = ctx.createGain();
        send.gain.value = ev.echo;
        tail.connect(send);
        send.connect(s.echoIn);
      }
    }
  }
}
