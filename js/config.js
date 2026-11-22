'use strict';
// ゲーム全体の設定値と小さな便利関数
window.SL = window.SL || {};

(function () {
  const params = new URLSearchParams(location.search);

  SL.CONFIG = {
    W: 640,               // 内部解像度（幅）
    H: 360,               // 内部解像度（高さ）
    FIELD_W: 2400,        // 戦場の広さ
    FIELD_H: 1400,
    STEP: 1 / 60,         // 固定タイムステップ
    TIME_START: 99,       // 開始時の TIME
    SECONDS_PER_TICK: 2,  // TIME が 1 減るまでの秒数
    SWITCH_DELAY: 0.9,    // 撃墜されてから次の機体に乗り換えるまでの秒数
    DAMAGE_SCALE: 0.6,       // 全体のダメージ倍率（小さいほど戦いが長引く）
    HUMAN_DAMAGE_RATE: 0.75, // 人間が操作している機体が受けるダメージの倍率
    // 陣形の中心（チーム 0 は左、チーム 1 は右）
    SPAWN: [{ x: 520, y: 700 }, { x: 1880, y: 700 }],
    PLAYER_TAG_COLORS: ['#ff4545', '#3fc8ff'],
  };

  SL.DEBUG = {
    demo: params.get('demo') === '1',                     // 両軍とも AI
    speed: Math.max(1, Math.min(16, Number(params.get('speed')) || 1)), // 倍速
    mode: params.get('mode'),                             // 'cpu' | '2p' でタイトルを飛ばす
  };

  SL.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      return dx * dx + dy * dy;
    },
    wrapAngle: (a) => {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    },
  };
})();
