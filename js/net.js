'use strict';
// インターネット対戦（PeerJS による P2P 通信）
//  部屋を作った側（host）がゲームを計算し、20 回/秒で状態を送る。
//  参加した側（guest）は自分の操作を 30 回/秒で送り、届いた状態を表示する。
//  相手を見つけるのに PeerJS の公開サーバー（0.peerjs.com）を使う。つながった後はブラウザ同士が直接通信する。
SL.Net = (function () {
  const C = SL.CONFIG;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 読み間違えやすい 0/O/1/I/L は使わない
  const CODE_LEN = 5;
  const WIDS = Object.keys(SL.WEAPONS);
  const WIDX = {};
  WIDS.forEach((id, i) => { WIDX[id] = i; });

  let peer = null;
  let conn = null;
  let role = null; // 'host' | 'guest'
  let handlers = {};

  function available() {
    return typeof window.Peer === 'function';
  }

  function makeCode() {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  function describe(e) {
    const type = e && e.type;
    switch (type) {
      case 'peer-unavailable': return 'ROOM NOT FOUND';
      case 'network': return 'NETWORK ERROR';
      case 'server-error': return 'SERVER ERROR';
      case 'socket-error':
      case 'socket-closed': return 'CANNOT REACH SERVER';
      case 'browser-incompatible': return 'BROWSER NOT SUPPORTED';
      case 'webrtc': return 'CONNECTION FAILED';
      default: return 'ERROR: ' + String(type || e).toUpperCase();
    }
  }

  function setupConn(c) {
    conn = c;
    c.on('open', () => handlers.onConnected && handlers.onConnected());
    c.on('data', (msg) => handlers.onMessage && handlers.onMessage(msg));
    c.on('close', () => {
      if (conn === c) conn = null;
      if (handlers.onClose) handlers.onClose('CONNECTION CLOSED');
    });
    c.on('error', () => handlers.onError && handlers.onError('CONNECTION ERROR'));
  }

  // 部屋を作る
  function host(h) {
    close();
    handlers = h;
    role = 'host';
    const tryOpen = (attempt) => {
      const code = makeCode();
      peer = new window.Peer(C.NET_ROOM_PREFIX + code, { debug: 1 });
      peer.on('open', () => h.onOpen && h.onOpen(code));
      peer.on('connection', (c) => {
        if (conn) {
          // 1 対 1 なので 2 人目は断る
          c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 500); });
          return;
        }
        setupConn(c);
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && attempt < 3) {
          peer.destroy();
          tryOpen(attempt + 1); // 同じコードがたまたま使われていたら作り直す
        } else if (h.onError) {
          h.onError(describe(e));
        }
      });
    };
    tryOpen(0);
  }

  // 部屋に入る
  function join(code, h) {
    close();
    handlers = h;
    role = 'guest';
    peer = new window.Peer({ debug: 1 });
    peer.on('open', () => {
      setupConn(peer.connect(C.NET_ROOM_PREFIX + code, { reliable: true, serialization: 'json' }));
    });
    peer.on('error', (e) => h.onError && h.onError(describe(e)));
  }

  function send(msg) {
    if (conn && conn.open) {
      try { conn.send(msg); } catch (e) { /* 送れなかったときは次の送信で取り戻す */ }
    }
  }

  function close() {
    handlers = {};
    try { if (conn) conn.close(); } catch (e) { /* 既に閉じている */ }
    try { if (peer) peer.destroy(); } catch (e) { /* 既に閉じている */ }
    conn = null;
    peer = null;
    role = null;
  }

  // ---------------- 状態の送受信 ----------------
  const r1 = (v) => Math.round(v);
  const r10 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

  // 部屋を作った側：いまの状態をまとめる
  function encode(game) {
    const w = game.world;
    const units = w.units.map((u) => {
      if (!u.alive) return [0, 0, 0, 0, 0, 0, 0, u.facing, 0, 0, 0];
      let f = 1;
      if (u.docked) f |= 2;
      if (u.boosting) f |= 4;
      if (u.mode === 'move') f |= 8;
      if (u.flash > 0) f |= 16;
      if (u.lunge > 0) f |= 32;
      if (u.lunge > 0 && u.lungeDef && u.lungeDef.style === 'spin') f |= 64;
      const cw = u.weapons.find((x) => x && x.charge > 0);
      return [
        r1(u.x), r1(u.y), r1(u.vx), r1(u.vy), Math.round(u.heading * 100), Math.ceil(u.hp), f, u.facing,
        Math.round(u.stun * 10),
        u.lunge > 0 ? Math.round(Math.atan2(u.lungeDir.y, u.lungeDir.x) * 100) : 0,
        cw ? Math.round((cw.charge / cw.def.charge) * 100) : 0,
        u.lunge > 0 && u.lungeWid ? WIDX[u.lungeWid] : -1,   // 振っている格闘武器
        u.lunge > 0 ? Math.round(u.lunge * 1000) : 0,         // 振り終わりまでの残り（ミリ秒）
      ];
    });
    const players = game.players.map((p) => {
      const u = p.unit;
      const t = u && u.target;
      return {
        u: u ? u.id : -1,
        sw: p.switchT > 0 ? 1 : 0,
        tg: t ? (t.isShip ? 1000 + t.team : t.id) : -1,
        d: u ? [u.weapons.map((x) => (x ? [x.ammo, Math.round(x.cd * 100), Math.round(x.charge * 100)] : null)),
          Math.round(u.energy), Math.round(u.boost * 100), u.boostLock ? 1 : 0, u.faceLock] : null,
      };
    });
    const ev = w.takeRecorded().map((e) => e.map(r10));
    return {
      t: 's',
      mid: game.matchId,
      arm: game.armyCounts,
      st: game.state,
      tm: game.timer,
      res: game.result,
      ban: game.banner && game.banner.t > 0 ? [game.banner.text, game.banner.sub, game.banner.color, Math.round(game.banner.t * 10)] : null,
      u: units,
      sh: w.ships.map((s) => [Math.ceil(s.hp), s.alive ? 1 : 0, s.flash > 0 ? 1 : 0]),
      p: w.projectiles.map((p) => [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), WIDX[p.wid], p.team, Math.round(p.ang * 100)]),
      l: w.lasers.map((l) => [r1(l.x1), r1(l.y1), r1(l.x2), r1(l.y2), l.w, l.team, Math.round(l.life * 100), Math.round(l.max * 100)]),
      pl: players,
      ev,
    };
  }

  function projColor(def, team) {
    return def.kind === 'beam' ? SL.FACTIONS[team].beam : def.kind === 'shell' ? '#ffcf4a' : '#ffb347';
  }

  // 参加した側：届いた状態を画面に反映する
  function apply(game, s) {
    if (!game.world || game.matchId !== s.mid) game.setupMirror(s.mid, s.arm);
    const w = game.world;

    s.u.forEach((a, i) => {
      const u = w.units[i];
      if (!u) return;
      const f = a[6];
      const wasAlive = u.alive;
      u.alive = !!(f & 1);
      if (!u.alive) { u.docked = false; return; }
      u.docked = !!(f & 2);
      u.boosting = !!(f & 4);
      u.mode = f & 8 ? 'move' : 'battle';
      u.flash = f & 16 ? 0.05 : 0;
      u.nx = a[0];
      u.ny = a[1];
      if (!u.netInit || !wasAlive) { u.x = a[0]; u.y = a[1]; u.netInit = true; }
      u.vx = a[2];
      u.vy = a[3];
      u.heading = a[4] / 100;
      u.speed = Math.hypot(a[2], a[3]);
      u.hp = a[5];
      u.facing = a[7];
      u.stun = a[8] / 10;
      if (f & 32) {
        const ang = a[9] / 100;
        // 機体が持っている格闘武器（大きな機体は届く距離が伸びている）を使う
        const own = a[11] >= 0 ? u.weapons.find((x) => x && x.id === WIDS[a[11]]) : null;
        const def = own ? own.def : a[11] >= 0 ? SL.WEAPONS[WIDS[a[11]]] : null;
        u.lungeDef = def && def.kind === 'melee' ? def : f & 64 ? SL.WEAPONS.naginata : SL.WEAPONS.saber;
        u.lunge = a[12] ? a[12] / 1000 : 0.1;
        u.lungeDir = { x: Math.cos(ang), y: Math.sin(ang) };
      } else {
        u.lunge = 0;
      }
      const cw = u.weapons.find((x) => x && x.def.kind === 'charge');
      if (cw) cw.charge = (a[10] / 100) * cw.def.charge;
    });

    s.sh.forEach((a, i) => {
      const sh = w.ships[i];
      if (!sh) return;
      sh.hp = a[0];
      sh.alive = !!a[1];
      sh.flash = a[2] ? 0.05 : 0;
    });

    w.projectiles = s.p.map((a) => {
      const def = SL.WEAPONS[WIDS[a[4]]] || SL.WEAPONS.rifle;
      return { x: a[0], y: a[1], vx: a[2], vy: a[3], kind: def.kind, def, team: a[5], ang: a[6] / 100, r: def.r || 2, color: projColor(def, a[5]) };
    });
    w.lasers = s.l.map((a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3], w: a[4], team: a[5], life: a[6] / 100, max: a[7] / 100, color: SL.FACTIONS[a[5]].beam }));

    for (const u of w.units) u.leader = -1;
    s.pl.forEach((pd, i) => {
      const p = game.players[i];
      if (!p) return;
      p.unit = pd.u >= 0 ? w.units[pd.u] : null;
      p.switchT = pd.sw ? 1 : 0;
      if (!p.unit) return;
      p.unit.leader = i;
      p.unit.target = pd.tg >= 1000 ? w.ships[pd.tg - 1000] : pd.tg >= 0 ? w.units[pd.tg] : null;
      if (pd.d) {
        pd.d[0].forEach((wd, k) => {
          const wp = p.unit.weapons[k];
          if (!wp || !wd) return;
          wp.ammo = wd[0];
          wp.cd = wd[1] / 100;
          wp.charge = wd[2] / 100;
        });
        p.unit.energy = pd.d[1];
        p.unit.boost = pd.d[2] / 100;
        p.unit.boostLock = !!pd.d[3];
        p.unit.faceLock = pd.d[4] || 0;
      }
    });

    for (const e of s.ev) {
      if (e[0] === 'snd') game.sfx(e[1], e[2], e[3], e[4]);
      else w.fx.replay(e);
    }

    if (s.st !== game.state) {
      game.setState(s.st);
      if (s.st === 'battle') SL.Audio.play('start');
      if (s.st === 'result') SL.Audio.play(s.res && s.res.winner === -1 ? 'select' : 'win');
    }
    game.timer = s.tm;
    game.result = s.res;
    game.banner = s.ban ? { text: s.ban[0], sub: s.ban[1], color: s.ban[2], t: s.ban[3] / 10 } : null;
  }

  return {
    available, host, join, send, close, encode, apply,
    get role() { return role; },
    get connected() { return !!(conn && conn.open); },
  };
})();
