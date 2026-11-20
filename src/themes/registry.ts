import type { ThemeId } from '@/types/models';

export interface NotebookTheme {
  id: ThemeId;
  name: string;
  subtitle: string;
  cover: string;
  page: string;
  ink: string;
  muted: string;
  accent: string;
  line: string;
  serif: string;
  shadow: number;
  ornament: string;
}

export const themes: Record<ThemeId, NotebookTheme> = {
  classic: { id: 'classic', name: 'Классика', subtitle: '??????????? ?????', cover: '#4B3028', page: '#FBF4E8', ink: '#382820', muted: '#877464', accent: '#C49A54', line: '#E9DDCA', serif: 'serif', shadow: 0.2, ornament: '✦' },
  halloween: { id: 'halloween', name: 'Түнгі бақ', subtitle: '????? ???', cover: '#29242C', page: '#F8F0E9', ink: '#30262A', muted: '#807078', accent: '#D77C40', line: '#E6D9D0', serif: 'serif', shadow: 0.28, ornament: '☾' },
  winter: { id: 'winter', name: 'Қысқы ертегі', subtitle: '??? ??? ???? ???', cover: '#536E80', page: '#F5FAFB', ink: '#263843', muted: '#6D8792', accent: '#C5A76B', line: '#DCE9ED', serif: 'serif', shadow: 0.18, ornament: '❄' },
  creative: { id: 'creative', name: 'Түрлі-түсті', subtitle: '???????????? ?????', cover: '#A65362', page: '#FFF9F5', ink: '#332930', muted: '#85747C', accent: '#E1A544', line: '#F0DFD7', serif: 'serif', shadow: 0.18, ornament: '✳' },
  midnight: { id: 'midnight', name: 'Түн ортасы', subtitle: '????? ?????', cover: '#20242D', page: '#282D37', ink: '#F2EEE7', muted: '#A7A8AE', accent: '#D1B47C', line: '#3A414E', serif: 'serif', shadow: 0.3, ornament: '✧' },
  warm: { id: 'warm', name: 'Жылы минимализм', subtitle: '???? ????????', cover: '#B08968', page: '#F9F5EF', ink: '#40352C', muted: '#897C70', accent: '#A76B45', line: '#E8DED2', serif: 'serif', shadow: 0.14, ornament: '·' }
};

export const themeIds = Object.keys(themes) as ThemeId[];
export const getTheme = (id: string): NotebookTheme => themes[id as ThemeId] ?? themes.warm;
