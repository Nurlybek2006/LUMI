import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BookOpen, ChevronLeft, ChevronRight, Palette, Plus, Search } from 'lucide-react-native';
import { AppScreen, colors } from '@/components/ui';
import { getNotebook, listEntries, updateNotebook } from '@/database/repository';
import { readSetting, writeSetting } from '@/database/settings';
import { getTheme, themes, themeIds } from '@/themes/registry';
import { mediaUri } from '@/services/media';
import { paginateEntry, type RenderedBookPage } from '@/utils/pagination';
import { localDate, wordCount } from '@/utils/core';
import type { Entry, Notebook, ThemeId } from '@/types/models';

export default function NotebookReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext(); const { width, height } = useWindowDimensions();
  const [book, setBook] = useState<Notebook | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pages, setPages] = useState<RenderedBookPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [themePicker, setThemePicker] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const translate = useSharedValue(0); const shade = useSharedValue(0);
  const activePage = pages[pageIndex]; const theme = getTheme(book?.themeId ?? 'warm');

  const refresh = useCallback(async () => {
    const [notebook, allEntries, rememberedPage, systemReduce, motionSetting] = await Promise.all([
      getNotebook(db, id), listEntries(db, id), readSetting(db, `reading:${id}`), AccessibilityInfo.isReduceMotionEnabled(), readSetting(db, 'reduced_motion')
    ]);
    setBook(notebook); setEntries(allEntries); setReducedMotion(systemReduce || motionSetting === 'true');
    const calculated = allEntries.flatMap((entry) => paginateEntry(entry, Math.max(290, width - 76), Math.max(480, height - 245), notebook?.themeId ?? 'warm'));
    setPages(calculated);
    const restoreAt = Math.min(calculated.length - 1, Math.max(0, Number(rememberedPage ?? 0)));
    setPageIndex(calculated.length ? restoreAt : 0);
  }, [db, height, id, width]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => {
    if (!book || !pages.length) return;
    const timer = setTimeout(() => void writeSetting(db, `reading:${id}`, String(pageIndex)), 150);
    return () => clearTimeout(timer);
  }, [book, db, id, pageIndex, pages.length]);

  const onPage = (direction: number) => {
    const next = Math.min(pages.length - 1, Math.max(0, pageIndex + direction));
    if (next === pageIndex) { translate.value = withSpring(direction > 0 ? -14 : 14, {}, () => { translate.value = withSpring(0); }); return; }
    setPageIndex(next);
  };
  const pan = Gesture.Pan().onUpdate((event) => { translate.value = event.translationX * 0.22; shade.value = Math.min(1, Math.abs(event.translationX) / 240); }).onEnd((event) => {
    if (Math.abs(event.translationX) > 70) { const direction = event.translationX < 0 ? 1 : -1; translate.value = withTiming(direction > 0 ? -38 : 38, { duration: reducedMotion ? 0 : 110 }, () => runOnJS(onPage)(direction)); }
    else translate.value = withSpring(0);
    shade.value = withTiming(0, { duration: reducedMotion ? 0 : 150 });
  });
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }], shadowOpacity: 0.12 + shade.value * 0.22, elevation: 2 + Math.round(shade.value * 6) }));

  const chooseTheme = async (themeId: ThemeId) => {
    if (!book) return;
    await updateNotebook(db, book.id, { themeId }); setThemePicker(false); await refresh();
  };
  const createPage = () => router.push({ pathname: '/(tabs)/journal', params: { notebookId: id, date: localDate() } });
  const totalWords = useMemo(() => entries.reduce((sum, entry) => sum + wordCount(entry.content), 0), [entries]);

  if (!book) return <AppScreen title="Дәптер" subtitle="Дәптер табылмады" />;
  return <AppScreen title={book.title} subtitle={`${entries.length} бет • ${totalWords} сөз`} themeId={book.themeId} scroll={false} contentStyle={styles.content} right={<TouchableOpacity style={styles.tool} onPress={() => setThemePicker(true)} accessibilityLabel="Дәптер тақырыбын өзгерту"><Palette size={18} color={colors.ink} /></TouchableOpacity>}>
    <View style={[styles.bookHeader, { backgroundColor: theme.cover }]}><View style={styles.headerSpine} /><Text style={styles.headerOrnament}>{theme.ornament}</Text><View style={{ flex: 1 }}><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookSub}>{theme.name} • жеке дәптер</Text></View><TouchableOpacity style={styles.newPage} onPress={createPage} accessibilityRole="button" accessibilityLabel="Жаңа бет қосу"><Plus size={18} color={theme.cover} /></TouchableOpacity></View>
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

