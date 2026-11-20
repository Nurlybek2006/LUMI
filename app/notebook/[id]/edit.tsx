import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputInstance } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { ArrowDown, ArrowUp, Bold, CheckSquare, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Quote, Redo2, Save, Trash2, Undo2 } from 'lucide-react-native';
import { AppScreen, colors } from '@/components/ui';
import { getNotebook, getNotebookPage, saveNotebookPage } from '@/database/repository';
import { SaveQueue } from '@/services/autosave';
import { mediaUri, pruneUnusedMedia, storeImage } from '@/services/media';
import { getTheme } from '@/themes/registry';
import { VocabularyColumnsBlock } from '@/components/VocabularyColumnsBlock';
import type { EntryBlock, Notebook } from '@/types/models';
import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';

type Payload = { notebookId: string; title: string; blocks: EntryBlock[]; content: string };
const blankBlock = (): EntryBlock => ({ id: randomUUID(), type: 'paragraph', text: '' });

export default function GeneralNoteEditor() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId?: string }>();
  const db = useSQLiteContext();
  const [book, setBook] = useState<Notebook | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<EntryBlock[]>([blankBlock()]);
  const [loaded, setLoaded] = useState(false);
  const [documentId, setDocumentId] = useState(pageId ?? '');
  const [saveState, setSaveState] = useState('Өзгеріс сақталды');
  const [undoItems, setUndoItems] = useState<EntryBlock[][]>([]);
  const [redoItems, setRedoItems] = useState<EntryBlock[][]>([]);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const blockRef = useRef(blocks); const historyLock = useRef(false);
  const latest = useRef<Payload | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef<Record<string, TextInputInstance | null>>({}); const selections = useRef<Record<string, { start: number; end: number }>>({});
  const queue = useMemo(() => {
    const activePageId = documentId;
    const hasExistingPage = Boolean(pageId);
    return new SaveQueue<Payload>(async (payload) => {
    const hasText = payload.title.trim() || payload.blocks.some((block) => block.type === 'image' || block.type === 'vocabulary_columns' || Boolean(block.text?.trim()));
    if (!hasText && !hasExistingPage) { setSaveState('Жаңа бет'); return; }
    await saveNotebookPage(db, payload, activePageId); setSaveState('Сақталды');
    try { await pruneUnusedMedia(db); } catch { /* Сақталған бетке тазалау қатесі әсер етпейді. */ }
    });
  }, [db, documentId, pageId]);

  const flush = useCallback(async () => { if (latest.current) await queue.enqueue(latest.current); await queue.flush(); }, [queue]);
  const report = useCallback((error: unknown) => { setSaveState(error instanceof Error ? `Сақтау қатесі: ${error.message}` : 'Сақтау қатесі'); }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const [notebook, page] = await Promise.all([getNotebook(db, id), pageId ? getNotebookPage(db, pageId) : Promise.resolve(null)]);
      if (!active) return;
      setBook(notebook); setTitle(page?.title ?? '');
      const next = page?.blocks.length ? page.blocks : [blankBlock()]; setBlocks(next); blockRef.current = next;
      setDocumentId(page?.id ?? pageId ?? randomUUID());
      setLoaded(true);
    })();
    return () => { active = false; void flush().catch(report); };
  }, [db, flush, id, pageId, report]));

  useEffect(() => { const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') void flush().catch(report); }); return () => listener.remove(); }, [flush, report]);
  useEffect(() => {
    if (!loaded) return;
    const payload: Payload = { notebookId: id, title, blocks, content: blocks.map((block) => block.text ?? '').join('\n\n') };
    latest.current = payload;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; setSaveState('Сақталып жатыр…'); void queue.enqueue(payload).catch(report); }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [blocks, id, loaded, queue, report, title]);

  const changeBlocks = (update: (current: EntryBlock[]) => EntryBlock[]) => {
    setUndoItems((items) => [...items.slice(-49), blockRef.current.map((block) => ({ ...block }))]); setRedoItems([]);
    const next = update(blockRef.current); blockRef.current = next; setBlocks(next);
  };
  const changeTitle = (value: string) => setTitle(value);
  const setText = (blockId: string, text: string) => {
    if (!historyLock.current) { setUndoItems((items) => [...items.slice(-49), blockRef.current.map((block) => ({ ...block }))]); setRedoItems([]); historyLock.current = true; setTimeout(() => { historyLock.current = false; }, 700); }
    const next = blockRef.current.map((block) => block.id === blockId ? { ...block, text } : block); blockRef.current = next; setBlocks(next);
  };
  const add = (type: EntryBlock['type'], level?: 1 | 2 | 3, ordered?: boolean) => {
    const block: EntryBlock = { id: randomUUID(), type, ...(type !== 'image' ? { text: '' } : {}), ...(type === 'checklist' ? { checked: false } : {}), ...(type === 'heading' && level ? { level } : {}), ...(type === 'list' && ordered !== undefined ? { ordered } : {}), ...(type === 'vocabulary_columns' ? { columns: [{ languageCode: 'kk', title: 'Қазақша', cells: [''] }, { languageCode: 'ru', title: 'Русский', cells: [''] }, { languageCode: 'en', title: 'English', cells: [''] }] } : {}) };
    changeBlocks((current) => [...current, block]);
    if (type !== 'image' && type !== 'vocabulary_columns') requestAnimationFrame(() => inputs.current[block.id]?.focus());
  };
  const move = (index: number, direction: -1 | 1) => changeBlocks((current) => { const next = [...current]; const destination = index + direction; if (destination < 0 || destination >= next.length) return current; [next[index], next[destination]] = [next[destination]!, next[index]!]; return next; });
  const remove = (blockId: string) => changeBlocks((current) => current.length > 1 ? current.filter((block) => block.id !== blockId) : [blankBlock()]);
  const history = (direction: 'undo' | 'redo') => {
    const source = direction === 'undo' ? undoItems : redoItems; if (!source.length) return;
    const target = source[source.length - 1]!; const current = blockRef.current.map((block) => ({ ...block }));
    if (direction === 'undo') { setUndoItems(source.slice(0, -1)); setRedoItems((items) => [...items.slice(-49), current]); }
    else { setRedoItems(source.slice(0, -1)); setUndoItems((items) => [...items.slice(-49), current]); }
    blockRef.current = target; setBlocks(target);
  };
  const format = (block: EntryBlock, marker: '**' | '_') => {
    const text = block.text ?? ''; const selection = selections.current[block.id] ?? { start: text.length, end: text.length };
    const start = Math.min(selection.start, selection.end); const end = Math.max(selection.start, selection.end); const selected = text.slice(start, end);
    const replacement = selected ? `${marker}${selected}${marker}` : `${marker}${marker}`;
    setText(block.id, text.slice(0, start) + replacement + text.slice(end));
    requestAnimationFrame(() => inputs.current[block.id]?.setNativeProps({ selection: selected ? { start, end: start + replacement.length } : { start: start + marker.length, end: start + marker.length } }));
  };
  const addImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    try { const uri = await storeImage(result.assets[0].uri); changeBlocks((current) => { const image: EntryBlock = { id: randomUUID(), type: 'image', uri }; const index = current.findIndex((block) => block.id === focusedBlockId); return index < 0 ? [...current, image] : [...current.slice(0, index + 1), image, ...current.slice(index + 1)]; }); }
    catch (error) { Alert.alert('Сурет қосылмады', error instanceof Error ? error.message : 'Қайталап көріңіз.'); }
  };
  const done = async () => { try { if (timer.current) { clearTimeout(timer.current); timer.current = null; } await flush(); router.back(); } catch (error) { report(error); Alert.alert('Өзгеріс сақталмады', error instanceof Error ? error.message : 'Қайталап көріңіз.'); } };
  const theme = getTheme(book?.themeId ?? 'warm');
  const activeBlock = blocks.find((block) => block.id === focusedBlockId);
  return <AppScreen title="Жазба редакторы" subtitle={saveState} themeId={book?.themeId ?? 'warm'} scroll={false} contentStyle={{ paddingHorizontal: 13, paddingBottom: 0 }} right={<TouchableOpacity onPress={() => void done()} style={styles.done}><Save size={16} color="#FFF9F1" /><Text style={styles.doneText}>Дайын</Text></TouchableOpacity>}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={8}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => history('undo')} disabled={!undoItems.length} style={styles.tool}><Undo2 size={17} color={undoItems.length ? colors.accent : '#C8BFB5'} /></TouchableOpacity>
        <TouchableOpacity onPress={() => history('redo')} disabled={!redoItems.length} style={styles.tool}><Redo2 size={17} color={redoItems.length ? colors.accent : '#C8BFB5'} /></TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tools}>
          <Tool label="Мәтін" active={activeBlock?.type === 'paragraph'} icon={<List size={15} color={colors.accent} />} onPress={() => add('paragraph')} />
          <Tool label="H1" active={activeBlock?.type === 'heading' && activeBlock.level === 1} icon={<Heading1 size={15} color={colors.accent} />} onPress={() => add('heading', 1)} />
          <Tool label="H2" active={activeBlock?.type === 'heading' && activeBlock.level === 2} icon={<Heading2 size={15} color={colors.accent} />} onPress={() => add('heading', 2)} />
          <Tool label="H3" active={activeBlock?.type === 'heading' && activeBlock.level === 3} icon={<Heading3 size={15} color={colors.accent} />} onPress={() => add('heading', 3)} />
          <Tool label="Қалың" active={activeBlock?.text?.includes('**') ?? false} icon={<Bold size={15} color={colors.accent} />} onPress={() => { if (activeBlock) format(activeBlock, '**'); }} />
          <Tool label="Көлбеу" active={activeBlock?.text?.includes('_') ?? false} icon={<Italic size={15} color={colors.accent} />} onPress={() => { if (activeBlock) format(activeBlock, '_'); }} />
          <Tool label="Тізім" active={activeBlock?.type === 'list' && !activeBlock.ordered} icon={<List size={15} color={colors.accent} />} onPress={() => add('list', undefined, false)} />
          <Tool label="Нөмір" active={activeBlock?.type === 'list' && activeBlock.ordered} icon={<ListOrdered size={15} color={colors.accent} />} onPress={() => add('list', undefined, true)} />
          <Tool label="Белгі" active={activeBlock?.type === 'checklist'} icon={<CheckSquare size={15} color={colors.accent} />} onPress={() => add('checklist')} />
          <Tool label="Дәйексөз" active={activeBlock?.type === 'quote'} icon={<Quote size={15} color={colors.accent} />} onPress={() => add('quote')} />
          <Tool label="Код" active={activeBlock?.type === 'code'} icon={<Code2 size={15} color={colors.accent} />} onPress={() => add('code')} />
          <Tool label="Кесте" active={activeBlock?.type === 'vocabulary_columns'} icon={<List size={15} color={colors.accent} />} onPress={() => add('vocabulary_columns')} />
          <Tool label="Сурет" icon={<ImagePlus size={15} color={colors.accent} />} onPress={() => void addImage()} />
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={[styles.paper, { backgroundColor: theme.page, borderColor: theme.line }]}>
          <Text style={[styles.brand, { color: theme.muted }]}>L U M I · {book?.title ?? 'Дәптер'}</Text>
          <TextInput value={title} onChangeText={changeTitle} placeholder="Бет атауы (міндетті емес)" placeholderTextColor={theme.muted} style={[styles.title, { color: theme.ink, borderColor: theme.line }]} maxLength={120} returnKeyType="next" />
          {loaded ? blocks.map((block, index) => <View key={block.id} style={[styles.block, { borderColor: theme.line }, block.type === 'quote' ? { borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 9 } : null, block.type === 'code' ? styles.codeBlock : null]}>
            {block.type === 'image' && block.uri ? <View><Image source={{ uri: mediaUri(block.uri) }} style={styles.image} resizeMode="contain" /><TouchableOpacity onPress={() => remove(block.id)} style={styles.deleteImage}><Trash2 size={15} color="#FFF" /></TouchableOpacity></View> : null}
            {block.type === 'vocabulary_columns' ? <VocabularyColumnsBlock block={block} editable onChange={(next) => changeBlocks((current) => current.map((item) => item.id === block.id ? next : item))} /> : null}
            {block.type !== 'image' && block.type !== 'vocabulary_columns' ? <View style={styles.textRow}>
              {block.type === 'checklist' ? <TouchableOpacity onPress={() => changeBlocks((current) => current.map((item) => item.id === block.id ? { ...item, checked: !item.checked } : item))} style={[styles.checkbox, block.checked ? styles.checked : null]}><Text style={{ color: '#FFF' }}>{block.checked ? '✓' : ''}</Text></TouchableOpacity> : null}
              {block.type === 'list' ? <Text style={styles.listMark}>{block.ordered ? `${index + 1}.` : '•'}</Text> : null}
              <TextInput ref={(ref) => { inputs.current[block.id] = ref; }} value={block.text ?? ''} autoFocus={!pageId && index === 0} onFocus={() => setFocusedBlockId(block.id)} onChangeText={(value) => setText(block.id, value)} onSelectionChange={(event) => { selections.current[block.id] = event.nativeEvent.selection; }} placeholder={block.type === 'heading' ? 'Тақырып' : block.type === 'quote' ? 'Дәйексөз' : block.type === 'code' ? 'Код' : block.type === 'checklist' ? 'Тапсырма' : 'Ойыңызды жазыңыз…'} placeholderTextColor={theme.muted} multiline style={[styles.input, { color: theme.ink }, block.type === 'heading' ? { fontSize: block.level === 1 ? 25 : block.level === 3 ? 17 : 21, fontWeight: '700', fontFamily: theme.serif } : null, block.type === 'quote' ? styles.quote : null, block.type === 'code' ? styles.code : null, block.checked ? styles.checkedText : null]} textAlignVertical="top" accessibilityLabel="Мәтін блогы" />
              <View style={styles.blockActions}><TouchableOpacity onPress={() => move(index, -1)} accessibilityLabel="Жоғары жылжыту"><ArrowUp size={14} color={colors.muted} /></TouchableOpacity><TouchableOpacity onPress={() => move(index, 1)} accessibilityLabel="Төмен жылжыту"><ArrowDown size={14} color={colors.muted} /></TouchableOpacity><TouchableOpacity onPress={() => remove(block.id)} accessibilityLabel="Блокты өшіру"><Trash2 size={14} color={colors.red} /></TouchableOpacity></View>
            </View> : null}
          </View>) : <Text style={{ color: theme.muted }}>Бет ашылып жатыр…</Text>}
          <TouchableOpacity style={styles.addParagraph} onPress={() => add('paragraph')}><Text style={{ color: colors.accent, fontWeight: '700' }}>＋ Мәтін қосу</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </AppScreen>;
}

