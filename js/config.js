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
    STUN_IMMUNE: 1.5,        // しびれが解けたあと、しばらくしびれない秒数
    // 陣形の中心（チーム 0 は左、チーム 1 は右）
    SPAWN: [{ x: 520, y: 700 }, { x: 1880, y: 700 }],
    PLAYER_TAG_COLORS: ['#ff4545', '#3fc8ff'],

    // --- 移動（イージングと慣性） ---
    ACCEL_TIME: 0.7,      // 止まった状態から巡航速度に届くまでのおよその秒数（はじめはゆっくり、だんだん速く）
    DECEL: 1.3,           // 減速の強さ（入力を離すと慣性で滑りながら止まる）
    TURN_SLOW: 9,         // 止まっているときの旋回の速さ（ラジアン/秒）
    TURN_K: 2,            // 速く動いているほど曲がりにくくなる度合い

    // --- ブースト（Space） ---
    BOOST_MUL: 1.65,      // ブースト中の速度の倍率
    BOOST_DRAIN: 0.45,    // 1 秒あたりに減るゲージ（満タンから約 2.2 秒）
    BOOST_REGEN: 0.28,    // 離しているときに 1 秒あたり回復するゲージ
    BOOST_REGEN_DELAY: 0.4, // 離してから回復が始まるまでの秒数
    BOOST_UNLOCK: 0.3,    // 使い切ったあと、ここまで回復するまで再使用できない

    // --- ビームエネルギー（ビーム兵器が使う） ---
    ENERGY_MAX: 100,
    EN_REGEN: 26,         // 1 秒あたりの回復量
    EN_REGEN_DELAY: 1.0,  // 最後にビームを撃ってから回復が始まるまでの秒数

    // --- 戦艦 ---
    DOCK_HP_RATE: 0.06,   // 戦艦の中で 1 秒あたりに回復する HP（最大 HP に対する割合）
    DOCK_AMMO_RATE: 0.25, // 戦艦の中で 1 秒あたりに補給される弾（最大弾数に対する割合）
    DOCK_EN_RATE: 50,     // 戦艦の中で 1 秒あたりに回復するビームエネルギー
    SHIP_BONUS_HP: 0.3,   // 敵の戦艦を落としたとき、味方全機の HP がこの割合だけ回復する

    // --- インターネット対戦 ---
    NET_SNAPSHOT_HZ: 20,              // 部屋を作った側が状態を送る回数（1 秒あたり）
    NET_ROOM_PREFIX: 'stellar-legion-room-',
    // タイトル画面の SETTINGS で開く設定ページ（claude.ai のアーティファクト。持ち主だけが開ける）
    //  空にすると SETTINGS はメニューに出ない
    SETTINGS_URL: 'https://claude.ai/artifact/YTenoqEiZoGtxv3XoME23k',
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
    // 点 (px, py) と線分 (ax, ay)-(bx, by) の距離
    segDist: (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    },
  };
})();