function FormattedText({ content, style }: { content: string; style: StyleProp<TextStyle> }) {
  const pieces = content.split(/(\*\*[^*]+\*\*|_[^_]+_)/gu);
  return <Text style={style}>{pieces.map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**')) return <Text key={index} style={{ fontWeight: '700' }}>{piece.slice(2, -2)}</Text>;
    if (piece.startsWith('_') && piece.endsWith('_')) return <Text key={index} style={{ fontStyle: 'italic' }}>{piece.slice(1, -1)}</Text>;
    return <Text key={index}>{piece}</Text>;
  })}</Text>;
}

const styles = StyleSheet.create({ content: { paddingHorizontal: 16, paddingBottom: 8 }, tool: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE' }, bookHeader: { height: 80, borderRadius: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' }, headerSpine: { position: 'absolute', left: 12, top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF44' }, headerOrnament: { color: '#EED7A5', fontSize: 25 }, bookTitle: { color: '#FFF9F1', fontFamily: 'serif', fontSize: 19, fontWeight: '700' }, bookSub: { color: '#FFFFFFB3', fontSize: 10, marginTop: 4, letterSpacing: 0.5 }, newPage: { width: 37, height: 37, backgroundColor: '#F6EBDD', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, readerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }, metaText: { color: colors.muted, fontSize: 11, textTransform: 'capitalize' }, toc: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5 }, tocText: { color: colors.muted, fontSize: 11 }, pageArea: { flex: 1, minHeight: 290, marginHorizontal: 4, marginBottom: 8 }, shadowPage: { position: 'absolute', left: 8, right: -3, top: 5, bottom: -2, backgroundColor: '#D4C6B5', borderRadius: 17, transform: [{ rotate: '1deg' }] }, page: { flex: 1, borderWidth: 1, borderRadius: 17, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 11, overflow: 'hidden', shadowColor: '#42362A', shadowOffset: { width: 2, height: 4 }, shadowRadius: 9 }, marginLine: { position: 'absolute', top: 0, bottom: 0, left: 41, width: 1, opacity: 0.3 }, pageTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, pageBrand: { fontSize: 8, letterSpacing: 3, fontWeight: '700' }, pageCounter: { fontSize: 10 }, entryTitle: { fontSize: 21, fontWeight: '700', marginBottom: 11, paddingLeft: 20 }, readerText: { fontSize: 16, lineHeight: 24, marginBottom: 10, paddingLeft: 20 }, readerHeading: { fontSize: 19, fontWeight: '700', marginTop: 4, marginBottom: 8 }, readerQuote: { fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10, marginLeft: 18 }, readerCode: { fontFamily: 'monospace', fontSize: 13, backgroundColor: '#0000000D', padding: 7, borderRadius: 5 }, readerList: { paddingLeft: 29 }, readerImage: { width: '100%', height: 195, marginVertical: 8, borderRadius: 11 }, segmentHint: { fontSize: 9, textAlign: 'right', marginBottom: 5 }, pageFoot: { borderTopWidth: 1, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }, footText: { fontSize: 9 }, pageControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 51 }, arrow: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#EFE7DB', alignItems: 'center', justifyContent: 'center' }, pageProgress: { flex: 1, alignItems: 'center', paddingHorizontal: 23 }, progressTrack: { width: '100%', height: 4, backgroundColor: '#E4D9CC', borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4 }, pageProgressText: { color: colors.muted, fontSize: 10, marginTop: 5 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 }, emptyTitle: { fontFamily: 'serif', fontSize: 20, fontWeight: '700', marginTop: 14 }, emptyText: { color: colors.muted, fontSize: 13, marginTop: 6, textAlign: 'center' }, startButton: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 }, startText: { color: '#FFF9F1', fontWeight: '700', fontSize: 12 }, gestureHint: { color: '#A79B8E', fontSize: 10, textAlign: 'center', paddingBottom: 3 }, themeShade: { position: 'absolute', top: 0, left: -16, right: -16, bottom: 0, backgroundColor: '#1E1A1688', justifyContent: 'flex-end' }, themePanel: { backgroundColor: colors.background, borderTopLeftRadius: 23, borderTopRightRadius: 23, padding: 19, paddingBottom: 30 }, themeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }, themeTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700' }, themeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 12 }, themeDot: { width: 30, height: 37, borderRadius: 7 }, themeRowTitle: { color: colors.ink, fontWeight: '700', fontSize: 13 }, themeRowSub: { color: colors.muted, fontSize: 10, marginTop: 2 }
});