function Tool({ label, icon, onPress, active = false }: { label: string; icon: ReactNode; onPress: () => void; active?: boolean | undefined }) { return <TouchableOpacity onPress={onPress} style={[styles.toolChip, active ? { backgroundColor: '#E8D7C2', borderColor: colors.accent } : null]}>{icon}<Text style={[styles.toolLabel, active ? { color: colors.ink, fontWeight: '800' } : null]}>{label}</Text></TouchableOpacity>; }
const styles = StyleSheet.create({ done: { height: 37, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.ink }, doneText: { color: '#FFF9F1', fontSize: 11, fontWeight: '700' }, toolbar: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 1 }, tools: { alignItems: 'center', gap: 6, paddingHorizontal: 4 }, tool: { padding: 6 }, toolChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7 }, toolLabel: { color: colors.ink, fontSize: 10, fontWeight: '600' }, scroll: { paddingBottom: 24 }, paper: { minHeight: 500, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 }, brand: { fontSize: 9, letterSpacing: 2, fontWeight: '700', marginBottom: 7 }, title: { fontFamily: 'serif', fontSize: 23, fontWeight: '700', borderBottomWidth: 1, paddingVertical: 11, marginBottom: 12 }, block: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6, marginBottom: 6 }, textRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 }, input: { flex: 1, minHeight: 56, fontSize: 16, lineHeight: 24, padding: 5 }, quote: { fontStyle: 'italic', minHeight: 50 }, codeBlock: { backgroundColor: '#F2EEE8', borderRadius: 10, paddingHorizontal: 7 }, code: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20 }, listMark: { color: colors.accent, paddingTop: 12, width: 23, textAlign: 'center' }, checkbox: { width: 19, height: 19, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 6, marginTop: 11, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.accent }, checkedText: { textDecorationLine: 'line-through', opacity: 0.6 }, blockActions: { gap: 10, paddingTop: 10, paddingHorizontal: 3 }, image: { width: '100%', height: 220, borderRadius: 11 }, deleteImage: { position: 'absolute', right: 7, top: 7, backgroundColor: '#322821AA', borderRadius: 10, padding: 7 }, addParagraph: { alignSelf: 'flex-start', paddingVertical: 12 } });
