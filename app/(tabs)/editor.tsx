import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BookOpen, ChevronRight, Edit3, FilePlus2, Languages } from 'lucide-react-native';
import { AppScreen, Card, colors } from '@/components/ui';
import { listEntries, listNotebookPages, listNotebooks } from '@/database/repository';
import { getTheme } from '@/themes/registry';
import type { Entry, Notebook, NotebookPage } from '@/types/models';

const typeLabels = { general: 'Жалпы дәптер', journal: 'Күнделік', vocabulary: 'Сөздік', planner: 'Жоспар' } as const;
type NotebookWithPages = { book: Notebook; pages: NotebookPage[]; entries: Entry[] };

export default function EditorHome() {
  const db = useSQLiteContext(); const [items, setItems] = useState<NotebookWithPages[]>([]);
  const refresh = useCallback(async () => {
    const books = await listNotebooks(db);
    const results = await Promise.all(books.map(async (book) => ({ book, pages: book.type === 'general' || book.type === 'vocabulary' || book.type === 'planner' ? await listNotebookPages(db, book.id) : [], entries: book.type === 'journal' ? await listEntries(db, book.id) : [] })));
    setItems(results);
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const openEditor = (item: NotebookWithPages, page?: NotebookPage) => {
    const { book } = item;
    if (book.type === 'general') router.push({ pathname: '/notebook/[id]/edit', params: { id: book.id, ...(page ? { pageId: page.id } : {}) } });
    else if (book.type === 'journal') router.push({ pathname: '/(tabs)/journal', params: { notebookId: book.id } });
    else if (book.type === 'vocabulary') router.push({ pathname: '/(tabs)/vocabulary', params: { notebookId: book.id } });
    else router.push({ pathname: '/(tabs)/planner', params: { notebookId: book.id } });
  };
  return <AppScreen title="Редактор" subtitle="Өңдеу үшін дәптерді таңдаңыз">
    <ScrollView contentContainerStyle={styles.list}>
      {items.map((item) => { const { book, pages, entries } = item; const theme = getTheme(book.themeId); const Icon = book.type === 'vocabulary' ? Languages : BookOpen; return <Card key={book.id} style={styles.card}>
        <View style={styles.row}><View style={[styles.cover, { backgroundColor: theme.cover }]}><Icon size={19} color="#FFF9F1" /></View><View style={{ flex: 1 }}><Text style={styles.title}>{book.title}</Text><Text style={styles.subtitle}>{typeLabels[book.type]} · {new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'short' }).format(new Date(book.updatedAt))}</Text></View></View>
        {book.type === 'general' ? <>
          {pages.slice(0, 4).map((page) => <TouchableOpacity key={page.id} style={styles.pageRow} onPress={() => openEditor(item, page)}><Text style={styles.pageName} numberOfLines={1}>{page.title || page.content.slice(0, 55) || 'Атаусыз бет'}</Text><Edit3 size={14} color={colors.accent} /></TouchableOpacity>)}
          <TouchableOpacity style={styles.action} onPress={() => openEditor(item)}><FilePlus2 size={16} color={colors.accent} /><Text style={styles.actionText}>Жаңа бет</Text></TouchableOpacity>
        </> : book.type === 'journal' ? <>
          {entries.slice(0, 4).map((entry) => <TouchableOpacity key={entry.id} style={styles.pageRow} onPress={() => router.push({ pathname: '/(tabs)/journal', params: { notebookId: book.id, date: entry.date } })}><Text style={styles.pageName} numberOfLines={1}>{entry.title || entry.content.slice(0, 55) || entry.date}</Text><Text style={styles.entryDate}>{entry.date}</Text></TouchableOpacity>)}
          <TouchableOpacity style={styles.action} onPress={() => openEditor(item)}><FilePlus2 size={16} color={colors.accent} /><Text style={styles.actionText}>Бүгінгі жазба</Text></TouchableOpacity>
        </> : <TouchableOpacity style={styles.action} onPress={() => openEditor(item)}><Edit3 size={16} color={colors.accent} /><Text style={styles.actionText}>Өңдеуді ашу</Text><ChevronRight size={16} color={colors.accent} /></TouchableOpacity>}
      </Card>; })}
      {!items.length ? <View style={styles.empty}><BookOpen size={30} color={colors.accent} /><Text style={styles.title}>Әзірге дәптер жоқ</Text><Text style={styles.subtitle}>Кітап сөресінен жаңа дәптер қосыңыз.</Text></View> : null}
    </ScrollView>
  </AppScreen>;
}

const styles = StyleSheet.create({ list: { gap: 12, paddingBottom: 25 }, card: { padding: 13 }, row: { flexDirection: 'row', alignItems: 'center', gap: 11 }, cover: { width: 44, height: 51, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontFamily: 'serif', fontSize: 16, fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: 11, marginTop: 4 }, pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, entryDate: { color: colors.muted, fontSize: 9 }, pageName: { flex: 1, color: colors.ink, fontSize: 12, marginRight: 8 }, action: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: 9, marginTop: 2 }, actionText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, empty: { alignItems: 'center', gap: 8, padding: 30 } });
