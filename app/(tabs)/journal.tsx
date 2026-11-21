import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputInstance } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ArrowRight, Bold, CalendarDays, CheckSquare, Code2, Heading2, ImagePlus, Italic, List, Quote, Save, Trash2 } from 'lucide-react-native';
import { AppScreen, TextField, colors } from '@/components/ui';
import { deleteEntry, getEntry, listNotebooks, saveEntry } from '@/database/repository';
import { SaveQueue } from '@/services/autosave';
import { withExternalActivity } from '@/services/externalActivity';
import { mediaUri, pruneUnusedMedia, storeImage } from '@/services/media';
import { addLocalDays, localDate } from '@/utils/core';
import { getTheme } from '@/themes/registry';
import type { EntryBlock, ThemeId } from '@/types/models';
import { randomUUID } from 'expo-crypto';

type SavePayload = { notebookId: string; date: string; title: string; content: string; blocks: EntryBlock[]; mood: string | null; tags: string[] };
const moods = ['😊', '😌', '🤔', '😔', '🔥'];
const blockKinds = [
  { type: 'paragraph', label: 'Мәтін', icon: List }, { type: 'list', label: 'Тізім', icon: List }, { type: 'heading', label: 'Тақырып', icon: Heading2 },
  { type: 'quote', label: 'Дәйексөз', icon: Quote }, { type: 'checklist', label: 'Тізім', icon: CheckSquare }, { type: 'code', label: 'Код', icon: Code2 }
] as const;

export default function JournalScreen() {
  const params = useLocalSearchParams<{ date?: string; notebookId?: string }>();
  const initialDate = typeof params.date === 'string' ? params.date : localDate();
  const requestedNotebookId = typeof params.notebookId === 'string' ? params.notebookId : undefined;
  return <JournalEditor key={`${initialDate}:${requestedNotebookId ?? ''}`} initialDate={initialDate} requestedNotebookId={requestedNotebookId} />;
}

