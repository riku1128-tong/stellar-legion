'use strict';
// 機体（Unit）・戦艦（Ship）・戦場（World）。
// 移動（イージングと慣性）、ブースト、変形、射撃、格闘、当たり判定、撃墜、戦艦での修理を扱う。
(function () {
  const U = SL.util;
  const C = SL.CONFIG;

  class Unit {
    constructor(typeId, team, slot) {
      const t = SL.UNIT_TYPES[typeId];
      if (!t) throw new Error('unknown unit type: ' + typeId);
      this.typeId = typeId;
      this.type = t;
      this.team = team;
      this.slot = slot;          // 編成の中の番号（0〜15）。Tab で乗り換える順番
      this.id = 0;               // World.units の中の番号
      this.name = t.name;
      this.role = t.role;
      this.radius = t.radius;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;  // 実際の速度（移動 + ノックバック）
      this.heading = team === 0 ? 0 : Math.PI; // 進んでいる向き
      this.speed = 0;            // 進んでいる速さ
      this.kvx = 0; this.kvy = 0; // ノックバック
      this.hp = t.hp;
      this.maxHp = t.hp;
      this.alive = true;
      this.facing = team === 0 ? 1 : -1;
      this.faceLock = 0;         // 0 = 向きは自動（目標の方を向く）、1 / -1 = 手動で右 / 左に固定（Ctrl）
      this.maxEnergy = t.energy || C.ENERGY_MAX;
      this.energy = this.maxEnergy;
      this.enT = 99;             // 最後にビームを撃ってからの秒数
      this.boost = 1;
      this.boostLock = false;    // 使い切って回復待ち
      this.boostT = 99;
      this.boosting = false;
      this.mode = 'battle';      // 'battle'（戦闘モード）/ 'move'（移動モード）
      this.transformCD = 0;
      this.stun = 0;             // しびれている残り秒数
      this.stunImmune = 0;       // しびれが解けたあと、しびれない残り秒数
      this.docked = false;       // 戦艦の中にいる
      this.weapons = t.weapons.map((id) => {
        if (!id) return null;
        const def = SL.WEAPONS[id];
        return { id, def, ammo: def.ammo || 0, cd: 0, charge: 0, refill: 0 };
      });
      this.target = null;
      this.controller = -1;      // 操作しているプレイヤー番号（-1 = AI）
      this.leader = -1;          // このユニットを担当しているプレイヤー（CPU 担当も含む）
      this.intent = { mx: 0, my: 0, fire1: false, fire2: false, melee: false, dash: false, transform: false, faceFlip: false };
      this.flash = 0;
      this.lunge = 0;
      this.lungeDir = { x: 1, y: 0 };
      this.lungeDef = null;
      this.lungeHits = null;
      this.home = { x: 0, y: 0 };
      this.lastHitBy = null;
      this.kills = 0;
      this.ai = {
        think: U.rand(0, 0.4), strafe: U.chance(0.5) ? 1 : -1, mode: 'engage', modeT: 0,
        fireMain: true, fireSub: false, aimErr: 0, wob: U.rand(0, 6.28), retreatCD: 0,
      };
    }

    get hpRatio() { return this.hp / this.maxHp; }
    get sprite() { return this.mode === 'move' && this.type.transform ? this.type.transform.sprite : this.type.sprite; }
    get baseSpeed() { return this.type.speed * (this.mode === 'move' && this.type.transform ? this.type.transform.speed : 1); }
    get targetable() { return this.alive && !this.docked; }
    get charging() { return this.weapons.some((w) => w && w.charge > 0); }
    // 手動で向きを固定しているとき、e が後ろ側にいるか
    isBehind(e) { return this.faceLock !== 0 && (e.x - this.x) * this.faceLock < 0; }
  }

  class Ship {
    constructor(team) {
      const d = SL.SHIPS[team];
      this.isShip = true;
      this.team = team;
      this.name = d.name;
      this.sprite = d.sprite;
      this.role = 'ship';
      this.hp = d.hp;
      this.maxHp = d.hp;
      this.radius = d.radius;
      this.dockR = d.dockR;
      this.x = d.x; this.y = d.y;
      this.vx = 0; this.vy = 0;
      this.alive = true;
      this.flash = 0;
      this.facing = team === 0 ? 1 : -1;
    }

    get hpRatio() { return this.hp / this.maxHp; }
    get targetable() { return this.alive; }
  }

  function canUseWeapon(u, w) {
    if (!w) return false;
    const d = w.def;
    if (d.kind === 'melee') return u.mode !== 'move';
    if (d.ammo && w.ammo <= 0) return false;
    if (d.energy && u.energy < d.energy) return false;
    return true;
  }

  class World {
    // hooks: { onDestroyed(unit, killer), onShipDestroyed(ship, killer), sound(name, x, y, vol) }
    constructor(hooks) {
      this.units = [];
      this.ships = [];
      this.projectiles = [];
      this.lasers = [];
      this.fx = new SL.Effects();
      this.time = 0;
      this.hooks = hooks || {};
      this.rec = null; // インターネット対戦用：相手に送るエフェクトと効果音
    }

    startRecording() {
      this.rec = [];
      this.fx.rec = this.rec;
    }

    takeRecorded() {
      const r = this.rec || [];
      this.rec = [];
      this.fx.rec = this.rec;
      return r;
    }

    spawnArmies() {
      for (let team = 0; team < 2; team++) {
        const prefix = SL.FACTIONS[team].prefix;
        const dir = team === 0 ? 1 : -1;
        const sp = C.SPAWN[team];
        SL.ARMY.forEach((slotDef, i) => {
          const u = new Unit(prefix + '_' + slotDef.role, team, i);
          u.x = sp.x + slotDef.fx * dir * 1.3;
          u.y = sp.y + slotDef.fy * 1.3;
          u.home = { x: sp.x, y: u.y };
          u.facing = dir;
          u.id = this.units.length;
          this.units.push(u);
        });
      }
      this.ships = [new Ship(0), new Ship(1)];
    }

    aliveCount(team) {
      let n = 0;
      for (const u of this.units) if (u.alive && u.team === team) n++;
      return n;
    }

    hpTotal(team) {
      let s = 0;
      for (const u of this.units) if (u.alive && u.team === team) s += u.hpRatio;
      return s;
    }

    // 狙える敵（機体 + 戦艦）を近い順に
    enemiesByDistance(u) {
      const list = this.units.filter((e) => e.targetable && e.team !== u.team);
      const ship = this.ships[1 - u.team];
      if (ship && ship.alive) list.push(ship);
      return list.sort((a, b) => U.dist2(u.x, u.y, a.x, a.y) - U.dist2(u.x, u.y, b.x, b.y));
    }

    // いちばん近い敵の機体（いなければ敵の戦艦）。向きを固定しているときは前にいる敵を優先する
    nearestEnemy(u) {
      let best = null, bd = Infinity;
      for (const e of this.units) {
        if (!e.targetable || e.team === u.team) continue;
        const d = U.dist2(u.x, u.y, e.x, e.y) * (u.isBehind(e) ? 100 : 1);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) {
        const ship = this.ships[1 - u.team];
        if (ship && ship.alive) best = ship;
      }
      return best;
    }

    sound(name, x, y, vol = 1) {
      if (this.rec) this.rec.push(['snd', name, Math.round(x), Math.round(y), vol]);
      if (this.hooks.sound) this.hooks.sound(name, x, y, vol);
    }

    step(dt) {
      this.time += dt;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (u.controller < 0 && u.stun <= 0) SL.AI.update(u, this, dt);
        this.updateUnit(u, dt);
      }
      this.updateDocking(dt);
      this.separate(dt);
      this.updateProjectiles(dt);
      this.updateLasers(dt);
      for (const s of this.ships) if (s.flash > 0) s.flash -= dt;
      this.fx.update(dt);
    }

    // ---------------- 機体 ----------------
    updateUnit(u, dt) {
      const t = u.type;
      const it = u.intent;
      if (u.target && !u.target.targetable) u.target = null;
      if (!u.target && u.controller >= 0) u.target = this.nearestEnemy(u);
      // 向きを固定しているときに目標が後ろへ回ったら、前にいる敵に目標を移す
      if (u.controller >= 0 && u.faceLock && u.target && u.isBehind(u.target)) {
        const front = this.nearestEnemy(u);
        if (front && !u.isBehind(front)) u.target = front;
      }
      if (u.transformCD > 0) u.transformCD -= dt;
      if (u.flash > 0) u.flash -= dt;
      for (const w of u.weapons) if (w && w.cd > 0) w.cd -= dt;

      const stunned = u.stun > 0;
      if (stunned) {
        u.stun -= dt;
        for (const w of u.weapons) if (w) w.charge = 0;
        if (u.stun <= 0) u.stunImmune = C.STUN_IMMUNE;
      } else if (u.stunImmune > 0) {
        u.stunImmune -= dt;
      }

      // 変形
      if (it.transform && t.transform && u.transformCD <= 0 && !stunned && u.lunge <= 0) {
        u.mode = u.mode === 'move' ? 'battle' : 'move';
        u.transformCD = 0.4;
        this.fx.burst(u.x, u.y, SL.FACTIONS[u.team].beam);
        this.sound('transform', u.x, u.y);
      }
      it.transform = false;

      // 左右の向きを反転して固定する（Ctrl）。目標が後ろになったら、前にいる敵に目標を移す
      if (it.faceFlip && !stunned) {
        u.faceLock = -(u.faceLock || u.facing);
        u.facing = u.faceLock;
        if (u.target && u.isBehind(u.target)) u.target = this.nearestEnemy(u);
        this.sound('turn', u.x, u.y, 0.8);
      }
      it.faceFlip = false;

      // ブーストゲージ
      const inMag = stunned ? 0 : Math.min(1, Math.hypot(it.mx, it.my));
      const boostOn = !stunned && it.dash && inMag > 0.1 && !u.boostLock && u.boost > 0;
      u.boosting = boostOn;
      if (boostOn) {
        u.boost -= C.BOOST_DRAIN * dt;
        u.boostT = 0;
        if (u.boost <= 0) { u.boost = 0; u.boostLock = true; }
      } else {
        u.boostT += dt;
        if (u.boostT > C.BOOST_REGEN_DELAY) u.boost = Math.min(1, u.boost + C.BOOST_REGEN * dt);
        if (u.boostLock && u.boost >= C.BOOST_UNLOCK) u.boostLock = false;
      }

      // ビームエネルギー（撃たずにいると回復）
      u.enT += dt;
      if (u.enT > C.EN_REGEN_DELAY) u.energy = Math.min(u.maxEnergy, u.energy + C.EN_REGEN * dt);

      // 移動：はじめはゆっくり、だんだん加速する。速いほど曲がりにくい
      const base = u.baseSpeed;
      if (u.lunge > 0) {
        u.lunge -= dt;
        const sp = u.lungeStop ? 20 : u.lungeDef.lunge; // 当たったら踏み込みを止めて、振り抜きだけ続ける
        u.vx = u.lungeDir.x * sp + u.kvx;
        u.vy = u.lungeDir.y * sp + u.kvy;
        this.meleeCheck(u);
        if (u.lunge <= 0) {
          u.heading = Math.atan2(u.lungeDir.y, u.lungeDir.x);
          u.speed = Math.min(base, sp * 0.35);
        }
      } else {
        const maxSp = base * (boostOn ? C.BOOST_MUL : 1) * (u.charging ? 0.5 : 1);
        if (inMag > 0.1) {
          const want = Math.atan2(it.my, it.mx);
          if (u.speed < 4) u.heading = want;
          const diff = U.wrapAngle(want - u.heading);
          const sr = u.speed / t.speed;
          const turnMul = u.mode === 'move' && t.transform ? t.transform.turn : 1;
          const turn = (C.TURN_SLOW / (1 + C.TURN_K * sr * sr)) * turnMul;
          u.heading = U.wrapAngle(u.heading + U.clamp(diff, -turn * dt, turn * dt));
          // 向きが大きくずれているときは減速しながら曲がる
          const align = Math.max(0, Math.cos(diff));
          const target = maxSp * inMag * (0.25 + 0.75 * align);
          if (u.speed < target) {
            const A = (base / C.ACCEL_TIME) * 1.7 * (boostOn ? 1.6 : 1);
            const acc = A * (0.25 + 0.75 * Math.min(1, u.speed / base));
            u.speed = Math.min(target, u.speed + acc * dt);
          } else {
            u.speed = Math.max(target, u.speed - base * C.DECEL * dt);
          }
        } else {
          // 入力がないときは慣性で滑りながら止まる（戦艦の中ではすぐ止まる）
          const brake = u.docked ? 6 : stunned ? 2 : 0.6;
          u.speed = Math.max(0, u.speed - base * C.DECEL * brake * dt);
        }
        u.vx = Math.cos(u.heading) * u.speed + u.kvx;
        u.vy = Math.sin(u.heading) * u.speed + u.kvy;
      }
      const kd = Math.exp(-5 * dt);
      u.kvx *= kd;
      u.kvy *= kd;
      u.x += u.vx * dt;
      u.y += u.vy * dt;

      // 戦場の外に出ない（端にぶつかると跳ね返って減速）
      const m = u.radius + 4;
      if (u.x < m) { u.x = m; if (Math.cos(u.heading) < 0) { u.heading = Math.PI - u.heading; u.speed *= 0.4; } u.kvx = Math.abs(u.kvx); }
      if (u.x > C.FIELD_W - m) { u.x = C.FIELD_W - m; if (Math.cos(u.heading) > 0) { u.heading = Math.PI - u.heading; u.speed *= 0.4; } u.kvx = -Math.abs(u.kvx); }
      if (u.y < m) { u.y = m; if (Math.sin(u.heading) < 0) { u.heading = -u.heading; u.speed *= 0.4; } u.kvy = Math.abs(u.kvy); }
      if (u.y > C.FIELD_H - m) { u.y = C.FIELD_H - m; if (Math.sin(u.heading) > 0) { u.heading = -u.heading; u.speed *= 0.4; } u.kvy = -Math.abs(u.kvy); }

      // 絵の向き
      if (u.lunge > 0) {
        if (Math.abs(u.lungeDir.x) > 0.1) u.facing = u.lungeDir.x > 0 ? 1 : -1;
      } else if (u.faceLock && u.mode !== 'move') {
        u.facing = u.faceLock;
      } else if (u.mode === 'move') {
        if (u.speed > 10 && Math.abs(Math.cos(u.heading)) > 0.2) u.facing = Math.cos(u.heading) > 0 ? 1 : -1;
      } else if (u.target) {
        const dx = u.target.x - u.x;
        if (Math.abs(dx) > 3) u.facing = dx > 0 ? 1 : -1;
      } else if (u.speed > 10) {
        u.facing = Math.cos(u.heading) >= 0 ? 1 : -1;
      }

      // 攻撃
      if (!stunned && !u.docked) {
        this.handleFire(u, 0, it.fire1, dt);
        this.handleFire(u, 1, it.fire2, dt);
        if (it.melee) this.fire(u, 2);
      } else {
        for (const w of u.weapons) if (w) w.charge = 0;
      }
    }

    handleFire(u, slot, held, dt) {
      const w = u.weapons[slot];
      if (!w) return;
      if (w.def.kind === 'charge') {
        // 押している間チャージし、たまってから離すと発射
        if (held && w.cd <= 0 && u.energy >= w.def.energy && u.lunge <= 0) {
          if (w.charge === 0) this.sound('charge', u.x, u.y, 0.7);
          w.charge = Math.min(w.def.charge, w.charge + dt);
        } else {
          if (w.charge >= w.def.charge) this.fireCharge(u, w);
          w.charge = 0;
        }
      } else if (held) {
        this.fire(u, slot);
      }
    }

    aimAngle(u, speed, lead) {
      const tgt = u.target && u.target.targetable ? u.target : null;
      // 目標がいないか、向きを固定していて目標が後ろにいるときは、まっすぐ前へ撃つ
      if (!tgt || u.isBehind(tgt)) return u.facing > 0 ? 0 : Math.PI;
      const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
      const tt = speed ? dist / speed : 0;
      let ang = Math.atan2(tgt.y + tgt.vy * tt * lead - u.y, tgt.x + tgt.vx * tt * lead - u.x);
      if (u.controller < 0) ang += u.ai.aimErr / Math.max(40, dist);
      return ang;
    }

    fire(u, slot) {
      const w = u.weapons[slot];
      if (!w || w.cd > 0 || u.lunge > 0 || u.stun > 0 || u.docked) return false;
      const d = w.def;
      if (d.kind === 'melee') {
        if (u.mode === 'move') return false; // 移動モードでは格闘できない
        return this.startMelee(u, w);
      }
      if (d.kind === 'charge') return false;
      if (!canUseWeapon(u, w)) return false;
      w.cd = d.cooldown;
      if (d.ammo) w.ammo -= 1;
      if (d.energy) { u.energy -= d.energy; u.enT = 0; }

      const lead = u.controller >= 0 ? 0.85 : 0.6;
      const ang = this.aimAngle(u, d.kind === 'missile' ? 0 : d.speed, lead);
      const tgt = u.target && u.target.targetable && !u.isBehind(u.target) ? u.target : null;
      const count = d.count || 1;
      const color = d.kind === 'beam' ? SL.FACTIONS[u.team].beam : d.kind === 'shell' ? '#ffcf4a' : '#ffb347';
      const spread = (d.spread || 0) * (u.controller >= 0 ? 0.5 : 1);
      for (let i = 0; i < count; i++) {
        let a = ang + U.rand(-spread, spread);
        if (count > 1) a += (i / (count - 1) - 0.5) * d.arc;
        const sx = u.x + Math.cos(a) * (u.radius + 3);
        const sy = u.y + Math.sin(a) * (u.radius + 3) - 1;
        this.projectiles.push({
          x: sx, y: sy,
          vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed,
          ang: a, team: u.team, owner: u, def: d, wid: w.id, kind: d.kind, dmg: d.dmg,
          life: d.life || d.range / d.speed,
          r: d.r || 2, color,
          target: d.kind === 'missile' && d.turn ? tgt : null,
          trail: 0,
        });
      }
      const flash = d.look === 'rocket' || d.look === 'shell' ? 5.5 : d.look === 'tracer' || d.kind === 'missile' ? 3.5 : 2.5;
      this.fx.muzzle(u.x + Math.cos(ang) * (u.radius + 3), u.y + Math.sin(ang) * (u.radius + 3), color, flash);
      const snd = d.kind === 'beam' ? 'beam' : d.kind === 'missile' ? 'missile' : d.kind === 'shell' ? 'shell' : 'shot';
      this.sound(snd, u.x, u.y, d.kind === 'bullet' && d.cooldown < 0.15 ? 0.5 : 1);
      return true;
    }

    // チャージ式の極太ビーム：射線上の敵すべてに当たる
    fireCharge(u, w) {
      const d = w.def;
      if (u.energy < d.energy) return;
      u.energy -= d.energy;
      u.enT = 0;
      w.cd = d.cooldown;
      const ang = this.aimAngle(u, 0, 0);
      const sx = u.x + Math.cos(ang) * (u.radius + 2);
      const sy = u.y + Math.sin(ang) * (u.radius + 2);
      const ex = sx + Math.cos(ang) * d.range;
      const ey = sy + Math.sin(ang) * d.range;
      this.lasers.push({ x1: sx, y1: sy, x2: ex, y2: ey, w: d.width, team: u.team, life: d.dur, max: d.dur, color: SL.FACTIONS[u.team].beam });
      const targets = this.units.concat(this.ships);
      for (const e of targets) {
        if (!e.targetable || e.team === u.team) continue;
        if (U.segDist(e.x, e.y, sx, sy, ex, ey) < e.radius + d.width / 2) {
          this.fx.hit(e.x, e.y, SL.FACTIONS[u.team].beam);
          this.hitTarget(e, d.dmg, u, Math.cos(ang), Math.sin(ang), 120);
        }
      }
      u.kvx -= Math.cos(ang) * 80;
      u.kvy -= Math.sin(ang) * 80;
      this.sound('mega', u.x, u.y);
    }

    startMelee(u, w) {
      const d = w.def;
      w.cd = d.cooldown;
      let dx = u.facing, dy = 0;
      const tgt = u.target && u.target.targetable && !u.isBehind(u.target) ? u.target : null;
      if (tgt) {
        const ex = tgt.x - u.x, ey = tgt.y - u.y;
        const dist = Math.hypot(ex, ey) || 1;
        if (dist < 160) { dx = ex / dist; dy = ey / dist; }
      }
      if (d.style === 'whip') {
        this.whip(u, d, dx, dy);
        return true;
      }
      u.lunge = d.lungeTime;
      u.lungeDir = { x: dx, y: dy };
      u.lungeDef = d;
      u.lungeWid = w.id;
      u.lungeStop = false;
      u.lungeHits = new Set();
      this.sound('slash', u.x, u.y);
      return true;
    }

    // しびれるムチ：伸ばした先までに触れた敵にダメージを与え、しばらく動けなくする
    whip(u, d, dx, dy) {
      const sx = u.x, sy = u.y;
      const ex = sx + dx * (d.reach + u.radius), ey = sy + dy * (d.reach + u.radius);
      this.fx.whip(sx, sy, ex, ey, '#fff36a');
      this.sound('zap', u.x, u.y);
      const targets = this.units.concat(this.ships);
      for (const e of targets) {
        if (!e.targetable || e.team === u.team) continue;
        if (U.segDist(e.x, e.y, sx, sy, ex, ey) < e.radius + 3) {
          this.fx.hit(e.x, e.y, '#fff36a');
          this.hitTarget(e, d.dmg, u, dx, dy, 50);
          if (!e.isShip && e.alive) this.applyStun(e, d.stun);
        }
      }
    }

    applyStun(e, sec) {
      if (e.stunImmune > 0) return; // しびれが解けた直後はしびれない（連続で動けなくされないように）
      e.stun = Math.max(e.stun, sec);
      e.lunge = 0;
      for (const w of e.weapons) if (w) w.charge = 0;
    }

    // 格闘の当たり判定：刃先までの距離（reach）の内側で、
    // slash は振り抜く角度（向き ± arc）の中、spin は全周
    meleeCheck(u) {
      const d = u.lungeDef;
      const spin = d.style === 'spin';
      const dir = Math.atan2(u.lungeDir.y, u.lungeDir.x);
      const color = d.blade && d.blade.color !== 'beam' ? d.blade.color : SL.FACTIONS[u.team].beam;
      const targets = this.units.concat(this.ships);
      for (const e of targets) {
        if (!e.targetable || e.team === u.team || u.lungeHits.has(e)) continue;
        const dx = e.x - u.x, dy = e.y - u.y;
        const dist = Math.hypot(dx, dy);
        if (dist - e.radius > d.reach) continue;
        const touching = dist < u.radius + e.radius + 4; // 密着している敵には向きに関係なく当たる
        if (!spin && !touching && Math.abs(U.wrapAngle(Math.atan2(dy, dx) - dir)) > (d.arc || 1.2)) continue;
        u.lungeHits.add(e);
        const a = spin || touching ? Math.atan2(dy, dx) : dir;
        this.fx.slash(e.x, e.y, a, color, Math.min(20, e.radius + 4));
        this.fx.hit(e.x, e.y, '#ffffff');
        this.sound('hit', e.x, e.y);
        this.hitTarget(e, d.dmg, u, Math.cos(a), Math.sin(a), 170);
        if (!spin) u.lungeStop = true;
      }
    }

    hitTarget(e, amount, src, kx, ky, kb) {
      if (e.isShip) this.damageShip(e, amount, src);
      else this.damage(e, amount, src, kx, ky, kb);
    }

    damage(e, amount, src, kx, ky, kb) {
      if (!e.alive || e.docked) return;
      amount *= C.DAMAGE_SCALE;
      if (e.controller >= 0) amount *= C.HUMAN_DAMAGE_RATE;
      e.hp -= amount;
      e.flash = 0.07;
      const mass = e.radius / 8;
      e.kvx += ((kx || 0) * (kb || 0)) / mass;
      e.kvy += ((ky || 0) * (kb || 0)) / mass;
      if (src && src.alive && src.team !== e.team) e.lastHitBy = src;
      if (e.hp <= 0) this.destroy(e, src);
    }

    destroy(e, killer) {
      e.hp = 0;
      e.alive = false;
      e.lunge = 0;
      e.docked = false;
      if (killer) killer.kills++;
      this.fx.ghost(e.sprite, e.x, e.y, e.facing);
      this.fx.explosion(e.x, e.y, Math.round(e.radius * 1.4));
      if (e.role === 'giant') {
        for (let i = 0; i < 3; i++) this.fx.explosion(e.x + U.rand(-20, 20), e.y + U.rand(-12, 12), 14);
      }
      this.sound(e.role === 'giant' ? 'bigExplode' : 'explode', e.x, e.y);
      for (const u of this.units) {
        if (u.target === e) u.target = null;
        if (u.lastHitBy === e) u.lastHitBy = null;
      }
      if (this.hooks.onDestroyed) this.hooks.onDestroyed(e, killer);
    }

    // ---------------- 戦艦 ----------------
    damageShip(s, amount, src) {
      if (!s.alive) return;
      s.hp -= amount * C.DAMAGE_SCALE;
      s.flash = 0.06;
      if (s.hp <= 0) this.destroyShip(s, src);
    }

    destroyShip(s, killer) {
      s.hp = 0;
      s.alive = false;
      this.fx.ghost(s.sprite, s.x, s.y, s.facing);
      for (let i = 0; i < 7; i++) this.fx.explosion(s.x + U.rand(-30, 30), s.y + U.rand(-12, 12), U.randInt(12, 22));
      this.sound('bigExplode', s.x, s.y);
      // 中にいた機体は外に放り出される
      for (const u of this.units) {
        if (u.team === s.team && u.docked) u.docked = false;
        if (u.target === s) u.target = null;
      }
      // ボーナス：落とした側の全機が回復し、弾とエネルギーが満タンになる
      for (const u of this.units) {
        if (!u.alive || u.team === s.team) continue;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * C.SHIP_BONUS_HP);
        u.energy = u.maxEnergy;
        u.boost = 1;
        u.boostLock = false;
        for (const w of u.weapons) if (w && w.def.ammo) w.ammo = w.def.ammo;
        this.fx.burst(u.x, u.y, '#4be06a');
      }
      if (this.hooks.onShipDestroyed) this.hooks.onShipDestroyed(s, killer);
    }

    // 人間が操作している機体が自軍の戦艦の中に入ると、修理と補給を受ける
    // （AI が操作する機体は自分から戦艦に戻らない）
    updateDocking(dt) {
      for (const u of this.units) {
        if (!u.alive) { u.docked = false; continue; }
        const s = this.ships[u.team];
        const inside = s && s.alive && u.controller >= 0 && U.dist2(u.x, u.y, s.x, s.y) < s.dockR * s.dockR;
        if (inside && !u.docked) {
          u.docked = true;
          u.lunge = 0;
          for (const o of this.units) if (o.target === u) o.target = null;
          this.sound('dock', u.x, u.y);
        } else if (!inside && u.docked) {
          u.docked = false;
        }
        if (!u.docked) continue;
        // 操作していないときは格納庫の中心に寄せる
        if (Math.hypot(u.intent.mx, u.intent.my) < 0.1) {
          const k = Math.min(1, 3 * dt);
          u.x += (s.x - u.x) * k;
          u.y += (s.y - u.y) * k;
        }
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * C.DOCK_HP_RATE * dt);
        u.energy = Math.min(u.maxEnergy, u.energy + C.DOCK_EN_RATE * dt);
        u.stun = 0;
        for (const w of u.weapons) {
          if (!w || !w.def.ammo || w.ammo >= w.def.ammo) continue;
          w.refill += w.def.ammo * C.DOCK_AMMO_RATE * dt;
          while (w.refill >= 1 && w.ammo < w.def.ammo) { w.ammo++; w.refill -= 1; }
        }
        if (Math.random() < dt * 8) this.fx.repair(u.x, u.y);
      }
    }

    // ---------------- 弾 ----------------
    splash(p, except) {
      const R = p.def.splash;
      this.fx.explosion(p.x, p.y, Math.round(R * 0.75));
      const targets = this.units.concat(this.ships);
      for (const e of targets) {
        if (!e.targetable || e.team === p.team || e === except) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < R + e.radius) {
          const k = d > 0 ? 1 / d : 0;
          this.hitTarget(e, p.dmg * 0.5, p.owner, (e.x - p.x) * k, (e.y - p.y) * k, 50);
        }
      }
    }

    updateProjectiles(dt) {
      const P = this.projectiles;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.kind === 'missile') {
          const tg = p.target;
          if (tg && tg.targetable) {
            const want = Math.atan2(tg.y - p.y, tg.x - p.x);
            const diff = U.wrapAngle(want - p.ang);
            const maxTurn = p.def.turn * dt;
            p.ang += U.clamp(diff, -maxTurn, maxTurn);
          }
          const sp = Math.min(p.def.maxSpeed, Math.hypot(p.vx, p.vy) + 260 * dt);
          p.vx = Math.cos(p.ang) * sp;
          p.vy = Math.sin(p.ang) * sp;
          p.trail -= dt;
          if (p.trail <= 0) {
            p.trail = 0.03;
            this.fx.smoke(p.x - Math.cos(p.ang) * 6, p.y - Math.sin(p.ang) * 6, 3);
          }
        } else if (p.def.look === 'rocket') {
          // バズーカのロケット弾は太い煙を引く
          p.trail -= dt;
          if (p.trail <= 0) {
            p.trail = 0.025;
            this.fx.smoke(p.x - Math.cos(p.ang) * 9, p.y - Math.sin(p.ang) * 9, 4);
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        let remove = p.life <= 0 || p.x < -50 || p.y < -50 || p.x > C.FIELD_W + 50 || p.y > C.FIELD_H + 50;
        let hit = null;
        if (!remove) {
          for (const e of this.units) {
            if (!e.targetable || e.team === p.team) continue;
            const rr = e.radius + p.r;
            if (U.dist2(p.x, p.y, e.x, e.y) < rr * rr) { hit = e; break; }
          }
          if (!hit) {
            const s = this.ships[1 - p.team];
            if (s && s.alive) {
              const rr = s.radius + p.r;
              if (U.dist2(p.x, p.y, s.x, s.y) < rr * rr) hit = s;
            }
          }
          if (hit) {
            const sp = Math.hypot(p.vx, p.vy) || 1;
            this.fx.hit(p.x, p.y, p.color);
            this.sound('hit', p.x, p.y, 0.6);
            this.hitTarget(hit, p.dmg, p.owner, p.vx / sp, p.vy / sp, p.kind === 'shell' ? 60 : 25);
            if (p.def.splash) this.splash(p, hit);
            remove = true;
          }
        } else if (p.kind === 'shell' && p.life <= 0) {
          this.splash(p, null);
        }
        if (remove) {
          P[i] = P[P.length - 1];
          P.pop();
        }
      }
    }

    updateLasers(dt) {
      const L = this.lasers;
      for (let i = L.length - 1; i >= 0; i--) {
        L[i].life -= dt;
        if (L[i].life <= 0) { L[i] = L[L.length - 1]; L.pop(); }
      }
    }

    // 機体どうし、機体と戦艦が重ならないように押し合う
    separate(dt) {
      const A = this.units.filter((u) => u.alive && !u.docked);
      for (let i = 0; i < A.length; i++) {
        const a = A[i];
        for (let j = i + 1; j < A.length; j++) {
          const b = A[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          const push = min - d;
          const nx = dx / d, ny = dy / d;
          const wa = b.radius / (a.radius + b.radius);
          const wb = 1 - wa;
          a.x -= nx * push * wa;
          a.y -= ny * push * wa;
          b.x += nx * push * wb;
          b.y += ny * push * wb;
        }
      }
      // 戦艦は動かない。敵の機体は入れない。味方でも AI の機体はゆっくり外に出る
      for (const s of this.ships) {
        if (!s.alive) continue;
        for (const u of A) {
          if (u.team === s.team && u.controller >= 0) continue;
          const dx = u.x - s.x, dy = u.y - s.y;
          const min = s.radius + u.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const push = u.team === s.team ? Math.min(min - d, 90 * dt) : min - d;
          u.x += (dx / d) * push;
          u.y += (dy / d) * push;
        }
      }
    }

    // ---------------- 描画（ワールド座標） ----------------
    draw(ctx, view, time, localUnits) {
      // 戦場の端
      ctx.strokeStyle = 'rgba(90,120,200,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(0.5, 0.5, C.FIELD_W - 1, C.FIELD_H - 1);
      ctx.setLineDash([]);

      const x0 = view.x - 60, y0 = view.y - 60, x1 = view.x + view.w + 60, y1 = view.y + view.h + 60;

      // 戦艦
      for (const s of this.ships) {
        if (!s.alive || s.x < x0 - 40 || s.x > x1 + 40 || s.y < y0 || s.y > y1) continue;
        SL.Sprites.draw(ctx, s.sprite, s.x, s.y, s.facing, s.flash > 0 ? 'flash' : null);
        SL.HUD.bar(ctx, Math.round(s.x - 30), Math.round(s.y + 18), 60, 2, s.hpRatio, SL.HUD.hpColor(s.hpRatio));
        // 自分の機体が近づいたら入口を示す
        const near = (localUnits || []).some((u) => u && u.alive && u.team === s.team && U.dist2(u.x, u.y, s.x, s.y) < 170 * 170);
        if (near) {
          ctx.strokeStyle = ((time * 3) | 0) % 2 ? '#4be06a' : '#2a8a40';
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.dockR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          SL.Font.draw(ctx, 'DOCK', s.x, s.y - 30, { align: 'center', color: '#4be06a', shadow: '#000' });
        }
      }

      const list = this.units.filter((u) => u.alive && u.x > x0 && u.x < x1 && u.y > y0 && u.y < y1);
      list.sort((a, b) => a.y - b.y);
      for (const u of list) this.drawUnit(ctx, u, time);

      for (const p of this.projectiles) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        this.drawProjectile(ctx, p);
      }

      for (const l of this.lasers) {
        const k = l.life / l.max;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.lineCap = 'round';
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.w * (0.6 + 0.4 * k);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, l.w * 0.4 * k);
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = 1;
      }

      this.fx.draw(ctx, view);
    }

    drawUnit(ctx, u, time) {
      const spr = SL.Sprites.get(u.sprite);
      if (u.docked) ctx.globalAlpha = 0.35;
      // バーニアの炎（進んでいる向きの反対側）
      if (u.speed > 25 && !u.docked) {
        const hx = Math.cos(u.heading), hy = Math.sin(u.heading);
        const back = spr.w / 2 - 1;
        const fx = u.x - hx * back, fy = u.y - hy * back * 0.6 + 1;
        const big = (u.role === 'giant' ? 2 : 1) * (u.boosting ? 1.6 : 1);
        const flick = ((time * 30 + u.slot) | 0) % 2;
        const len = (2 + flick) * big;
        ctx.fillStyle = u.boosting ? '#bff6ff' : '#ffd23a';
        ctx.fillRect(Math.round(fx - hx * len / 2 - big), Math.round(fy - hy * len / 2 - big), Math.ceil(2 * big), Math.ceil(2 * big));
        ctx.fillStyle = '#ff7a2a';
        ctx.fillRect(Math.round(fx - hx * len - big / 2), Math.round(fy - hy * len - big / 2), Math.ceil(big), Math.ceil(big));
      }
      SL.Sprites.draw(ctx, u.sprite, u.x, u.y, u.facing, u.flash > 0 ? 'flash' : null);
      ctx.globalAlpha = 1;

      if (u.lunge > 0 && u.lungeDef) this.drawMelee(ctx, u);
      // チャージ中：縮んでいく輪
      const cw = u.weapons.find((w) => w && w.charge > 0);
      if (cw) {
        const k = cw.charge / cw.def.charge;
        ctx.strokeStyle = k >= 1 && ((time * 12) | 0) % 2 ? '#ffffff' : SL.FACTIONS[u.team].beam;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.radius + 4 + (1 - k) * 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      // しびれている：電撃
      if (u.stun > 0) {
        ctx.strokeStyle = '#fff36a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = U.rand(0, Math.PI * 2);
          const r1 = u.radius - 2, r2 = u.radius + 4;
          ctx.moveTo(u.x + Math.cos(a) * r1, u.y + Math.sin(a) * r1);
          ctx.lineTo(u.x + Math.cos(a + 0.3) * r2, u.y + Math.sin(a + 0.3) * r2);
        }
        ctx.stroke();
      }
    }

    // 光の刃：外側のにじみ → 刃の色 → 白い芯
    strokeBlade(ctx, x1, y1, x2, y2, color, w) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = w + 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, w - 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // 格闘武器の絵（振っている間だけ描く）
    //  slash: 手元から刃を出し、上から下へ振り抜く。通った跡を扇形に残す（ヒートアックスは柄の先に焼けた刃）
    //  spin : 長い柄の先の刃が、機体のまわりを 1 回転ちょっと回る
    drawMelee(ctx, u) {
      const d = u.lungeDef;
      const b = d.blade || { len: Math.max(10, d.reach - 10), color: 'beam' };
      const color = b.color === 'beam' ? SL.FACTIONS[u.team].beam : b.color;
      const p = U.clamp(1 - u.lunge / (d.lungeTime || 0.25), 0, 1);
      const e = 1 - Math.pow(1 - p, 3); // 振りはじめが速く、最後はゆっくり
      const dir = Math.atan2(u.lungeDir.y, u.lungeDir.x);
      const s = u.lungeDir.x >= 0 ? 1 : -1; // 右向きは時計回り、左向きは反時計回り（どちらも上から下へ）
      ctx.save();
      if (d.style === 'spin') {
        const pole = b.pole || 30;
        const tip = pole + b.len;
        const turn = Math.PI * 2.4;
        const start = dir - s * 0.8;
        const ang = start + s * e * turn;
        const a0 = start + s * Math.max(0, e - 0.35) * turn;
        // 回った跡の輪
        ctx.globalAlpha = 0.3 * (1 - p * 0.5);
        ctx.strokeStyle = color;
        ctx.lineWidth = b.len;
        ctx.beginPath();
        ctx.arc(u.x, u.y, pole + b.len / 2, Math.min(a0, ang), Math.max(a0, ang));
        ctx.stroke();
        ctx.globalAlpha = 1;
        // 柄（反対側にも少し出る）
        const cx = Math.cos(ang), cy = Math.sin(ang);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#8a90a8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(u.x - cx * 8, u.y - cy * 8);
        ctx.lineTo(u.x + cx * pole, u.y + cy * pole);
        ctx.stroke();
        this.strokeBlade(ctx, u.x + cx * pole, u.y + cy * pole, u.x + cx * tip, u.y + cy * tip, color, 4);
      } else {
        const arc = d.arc || 1.2;
        const start = dir - s * arc, end = dir + s * arc;
        const ang = start + (end - start) * e;
        const hx = u.x + Math.cos(dir) * u.radius * 0.4, hy = u.y + 1; // 手元
        const r1 = Math.max(8, d.reach - u.radius * 0.4 - 1);           // 手元から刃先まで
        const lo = Math.min(start, ang), hi = Math.max(start, ang);
        // 振り抜いた跡（扇形）
        ctx.globalAlpha = 0.25 * (1 - p * 0.6);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.arc(hx, hy, r1, lo, hi);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.75 * (1 - p * 0.5);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, r1, lo, hi);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const cx = Math.cos(ang), cy = Math.sin(ang);
        if (b.head === 'axe') {
          // 柄と、振る向きの側についた焼けた刃
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#8a90a8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + cx * r1, hy + cy * r1);
          ctx.stroke();
          const lx = -cy * s, ly = cx * s; // 振る向き
          const bx = hx + cx * (r1 - 9), by = hy + cy * (r1 - 9);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + lx * 6 + cx * 1, by + ly * 6 + cy * 1);
          ctx.lineTo(hx + cx * (r1 + 1) + lx * 8, hy + cy * (r1 + 1) + ly * 8);
          ctx.lineTo(hx + cx * (r1 + 1), hy + cy * (r1 + 1));
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#fff3b0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + lx * 6 + cx * 1, by + ly * 6 + cy * 1);
          ctx.lineTo(hx + cx * (r1 + 1) + lx * 8, hy + cy * (r1 + 1) + ly * 8);
          ctx.stroke();
        } else {
          this.strokeBlade(ctx, hx + cx * 3, hy + cy * 3, hx + cx * r1, hy + cy * r1, color, 4);
        }
        // つか
        ctx.fillStyle = '#c0c6d8';
        ctx.fillRect(Math.round(hx - 1), Math.round(hy - 1), 3, 3);
      }
      ctx.restore();
    }

    drawProjectile(ctx, p) {
      const look = (p.def && p.def.look) || p.kind;
      switch (look) {
        case 'beam': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = p.def.len || 10;
          const tx = p.x - (p.vx / sp) * len, ty = p.y - (p.vy / sp) * len;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.def.w || 2;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo((tx + p.x) / 2, (ty + p.y) / 2);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;
        }
        case 'tracer':
        case 'tracerSmall':
        case 'bullet': {
          // 曳光弾：進む向きに伸びた光の筋（連射砲は少し小さい）
          const small = look === 'tracerSmall';
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp, uy = p.vy / sp;
          const L = small ? 7 : 11;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255,150,40,0.45)';
          ctx.lineWidth = small ? 3 : 4;
          ctx.beginPath(); ctx.moveTo(p.x - ux * L, p.y - uy * L); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.strokeStyle = '#ffd23a';
          ctx.lineWidth = small ? 1.5 : 2;
          ctx.beginPath(); ctx.moveTo(p.x - ux * L * 0.7, p.y - uy * L * 0.7); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.lineCap = 'butt';
          const h = small ? 2 : 3;
          ctx.fillStyle = '#fffbe6';
          ctx.fillRect(Math.round(p.x - h / 2), Math.round(p.y - h / 2), h, h);
          break;
        }
        case 'shell': {
          // 砲弾：光る大きな弾と、後ろに残る熱の筋
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp, uy = p.vy / sp;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255,140,40,0.4)';
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(p.x - ux * 13, p.y - uy * 13); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.fillStyle = 'rgba(255,140,40,0.35)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff8a2a';
          ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff3b0';
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'rocket': {
          // バズーカのロケット弾：弾頭・胴・尾翼と、大きな噴射炎
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          const fl = 6 + Math.random() * 5;
          ctx.fillStyle = '#ff7a2a';
          ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-5 - fl, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath(); ctx.moveTo(-5, -1.5); ctx.lineTo(-5 - fl * 0.55, 0); ctx.lineTo(-5, 1.5); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#6a7080';
          ctx.fillRect(-6, -4, 3, 8);
          ctx.fillStyle = '#d8dce8';
          ctx.fillRect(-5, -2, 10, 4);
          ctx.fillStyle = '#8a90a0';
          ctx.fillRect(-5, 1, 10, 1);
          ctx.fillStyle = '#ff4a3a';
          ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(9, 0); ctx.lineTo(5, 2); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'missile':
        case 'homing': {
          // ミサイル：白い胴、弾頭（ホーミングは緑）、尾翼、噴射炎
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          const fl = 4 + Math.random() * 4;
          ctx.fillStyle = '#ff9a2a';
          ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-4 - fl, 0); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff3b0';
          ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-4 - fl * 0.5, 0); ctx.lineTo(-4, 1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#7a8090';
          ctx.fillRect(-5, -3, 2, 6);
          ctx.fillStyle = '#eef0f6';
          ctx.fillRect(-4, -1.5, 8, 3);
          ctx.fillStyle = look === 'homing' ? '#4be06a' : '#ff5a3a';
          ctx.beginPath(); ctx.moveTo(4, -1.5); ctx.lineTo(7, 0); ctx.lineTo(4, 1.5); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
  }

  SL.Unit = Unit;
  SL.Ship = Ship;
  SL.World = World;
  SL.canUseWeapon = canUseWeapon;
})();
