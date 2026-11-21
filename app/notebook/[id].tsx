import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BookOpen, ChevronLeft, ChevronRight, Edit3, Languages, Palette, Plus, Search } from 'lucide-react-native';
import { AppScreen, colors } from '@/components/ui';
import { deleteNotebookPage, duplicateNotebookPage, getNotebook, listEntries, listNotebookPages, listNotebooks, listTasks, listWords, renameNotebookPage, updateNotebook, moveNotebookPage } from '@/database/repository';
import { readSetting, writeSetting } from '@/database/settings';
import { getTheme, themes, themeIds } from '@/themes/registry';
import { mediaUri } from '@/services/media';
import { paginateEntry, type RenderedBookPage } from '@/utils/pagination';
import { localDate, wordCount } from '@/utils/core';
import type { Entry, Notebook, NotebookPage, PlannerTask, ThemeId, VocabularyWord } from '@/types/models';
import { VocabularyColumnsBlock } from '@/components/VocabularyColumnsBlock';
import { LumiActionSheet, LumiConfirmDialog } from '@/components/LumiModal';
import { nextPageIndex, shouldCommitPageTurn } from '@/utils/pageTurn';

export default function NotebookReaderScreen() {
  const { id, pageId: requestedPageId, date: requestedDate } = useLocalSearchParams<{ id: string; pageId?: string; date?: string }>();
  const db = useSQLiteContext(); const { width, height, fontScale } = useWindowDimensions();
  const [book, setBook] = useState<Notebook | null>(null);
  const [bookLoaded, setBookLoaded] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [generalPages, setGeneralPages] = useState<NotebookPage[]>([]);
  const [pages, setPages] = useState<RenderedBookPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [themePicker, setThemePicker] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageAnimation, setPageAnimation] = useState<'smooth' | 'slide' | 'none'>('smooth');
  const translate = useSharedValue(0); const shade = useSharedValue(0);
  const activePage = pages[pageIndex]; const theme = getTheme(book?.themeId ?? 'warm');

  const refresh = useCallback(async () => {
    const [notebook, allEntries, rememberedPage, systemReduce, motionSetting, allPages, animationSetting] = await Promise.all([
      getNotebook(db, id), listEntries(db, id), readSetting(db, `reading:${id}`), AccessibilityInfo.isReduceMotionEnabled(), readSetting(db, 'reduced_motion'), listNotebookPages(db, id), readSetting(db, 'page_animation')
    ]);
    setBook(notebook); setBookLoaded(true); setEntries(allEntries); setGeneralPages(allPages); setReducedMotion(systemReduce || motionSetting === 'true'); setPageAnimation(animationSetting === 'none' || animationSetting === 'slide' ? animationSetting : 'smooth');
    const calculated = allEntries.flatMap((entry) => paginateEntry(entry, Math.max(290, width - 76), Math.max(480, height - 245), notebook?.themeId ?? 'warm', fontScale));
    setPages(calculated);
    let rememberedIndex = Number(rememberedPage ?? 0);
    if (requestedDate) { const requestedIndex = calculated.findIndex((page) => page.entry.date === requestedDate); if (requestedIndex >= 0) rememberedIndex = requestedIndex; }
    if (rememberedPage) {
      try {
        const location = JSON.parse(rememberedPage) as { entryId?: string; segment?: number };
        const matchingPage = calculated.findIndex((page) => page.entry.id === location.entryId && page.segment === location.segment);
        if (matchingPage >= 0) rememberedIndex = matchingPage;
      } catch { /* Keep the numeric page index saved by older app versions. */ }
    }
    const restoreAt = Math.min(calculated.length - 1, Math.max(0, rememberedIndex));
    setPageIndex(calculated.length ? restoreAt : 0);
  }, [db, fontScale, height, id, requestedDate, width]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => {
    if (!book || !pages.length) return;
    const timer = setTimeout(() => {
      const page = pages[pageIndex];
      const location = page ? JSON.stringify({ entryId: page.entry.id, segment: page.segment }) : String(pageIndex);
      void writeSetting(db, `reading:${id}`, location);
    }, 150);
    return () => clearTimeout(timer);
  }, [book, db, id, pageIndex, pages]);

  const onPage = (direction: number) => {
    const next = nextPageIndex(pageIndex, direction < 0 ? -1 : 1, pages.length);
    if (next === pageIndex) { translate.value = withSpring(direction > 0 ? -14 : 14, {}, () => { translate.value = withSpring(0); }); return; }
    setPageIndex(next); translate.value = withSpring(0, { damping: 20, stiffness: 190 }); shade.value = withTiming(0, { duration: 120 });
  };
  const pan = Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-24, 24]).onUpdate((event) => { translate.value = event.translationX; shade.value = Math.min(1, Math.abs(event.translationX) / 260); }).onEnd((event) => {
    if (shouldCommitPageTurn(event.translationX, event.velocityX, width)) {
      const direction = event.translationX < 0 ? 1 : -1;
      if (reducedMotion || pageAnimation === 'none') { runOnJS(onPage)(direction); }
      else { translate.value = withTiming(direction > 0 ? -width : width, { duration: pageAnimation === 'slide' ? 150 : 230 }, () => runOnJS(onPage)(direction)); }
    } else { translate.value = withSpring(0, { damping: 19, stiffness: 180 }); shade.value = withTiming(0, { duration: 160 }); }
  });
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }, { perspective: 900 }, { rotateZ: `${shade.value * (translate.value < 0 ? -0.6 : 0.6)}deg` }, { scaleX: 1 - shade.value * 0.035 }], shadowOpacity: 0.12 + shade.value * 0.25, shadowRadius: 3 + shade.value * 8, elevation: 2 + Math.round(shade.value * 6) }));

  const chooseTheme = async (themeId: ThemeId) => {
    if (!book) return;
    await updateNotebook(db, book.id, { themeId }); setThemePicker(false); await refresh();
  };
  const createPage = () => book?.type === 'general'
    ? router.push({ pathname: '/notebook/[id]/edit', params: { id } })
    : router.push({ pathname: '/(tabs)/journal', params: { notebookId: id, date: localDate() } });
  const totalWords = useMemo(() => entries.reduce((sum, entry) => sum + wordCount(entry.content), 0), [entries]);

  if (!bookLoaded) return <AppScreen title="Дәптер" subtitle="Дәптер ашылып жатыр…" />;
  if (!book) return <AppScreen title="Дәптер табылмады" subtitle="Бұл дәптер өшірілген немесе сілтемесі жарамсыз." right={<TouchableOpacity style={styles.tool} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}><Text style={{ color: colors.accent }}>Артқа</Text></TouchableOpacity>} />;
  if (book.type === 'general' || (requestedPageId && generalPages.some((page) => page.id === requestedPageId))) return <GeneralNotebookReader book={book} pages={generalPages} {...(requestedPageId ? { requestedPageId } : {})} onAdd={createPage} onRefresh={refresh} />;
  if (book.type === 'vocabulary') return <VocabularyNotebookReader book={book} />;
  if (book.type === 'planner') return <PlannerNotebookReader book={book} />;
  return <AppScreen title={book.title} subtitle={`${entries.length} бет • ${totalWords} сөз`} themeId={book.themeId} scroll={false} contentStyle={styles.content} right={<TouchableOpacity style={styles.tool} onPress={() => setThemePicker(true)} accessibilityLabel="Дәптер тақырыбын өзгерту"><Palette size={18} color={colors.ink} /></TouchableOpacity>}>
    <View style={[styles.bookHeader, { backgroundColor: theme.cover }]}><View style={styles.headerSpine} /><Text style={styles.headerOrnament}>{theme.ornament}</Text><View style={{ flex: 1 }}><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookSub}>{theme.name} • жеке дәптер</Text></View>{activePage ? <TouchableOpacity style={styles.newPage} onPress={() => router.push({ pathname: '/(tabs)/journal', params: { notebookId: id, date: activePage.entry.date } })} accessibilityRole="button" accessibilityLabel="Жазбаны өңдеу"><Edit3 size={16} color={theme.cover} /></TouchableOpacity> : null}<TouchableOpacity style={styles.newPage} onPress={createPage} accessibilityRole="button" accessibilityLabel="Жаңа бет қосу"><Plus size={18} color={theme.cover} /></TouchableOpacity></View>
    <View style={styles.readerMeta}><Text style={styles.metaText}>{activePage ? new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${activePage.entry.date}T12:00:00`)) : 'Алғашқы бетті ашыңыз'}</Text><TouchableOpacity style={styles.toc} onPress={() => router.push('/search')}><Search size={15} color={colors.muted} /><Text style={styles.tocText}>Іздеу</Text></TouchableOpacity></View>
    {activePage ? <>
      <View style={styles.pageArea}><View style={styles.shadowPage} /><GestureDetector gesture={pan}><Animated.View style={[styles.page, { backgroundColor: theme.page, borderColor: theme.line }, pageStyle]}>
        <View style={[styles.marginLine, { backgroundColor: theme.accent }]} /><View style={styles.pageTop}><Text style={[styles.pageBrand, { color: theme.muted }]}>L U M I</Text><Text style={[styles.pageCounter, { color: theme.muted }]}>{pageIndex + 1}</Text></View>
        {activePage.segment === 0 && activePage.entry.title ? <Text style={[styles.entryTitle, { color: theme.ink, fontFamily: theme.serif }]}>{activePage.entry.title}</Text> : null}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          {activePage.blocks.map((block) => block.type === 'image' && block.uri ? <Image key={block.id} source={{ uri: mediaUri(block.uri) }} style={styles.readerImage} resizeMode="contain" /> : <FormattedText key={block.id} content={block.type === 'list' ? `• ${block.text ?? ''}` : block.type === 'checklist' ? `${block.checked ? '☑' : '☐'} ${block.text ?? ''}` : block.text ?? ''} style={[styles.readerText, { color: theme.ink, fontFamily: theme.serif }, block.type === 'heading' ? styles.readerHeading : null, block.type === 'quote' ? [styles.readerQuote, { borderColor: theme.accent }] : null, block.type === 'code' ? styles.readerCode : null, block.type === 'list' ? styles.readerList : null, block.type === 'checklist' && block.checked ? { textDecorationLine: 'line-through', opacity: 0.6 } : null]} />)}
        </ScrollView>
        {activePage.segmentCount > 1 ? <Text style={[styles.segmentHint, { color: theme.muted }]}>{activePage.segment + 1} / {activePage.segmentCount} • жалғасы келесі бетте</Text> : null}
        <View style={[styles.pageFoot, { borderColor: theme.line }]}><Text style={[styles.footText, { color: theme.muted }]}>{activePage.entry.mood ?? '✧'}  •  {activePage.entry.tags.join('  ·  ')}</Text><Text style={[styles.footText, { color: theme.muted }]}>{pageIndex + 1}</Text></View>
      </Animated.View></GestureDetector></View>
      <View style={styles.pageControls}><TouchableOpacity onPress={() => onPage(-1)} disabled={pageIndex === 0} style={styles.arrow}><ChevronLeft size={21} color={pageIndex === 0 ? '#D4C9BC' : colors.ink} /></TouchableOpacity><View style={styles.pageProgress}><View style={styles.progressTrack}><View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${((pageIndex + 1) / pages.length) * 100}%` }]} /></View><Text style={styles.pageProgressText}>{pageIndex + 1} / {pages.length} бет</Text></View><TouchableOpacity onPress={() => onPage(1)} disabled={pageIndex === pages.length - 1} style={styles.arrow}><ChevronRight size={21} color={pageIndex === pages.length - 1 ? '#D4C9BC' : colors.ink} /></TouchableOpacity></View>
    </> : <View style={styles.empty}><BookOpen size={37} color={theme.accent} /><Text style={[styles.emptyTitle, { color: theme.ink }]}>Бұл дәптер әлі бос</Text><Text style={[styles.emptyText, { color: theme.muted }]}>Өз ойыңызбен алғашқы бетті толтырыңыз.</Text><TouchableOpacity onPress={createPage} style={[styles.startButton, { backgroundColor: theme.cover }]}><Plus size={17} color="#FFF9F1" /><Text style={styles.startText}>Бірінші бет</Text></TouchableOpacity></View>}
    <Text style={styles.gestureHint}>Бетті келесі бетке сырғытыңыз</Text>
    {themePicker ? <View style={styles.themeShade}><View style={styles.themePanel}><View style={styles.themeHead}><Text style={styles.themeTitle}>Кітап тақырыбы</Text><TouchableOpacity onPress={() => setThemePicker(false)}><Text style={{ color: colors.muted, fontSize: 22 }}>×</Text></TouchableOpacity></View>{themeIds.map((themeId) => { const value = themes[themeId]; return <TouchableOpacity key={themeId} onPress={() => void chooseTheme(themeId)} style={[styles.themeRow, book.themeId === themeId ? { backgroundColor: '#F0E8DC' } : null]}><View style={[styles.themeDot, { backgroundColor: value.cover }]} /><View style={{ flex: 1 }}><Text style={styles.themeRowTitle}>{value.name}</Text><Text style={styles.themeRowSub}>{value.subtitle}</Text></View>{book.themeId === themeId ? <Text style={{ color: colors.accent }}>✓</Text> : null}</TouchableOpacity>; })}</View></View> : null}
  </AppScreen>;
}

