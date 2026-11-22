import { StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { BarChart3, CalendarDays, CircleHelp, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react-native';
import { AppScreen, Card, colors, ThemedText as Text, useAppAppearance, ThemedView as View } from '@/components/ui';

const links = [
  { title: 'Күнтізбе', subtitle: 'Күнделік жазбалары мен тапсырмалар', icon: CalendarDays, route: '/(tabs)/calendar', tint: '#F2E6D9' },
  { title: 'Статистика', subtitle: 'Жазу әдеті мен оқу барысы', icon: BarChart3, route: '/statistics', tint: '#E7ECE4' },
  { title: 'Жалпы іздеу', subtitle: 'Дәптерлер мен сақталған мазмұн', icon: Search, route: '/search', tint: '#EBE7F2' },
  { title: 'Баптаулар', subtitle: 'Құпиялылық, көшірме және тақырыптар', icon: Settings2, route: '/settings', tint: '#E8E8E4' }
] as const;

export default function MoreScreen() {
  useAppAppearance();
  return <AppScreen title="Жеке кеңістік" subtitle="LUMI • жергілікті кітапхана">
    <Card style={styles.banner} color="#4B3028"><View style={styles.bannerStar}><Sparkles size={19} color="#E3C58F" /></View><Text style={styles.bannerTitle}>Өзіңізге тиесілі{ '\n' }жеке әлем</Text><Text style={styles.bannerSub}>Сөздеріңіз бен ойларыңыз осы құрылғыда қалады.</Text><View style={styles.bannerPrivacy}><ShieldCheck size={14} color="#E3C58F" /><Text style={styles.privacyText}>Офлайн • жеке • жарнамасыз</Text></View></Card>
    <Text style={styles.section}>Құралдар</Text>
    {links.map((link) => { const Icon = link.icon; return <TouchableOpacity key={link.route} onPress={() => router.push(link.route as never)} style={styles.link}><View style={[styles.linkIcon, { backgroundColor: link.tint }]}><Icon size={19} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.linkTitle}>{link.title}</Text><Text style={styles.linkSubtitle}>{link.subtitle}</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>; })}
    <Card style={styles.about}><View style={styles.aboutHead}><CircleHelp size={17} color={colors.muted} /><Text style={styles.aboutTitle}>Қолданба туралы</Text></View><Text style={styles.aboutText}>LUMI 1.0.0 • мазмұн құрылғыда сақталады. Жазбаларыңыз жоғалмауы үшін баптаулардан сақтық көшірме жасаңыз.</Text></Card>
  </AppScreen>;
}

const styles = StyleSheet.create({ banner: { borderWidth: 0, padding: 21, overflow: 'hidden' }, bannerStar: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' }, bannerTitle: { color: '#FFF7EC', fontFamily: 'serif', fontSize: 24, fontWeight: '700', lineHeight: 30, marginTop: 13 }, bannerSub: { color: '#E6D8C7', fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 250 }, bannerPrivacy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 19 }, privacyText: { color: '#E3C58F', fontSize: 10, fontWeight: '700' }, section: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 9 }, link: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EAE2D7' }, linkIcon: { width: 41, height: 41, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, linkTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, linkSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 }, arrow: { color: '#AA9B8B', fontSize: 26, paddingHorizontal: 5 }, about: { marginTop: 25, padding: 15 }, aboutHead: { flexDirection: 'row', alignItems: 'center', gap: 7 }, aboutTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, aboutText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 8 }
});
