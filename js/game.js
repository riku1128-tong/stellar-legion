'use strict';
// ゲームの進行：タイトル → VS 画面 → 戦闘 → 結果。
// プレイヤー・カメラ・乗り換え・勝敗判定・インターネット対戦のロビーを扱う。
(function () {
  const U = SL.util;
  const C = SL.CONFIG;
  const F = SL.Font;
  const LOBBY_STATES = ['online', 'hosting', 'joining', 'connecting'];
  const PRESS_KEYS = ['target', 'swap', 'transform', 'melee', 'face'];

  function blankRemote() {
    return {
      mx: 0, my: 0,
      held: { fire1: false, fire2: false, melee: false, dash: false },
      pressed: { target: false, swap: false, transform: false, melee: false, face: false },
    };
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.bg = new SL.Background();
      this.state = 'title';
      this.stateTime = 0;
      this.time = 0;
      this.menuIndex = 0;
      this.menuItems = ['1P VS CPU', '1P VS 2P', 'ONLINE'].concat(C.SETTINGS_URL ? ['SETTINGS'] : []);
      this.mode = 'cpu';          // 'cpu' | '2p' | 'demo' | 'online'
      this.localPi = 0;           // この画面で操作しているプレイヤー（オンラインで参加した側は 1）
      this.world = null;
      this.players = [];
      this.timer = C.TIME_START;
      this.tickAcc = 0;
      this.result = null;
      this.banner = null;
      this.paused = false;
      this.matchId = 0;
      this.history = [];          // 終わった試合の結果（動作確認用）
      this.titleCam = { x: 0, y: 0 };
      this.net = null;            // インターネット対戦中の状態
      this.lobby = { menu: 0, code: '', status: '', msg: '' };
      this.netMsg = '';

      if (SL.DEBUG.demo) this.startMatch('demo');
      else if (SL.DEBUG.mode === 'cpu' || SL.DEBUG.mode === '2p') this.startMatch(SL.DEBUG.mode);

      // 対戦中にタブを閉じかけたら確認する（Ctrl と W を同時に押すと、ブラウザがタブを閉じようとするため）
      window.addEventListener('beforeunload', (e) => {
        const playing = this.mode !== 'demo' && (this.state === 'battle' || this.state === 'vs' || !!this.net);
        if (playing) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }

    inputMode() {
      return this.mode === '2p' && this.state !== 'title' ? 'dual' : 'single';
    }

    isGuest() {
      return !!(this.net && this.net.role === 'guest');
    }

    isLocalHuman(p) {
      if (!p.human) return false;
      return this.mode !== 'online' || p.index === this.localPi;
    }

    setState(s) {
      this.state = s;
      this.stateTime = 0;
    }

    views() {
      if (this.mode === '2p') {
        return [
          { pi: 0, sx: 0, sy: 0, w: C.W / 2 - 1, h: C.H },
          { pi: 1, sx: C.W / 2 + 1, sy: 0, w: C.W / 2 - 1, h: C.H },
        ];
      }
      return [{ pi: this.localPi, sx: 0, sy: 0, w: C.W, h: C.H }];
    }

    makePlayers(humans, labels) {
      this.players = [0, 1].map((i) => ({
        index: i, team: i, human: humans[i], label: labels[i],
        unit: null, switchT: 0, cam: { x: 0, y: 0 }, shake: 0,
      }));
    }

    startMatch(mode) {
      this.mode = mode;
      this.matchId++;
      this.world = new SL.World({
        onDestroyed: (u, k) => this.onDestroyed(u, k),
        onShipDestroyed: (s, k) => this.onShipDestroyed(s, k),
        sound: (n, x, y, v) => this.sfx(n, x, y, v),
      });
      // 出撃の設定（js/army.js）をこの試合のぶんだけ写しておく（オンラインでは相手にも送る）
      this.armyCounts = JSON.parse(JSON.stringify(SL.ARMY_COUNTS || {}));
      this.world.spawnArmies(this.armyCounts);
      if (mode === 'online') this.world.startRecording();
      this.timer = C.TIME_START;
      this.tickAcc = 0;
      this.result = null;
      this.banner = null;
      this.paused = false;
      const humans = mode === '2p' || mode === 'online' ? [true, true] : mode === 'cpu' ? [true, false] : [false, false];
      const labels = mode === '2p' || mode === 'online' ? ['1P', '2P'] : mode === 'cpu' ? ['1P', 'CPU'] : ['CPU1', 'CPU2'];
      this.makePlayers(humans, labels);
      const views = this.views();
      for (const p of this.players) {
        const cmd = this.firstUnit(p.team);
        this.assign(p, cmd);
        const v = views.find((vv) => vv.pi === p.index) || views[0];
        p.cam.x = cmd.x - v.w / 2;
        p.cam.y = cmd.y - v.h / 2;
      }
      this.setState('vs');
      SL.Audio.play('select');
    }

    // 最初に操作する機体：隊長機（いなければ編成の先頭）
    firstUnit(team) {
      const mine = this.world.units.filter((u) => u.team === team);
      return mine.find((u) => u.role === 'commander') || mine[0];
    }

    // オンラインで参加した側：表示用の戦場を用意する（計算はしない）
    //  arm: 部屋を作った側の出撃の設定（機体の並びを相手とそろえるため）
    setupMirror(mid, arm) {
      this.matchId = mid;
      this.mode = 'online';
      this.localPi = 1;
      this.armyCounts = arm || JSON.parse(JSON.stringify(SL.ARMY_COUNTS || {}));
      this.world = new SL.World({});
      this.world.spawnArmies(this.armyCounts);
      this.makePlayers([true, true], ['1P', '2P']);
      for (const p of this.players) {
        const cmd = this.firstUnit(p.team);
        p.unit = cmd;
        p.cam.x = cmd.x - C.W / 2;
        p.cam.y = cmd.y - C.H / 2;
      }
    }

    toTitle() {
      if (this.net) {
        SL.Net.send({ t: 'bye' });
        SL.Net.close();
        this.net = null;
      }
      SL.Input.setTextMode(false);
      this.mode = 'cpu';
      this.localPi = 0;
      this.paused = false;
      this.setState('title');
    }

    // プレイヤー p の担当機体を unit にする
    assign(p, unit) {
      if (p.unit && p.unit !== unit) {
        p.unit.controller = -1;
        p.unit.leader = -1;
        p.unit.faceLock = 0; // AI に戻った機体は自動で向きを変える
      }
      p.unit = unit;
      if (unit) {
        unit.leader = p.index;
        unit.controller = p.human ? p.index : -1;
        if (p.human) {
          const it = unit.intent;
          it.mx = it.my = 0;
          it.fire1 = it.fire2 = it.melee = it.dash = it.transform = false;
        }
      }
    }

    nearestAlly(team, from) {
      let best = null, bd = Infinity;
      for (const u of this.world.units) {
        if (!u.alive || u.team !== team || u.leader >= 0) continue;
        const d = from ? U.dist2(from.x, from.y, u.x, u.y) : u.slot;
        if (d < bd) { bd = d; best = u; }
      }
      return best;
    }

    nextAlly(team, cur) {
      const allies = this.world.units
        .filter((u) => u.alive && u.team === team && (u.leader < 0 || u === cur))
        .sort((a, b) => a.slot - b.slot);
      if (allies.length === 0) return null;
      const i = allies.indexOf(cur);
      return allies[(i + 1) % allies.length];
    }

    cycleTarget(u) {
      u.faceLock = 0; // 目標を切り替えたら、向きは自動（目標の方を向く）に戻す
      const list = this.world.enemiesByDistance(u).slice(0, 8);
      if (list.length === 0) return;
      const i = list.indexOf(u.target);
      u.target = list[(i + 1) % list.length];
      if (this.isLocalHuman(this.players[u.controller] || {})) SL.Audio.play('select', 0.5);
    }

    onDestroyed(u) {
      for (const p of this.players) {
        if (p.unit === u) {
          p.switchT = C.SWITCH_DELAY;
          p.shake = 6;
        } else if (p.unit && p.unit.alive) {
          const d = Math.hypot(p.unit.x - u.x, p.unit.y - u.y);
          if (d < 200) p.shake = Math.max(p.shake, (u.isBig ? 5 : 2.5) * (1 - d / 200));
        }
      }
    }

    onShipDestroyed(s) {
      const loser = SL.FACTIONS[s.team];
      const winner = SL.FACTIONS[1 - s.team];
      this.banner = {
        text: loser.name.split(' ')[0] + ' BATTLESHIP DOWN!',
        sub: 'BONUS: ' + winner.name + ' REPAIRED AND RESUPPLIED',
        color: winner.color,
        t: 4,
      };
      for (const p of this.players) p.shake = Math.max(p.shake, 5);
    }

    // 音量はカメラから遠いほど小さくする
    sfx(name, x, y, vol = 1) {
      let f = 0;
      for (const v of this.views()) {
        const p = this.players[v.pi];
        if (!p) continue;
        const d = Math.hypot(p.cam.x + v.w / 2 - x, p.cam.y + v.h / 2 - y);
        f = Math.max(f, 1 - U.clamp((d - 220) / 450, 0, 1));
      }
      SL.Audio.play(name, vol * f);
    }

    // ---------------- 更新 ----------------
    update(dt) {
      this.time += dt;
      this.stateTime += dt;
      const g = SL.Input.global;
      if (g.mute) SL.Audio.toggleMute();
      if (this.isGuest() && (this.state === 'vs' || this.state === 'battle' || this.state === 'result')) {
        this.updateGuest(dt);
        return;
      }
      switch (this.state) {
        case 'title': this.updateTitle(dt); break;
        case 'online': this.updateOnlineMenu(); break;
        case 'hosting': this.updateHosting(); break;
        case 'joining': this.updateJoining(); break;
        case 'connecting': this.updateConnecting(); break;
        case 'netmsg': this.updateNetMsg(); break;
        case 'vs': this.updateVS(dt); break;
        case 'battle': this.updateBattle(dt); break;
        case 'result': this.updateResult(dt); break;
      }
      if (this.net && this.net.role === 'host' && this.mode === 'online') this.netTickHost(dt);
    }

    updateTitle(dt) {
      const g = SL.Input.global;
      this.titleCam.x += dt * 25;
      this.titleCam.y += dt * 6;
      const n = this.menuItems.length;
      if (g.up) { this.menuIndex = (this.menuIndex + n - 1) % n; SL.Audio.play('select'); }
      if (g.down) { this.menuIndex = (this.menuIndex + 1) % n; SL.Audio.play('select'); }
      if (g.confirm && this.stateTime > 0.2) {
        SL.Audio.ensure();
        if (this.menuItems[this.menuIndex] === 'SETTINGS') {
          // 設定ページ（機体・武装・出撃・絵）へ移る。同じタブで開く（新しいタブはポップアップとして止められることがある）
          SL.Audio.play('select');
          location.href = C.SETTINGS_URL;
        } else if (this.menuIndex === 2) {
          this.lobby = { menu: 0, code: '', status: '', msg: SL.Net.available() ? '' : 'ONLINE IS NOT AVAILABLE (PEERJS NOT LOADED)' };
          this.setState('online');
        } else {
          this.startMatch(this.menuIndex === 0 ? 'cpu' : '2p');
        }
      }
    }

    updateVS() {
      const g = SL.Input.global;
      if (g.quit) { this.toTitle(); return; }
      const go = this.mode === 'demo' ? this.stateTime > 1.2 : this.stateTime > 0.5 && g.any;
      if (go) {
        this.setState('battle');
        SL.Audio.play('start');
      }
    }

    updateBattle(dt) {
      const g = SL.Input.global;
      if (this.mode === 'online') {
        if (g.quit) { this.leaveOnline('YOU LEFT THE MATCH'); return; }
      } else if (g.pause && this.mode !== 'demo') {
        this.paused = !this.paused;
        SL.Audio.play('select');
      }
      if (this.paused) {
        if (g.quit) this.toTitle();
        return;
      }
      for (const p of this.players) this.updatePlayer(p, dt);
      this.world.step(dt);

      this.tickAcc += dt;
      if (this.tickAcc >= C.SECONDS_PER_TICK) {
        this.tickAcc -= C.SECONDS_PER_TICK;
        this.timer = Math.max(0, this.timer - 1);
        if (this.timer > 0 && this.timer <= 5) SL.Audio.play('tick');
      }
      if (this.banner) this.banner.t -= dt;
      this.checkEnd();
      this.updateCameras(dt);
    }

    updatePlayer(p, dt) {
      if (p.switchT > 0) {
        p.switchT -= dt;
        if (p.switchT <= 0) {
          const nu = this.nearestAlly(p.team, p.unit);
          if (nu) this.assign(p, nu);
        }
      } else if (!p.unit || !p.unit.alive) {
        p.switchT = C.SWITCH_DELAY;
      }
      const u = p.unit;
      if (!p.human || !u || !u.alive) return;
      let inp;
      if (this.mode === 'online' && p.index !== this.localPi) inp = this.net ? this.net.remote : blankRemote();
      else inp = SL.Input.players[this.mode === '2p' ? p.index : 0];
      const it = u.intent;
      it.mx = inp.mx;
      it.my = inp.my;
      it.fire1 = inp.held.fire1;
      it.fire2 = inp.held.fire2;
      it.melee = inp.held.melee || inp.pressed.melee;
      it.dash = inp.held.dash;
      if (inp.pressed.transform) it.transform = true;
      if (inp.pressed.face) it.faceFlip = true;
      if (inp.pressed.target) this.cycleTarget(u);
      if (inp.pressed.swap) {
        const nu = this.nextAlly(p.team, u);
        if (nu && nu !== u) {
          this.assign(p, nu);
          if (this.isLocalHuman(p)) SL.Audio.play('select');
        }
      }
      if (inp === (this.net && this.net.remote)) for (const k of PRESS_KEYS) inp.pressed[k] = false;
    }

    checkEnd() {
      const w = this.world;
      const a0 = w.aliveCount(0), a1 = w.aliveCount(1);
      let winner = null, reason = null;
      if (a0 === 0 || a1 === 0) {
        reason = 'ANNIHILATION';
        winner = a0 === a1 ? -1 : a0 === 0 ? 1 : 0;
      } else if (this.timer <= 0) {
        reason = 'TIME UP';
        const s0 = w.ships[0].alive, s1 = w.ships[1].alive;
        if (a0 !== a1) winner = a0 > a1 ? 0 : 1;
        else if (s0 !== s1) winner = s0 ? 0 : 1;      // 機数が同じなら、戦艦が残っている側
        else {
          const h0 = w.hpTotal(0), h1 = w.hpTotal(1);
          winner = Math.abs(h0 - h1) < 0.01 ? -1 : h0 > h1 ? 0 : 1;
        }
      }
      if (reason) {
        this.result = {
          winner, reason, time: Math.round(w.time * 10) / 10, alive: [a0, a1], timer: this.timer,
          ships: [w.ships[0].alive, w.ships[1].alive],
        };
        this.history.push(this.result);
        this.setState('result');
        SL.Audio.play(winner === -1 ? 'select' : 'win');
      }
    }

    updateResult(dt) {
      this.world.step(dt);
      this.updateCameras(dt);
      if (this.banner) this.banner.t -= dt;
      const g = SL.Input.global;
      if (this.mode === 'demo') {
        if (this.stateTime > 4) this.startMatch('demo');
      } else if (this.mode === 'online') {
        if (g.quit) this.leaveOnline('YOU LEFT THE MATCH');
        else if (this.stateTime > 1.5 && g.any) this.startMatch('online'); // 再戦
      } else if (this.stateTime > 1.5 && g.any) {
        this.toTitle();
      }
    }

    updateCameras(dt) {
      const k = 1 - Math.exp(-dt * 5);
      for (const v of this.views()) {
        const p = this.players[v.pi];
        if (!p) continue;
        const u = p.unit;
        if (u) {
          p.cam.x += (u.x - v.w / 2 - p.cam.x) * k;
          p.cam.y += (u.y - v.h / 2 - p.cam.y) * k;
        }
        p.cam.x = U.clamp(p.cam.x, -60, C.FIELD_W - v.w + 60);
        p.cam.y = U.clamp(p.cam.y, -40, C.FIELD_H - v.h + 40);
        if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 20);
      }
    }

    // ---------------- インターネット対戦 ----------------
    updateOnlineMenu() {
      const g = SL.Input.global;
      const items = 3;
      if (g.back) { this.setState('title'); return; }
      if (g.up) { this.lobby.menu = (this.lobby.menu + items - 1) % items; SL.Audio.play('select'); }
      if (g.down) { this.lobby.menu = (this.lobby.menu + 1) % items; SL.Audio.play('select'); }
      if (!g.confirm || this.stateTime < 0.2) return;
      if (this.lobby.menu === 2) { this.setState('title'); return; }
      if (!SL.Net.available()) { this.lobby.msg = 'ONLINE IS NOT AVAILABLE (PEERJS NOT LOADED)'; return; }
      this.lobby.msg = '';
      if (this.lobby.menu === 0) {
        this.lobby.code = '';
        this.lobby.status = 'CONNECTING TO SERVER...';
        this.setState('hosting');
        SL.Net.host(this.netHandlers('host'));
      } else {
        this.lobby.code = '';
        this.setState('joining');
        SL.Input.setTextMode(true);
      }
    }

    netHandlers(role) {
      return {
        onOpen: (code) => {
          this.lobby.code = code;
          this.lobby.status = 'WAITING FOR OPPONENT...';
        },
        onConnected: () => this.onNetConnected(role),
        onMessage: (m) => this.onNetMessage(m),
        onClose: (reason) => this.onNetClosed(reason === 'CONNECTION CLOSED' ? 'OPPONENT DISCONNECTED' : reason),
        onError: (msg) => this.onNetError(msg),
      };
    }

    updateHosting() {
      if (SL.Input.global.back) {
        SL.Net.close();
        this.setState('online');
      }
    }

    updateJoining() {
      for (const key of SL.Input.takeTyped()) {
        if (key === 'Escape') {
          SL.Input.setTextMode(false);
          this.setState('online');
          return;
        }
        if (key === 'Backspace') this.lobby.code = this.lobby.code.slice(0, -1);
        else if (key === 'Enter') {
          if (this.lobby.code.length === 5) {
            SL.Input.setTextMode(false);
            this.lobby.status = 'CONNECTING...';
            this.lobby.msg = '';
            this.setState('connecting');
            SL.Net.join(this.lobby.code, this.netHandlers('guest'));
            return;
          }
        } else if (/^[a-zA-Z0-9]$/.test(key) && this.lobby.code.length < 5) {
          this.lobby.code += key.toUpperCase();
        }
      }
    }

    updateConnecting() {
      if (SL.Input.global.back || this.stateTime > 20) {
        SL.Net.close();
        this.net = null;
        this.lobby.msg = this.stateTime > 20 ? 'TIMED OUT' : '';
        this.setState('joining');
        SL.Input.setTextMode(true);
      }
    }

    updateNetMsg() {
      if (this.stateTime > 0.6 && SL.Input.global.any) this.toTitle();
    }

    onNetConnected(role) {
      this.net = {
        role,
        remote: blankRemote(),
        lastC: { target: 0, swap: 0, transform: 0, melee: 0, face: 0 },
        counters: { target: 0, swap: 0, transform: 0, melee: 0, face: 0 },
        lastRecv: performance.now(),
        sendT: 0,
        inputT: 0,
      };
      if (role === 'host') {
        this.localPi = 0;
        this.startMatch('online');
      } else {
        this.localPi = 1;
        SL.Net.send({ t: 'hello' });
        this.lobby.status = 'CONNECTED. WAITING FOR HOST...';
      }
    }

    onNetMessage(m) {
      if (!this.net || !m) return;
      this.net.lastRecv = performance.now();
      if (m.t === 'bye') { this.onNetClosed('OPPONENT LEFT THE MATCH'); return; }
      if (m.t === 'full') { this.onNetError('ROOM IS FULL'); return; }
      if (this.net.role === 'host' && m.t === 'i') {
        const r = this.net.remote;
        r.mx = U.clamp(Number(m.mx) || 0, -1, 1);
        r.my = U.clamp(Number(m.my) || 0, -1, 1);
        r.held.fire1 = !!(m.h & 1);
        r.held.fire2 = !!(m.h & 2);
        r.held.melee = !!(m.h & 4);
        r.held.dash = !!(m.h & 8);
        for (const k of PRESS_KEYS) {
          const c = (m.c && m.c[k]) || 0;
          if (c > this.net.lastC[k]) r.pressed[k] = true;
          this.net.lastC[k] = c;
        }
      } else if (this.net.role === 'guest' && m.t === 's') {
        SL.Net.apply(this, m);
      }
    }

    onNetClosed(reason) {
      if (!this.net && !LOBBY_STATES.includes(this.state)) return;
      SL.Net.close();
      this.net = null;
      this.netMessage(reason);
    }

    onNetError(msg) {
      if (this.state === 'hosting' || this.state === 'online') {
        SL.Net.close();
        this.net = null;
        this.lobby.msg = msg;
        this.setState('online');
      } else if (this.state === 'connecting' || this.state === 'joining') {
        SL.Net.close();
        this.net = null;
        this.lobby.msg = msg;
        this.setState('joining');
        SL.Input.setTextMode(true);
      } else {
        this.onNetClosed(msg);
      }
    }

    leaveOnline(msg) {
      SL.Net.send({ t: 'bye' });
      SL.Net.close();
      this.net = null;
      this.netMessage(msg);
    }

    netMessage(text) {
      this.netMsg = text;
      this.mode = 'cpu';
      this.localPi = 0;
      SL.Input.setTextMode(false);
      this.setState('netmsg');
    }

    // 部屋を作った側：状態を送る
    netTickHost(dt) {
      const n = this.net;
      if (!n) return;
      n.sendT -= dt;
      if (n.sendT <= 0) {
        n.sendT = 1 / C.NET_SNAPSHOT_HZ;
        if (this.world) SL.Net.send(SL.Net.encode(this));
      }
      if (performance.now() - n.lastRecv > 8000) this.onNetClosed('CONNECTION TIMED OUT');
    }

    // 参加した側：届いた状態の間をなめらかにつなぎ、自分の操作を送る
    updateGuest(dt) {
      const n = this.net;
      const w = this.world;
      const g = SL.Input.global;
      if (g.quit) { this.leaveOnline('YOU LEFT THE MATCH'); return; }
      if (w) {
        for (const u of w.units) {
          if (!u.alive || u.nx === undefined) continue;
          u.nx += u.vx * dt;
          u.ny += u.vy * dt;
          const k = Math.min(1, dt * 15);
          u.x += (u.nx - u.x) * k;
          u.y += (u.ny - u.y) * k;
          if (u.flash > 0) u.flash -= dt;
          if (u.lunge > 0) u.lunge = Math.max(0.001, u.lunge - dt); // 次の状態が届くまで振りを進めて見せる
        }
        for (const p of w.projectiles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // ミサイルとロケット弾の煙は、こちらの画面で作る
          const look = p.def && p.def.look;
          if (look === 'missile' || look === 'homing' || look === 'rocket') {
            p.trail = (p.trail || 0) - dt;
            if (p.trail <= 0) {
              p.trail = look === 'rocket' ? 0.025 : 0.03;
              const back = look === 'rocket' ? 9 : 6;
              w.fx.smoke(p.x - Math.cos(p.ang) * back, p.y - Math.sin(p.ang) * back, look === 'rocket' ? 4 : 3);
            }
          }
        }
        for (let i = w.lasers.length - 1; i >= 0; i--) {
          w.lasers[i].life -= dt;
          if (w.lasers[i].life <= 0) w.lasers.splice(i, 1);
        }
        for (const s of w.ships) if (s.flash > 0) s.flash -= dt;
        w.fx.update(dt);
        this.updateCameras(dt);
      }
      if (this.banner) this.banner.t -= dt;

      const inp = SL.Input.players[0];
      if (this.state === 'battle') {
        for (const k of PRESS_KEYS) if (inp.pressed[k]) n.counters[k]++;
      }
      n.inputT -= dt;
      if (n.inputT <= 0) {
        n.inputT = 1 / 30;
        const battle = this.state === 'battle';
        const h = battle ? (inp.held.fire1 ? 1 : 0) | (inp.held.fire2 ? 2 : 0) | (inp.held.melee ? 4 : 0) | (inp.held.dash ? 8 : 0) : 0;
        SL.Net.send({
          t: 'i',
          mx: battle ? Math.round(inp.mx * 100) / 100 : 0,
          my: battle ? Math.round(inp.my * 100) / 100 : 0,
          h,
          c: n.counters,
        });
      }
      if (performance.now() - n.lastRecv > 8000) this.onNetClosed('CONNECTION TIMED OUT');
    }

    // 描画なしでシミュレーションを進める（動作確認用）
    fastForward(seconds) {
      if (this.state === 'vs') this.setState('battle');
      const steps = Math.round(seconds / C.STEP);
      for (let i = 0; i < steps && this.state === 'battle'; i++) this.update(C.STEP);
      return this.result;
    }

    // ---------------- 描画 ----------------
    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, C.W, C.H);
      switch (this.state) {
        case 'title': this.renderTitle(ctx); break;
        case 'online':
        case 'hosting':
        case 'joining':
        case 'connecting':
        case 'netmsg':
          this.renderLobby(ctx);
          break;
        case 'vs': this.renderVS(ctx); break;
        case 'battle':
        case 'result':
          this.renderBattle(ctx);
          if (this.state === 'result') this.renderResult(ctx);
          else if (this.paused) this.renderPause(ctx);
          break;
      }
      if (SL.Audio.muted) F.draw(ctx, 'MUTE', C.W - 4, C.H - 80, { align: 'right', color: '#7a84a8' });
    }

    blink(rate = 3) {
      return ((this.time * rate) | 0) % 2 === 0;
    }

    renderTitle(ctx) {
      this.bg.draw(ctx, this.titleCam.x, this.titleCam.y, C.W, C.H, this.time);
      F.draw(ctx, 'STELLAR LEGION', C.W / 2, 40, { align: 'center', scale: 4, color: '#ffd23a', outline: '#4a1a00' });
      F.draw(ctx, 'ORIGINAL SPACE LEGION BATTLE  -  PROTOTYPE', C.W / 2, 80, { align: 'center', color: '#8fa0d0' });

      this.menuItems.forEach((label, i) => {
        const sel = i === this.menuIndex;
        const y = 98 + i * 19;
        F.draw(ctx, label, C.W / 2, y, { align: 'center', scale: 2, color: sel ? '#ffffff' : '#5a6488', shadow: '#000' });
        if (sel && this.blink(3)) {
          F.draw(ctx, '>', C.W / 2 - 70, y, { scale: 2, color: '#ff4545' });
          F.draw(ctx, '<', C.W / 2 + 60, y, { scale: 2, color: '#ff4545' });
        }
      });

      const help = [
        ['1P ', 'MOVE:WASD SHOT:J SUB:K MELEE:L BOOST:SPACE SWAP:TAB MODE:SHIFT TGT:U FACE:CTRL', '#ff6a6a'],
        ['2P ', 'MOVE:ARROWS SHOT:N1 SUB:N2 MELEE:N3 BOOST:N0 SWAP:N5 MODE:N6 TGT:N4 FACE:N7', '#5ad0ff'],
        ['PAD', 'MOVE:STICK SHOT:A SUB:B MELEE:X BOOST:RT SWAP:LT MODE:LB TGT:Y FACE:RB', '#c0c8e8'],
      ];
      help.forEach(([tag, text, col], i) => {
        const y = 184 + i * 12;
        F.draw(ctx, tag, 22, y, { color: col });
        F.draw(ctx, text, 46, y, { color: '#c0c8e8' });
      });
      F.draw(ctx, 'ESC/P: PAUSE   M: SOUND ON/OFF   (N = NUMPAD)', C.W / 2, 226, { align: 'center', color: '#7a84a8' });
      if (this.menuItems[this.menuIndex] === 'SETTINGS') {
        F.draw(ctx, 'UNITS, WEAPONS, ARMY AND IMAGES. OPENS THE SETTINGS PAGE ON CLAUDE.AI', C.W / 2, 172, { align: 'center', color: '#ffd23a' });
      }
      F.draw(ctx, 'RETURN TO YOUR BATTLESHIP TO REPAIR. DESTROY THE ENEMY SHIP FOR A BONUS.', C.W / 2, 240, { align: 'center', color: '#4be06a' });
      const pads = SL.Input.padCount();
      F.draw(ctx, 'GAMEPADS: ' + pads, C.W / 2, 256, { align: 'center', color: pads ? '#4be06a' : '#5a6488' });
      if (this.blink(2)) F.draw(ctx, 'PRESS J / ENTER / A', C.W / 2, 290, { align: 'center', scale: 2, color: '#ffffff' });
      const na = SL.armyFor(0).length, nc = SL.armyFor(1).length;
      F.draw(ctx, 'AZURE UNION ' + na + '  VS  ' + nc + ' CRIMSON EMPIRE  -  + 1 BATTLESHIP EACH', C.W / 2, 340, { align: 'center', color: '#5a6488' });
    }

    renderLobby(ctx) {
      this.bg.draw(ctx, this.titleCam.x, this.titleCam.y, C.W, C.H, this.time);
      F.draw(ctx, 'ONLINE BATTLE', C.W / 2, 40, { align: 'center', scale: 3, color: '#ffd23a', outline: '#4a1a00' });
      const L = this.lobby;
      if (this.state === 'online') {
        ['CREATE ROOM', 'JOIN ROOM', 'BACK'].forEach((label, i) => {
          const sel = i === L.menu;
          const y = 110 + i * 24;
          F.draw(ctx, label, C.W / 2, y, { align: 'center', scale: 2, color: sel ? '#ffffff' : '#5a6488', shadow: '#000' });
          if (sel && this.blink(3)) F.draw(ctx, '>', C.W / 2 - 90, y, { scale: 2, color: '#ff4545' });
        });
        F.draw(ctx, 'CREATE A ROOM AND SHARE THE 5-LETTER CODE, OR JOIN WITH A CODE.', C.W / 2, 200, { align: 'center', color: '#8fa0d0' });
        F.draw(ctx, 'THE ROOM CREATOR PLAYS 1P (LEFT). THE JOINER PLAYS 2P (RIGHT).', C.W / 2, 214, { align: 'center', color: '#8fa0d0' });
        F.draw(ctx, 'ESC: BACK', C.W / 2, 300, { align: 'center', color: '#7a84a8' });
      } else if (this.state === 'hosting') {
        F.draw(ctx, 'ROOM CODE', C.W / 2, 100, { align: 'center', color: '#8fa0d0' });
        F.draw(ctx, L.code || '-----', C.W / 2, 116, { align: 'center', scale: 5, color: '#ffffff', outline: '#203060' });
        F.draw(ctx, 'TELL THIS CODE TO YOUR OPPONENT', C.W / 2, 170, { align: 'center', color: '#8fa0d0' });
        if (this.blink(2)) F.draw(ctx, L.status, C.W / 2, 200, { align: 'center', color: '#ffd23a' });
        F.draw(ctx, 'ESC: CANCEL', C.W / 2, 300, { align: 'center', color: '#7a84a8' });
      } else if (this.state === 'joining') {
        F.draw(ctx, 'ENTER ROOM CODE', C.W / 2, 100, { align: 'center', color: '#8fa0d0' });
        const shown = (L.code + (this.blink(3) ? '_' : ' ')).padEnd(5, ' ').slice(0, 5);
        F.draw(ctx, shown.replace(/ /g, '.'), C.W / 2, 116, { align: 'center', scale: 5, color: '#ffffff', outline: '#203060' });
        F.draw(ctx, 'TYPE 5 LETTERS AND PRESS ENTER', C.W / 2, 170, { align: 'center', color: '#8fa0d0' });
        F.draw(ctx, 'ESC: BACK', C.W / 2, 300, { align: 'center', color: '#7a84a8' });
      } else if (this.state === 'connecting') {
        F.draw(ctx, 'ROOM ' + L.code, C.W / 2, 110, { align: 'center', scale: 2, color: '#ffffff' });
        if (this.blink(2)) F.draw(ctx, L.status || 'CONNECTING...', C.W / 2, 150, { align: 'center', color: '#ffd23a' });
        F.draw(ctx, 'ESC: CANCEL', C.W / 2, 300, { align: 'center', color: '#7a84a8' });
      } else if (this.state === 'netmsg') {
        F.draw(ctx, this.netMsg, C.W / 2, 140, { align: 'center', scale: 2, color: '#ff6a6a', shadow: '#000' });
        if (this.stateTime > 0.6 && this.blink(2)) F.draw(ctx, 'PRESS ANY KEY', C.W / 2, 190, { align: 'center', color: '#ffffff' });
      }
      if (L.msg && this.state !== 'netmsg') F.draw(ctx, L.msg, C.W / 2, 250, { align: 'center', color: '#ff6a6a', shadow: '#000' });
    }

    renderVS(ctx) {
      this.bg.draw(ctx, 0, 0, C.W, C.H, this.time);
      ctx.fillStyle = '#2a6a8a';
      ctx.fillRect(C.W / 2, 0, 1, C.H);
      const anchors = [{ x: 240, y: 190 }, { x: 400, y: 190 }];
      for (let team = 0; team < 2; team++) {
        const dir = team === 0 ? 1 : -1;
        const fac = SL.FACTIONS[team];
        SL.Sprites.draw(ctx, SL.SHIPS[team].sprite, team === 0 ? 50 : C.W - 50, 190, dir);
        const army = SL.armyFor(team, this.armyCounts);
        // 体数が多くても画面に収まるように縮める
        const minFx = Math.min(-1, ...army.map((s) => s.fx));
        const maxFx = Math.max(1, ...army.map((s) => s.fx));
        const SX = Math.min(0.6, 135 / -minFx, 60 / maxFx);
        const SY = {}; // 縦は役割ごとに縮める（列の間隔が広い役割だけ詰める）
        for (const s of army) SY[s.role] = Math.min(SY[s.role] || 0.6, 130 / Math.max(1, Math.abs(s.fy)));
        const leadIndex = Math.max(0, army.findIndex((s) => s.role === 'commander'));
        army.forEach((s, i) => {
          const type = SL.UNIT_TYPES[s.type];
          const x = anchors[team].x + s.fx * dir * SX;
          const y = anchors[team].y + s.fy * SY[s.role];
          // M / L の機体は、ここでは半分くらいに縮めて見せる
          const k = SL.sizeScale(type.size, team, type.sprite);
          SL.Sprites.draw(ctx, type.sprite, x, y, dir, null, k > 1 ? Math.max(1, k * 0.6) : 1);
          if (i === leadIndex && this.players[team]) {
            this.drawTag(ctx, x, y - 16, this.players[team].label, C.PLAYER_TAG_COLORS[team]);
          }
        });
        F.draw(ctx, fac.name, team === 0 ? C.W / 4 : (C.W * 3) / 4, 336, { align: 'center', color: fac.color, shadow: '#000' });
      }
      F.draw(ctx, 'BATTLE', C.W / 2, 22, { align: 'center', scale: 3, color: '#ffd23a', outline: '#4a1a00' });
      F.draw(ctx, 'VS', C.W / 2, 150, { align: 'center', scale: 5, color: '#ffd23a', outline: '#4a1a00' });
      if (this.mode !== 'demo' && this.blink(2)) {
        const text = this.isGuest() ? 'WAITING FOR HOST' : 'PRESS ANY KEY TO START';
        F.draw(ctx, text, C.W / 2, 240, { align: 'center', color: '#ffffff', shadow: '#000' });
      }
      if (this.mode === 'online') {
        F.draw(ctx, 'YOU ARE ' + (this.localPi === 0 ? '1P (LEFT)' : '2P (RIGHT)'), C.W / 2, 262, { align: 'center', color: C.PLAYER_TAG_COLORS[this.localPi], shadow: '#000' });
      }
    }

    drawTag(ctx, x, y, label, color) {
      const w = F.measure(label) + 4;
      const bx = Math.round(x - w / 2), by = Math.round(y - 5);
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, w, 9);
      ctx.fillRect(Math.round(x) - 1, by + 9, 3, 1);
      ctx.fillRect(Math.round(x), by + 10, 1, 1);
      F.draw(ctx, label, bx + 2, by + 1, { color: '#ffffff' });
    }

    renderBattle(ctx) {
      const views = this.views();
      for (const v of views) this.renderView(ctx, v);
      if (views.length > 1) {
        ctx.fillStyle = '#2a6a8a';
        ctx.fillRect(C.W / 2 - 1, 0, 2, C.H);
      }
      SL.HUD.draw(ctx, this);
    }

    renderView(ctx, v) {
      const p = this.players[v.pi];
      if (!p) return;
      const sh = p.shake;
      const camX = Math.round(p.cam.x + (sh ? U.rand(-sh, sh) : 0));
      const camY = Math.round(p.cam.y + (sh ? U.rand(-sh, sh) : 0));
      ctx.save();
      ctx.beginPath();
      ctx.rect(v.sx, v.sy, v.w, v.h);
      ctx.clip();
      ctx.translate(v.sx, v.sy);
      this.bg.draw(ctx, camX, camY, v.w, v.h, this.time);
      ctx.translate(-camX, -camY);
      const view = { x: camX, y: camY, w: v.w, h: v.h };
      const localUnits = this.players.filter((q) => this.isLocalHuman(q)).map((q) => q.unit);
      this.world.draw(ctx, view, this.time, localUnits);

      // 照準（この画面で操作しているプレイヤーだけ）
      const me = p.unit;
      if (this.isLocalHuman(p) && me && me.alive && me.target && me.target.targetable) this.drawReticle(ctx, me.target, C.PLAYER_TAG_COLORS[p.index]);
      // 担当機体の上の 1P / 2P / CPU 表示
      for (const q of this.players) {
        if (q.unit && q.unit.alive) {
          const spr = SL.Sprites.get(q.unit.sprite);
          this.drawTag(ctx, q.unit.x, q.unit.y - (spr.h * q.unit.drawScale) / 2 - 8, q.label, C.PLAYER_TAG_COLORS[q.index]);
        }
      }
      ctx.restore();

      // 画面外にいる目標の方向を示す矢印
      if (this.isLocalHuman(p) && me && me.alive && me.target && me.target.targetable) {
        const t = me.target;
        const sx = t.x - camX, sy = t.y - camY;
        const top = 34, bottom = v.h - 76;
        if (sx < 0 || sx > v.w || sy < top || sy > bottom) {
          const cx = v.w / 2, cy = (top + bottom) / 2;
          const a = Math.atan2(sy - cy, sx - cx);
          const ex = U.clamp(cx + Math.cos(a) * 1000, 8, v.w - 8);
          const ey = U.clamp(cy + Math.sin(a) * 1000, top + 6, bottom - 6);
          ctx.save();
          ctx.translate(v.sx + ex, v.sy + ey);
          ctx.rotate(a);
          ctx.fillStyle = C.PLAYER_TAG_COLORS[p.index];
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-3, -4);
          ctx.lineTo(-3, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    drawReticle(ctx, t, color) {
      const r = t.radius + 5 + (this.blink(4) ? 1 : 0);
      const x = Math.round(t.x), y = Math.round(t.y);
      ctx.fillStyle = color;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = x + sx * r, cy = y + sy * r;
        ctx.fillRect(sx < 0 ? cx : cx - 3, cy, 4, 1);
        ctx.fillRect(cx, sy < 0 ? cy : cy - 3, 1, 4);
      }
      if (!t.isShip) SL.HUD.bar(ctx, x - 10, y + r + 3, 20, 2, t.hpRatio, SL.HUD.hpColor(t.hpRatio));
    }

    renderResult(ctx) {
      const r = this.result;
      if (!r) return;
      let text, color;
      if (r.winner === -1) { text = 'DRAW'; color = '#ffffff'; }
      else { text = this.players[r.winner].label + ' WIN'; color = r.winner === 0 ? '#ff3a3a' : '#3fc8ff'; }
      F.draw(ctx, text, C.W / 2, 140, { align: 'center', scale: 5, color, outline: '#1a0008' });
      F.draw(ctx, r.reason, C.W / 2, 184, { align: 'center', scale: 2, color: '#ffd23a', shadow: '#000' });
      if (this.mode === 'demo' || this.stateTime < 1.5 || !this.blink(2)) return;
      let hint = 'PRESS ANY KEY';
      if (this.mode === 'online') hint = this.isGuest() ? 'WAITING FOR HOST...   Q: QUIT' : 'ANY KEY: REMATCH   Q: QUIT';
      F.draw(ctx, hint, C.W / 2, 210, { align: 'center', color: '#ffffff', shadow: '#000' });
    }

    renderPause(ctx) {
      ctx.fillStyle = 'rgba(0,0,10,0.6)';
      ctx.fillRect(0, 0, C.W, C.H);
      F.draw(ctx, 'PAUSE', C.W / 2, 140, { align: 'center', scale: 4, color: '#ffffff', outline: '#000' });
      F.draw(ctx, 'ESC / P / START: RESUME     Q / BACK: QUIT TO TITLE', C.W / 2, 186, { align: 'center', color: '#c0c8e8' });
    }
  }

  SL.Game = Game;
})();
