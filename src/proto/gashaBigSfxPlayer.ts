/**
 * #293 試作: 効果音を 鳴らす 本物の 口の 土台（WebAudio）。少女の createWebAudioPlayer（gashaGirlSfx.ts）と おなじ 作りで、読みこむ ファイルの 一覧を 受けとる。
 * 初めて 呼ばれたとき ファイルを 全部 読みこむ。読めない 所でも 動く（読めて いない 音は 鳴らさない）。
 */
export interface SfxPlayOpts { gain: number; rate: number; delaySec: number }
export interface SfxEnv {
  now(): number;
  /** 1 回 鳴らす。鳴らした 音の 長さ（秒）を 返す。まだ 読めて いない ときは 0 */
  play(url: string, o: SfxPlayOpts): number;
}

export function createWebAudioPlayerBase(urls: () => string[]) {
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  let loading = false;
  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch { ctx = null; }
    return ctx;
  };
  const load = (c: AudioContext): void => {
    if (loading) return;
    loading = true;
    for (const url of urls()) {
      void (async () => {
        try {
          const r = await fetch(url);
          if (!r.ok) return;
          buffers.set(url, await c.decodeAudioData(await r.arrayBuffer()));
        } catch { /* 読めない 音は 鳴らさない */ }
      })();
    }
  };
  return {
    preload: (): void => {
      const c = ensure();
      if (!c) return;
      load(c);
      if (c.state === 'suspended') {
        const go = (): void => { void c.resume(); for (const e of ['pointerdown', 'keydown']) window.removeEventListener(e, go, true); };
        for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, go, true);
      }
    },
    now: (): number => ctx?.currentTime ?? 0,
    /** 音の 入れ物（なければ 作る） */
    context: (): AudioContext | null => { const c = ensure(); if (c) load(c); return c; },
    buffer: (url: string): AudioBuffer | undefined => buffers.get(url),
    play: (url: string, o: SfxPlayOpts): number => {
      const c = ensure();
      if (!c) return 0;
      load(c);
      const buf = buffers.get(url);
      if (!buf) return 0;
      try {
        if (c.state === 'suspended') void c.resume();
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = buf; src.playbackRate.value = o.rate; g.gain.value = o.gain;
        src.connect(g); g.connect(c.destination);
        src.start(c.currentTime + o.delaySec);
        return buf.duration / o.rate;
      } catch { return 0; }
    },
  };
}