function GeneralNotebookReader({ book, pages, requestedPageId, onAdd, onRefresh }: { book: Notebook; pages: NotebookPage[]; requestedPageId?: string; onAdd: () => void; onRefresh: () => Promise<void> }) {
  const db = useSQLiteContext(); const theme = getTheme(book.themeId);
  const [index, setIndex] = useState(0); const [rename, setRename] = useState(false); const [title, setTitle] = useState(''); const [books, setBooks] = useState<Notebook[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  const restoreKey = useRef('');
  const active = pages[index];
  useEffect(() => {
    const key = `${book.id}:${requestedPageId ?? ''}`;
    if (!pages.length || restoreKey.current === key) return;
    restoreKey.current = key;
    setPositionReady(false);
    void (async () => {
      if (requestedPageId) { const found = pages.findIndex((page) => page.id === requestedPageId); if (found >= 0) { setIndex(found); setPositionReady(true); return; } }
      const remembered = Number(await readSetting(db, `reading:${book.id}`) ?? 0); setIndex(Math.min(Math.max(0, remembered), Math.max(0, pages.length - 1))); setPositionReady(true);
    })();
  }, [book.id, db, pages, requestedPageId]);
  useEffect(() => { if (positionReady && pages.length) void writeSetting(db, `reading:${book.id}`, String(index)); }, [book.id, db, index, pages.length, positionReady]);
  const manage = async () => {
    if (!active) return;
    setActionsOpen(true);
  };
  return <AppScreen title={book.title} subtitle={`${pages.length} бет`} themeId={book.themeId} scroll={false} contentStyle={readerStyles.generalReader} right={<TouchableOpacity style={styles.tool} onPress={onAdd} accessibilityLabel="Жаңа бет қосу"><Plus size={19} color={colors.ink} /></TouchableOpacity>}>
    <View style={[styles.bookHeader, { backgroundColor: theme.cover }]}><View style={styles.headerSpine} /><Text style={styles.headerOrnament}>{theme.ornament}</Text><View style={{ flex: 1 }}><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookSub}>{book.type === 'vocabulary' ? 'Тіл үйрену беттері · оқу' : 'Жалпы дәптер · тек оқу'}</Text></View><TouchableOpacity style={styles.newPage} onPress={onAdd} accessibilityRole="button"><Plus size={17} color={theme.cover} /></TouchableOpacity></View>
    {active ? <>
      <View style={styles.readerMeta}><Text style={styles.metaText}>{active.title || `Бет ${index + 1}`}</Text><TouchableOpacity onPress={manage} style={styles.toc}><Text style={styles.tocText}>Бет әрекеттері</Text></TouchableOpacity></View>
      <ScrollView style={readerStyles.generalPageScroll} contentContainerStyle={{ flexGrow: 1 }}><View style={[readerStyles.generalPage, { backgroundColor: theme.page, borderColor: theme.line }]}>
        <View style={styles.pageTop}><Text style={[styles.pageBrand, { color: theme.muted }]}>L U M I</Text><Text style={[styles.pageCounter, { color: theme.muted }]}>{index + 1}</Text></View>
        {active.title ? <Text style={[readerStyles.generalTitle, { color: theme.ink, fontFamily: theme.serif }]}>{active.title}</Text> : null}
        {active.blocks.map((block) => block.type === 'image' && block.uri
          ? <Image key={block.id} source={{ uri: mediaUri(block.uri) }} style={styles.readerImage} resizeMode="contain" />
          : block.type === 'vocabulary_columns'
            ? <VocabularyColumnsBlock key={block.id} block={block} editable={false} />
            : <FormattedText key={block.id} content={block.type === 'list' ? `${block.ordered ? '1.' : '•'} ${block.text ?? ''}` : block.type === 'checklist' ? `${block.checked ? '☑' : '☐'} ${block.text ?? ''}` : block.text ?? ''} style={[styles.readerText, { color: theme.ink, fontFamily: theme.serif }, block.type === 'heading' ? [styles.readerHeading, { fontSize: block.level === 1 ? 24 : block.level === 3 ? 16 : 20 }] : null, block.type === 'quote' ? [styles.readerQuote, { borderColor: theme.accent }] : null, block.type === 'code' ? styles.readerCode : null, block.type === 'checklist' && block.checked ? { textDecorationLine: 'line-through', opacity: 0.6 } : null]} />)}
      </View></ScrollView>
      <View style={readerStyles.generalActions}><TouchableOpacity style={readerStyles.readEdit} onPress={() => router.push({ pathname: '/notebook/[id]/edit', params: { id: book.id, pageId: active.id } })}><Edit3 size={16} color="#FFF9F1" /><Text style={readerStyles.readEditText}>Өңдеу</Text></TouchableOpacity><TouchableOpacity onPress={onAdd} style={readerStyles.readAdd}><Plus size={16} color={colors.accent} /><Text style={readerStyles.readAddText}>Жаңа бет</Text></TouchableOpacity></View>
      <View style={styles.pageControls}><TouchableOpacity onPress={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0} style={styles.arrow}><ChevronLeft size={21} color={index === 0 ? '#D4C9BC' : colors.ink} /></TouchableOpacity><Text style={styles.pageProgressText}>{index + 1} / {pages.length} бет</Text><TouchableOpacity onPress={() => setIndex((value) => Math.min(pages.length - 1, value + 1))} disabled={index >= pages.length - 1} style={styles.arrow}><ChevronRight size={21} color={index >= pages.length - 1 ? '#D4C9BC' : colors.ink} /></TouchableOpacity></View>
    </> : <View style={styles.empty}><BookOpen size={36} color={theme.accent} /><Text style={[styles.emptyTitle, { color: theme.ink }]}>Дәптер әзірге бос</Text><Text style={[styles.emptyText, { color: theme.muted }]}>Алғашқы жазбаңызды еркін жазыңыз.</Text><TouchableOpacity onPress={onAdd} style={[styles.startButton, { backgroundColor: theme.cover }]}><Plus size={17} color="#FFF9F1" /><Text style={styles.startText}>Алғашқы бетті қосу</Text></TouchableOpacity></View>}
    <Modal visible={rename} transparent animationType="fade" onRequestClose={() => setRename(false)}><View style={readerStyles.renameShade}><View style={readerStyles.renamePanel}><Text style={styles.themeTitle}>Бет атауы</Text><TextInput value={title} onChangeText={setTitle} style={readerStyles.renameInput} autoFocus placeholder="Бет атауы" /><View style={readerStyles.renameActions}><TouchableOpacity onPress={() => setRename(false)}><Text style={styles.tocText}>Болдырмау</Text></TouchableOpacity><TouchableOpacity onPress={() => { if (active) void renameNotebookPage(db, active.id, title).then(async () => { setRename(false); await onRefresh(); }); }}><Text style={readerStyles.renameSave}>Сақтау</Text></TouchableOpacity></View></View></View></Modal>
    {books.length ? <View style={readerStyles.moveShade}><View style={readerStyles.movePanel}><Text style={styles.themeTitle}>Қай дәптерге жылжытасыз?</Text>{books.map((item) => <TouchableOpacity key={item.id} style={readerStyles.moveRow} onPress={() => { if (active) void moveNotebookPage(db, active.id, item.id).then(async () => { setBooks([]); setIndex(0); await onRefresh(); }); }}><Text style={styles.themeRowTitle}>{item.title}</Text><Text style={styles.themeRowSub}>{item.type}</Text></TouchableOpacity>)}<TouchableOpacity onPress={() => setBooks([])} style={{ padding: 12 }}><Text style={styles.tocText}>Болдырмау</Text></TouchableOpacity></View></View> : null}
    <LumiActionSheet visible={actionsOpen} title={active?.title || 'Бет әрекеттері'} onClose={() => setActionsOpen(false)} actions={[
      { label: 'Атауын өзгерту', onPress: () => { setActionsOpen(false); if (active) { setTitle(active.title); setRename(true); } } },
      { label: 'Көшірмесін жасау', onPress: () => { setActionsOpen(false); if (active) void duplicateNotebookPage(db, active.id).then(onRefresh); } },
      { label: 'Басқа дәптерге жылжыту', onPress: () => { setActionsOpen(false); void listNotebooks(db).then((items) => setBooks(items.filter((item) => item.id !== book.id))); } },
      { label: 'Бетті өшіру', destructive: true, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } }
    ]} />
    <LumiConfirmDialog visible={confirmDelete} title="Бетті өшіру керек пе?" message="Бұл бет біржола өшіріледі. Дәптердің өзі сақталады." confirmLabel="Бетті өшіру" onClose={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); if (active) void deleteNotebookPage(db, active.id).then(async () => { setIndex(Math.max(0, index - 1)); await onRefresh(); }); }} />
  </AppScreen>;
}

