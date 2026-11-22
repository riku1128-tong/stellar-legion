'use strict';
// 機体の絵を PNG 画像に差し替える設定。
// 左にスプライト ID、右に画像のパス（index.html からの相対パス）を書く。
// 画像は右向き・背景透過で用意する。左向きで描いた画像なら facing: 'left' をつける。
// scale を省くと、仮の図形と同じ高さに自動で縮小される。
//
// 例:
//   'az_grunt': 'assets/az_grunt.png',
//   'cr_giant': { src: 'assets/cr_giant.png', scale: 0.5 },
//   'cr_fighter': { src: 'assets/cr_fighter.png', facing: 'left' },
//
// スプライト ID:
//   アズール連合  : az_commander, az_grunt, az_artillery, az_fighter, az_heavy, az_giant
//   クリムゾン帝国: cr_commander, cr_grunt, cr_artillery, cr_fighter, cr_heavy, cr_giant
SL.ASSET_OVERRIDES = {
};
