'use strict';
// 機体の AI。0.25〜0.5 秒ごとに目標と行動を決め直し、毎フレーム「スティックの向き」と攻撃の入力を作る。
// 実際の動き（加速・旋回の慣性）は人間と同じ仕組みで処理される。
//  行動: engage（好みの距離を保って撃ち合う）/ melee（突っ込んで格闘）/ retreat（HP が少ないとき下がる）
// AI は自分から戦艦に戻らない。
SL.AI = (function () {
  const U = SL.util;

  function pickTarget(u, world) {
    let best = null, bestScore = Infinity;
    for (const e of world.units) {
      if (!e.targetable || e.team === u.team) continue;
      let s = Math.hypot(e.x - u.x, e.y - u.y);
      s -= (1 - e.hpRatio) * 80;          // 弱っている敵を優先
      if (e === u.target) s -= 60;         // 目標をころころ変えない
      if (e === u.lastHitBy) s -= 50;      // 撃ってきた相手に反撃
      if (e.stun > 0) s -= 40;             // しびれている敵を狙う
      s += U.rand(0, 40);
      if (s < bestScore) { bestScore = s; best = e; }
    }
    // 敵の戦艦は、近くに敵の機体がいないときだけ狙う
    const ship = world.ships[1 - u.team];
    if (ship && ship.alive) {
      const s = Math.hypot(ship.x - u.x, ship.y - u.y) + 320 + (ship === u.target ? -60 : 0);
      if (s < bestScore) best = ship;
    }
    return best;
  }

  // 射撃武器がまだ使えるか（ビームはエネルギーが回復するので、持っていれば使える扱い）
  function hasRanged(u) {
    for (let i = 0; i < 2; i++) {
      const w = u.weapons[i];
      if (!w) continue;
      if (w.def.energy) return true;
      if (w.def.ammo && w.ammo > 0) return true;
    }
    return false;
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
    const canMelee = !!u.weapons[2];
    if (u.hpRatio < 0.3 && ai.retreatCD <= 0 && dist < role.prefRange + 120 && U.chance(0.4)) {
      // 後退は「敵が近くにいて HP が少ないとき」だけ。10 秒に 1 回まで
      ai.mode = 'retreat';
      ai.modeT = U.rand(1.2, 2.2);
      ai.retreatCD = 10;
    } else if (canMelee && !hasRanged(u)) {
      // 弾を撃ち尽くしたら格闘で戦う
      ai.mode = 'melee';
      ai.modeT = 2;
    } else if (canMelee && dist < 160 && U.chance(role.melee)) {
      ai.mode = 'melee';
      ai.modeT = 1.6;
    } else {
      ai.mode = 'engage';
    }
  }

  // チャージ式の武器：押し続けて、たまったら離す
  function chargeInput(u, w, want) {
    if (w.charge >= w.def.charge) return false;              // たまった → 離して撃つ
    if (w.charge > 0) return true;                           // チャージ中は押し続ける
    return want && w.cd <= 0 && u.energy >= w.def.energy;    // 撃ちたいときにチャージを始める
  }

  function update(u, world, dt) {
    const ai = u.ai;
    const role = SL.ROLES[u.role];
    const C = SL.CONFIG;
    ai.think -= dt;
    if (ai.modeT > 0) ai.modeT -= dt;
    if (ai.retreatCD > 0) ai.retreatCD -= dt;
    if (ai.think <= 0 || !u.target || !u.target.targetable) {
      ai.think = U.rand(0.25, 0.5);
      decide(u, world);
    }

    const it = u.intent;
    it.fire1 = it.fire2 = it.melee = it.dash = false;
    let mx = 0, my = 0;
    ai.wob += dt;

    const t = u.target && u.target.targetable ? u.target : null;
    let dist = Infinity, nx = 0, ny = 0;
    const enemiesLeft = world.aliveCount(1 - u.team);
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
        const d = w.def;
        // 届く距離：ムチは伸びる長さ、それ以外は踏み込む距離 + 刃先までの距離
        const reach = d.style === 'whip' ? d.reach + u.radius + t.radius : d.lunge * d.lungeTime * 0.8 + d.reach + t.radius;
        if (dist < reach && w.cd <= 0) {
          it.melee = true;
          ai.mode = 'engage';
          ai.modeT = 0;
        }
      } else {
        // 終盤（敵の残りが少ない）は好みの距離を縮めて決着をつけにいく
        const pref = role.prefRange * (enemiesLeft <= 4 ? 0.6 : 1) * (t.isShip ? 0.8 : 1);
        const radial = U.clamp((dist - pref) / 60, -1, 1);
        mx = nx * radial + px * ai.strafe * 0.55 + Math.cos(ai.wob * 1.3) * 0.15;
        my = ny * radial + py * ai.strafe * 0.55 + Math.sin(ai.wob * 1.1) * 0.15;
        // 遠い敵にはブーストで近づく
        const far = enemiesLeft <= 3 ? 120 : 220;
        if (dist > pref + far && u.boost > 0.6) it.dash = true;
      }

      // 変形できる機体：遠いときは移動モード、近づいたら戦闘モード
      if (u.type.transform && u.transformCD <= 0) {
        if (u.mode === 'battle' && dist > 380 && ai.mode !== 'melee') it.transform = true;
        else if (u.mode === 'move' && (dist < 240 || ai.mode === 'melee')) it.transform = true;
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
    // 自軍の戦艦にも近づきすぎない
    const own = world.ships[u.team];
    if (own && own.alive) {
      const ox = u.x - own.x, oy = u.y - own.y;
      const rr = own.radius + u.radius + 20;
      const d2 = ox * ox + oy * oy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * 1.5;
        my += (oy / d) * 1.5;
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

    // 射撃
    const w0 = u.weapons[0], w1 = u.weapons[1];
    if (w0 && w0.def.kind === 'charge') {
      it.fire1 = chargeInput(u, w0, t && ai.fireMain && dist < w0.def.range * 0.9);
    } else if (t && w0 && w0.def.kind !== 'melee' && ai.fireMain && dist < w0.def.range * 0.92) {
      it.fire1 = true;
    }
    if (w1 && w1.def.kind === 'charge') {
      it.fire2 = chargeInput(u, w1, t && ai.fireSub && dist < w1.def.range * 0.9);
      if (w1.charge >= w1.def.charge) ai.fireSub = false;
    } else if (t && w1 && ai.fireSub && dist < w1.def.range * 0.9 && w1.cd <= 0) {
      it.fire2 = true;
      ai.fireSub = false;
    }
  }

  return { update, pickTarget };
})();
