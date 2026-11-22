'use strict';
// 起動とゲームループ（固定タイムステップ）
(async function () {
  const C = SL.CONFIG;
  const canvas = document.getElementById('screen');

  // 画面に収まる最大の整数倍で拡大する（ウィンドウが小さいときは縮小）
  function resize() {
    const s = Math.min(window.innerWidth / C.W, window.innerHeight / C.H);
    const k = s >= 1 ? Math.floor(s) : s;
    canvas.style.width = Math.round(C.W * k) + 'px';
    canvas.style.height = Math.round(C.H * k) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();
  canvas.focus();

  SL.Sprites.build();
  await SL.Sprites.applyOverrides(SL.ASSET_OVERRIDES || {});

  const game = new SL.Game(canvas);
  SL.game = game;

  let last = performance.now();
  let acc = 0;
  const maxSteps = 8 * SL.DEBUG.speed;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt * SL.DEBUG.speed;
    SL.Input.update(game.inputMode());
    SL.Audio.frame();
    let steps = 0;
    while (acc >= C.STEP && steps < maxSteps) {
      game.update(C.STEP);
      SL.Input.consume();
      acc -= C.STEP;
      steps++;
    }
    if (steps >= maxSteps) acc = 0;
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f66;position:fixed;top:0;left:0">' + String(e && e.stack || e) + '</pre>');
});
