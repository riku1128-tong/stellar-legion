'use strict';
// 効果音。音声ファイルは使わず、WebAudio でその場で合成する。
// 重厚感を出すため、
//  ・どの音にも低い「どん」という芯（サイン波の急降下）を重ねる
//  ・爆発・砲撃・被弾は歪み（ドライブ）を通して荒々しくする
//  ・全体に残響（リバーブ）をかけて空間の広さを出す
//  ・最後にコンプレッサーを通し、音が重なっても割れないようにする
SL.Audio = (function () {
  let ctx = null;
  let bus = null;
  let muted = false;
  let budget = 0;          // 1 フレームに鳴らす音の上限
  const lastPlay = {};     // 同じ音を鳴らした時刻（鳴らしすぎ防止）
  const MIN_GAP = { shot: 0.05, hit: 0.045, beam: 0.06, missile: 0.07, shell: 0.08, slash: 0.05, explode: 0.06 };

  function makeNoise(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // 残響用のインパルス応答（だんだん弱くなるノイズ）
  function makeImpulse(c, sec, decay) {
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function driveCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  // 出力の経路：音 → (歪み) → マスター → コンプレッサー → スピーカー、と、残響への送り
  function buildBus(c, dest) {
    const master = c.createGain();
    master.gain.value = 0.55;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(dest);
    const verb = c.createConvolver();
    verb.buffer = makeImpulse(c, 1.8, 2.8);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.35;
    verb.connect(verbOut);
    verbOut.connect(master);
    const drive = c.createWaveShaper();
    drive.curve = driveCurve(8);
    drive.oversample = '2x';
    const driveOut = c.createGain();
    driveOut.gain.value = 0.5;
    drive.connect(driveOut);
    driveOut.connect(master);
    return { c, master, verb, drive, noise: makeNoise(c) };
  }

  function route(B, node, o) {
    node.connect(o.drive ? B.drive : B.master);
    const send = o.verb === undefined ? 0.25 : o.verb;
    if (send > 0) {
      const s = B.c.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(B.verb);
    }
  }

  function envelope(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // 音程が f0 から f1 へ下がる（上がる）音
  //  o: { delay, attack, drive: 歪みを通す, verb: 残響への送り量 }
  function tone(B, type, f0, f1, dur, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    envelope(g, t, vol, o.attack || 0.004, dur);
    osc.connect(g);
    route(B, g, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // フィルターを通したノイズ（爆発・噴射・破裂の材料）
  //  o: { delay, attack, filter: 'lowpass' | 'bandpass' | 'highpass', f0, f1, q, drive, verb }
  function noise(B, dur, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = B.noise;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0 || 2000, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 || 200), t + dur);
    const g = c.createGain();
    envelope(g, t, vol, o.attack || 0.003, dur);
    src.connect(f);
    f.connect(g);
    route(B, g, o);
    src.start(t, Math.random() * 1.0);
    src.stop(t + dur + 0.05);
  }

  const SFX = {
    // マシンライフル・連射砲：乾いた破裂音 + 腹に響く低音
    shot: (B, v) => {
      noise(B, 0.08, 0.55 * v, { filter: 'bandpass', f0: 2600, f1: 1100, q: 1.2, verb: 0.12 });
      tone(B, 'sine', 180, 48, 0.14, 0.7 * v, { verb: 0.05 });
      tone(B, 'square', 90, 40, 0.06, 0.15 * v, { drive: true, verb: 0 });
    },
    // ビーム：うなる低い鋸歯 + 高い擦過音
    beam: (B, v) => {
      tone(B, 'sawtooth', 520, 140, 0.28, 0.22 * v, { verb: 0.35 });
      tone(B, 'sine', 160, 55, 0.3, 0.5 * v, { verb: 0.1 });
      noise(B, 0.2, 0.18 * v, { filter: 'highpass', f0: 3000, f1: 1200, verb: 0.3 });
    },
    // ミサイル：噴射の「しゅごっ」 + 低いうなり
    missile: (B, v) => {
      noise(B, 0.55, 0.45 * v, { filter: 'lowpass', f0: 2600, f1: 500, attack: 0.03, verb: 0.3 });
      tone(B, 'sawtooth', 110, 55, 0.5, 0.12 * v, { drive: true });
      tone(B, 'sine', 80, 45, 0.3, 0.5 * v);
    },
    // キャノン・バズーカ：重い発射音
    shell: (B, v) => {
      tone(B, 'sine', 120, 32, 0.55, 1.0 * v, { verb: 0.3 });
      noise(B, 0.4, 0.6 * v, { filter: 'lowpass', f0: 3200, f1: 140, drive: true, verb: 0.4 });
      tone(B, 'square', 70, 30, 0.2, 0.2 * v, { drive: true, verb: 0 });
    },
    // 被弾：装甲にめり込む「がつん」
    hit: (B, v) => {
      tone(B, 'square', 240, 70, 0.12, 0.25 * v, { drive: true, verb: 0.15 });
      noise(B, 0.08, 0.4 * v, { filter: 'bandpass', f0: 2200, f1: 700, q: 1.5, verb: 0.15 });
      tone(B, 'sine', 110, 50, 0.12, 0.45 * v, { verb: 0 });
    },
    // 格闘の振り：光の刃がうなる
    slash: (B, v) => {
      tone(B, 'sawtooth', 110, 330, 0.26, 0.2 * v, { verb: 0.3 });
      tone(B, 'sine', 70, 140, 0.26, 0.4 * v);
      noise(B, 0.22, 0.2 * v, { filter: 'bandpass', f0: 600, f1: 3500, q: 0.8, attack: 0.04, verb: 0.25 });
    },
    // 爆発：長く低い轟音 + 破片のはじける音
    explode: (B, v) => {
      noise(B, 1.2, 0.9 * v, { filter: 'lowpass', f0: 1800, f1: 45, drive: true, verb: 0.55 });
      tone(B, 'sine', 75, 22, 1.0, 1.1 * v, { verb: 0.3 });
      noise(B, 0.35, 0.3 * v, { filter: 'bandpass', f0: 3500, f1: 900, q: 1, delay: 0.04, verb: 0.3 });
    },
    // 巨大機・戦艦の爆発：何度も続く轟音
    bigExplode: (B, v) => {
      noise(B, 2.4, 1.0 * v, { filter: 'lowpass', f0: 1400, f1: 30, drive: true, verb: 0.7 });
      tone(B, 'sine', 60, 18, 2.0, 1.2 * v, { verb: 0.4 });
      for (const d of [0.18, 0.42, 0.7]) {
        noise(B, 0.8, 0.6 * v, { filter: 'lowpass', f0: 1200, f1: 60, delay: d, drive: true, verb: 0.5 });
        tone(B, 'sine', 55, 25, 0.7, 0.7 * v, { delay: d });
      }
    },
    // 極太ビームのチャージ：低くうなりながら上がっていく
    charge: (B, v) => {
      tone(B, 'sawtooth', 70, 600, 1.35, 0.12 * v, { attack: 0.3, verb: 0.4 });
      tone(B, 'sine', 45, 110, 1.35, 0.35 * v, { attack: 0.3 });
    },
    // 極太ビームの発射
    mega: (B, v) => {
      tone(B, 'sawtooth', 220, 55, 0.9, 0.35 * v, { drive: true, verb: 0.5 });
      noise(B, 1.0, 0.5 * v, { filter: 'lowpass', f0: 4000, f1: 150, verb: 0.5 });
      tone(B, 'sine', 65, 28, 1.1, 1.0 * v, { verb: 0.3 });
    },
    // ショックウィップ：電撃
    zap: (B, v) => {
      tone(B, 'square', 1100, 260, 0.22, 0.15 * v, { drive: true, verb: 0.3 });
      noise(B, 0.25, 0.3 * v, { filter: 'bandpass', f0: 5000, f1: 1500, q: 2, verb: 0.3 });
      tone(B, 'sine', 90, 50, 0.2, 0.35 * v);
    },
    // 変形：機械が組み替わる音
    transform: (B, v) => {
      tone(B, 'square', 160, 420, 0.16, 0.12 * v, { drive: true, verb: 0.3 });
      noise(B, 0.06, 0.35 * v, { filter: 'bandpass', f0: 3000, f1: 2000, q: 3, verb: 0.2 });
      noise(B, 0.06, 0.35 * v, { filter: 'bandpass', f0: 2400, f1: 1600, q: 3, delay: 0.14, verb: 0.2 });
      tone(B, 'sine', 90, 60, 0.25, 0.4 * v, { delay: 0.12 });
    },
    // 向きを変える（Ctrl）
    turn: (B, v) => {
      noise(B, 0.14, 0.25 * v, { filter: 'bandpass', f0: 900, f1: 2200, q: 1, verb: 0.2 });
      tone(B, 'sine', 120, 70, 0.12, 0.3 * v);
    },
    // 戦艦に入った
    dock: (B, v) => {
      tone(B, 'triangle', 330, 330, 0.25, 0.2 * v, { verb: 0.4 });
      tone(B, 'triangle', 495, 495, 0.35, 0.2 * v, { delay: 0.12, verb: 0.4 });
      tone(B, 'sine', 80, 50, 0.4, 0.4 * v);
    },
    // 画面の操作音（軽いまま）
    select: (B, v) => tone(B, 'triangle', 660, 660, 0.07, 0.18 * v, { verb: 0.1 }),
    start: (B, v) => {
      [392, 523, 784].forEach((f, i) => tone(B, 'square', f, f, 0.14, 0.12 * v, { delay: i * 0.1, verb: 0.3 }));
      tone(B, 'sine', 65, 35, 0.8, 0.8 * v, { delay: 0.2, verb: 0.4 });
    },
    tick: (B, v) => tone(B, 'square', 1000, 1000, 0.05, 0.1 * v, { verb: 0.1 }),
    win: (B, v) => {
      [523, 659, 784, 1046].forEach((f, i) => tone(B, 'square', f, f, 0.22, 0.12 * v, { delay: i * 0.13, verb: 0.4 }));
      tone(B, 'sine', 65, 40, 1.2, 0.7 * v, { delay: 0.4, verb: 0.4 });
    },
  };

  // ブラウザの制限で、最初のキー入力のあとでないと音が出せない
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        bus = buildBus(ctx, ctx.destination);
      } catch (e) {
        ctx = null;
        bus = null;
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('keydown', ensure);
  window.addEventListener('pointerdown', ensure);

  function play(name, vol = 1) {
    if (!ctx || !bus || muted || ctx.state !== 'running' || vol < 0.05) return;
    if (budget <= 0) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] || 0.03;
    if (lastPlay[name] !== undefined && now - lastPlay[name] < gap) return;
    const fn = SFX[name];
    if (!fn) return;
    budget--;
    lastPlay[name] = now;
    fn(bus, Math.min(1, vol));
  }

  function frame() { budget = 4; }
  function toggleMute() { muted = !muted; return muted; }

  // 動作確認用：音を画面に出さずに合成して、大きさと低音の割合を調べる
  async function analyze(name) {
    const sr = 44100;
    const oc = new OfflineAudioContext(2, sr * 3, sr);
    const B = buildBus(oc, oc.destination);
    SFX[name](B, 1);
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    const a = 1 - Math.exp((-2 * Math.PI * 200) / sr); // 200Hz 以下を取り出す簡単なフィルター
    let peak = 0, sum = 0, low = 0, lp = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (Math.abs(x) > peak) peak = Math.abs(x);
      sum += x * x;
      lp += a * (x - lp);
      low += lp * lp;
      if (Math.abs(x) > 0.01) last = i;
    }
    return { peak: Math.round(peak * 1000) / 1000, lowShare: Math.round((low / Math.max(sum, 1e-9)) * 100) / 100, seconds: Math.round((last / sr) * 100) / 100 };
  }

  return { ensure, play, frame, toggleMute, analyze, names: Object.keys(SFX), get muted() { return muted; } };
})();
