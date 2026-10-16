// 以前のアンケートページ「りっくん テーマきめ会」の音の聞き比べ。オーナーが「いい感じ」と言っていた。参考用。
// ぼうけん: chipB=ピコピコ softB=ゆったり marchAdv=マーチ mystAdv=ふしぎ
// たたかい: chipBattle=はやい softBattle=やさしい coolBattle=かっこいい tenseBattle=ドキドキ
// たからをひろった: seChip=ピコッ seSoft=ポロン seKira=キラキラ sePokon=ポコン
// （どれを選んだかの記録は残っていない）
let ac = null;
const N = n => 440*Math.pow(2,(n-9)/12);
function env(t, d, g){ const v=ac.createGain(); v.gain.setValueAtTime(0,t); v.gain.linearRampToValueAtTime(g,t+0.015); v.gain.exponentialRampToValueAtTime(0.0001,t+d); v.connect(ac.destination); return v; }
function tone(f, t, d, type, g, f2){ const o=ac.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t); if(f2) o.frequency.exponentialRampToValueAtTime(f2,t+d*0.7); o.connect(env(t,d,g)); o.start(t); o.stop(t+d+0.05); }
function noise(t, d, g){ const len=Math.floor(ac.sampleRate*d), b=ac.createBuffer(1,len,ac.sampleRate), x=b.getChannelData(0); for(let k=0;k<len;k++) x[k]=Math.random()*2-1; const s=ac.createBufferSource(); s.buffer=b; s.connect(env(t,d,g)); s.start(t); }
function seq(notes, step, type, g, t0, len=1.6){ notes.forEach((n,i)=>{ if(n!==null) tone(N(n), t0+i*step, step*len, type, g); }); }
const SONGS = {
  chipB: t => { seq([7,7,12,7,5,7,12,14,12,10,7,5,7],.12,'square',.05,t); seq([-12,null,-5,null,-12,null,-5,null,-10,null,-5,null,-12],.12,'triangle',.08,t); },
  softB: t => { seq([0,2,4,7,4,2,4,0],.38,'triangle',.13,t); seq([-12,null,-5,null,-7,null,-12,null],.38,'sine',.08,t,3); },
  chipBattle: t => { seq([12,12,15,12,17,15,12,10,12,12,15,17,19,17,15,12],.09,'square',.05,t); for(let k=0;k<16;k+=2) noise(t+k*.09,.05,.08); seq([-12,-12,-9,-12,-7,-9,-12,-14,-12,-12,-9,-7,-5,-7,-9,-12],.09,'triangle',.07,t,1); },
  softBattle: t => { seq([4,null,7,null,9,7,4,null,2,null,4,null],.22,'triangle',.12,t); seq([-8,null,null,null,-5,null,null,null,-10,null,null,null],.22,'sine',.08,t,4); },
  seChip: t => { tone(N(12),t,.06,'square',.06); tone(N(19),t+.06,.12,'square',.06); },
  seSoft: t => { tone(N(16),t,.6,'sine',.14); tone(N(23),t+.08,.7,'sine',.08); },
  marchAdv: t => { seq([0,0,4,7,null,7,9,7,4,null,0,2,4,null],.15,'sawtooth',.03,t,1.2); seq([-12,null,-5,null,-12,null,-5,null,-12,null,-5,null,-12,null],.15,'triangle',.09,t,1); for(let k=0;k<14;k+=2) noise(t+k*.15,.04,.05); },
  mystAdv: t => { seq([12,16,18,22,null,18,16,12,null,10,14,18],.26,'triangle',.07,t,2.5); seq([24,null,null,28,null,null,30,null,null,28],.26,'sine',.035,t,3); },
  coolBattle: t => { seq([0,0,3,0,5,3,0,-2,0,0,3,5,7,5,3,0].map(n=>n-12),.1,'sawtooth',.035,t,.9); seq([-24,-24,-24,-24,-21,-21,-21,-21,-19,-19,-19,-19,-24,-24,-24,-24],.1,'square',.025,t,.8); for(let k=0;k<16;k++){ if(k%4===0) noise(t+k*.1,.08,.11); else if(k%4===2) noise(t+k*.1,.03,.05); } },
  tenseBattle: t => { seq([-12,-11,-12,-11,-12,-11,-12,-11,-12,-11,-12,-11],.15,'triangle',.1,t,.8); seq([null,null,null,6,null,null,null,7,null,null,null,6],.15,'sine',.05,t,3); for(let k=0;k<12;k+=4){ tone(60,t+k*.15,.12,'sine',.25); tone(55,t+k*.15+.16,.12,'sine',.18); } },
  seKira: t => { [12,16,19,24,28,31].forEach((n,k)=>tone(N(n),t+k*.04,.35,'sine',.07)); },
  sePokon: t => { tone(N(0),t,.18,'sine',.2,N(12)); tone(N(7),t+.12,.16,'sine',.12,N(19)); },
};
