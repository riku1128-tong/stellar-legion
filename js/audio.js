'use strict';
// 効果音。音声ファイルは使わず、WebAudio でその場で合成する。
SL.Audio = (function () {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let budget = 0; // 1 フレームに鳴らす音の上限（うるさくなりすぎないように）

  // ブラウザの制限で、最初のキー入力のあとでないと音が出せない
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        ctx = null;
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('keydown', ensure);
  window.addEventListener('pointerdown', ensure);

  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    shot: (v) => tone('square', 900, 300, 0.06, 0.12 * v),
    beam: (v) => tone('sawtooth', 1500, 400, 0.12, 0.10 * v),
    missile: (v) => noise(0.25, 0.18 * v, 3000, 600),
    shell: (v) => { tone('square', 220, 80, 0.12, 0.14 * v); noise(0.12, 0.12 * v, 1500, 200); },
    hit: (v) => noise(0.05, 0.16 * v, 5000, 1500),
    slash: (v) => tone('sawtooth', 300, 1400, 0.1, 0.10 * v),
    explode: (v) => { noise(0.5, 0.45 * v, 1800, 60); tone('sine', 120, 40, 0.4, 0.3 * v); },
    bigExplode: (v) => { noise(1.1, 0.6 * v, 1400, 40); tone('sine', 90, 25, 0.9, 0.4 * v); },
    select: (v) => tone('square', 660, 660, 0.06, 0.12 * v),
    start: (v) => { tone('square', 440, 440, 0.08, 0.12 * v); tone('square', 660, 660, 0.08, 0.12 * v, 0.09); tone('square', 880, 880, 0.16, 0.12 * v, 0.18); },
    tick: (v) => tone('square', 1200, 1200, 0.04, 0.08 * v),
    win: (v) => { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.18, 0.12 * v, i * 0.12)); },
  };

  function play(name, vol = 1) {
    if (!ctx || muted || ctx.state !== 'running' || vol < 0.05) return;
    if (budget <= 0) return;
    budget--;
    const fn = SFX[name];
    if (fn) fn(Math.min(1, vol));
  }

  function frame() { budget = 6; }
  function toggleMute() { muted = !muted; return muted; }

  return { ensure, play, frame, toggleMute, get muted() { return muted; } };
})();
