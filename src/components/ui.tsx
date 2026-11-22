import type { ComponentRef, PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextInputProps, type ViewStyle, type TextProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { getTheme } from '@/themes/registry';
import type { ThemeId } from '@/types/models';
import { createContext, forwardRef, useContext } from 'react';
import type { AppearanceMode, Palette } from '@/services/appearance';
import { lightPalette } from '@/services/appearance';

let activePalette = lightPalette;
export function setGlobalColorTokens(palette: Palette) { activePalette = palette; }
export const colors = {
  get background() { return activePalette.background; }, get paper() { return activePalette.paper; }, get ink() { return activePalette.ink; }, get muted() { return activePalette.muted; }, get accent() { return activePalette.accent; }, get line() { return activePalette.line; }, get green() { return activePalette.green; }, get red() { return activePalette.red; }
};
export const AppAppearanceContext = createContext<{ mode: AppearanceMode; palette: Palette; setMode: (mode: AppearanceMode) => void }>({ mode: 'system', palette: lightPalette, setMode: () => undefined });
export const useAppAppearance = () => useContext(AppAppearanceContext);

const textTokenMap: Record<string, keyof Palette> = {
  '#302820': 'ink', '#40352c': 'ink', '#382820': 'ink', '#887c70': 'muted', '#897c70': 'muted', '#766b61': 'muted', '#71675e': 'muted', '#a3988c': 'muted', '#9e9387': 'muted', '#a79b8e': 'muted', '#81709a': 'muted', '#85749f': 'muted', '#9b9084': 'muted', '#a76b45': 'accent', '#8d5636': 'accent', '#b08968': 'accent', '#af865c': 'accent', '#b7864a': 'accent', '#a8793d': 'accent', '#6b8060': 'green', '#638267': 'green', '#527a62': 'green', '#42664f': 'green', '#a84e43': 'red', '#963d34': 'red', '#c36664': 'red', '#596b59': 'muted', '#75675b': 'muted', '#483d34': 'ink'
};
const surfaceTokenMap: Record<string, keyof Palette> = {
  '#f7f3ec': 'background', '#fffcf7': 'paper', '#ffffff': 'elevated', '#fff': 'elevated', '#f1e9de': 'accentSoft', '#f0e9df': 'accentSoft', '#efe8de': 'accentSoft', '#eee7de': 'accentSoft', '#eee7dd': 'accentSoft', '#f2e7d9': 'accentSoft', '#f0e8dc': 'accentSoft', '#f1ebe2': 'accentSoft', '#efe7dc': 'accentSoft', '#e8d7c2': 'accentSoft', '#f3ece2': 'accentSoft', '#e6e5dc': 'accentSoft', '#e6eee4': 'accentSoft', '#e8ece2': 'accentSoft', '#ece8f3': 'accentSoft', '#ece9f3': 'accentSoft', '#f1e5d8': 'accentSoft', '#f1eae1': 'accentSoft', '#ede3d5': 'accentSoft', '#eee2d2': 'accentSoft', '#f7efe4': 'accentSoft', '#f3e7d7': 'accentSoft', '#f8f6f1': 'accentSoft', '#fbf7f0': 'accentSoft', '#f2e6d9': 'accentSoft', '#e7ece4': 'accentSoft', '#ebe7f2': 'accentSoft', '#e8e8e4': 'accentSoft', '#f3efe9': 'accentSoft', '#f3ebe1': 'accentSoft', '#f2e9dc': 'accentSoft', '#f0e7db': 'accentSoft', '#eee6db': 'accentSoft', '#edf0e8': 'accentSoft', '#f3e6d9': 'accentSoft', '#e4d2bd': 'accentSoft', '#faf5ed': 'accentSoft'
};

export const ThemedText = forwardRef<ComponentRef<typeof Text>, TextProps>(function ThemedText({ style, ...props }, ref) {
  const { palette } = useAppAppearance(); const flattened = StyleSheet.flatten(style); const token = typeof flattened?.color === 'string' ? textTokenMap[flattened.color.toLowerCase()] : undefined;
  return <Text ref={ref} {...props} style={[style, token ? { color: palette[token] } : null]} />;
});

export const ThemedView = forwardRef<ComponentRef<typeof View>, ViewProps>(function ThemedView({ style, ...props }, ref) {
  const { palette } = useAppAppearance(); const flattened = StyleSheet.flatten(style);
  const bg = typeof flattened?.backgroundColor === 'string' ? surfaceTokenMap[flattened.backgroundColor.toLowerCase()] : undefined;
  const border = typeof flattened?.borderColor === 'string' && ['#e8ded2', '#efe7dc', '#eae1d6', '#e6dacb'].includes(flattened.borderColor.toLowerCase());
  return <View ref={ref} {...props} style={[style, bg ? { backgroundColor: palette[bg] } : null, border ? { borderColor: palette.line } : null]} />;
});

export function AppScreen({ children, title, subtitle, themeId, scroll = true, right, contentStyle }: PropsWithChildren<{ title?: string; subtitle?: string; themeId?: ThemeId; scroll?: boolean; right?: ReactNode; contentStyle?: ViewStyle }>) {
  const router = useRouter(); const segments = useSegments() as string[]; const theme = getTheme(themeId ?? 'warm'); const isTopTab = segments[0] === '(tabs)' && ['index', 'editor', 'planner', 'vocabulary', 'more'].includes(segments[1] ?? ''); const canShowBack = router.canGoBack() && !isTopTab;
  const body = <View style={[styles.content, contentStyle]}>{children}</View>;
  const appearance = useAppAppearance(); const pageColor = themeId ? theme.page : appearance.palette.background; const inkColor = themeId ? theme.ink : appearance.palette.ink; const mutedColor = themeId ? theme.muted : appearance.palette.muted;
  return <SafeAreaView style={[styles.safe, { backgroundColor: pageColor }]} edges={['top', 'left', 'right']}>
    {(title || right) && <View style={[styles.header, { backgroundColor: pageColor }]}>
      {canShowBack ? <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Артқа" hitSlop={8}><ArrowLeft size={21} color={inkColor} /></TouchableOpacity> : <View style={styles.back}><Text style={[styles.brandSmall, { color: appearance.palette.accent }]}>L</Text></View>}
      <View style={styles.headerText}><Text style={[styles.headerTitle, { color: inkColor }]}>{title ?? 'LUMI'}</Text>{subtitle ? <Text style={[styles.headerSubtitle, { color: mutedColor }]}>{subtitle}</Text> : null}</View>
      {right ?? <View style={{ width: 34 }} />}
    </View>}
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
  </SafeAreaView>;
}

export function Card({ children, style, color }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; color?: string }>) {
  const { palette } = useAppAppearance();
  const mapped = color ? surfaceTokenMap[color.toLowerCase()] : undefined;
  return <ThemedView style={[styles.card, { backgroundColor: mapped ? palette[mapped] : color ?? palette.paper, borderColor: palette.line }, style]}>{children}</ThemedView>;
}

export function PrimaryButton({ title, onPress, icon, disabled, secondary, style }: { title: string; onPress: () => void; icon?: ReactNode; disabled?: boolean; secondary?: boolean; style?: ViewStyle }) {
  const { palette } = useAppAppearance();
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: secondary ? palette.accentSoft : palette.ink }, secondary ? styles.buttonSecondary : null, disabled ? { opacity: 0.5 } : null, style]}>
    {icon}{<Text style={[styles.buttonText, secondary ? { color: palette.ink } : null]}>{title}</Text>}
  </TouchableOpacity>;
}

