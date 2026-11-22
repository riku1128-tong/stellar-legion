'use strict';
// キーボードとゲームパッドの入力。
// 1 人用のときは 1P がどちらのキー配置・どのゲームパッドでも操作できる。
// 2 人用のときは 1P = WASD 側 + 1 台目のパッド、2P = 矢印キー側 + 2 台目のパッド。
SL.Input = (function () {
  const KEYS = [
    {
      up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
      fire1: ['KeyJ'], fire2: ['KeyK'], melee: ['KeyL'], dash: ['Space'],
      target: ['KeyU'], swap: ['Tab'], transform: ['ShiftLeft'],
    },
    {
      up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
      fire1: ['Numpad1', 'Comma'], fire2: ['Numpad2', 'Period'], melee: ['Numpad3', 'Slash'],
      dash: ['Numpad0', 'ControlRight'], target: ['Numpad4', 'Semicolon'], swap: ['Numpad5', 'Quote'],
      transform: ['Numpad6', 'ShiftRight'],
    },
  ];
  // 標準配置のゲームパッドのボタン番号
  const PAD = { fire1: [0], fire2: [1], melee: [2], target: [3], swap: [6], dash: [7, 5], transform: [4] };
  const PAD_START = 9, PAD_BACK = 8;
  const ACTIONS = ['fire1', 'fire2', 'melee', 'dash', 'target', 'swap', 'transform'];
  const DEADZONE = 0.25;

  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  for (const set of KEYS) for (const k in set) for (const code of set[k]) PREVENT.add(code);

  const down = new Set();     // 押されているキー
  const keyEdges = new Set(); // 前回の consume 以降に押されたキー
  let anyKeyEdge = false;
  let textMode = false;       // 部屋コードの入力中
  let typed = [];             // 入力された文字（e.key）

  window.addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code) || (textMode && e.key === 'Backspace')) e.preventDefault();
    if (textMode) typed.push(e.key);
    if (e.repeat) return;
    down.add(e.code);
    keyEdges.add(e.code);
    anyKeyEdge = true;
  });
  window.addEventListener('keyup', (e) => { down.delete(e.code); });
  window.addEventListener('blur', () => down.clear());

  function blankActions() {
    const o = {};
    for (const a of ACTIONS) o[a] = false;
    return o;
  }

  const players = [0, 1].map(() => ({
    mx: 0, my: 0,
    held: blankActions(),
    prevHeld: blankActions(),
    pressed: blankActions(),
    device: 'kb',
  }));

  const global = {
    up: false, down: false, confirm: false, pause: false, quit: false, mute: false, any: false, back: false,
  };
  let prevPadButtons = [];   // パッドごとの前フレームのボタン状態
  let prevStickY = [];

  function getPads() {
    if (!navigator.getGamepads) return [];
    const list = [];
    const raw = navigator.getGamepads();
    for (let i = 0; i < raw.length; i++) if (raw[i] && raw[i].connected) list.push(raw[i]);
    return list;
  }

  function anyDown(codes) {
    for (const c of codes) if (down.has(c)) return true;
    return false;
  }
  function anyEdge(codes) {
    for (const c of codes) if (keyEdges.has(c)) return true;
    return false;
  }
  function padHeld(pad, idxs) {
    for (const i of idxs) {
      const b = pad.buttons[i];
      if (b && (b.pressed || b.value > 0.5)) return true;
    }
    return false;
  }

  let mode = 'single';

  function readPlayer(p, keySets, pads) {
    let mx = 0, my = 0;
    let usedKb = false, usedPad = false;
    const held = blankActions();
    let edgeFromKeys = blankActions();

    for (const ks of keySets) {
      const set = KEYS[ks];
      if (anyDown(set.left)) { mx -= 1; usedKb = true; }
      if (anyDown(set.right)) { mx += 1; usedKb = true; }
      if (anyDown(set.up)) { my -= 1; usedKb = true; }
      if (anyDown(set.down)) { my += 1; usedKb = true; }
      for (const a of ACTIONS) {
        if (anyDown(set[a])) { held[a] = true; usedKb = true; }
        if (anyEdge(set[a])) edgeFromKeys[a] = true;
      }
    }
    for (const pad of pads) {
      let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) < DEADZONE) ax = 0;
      if (Math.abs(ay) < DEADZONE) ay = 0;
      if (padHeld(pad, [14])) ax = -1;
      if (padHeld(pad, [15])) ax = 1;
      if (padHeld(pad, [12])) ay = -1;
      if (padHeld(pad, [13])) ay = 1;
      if (ax || ay) { mx += ax; my += ay; usedPad = true; }
      for (const a of ACTIONS) {
        if (padHeld(pad, PAD[a])) { held[a] = true; usedPad = true; }
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    p.mx = mx; p.my = my;
    for (const a of ACTIONS) {
      if ((held[a] && !p.prevHeld[a]) || edgeFromKeys[a]) p.pressed[a] = true;
      p.prevHeld[a] = held[a];
      p.held[a] = held[a] || edgeFromKeys[a]; // 1 フレーム内の短い押しも拾う
    }
    if (usedPad) p.device = 'pad';
    else if (usedKb) p.device = 'kb';
  }

  // 毎フレーム 1 回呼ぶ。newMode: 'single' | 'dual'
  function update(newMode) {
    mode = newMode || 'single';
    const pads = getPads();
    if (mode === 'dual') {
      readPlayer(players[0], [0], pads[0] ? [pads[0]] : []);
      readPlayer(players[1], [1], pads[1] ? [pads[1]] : []);
    } else {
      readPlayer(players[0], [0, 1], pads);
      // 2P 側は使わないが、状態を空にしておく
      players[1].mx = players[1].my = 0;
      for (const a of ACTIONS) players[1].held[a] = false;
    }

    // メニュー・全体の操作
    if (anyEdge(['KeyW', 'ArrowUp'])) global.up = true;
    if (anyEdge(['KeyS', 'ArrowDown'])) global.down = true;
    if (anyEdge(['Enter', 'NumpadEnter', 'Space', 'KeyJ', 'Numpad1'])) global.confirm = true;
    if (anyEdge(['Escape', 'KeyP'])) global.pause = true;
    if (anyEdge(['Escape'])) global.back = true;
    if (anyEdge(['KeyQ'])) global.quit = true;
    if (anyEdge(['KeyM']) && !textMode) global.mute = true;
    if (anyKeyEdge) global.any = true;

    pads.forEach((pad, i) => {
      const prev = prevPadButtons[i] || [];
      const now = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      const edge = (idx) => now[idx] && !prev[idx];
      if (edge(12)) global.up = true;
      if (edge(13)) global.down = true;
      if (edge(0) || edge(PAD_START)) global.confirm = true;
      if (edge(PAD_START)) global.pause = true;
      if (edge(PAD_BACK)) { global.quit = true; global.back = true; }
      if (now.some((v, idx) => v && !prev[idx])) global.any = true;
      const sy = pad.axes[1] || 0;
      const psy = prevStickY[i] || 0;
      if (sy < -0.6 && psy >= -0.6) global.up = true;
      if (sy > 0.6 && psy <= 0.6) global.down = true;
      prevStickY[i] = sy;
      prevPadButtons[i] = now;
    });
  }

  // シミュレーションが押された入力を使い終わったら呼ぶ
  function consume() {
    for (const p of players) for (const a of ACTIONS) p.pressed[a] = false;
    for (const k in global) global[k] = false;
    keyEdges.clear();
    anyKeyEdge = false;
  }

  function padCount() { return getPads().length; }

  // 文字入力（部屋コード用）
  function setTextMode(on) {
    textMode = !!on;
    typed = [];
  }
  function takeTyped() {
    const t = typed;
    typed = [];
    return t;
  }

  return { update, consume, players, global, padCount, KEYS, ACTIONS, setTextMode, takeTyped };
})();
