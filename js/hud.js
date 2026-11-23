'use strict';
// 画面の情報表示
//  上: 両軍の機体一覧と TIME、戦艦の HP
//  下: 操作機の名前・HP（緑）・ビームエネルギー（紫）・ブースト（水色）、武装パネル
//  中央下: ミニマップ
SL.HUD = (function () {
  const F = SL.Font;
  const C = SL.CONFIG;
  const EN_COLOR = '#c77dff';

  function hpColor(r) {
    return r > 0.6 ? '#4be06a' : r > 0.3 ? '#ffd23a' : '#ff4a3a';
  }

  function bar(ctx, x, y, w, h, ratio, color, bg) {
    ctx.fillStyle = bg || '#1c2034';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, Math.round(w * Math.max(0, Math.min(1, ratio)))), h);
  }

  function tagColor(p) {
    return C.PLAYER_TAG_COLORS[p.index];
  }

  // ---- 上部 ----
  function drawTop(ctx, game) {
    const world = game.world;
    const cx = C.W / 2;
    const ICON = SL.Sprites.ICON;
    const step = ICON + 1;
    ctx.fillStyle = 'rgba(0,0,10,0.6)';
    ctx.fillRect(0, 0, C.W, ICON + 6);
    ctx.fillRect(cx - 116, ICON + 6, 232, 10);

    F.draw(ctx, 'TIME', cx, 1, { align: 'center', color: '#ffd23a' });
    const tcol = game.timer <= 10 ? '#ff5a3a' : '#ffb03a';
    F.draw(ctx, String(game.timer).padStart(2, '0'), cx, 9, { align: 'center', color: tcol });
    F.draw(ctx, String(game.timer).padStart(2, '0'), cx + 1, 9, { align: 'center', color: tcol });

    for (let team = 0; team < 2; team++) {
      const p = game.players[team];
      const n = world.aliveCount(team);
      const lx = team === 0 ? cx - 18 : cx + 18;
      const align = team === 0 ? 'right' : 'left';
      F.draw(ctx, p.label, lx, 1, { align, color: tagColor(p) });
      F.draw(ctx, String(n), lx, 10, { align, color: '#ffffff' });

      // 生き残っている機体のアイコン（隊長機が中央寄り）
      const units = world.units.filter((u) => u.team === team && u.alive).sort((a, b) => a.slot - b.slot);
      let x = team === 0 ? cx - 46 - ICON : cx + 46;
      for (const u of units) {
        SL.Sprites.drawIcon(ctx, u.sprite, x, 1);
        bar(ctx, x, ICON + 2, ICON, 2, u.hpRatio, hpColor(u.hpRatio));
        if (u.leader >= 0 && ((game.time * 4) | 0) % 2 === 0) {
          ctx.strokeStyle = C.PLAYER_TAG_COLORS[u.leader];
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 0.5, 0.5, ICON + 1, ICON + 1);
        }
        x += team === 0 ? -step : step;
      }

      // 戦艦の HP
      const s = world.ships[team];
      const sy = ICON + 7;
      const labelX = team === 0 ? cx - 112 : cx + 26;
      F.draw(ctx, 'SHIP', labelX, sy, { color: '#8a94b8' });
      if (s && s.alive) bar(ctx, labelX + 27, sy + 2, 58, 3, s.hpRatio, hpColor(s.hpRatio));
      else F.draw(ctx, 'LOST', labelX + 27, sy, { color: '#ff4a3a' });
    }
  }

  // ---- 下部：機体名と HP・エネルギー・ブースト ----
  function drawPlayerBar(ctx, game, p, side) {
    const u = p.unit;
    const y = C.H - 19;
    const col = tagColor(p);
    const right = side === 'right';
    const BW = 110;
    const tagX = right ? C.W - 6 : 6;
    F.draw(ctx, p.label, tagX, y + 2, { align: right ? 'right' : 'left', color: col, shadow: '#000' });
    const tagW = F.measure(p.label);
    const iconX = right ? C.W - 10 - tagW - SL.Sprites.ICON : 10 + tagW;
    const nameX = right ? iconX - 4 : iconX + SL.Sprites.ICON + 4;
    if (u && u.alive) {
      SL.Sprites.drawIcon(ctx, u.sprite, iconX, y);
      F.draw(ctx, u.name, nameX, y - 1, { align: right ? 'right' : 'left', color: '#ffffff', shadow: '#000' });
      const bx = right ? nameX - BW : nameX;
      bar(ctx, bx, y + 8, BW, 4, u.hpRatio, hpColor(u.hpRatio));
      bar(ctx, bx, y + 13, BW, 2, u.energy / u.maxEnergy, EN_COLOR, '#1a1028');
      const blink = ((game.time * 6) | 0) % 2 === 0;
      bar(ctx, bx, y + 16, BW, 2, u.boost, u.boostLock ? (blink ? '#ff4a3a' : '#802020') : '#6ff6ff', '#10202a');
    } else if (((game.time * 4) | 0) % 2 === 0) {
      F.draw(ctx, 'SWITCHING...', nameX, y + 2, { align: right ? 'right' : 'left', color: '#ffd23a' });
    }
  }

  // ---- 武装パネル ----
  // [主射撃, 副射撃, 格闘, ブースト, 目標切り替え, 乗り換え, 変形, 向き]
  const KEY_LABELS = {
    kb0: ['J', 'K', 'L', 'SPC', 'U', 'TAB', 'SHIFT', 'CTRL'],
    kb1: ['N1', 'N2', 'N3', 'N0', 'N4', 'N5', 'N6', 'N7'],
    pad: ['A', 'B', 'X', 'RT', 'Y', 'LT', 'LB', 'RB'],
  };

  function drawWeapons(ctx, game, p, side) {
    const u = p.unit;
    if (!u || !u.alive) return;
    const inp = SL.Input.players[game.mode === '2p' ? p.index : 0];
    let keys;
    if (inp.device === 'pad') keys = KEY_LABELS.pad;
    else keys = game.mode === '2p' && p.index === 1 ? KEY_LABELS.kb1 : KEY_LABELS.kb0;
    const BW = 46, BH = 18, GAP = 2;
    const total = BW * 3 + GAP * 2;
    const right = side === 'right';
    const x0 = right ? C.W - 6 - total : 6;
    const y0 = C.H - 77;
    for (let i = 0; i < 3; i++) {
      const w = u.weapons[i];
      const x = x0 + i * (BW + GAP);
      ctx.fillStyle = 'rgba(0,0,12,0.65)';
      ctx.fillRect(x, y0, BW, BH);
      const usable = w && SL.canUseWeapon(u, w);
      ctx.strokeStyle = !w ? '#3a4060' : !usable ? '#ff4a3a' : w.cd > 0 ? '#6a7090' : '#d8e0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y0 + 0.5, BW - 1, BH - 1);
      F.draw(ctx, keys[i], x + 3, y0 + 2, { color: '#ffd23a' });
      if (!w) {
        F.draw(ctx, '-', x + BW - 3, y0 + 2, { align: 'right', color: '#4a5070' });
        continue;
      }
      const d = w.def;
      F.draw(ctx, d.short, x + BW - 3, y0 + 2, { align: 'right', color: '#ffffff' });
      let text, col;
      if (d.kind === 'melee') {
        if (u.mode === 'move') { text = 'LOCK'; col = '#ff4a3a'; }
        else { text = '--'; col = '#9fe0ff'; }
      } else if (d.energy) {
        text = 'EN' + d.energy;
        col = u.energy >= d.energy ? EN_COLOR : '#5a5070';
      } else {
        text = String(w.ammo);
        col = w.ammo <= 0 ? '#ff4a3a' : '#9fe0ff';
      }
      F.draw(ctx, text, x + BW - 3, y0 + 10, { align: 'right', color: col });
      if (d.kind === 'charge' && w.charge > 0) {
        const r = w.charge / d.charge;
        ctx.fillStyle = r >= 1 && ((game.time * 10) | 0) % 2 ? '#ffffff' : EN_COLOR;
        ctx.fillRect(x + 1, y0 + BH - 3, Math.round((BW - 2) * r), 2);
      } else if (w.cd > 0 && d.cooldown) {
        const r = Math.min(1, w.cd / d.cooldown);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + 1, y0 + BH - 3, Math.round((BW - 2) * r), 2);
      }
    }
    const ax = right ? x0 + total : x0;
    const al = right ? 'right' : 'left';
    F.draw(ctx, keys[3] + ':BOOST ' + keys[5] + ':SWAP ' + keys[4] + ':TGT', ax, y0 + BH + 3, { align: al, color: '#7a84a8' });
    // 向き：自動（目標の方を向く）か、Ctrl で固定した向きか
    const faceText = u.faceLock ? (u.faceLock > 0 ? 'FACE >> FIXED' : 'FACE << FIXED') : 'FACE AUTO';
    F.draw(ctx, keys[7] + ':' + faceText, ax, y0 + BH + 12, { align: al, color: u.faceLock ? '#ffd23a' : '#7a84a8' });
    if (u.type.transform) {
      const modeText = u.mode === 'move' ? 'MOVE MODE' : 'BATTLE MODE';
      F.draw(ctx, keys[6] + ':' + modeText, ax, y0 + BH + 21, { align: al, color: u.mode === 'move' ? '#6ff6ff' : '#7a84a8' });
    }
    // 状態の表示
    let status = null, scol = '#fff';
    if (u.docked) { status = 'IN BATTLESHIP - REPAIRING'; scol = '#4be06a'; }
    else if (u.stun > 0) { status = 'STUNNED!'; scol = '#fff36a'; }
    else if (u.boostLock) { status = 'BOOST OVERHEAT'; scol = '#ff4a3a'; }
    if (status && ((game.time * 3) | 0) % 3 !== 0) F.draw(ctx, status, ax, y0 - 10, { align: al, color: scol, shadow: '#000' });
  }

  // ---- ミニマップ ----
  function drawMinimap(ctx, game) {
    const world = game.world;
    const MW = 96, MH = 56;
    const mx = Math.round(C.W / 2 - MW / 2), my = C.H - MH - 2;
    const sx = MW / C.FIELD_W, sy = MH / C.FIELD_H;
    ctx.fillStyle = 'rgba(20,24,60,0.7)';
    ctx.fillRect(mx, my, MW, MH);
    ctx.strokeStyle = '#3a4070';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 0.5, my - 0.5, MW + 1, MH + 1);
    // カメラの範囲
    for (const v of game.views()) {
      const p = game.players[v.pi];
      ctx.strokeStyle = C.PLAYER_TAG_COLORS[p.index];
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(Math.round(mx + p.cam.x * sx) + 0.5, Math.round(my + p.cam.y * sy) + 0.5, Math.round(v.w * sx), Math.round(v.h * sy));
      ctx.globalAlpha = 1;
    }
    // 戦艦
    for (const s of world.ships) {
      if (!s.alive) continue;
      const x = Math.round(mx + s.x * sx), y = Math.round(my + s.y * sy);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 3, y - 2, 7, 5);
      ctx.fillStyle = SL.FACTIONS[s.team].color;
      ctx.fillRect(x - 2, y - 1, 5, 3);
    }
    const blink = ((game.time * 5) | 0) % 2 === 0;
    for (const u of world.units) {
      if (!u.alive) continue;
      const x = Math.round(mx + u.x * sx), y = Math.round(my + u.y * sy);
      const size = u.role === 'giant' ? 3 : 2;
      ctx.fillStyle = SL.FACTIONS[u.team].color;
      if (u.leader >= 0) {
        ctx.fillStyle = blink ? '#ffffff' : C.PLAYER_TAG_COLORS[u.leader];
        ctx.fillRect(x - 1, y - 1, 3, 3);
      } else {
        ctx.fillRect(x - (size >> 1), y - (size >> 1), size, size);
      }
    }
  }

  // 戦艦撃沈などのお知らせ
  function drawBanner(ctx, game) {
    const b = game.banner;
    if (!b || b.t <= 0) return;
    if (((game.time * 6) | 0) % 4 === 0 && b.t > 2.5) return;
    F.draw(ctx, b.text, C.W / 2, 52, { align: 'center', scale: 2, color: b.color, outline: '#000' });
    if (b.sub) F.draw(ctx, b.sub, C.W / 2, 72, { align: 'center', color: '#4be06a', shadow: '#000' });
  }

  function draw(ctx, game) {
    drawTop(ctx, game);
    drawMinimap(ctx, game);
    const p0 = game.players[0], p1 = game.players[1];
    drawPlayerBar(ctx, game, p0, 'left');
    drawPlayerBar(ctx, game, p1, 'right');
    for (const p of game.players) {
      if (game.isLocalHuman(p)) drawWeapons(ctx, game, p, p.index === 0 ? 'left' : 'right');
    }
    drawBanner(ctx, game);
  }

  return { draw, bar, hpColor };
})();
