'use strict';
// 機体（Unit）と戦場（World）。移動・射撃・格闘・当たり判定・撃墜を扱う。
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
      this.slot = slot;          // 編成の中の番号（0〜15）
      this.name = t.name;
      this.role = t.role;
      this.radius = t.radius;
      this.sprite = t.sprite;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.hp = t.hp;
      this.maxHp = t.hp;
      this.alive = true;
      this.facing = team === 0 ? 1 : -1;
      this.weapons = t.weapons.map((id) => {
        if (!id) return null;
        const def = SL.WEAPONS[id];
        return { id, def, ammo: def.ammo, cd: 0, regenT: 0 };
      });
      this.target = null;
      this.controller = -1;      // 操作しているプレイヤー番号（-1 = AI）
      this.leader = -1;          // このユニットを担当しているプレイヤー（CPU 担当も含む）
      this.intent = { mx: 0, my: 0, fire1: false, fire2: false, melee: false, dash: false };
      this.flash = 0;
      this.lunge = 0;
      this.lungeDir = { x: 1, y: 0 };
      this.lungeDef = null;
      this.lungeHits = null;
      this.boost = 1;
      this.dashing = false;
      this.home = { x: 0, y: 0 };
      this.lastHitBy = null;
      this.kills = 0;
      this.ai = {
        think: U.rand(0, 0.4), strafe: U.chance(0.5) ? 1 : -1, mode: 'engage', modeT: 0,
        fireMain: true, fireSub: false, aimErr: 0, wob: U.rand(0, 6.28), retreatCD: 0,
      };
    }

    get hpRatio() { return this.hp / this.maxHp; }
  }

  class World {
    // hooks: { onDestroyed(unit, killer), sound(name, x, y, vol) }
    constructor(hooks) {
      this.units = [];
      this.projectiles = [];
      this.fx = new SL.Effects();
      this.time = 0;
      this.hooks = hooks || {};
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
          this.units.push(u);
        });
      }
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

    enemiesByDistance(u) {
      return this.units
        .filter((e) => e.alive && e.team !== u.team)
        .sort((a, b) => U.dist2(u.x, u.y, a.x, a.y) - U.dist2(u.x, u.y, b.x, b.y));
    }

    nearestEnemy(u) {
      let best = null, bd = Infinity;
      for (const e of this.units) {
        if (!e.alive || e.team === u.team) continue;
        const d = U.dist2(u.x, u.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    sound(name, x, y, vol = 1) {
      if (this.hooks.sound) this.hooks.sound(name, x, y, vol);
    }

    step(dt) {
      this.time += dt;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (u.controller < 0) SL.AI.update(u, this, dt);
        this.updateUnit(u, dt);
      }
      this.separate();
      this.updateProjectiles(dt);
      this.fx.update(dt);
    }

    updateUnit(u, dt) {
      const t = u.type;
      const it = u.intent;
      if (u.target && !u.target.alive) u.target = null;
      if (!u.target && u.controller >= 0) u.target = this.nearestEnemy(u);

      // ダッシュ（ブーストゲージを使う）
      const moving = Math.abs(it.mx) + Math.abs(it.my) > 0.1;
      u.dashing = it.dash && moving && u.boost > 0.03;
      if (u.dashing) u.boost = Math.max(0, u.boost - dt * 0.6);
      else u.boost = Math.min(1, u.boost + dt * 0.3);

      // 移動（宇宙なので慣性がある）
      if (u.lunge > 0) {
        u.lunge -= dt;
        const sp = u.lungeDef.lunge;
        u.vx = u.lungeDir.x * sp;
        u.vy = u.lungeDir.y * sp;
        this.meleeCheck(u);
        if (u.lunge <= 0) { u.vx *= 0.3; u.vy *= 0.3; }
      } else {
        const max = t.speed * (u.dashing ? 1.75 : 1);
        const k = Math.min(1, t.accel * dt * (u.dashing ? 1.5 : 1));
        u.vx += (it.mx * max - u.vx) * k;
        u.vy += (it.my * max - u.vy) * k;
      }
      u.x += u.vx * dt;
      u.y += u.vy * dt;

      // 戦場の外に出ない
      const m = u.radius + 4;
      if (u.x < m) { u.x = m; u.vx = Math.abs(u.vx) * 0.3; }
      if (u.x > C.FIELD_W - m) { u.x = C.FIELD_W - m; u.vx = -Math.abs(u.vx) * 0.3; }
      if (u.y < m) { u.y = m; u.vy = Math.abs(u.vy) * 0.3; }
      if (u.y > C.FIELD_H - m) { u.y = C.FIELD_H - m; u.vy = -Math.abs(u.vy) * 0.3; }

      // 向き
      if (u.lunge > 0) {
        if (Math.abs(u.lungeDir.x) > 0.1) u.facing = u.lungeDir.x > 0 ? 1 : -1;
      } else if (u.target) {
        const dx = u.target.x - u.x;
        if (Math.abs(dx) > 3) u.facing = dx > 0 ? 1 : -1;
      } else if (Math.abs(u.vx) > 10) {
        u.facing = u.vx > 0 ? 1 : -1;
      }

      // 武装の再使用時間と弾の回復
      for (const w of u.weapons) {
        if (!w) continue;
        if (w.cd > 0) w.cd -= dt;
        if (isFinite(w.def.ammo) && w.ammo < w.def.ammo) {
          w.regenT += dt;
          if (w.regenT >= w.def.regen) { w.regenT = 0; w.ammo++; }
        }
      }
      if (it.fire1) this.fire(u, 0);
      if (it.fire2) this.fire(u, 1);
      if (it.melee) this.fire(u, 2);
      if (u.flash > 0) u.flash -= dt;
    }

    fire(u, slot) {
      const w = u.weapons[slot];
      if (!w || w.cd > 0 || w.ammo <= 0 || u.lunge > 0) return false;
      const d = w.def;
      if (d.kind === 'melee') return this.startMelee(u, w);
      w.cd = d.cooldown;
      w.ammo -= 1;

      // 狙う方向（目標の少し先を狙う）
      const tgt = u.target && u.target.alive ? u.target : null;
      let ang;
      if (tgt) {
        const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
        const tt = d.kind === 'missile' ? 0 : dist / d.speed;
        const lead = u.controller >= 0 ? 0.85 : 0.6;
        ang = Math.atan2(tgt.y + tgt.vy * tt * lead - u.y, tgt.x + tgt.vx * tt * lead - u.x);
        if (u.controller < 0) ang += u.ai.aimErr / Math.max(40, dist);
      } else {
        ang = u.facing > 0 ? 0 : Math.PI;
      }

      const count = d.count || 1;
      const salvo = d.salvo || 1;
      const color = d.kind === 'beam' ? SL.FACTIONS[u.team].beam : d.kind === 'shell' ? '#ffcf4a' : '#ffb347';
      const spread = (d.spread || 0) * (u.controller >= 0 ? 0.5 : 1);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < salvo; j++) {
          let a = ang + U.rand(-spread, spread);
          if (count > 1) a += (i / (count - 1) - 0.5) * d.arc;
          if (salvo > 1) a += (j % 2 ? 1 : -1) * 0.7;
          const sx = u.x + Math.cos(a) * (u.radius + 3);
          const sy = u.y + Math.sin(a) * (u.radius + 3) - 1;
          this.projectiles.push({
            x: sx, y: sy,
            vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed,
            ang: a, team: u.team, owner: u, def: d, kind: d.kind, dmg: d.dmg,
            life: d.life || d.range / d.speed,
            r: d.r || 2, color,
            target: d.kind === 'missile' ? tgt : null,
            trail: 0,
          });
        }
      }
      this.fx.muzzle(u.x + Math.cos(ang) * (u.radius + 3), u.y + Math.sin(ang) * (u.radius + 3), color);
      const snd = d.kind === 'beam' ? 'beam' : d.kind === 'missile' ? 'missile' : d.kind === 'shell' ? 'shell' : 'shot';
      this.sound(snd, u.x, u.y, d.kind === 'bullet' && d.cooldown < 0.15 ? 0.5 : 1);
      return true;
    }

    startMelee(u, w) {
      const d = w.def;
      w.cd = d.cooldown;
      let dx = u.facing, dy = 0;
      const tgt = u.target;
      if (tgt && tgt.alive) {
        const ex = tgt.x - u.x, ey = tgt.y - u.y;
        const dist = Math.hypot(ex, ey) || 1;
        if (dist < 160) { dx = ex / dist; dy = ey / dist; }
      }
      u.lunge = d.lungeTime;
      u.lungeDir = { x: dx, y: dy };
      u.lungeDef = d;
      u.lungeHits = new Set();
      this.sound('slash', u.x, u.y);
      return true;
    }

    meleeCheck(u) {
      const d = u.lungeDef;
      const hx = u.x + u.lungeDir.x * (u.radius + 4);
      const hy = u.y + u.lungeDir.y * (u.radius + 4);
      for (const e of this.units) {
        if (!e.alive || e.team === u.team || u.lungeHits.has(e)) continue;
        const rr = e.radius + d.reach;
        if (U.dist2(hx, hy, e.x, e.y) < rr * rr) {
          u.lungeHits.add(e);
          const a = Math.atan2(u.lungeDir.y, u.lungeDir.x);
          this.fx.slash(e.x, e.y, a, SL.FACTIONS[u.team].beam, e.radius + 4);
          this.fx.hit(e.x, e.y, '#ffffff');
          this.sound('hit', e.x, e.y);
          this.damage(e, d.dmg, u, u.lungeDir.x, u.lungeDir.y, 170);
          u.lunge = Math.min(u.lunge, 0.06);
        }
      }
    }

    damage(e, amount, src, kx, ky, kb) {
      if (!e.alive) return;
      amount *= C.DAMAGE_SCALE;
      if (e.controller >= 0) amount *= C.HUMAN_DAMAGE_RATE;
      e.hp -= amount;
      e.flash = 0.07;
      const mass = e.radius / 8;
      e.vx += (kx || 0) * (kb || 0) / mass;
      e.vy += (ky || 0) * (kb || 0) / mass;
      if (src && src.alive && src.team !== e.team) e.lastHitBy = src;
      if (e.hp <= 0) this.destroy(e, src);
    }

    destroy(e, killer) {
      e.hp = 0;
      e.alive = false;
      e.lunge = 0;
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

    splash(p, except) {
      const R = p.def.splash;
      this.fx.explosion(p.x, p.y, Math.round(R * 0.5));
      for (const e of this.units) {
        if (!e.alive || e.team === p.team || e === except) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < R + e.radius) {
          const k = d > 0 ? 1 / d : 0;
          this.damage(e, p.dmg * 0.5, p.owner, (e.x - p.x) * k, (e.y - p.y) * k, 50);
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
          if (tg && tg.alive) {
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
            this.fx.smoke(p.x - Math.cos(p.ang) * 3, p.y - Math.sin(p.ang) * 3);
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        let remove = p.life <= 0 || p.x < -50 || p.y < -50 || p.x > C.FIELD_W + 50 || p.y > C.FIELD_H + 50;
        let hitUnit = null;
        if (!remove) {
          for (const e of this.units) {
            if (!e.alive || e.team === p.team) continue;
            const rr = e.radius + p.r;
            if (U.dist2(p.x, p.y, e.x, e.y) < rr * rr) { hitUnit = e; break; }
          }
          if (hitUnit) {
            const sp = Math.hypot(p.vx, p.vy) || 1;
            this.fx.hit(p.x, p.y, p.color);
            this.sound('hit', p.x, p.y, 0.6);
            this.damage(hitUnit, p.dmg, p.owner, p.vx / sp, p.vy / sp, p.kind === 'shell' ? 60 : 25);
            if (p.def.splash) this.splash(p, hitUnit);
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

    // 機体どうしが重ならないように押し合う
    separate() {
      const A = this.units.filter((u) => u.alive);
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
    }

    // ---- 描画（ワールド座標） ----
    draw(ctx, view, time) {
      // 戦場の端
      ctx.strokeStyle = 'rgba(90,120,200,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(0.5, 0.5, C.FIELD_W - 1, C.FIELD_H - 1);
      ctx.setLineDash([]);

      const x0 = view.x - 40, y0 = view.y - 40, x1 = view.x + view.w + 40, y1 = view.y + view.h + 40;
      const list = this.units.filter((u) => u.alive && u.x > x0 && u.x < x1 && u.y > y0 && u.y < y1);
      list.sort((a, b) => a.y - b.y);
      for (const u of list) {
        const spr = SL.Sprites.get(u.sprite);
        // バーニアの炎
        const speed = Math.abs(u.vx) + Math.abs(u.vy);
        if (speed > 25) {
          const fx = Math.round(u.x - u.facing * (spr.w / 2 - 1));
          const fy = Math.round(u.y + (u.role === 'fighter' ? 0 : 1));
          const big = u.role === 'giant' ? 3 : 1;
          const flick = ((time * 30 + u.slot) | 0) % 2;
          ctx.fillStyle = u.dashing ? '#bff6ff' : '#ffd23a';
          ctx.fillRect(fx - (u.facing > 0 ? 2 + flick : -flick) * big, fy - big, (2 + flick) * big, 2 * big);
          ctx.fillStyle = '#ff7a2a';
          ctx.fillRect(fx - (u.facing > 0 ? 4 + flick : -2 - flick) * big, fy - big + 1, 2 * big, Math.max(1, big));
        }
        SL.Sprites.draw(ctx, u.sprite, u.x, u.y, u.facing, u.flash > 0 ? 'flash' : null);
        if (u.lunge > 0) {
          ctx.strokeStyle = SL.FACTIONS[u.team].beam;
          ctx.lineWidth = 2;
          const a = Math.atan2(u.lungeDir.y, u.lungeDir.x);
          ctx.beginPath();
          ctx.arc(u.x, u.y, u.radius + 7, a - 0.9, a + 0.9);
          ctx.stroke();
        }
      }

      for (const p of this.projectiles) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        switch (p.kind) {
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
          case 'bullet':
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
            ctx.fillStyle = 'rgba(255,180,70,0.4)';
            ctx.fillRect(Math.round(p.x - p.vx * 0.012 - 0.5), Math.round(p.y - p.vy * 0.012 - 0.5), 1, 1);
            break;
          case 'missile':
            ctx.fillStyle = '#e8e8f0';
            ctx.fillRect(Math.round(p.x - 1.5), Math.round(p.y - 1), 3, 2);
            ctx.fillStyle = '#ff9a2a';
            ctx.fillRect(Math.round(p.x - Math.cos(p.ang) * 3 - 0.5), Math.round(p.y - Math.sin(p.ang) * 3 - 0.5), 1, 1);
            break;
          case 'shell':
            ctx.fillStyle = '#ff8a2a';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff3b0';
            ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
            break;
        }
      }

      this.fx.draw(ctx, view);
    }
  }

  SL.Unit = Unit;
  SL.World = World;
})();
