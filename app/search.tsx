import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeft, BookHeart, BookOpen, CalendarCheck, Languages, Search as SearchIcon, X, FileText } from 'lucide-react-native';
import { AppScreen, Card, colors, useAppAppearance, ThemedText as Text, ThemedView as View } from '@/components/ui';
import { searchAll } from '@/database/search';

type Result = { kind: 'entry' | 'page' | 'task' | 'word' | 'notebook'; id: string; title: string; subtitle: string; date?: string; notebookId?: string };
const labels = { entry: 'Күнделік жазбасы', page: 'Дәптер беті', task: 'Жоспар', word: 'Сөздік', notebook: 'Дәптер' } as const;
const icons: Record<Result['kind'], typeof BookOpen> = { entry: BookHeart, page: FileText, task: CalendarCheck, word: Languages, notebook: BookOpen };

export default function SearchScreen() {
  const db = useSQLiteContext();
  const { palette } = useAppAppearance();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const requestSequence = useRef(0);
  useEffect(() => {
    const requestId = ++requestSequence.current;
    const normalized = query.trim();
    const timer = setTimeout(() => {
      if (!normalized) { setResults([]); setSearching(false); return; }
      setSearching(true);
      void searchAll(db, normalized).then((nextResults) => {
        if (requestSequence.current === requestId) setResults(nextResults);
      }).catch(() => {
        if (requestSequence.current === requestId) setResults([]);
      }).finally(() => {
        if (requestSequence.current === requestId) setSearching(false);
      });
    }, normalized ? 180 : 0);
    return () => clearTimeout(timer);
  }, [db, query]);
  const openResult = (item: Result) => {
    if (item.kind === 'notebook') router.push({ pathname: '/notebook/[id]', params: { id: item.notebookId ?? item.id } });
    else if (item.kind === 'entry' && item.notebookId && item.date) router.push({ pathname: '/notebook/[id]', params: { id: item.notebookId, date: item.date } });
    else if (item.kind === 'page' && item.notebookId) router.push({ pathname: '/notebook/[id]', params: { id: item.notebookId, pageId: item.id } });
    else if (item.kind === 'task') router.push({ pathname: '/task/[id]', params: { id: item.id } });
    else if (item.kind === 'word') router.push({ pathname: '/(tabs)/vocabulary', params: { wordId: item.id, ...(item.notebookId ? { notebookId: item.notebookId } : {}) } });
  };
  return <AppScreen title="Іздеу" subtitle="Жеке кітапханаңыздан табыңыз" scroll={false} contentStyle={{ paddingHorizontal: 16 }} right={<TouchableOpacity style={[styles.back, { backgroundColor: palette.accentSoft }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Артқа"><ArrowLeft size={19} color={palette.ink} /></TouchableOpacity>}>
    <View style={[styles.inputRow, { backgroundColor: palette.paper, borderColor: palette.line }]}><SearchIcon size={19} color={palette.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Сөз, тақырып, жоспар…" placeholderTextColor={palette.muted} style={[styles.input, { color: palette.ink }]} returnKeyType="search" autoFocus accessibilityLabel="Мазмұннан іздеу" />{query ? <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Іздеуді тазарту"><X size={18} color={palette.muted} /></TouchableOpacity> : null}</View>
    {!query.trim() ? <Card style={styles.tip}><Text style={styles.tipTitle}>Нені табу керек?</Text><Text style={styles.tipText}>Күнделік жазбасын, тапсырманы, сөзді немесе дәптердің атауын жазыңыз.</Text></Card> : <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">{searching ? <Text style={styles.status}>Іздеп жатыр…</Text> : results.length ? <><Text style={styles.count}>{results.length} нәтиже</Text>{results.map((item, index) => { const Icon = icons[item.kind] ?? BookOpen; return <TouchableOpacity key={`${item.kind}-${item.id}-${index}`} onPress={() => openResult(item)}><Card style={styles.result}><View style={styles.resultIcon}><Icon size={17} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.kind}>{labels[item.kind]}</Text><Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.resultSub} numberOfLines={2}>{item.subtitle}</Text></View><Text style={styles.arrow}>›</Text></Card></TouchableOpacity>; })}</> : <Card style={styles.tip}><Text style={styles.tipTitle}>Нәтиже табылмады</Text><Text style={styles.tipText}>Басқа сөзбен немесе қысқа тіркеспен көріңіз.</Text></Card>}</ScrollView>}
  </AppScreen>;
}

const styles = StyleSheet.create({ back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#F1E9DE' }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 13, marginTop: 7, marginBottom: 16, minHeight: 52 }, input: { flex: 1, height: 49, color: colors.ink, fontSize: 15 }, tip: { marginTop: 10, padding: 17 }, tipTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 16, fontWeight: '700' }, tipText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }, status: { color: colors.muted, textAlign: 'center', marginTop: 20 }, count: { color: colors.muted, fontSize: 11, marginBottom: 8 }, result: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, marginBottom: 8 }, resultIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: '#F2E7D9', alignItems: 'center', justifyContent: 'center' }, kind: { color: colors.accent, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }, resultTitle: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 3 }, resultSub: { color: colors.muted, fontSize: 10, marginTop: 3 }, arrow: { color: colors.muted, fontSize: 23 }
});
