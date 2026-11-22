'use strict';
// 機体の AI。0.25〜0.5 秒ごとに目標と行動を決め直し、毎フレーム移動と射撃の入力を作る。
//  行動: engage（好みの距離を保って撃ち合う）/ melee（突っ込んで格闘）/ retreat（HP が少ないとき下がる）
SL.AI = (function () {
  const U = SL.util;

  function pickTarget(u, world) {
    let best = null, bestScore = Infinity;
    for (const e of world.units) {
      if (!e.alive || e.team === u.team) continue;
      let s = Math.hypot(e.x - u.x, e.y - u.y);
      s -= (1 - e.hpRatio) * 80;          // 弱っている敵を優先
      if (e === u.target) s -= 60;         // 目標をころころ変えない
      if (e === u.lastHitBy) s -= 50;      // 撃ってきた相手に反撃
      s += U.rand(0, 40);
      if (s < bestScore) { bestScore = s; best = e; }
    }
    return best;
  }

  function decide(u, world) {
    const ai = u.ai;
    const role = SL.ROLES[u.role];
    u.target = pickTarget(u, world);
    ai.aimErr = U.rand(-14, 14); // 狙いのずれ（目標の位置での横ずれ、ドット）
    if (U.chance(0.2)) ai.strafe *= -1;
    ai.fireMain = U.chance(0.8);
    if (u.weapons[1] && U.chance(0.15)) ai.fireSub = true;

    const t = u.target;
    if (!t) { ai.mode = 'idle'; return; }
    if ((ai.mode === 'retreat' || ai.mode === 'melee') && ai.modeT > 0) return;
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    // 後退は「敵が近くにいて HP が少ないとき」だけ。10 秒に 1 回まで。
    if (u.hpRatio < 0.3 && ai.retreatCD <= 0 && dist < role.prefRange + 120 && U.chance(0.4)) {
      ai.mode = 'retreat';
      ai.modeT = U.rand(1.2, 2.2);
      ai.retreatCD = 10;
    } else if (u.weapons[2] && dist < 160 && U.chance(role.melee)) {
      ai.mode = 'melee';
      ai.modeT = 1.6;
    } else {
      ai.mode = 'engage';
    }
  }

  function update(u, world, dt) {
    const ai = u.ai;
    const role = SL.ROLES[u.role];
    const C = SL.CONFIG;
    ai.think -= dt;
    if (ai.modeT > 0) ai.modeT -= dt;
    if (ai.retreatCD > 0) ai.retreatCD -= dt;
    if (ai.think <= 0 || !u.target || !u.target.alive) {
      ai.think = U.rand(0.25, 0.5);
      decide(u, world);
    }

    const it = u.intent;
    it.fire1 = it.fire2 = it.melee = it.dash = false;
    let mx = 0, my = 0;
    ai.wob += dt;

    const t = u.target && u.target.alive ? u.target : null;
    let dist = Infinity, nx = 0, ny = 0;
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y;
      dist = Math.hypot(dx, dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
      const px = -ny, py = nx;

      if (ai.mode === 'retreat') {
        mx = -nx + (u.home.x > u.x ? 0.6 : -0.6);
        my = -ny;
        it.dash = u.boost > 0.4;
      } else if (ai.mode === 'melee' && u.weapons[2]) {
        const w = u.weapons[2];
        mx = nx;
        my = ny;
        it.dash = dist > 60 && u.boost > 0.2;
        const reach = w.def.lunge * w.def.lungeTime + u.radius + t.radius;
        if (dist < reach && w.cd <= 0) {
          it.melee = true;
          ai.mode = 'engage';
          ai.modeT = 0;
        }
      } else if (u.role === 'fighter') {
        // 近づいて撃ち、すれ違ってから旋回して戻ってくる
        let ang = Math.atan2(ny, nx);
        if (dist < 110) ang += ai.strafe * 1.1;
        mx = Math.cos(ang);
        my = Math.sin(ang);
      } else {
        // 終盤（敵の残りが少ない）は好みの距離を縮めて決着をつけにいく
        const enemiesLeft = world.aliveCount(u.team === 0 ? 1 : 0);
        const pref = role.prefRange * (enemiesLeft <= 4 ? 0.6 : 1);
        const radial = U.clamp((dist - pref) / 60, -1, 1);
        mx = nx * radial + px * ai.strafe * 0.55 + Math.cos(ai.wob * 1.3) * 0.15;
        my = ny * radial + py * ai.strafe * 0.55 + Math.sin(ai.wob * 1.1) * 0.15;
        // 遠い敵にはダッシュで近づく（残りが少ない終盤は早めに詰める）
        const far = enemiesLeft <= 3 ? 120 : 220;
        if (dist > pref + far && u.boost > 0.6) it.dash = true;
      }
    } else {
      // 敵がいないときは少し漂う
      mx = Math.cos(ai.wob * 0.5) * 0.2;
      my = Math.sin(ai.wob * 0.4) * 0.2;
    }

    // 味方とぶつからないように離れる
    for (const o of world.units) {
      if (o === u || !o.alive || o.team !== u.team) continue;
      const ox = u.x - o.x, oy = u.y - o.y;
      const rr = u.radius + o.radius + 14;
      const d2 = ox * ox + oy * oy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * (1 - d / rr) * 1.2;
        my += (oy / d) * (1 - d / rr) * 1.2;
      }
    }

    // 戦場の端から離れる
    const M = 90;
    if (u.x < M) mx += ((M - u.x) / M) * 1.5;
    if (u.x > C.FIELD_W - M) mx -= ((u.x - (C.FIELD_W - M)) / M) * 1.5;
    if (u.y < M) my += ((M - u.y) / M) * 1.5;
    if (u.y > C.FIELD_H - M) my -= ((u.y - (C.FIELD_H - M)) / M) * 1.5;

    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    it.mx = mx;
    it.my = my;

    if (!t) return;
    // 射撃
    const w0 = u.weapons[0];
    if (w0 && ai.fireMain && dist < w0.def.range * 0.92) {
      if (u.role === 'fighter') {
        const vl = Math.hypot(u.vx, u.vy) || 1;
        it.fire1 = (u.vx * nx + u.vy * ny) / vl > 0.7; // 正面にいるときだけ撃つ
      } else {
        it.fire1 = true;
      }
    }
    const w1 = u.weapons[1];
    if (w1 && ai.fireSub && dist < w1.def.range * 0.9 && w1.cd <= 0) {
      it.fire2 = true;
      ai.fireSub = false;
    }
  }

  return { update, pickTarget };
})();
