/**
 * #293 試作: 効果音を 鳴らす 本物の 口の 土台（WebAudio）。少女の createWebAudioPlayer（gashaGirlSfx.ts）と 大きな 姿（gashaBigSfx.ts）が 使う。読みこむ ファイルの 一覧を 受けとる。
 * 初めて 呼ばれたとき ファイルを 全部 読みこむ。読めない 所でも 動く（読めて いない 音は 鳴らさない）。
 *
 * out（ゲームの ミキサーの 効果音バス。main.ts の mixer.output()）を わたすと、自前の AudioContext は 作らず、音は ミキサーの 効果音バスに つなぐ
 * （設定の 音量・ミュート・リミッターが 効く。FIX-BRIEF-2 §3-3）。ミキサーの 音が まだ 使えない(null)間は 鳴らさず、使えるように なったら 読みこむ。
 * out を わたさない とき（試作 ?proto=gashaBig の 単独・テスト）だけ 自前の AudioContext に destination 直結。
 */
export interface SfxPlayOpts { gain: number; rate: number; delaySec: number }
export interface SfxEnv {
  now(): number;
  /** 1 回 鳴らす。鳴らした 音の 長さ（秒）を 返す。まだ 読めて いない ときは 0 */
  play(url: string, o: SfxPlayOpts): number;
  /** 鳴らして いる 音・遅れて 鳴らす 予約の 音を ぜんぶ 止める（少女が 消える・休む とき） */
  stopAll?(): void;
}
/** ゲームの ミキサーの 効果音バス（なければ null） */
export type SfxOut = () => { ctx: AudioContext; destination: AudioNode } | null;

export function createWebAudioPlayerBase(urls: () => string[], out?: SfxOut) {
  let own: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  let loading = false;
  const active = new Set<AudioBufferSourceNode>();
  let poll: ReturnType<typeof setInterval> | null = null;
  /** 音の 入れ物と つなぎ先。out が あれば ミキサー、なければ 自前（destination 直結） */
  const route = (): { ctx: AudioContext; dest: AudioNode } | null => {
    if (out) {
      const o = out();
      return o ? { ctx: o.ctx, dest: o.destination } : null;
    }
    if (!own) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        own = new AC();
      } catch { own = null; }
    }
    return own ? { ctx: own, dest: own.destination } : null;
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
    preload: function preload(): void {
      const r = route();
      if (!r) {
        // ミキサーの 音が まだ（最初の クリック前）: 使えるように なったら 読みこむ ように 見はる
        if (out && poll === null) poll = setInterval(() => { if (route()) { clearInterval(poll!); poll = null; preload(); } }, 500);
        return;
      }
      load(r.ctx);
      if (!out && r.ctx.state === 'suspended') {
        const go = (): void => { void r.ctx.resume(); for (const e of ['pointerdown', 'keydown']) window.removeEventListener(e, go, true); };
        for (const e of ['pointerdown', 'keydown']) window.addEventListener(e, go, true);
      }
    },
    now: (): number => route()?.ctx.currentTime ?? 0,
    /** 音の 入れ物と つなぎ先（なければ 作る。ループ音用） */
    route: (): { ctx: AudioContext; dest: AudioNode } | null => { const r = route(); if (r) load(r.ctx); return r; },
    buffer: (url: string): AudioBuffer | undefined => buffers.get(url),
    play: (url: string, o: SfxPlayOpts): number => {
      const r = route();
      if (!r) return 0;
      load(r.ctx);
      const buf = buffers.get(url);
      if (!buf) return 0;
      const c = r.ctx;
      try {
        if (c.state === 'suspended') void c.resume();
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = buf; src.playbackRate.value = o.rate; g.gain.value = o.gain;
        src.connect(g); g.connect(r.dest);
        active.add(src);
        src.onended = () => { active.delete(src); };
        src.start(c.currentTime + o.delaySec);
        return buf.duration / o.rate;
      } catch { return 0; }
    },
    /** 鳴って いる 音と 遅れて 鳴らす 予約の 音を 止める */
    stopAll: (): void => {
      for (const src of active) { try { src.stop(0); } catch { /* もう 止まって いる */ } }
      active.clear();
    },
  };
}
