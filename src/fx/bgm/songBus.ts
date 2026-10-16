/**
 * 1 曲ぶんの出口（こだまつき）と、1 ステップを鳴らす処理。BgmPlayer（本番）と render.ts（書き出し）が同じものを使う。
 */
import { songInfo, type SongDef, type StepEvent } from './compile';
import { BGM_INSTRUMENTS, BGM_KIT, playTones, playVoice, type OnSource } from './instruments';

export interface SongBus {
  /** 曲の音を入れる所（曲の level がかかる） */
  input: GainNode;
  /** こだまに送る所（こだまのない曲は null） */
  echoIn: GainNode | null;
  /** 曲の片付け: こだまの輪（delay ↔ feedback）も切る */
  dispose(): void;
}

/** 曲ごとの出口を作って dest につなぐ（曲の大きさ level・こだま） */
export function createSongBus(ctx: BaseAudioContext, dest: AudioNode, song: SongDef): SongBus {
  const input = ctx.createGain();
  input.gain.value = song.level;
  input.connect(dest);
  let echoIn: GainNode | null = null;
  const echoNodes: AudioNode[] = [];
  if (song.echo) {
    const { stepDur } = songInfo(song);
    const dl = ctx.createDelay(2);
    dl.delayTime.value = song.echo.steps * stepDur;
    const fb = ctx.createGain();
    fb.gain.value = song.echo.feedback;
    const wet = ctx.createGain();
    wet.gain.value = song.echo.mix;
    echoIn = ctx.createGain();
    echoIn.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(wet);
    wet.connect(input);
    echoNodes.push(dl, fb, wet, echoIn);
  }
  return {
    input,
    echoIn,
    dispose() {
      for (const n of echoNodes) n.disconnect();
      input.disconnect();
    },
  };
}

/** 時刻 t に 1 ステップぶんの音を予約する */
export function scheduleSongStep(ctx: BaseAudioContext, bus: SongBus, events: readonly StepEvent[], t: number, onSource?: OnSource): void {
  for (const ev of events) {
    if ('drum' in ev) {
      playTones(ctx, bus.input, BGM_KIT[ev.drum], t, ev.vol, onSource);
      continue;
    }
    const tail = playVoice(ctx, BGM_INSTRUMENTS[ev.inst], ev.freq, t, ev.dur, ev.vol, onSource);
    tail.connect(bus.input);
    if (ev.echo && bus.echoIn) {
      const send = ctx.createGain();
      send.gain.value = ev.echo;
      tail.connect(send);
      send.connect(bus.echoIn);
    }
  }
}