function VocabularyNotebookReader({ book }: { book: Notebook }) {
  const db = useSQLiteContext(); const [words, setWords] = useState<VocabularyWord[]>([]); const [pages, setPages] = useState<NotebookPage[]>([]);
  const refresh = useCallback(async () => { const [items, storedPages] = await Promise.all([listWords(db, '', 'due', book.id), listNotebookPages(db, book.id)]); setWords(items); setPages(storedPages); }, [book.id, db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const openVocabulary = () => router.push({ pathname: '/(tabs)/vocabulary', params: { notebookId: book.id } });
  const addPage = () => router.push({ pathname: '/notebook/[id]/edit', params: { id: book.id } });
  return <AppScreen title={book.title} subtitle={`${words.length} сөз · ${pages.length} бет`} themeId={book.themeId} right={<TouchableOpacity style={styles.tool} onPress={openVocabulary} accessibilityLabel="Сөздік қорын ашу"><Languages size={17} color={colors.ink} /></TouchableOpacity>}>
    <View style={readerStyles.vocabularySectionHeader}><Text style={readerStyles.archiveTitle}>Сөздік қоры · {words.length}</Text><TouchableOpacity onPress={openVocabulary}><Text style={readerStyles.readAddText}>Сөздерді ашу</Text></TouchableOpacity></View>
    <View style={{ gap: 9 }}>{words.map((word) => <View key={word.id} style={vocabularyCardStyle}><View style={readerStyles.translationList}>{(word.translations ?? []).map((item) => <View key={item.id} style={readerStyles.translationRow}><Text style={readerStyles.languageTag}>{item.languageCode.toUpperCase()}</Text><Text style={readerStyles.translationValue}>{item.value}</Text></View>)}</View>{word.example ? <Text style={readerStyles.wordExample}>{word.example}</Text> : null}<Text style={readerStyles.wordStatus}>{word.favorite ? '♥ Таңдаулы · ' : ''}{word.learned ? 'Үйренілген' : `Қайталау: ${word.nextReview}`}</Text><TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/vocabulary', params: { notebookId: book.id, wordId: word.id } })} style={readerStyles.wordEdit}><Text style={readerStyles.readAddText}>Көру және өңдеу</Text></TouchableOpacity></View>)}</View>
    {!words.length ? <Text style={styles.emptyText}>Әзірге сөздік жазбасы жоқ.</Text> : null}
    <View style={readerStyles.vocabularySectionHeader}><Text style={readerStyles.archiveTitle}>Дәптер беттері · {pages.length}</Text><TouchableOpacity onPress={addPage} style={readerStyles.pageAdd}><Plus size={15} color={colors.accent} /><Text style={readerStyles.readAddText}>Жаңа бет</Text></TouchableOpacity></View>
    {pages.map((page, index) => <View key={page.id} style={vocabularyCardStyle}>
      <TouchableOpacity onPress={() => router.push({ pathname: '/notebook/[id]', params: { id: book.id, pageId: page.id } })} accessibilityRole="button" accessibilityLabel={`${page.title || `Бет ${index + 1}`} оқу режимінде ашу`}>
        <Text style={readerStyles.translationValue}>{page.title || `Бет ${index + 1}`}</Text>
        <Text numberOfLines={3} style={readerStyles.wordExample}>{page.content || page.blocks.map((block) => block.text ?? '').join(' ') || 'Бұл бетте мәтіндік блоктар бар.'}</Text>
      </TouchableOpacity>
      <View style={readerStyles.pageActions}>
        <TouchableOpacity onPress={() => router.push({ pathname: '/notebook/[id]', params: { id: book.id, pageId: page.id } })} style={readerStyles.wordEdit}><Text style={readerStyles.readAddText}>Оқу</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push({ pathname: '/notebook/[id]/edit', params: { id: book.id, pageId: page.id } })} style={readerStyles.wordEdit}><Text style={readerStyles.readAddText}>Өңдеу</Text></TouchableOpacity>
      </View>
    </View>)}
    {!pages.length ? <View style={styles.empty}><Text style={styles.emptyText}>Дәптер беттері әзірге жоқ.</Text><TouchableOpacity style={[readerStyles.readAdd, { alignSelf: 'center', marginTop: 10 }]} onPress={addPage}><Plus size={15} color={colors.accent} /><Text style={readerStyles.readAddText}>Алғашқы бетті қосу</Text></TouchableOpacity></View> : null}
  </AppScreen>;
}

function PlannerNotebookReader({ book }: { book: Notebook }) {
  const db = useSQLiteContext(); const [tasks, setTasks] = useState<PlannerTask[]>([]); const [pages, setPages] = useState<NotebookPage[]>([]);
  useEffect(() => { void Promise.all([listTasks(db, localDate(), book.id), listNotebookPages(db, book.id)]).then(([items, storedPages]) => { setTasks(items); setPages(storedPages); }); }, [book.id, db]);
  return <AppScreen title={book.title} subtitle="Бүгінгі жоспар · оқу режимі" themeId={book.themeId} right={<TouchableOpacity style={styles.tool} onPress={() => router.push({ pathname: '/(tabs)/planner', params: { notebookId: book.id } })}><Edit3 size={17} color={colors.ink} /></TouchableOpacity>}>
    <View style={{ gap: 8 }}>{tasks.map((task) => <View key={task.id} style={readerStyles.taskReadRow}><Text style={{ color: task.completed ? colors.green : colors.accent }}>{task.completed ? '✓' : '○'}</Text><Text style={[readerStyles.taskReadText, task.completed ? { textDecorationLine: 'line-through' } : null]}>{task.title}</Text>{task.dueTime ? <Text style={readerStyles.taskReadTime}>{task.dueTime}</Text> : null}</View>)}</View>
    {!tasks.length ? <Text style={styles.emptyText}>Бүгінге жоспарланған тапсырма жоқ.</Text> : null}<TouchableOpacity style={[readerStyles.readEdit, { alignSelf: 'center', marginTop: 18 }]} onPress={() => router.push({ pathname: '/(tabs)/planner', params: { notebookId: book.id } })}><Edit3 size={16} color="#FFF9F1" /><Text style={readerStyles.readEditText}>Жоспарды өңдеу</Text></TouchableOpacity>
    {pages.length ? <><Text style={readerStyles.archiveTitle}>Дәптер беттері</Text>{pages.map((page, index) => <View key={page.id} style={vocabularyCardStyle}><Text style={readerStyles.translationValue}>{page.title || `Бет ${index + 1}`}</Text><Text style={readerStyles.wordExample}>{page.content || page.blocks.map((block) => block.text ?? '').join(' ')}</Text><TouchableOpacity onPress={() => router.push({ pathname: '/notebook/[id]/edit', params: { id: book.id, pageId: page.id } })} style={readerStyles.wordEdit}><Text style={readerStyles.readAddText}>Өңдеу</Text></TouchableOpacity></View>)}</> : null}
  </AppScreen>;
}

const vocabularyCardStyle = { backgroundColor: colors.paper, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 13, marginBottom: 9 } as const;

function FormattedText({ content, style }: { content: string; style: StyleProp<TextStyle> }) {
  const pieces = content.split(/(\*\*[^*]+\*\*|_[^_]+_)/gu);
  return <Text style={style}>{pieces.map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**')) return <Text key={index} style={{ fontWeight: '700' }}>{piece.slice(2, -2)}</Text>;
    if (piece.startsWith('_') && piece.endsWith('_')) return <Text key={index} style={{ fontStyle: 'italic' }}>{piece.slice(1, -1)}</Text>;
    return <Text key={index}>{piece}</Text>;
  })}</Text>;
}

const readerStyles = StyleSheet.create({ generalReader: { paddingHorizontal: 16, paddingBottom: 8 }, generalPageScroll: { flex: 1, marginBottom: 7 }, generalPage: { minHeight: 400, borderWidth: 1, borderRadius: 17, padding: 18 }, generalTitle: { fontSize: 22, fontWeight: '700', marginVertical: 8 }, generalActions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 6 }, readEdit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11 }, readEditText: { color: '#FFF9F1', fontSize: 12, fontWeight: '700' }, readAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1E9DE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }, readAddText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, renameShade: { flex: 1, backgroundColor: '#1E1A1688', justifyContent: 'center', padding: 20 }, renamePanel: { backgroundColor: colors.background, borderRadius: 18, padding: 18, gap: 12 }, renameInput: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 12, color: colors.ink }, renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, paddingTop: 7 }, renameSave: { color: colors.accent, fontWeight: '700' }, moveShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#1E1A1688', justifyContent: 'flex-end' }, movePanel: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '75%' }, moveRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, archiveTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 8 }, vocabularySectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pageAdd: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 10 }, notebookPageCard: { marginBottom: 9 }, pageActions: { flexDirection: 'row', gap: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginTop: 6 }, translationList: { gap: 5 }, translationRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, languageTag: { width: 32, color: colors.muted, fontSize: 9, fontWeight: '700' }, translationValue: { color: colors.ink, fontSize: 15, flex: 1 }, wordExample: { color: colors.muted, fontSize: 12, fontStyle: 'italic', marginTop: 8 }, wordStatus: { color: colors.muted, fontSize: 10, marginTop: 7 }, wordEdit: { alignSelf: 'flex-start', paddingTop: 9 }, taskReadRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.paper, borderRadius: 12, padding: 12 }, taskReadText: { flex: 1, color: colors.ink, fontSize: 14 }, taskReadTime: { color: colors.muted, fontSize: 11 } });