function JournalEditor({ initialDate, requestedNotebookId }: { initialDate: string; requestedNotebookId: string | undefined }) {
  const db = useSQLiteContext();
  const [date, setDate] = useState(initialDate);
  const [notebookId, setNotebookId] = useState('diary');
  const [themeId, setThemeId] = useState<ThemeId>('classic');
  const [blocks, setBlocks] = useState<EntryBlock[]>([{ id: randomUUID(), type: 'paragraph', text: '' }]);
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const queueRef = useRef<SaveQueue<SavePayload> | null>(null);
  const loadSequence = useRef(0);
  const latestPayload = useRef<SavePayload | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Record<string, TextInputInstance | null>>({});
  const selectionRef = useRef<Record<string, { start: number; end: number }>>({});
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('kk-KZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`)), [date]);

  if (queueRef.current === null) queueRef.current = new SaveQueue(async (value) => {
    const hasContent = value.title.trim() || value.tags.length || value.blocks.some((block) => block.type === 'image' || Boolean(block.text?.trim()));
    if (!hasContent && !(await getEntry(db, value.notebookId, value.date))) { setSaveState('Жаңа жазба'); return; }
    const id = await saveEntry(db, value, entryId ?? undefined);
    try { await pruneUnusedMedia(db); } catch { /* A media cleanup failure must not invalidate a saved journal entry. */ }
    setEntryId(id); setSaveState('Сақталды');
  });
  const reportSaveFailure = useCallback((error: unknown) => setSaveState(error instanceof Error ? `Сақтау қатесі: ${error.message}` : 'Сақтау қатесі'), []);

  const load = useCallback(async (newDate: string) => {
    const requestId = ++loadSequence.current;
    const books = await listNotebooks(db);
    if (requestId !== loadSequence.current) return;
    const chosen = books.find((item) => item.id === requestedNotebookId) ?? books.find((item) => item.id === 'diary') ?? books[0];
    if (!chosen) { setLoaded(true); return; }
    setNotebookId(chosen.id);
    setThemeId(chosen.themeId);
    const entry = await getEntry(db, chosen.id, newDate);
    if (requestId !== loadSequence.current) return;
    setTitle(entry?.title ?? ''); setMood(entry?.mood ?? null); setTagsText(entry?.tags.join(', ') ?? '');
    setBlocks(entry?.blocks.length ? entry.blocks : [{ id: randomUUID(), type: 'paragraph', text: '' }]);
    setEntryId(entry?.id ?? null); setLoaded(true); setSaveState(entry ? 'Сақталды' : 'Жаңа жазба');
  }, [db, requestedNotebookId]);

  // Rehydrate the selected entry from SQLite whenever the user changes journal dates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(date); return () => { loadSequence.current += 1; }; }, [date, load]);
  useEffect(() => {
    if (!loaded) return;
    const payload: SavePayload = { notebookId, date, title, content: blocks.map((item) => item.text ?? '').join('\n'), blocks, mood, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean) };
    latestPayload.current = payload;
    const timer = setTimeout(() => {
      saveTimerRef.current = null;
      setSaveState('Сақталып жатыр…');
      void queueRef.current?.enqueue(payload).catch(reportSaveFailure);
    }, 650);
    saveTimerRef.current = timer;
    return () => { clearTimeout(timer); if (saveTimerRef.current === timer) saveTimerRef.current = null; };
  }, [loaded, notebookId, date, title, blocks, mood, tagsText, reportSaveFailure]);
  const flushLatest = useCallback(async () => {
    if (latestPayload.current) await queueRef.current?.enqueue(latestPayload.current);
    await queueRef.current?.flush();
  }, []);
  useFocusEffect(useCallback(() => () => { void flushLatest().catch(reportSaveFailure); }, [flushLatest, reportSaveFailure]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') void flushLatest().catch(reportSaveFailure); });
    return () => sub.remove();
  }, [flushLatest, reportSaveFailure]);

  const changeDate = async (next: string) => {
    try { await flushLatest(); setLoaded(false); setDate(next); }
    catch (error) { reportSaveFailure(error); Alert.alert('Жазба сақталмады', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
  };
  const addBlock = (type: EntryBlock['type']) => setBlocks((items) => [...items, { id: randomUUID(), type, text: '', ...(type === 'checklist' ? { checked: false } : {}) }]);
  const updateBlock = (id: string, text: string) => setBlocks((items) => items.map((block) => block.id === id ? { ...block, text } : block));
  const deleteBlock = (id: string) => setBlocks((items) => items.length > 1 ? items.filter((block) => block.id !== id) : [{ id: randomUUID(), type: 'paragraph', text: '' }]);

  const addImage = async () => {
    const picked = await withExternalActivity(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 }));
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    try { const relativePath = await storeImage(asset.uri); setBlocks((items) => [...items, { id: randomUUID(), type: 'image', uri: relativePath }]); }
    catch (error) { Alert.alert('Сурет қосылмады', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
  };

  const formatSelection = (block: EntryBlock, marker: string) => {
    const text = block.text ?? ''; const selection = selectionRef.current[block.id] ?? { start: text.length, end: text.length };
    const start = Math.min(selection.start, selection.end); const end = Math.max(selection.start, selection.end);
    const selected = text.slice(start, end);
    const replacement = selected ? `${marker}${selected}${marker}` : `${marker}${marker}`;
    const next = text.slice(0, start) + replacement + text.slice(end);
    updateBlock(block.id, next);
    requestAnimationFrame(() => inputRefs.current[block.id]?.setNativeProps({ selection: selected ? { start, end: start + replacement.length } : { start: start + marker.length, end: start + marker.length } }));
  };

  const removeEntry = () => {
    const clearDraft = () => {
      const blank: EntryBlock = { id: randomUUID(), type: 'paragraph', text: '' };
      setEntryId(null); setTitle(''); setBlocks([blank]); setMood(null); setTagsText(''); setSaveState('Жаңа жазба');
      latestPayload.current = { notebookId, date, title: '', content: '', blocks: [blank], mood: null, tags: [] };
    };
    if (!entryId) { clearDraft(); return; }
    Alert.alert('Жазбаны өшіру керек пе?', 'Бұл әрекетті қайтару мүмкін емес.', [{ text: 'Болдырмау', style: 'cancel' }, { text: 'Өшіру', style: 'destructive', onPress: () => { void (async () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      try {
        await flushLatest();
        await deleteEntry(db, entryId);
        try { await pruneUnusedMedia(db); } catch { /* Removing the entry already committed; stale files can be cleaned later. */ }
        clearDraft();
      } catch (error) {
        Alert.alert('Жазба өшірілмеді', error instanceof Error ? error.message : 'Қайта көріңіз.');
      }
    })(); } }]);
  };

  const theme = getTheme(themeId);
  return <AppScreen title="Күнделік" subtitle={saveState} themeId={themeId} right={<TouchableOpacity style={styles.iconButton} onPress={() => router.push('/calendar')}><CalendarDays size={19} color={colors.ink} /></TouchableOpacity>} scroll={false} contentStyle={{ paddingHorizontal: 15, paddingBottom: 0 }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={8}>
      <View style={styles.dateBar}>
        <TouchableOpacity onPress={() => void changeDate(addLocalDays(date, -1))} style={styles.dateArrow}><ArrowLeft size={18} color={colors.ink} /></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/calendar')} style={styles.dateCenter}><Text style={styles.dateText}>{dateLabel}</Text><Text style={styles.dateSub}>{date === localDate() ? 'Бүгінгі бет' : 'Күнді ауыстыру үшін күнтізбені ашыңыз'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => void changeDate(addLocalDays(date, 1))} style={styles.dateArrow} accessibilityLabel="Келесі күн"><ArrowRight size={18} color={colors.ink} /></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={[styles.paper, { backgroundColor: theme.page, borderColor: theme.line }]}><View style={styles.paperTop}><Text style={[styles.paperBrand, { color: theme.muted }]}>L U M I</Text><Text style={[styles.pageNo, { color: theme.accent }]}>✧</Text></View>
          <TextInput value={title} onChangeText={setTitle} placeholder="Бүгінгі ойыңызға ат беріңіз" placeholderTextColor={theme.muted} style={[styles.titleInput, { color: theme.ink, fontFamily: theme.serif }]} maxLength={120} accessibilityLabel="Жазба тақырыбы" />
          <View style={[styles.rule, { backgroundColor: theme.line }]} />
          {!loaded ? <Text style={{ color: theme.muted, paddingVertical: 28 }}>Бет ашылып жатыр…</Text> : blocks.map((block) => <View key={block.id} style={[styles.block, block.type === 'quote' ? [styles.quoteBlock, { borderLeftColor: theme.accent }] : null, block.type === 'code' ? [styles.codeBlock, { backgroundColor: theme.line }] : null]}>
            {block.type === 'image' && block.uri ? <View style={styles.imageWrap}><Image source={{ uri: mediaUri(block.uri) }} style={styles.entryImage} resizeMode="cover" /><TouchableOpacity style={styles.imageRemove} onPress={() => deleteBlock(block.id)} accessibilityLabel="Суретті өшіру"><Trash2 size={15} color="#FFF" /></TouchableOpacity></View> : <View style={styles.textBlockRow}>
              {block.type === 'checklist' ? <TouchableOpacity onPress={() => setBlocks((items) => items.map((b) => b.id === block.id ? { ...b, checked: !b.checked } : b))} style={[styles.checkbox, block.checked ? styles.checked : null]}><Text style={{ color: '#FFF', fontSize: 11 }}>{block.checked ? '✓' : ''}</Text></TouchableOpacity> : null}
              <TextInput ref={(ref) => { inputRefs.current[block.id] = ref; }} value={block.text ?? ''} onChangeText={(text) => updateBlock(block.id, text)} onSelectionChange={(e) => { selectionRef.current[block.id] = e.nativeEvent.selection; }} placeholder={block.type === 'heading' ? 'Бөлім атауы' : block.type === 'quote' ? 'Есте қалсын деген сөз…' : block.type === 'code' ? 'Код үзіндісі…' : block.type === 'checklist' ? 'Тапсырма…' : block.type === 'list' ? 'Тізім тармағы…' : 'Ойыңызды осы жерге жазыңыз…'} placeholderTextColor={theme.muted} multiline style={[styles.bodyInput, block.type === 'heading' ? styles.headingInput : null, block.type === 'quote' ? styles.quoteInput : null, block.type === 'code' ? styles.codeInput : null, block.type === 'list' ? styles.listInput : null, { color: block.checked ? theme.muted : theme.ink }]} accessibilityLabel={`${block.type} мәтіні`} />
              <TouchableOpacity onPress={() => deleteBlock(block.id)} style={styles.removeBlock} accessibilityLabel="Блокты өшіру"><Text style={{ color: '#B7AA9A', fontSize: 18 }}>×</Text></TouchableOpacity>
            </View>}
            {['paragraph', 'list', 'checklist', 'quote'].includes(block.type) && block.type !== 'checklist' ? <View style={styles.formatRow}><TouchableOpacity onPress={() => formatSelection(block, '**')}><Bold size={14} color={colors.muted} /></TouchableOpacity><TouchableOpacity onPress={() => formatSelection(block, '_')}><Italic size={14} color={colors.muted} /></TouchableOpacity><Text style={styles.formatHint}>Белгіленген мәтінді пішімдеу</Text></View> : null}
          </View>)}
          <TouchableOpacity onPress={addImage} style={styles.addImage}><ImagePlus size={17} color={colors.accent} /><Text style={styles.addImageText}>Сурет қосу</Text></TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.blockToolbar}>{blockKinds.map((item) => { const Icon = item.icon; return <TouchableOpacity key={item.type} style={styles.toolChip} onPress={() => addBlock(item.type)}><Icon size={14} color={colors.accent} /><Text style={styles.toolText}>{item.label}</Text></TouchableOpacity>; })}</ScrollView>
          <View style={styles.moodRow}><Text style={styles.metaLabel}>Көңіл күй</Text>{moods.map((item) => <TouchableOpacity key={item} onPress={() => setMood((current) => current === item ? null : item)} style={[styles.mood, mood === item ? styles.moodSelected : null]}><Text style={{ fontSize: 18 }}>{item}</Text></TouchableOpacity>)}</View>
          <TextField label="Белгілер (үтірмен бөліңіз)" value={tagsText} onChangeText={setTagsText} placeholder="саяхат, ой, отбасы" containerStyle={{ marginTop: 18 }} autoCapitalize="none" />
          <View style={styles.saveRow}><Text style={styles.autosave}><Save size={12} color={colors.green} />  Автоматты сақтау қосулы</Text>{entryId ? <TouchableOpacity onPress={removeEntry} accessibilityLabel="Жазбаны өшіру"><Trash2 size={17} color={colors.red} /></TouchableOpacity> : null}</View>
        </View>
        <Text style={styles.bottomHint}>Күндер өтеді, ал ойлар осы жерде қалады.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </AppScreen>;
}

const styles = StyleSheet.create({ iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE' }, dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }, dateArrow: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EFE7DB', alignItems: 'center', justifyContent: 'center' }, dateCenter: { alignItems: 'center', maxWidth: '74%' }, dateText: { color: colors.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }, dateSub: { color: colors.muted, fontSize: 10, marginTop: 3, textTransform: 'capitalize' }, page: { paddingBottom: 22 }, paper: { minHeight: 500, backgroundColor: '#FFFCF7', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#EEE5D9', shadowColor: '#76604C', shadowOpacity: 0.09, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, paperTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, paperBrand: { color: '#B9A58E', fontSize: 9, letterSpacing: 3, fontWeight: '700' }, pageNo: { color: '#C2A76F', fontSize: 17 }, titleInput: { fontFamily: 'serif', fontSize: 23, color: colors.ink, paddingVertical: 16, fontWeight: '700' }, rule: { height: 1, backgroundColor: '#EAE0D3', marginBottom: 10 }, block: { marginBottom: 11 }, textBlockRow: { flexDirection: 'row', alignItems: 'flex-start' }, bodyInput: { minHeight: 74, flex: 1, color: '#483D34', fontSize: 16, lineHeight: 25, paddingHorizontal: 1, paddingVertical: 8, textAlignVertical: 'top' }, headingInput: { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: colors.ink, minHeight: 52 }, quoteBlock: { borderLeftWidth: 3, borderLeftColor: '#C4A374', paddingLeft: 12 }, quoteInput: { fontFamily: 'serif', fontStyle: 'italic', color: '#77624D' }, codeBlock: { backgroundColor: '#F3EFE9', borderRadius: 11, paddingHorizontal: 10 }, codeInput: { fontFamily: 'monospace', fontSize: 13 }, listInput: { paddingLeft: 10 }, checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.4, borderColor: '#C3B39F', marginTop: 13, marginRight: 9, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.green, borderColor: colors.green }, removeBlock: { paddingLeft: 5, paddingTop: 4 }, formatRow: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingLeft: 3, paddingTop: 4 }, formatHint: { color: '#B0A394', fontSize: 10 }, imageWrap: { borderRadius: 13, overflow: 'hidden', height: 190, marginVertical: 3 }, entryImage: { width: '100%', height: '100%' }, imageRemove: { position: 'absolute', top: 9, right: 9, width: 30, height: 30, borderRadius: 10, backgroundColor: '#372D28B0', alignItems: 'center', justifyContent: 'center' }, addImage: { flexDirection: 'row', alignItems: 'center', gap: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCCAB4', borderRadius: 12, padding: 11, justifyContent: 'center', marginTop: 8 }, addImageText: { color: colors.accent, fontWeight: '700', fontSize: 12 }, blockToolbar: { flexDirection: 'row', gap: 7, paddingVertical: 11 }, toolChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F3EBE1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }, toolText: { fontSize: 11, color: colors.ink, fontWeight: '600' }, moodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15 }, metaLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginRight: 'auto' }, mood: { padding: 5, borderRadius: 11 }, moodSelected: { backgroundColor: '#F0E5D5', borderWidth: 1, borderColor: '#D5B889' }, saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }, autosave: { color: colors.green, fontSize: 11, flexDirection: 'row', alignItems: 'center' }, bottomHint: { color: '#9C9084', fontFamily: 'serif', fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 14 }
});
