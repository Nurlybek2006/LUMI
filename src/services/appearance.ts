export type AppearanceMode = 'light' | 'dark' | 'system';
export type Palette = {
  background: string; paper: string; elevated: string; ink: string; muted: string; accent: string; accentSoft: string;
  line: string; green: string; red: string; navigation: string; overlay: string;
  appBackground: string; screenBackground: string; surface: string; elevatedSurface: string; cardBackground: string;
  cardText: string; primaryText: string; secondaryText: string; mutedText: string; accentForeground: string; accentSurface: string;
  icon: string; iconContainer: string; inputBackground: string; inputText: string; placeholder: string; border: string;
  divider: string; selectedBackground: string; selectedText: string; disabledBackground: string; disabledText: string;
  navigationBackground: string; modalBackground: string; danger: string; success: string;
};

function createPalette(dark: boolean): Palette {
  const values = dark
    ? { background: '#181715', paper: '#24221F', elevated: '#302D29', ink: '#F2EEE7', muted: '#B6AA9D', accent: '#D5A477', accentSoft: '#3A3027', line: '#403B35', green: '#9BBC9F', red: '#E49A8F', navigation: '#211F1C', overlay: '#000000A8' }
    : { background: '#F7F3EC', paper: '#FFFCF7', elevated: '#FFFFFF', ink: '#302820', muted: '#71675E', accent: '#8D5636', accentSoft: '#F0E5D8', line: '#E8DED2', green: '#42664F', red: '#963D34', navigation: '#FFFCF7', overlay: '#221B1680' };
  return {
    ...values,
    appBackground: values.background, screenBackground: values.background, surface: values.paper, elevatedSurface: values.elevated,
    cardBackground: values.paper, cardText: values.ink, primaryText: values.ink, secondaryText: values.muted, mutedText: values.muted,
    accentForeground: dark ? '#F2C89D' : '#704126', accentSurface: values.accentSoft, icon: values.ink, iconContainer: values.accentSoft,
    inputBackground: values.paper, inputText: values.ink, placeholder: values.muted, border: values.line, divider: values.line,
    selectedBackground: values.ink, selectedText: values.paper, disabledBackground: values.accentSoft, disabledText: values.muted,
    navigationBackground: values.navigation, modalBackground: values.elevated, danger: values.red, success: values.green
  };
}

export const lightPalette: Palette = createPalette(false);
export const darkPalette: Palette = createPalette(true);
export function resolveAppearance(mode: AppearanceMode, systemDark: boolean): 'light' | 'dark' { return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode; }
export function paletteFor(mode: AppearanceMode, systemDark: boolean): Palette { return resolveAppearance(mode, systemDark) === 'dark' ? darkPalette : lightPalette; }

function linearChannel(value: number): number { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const clean = hex.replace('#', '').slice(0, 6);
    if (!/^[\da-f]{6}$/iu.test(clean)) throw new Error(`Invalid RGB color: ${hex}`);
    const r = linearChannel(Number.parseInt(clean.slice(0, 2), 16));
    const g = linearChannel(Number.parseInt(clean.slice(2, 4), 16));
    const b = linearChannel(Number.parseInt(clean.slice(4, 6), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground); const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