const styles = StyleSheet.create({ content: { paddingHorizontal: 16, paddingBottom: 8 }, tool: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE' }, bookHeader: { height: 80, borderRadius: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' }, headerSpine: { position: 'absolute', left: 12, top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF44' }, headerOrnament: { color: '#EED7A5', fontSize: 25 }, bookTitle: { color: '#FFF9F1', fontFamily: 'serif', fontSize: 19, fontWeight: '700' }, bookSub: { color: '#FFFFFFB3', fontSize: 10, marginTop: 4, letterSpacing: 0.5 }, newPage: { width: 37, height: 37, backgroundColor: '#F6EBDD', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, readerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }, metaText: { color: colors.muted, fontSize: 11, textTransform: 'capitalize' }, toc: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5 }, tocText: { color: colors.muted, fontSize: 11 }, pageArea: { flex: 1, minHeight: 290, marginHorizontal: 4, marginBottom: 8 }, shadowPage: { position: 'absolute', left: 8, right: -3, top: 5, bottom: -2, backgroundColor: '#D4C6B5', borderRadius: 17, transform: [{ rotate: '1deg' }] }, page: { flex: 1, borderWidth: 1, borderRadius: 17, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 11, overflow: 'hidden', shadowColor: '#42362A', shadowOffset: { width: 2, height: 4 }, shadowRadius: 9 }, marginLine: { position: 'absolute', top: 0, bottom: 0, left: 41, width: 1, opacity: 0.3 }, pageTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, pageBrand: { fontSize: 8, letterSpacing: 3, fontWeight: '700' }, pageCounter: { fontSize: 10 }, entryTitle: { fontSize: 21, fontWeight: '700', marginBottom: 11, paddingLeft: 20 }, readerText: { fontSize: 16, lineHeight: 24, marginBottom: 10, paddingLeft: 20 }, readerHeading: { fontSize: 19, fontWeight: '700', marginTop: 4, marginBottom: 8 }, readerQuote: { fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10, marginLeft: 18 }, readerCode: { fontFamily: 'monospace', fontSize: 13, backgroundColor: '#0000000D', padding: 7, borderRadius: 5 }, readerList: { paddingLeft: 29 }, readerImage: { width: '100%', height: 195, marginVertical: 8, borderRadius: 11 }, segmentHint: { fontSize: 9, textAlign: 'right', marginBottom: 5 }, pageFoot: { borderTopWidth: 1, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }, footText: { fontSize: 9 }, pageControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 51 }, arrow: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#EFE7DB', alignItems: 'center', justifyContent: 'center' }, pageProgress: { flex: 1, alignItems: 'center', paddingHorizontal: 23 }, progressTrack: { width: '100%', height: 4, backgroundColor: '#E4D9CC', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4 }, pageProgressText: { color: colors.muted, fontSize: 10, marginTop: 5 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, emptyTitle: { fontFamily: 'serif', fontSize: 20, fontWeight: '700', marginTop: 14 }, emptyText: { color: colors.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }, startButton: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 }, startText: { color: '#FFF9F1', fontWeight: '700', fontSize: 12 }, gestureHint: { color: '#A79B8E', fontSize: 10, textAlign: 'center', paddingBottom: 3 }, themeShade: { position: 'absolute', top: 0, left: -16, right: -16, bottom: 0, backgroundColor: '#1E1A1688', justifyContent: 'flex-end' }, themePanel: { backgroundColor: colors.background, borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 19, paddingBottom: 30 }, themeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }, themeTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700' }, themeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 12 }, themeDot: { width: 30, height: 37, borderRadius: 7 }, themeRowTitle: { color: colors.ink, fontWeight: '700', fontSize: 13 }, themeRowSub: { color: colors.muted, fontSize: 10, marginTop: 2 }
});
