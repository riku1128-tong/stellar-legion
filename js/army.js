'use strict';
// 出撃の設定ファイル：各勢力から、どの機体を何体出すか（機体の ID: 体数）
//  az = アズール連合（左）, cr = クリムゾン帝国（右）。機体の ID は js/units.js の名前
//  1 勢力 1〜30 体。陣形は役割と体数に合わせて自動で組まれる。戦艦は別に 1 隻ずつ出る。
// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で値を変えて、この中身をまるごと貼り替えてもよい。
SL.ARMY_COUNTS = {
  az: {
    az_commander: 1,  // RX78-2 隊長機
    az_raider: 2,  // CORE-FIGHTER 遊撃機
    az_heavy: 1,  // BASTION 重装機
    az_grunt: 7,  // GUARD 量産機
    az_special: 2,  // GLAIVE 格闘機
    az_artillery: 2,  // MORTAR 砲撃機
    az_giant: 1,  // CITADEL 巨大機
  },
  cr: {
    cr_commander: 1,  // TRIBUNE 隊長機
    cr_raider: 2,  // WASP 遊撃機
    cr_heavy: 1,  // JUGGERNAUT 重装機
    cr_grunt: 7,  // LEGIONARY 量産機
    cr_special: 2,  // STINGER 格闘機
    cr_artillery: 2,  // HOWITZER 砲撃機
    cr_giant: 1,  // LEVIATHAN 巨大機
    cr_unit_2: 1,  // HELMES 巨大機
  },
};
