'use strict';
// ゲームの進行：タイトル → VS 画面 → 戦闘 → 結果。プレイヤー・カメラ・乗り換え・勝敗判定を扱う。
(function () {
  const U = SL.util;
  const C = SL.CONFIG;
  const F = SL.Font;

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
      this.mode = 'cpu';          // 'cpu' | '2p' | 'demo'
      this.world = null;
      this.players = [];
      this.timer = C.TIME_START;
      this.tickAcc = 0;
      this.result = null;
      this.paused = false;
      this.history = [];          // 終わった試合の結果（動作確認用）
      this.titleCam = { x: 0, y: 0 };

      if (SL.DEBUG.demo) this.startMatch('demo');
      else if (SL.DEBUG.mode === 'cpu' || SL.DEBUG.mode === '2p') this.startMatch(SL.DEBUG.mode);
    }

    inputMode() {
      return this.mode === '2p' && this.state !== 'title' ? 'dual' : 'single';
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
      return [{ pi: 0, sx: 0, sy: 0, w: C.W, h: C.H }];
    }

    startMatch(mode) {
      this.mode = mode;
      this.world = new SL.World({
        onDestroyed: (u, k) => this.onDestroyed(u, k),
        sound: (n, x, y, v) => this.sfx(n, x, y, v),
      });
      this.world.spawnArmies();
      this.timer = C.TIME_START;
      this.tickAcc = 0;
      this.result = null;
      this.paused = false;
      const humans = mode === '2p' ? [true, true] : mode === 'cpu' ? [true, false] : [false, false];
      const labels = mode === '2p' ? ['1P', '2P'] : mode === 'cpu' ? ['1P', 'CPU'] : ['CPU1', 'CPU2'];
      this.players = [0, 1].map((i) => ({
        index: i, team: i, human: humans[i], label: labels[i],
        unit: null, switchT: 0, cam: { x: 0, y: 0 }, shake: 0,
      }));
      const views = this.views();
      for (const p of this.players) {
        const cmd = this.world.units.find((u) => u.team === p.team && u.role === 'commander');
        this.assign(p, cmd);
        const v = views.find((vv) => vv.pi === p.index) || views[0];
        p.cam.x = cmd.x - v.w / 2;
        p.cam.y = cmd.y - v.h / 2;
      }
      this.setState('vs');
      SL.Audio.play('select');
    }

    toTitle() {
      this.mode = 'cpu';
      this.paused = false;
      this.setState('title');
    }

    // プレイヤー p の担当機体を unit にする
    assign(p, unit) {
      if (p.unit && p.unit !== unit) {
        p.unit.controller = -1;
        p.unit.leader = -1;
      }
      p.unit = unit;
      if (unit) {
        unit.leader = p.index;
        unit.controller = p.human ? p.index : -1;
        if (p.human) {
          const it = unit.intent;
          it.mx = it.my = 0;
          it.fire1 = it.fire2 = it.melee = it.dash = false;
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
      const list = this.world.enemiesByDistance(u).slice(0, 8);
      if (list.length === 0) return;
      const i = list.indexOf(u.target);
      u.target = list[(i + 1) % list.length];
      SL.Audio.play('select', 0.5);
    }

    onDestroyed(u) {
      for (const p of this.players) {
        if (p.unit === u) {
          p.switchT = C.SWITCH_DELAY;
          p.shake = 6;
        } else if (p.unit && p.unit.alive) {
          const d = Math.hypot(p.unit.x - u.x, p.unit.y - u.y);
          if (d < 200) p.shake = Math.max(p.shake, (u.role === 'giant' ? 5 : 2.5) * (1 - d / 200));
        }
      }
    }

    // 音量はカメラから遠いほど小さくする
    sfx(name, x, y, vol = 1) {
      let f = 0;
      for (const v of this.views()) {
        const p = this.players[v.pi];
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
      switch (this.state) {
        case 'title': this.updateTitle(dt); break;
        case 'vs': this.updateVS(dt); break;
        case 'battle': this.updateBattle(dt); break;
        case 'result': this.updateResult(dt); break;
      }
    }

    updateTitle(dt) {
      const g = SL.Input.global;
      this.titleCam.x += dt * 25;
      this.titleCam.y += dt * 6;
      if (g.up || g.down) {
        this.menuIndex = (this.menuIndex + 1) % 2;
        SL.Audio.play('select');
      }
      if (g.confirm && this.stateTime > 0.2) {
        SL.Audio.ensure();
        this.startMatch(this.menuIndex === 0 ? 'cpu' : '2p');
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
      if (g.pause && this.mode !== 'demo') {
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
      const inp = SL.Input.players[p.index];
      const it = u.intent;
      it.mx = inp.mx;
      it.my = inp.my;
      it.fire1 = inp.held.fire1;
      it.fire2 = inp.held.fire2;
      it.melee = inp.held.melee || inp.pressed.melee;
      it.dash = inp.held.dash;
      if (inp.pressed.target) this.cycleTarget(u);
      if (inp.pressed.swap) {
        const nu = this.nextAlly(p.team, u);
        if (nu && nu !== u) {
          this.assign(p, nu);
          SL.Audio.play('select');
        }
      }
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
        if (a0 !== a1) winner = a0 > a1 ? 0 : 1;
        else {
          const h0 = w.hpTotal(0), h1 = w.hpTotal(1);
          winner = Math.abs(h0 - h1) < 0.01 ? -1 : h0 > h1 ? 0 : 1;
        }
      }
      if (reason) {
        this.result = { winner, reason, time: Math.round(w.time * 10) / 10, alive: [a0, a1], timer: this.timer };
        this.history.push(this.result);
        this.setState('result');
        SL.Audio.play(winner === -1 ? 'select' : 'win');
      }
    }

    updateResult(dt) {
      this.world.step(dt);
      this.updateCameras(dt);
      const g = SL.Input.global;
      if (this.mode === 'demo') {
        if (this.stateTime > 4) this.startMatch('demo');
      } else if (this.stateTime > 1.5 && g.any) {
        this.toTitle();
      }
    }

    updateCameras(dt) {
      const k = 1 - Math.exp(-dt * 5);
      for (const v of this.views()) {
        const p = this.players[v.pi];
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
        case 'vs': this.renderVS(ctx); break;
        case 'battle':
        case 'result':
          this.renderBattle(ctx);
          if (this.state === 'result') this.renderResult(ctx);
          else if (this.paused) this.renderPause(ctx);
          break;
      }
      if (SL.Audio.muted) F.draw(ctx, 'MUTE', C.W - 4, C.H - 70, { align: 'right', color: '#7a84a8' });
    }

    blink(rate = 3) {
      return ((this.time * rate) | 0) % 2 === 0;
    }

    renderTitle(ctx) {
      this.bg.draw(ctx, this.titleCam.x, this.titleCam.y, C.W, C.H, this.time);
      F.draw(ctx, 'STELLAR LEGION', C.W / 2, 48, { align: 'center', scale: 4, color: '#ffd23a', outline: '#4a1a00' });
      F.draw(ctx, 'ORIGINAL SPACE LEGION BATTLE  -  PROTOTYPE', C.W / 2, 90, { align: 'center', color: '#8fa0d0' });

      const items = ['1P VS CPU', '1P VS 2P'];
      items.forEach((label, i) => {
        const sel = i === this.menuIndex;
        const y = 122 + i * 22;
        F.draw(ctx, label, C.W / 2, y, { align: 'center', scale: 2, color: sel ? '#ffffff' : '#5a6488', shadow: '#000' });
        if (sel && this.blink(3)) {
          F.draw(ctx, '>', C.W / 2 - 70, y, { scale: 2, color: '#ff4545' });
          F.draw(ctx, '<', C.W / 2 + 60, y, { scale: 2, color: '#ff4545' });
        }
      });

      const help = [
        ['1P ', 'MOVE:WASD  SHOT:J  SUB:K  MELEE:L  DASH:SPACE  TARGET:U  SWAP:I', '#ff6a6a'],
        ['2P ', 'MOVE:ARROWS SHOT:NUM1 SUB:NUM2 MELEE:NUM3 DASH:NUM0 TGT:NUM4 SWAP:NUM5', '#5ad0ff'],
        ['PAD', 'MOVE:STICK  SHOT:A  SUB:B  MELEE:X  DASH:RT  TARGET:Y  SWAP:LT', '#c0c8e8'],
      ];
      help.forEach(([tag, text, col], i) => {
        const y = 196 + i * 12;
        F.draw(ctx, tag, 40, y, { color: col });
        F.draw(ctx, text, 64, y, { color: '#c0c8e8' });
      });
      F.draw(ctx, 'ESC/P: PAUSE    M: SOUND ON/OFF    1P VS CPU ALSO ACCEPTS ARROWS', C.W / 2, 240, { align: 'center', color: '#7a84a8' });
      const pads = SL.Input.padCount();
      F.draw(ctx, 'GAMEPADS: ' + pads, C.W / 2, 256, { align: 'center', color: pads ? '#4be06a' : '#5a6488' });
      if (this.blink(2)) F.draw(ctx, 'PRESS J / ENTER / A', C.W / 2, 290, { align: 'center', scale: 2, color: '#ffffff' });
      F.draw(ctx, 'AZURE UNION  VS  CRIMSON EMPIRE  -  16 UNITS EACH', C.W / 2, 340, { align: 'center', color: '#5a6488' });
    }

    renderVS(ctx) {
      this.bg.draw(ctx, 0, 0, C.W, C.H, this.time);
      ctx.fillStyle = '#2a6a8a';
      ctx.fillRect(C.W / 2, 0, 1, C.H);
      const anchors = [{ x: 205, y: 190 }, { x: 435, y: 190 }];
      for (let team = 0; team < 2; team++) {
        const dir = team === 0 ? 1 : -1;
        const fac = SL.FACTIONS[team];
        SL.ARMY.forEach((s) => {
          const type = SL.UNIT_TYPES[fac.prefix + '_' + s.role];
          const x = anchors[team].x + s.fx * dir * 0.75;
          const y = anchors[team].y + s.fy * 0.75;
          SL.Sprites.draw(ctx, type.sprite, x, y, dir);
          if (s.role === 'commander') {
            const p = this.players[team];
            this.drawTag(ctx, x, y - 16, p.label, C.PLAYER_TAG_COLORS[team]);
          }
        });
        F.draw(ctx, fac.name, team === 0 ? C.W / 4 : (C.W * 3) / 4, 336, { align: 'center', color: fac.color, shadow: '#000' });
      }
      F.draw(ctx, 'BATTLE', C.W / 2, 22, { align: 'center', scale: 3, color: '#ffd23a', outline: '#4a1a00' });
      F.draw(ctx, 'VS', C.W / 2, 150, { align: 'center', scale: 5, color: '#ffd23a', outline: '#4a1a00' });
      if (this.mode !== 'demo' && this.blink(2)) {
        F.draw(ctx, 'PRESS ANY KEY TO START', C.W / 2, 240, { align: 'center', color: '#ffffff', shadow: '#000' });
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
      this.world.draw(ctx, view, this.time);

      // 照準（人間のプレイヤーだけ）
      const me = p.unit;
      if (p.human && me && me.alive && me.target && me.target.alive) this.drawReticle(ctx, me.target, C.PLAYER_TAG_COLORS[p.index]);
      // 担当機体の上の 1P / 2P / CPU 表示
      for (const q of this.players) {
        if (q.unit && q.unit.alive) {
          const spr = SL.Sprites.get(q.unit.sprite);
          this.drawTag(ctx, q.unit.x, q.unit.y - spr.h / 2 - 8, q.label, C.PLAYER_TAG_COLORS[q.index]);
        }
      }
      ctx.restore();

      // 画面外にいる目標の方向を示す矢印
      if (p.human && me && me.alive && me.target && me.target.alive) {
        const t = me.target;
        const sx = t.x - camX, sy = t.y - camY;
        const top = 24, bottom = v.h - 70;
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
      HUDbar(ctx, x - 10, y + r + 3, 20, 2, t.hpRatio);
    }

    renderResult(ctx) {
      const r = this.result;
      if (!r) return;
      let text, color;
      if (r.winner === -1) { text = 'DRAW'; color = '#ffffff'; }
      else { text = this.players[r.winner].label + ' WIN'; color = r.winner === 0 ? '#ff3a3a' : '#3fc8ff'; }
      F.draw(ctx, text, C.W / 2, 140, { align: 'center', scale: 5, color, outline: '#1a0008' });
      F.draw(ctx, r.reason, C.W / 2, 184, { align: 'center', scale: 2, color: '#ffd23a', shadow: '#000' });
      if (this.mode !== 'demo' && this.stateTime > 1.5 && this.blink(2)) {
        F.draw(ctx, 'PRESS ANY KEY', C.W / 2, 210, { align: 'center', color: '#ffffff', shadow: '#000' });
      }
    }

    renderPause(ctx) {
      ctx.fillStyle = 'rgba(0,0,10,0.6)';
      ctx.fillRect(0, 0, C.W, C.H);
      F.draw(ctx, 'PAUSE', C.W / 2, 140, { align: 'center', scale: 4, color: '#ffffff', outline: '#000' });
      F.draw(ctx, 'ESC / P / START: RESUME     Q / BACK: QUIT TO TITLE', C.W / 2, 186, { align: 'center', color: '#c0c8e8' });
    }
  }

  function HUDbar(ctx, x, y, w, h, ratio) {
    SL.HUD.bar(ctx, x, y, w, h, ratio, SL.HUD.hpColor(ratio));
  }

  SL.Game = Game;
})();
