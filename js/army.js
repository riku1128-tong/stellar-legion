'use strict';
// 出撃の設定ファイル：各勢力から、どの機体を何体出すか（機体の ID: 体数）
//  az = アズール連合（左）, cr = クリムゾン帝国（右）。機体の ID は js/units.js の名前
//  1 勢力 1〜30 体。陣形は役割と体数に合わせて自動で組まれる。戦艦は別に 1 隻ずつ出る。
// 設定ページ（アーティファクト「STELLAR LEGION 兵器と出撃」）で値を変えて、この中身をまるごと貼り替えてもよい。
SL.ARMY_COUNTS = {
  az: {
    az_commander: 1,  // RX-78-2 隊長機
    az_raider: 2,  // CORE-FIGHTER 遊撃機
    az_heavy: 2,  // GUN-CANON 重装機
    az_grunt: 8,  // GIM 量産機
    az_special: 0,  // NO ENTRY 格闘機
    az_artillery: 2,  // GUN-TANK 砲撃機
    az_giant: 0,  // NO ENTRY 巨大機
  },
  cr: {
    cr_commander: 1,  // SHA 隊長機
    cr_raider: 0,  // NO ENTRY 遊撃機
    cr_heavy: 1,  // GYAN 重装機
    cr_grunt: 7,  // ZAKU-II 量産機
    cr_special: 2,  // GUFU 格闘機
    cr_artillery: 2,  // DOM 砲撃機
    cr_giant: 1,  // ZEONG 巨大機
    cr_unit_2: 1,  // HELMES 巨大機
  },
};
