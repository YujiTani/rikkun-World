import { execFileSync } from 'node:child_process';

/** mp3 → 48kHz ステレオ f32。{ peakDb, attack（秒）, hearable（秒）, length } */
export function measure(file: string) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const SR = 48000;
  let peak = 0;
  for (let i = 0; i < f.length; i++) peak = Math.max(peak, Math.abs(f[i]!));
  // 20 ms ごとの 大きさ（2 チャンネルの 2 乗平均の平方根）
  const win = Math.round(SR * 0.02);
  const env: number[] = [];
  for (let s = 0; s + win <= f.length / 2; s += win) {
    let a = 0;
    for (let i = 0; i < win * 2; i++) a += f[s * 2 + i]! ** 2;
    env.push(Math.sqrt(a / (win * 2)));
  }
  const max = Math.max(...env);
  const first = env.findIndex((e) => e > 1e-3);
  const at90 = env.findIndex((e) => e >= 0.9 * max);
  const iMax = env.indexOf(max);
  let last = iMax;
  for (let i = env.length - 1; i >= iMax; i--) if (env[i]! >= 0.1 * max) { last = i; break; }
  return {
    peakDb: 20 * Math.log10(peak),
    attack: (at90 - first) * 0.02,
    /** いちばん大きい所から −20 dB まで（聞こえる長さ） */
    hearable: (last - iMax) * 0.02,
    hearableFromStart: (last - first) * 0.02,
    length: f.length / 2 / SR,
  };
}

