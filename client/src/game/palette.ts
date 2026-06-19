// Roof colours that encode a building's level. Index 0 = not built yet
// (a faint timber hut); each upgrade lights the roof up a tier, so you can
// read a town's development at a glance straight off the map.
export const LEVEL_COLORS = [
  '#7c8794', // 0 — unbuilt / slate
  '#b07a43', // 1 — timber brown
  '#cf5b4e', // 2 — red tile
  '#4f8fd0', // 3 — blue slate
  '#52b389', // 4 — green copper
  '#ffd166', // 5 — gilded
];

export function levelColor(level: number): string {
  return LEVEL_COLORS[Math.min(Math.max(level, 0), LEVEL_COLORS.length - 1)];
}

export const PLAYER_COLOR = '#52b389';
export const NEUTRAL_COLOR = '#d8c9a3';
export const RIVAL_COLORS = ['#c9533f', '#8a4fc0'];
