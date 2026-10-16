/**
 * 試聴ページ（sound.html）。ゲームと同じコード（AudioMixer・BgmPlayer・soundSettings）で鳴らす。
 * 効果音の欄は SFX_CATALOG が入ったあと（つなぎ込み）に足す。
 */
import { createAudioSettings, MIX } from '../fx/audioConfig';
import { AudioMixer } from '../fx/audioMixer';
import { BgmPlayer, type BgmSong } from '../fx/bgm/BgmPlayer';
import { songInfo } from '../fx/bgm/compile';
import { levelStats, seamStats } from '../fx/bgm/measure';
import { renderBgm } from '../fx/bgm/render';
import { BGM_SONGS } from '../fx/bgm/songs';
import { FX_SETTINGS } from '../fx/config';
import { createSoundSettings } from '../ui/soundSettings';
import { createAudioPersistence } from '../ui/soundSettingsModel';

const audio = createAudioSettings();
const fx = { ...FX_SETTINGS };
const persist = createAudioPersistence(localStorage, audio, fx);
persist.load();
const mixer = new AudioMixer(audio);
const bgm = new BgmPlayer(mixer);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = $('status');

const NAMES: Record<BgmSong, string> = { day: 'ひる', night: 'よる', battle: 'たたかい' };
const songButtons = new Map<BgmSong | 'stop', HTMLButtonElement>();

function unlock(): void {
  mixer.unlock();
  mixer.apply();
}
$('unlock').addEventListener('click', unlock);

function play(song: BgmSong | null): void {
  unlock();
  bgm.play(song);
  refresh();
}
for (const key of ['day', 'night', 'battle'] as const) {
  const b = document.createElement('button');
  b.className = 'snd';
  b.innerHTML = `${NAMES[key]} <small>${songInfo(BGM_SONGS[key]).seconds.toFixed(1)} 秒</small>`;
  b.addEventListener('click', () => {
    stopDemo();
    play(key);
  });
  songButtons.set(key, b);
  $('songs').appendChild(b);
}
{
  const b = document.createElement('button');
  b.className = 'snd';
  b.textContent = 'とめる（0.8 秒）';
  b.addEventListener('click', () => {
    stopDemo();
    play(null);
  });
  songButtons.set('stop', b);
  $('songs').appendChild(b);
}

let demoTimer: ReturnType<typeof setInterval> | null = null;
function stopDemo(): void {
  if (demoTimer !== null) clearInterval(demoTimer);
  demoTimer = null;
  $('demoScenes').classList.remove('on');
}
$('demoScenes').addEventListener('click', () => {
  if (demoTimer !== null) {
    stopDemo();
    return;
  }
  const order: BgmSong[] = ['day', 'night', 'battle'];
  let i = 0;
  play(order[0]);
  $('demoScenes').classList.add('on');
  demoTimer = setInterval(() => {
    i = (i + 1) % order.length;
    play(order[i]);
  }, 12000);
});

// 画面ごとの倍率・達成のときの BGM 下げ
for (const [label, fn] of [
  ['あそぶ（1.0）', () => mixer.setScreenLevel(1)],
  ['もちもの（0.7）', () => mixer.setScreenLevel(0.7)],
  ['案内画面（0.4）', () => mixer.setScreenLevel(0.4)],
  ['達成（duck 1.4 秒）', () => mixer.duck()],
  ['おめでとう画面（下げたまま）', () => mixer.holdDuck(true)],
  ['おめでとうを閉じる', () => mixer.holdDuck(false)],
] as const) {
  const b = document.createElement('button');
  b.className = 'snd';
  b.textContent = label;
  b.addEventListener('click', () => {
    unlock();
    fn();
    refresh();
  });
  $('screens').appendChild(b);
}

const ui = createSoundSettings(
  {
    audio,
    fx,
    onChange: () => {
      mixer.apply();
      persist.save();
    },
  },
  $('settingsBox'),
);
ui.el.querySelector<HTMLButtonElement>('.ss-open')!.click(); // 試聴ページでは つまみを開いておく

function refresh(): void {
  for (const [k, b] of songButtons) b.classList.toggle('on', k === 'stop' ? bgm.current() === null : bgm.current() === k);
  const c = bgm.chord();
  status.textContent =
    `AudioContext: ${mixer.contextState()}\n` +
    `いまの曲: ${bgm.current() ? NAMES[bgm.current()!] : 'なし'}（鳴っている曲 ${bgm.songCount()}・音の部品 ${bgm.voices()}）\n` +
    `いまの和音: ${c.name}\n` +
    `画面の倍率: ${mixer.screenLevel()}　BGM 下げ: ${mixer.ducking() ? 'ちゅう' : 'なし'}\n` +
    `全体 ${audio.masterVolume.toFixed(2)}・おんがく ${audio.bgmVolume.toFixed(2)}・こうかおん ${fx.fxVolume.toFixed(2)}${audio.audioMuted ? '（ミュート中）' : ''}`;
}
setInterval(refresh, 200);
refresh();

document.addEventListener('visibilitychange', () => mixer.setHidden(document.hidden));

// 数で見る
$('measure').addEventListener('click', async () => {
  const out = $('measureOut');
  out.textContent = '計算中…';
  const f = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '-');
  let html = `<p class="note">preview.html の「数で見る」と同じ測り方（2 周・リミッターの前・BGM の大きさ ${MIX.bgmDefault}）。つなぎ目は 1 周めの終わり → 2 周めの頭。</p>` +
    '<table><tr><th>曲</th><th>長さ 秒</th><th>ピーク dB</th><th>いちばん大きい 50ms dB</th><th>平均 dB</th><th>つなぎ目の前後 1 秒の差 dB</th><th>つなぎ目の段差 / 曲の中の最大</th></tr>';
  for (const key of ['day', 'night', 'battle'] as const) {
    const r = await renderBgm(OfflineAudioContext, key, { laps: 2 });
    const l = levelStats(r.samples, r.sampleRate);
    const s = seamStats(r.samples, r.sampleRate, r.start + r.seconds);
    html += `<tr><td>${NAMES[key]}</td><td>${r.seconds.toFixed(1)}</td><td>${f(l.peakDb)}</td><td>${f(l.loud50Db)}</td><td>${f(l.rmsDb)}</td><td>${s.levelDiffDb.toFixed(2)}</td><td>${s.stepRatio.toFixed(3)}</td></tr>`;
  }
  out.innerHTML = html + '</table>';
});
