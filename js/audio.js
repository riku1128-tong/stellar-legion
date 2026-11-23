'use strict';
// 効果音。音声ファイルは使わず、WebAudio でその場で合成する。
//
// 重く低い音にするための作り:
//  ・主役は 60〜250Hz の「胴鳴り」。ノートPCやイヤホンでは 60Hz 以下がほとんど鳴らないため、
//    低音を歪ませて倍音を作り、小さいスピーカーでも重さが伝わるようにしている
//  ・高い「パチッ」という成分は短く小さくし、全体に高音を削るイコライザーをかける
//  ・暗く長いホールの残響をかける
//  ・コンプレッサーで音量をそろえ、重なっても割れないようにする
SL.Audio = (function () {
  let ctx = null;
  let bus = null;
  let muted = false;
  let budget = 0;          // 1 フレームに鳴らす音の上限
  const lastPlay = {};     // 同じ音を鳴らした時刻（鳴らしすぎ防止）
  const MIN_GAP = { shot: 0.07, hit: 0.06, beam: 0.07, missile: 0.08, shell: 0.09, slash: 0.06, explode: 0.07, zap: 0.08 };

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
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function biquad(c, type, freq, gain, q) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (gain !== undefined) f.gain.value = gain;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  // 出力の経路:
  //  音 → (歪み → 高音カット) → マスター → 低音を持ち上げ・高音を削るイコライザー
  //     → コンプレッサー → 最低域のカット → スピーカー
  //  音 → 残響（暗いホール）→ マスター
  function buildBus(c, dest) {
    const master = c.createGain();
    master.gain.value = 0.6;
    const lowShelf = biquad(c, 'lowshelf', 150, 6);
    const lowPeak = biquad(c, 'peaking', 95, 4, 0.9);
    const highShelf = biquad(c, 'highshelf', 2800, -9);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.4;
    const makeup = c.createGain();
    makeup.gain.value = 1.15;
    // 小さいスピーカーで鳴らない最低域は、音量の余裕を食うだけなので切る
    const rumbleCut = biquad(c, 'highpass', 50, undefined, 0.7);
    // 最後のリミッター：どんなに重なっても音割れしないように頭を抑える
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    const outGain = c.createGain();
    outGain.gain.value = 0.9;
    master.connect(lowShelf);
    lowShelf.connect(lowPeak);
    lowPeak.connect(highShelf);
    highShelf.connect(comp);
    comp.connect(makeup);
    makeup.connect(rumbleCut);
    rumbleCut.connect(limiter);
    limiter.connect(outGain);
    outGain.connect(dest);

    const verb = c.createConvolver();
    verb.buffer = makeImpulse(c, 2.2, 2.6);
    const verbTone = biquad(c, 'lowpass', 1800);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.5;
    verb.connect(verbTone);
    verbTone.connect(verbOut);
    verbOut.connect(master);

    const drive = c.createWaveShaper();
    drive.curve = driveCurve(14);
    drive.oversample = '2x';
    const driveTone = biquad(c, 'lowpass', 2200);
    const driveOut = c.createGain();
    driveOut.gain.value = 0.55;
    drive.connect(driveTone);
    driveTone.connect(driveOut);
    driveOut.connect(master);
    return { c, master, verb, drive, noise: makeNoise(c) };
  }

  function route(B, node, o) {
    node.connect(o.drive ? B.drive : B.master);
    const send = o.verb === undefined ? 0.15 : o.verb;
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

  // 音程が f0 から f1 へ変わる音
  //  o: { delay, attack, lp: 高音を切る周波数, drive: 歪みを通す, verb: 残響への送り量 }
  function tone(B, type, f0, f1, dur, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    envelope(g, t, vol, o.attack || 0.005, dur);
    if (o.lp) {
      const f = biquad(c, 'lowpass', o.lp, undefined, 0.8);
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    route(B, g, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // フィルターを通したノイズ（爆発・噴射・衝撃の材料）
  //  o: { delay, attack, filter: 'lowpass' | 'bandpass' | 'highpass', f0, f1, q, drive, verb }
  function noise(B, dur, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = B.noise;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 || 150), t + dur);
    const g = c.createGain();
    envelope(g, t, vol, o.attack || 0.004, dur);
    src.connect(f);
    f.connect(g);
    route(B, g, o);
    src.start(t, Math.random() * 1.0);
    src.stop(t + dur + 0.05);
  }

  // 低音の芯は 60Hz より上（小さいスピーカーでも鳴る帯域）で鳴らし、歪みで倍音を足す。
  // 何度も鳴る音（射撃・被弾・振り）は残響を控えめにして、連射しても濁らないようにする
  const SFX = {
    // マシンライフル・連射砲：腹に響く「ドッ」と、短く小さい破裂音
    shot: (B, v) => {
      tone(B, 'sine', 160, 80, 0.2, 0.8 * v, { drive: true, verb: 0.08 });
      noise(B, 0.18, 0.6 * v, { filter: 'lowpass', f0: 700, f1: 200, verb: 0.1 });
      noise(B, 0.03, 0.18 * v, { filter: 'bandpass', f0: 1200, f1: 900, q: 1, verb: 0 });
    },
    // ビーム：低くうなる「ヴォン」
    beam: (B, v) => {
      tone(B, 'sawtooth', 150, 75, 0.32, 0.4 * v, { lp: 700, drive: true, verb: 0.2 });
      tone(B, 'sine', 120, 70, 0.32, 0.5 * v, { verb: 0.1 });
      noise(B, 0.28, 0.25 * v, { filter: 'lowpass', f0: 900, f1: 260, verb: 0.2 });
    },
    // ミサイル：低い噴射の「ゴォッ」
    missile: (B, v) => {
      noise(B, 0.65, 0.6 * v, { filter: 'lowpass', f0: 900, f1: 220, attack: 0.06, verb: 0.25 });
      tone(B, 'sawtooth', 95, 65, 0.55, 0.3 * v, { lp: 450, drive: true, verb: 0.1 });
      tone(B, 'sine', 130, 70, 0.28, 0.6 * v, { verb: 0.1 });
    },
    // キャノン・バズーカ：重い砲声「ドォン」
    shell: (B, v) => {
      tone(B, 'sine', 125, 55, 0.8, 1.0 * v, { drive: true, verb: 0.35 });
      tone(B, 'sine', 90, 50, 0.9, 0.6 * v, { verb: 0.2 });
      noise(B, 0.7, 0.8 * v, { filter: 'lowpass', f0: 1100, f1: 110, drive: true, verb: 0.4 });
      noise(B, 0.05, 0.25 * v, { filter: 'bandpass', f0: 900, f1: 700, q: 1, verb: 0.1 });
    },
    // 被弾：装甲に響く「ゴッ」と鈍い金属音
    hit: (B, v) => {
      tone(B, 'sine', 180, 75, 0.2, 0.8 * v, { drive: true, verb: 0.08 });
      noise(B, 0.14, 0.5 * v, { filter: 'lowpass', f0: 900, f1: 260, verb: 0.08 });
      tone(B, 'square', 140, 95, 0.12, 0.18 * v, { lp: 1200, verb: 0.08 });
    },
    // 格闘の振り：低くうなる光の刃「ブォン」
    slash: (B, v) => {
      tone(B, 'sawtooth', 80, 170, 0.36, 0.4 * v, { lp: 900, drive: true, verb: 0.15 });
      tone(B, 'sine', 75, 130, 0.36, 0.5 * v, { verb: 0.08 });
      noise(B, 0.3, 0.28 * v, { filter: 'bandpass', f0: 400, f1: 1500, q: 0.9, attack: 0.05, verb: 0.15 });
    },
    // 爆発：長く低い轟音「ドドォォン」
    explode: (B, v) => {
      noise(B, 1.8, 1.0 * v, { filter: 'lowpass', f0: 700, f1: 60, drive: true, verb: 0.55 });
      tone(B, 'sine', 110, 48, 1.4, 1.0 * v, { drive: true, verb: 0.35 });
      tone(B, 'sine', 80, 45, 1.6, 0.6 * v, { verb: 0.3 });
      noise(B, 0.4, 0.35 * v, { filter: 'lowpass', f0: 1500, f1: 300, delay: 0.03, verb: 0.3 });
    },
    // 巨大機・戦艦の爆発：何度も続く大きな轟音
    bigExplode: (B, v) => {
      noise(B, 3.0, 1.1 * v, { filter: 'lowpass', f0: 600, f1: 55, drive: true, verb: 0.7 });
      tone(B, 'sine', 100, 42, 2.4, 1.1 * v, { drive: true, verb: 0.45 });
      for (const d of [0.22, 0.55, 0.95]) {
        noise(B, 1.1, 0.8 * v, { filter: 'lowpass', f0: 800, f1: 70, delay: d, drive: true, verb: 0.5 });
        tone(B, 'sine', 90, 45, 1.0, 0.8 * v, { delay: d, drive: true, verb: 0.2 });
      }
    },
    // 極太ビームのチャージ：地鳴りのように上がっていく
    charge: (B, v) => {
      tone(B, 'sawtooth', 60, 240, 1.35, 0.3 * v, { lp: 650, attack: 0.3, drive: true, verb: 0.3 });
      tone(B, 'sine', 60, 120, 1.35, 0.5 * v, { attack: 0.3 });
    },
    // 極太ビームの発射
    mega: (B, v) => {
      tone(B, 'sawtooth', 110, 50, 1.3, 0.55 * v, { lp: 900, drive: true, verb: 0.5 });
      tone(B, 'sine', 90, 48, 1.4, 1.0 * v, { verb: 0.3 });
      noise(B, 1.2, 0.7 * v, { filter: 'lowpass', f0: 1400, f1: 110, verb: 0.5 });
    },
    // ショックウィップ：低い電撃のうなり
    zap: (B, v) => {
      tone(B, 'square', 260, 100, 0.25, 0.28 * v, { lp: 1600, drive: true, verb: 0.15 });
      noise(B, 0.25, 0.3 * v, { filter: 'bandpass', f0: 1800, f1: 700, q: 1.5, verb: 0.15 });
      tone(B, 'sine', 120, 70, 0.25, 0.5 * v, { verb: 0.05 });
    },
    // 変形：重い機械が組み替わる「ガシャン」
    transform: (B, v) => {
      noise(B, 0.08, 0.7 * v, { filter: 'lowpass', f0: 800, f1: 300, verb: 0.3 });
      noise(B, 0.1, 0.8 * v, { filter: 'lowpass', f0: 700, f1: 250, delay: 0.14, verb: 0.4 });
      tone(B, 'sine', 120, 55, 0.3, 0.7 * v, { delay: 0.12, drive: true });
      tone(B, 'square', 90, 160, 0.2, 0.2 * v, { lp: 800 });
    },
    // 向きを変える（Ctrl）
    turn: (B, v) => {
      noise(B, 0.14, 0.4 * v, { filter: 'lowpass', f0: 600, f1: 200, verb: 0.2 });
      tone(B, 'sine', 100, 55, 0.16, 0.5 * v);
    },
    // 戦艦に入った
    dock: (B, v) => {
      tone(B, 'triangle', 220, 220, 0.3, 0.25 * v, { verb: 0.5 });
      tone(B, 'triangle', 330, 330, 0.4, 0.25 * v, { delay: 0.14, verb: 0.5 });
      tone(B, 'sine', 70, 45, 0.5, 0.6 * v);
    },
    // 画面の操作音（軽いまま）
    select: (B, v) => tone(B, 'triangle', 660, 660, 0.07, 0.18 * v, { verb: 0.1 }),
    start: (B, v) => {
      [392, 523, 784].forEach((f, i) => tone(B, 'square', f, f, 0.14, 0.12 * v, { delay: i * 0.1, verb: 0.3, lp: 2500 }));
      tone(B, 'sine', 65, 30, 1.0, 1.0 * v, { delay: 0.2, verb: 0.5, drive: true });
    },
    tick: (B, v) => tone(B, 'square', 1000, 1000, 0.05, 0.1 * v, { verb: 0.1 }),
    win: (B, v) => {
      [523, 659, 784, 1046].forEach((f, i) => tone(B, 'square', f, f, 0.22, 0.12 * v, { delay: i * 0.13, verb: 0.4, lp: 2500 }));
      tone(B, 'sine', 65, 35, 1.4, 0.9 * v, { delay: 0.4, verb: 0.5, drive: true });
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

  // 動作確認用：音を画面に出さずに合成して、大きさと周波数の内訳を調べる
  //  sub: 60Hz 以下, body: 60〜250Hz（胴鳴り）, high: 2kHz 以上 の割合（%）
  async function analyze(name) {
    const sr = 44100;
    const oc = new OfflineAudioContext(2, sr * 4, sr);
    const B = buildBus(oc, oc.destination);
    SFX[name](B, 1);
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    const one = (fc) => 1 - Math.exp((-2 * Math.PI * fc) / sr);
    const a60 = one(60), a250 = one(250), a2k = one(2000);
    let l60 = 0, l250 = 0, l2k = 0, sum = 0, sub = 0, body = 0, high = 0, peak = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      l60 += a60 * (x - l60);
      l250 += a250 * (x - l250);
      l2k += a2k * (x - l2k);
      sum += x * x;
      sub += l60 * l60;
      body += (l250 - l60) ** 2;
      high += (x - l2k) ** 2;
      if (Math.abs(x) > peak) peak = Math.abs(x);
      if (Math.abs(x) > 0.01) last = i;
    }
    const pct = (e) => Math.round((e / Math.max(sum, 1e-9)) * 100);
    return { peak: Math.round(peak * 100) / 100, seconds: Math.round((last / sr) * 100) / 100, sub: pct(sub), body: pct(body), high: pct(high) };
  }

  return { ensure, play, frame, toggleMute, analyze, names: Object.keys(SFX), get muted() { return muted; } };
})();
