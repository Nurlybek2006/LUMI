import { useCallback, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BookHeart, BookOpen, BookOpenCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Code2, Flame, Languages, Lightbulb, Plus, Search, Sunrise, X } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, SectionTitle, TextField, colors, useAppAppearance } from '@/components/ui';
import { getStats, listEntries, listNotebookPages, listNotebooks, listTasks, listWords, createNotebook, deleteNotebook, reorderNotebook, updateNotebook } from '@/database/repository';
import { getTheme, themeIds, themes } from '@/themes/registry';
import { localDate, addLocalDays } from '@/utils/core';
import { readSetting } from '@/database/settings';
import { pruneUnusedMedia } from '@/services/media';
import type { Notebook, NotebookType, ThemeId } from '@/types/models';

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const appearance = useAppAppearance();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pagesByNotebook, setPagesByNotebook] = useState<Record<string, number>>({});
  const [tomorrowTasks, setTomorrowTasks] = useState<{ title: string; completed: boolean }[]>([]);
  const [dueWords, setDueWords] = useState(0);
  const [stats, setStats] = useState({ entries: 0, words: 0, tasksDone: 0, tasksTotal: 0, wordsReviewedToday: 0, wordsLearned: 0, totalWords: 0, streak: 0, longest: 0, monthlyDays: [] as string[] });
  const [modal, setModal] = useState<'create' | 'rename' | 'theme' | null>(null);
  const [target, setTarget] = useState<Notebook | null>(null);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<ThemeId>('warm');
  const [notebookType, setNotebookType] = useState<NotebookType>('general');

  const refresh = useCallback(async () => {
    const [books, counts, tasks, entries, words] = await Promise.all([listNotebooks(db), getStats(db), listTasks(db, addLocalDays(localDate(), 1)), listEntries(db), listWords(db)]);
    const progress: Record<string, number> = {};
    for (const entry of entries) progress[entry.notebookId] = (progress[entry.notebookId] ?? 0) + 1;
    const countsByBook = await Promise.all(books.map(async (book) => ({
      id: book.id,
      count: book.type === 'general' ? (await listNotebookPages(db, book.id)).length
        : book.type === 'vocabulary' ? (await listWords(db, '', 'due', book.id)).length
          : book.type === 'planner' ? (await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM tasks WHERE notebook_id=?', book.id))?.count ?? 0
            : progress[book.id] ?? 0
    })));
    for (const item of countsByBook) progress[item.id] = item.count;
    setNotebooks(books); setStats(counts); setTomorrowTasks(tasks.slice(0, 3));
    setPagesByNotebook(progress); setDueWords(words.filter((word) => !word.learned && word.nextReview <= localDate()).length);
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openCreate = () => { setTitle(''); setNotebookType('general'); void readSetting(db, 'default_theme').then((value) => setTheme((value as ThemeId) || 'warm')); setModal('create'); };
  const bookIcons: Record<string, typeof BookOpen> = { 'book-heart': BookHeart, 'calendar-days': CalendarDays, languages: Languages, lightbulb: Lightbulb, 'code-2': Code2 };
  const openManage = (book: Notebook) => Alert.alert(book.title, 'Дәптерді өзгерту', [
    { text: 'Атын өзгерту', onPress: () => { setTarget(book); setTitle(book.title); setModal('rename'); } },
    { text: 'Тақырыбын таңдау', onPress: () => { setTarget(book); setTheme(book.themeId); setModal('theme'); } },
    { text: 'Жою', style: 'destructive', onPress: () => Alert.alert('Дәптерді жою керек пе?', 'Ішіндегі барлық жазбалар да өшеді.', [{ text: 'Болдырмау', style: 'cancel' }, { text: 'Жою', style: 'destructive', onPress: () => { void deleteNotebook(db, book.id).then(async () => { try { await pruneUnusedMedia(db); } catch { /* The notebook deletion is already complete. */ } await refresh(); }); } }]) },
    { text: 'Жабу', style: 'cancel' }
  ]);
  const saveModal = async () => {
    if (modal === 'create') { if (!title.trim()) return; const id = await createNotebook(db, title, theme, notebookType); setModal(null); await refresh(); router.push({ pathname: '/notebook/[id]', params: { id } }); }
    if (modal === 'rename' && target) { if (!title.trim()) return; await updateNotebook(db, target.id, { title }); setModal(null); await refresh(); }
    if (modal === 'theme' && target) { await updateNotebook(db, target.id, { themeId: theme }); setModal(null); await refresh(); }
  };

  return <AppScreen title="Кітап сөресі" subtitle="Жеке кітапханаңыз" right={<View style={{ flexDirection: 'row', gap: 7 }}><TouchableOpacity onPress={() => appearance.setMode(appearance.palette.background === '#181715' ? 'light' : 'dark')} style={styles.searchButton} accessibilityRole="button" accessibilityLabel="Ашық немесе қараңғы көріністі ауыстыру"><Text style={{ fontSize: 18, color: colors.accent }}>{appearance.palette.background === '#181715' ? '☼' : '☾'}</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push('/search')} style={styles.searchButton}><Search size={19} color={colors.ink} /></TouchableOpacity></View>}>
    <View style={styles.greeting}><View><Text style={styles.eyebrow}>{new Intl.DateTimeFormat('kk-KZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</Text><Text style={styles.greetTitle}>Қош келдіңіз ✨</Text></View></View>
    <Card style={styles.streakCard} color="#EDE3D5"><View style={styles.streakLeft}><View style={styles.flame}><Flame size={20} color="#A76843" /></View><View><Text style={styles.streakNum}>{stats.streak} күндік серпін</Text><Text style={styles.streakSub}>Бүгінгі ойыңызды жазып қойыңыз</Text></View></View><Text style={styles.streakMark}>✦</Text></Card>

    <View style={styles.quickRow}>
      <TouchableOpacity style={[styles.quickCard, { backgroundColor: '#EDE3D5' }]} onPress={() => router.push({ pathname: '/(tabs)/journal', params: { date: localDate() } })} accessibilityRole="button" accessibilityLabel="Бүгінгі күнделік жазбасын ашу">
        <BookHeart size={19} color={colors.accent} /><Text style={styles.quickTitle}>Бүгінгі жазба</Text><Text style={styles.quickSubtitle}>Күнделікке өту</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.quickCard, { backgroundColor: '#E8ECE2' }]} onPress={() => router.push(dueWords ? '/review' : '/(tabs)/vocabulary')} accessibilityRole="button" accessibilityLabel={dueWords ? `${dueWords} сөзді қайталау` : 'Сөздікке өту'}>
        <BookOpenCheck size={19} color={colors.green} /><Text style={styles.quickTitle}>{dueWords ? `${dueWords} сөз дайын` : 'Сөздік'}</Text><Text style={styles.quickSubtitle}>{dueWords ? 'Қайталауды бастау' : 'Жаңа сөз қосу'}</Text>
      </TouchableOpacity>
    </View>

    <SectionTitle title="Сіздің дәптерлеріңіз" action="Іздеу" onAction={() => router.push('/search')} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {!notebooks.length ? <TouchableOpacity onPress={openCreate} style={styles.emptyShelf}><BookOpen size={25} color={colors.accent} /><Text style={styles.emptyShelfTitle}>Сөреңіз әзірге бос</Text><Text style={styles.emptyShelfText}>Алғашқы дәптеріңізді жасаңыз</Text></TouchableOpacity> : null}
      {notebooks.map((book, index) => { const t = getTheme(book.themeId); const Icon = bookIcons[book.icon] ?? BookOpen; return <View key={book.id} style={styles.bookWrap}>
        <TouchableOpacity onPress={() => router.push({ pathname: '/notebook/[id]', params: { id: book.id } })} onLongPress={() => openManage(book)} accessibilityRole="button" accessibilityLabel={`${book.title}, ${t.name}`}>
          <View style={[styles.book, { backgroundColor: t.cover }]}><View style={styles.bookSpine} /><Text style={styles.bookOrnament}>{t.ornament}</Text><Icon size={23} color="#F3DEB5" strokeWidth={1.4} /><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookSubtitle}>{book.type === 'general' ? 'Жалпы дәптер' : book.type === 'journal' ? 'Күнделік' : book.type === 'vocabulary' ? 'Сөздік' : 'Жоспар'} · {pagesByNotebook[book.id] ?? 0} бет</Text><View style={[styles.bookBottom, { backgroundColor: t.accent }]} /></View>
        </TouchableOpacity>
        <View style={styles.bookActions}><TouchableOpacity onPress={() => void reorderNotebook(db, book.id, -1).then(refresh)} disabled={index === 0} accessibilityLabel="Дәптерді солға жылжыту"><ChevronLeft size={16} color={index === 0 ? '#D5CCC1' : colors.muted} /></TouchableOpacity><TouchableOpacity onPress={() => openManage(book)} accessibilityLabel="Дәптерді баптау"><ChevronDown size={16} color={colors.muted} /></TouchableOpacity><TouchableOpacity onPress={() => void reorderNotebook(db, book.id, 1).then(refresh)} disabled={index === notebooks.length - 1} accessibilityLabel="Дәптерді оңға жылжыту"><ChevronRight size={16} color={index === notebooks.length - 1 ? '#D5CCC1' : colors.muted} /></TouchableOpacity></View>
      </View>; })}
      <TouchableOpacity onPress={openCreate} style={styles.addBook}><View style={styles.addBookIcon}><Plus size={25} color={colors.accent} /></View><Text style={styles.addBookText}>Жаңа дәптер</Text></TouchableOpacity>
    </ScrollView>
    <View style={styles.shelfLine} />

    <SectionTitle title="Күннің кішкентай жоспары" action="Барлығы" onAction={() => router.push('/(tabs)/planner')} />
    <Card style={styles.planCard}>
      <View style={styles.planHeader}><View style={styles.sunrise}><Sunrise size={18} color="#B17850" /></View><View style={{ flex: 1 }}><Text style={styles.planTitle}>Ертеңге дайындық</Text><Text style={styles.planDate}>{new Intl.DateTimeFormat('kk-KZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(addLocalDaysToDate(1))}</Text></View><TouchableOpacity onPress={() => router.push('/(tabs)/planner')}><ChevronRight size={18} color={colors.muted} /></TouchableOpacity></View>
      {tomorrowTasks.length ? tomorrowTasks.map((task, index) => <View style={styles.taskPreview} key={`${task.title}-${index}`}><View style={[styles.taskDot, task.completed ? styles.taskComplete : null]} /><Text style={[styles.taskText, task.completed ? { textDecorationLine: 'line-through', color: colors.muted } : null]} numberOfLines={1}>{task.title}</Text></View>) : <Text style={styles.planEmpty}>Ертеңге ойыңызды түртіп қойыңыз</Text>}
      <TouchableOpacity onPress={() => router.push('/(tabs)/planner')} style={styles.planAdd}><Plus size={15} color={colors.accent} /><Text style={styles.planAddText}>Жоспарды ашу</Text></TouchableOpacity>
    </Card>
    <View style={styles.footerStats}><View style={styles.footerStat}><Text style={styles.statValue}>{stats.entries}</Text><Text style={styles.statLabel}>жазба</Text></View><View style={styles.statDivider} /><View style={styles.footerStat}><Text style={styles.statValue}>{stats.words}</Text><Text style={styles.statLabel}>сөз</Text></View><View style={styles.statDivider} /><View style={styles.footerStat}><Text style={styles.statValue}>{stats.tasksDone}</Text><Text style={styles.statLabel}>аяқталған іс</Text></View></View>
    <Text style={styles.privacy}>Жеке кеңістік • құрылғыда сақталады</Text>

    <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={() => setModal(null)}>
      <View style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{modal === 'create' ? 'Жаңа дәптер' : modal === 'rename' ? 'Дәптердің атауы' : 'Дәптер тақырыбы'}</Text><TouchableOpacity onPress={() => setModal(null)}><X size={20} color={colors.muted} /></TouchableOpacity></View>
        {modal !== 'theme' ? <TextField label="Атауы" value={title} onChangeText={setTitle} placeholder="Мысалы, Саяхаттар" autoFocus /> : null}
        {modal === 'create' ? <View><Text style={styles.themeLabel}>Дәптер түрі</Text><View style={styles.themeGrid}>{([['general', 'Жалпы дәптер'], ['journal', 'Күнделік'], ['vocabulary', 'Сөздік'], ['planner', 'Жоспар']] as const).map(([type, label]) => <TouchableOpacity key={type} onPress={() => setNotebookType(type)} style={[{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: '#EFE8DE', borderWidth: 1, borderColor: 'transparent' }, notebookType === type ? { backgroundColor: '#E8D7C2', borderColor: colors.accent } : null]}><Text style={[{ color: colors.muted, fontSize: 11, fontWeight: '600' }, notebookType === type ? { color: colors.ink, fontWeight: '700' } : null]}>{label}</Text></TouchableOpacity>)}</View></View> : null}
        {(modal === 'theme' || modal === 'create') ? <View><Text style={styles.themeLabel}>Тақырып</Text><View style={styles.themeGrid}>{themeIds.map((id) => { const item = themes[id]; return <TouchableOpacity key={id} onPress={() => setTheme(id)} style={[styles.themeChip, { backgroundColor: item.cover, borderColor: theme === id ? item.accent : 'transparent' }]}><Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{item.ornament}  {item.name}</Text></TouchableOpacity>; })}</View></View> : null}
        <PrimaryButton title={modal === 'theme' ? 'Тақырыпты сақтау' : 'Дәптерді сақтау'} onPress={() => void saveModal()} style={{ marginTop: 18 }} />
      </View></View>
    </Modal>
  </AppScreen>;
}

const addLocalDaysToDate = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date; };
const styles = StyleSheet.create({ searchButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE' }, greeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, marginBottom: 18 }, eyebrow: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' }, greetTitle: { color: colors.ink, fontFamily: 'serif', fontWeight: '700', fontSize: 24, marginTop: 4 }, moon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE2D2', borderRadius: 17 }, streakCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 15, borderWidth: 0 }, streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 }, flame: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F7EFE4', alignItems: 'center', justifyContent: 'center' }, streakNum: { color: colors.ink, fontWeight: '700', fontSize: 14 }, streakSub: { color: '#8C7B6B', fontSize: 11, marginTop: 3 }, streakMark: { color: '#BD935A', fontSize: 23 }, quickRow: { flexDirection: 'row', gap: 10, marginTop: 11 }, quickCard: { flex: 1, borderRadius: 15, padding: 13, minHeight: 92, justifyContent: 'space-between' }, quickTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 8 }, quickSubtitle: { color: colors.muted, fontSize: 10, marginTop: 2 }, emptyShelf: { width: 230, height: 172, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9CABB', backgroundColor: '#F3ECE2', gap: 7 }, emptyShelfTitle: { color: colors.ink, fontWeight: '700', fontFamily: 'serif', fontSize: 16 }, emptyShelfText: { color: colors.muted, fontSize: 11 }, shelf: { gap: 13, paddingTop: 4, paddingBottom: 5, alignItems: 'flex-end' }, bookWrap: { width: 124, alignItems: 'center' }, book: { width: 118, height: 172, borderRadius: 8, borderTopLeftRadius: 5, borderBottomLeftRadius: 5, paddingHorizontal: 14, paddingTop: 17, paddingBottom: 12, alignItems: 'center', justifyContent: 'space-between', shadowColor: '#4A382C', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 3, height: 5 }, elevation: 4, overflow: 'hidden' }, bookSpine: { position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF35' }, bookOrnament: { color: '#E7C78D', fontSize: 24 }, bookTitle: { color: '#FFF9F0', fontFamily: 'serif', fontSize: 15, lineHeight: 19, textAlign: 'center', fontWeight: '700' }, bookSubtitle: { color: '#FFFFFFB5', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }, bookBottom: { width: 40, height: 2, borderRadius: 3 }, bookActions: { flexDirection: 'row', width: 96, justifyContent: 'space-around', marginTop: 7 }, addBook: { width: 112, height: 172, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9CABB', borderRadius: 12, gap: 10, backgroundColor: '#F3ECE2' }, addBookIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#E8D9C7', alignItems: 'center', justifyContent: 'center' }, addBookText: { color: colors.accent, fontWeight: '700', fontSize: 12 }, shelfLine: { height: 5, backgroundColor: '#DDD0C1', borderRadius: 5, marginTop: 0, opacity: 0.75 }, planCard: { padding: 15 }, planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, sunrise: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F3E7D7', alignItems: 'center', justifyContent: 'center' }, planTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 }, planDate: { color: colors.muted, fontSize: 11, marginTop: 3, textTransform: 'capitalize' }, planEmpty: { color: colors.muted, fontSize: 13, marginTop: 16, marginLeft: 4 }, taskPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F2ECE3', marginTop: 5 }, taskDot: { width: 13, height: 13, borderRadius: 5, borderWidth: 1.5, borderColor: '#D5C6B5' }, taskComplete: { backgroundColor: colors.green, borderColor: colors.green }, taskText: { color: colors.ink, fontSize: 13, flex: 1 }, planAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }, planAddText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, footerStats: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#EFE7DB', borderRadius: 16, paddingVertical: 13 }, footerStat: { alignItems: 'center', gap: 2 }, statValue: { color: colors.ink, fontFamily: 'serif', fontSize: 19, fontWeight: '700' }, statLabel: { color: colors.muted, fontSize: 10 }, statDivider: { width: 1, height: 29, backgroundColor: '#D9CFC1' }, privacy: { color: '#9E9387', fontSize: 10, textAlign: 'center', marginTop: 14 }, modalShade: { flex: 1, backgroundColor: '#1D1915A0', justifyContent: 'center', padding: 22 }, modalCard: { backgroundColor: colors.background, borderRadius: 23, padding: 20, gap: 15 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 19, fontWeight: '700' }, themeLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7 }, themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, themeChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 11, borderWidth: 2 }
});
