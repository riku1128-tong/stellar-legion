'use strict';
// 効果音。音声ファイルは使わず、プログラムで音を作る。
//
// 電子音っぽさをなくすため、戦闘の音は「音程のある波」ではなく「ノイズ」を芯にしている。
// 本物の砲声や爆発と同じく、次の層を重ねて作る:
//   破裂（バッ）   … ごく短い、明るめのノイズ
//   胴（ドォ）     … こもっていくノイズ（高い音から低い音へ急に絞る）
//   地鳴り（ゴォォ）… 低くこもったノイズの長い余韻
//   破片（パチパチ）… 爆発の後に散らばる小さなはじける音
// 音はゲーム開始時に 1 種類につき 3 通りずつ作っておき（録音済みの素材のように）、
// 鳴らすたびに選び、少し高さを変えて、連射しても機械的に揃わないようにする。
// メニューの操作音だけは、わかりやすいように音程のある音のまま。
SL.Audio = (function () {
  let ctx = null;
  let bus = null;
  let muted = false;
  let budget = 0;          // 1 フレームに鳴らす音の上限
  const lastPlay = {};     // 同じ音を鳴らした時刻（鳴らしすぎ防止）
  const MIN_GAP = { shot: 0.07, hit: 0.06, beam: 0.07, missile: 0.08, shell: 0.09, slash: 0.06, explode: 0.07, zap: 0.08 };
  const VARIANTS = 3;

  // ---------------- 素材づくり（サンプルの配列を直接計算する） ----------------
  const rand = () => Math.random() * 2 - 1;
  const coefOf = (fc, sr) => { const w = (2 * Math.PI * fc) / sr; return w / (1 + w); }; // 1 次ローパスの係数

  // 「ドーン」の層：破裂・胴・地鳴り
  //  o: { at, crack, crackLp, body, bodyFrom, bodyTo, bodySweep, bodyDecay, rumble, rumbleLp, rumbleAttack, rumbleDecay }
  function addBoom(out, sr, o) {
    const start = Math.floor((o.at || 0) * sr);
    const n = out.length;
    let brown = 0;
    let c1 = 0, b1 = 0, b2 = 0, r1 = 0, r2 = 0;
    const crackDecay = Math.exp(-1 / (0.012 * sr));
    const bodyDecay = Math.exp(-1 / ((o.bodyDecay || 0.3) * sr));
    const sweepDecay = Math.exp(-1 / ((o.bodySweep || 0.06) * sr));
    const rumbleDecay = Math.exp(-1 / ((o.rumbleDecay || 0.8) * sr));
    const cCoef = coefOf(o.crackLp || 3500, sr);
    const rCoef = coefOf(o.rumbleLp || 110, sr);
    const rumbleAttack = Math.max(1, (o.rumbleAttack || 0.02) * sr);
    let crackEnv = o.crack || 0, bodyEnv = o.body || 0, rumbleEnv = o.rumble || 0, sweep = 1;
    const from = o.bodyFrom || 1500, to = o.bodyTo || 120;
    for (let i = start, k = 0; i < n; i++, k++) {
      const w = rand();
      brown = (brown + 0.02 * w) / 1.02;
      const bn = brown * 3.5;
      let s = 0;
      if (crackEnv > 1e-4) {
        c1 += cCoef * (w - c1);
        s += crackEnv * c1 * Math.min(1, k / (0.0004 * sr));
        crackEnv *= crackDecay;
      }
      if (bodyEnv > 1e-4) {
        const bc = coefOf(to + (from - to) * sweep, sr);
        b1 += bc * (w * 0.6 + bn - b1);
        b2 += bc * (b1 - b2); // 2 段に重ねて、こもり方を強くする
        s += bodyEnv * b2 * 2.2 * Math.min(1, k / (0.0015 * sr));
        bodyEnv *= bodyDecay;
        sweep *= sweepDecay;
      }
      if (rumbleEnv > 1e-4) {
        r1 += rCoef * (bn - r1);
        r2 += rCoef * (r1 - r2);
        s += rumbleEnv * r2 * 4 * Math.min(1, k / rumbleAttack);
        rumbleEnv *= rumbleDecay;
      }
      if (crackEnv <= 1e-4 && bodyEnv <= 1e-4 && rumbleEnv <= 1e-4) break;
      out[i] += s;
    }
  }

  // 破片がはじける音：まばらな小さい破裂
  //  o: { at, dur, density: 1 秒あたりの数（はじめ）, amp, lp }
  function addCrackle(out, sr, o) {
    const start = Math.floor((o.at || 0) * sr);
    const end = Math.min(out.length, start + Math.floor((o.dur || 0.6) * sr));
    const lpC = coefOf(o.lp || 2500, sr);
    const burstDecay = Math.exp(-1 / (0.003 * sr));
    let amp = 0, lp = 0;
    for (let i = start; i < end; i++) {
      const life = 1 - (i - start) / (end - start);
      if (Math.random() < ((o.density || 60) * life) / sr) amp = (0.4 + Math.random() * 0.6) * (o.amp || 0.4) * life;
      lp += lpC * (rand() * amp - lp);
      out[i] += lp * 2.5;
      amp *= burstDecay;
    }
  }

  // 金属がぶつかる響き（音程のずれた短い響きを重ねる）
  //  o: { at, freqs, decay, amp }
  function addRing(out, sr, o) {
    const start = Math.floor((o.at || 0) * sr);
    const len = Math.min(out.length - start, Math.floor((o.decay || 0.06) * 6 * sr));
    const phases = o.freqs.map(() => Math.random() * Math.PI * 2);
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      let s = 0;
      o.freqs.forEach((f, j) => { s += Math.sin(2 * Math.PI * f * t + phases[j]) / (j + 1); });
      out[start + k] += s * (o.amp || 0.2) * Math.exp(-t / (o.decay || 0.06));
    }
  }

  // 空気を切る音・噴射：帯域を動かすノイズ
  //  o: { at, dur, from, to, q, amp, attack }
  function addWhoosh(out, sr, o) {
    const start = Math.floor((o.at || 0) * sr);
    const len = Math.min(out.length - start, Math.floor((o.dur || 0.4) * sr));
    const attack = Math.max(1, (o.attack || 0.05) * sr);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, a1 = 0, a2 = 0, a0 = 1;
    for (let k = 0; k < len; k++) {
      if (k % 16 === 0) {
        const p = k / len;
        const f = (o.from || 400) * Math.pow((o.to || 1200) / (o.from || 400), p);
        const w0 = (2 * Math.PI * f) / sr;
        const alpha = Math.sin(w0) / (2 * (o.q || 1));
        b0 = alpha;
        a0 = 1 + alpha;
        a1 = -2 * Math.cos(w0);
        a2 = 1 - alpha;
      }
      const x = rand();
      const y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const env = Math.min(1, k / attack) * Math.pow(1 - k / len, 1.5);
      out[start + k] += y * env * (o.amp || 0.5) * 2;
    }
  }

  // 仕上げ：軽く歪ませて荒々しさを足し、大きさをそろえる
  function finish(out, drive) {
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak < 1e-6) return out;
    const k = drive || 1.5;
    const norm = Math.tanh(k);
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh((out[i] / peak) * k) / norm * 0.9;
    // 終わりを 20ms でなめらかに消す
    const fade = Math.min(out.length, 0.02 * 44100);
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
    return out;
  }

  // 各効果音の素材の作り方（sr: サンプリング周波数）
  const RECIPES = {
    // マシンライフル・連射砲：短く重い「ドッ」
    shot: { len: 0.55, drive: 1.6, make(o, sr) {
      addBoom(o, sr, { crack: 0.45, crackLp: 3200, body: 1, bodyFrom: 1600, bodyTo: 190, bodySweep: 0.025, bodyDecay: 0.06, rumble: 0.5, rumbleLp: 160, rumbleDecay: 0.16 });
    } },
    // キャノン・バズーカ：「ドォン」
    shell: { len: 2.2, drive: 2.0, make(o, sr) {
      addBoom(o, sr, { crack: 0.6, crackLp: 2800, body: 1, bodyFrom: 1400, bodyTo: 130, bodySweep: 0.06, bodyDecay: 0.28, rumble: 0.9, rumbleLp: 130, rumbleAttack: 0.03, rumbleDecay: 0.6 });
      addCrackle(o, sr, { at: 0.05, dur: 0.4, density: 40, amp: 0.25, lp: 2200 });
    } },
    // 爆発：「ドーン」と地鳴り、破片
    explode: { len: 3.0, drive: 2.2, make(o, sr) {
      addBoom(o, sr, { crack: 0.5, crackLp: 2600, body: 1, bodyFrom: 1200, bodyTo: 110, bodySweep: 0.1, bodyDecay: 0.5, rumble: 1, rumbleLp: 120, rumbleAttack: 0.05, rumbleDecay: 1.3 });
      addBoom(o, sr, { at: 0.11, body: 0.55, bodyFrom: 900, bodyTo: 90, bodySweep: 0.08, bodyDecay: 0.35 });
      addCrackle(o, sr, { at: 0.08, dur: 0.9, density: 70, amp: 0.35, lp: 2400 });
    } },
    // 巨大機・戦艦の爆発：何度も続く大きな轟音
    bigExplode: { len: 4.6, drive: 2.4, make(o, sr) {
      addBoom(o, sr, { crack: 0.6, crackLp: 2400, body: 1, bodyFrom: 1100, bodyTo: 100, bodySweep: 0.12, bodyDecay: 0.7, rumble: 1, rumbleLp: 110, rumbleAttack: 0.08, rumbleDecay: 2.0 });
      for (const at of [0.3, 0.7, 1.15]) addBoom(o, sr, { at, crack: 0.3, crackLp: 2200, body: 0.8, bodyFrom: 1000, bodyTo: 80, bodySweep: 0.1, bodyDecay: 0.45, rumble: 0.5, rumbleLp: 80, rumbleDecay: 0.9 });
      addCrackle(o, sr, { at: 0.1, dur: 2.0, density: 80, amp: 0.4, lp: 2200 });
    } },
    // 被弾：装甲に響く「ゴッ」と、鈍い金属音
    hit: { len: 0.45, drive: 1.8, make(o, sr) {
      addBoom(o, sr, { crack: 0.4, crackLp: 3000, body: 1, bodyFrom: 1300, bodyTo: 210, bodySweep: 0.02, bodyDecay: 0.05, rumble: 0.35, rumbleLp: 170, rumbleDecay: 0.12 });
      addRing(o, sr, { freqs: [370 + Math.random() * 60, 610, 1030, 1490], decay: 0.06, amp: 0.12 });
    } },
    // ミサイル：噴射の「シュゴォッ」
    missile: { len: 1.1, drive: 1.6, make(o, sr) {
      addWhoosh(o, sr, { dur: 0.9, from: 700, to: 250, q: 0.7, amp: 0.7, attack: 0.04 });
      addBoom(o, sr, { crack: 0.3, crackLp: 2500, body: 0.7, bodyFrom: 900, bodyTo: 160, bodySweep: 0.05, bodyDecay: 0.12, rumble: 0.6, rumbleLp: 140, rumbleAttack: 0.04, rumbleDecay: 0.45 });
    } },
    // ビーム：重く撃ち出す「ドシュッ」
    beam: { len: 0.9, drive: 1.7, make(o, sr) {
      addBoom(o, sr, { crack: 0.35, crackLp: 3000, body: 0.85, bodyFrom: 1800, bodyTo: 220, bodySweep: 0.04, bodyDecay: 0.1, rumble: 0.5, rumbleLp: 150, rumbleDecay: 0.3 });
      addWhoosh(o, sr, { dur: 0.35, from: 1600, to: 300, q: 2.5, amp: 0.45, attack: 0.005 });
    } },
    // 格闘の振り：空気を切り裂く「ブォン」と、重い踏み込み
    slash: { len: 0.75, drive: 1.6, make(o, sr) {
      addWhoosh(o, sr, { dur: 0.32, from: 280, to: 1600, q: 1.4, amp: 0.8, attack: 0.08 });
      addWhoosh(o, sr, { at: 0.06, dur: 0.38, from: 900, to: 240, q: 2, amp: 0.4, attack: 0.03 });
      addBoom(o, sr, { at: 0.04, body: 0.45, bodyFrom: 700, bodyTo: 140, bodySweep: 0.04, bodyDecay: 0.08, rumble: 0.3, rumbleLp: 120, rumbleDecay: 0.2 });
    } },
    // 極太ビームの発射：大きな「ドォォン」と長いうなり
    mega: { len: 2.8, drive: 2.2, make(o, sr) {
      addBoom(o, sr, { crack: 0.6, crackLp: 2800, body: 1, bodyFrom: 1600, bodyTo: 120, bodySweep: 0.09, bodyDecay: 0.45, rumble: 1, rumbleLp: 120, rumbleAttack: 0.05, rumbleDecay: 1.1 });
      addWhoosh(o, sr, { at: 0.02, dur: 1.6, from: 650, to: 160, q: 1.8, amp: 0.6, attack: 0.05 });
    } },
    // 極太ビームのチャージ：地鳴りが高まっていく
    charge: { len: 1.6, drive: 1.5, make(o, sr) {
      addWhoosh(o, sr, { dur: 1.5, from: 110, to: 900, q: 3, amp: 0.55, attack: 1.0 });
      addBoom(o, sr, { rumble: 0.8, rumbleLp: 100, rumbleAttack: 1.0, rumbleDecay: 0.6 });
    } },
    // ショックウィップ：はじける電撃「バリバリッ」
    zap: { len: 0.6, drive: 1.8, make(o, sr) {
      addCrackle(o, sr, { dur: 0.4, density: 400, amp: 1, lp: 4500 });
      addBoom(o, sr, { body: 0.5, bodyFrom: 1200, bodyTo: 200, bodySweep: 0.02, bodyDecay: 0.06, rumble: 0.3, rumbleLp: 130, rumbleDecay: 0.15 });
    } },
    // 変形：重い機械が組み替わる「ガシャン」
    transform: { len: 0.9, drive: 1.8, make(o, sr) {
      addBoom(o, sr, { crack: 0.5, crackLp: 3000, body: 0.8, bodyFrom: 1200, bodyTo: 220, bodySweep: 0.02, bodyDecay: 0.05 });
      addRing(o, sr, { freqs: [420, 690, 1150], decay: 0.05, amp: 0.15 });
      addBoom(o, sr, { at: 0.14, crack: 0.6, crackLp: 2800, body: 1, bodyFrom: 1000, bodyTo: 160, bodySweep: 0.03, bodyDecay: 0.08, rumble: 0.4, rumbleLp: 120, rumbleDecay: 0.25 });
      addRing(o, sr, { at: 0.14, freqs: [330, 560, 940], decay: 0.07, amp: 0.15 });
    } },
    // 向きを変える（Ctrl）：短い噴射
    turn: { len: 0.35, drive: 1.4, make(o, sr) {
      addWhoosh(o, sr, { dur: 0.2, from: 300, to: 900, q: 1, amp: 0.6, attack: 0.03 });
      addBoom(o, sr, { body: 0.35, bodyFrom: 600, bodyTo: 150, bodySweep: 0.03, bodyDecay: 0.05 });
    } },
    // 戦艦の格納庫に入る：重いロック音
    dock: { len: 1.0, drive: 1.6, make(o, sr) {
      addBoom(o, sr, { crack: 0.4, crackLp: 2600, body: 0.9, bodyFrom: 900, bodyTo: 150, bodySweep: 0.03, bodyDecay: 0.1, rumble: 0.6, rumbleLp: 100, rumbleDecay: 0.5 });
      addRing(o, sr, { at: 0.02, freqs: [220, 365, 610], decay: 0.15, amp: 0.12 });
    } },
    // 開始と勝利の後ろで鳴る低い「ドーン」
    boomSoft: { len: 2.4, drive: 1.8, make(o, sr) {
      addBoom(o, sr, { crack: 0.3, crackLp: 2200, body: 0.9, bodyFrom: 900, bodyTo: 100, bodySweep: 0.1, bodyDecay: 0.45, rumble: 1, rumbleLp: 110, rumbleAttack: 0.06, rumbleDecay: 1.1 });
    } },
  };

  // 残響の量（何度も鳴る音は控えめにして、濁らないようにする）
  const REVERB = { shot: 0.08, hit: 0.06, beam: 0.15, slash: 0.12, zap: 0.12, turn: 0.08, missile: 0.25, shell: 0.3, explode: 0.55, bigExplode: 0.7, mega: 0.5, charge: 0.3, transform: 0.2, dock: 0.35, boomSoft: 0.5 };

  function getBuffers(B, name) {
    if (!B.bank[name]) {
      const r = RECIPES[name];
      const sr = B.c.sampleRate;
      B.bank[name] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const data = new Float32Array(Math.floor(r.len * sr));
        r.make(data, sr);
        finish(data, r.drive);
        const buf = B.c.createBuffer(1, data.length, sr);
        buf.copyToChannel(data, 0);
        B.bank[name].push(buf);
      }
    }
    return B.bank[name];
  }

  // ---------------- 出力の経路 ----------------
  function makeImpulse(c, sec, decay) {
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = rand() * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function biquad(c, type, freq, gain, q) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (gain !== undefined) f.gain.value = gain;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  // 音 → マスター → 低音を持ち上げ高音を削るイコライザー → コンプレッサー → 最低域カット → リミッター → スピーカー
  // 音 → 残響（暗いホール）→ マスター
  function buildBus(c, dest) {
    const master = c.createGain();
    master.gain.value = 0.75;
    const lowShelf = biquad(c, 'lowshelf', 150, 5);
    const lowPeak = biquad(c, 'peaking', 110, 4, 0.9);
    const highShelf = biquad(c, 'highshelf', 3200, -6);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.008;
    comp.release.value = 0.35;
    const makeup = c.createGain();
    makeup.gain.value = 1.15;
    const rumbleCut = biquad(c, 'highpass', 40, undefined, 0.7);
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
    verb.buffer = makeImpulse(c, 2.4, 2.4);
    const verbTone = biquad(c, 'lowpass', 1600);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.5;
    verb.connect(verbTone);
    verbTone.connect(verbOut);
    verbOut.connect(master);
    return { c, master, verb, bank: {} };
  }

  // 素材を鳴らす：3 通りから選び、高さを少し変える
  function playSample(B, name, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const bufs = getBuffers(B, name);
    const src = c.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * 0.06);
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(B.master);
    const send = REVERB[name] || 0.15;
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(B.verb);
    }
    src.start(t);
  }

  // メニュー用の、音程のある短い音
  function tone(B, type, f, dur, vol, o = {}) {
    const c = B.c;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const lp = biquad(c, 'lowpass', 2500);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(B.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const SFX = {
    shot: (B, v) => playSample(B, 'shot', 0.8 * v),
    shell: (B, v) => playSample(B, 'shell', 1.0 * v),
    explode: (B, v) => playSample(B, 'explode', 1.0 * v),
    bigExplode: (B, v) => playSample(B, 'bigExplode', 1.0 * v),
    hit: (B, v) => playSample(B, 'hit', 0.75 * v),
    missile: (B, v) => playSample(B, 'missile', 0.8 * v),
    beam: (B, v) => playSample(B, 'beam', 0.75 * v),
    slash: (B, v) => playSample(B, 'slash', 0.75 * v),
    mega: (B, v) => playSample(B, 'mega', 1.0 * v),
    charge: (B, v) => playSample(B, 'charge', 0.6 * v),
    zap: (B, v) => playSample(B, 'zap', 0.6 * v),
    transform: (B, v) => playSample(B, 'transform', 0.7 * v),
    turn: (B, v) => playSample(B, 'turn', 0.5 * v),
    dock: (B, v) => playSample(B, 'dock', 0.7 * v),
    // メニューの操作音（軽いまま）
    select: (B, v) => tone(B, 'triangle', 660, 0.07, 0.18 * v),
    tick: (B, v) => tone(B, 'square', 1000, 0.05, 0.1 * v),
    start: (B, v) => {
      [392, 523, 784].forEach((f, i) => tone(B, 'square', f, 0.14, 0.12 * v, { delay: i * 0.1 }));
      playSample(B, 'boomSoft', 0.9 * v, { delay: 0.2 });
    },
    win: (B, v) => {
      [523, 659, 784, 1046].forEach((f, i) => tone(B, 'square', f, 0.22, 0.12 * v, { delay: i * 0.13 }));
      playSample(B, 'boomSoft', 0.8 * v, { delay: 0.4 });
    },
  };

  // ブラウザの制限で、最初のキー入力のあとでないと音が出せない。
  // 音を出せるようになったら、素材を先に作っておく（最初の爆発で引っかからないように）
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        bus = buildBus(ctx, ctx.destination);
        // 1 種類ずつ間をあけて作り、画面が止まらないようにする
        const queue = Object.keys(RECIPES);
        const next = () => { const name = queue.shift(); if (!name) return; getBuffers(bus, name); setTimeout(next, 30); };
        setTimeout(next, 0);
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

  // 動作確認用：音を画面に出さずに合成し、大きさと長さを調べる
  async function analyze(name) {
    const sr = 44100;
    const oc = new OfflineAudioContext(2, sr * 5, sr);
    const B = buildBus(oc, oc.destination);
    SFX[name](B, 1);
    const d = (await oc.startRendering()).getChannelData(0);
    let peak = 0, last = 0;
    for (let i = 0; i < d.length; i++) { if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]); if (Math.abs(d[i]) > 0.01) last = i; }
    return { peak: Math.round(peak * 100) / 100, seconds: Math.round((last / sr) * 100) / 100 };
  }

  return { ensure, play, frame, toggleMute, analyze, names: Object.keys(SFX), get muted() { return muted; } };
})();
