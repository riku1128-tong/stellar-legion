'use strict';
// 機体と戦艦の絵（PNG）の設定。
//
// ■ 絵を差し替えるには
//   assets フォルダの PNG を、同じファイル名の新しい画像で上書きするだけでよい。
//   画像はどんな大きさでもよく、下の表の height（ドット）の高さに自動で縮小・拡大される。
//   横に長すぎる画像は maxWidth を超えないように、さらに縮められる。
//
// ■ 画像の決まり
//   ・右を向いた絵にする（左を向いている絵なら、その行に facing: 'left' を足す）
//   ・背景は透明にする
//   ・ファイル名や場所を変えたいときは src を書き換える（index.html からの相対パス）
//
// ■ 大きさを変えたいとき
//   height を変える。当たり判定は js/data.js の radius で決まるので、絵の大きさを変えても
//   ゲームバランスは変わらない（ただし、見た目と当たり判定がずれる）。
//
// ■ 仮の図形に戻したいとき
//   その行を消す（行頭に // を付けてもよい）。
//
// 例（左向きの絵を、高さ 32 ドットで出す）:
//   az_grunt: { src: 'assets/my_grunt.png', height: 32, maxWidth: 40, facing: 'left' },
SL.ASSET_OVERRIDES = {
  // ---- アズール連合 ----
  az_commander:  { src: 'assets/az_commander.png', height: 30, maxWidth: 40 },  // 隊長機 VANGUARD
  az_raider:     { src: 'assets/az_raider.png', height: 27, maxWidth: 40 },  // 変形機 FALCON（戦闘モード）
  az_raider_jet: { src: 'assets/az_raider_jet.png', height: 15, maxWidth: 40 },  // 変形機 FALCON（移動モード）
  az_heavy:      { src: 'assets/az_heavy.png', height: 30, maxWidth: 40 },  // 重装機 BASTION
  az_grunt:      { src: 'assets/az_grunt.png', height: 26, maxWidth: 36 },  // 量産機 GUARD
  az_special:    { src: 'assets/az_special.png',    height: 28, maxWidth: 40 },  // 格闘機 GLAIVE
  az_artillery:  { src: 'assets/az_artillery.png', height: 23, maxWidth: 40 },  // 砲撃機 MORTAR
  az_giant:      { src: 'assets/az_giant.png', height: 46, maxWidth: 64 },  // 巨大機 CITADEL
  az_ship:       { src: 'assets/az_ship.png', height: 29, maxWidth: 96 },  // 戦艦 AURORA
  // ---- クリムゾン帝国 ----
  cr_commander:  { src: 'assets/cr_commander.png', height: 30, maxWidth: 40 },  // 隊長機 TRIBUNE
  cr_raider:     { src: 'assets/cr_raider.png',     height: 27, maxWidth: 40 },  // 変形機 WASP（戦闘モード）
  cr_raider_jet: { src: 'assets/cr_raider_jet.png', height: 15, maxWidth: 40 },  // 変形機 WASP（移動モード）
  cr_heavy:      { src: 'assets/cr_heavy.png', height: 30, maxWidth: 40 },  // 重装機 JUGGERNAUT
  cr_grunt:      { src: 'assets/cr_grunt.png', height: 26, maxWidth: 36 },  // 量産機 LEGIONARY
  cr_special:    { src: 'assets/cr_special.png', height: 28, maxWidth: 40 },  // 格闘機 STINGER
  cr_artillery:  { src: 'assets/cr_artillery.png', height: 25, maxWidth: 40 },  // 砲撃機 HOWITZER
  cr_giant:      { src: 'assets/cr_giant.png', height: 44, maxWidth: 64 },  // 巨大機 LEVIATHAN
  cr_ship:       { src: 'assets/cr_ship.png', height: 40, maxWidth: 96 },  // 戦艦 BEHEMOTH
  cr_HELMES: { src: 'assets/cr_HELMES.png', height: 40, maxWidth: 96 },  // 設定ページで取り込んだ絵
};
