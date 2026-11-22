'use strict';
// 機体の絵を PNG 画像に差し替える設定。
// 左にスプライト ID、右に画像のパス（index.html からの相対パス）を書く。
// 画像は右向き・背景透過で用意する。左向きで描いた画像なら facing: 'left' をつける。
// scale を省くと、仮の図形と同じ高さに自動で縮小される。
//
// 例:
//   'az_grunt': 'assets/az_grunt.png',
//   'cr_giant': { src: 'assets/cr_giant.png', scale: 0.5 },
//   'cr_raider_jet': { src: 'assets/cr_raider_jet.png', facing: 'left' },
//
// スプライト ID:
//   アズール連合  : az_commander, az_raider, az_raider_jet（変形後）, az_heavy, az_grunt, az_special,
//                   az_artillery, az_giant, az_ship（戦艦）
//   クリムゾン帝国: cr_commander, cr_raider, cr_raider_jet（変形後）, cr_heavy, cr_grunt, cr_special,
//                   cr_artillery, cr_giant, cr_ship（戦艦）
SL.ASSET_OVERRIDES = {
};
