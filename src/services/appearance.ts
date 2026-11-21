export type AppearanceMode = 'light' | 'dark' | 'system';
export type Palette = { background: string; paper: string; elevated: string; ink: string; muted: string; accent: string; accentSoft: string; line: string; green: string; red: string; navigation: string; overlay: string };
export const lightPalette: Palette = { background: '#F7F3EC', paper: '#FFFCF7', elevated: '#FFFFFF', ink: '#302820', muted: '#887C70', accent: '#A76B45', accentSoft: '#F0E5D8', line: '#E8DED2', green: '#527A62', red: '#A84E43', navigation: '#FFFCF7', overlay: '#221B1680' };
export const darkPalette: Palette = { background: '#181715', paper: '#24221F', elevated: '#302D29', ink: '#F2EEE7', muted: '#B6AA9D', accent: '#D5A477', accentSoft: '#3A3027', line: '#403B35', green: '#9BBC9F', red: '#E49A8F', navigation: '#211F1C', overlay: '#000000A8' };
export function resolveAppearance(mode: AppearanceMode, systemDark: boolean): 'light' | 'dark' { return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode; }
export function paletteFor(mode: AppearanceMode, systemDark: boolean): Palette { return resolveAppearance(mode, systemDark) === 'dark' ? darkPalette : lightPalette; }