export function TextField({ label, containerStyle, ...props }: TextInputProps & { label?: string; containerStyle?: ViewStyle }) {
  const { palette } = useAppAppearance();
  return <View style={containerStyle}>{label ? <Text style={[styles.label, { color: palette.muted }]}>{label}</Text> : null}<TextInput placeholderTextColor={palette.muted} {...props} style={[styles.input, { backgroundColor: palette.paper, color: palette.ink, borderColor: palette.line }, props.multiline ? { minHeight: 108, textAlignVertical: 'top', paddingTop: 14 } : null, props.style]} />
  </View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { palette } = useAppAppearance();
  return <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: palette.primaryText }]}>{title}</Text>{action && onAction ? <TouchableOpacity onPress={onAction} style={styles.sectionAction}><Text style={[styles.sectionActionText, { color: palette.accent }]}>{action}</Text><ChevronRight size={15} color={palette.accent} /></TouchableOpacity> : null}</View>;
}

export function SearchButton({ onPress }: { onPress: () => void }) {
  const { palette } = useAppAppearance();
  return <TouchableOpacity style={[styles.search, { backgroundColor: palette.iconContainer }]} onPress={onPress} accessibilityRole="button" accessibilityLabel="Іздеу"><Search size={19} color={palette.icon} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { flex: 1, paddingHorizontal: 20, paddingBottom: 22 }, scroll: { flexGrow: 1, paddingBottom: 34 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 }, back: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandSmall: { fontFamily: 'serif', fontSize: 24, color: colors.accent }, headerText: { flex: 1 }, headerTitle: { color: colors.ink, fontSize: 19, fontFamily: 'serif', fontWeight: '600' }, headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: colors.paper, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#EFE7DC' }, button: { height: 48, borderRadius: 14, paddingHorizontal: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, buttonSecondary: { backgroundColor: '#F1E9DE', borderWidth: 1, borderColor: '#E6DACB' }, buttonText: { color: '#FFF9F1', fontWeight: '700', fontSize: 14 }, buttonTextSecondary: { color: colors.ink },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 7, marginLeft: 2 }, input: { backgroundColor: colors.paper, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 12 }, sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: 'serif', fontWeight: '600' }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 }, sectionActionText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, search: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#F0E9DF', alignItems: 'center', justifyContent: 'center' }
});

export const uiStyles = styles;
