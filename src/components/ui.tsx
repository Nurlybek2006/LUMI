import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { getTheme } from '@/themes/registry';
import type { ThemeId } from '@/types/models';

export const colors = { background: '#F7F3EC', paper: '#FFFCF7', ink: '#302820', muted: '#887C70', accent: '#A76B45', line: '#E8DED2', green: '#527A62', red: '#A84E43' };

export function AppScreen({ children, title, subtitle, themeId = 'warm', scroll = true, right, contentStyle }: PropsWithChildren<{ title?: string; subtitle?: string; themeId?: ThemeId; scroll?: boolean; right?: ReactNode; contentStyle?: ViewStyle }>) {
  const router = useRouter(); const theme = getTheme(themeId);
  const body = <View style={[styles.content, contentStyle]}>{children}</View>;
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.page }]} edges={['top', 'left', 'right']}>
    {(title || right) && <View style={[styles.header, { backgroundColor: theme.page }]}>
      <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.back} accessibilityRole="button" accessibilityLabel="Артқа">
        {router.canGoBack() ? <ArrowLeft size={21} color={colors.ink} /> : <Text style={styles.brandSmall}>L</Text>}
      </TouchableOpacity>
      <View style={styles.headerText}><Text style={[styles.headerTitle, { color: theme.ink }]}>{title ?? 'LUMI'}</Text>{subtitle ? <Text style={[styles.headerSubtitle, { color: theme.muted }]}>{subtitle}</Text> : null}</View>
      {right ?? <View style={{ width: 34 }} />}
    </View>}
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}
  </SafeAreaView>;
}

export function Card({ children, style, color }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; color?: string }>) {
  return <View style={[styles.card, color ? { backgroundColor: color } : null, style]}>{children}</View>;
}

export function PrimaryButton({ title, onPress, icon, disabled, secondary, style }: { title: string; onPress: () => void; icon?: ReactNode; disabled?: boolean; secondary?: boolean; style?: ViewStyle }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary ? styles.buttonSecondary : null, disabled ? { opacity: 0.5 } : null, style]}>
    {icon}{<Text style={[styles.buttonText, secondary ? styles.buttonTextSecondary : null]}>{title}</Text>}
  </TouchableOpacity>;
}

export function TextField({ label, containerStyle, ...props }: TextInputProps & { label?: string; containerStyle?: ViewStyle }) {
  return <View style={containerStyle}>{label ? <Text style={styles.label}>{label}</Text> : null}<TextInput placeholderTextColor="#A79B8E" {...props} style={[styles.input, props.multiline ? { minHeight: 108, textAlignVertical: 'top', paddingTop: 14 } : null, props.style]} />
  </View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{title}</Text>{action && onAction ? <TouchableOpacity onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text><ChevronRight size={15} color={colors.accent} /></TouchableOpacity> : null}</View>;
}

export function SearchButton({ onPress }: { onPress: () => void }) {
  return <TouchableOpacity style={styles.search} onPress={onPress} accessibilityRole="button" accessibilityLabel="Іздеу"><Search size={19} color={colors.muted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { flex: 1, paddingHorizontal: 20, paddingBottom: 22 }, scroll: { flexGrow: 1, paddingBottom: 34 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 }, back: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  brandSmall: { fontFamily: 'serif', fontSize: 24, color: colors.accent }, headerText: { flex: 1 }, headerTitle: { color: colors.ink, fontSize: 19, fontFamily: 'serif', fontWeight: '600' }, headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: colors.paper, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#EFE7DC' }, button: { height: 48, borderRadius: 14, paddingHorizontal: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, buttonSecondary: { backgroundColor: '#F1E9DE', borderWidth: 1, borderColor: '#E6DACB' }, buttonText: { color: '#FFF9F1', fontWeight: '700', fontSize: 14 }, buttonTextSecondary: { color: colors.ink },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 7, marginLeft: 2 }, input: { backgroundColor: colors.paper, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 12 }, sectionTitle: { color: colors.ink, fontSize: 18, fontFamily: 'serif', fontWeight: '600' }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 }, sectionActionText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, search: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#F0E9DF', alignItems: 'center', justifyContent: 'center' }
});

export const uiStyles = styles;
