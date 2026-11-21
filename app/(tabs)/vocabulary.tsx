import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BookOpenCheck, Download, Heart, Languages, Plus, Search, Sparkles, Trash2, Upload, X } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, TextField, colors } from '@/components/ui';
import { deleteWord, listVocabularyLanguages, listWords, saveMultilingualWord, saveVocabularyLanguages, setWordLearningStatus, type VocabularySort } from '@/database/repository';
import { exportVocabulary, importVocabulary } from '@/services/vocabularyTransfer';
import { localDate } from '@/utils/core';
import type { VocabularyWord } from '@/types/models';
import { normalizeVocabularyTranslations, parseBulkVocabulary } from '@/utils/vocabulary';
import { randomUUID } from 'expo-crypto';

const languageLabels: Record<string, string> = { en: 'Ағылшынша', kk: 'Қазақша', ru: 'Орысша' };
type TranslationDraft = { key: string; id?: string; languageCode: string; value: string };

export default function VocabularyScreen() {
  const db = useSQLiteContext();
  const { wordId, notebookId: selectedNotebookId } = useLocalSearchParams<{ wordId?: string; notebookId?: string }>();
  const vocabularyNotebookId = selectedNotebookId ?? 'vocabulary';
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [languages, setLanguages] = useState<string[]>(['kk', 'ru', 'en']);
  const [quickValues, setQuickValues] = useState<Record<string, string>>({});
  const [quickMessage, setQuickMessage] = useState('');
  const [expandedWord, setExpandedWord] = useState<string | null>(() => wordId ?? null);
  const [languageModal, setLanguageModal] = useState(false);
  const [languageText, setLanguageText] = useState('kk, ru, en');
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<VocabularyWord | null>(null);
  const [editTranslations, setEditTranslations] = useState<TranslationDraft[]>([]);
  const [example, setExample] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [favoriteInput, setFavoriteInput] = useState(false);
  const [filter, setFilter] = useState<'all' | 'due' | 'learned' | 'favorite'>('all');
  const [sort, setSort] = useState<VocabularySort>('due');

  const refresh = useCallback(async () => { const [items, configured] = await Promise.all([listWords(db, query, sort, vocabularyNotebookId), listVocabularyLanguages(db, vocabularyNotebookId)]); setWords(items); setLanguages(configured); setLanguageText(configured.join(', ')); }, [db, query, sort, vocabularyNotebookId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { const timer = setTimeout(() => void refresh(), 160); return () => clearTimeout(timer); }, [query, refresh]);
  useEffect(() => { if (!wordId) return; const frame = requestAnimationFrame(() => setExpandedWord(wordId)); return () => cancelAnimationFrame(frame); }, [wordId]);
  const reviewable = words.filter((word) => word.nextReview <= localDate() && !word.learned);
  const visible = words.filter((word) => filter === 'all' || (filter === 'due' && word.nextReview <= localDate() && !word.learned) || (filter === 'learned' && word.learned) || (filter === 'favorite' && word.favorite));

  const resetForm = (word?: VocabularyWord) => {
    const stored = word?.translations?.length ? word.translations : word ? [{ id: `${word.id}:source`, languageCode: word.sourceLanguage, value: word.source }, { id: `${word.id}:target`, languageCode: word.targetLanguage, value: word.translation }] : [];
    const configuredCodes = [...new Set([...stored.map((item) => item.languageCode), ...languages])];
    setEditing(word ?? null);
    setEditTranslations(configuredCodes.map((languageCode) => {
      const item = stored.find((candidate) => candidate.languageCode === languageCode);
      return { key: item?.id ?? randomUUID(), ...(item?.id ? { id: item.id } : {}), languageCode, value: item?.value ?? '' };
    }));
    setExample(word?.example ?? ''); setExampleTranslation(word?.exampleTranslation ?? ''); setNotes(word?.notes ?? ''); setTagsText(word?.tags?.join(', ') ?? ''); setFavoriteInput(word?.favorite ?? false); setModal(true);
  };
  const addTranslation = () => setEditTranslations((items) => [...items, { key: randomUUID(), languageCode: '', value: '' }]);
  const removeTranslation = (key: string) => setEditTranslations((items) => {
    if (items.length <= 2) { Alert.alert('Екі тіл қажет', 'Сөздік жазбасында кемінде екі тіл қалуы керек.'); return items; }
    return items.filter((item) => item.key !== key);
  });
  const moveTranslation = (index: number, direction: -1 | 1) => setEditTranslations((items) => {
    const target = index + direction; if (target < 0 || target >= items.length) return items;
    const next = [...items]; [next[index], next[target]] = [next[target]!, next[index]!]; return next;
  });
  const saveQuick = async () => {
    const translations = languages.map((languageCode) => ({ languageCode, value: quickValues[languageCode] ?? '' }));
    if (translations.filter((item) => item.value.trim()).length < 2) { Alert.alert('Сөздерді толтырыңыз', 'Кемінде екі тілдегі нұсқасын енгізіңіз.'); return; }
    try { await saveMultilingualWord(db, { notebookId: vocabularyNotebookId, translations }); setQuickValues({}); setQuickMessage('Сақталды. Келесі сөзді енгізіңіз.'); await refresh(); }
    catch (error) { Alert.alert('Сақтау қатесі', error instanceof Error ? error.message : 'Қайталап көріңіз.'); }
  };
  const saveLanguages = async () => {
    try { const values = languageText.split(',').map((item) => item.trim()).filter(Boolean); await saveVocabularyLanguages(db, vocabularyNotebookId, values); setLanguages(values.map((value) => value.toLowerCase())); setLanguageModal(false); setQuickValues({}); }
    catch (error) { Alert.alert('Тілдерді сақтау қатесі', error instanceof Error ? error.message : 'Кемінде екі дұрыс тіл кодын енгізіңіз.'); }
  };
  const bulkRows = parseBulkVocabulary(bulkText, languages);
  const importBulk = async () => {
    if (!bulkRows.length || bulkRows.some((row) => row.error)) return;
    try {
      for (const row of bulkRows) await saveMultilingualWord(db, { notebookId: vocabularyNotebookId, translations: row.values.map((value, index) => ({ languageCode: languages[index]!, value })) });
      setBulkText(''); setBulkModal(false); await refresh(); Alert.alert('Импорт аяқталды', `${bulkRows.length} сөз қосылды.`);
    } catch (error) { Alert.alert('Импорт қатесі', error instanceof Error ? error.message : 'Қайталап көріңіз.'); }
  };
  const save = async () => {
    try {
      const translations = normalizeVocabularyTranslations(editTranslations.map(({ id, languageCode, value }) => ({ ...(id ? { id } : {}), languageCode, value })));
      await saveMultilingualWord(db, { ...(editing ? { id: editing.id, learned: editing.learned, repetitions: editing.repetitions, nextReview: editing.nextReview, createdAt: editing.createdAt } : {}), notebookId: editing?.notebookId ?? vocabularyNotebookId, translations, example, exampleTranslation, notes, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean), favorite: favoriteInput });
      setModal(false); await refresh();
    }
    catch (error) { Alert.alert('Сақтау қатесі', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
  };
  const toggleFavorite = async (word: VocabularyWord) => {
    const translations = word.translations?.length ? word.translations : [
      { languageCode: word.sourceLanguage, value: word.source },
      { languageCode: word.targetLanguage, value: word.translation }
    ];
    try {
      await saveMultilingualWord(db, { id: word.id, notebookId: word.notebookId ?? vocabularyNotebookId, translations,
        example: word.example, exampleTranslation: word.exampleTranslation, notes: word.notes, ...(word.tags ? { tags: word.tags } : {}),
        favorite: !word.favorite, learned: word.learned, repetitions: word.repetitions, nextReview: word.nextReview, createdAt: word.createdAt });
      await refresh();
    } catch (error) { Alert.alert('Сақтау қатесі', error instanceof Error ? error.message : 'Қайталап көріңіз.'); }
  };
  const askDelete = (word: VocabularyWord) => Alert.alert('Сөзді өшіру керек пе?', `${word.source} — ${word.translation}`, [{ text: 'Болдырмау', style: 'cancel' }, { text: 'Өшіру', style: 'destructive', onPress: () => { void deleteWord(db, word.id).then(refresh); } }]);
  const transfer = async (type: 'export' | 'import') => {
    try { if (type === 'export') await exportVocabulary(db); else { const count = await importVocabulary(db); if (count) Alert.alert('Импорт аяқталды', `${count} сөз қосылды немесе жаңартылды.`); await refresh(); } }
    catch (error) { Alert.alert(type === 'export' ? 'Экспорт қатесі' : 'Импорт қатесі', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
  };

  return <AppScreen title="Сөздер қоржыны" subtitle="Күн сайын бір сөз — жаңа мүмкіндік" right={<TouchableOpacity style={styles.headerButton} onPress={() => resetForm()}><Plus size={20} color={colors.ink} /></TouchableOpacity>}>
    <Card style={styles.hero} color="#EDE4D8"><View style={styles.heroIcon}><Languages size={21} color="#A76B45" /></View><View style={{ flex: 1 }}><Text style={styles.heroTitle}>Қайталауға дайын</Text><Text style={styles.heroSub}>{reviewable.length} сөз бүгінгі шолуда</Text></View><TouchableOpacity onPress={() => router.push('/review')} style={styles.reviewButton}><BookOpenCheck size={18} color="#FFF9F1" /></TouchableOpacity></Card>
    <Card style={extraStyles.quickCard}><View style={extraStyles.quickHeader}><Text style={styles.sectionTitle}>Жылдам қосу</Text><TouchableOpacity onPress={() => setLanguageModal(true)}><Text style={extraStyles.configure}>Тілдерді реттеу</Text></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={extraStyles.quickFields}>{languages.map((language) => <View key={language} style={extraStyles.quickField}><Text style={extraStyles.quickLanguage}>{languageLabels[language] ?? language.toUpperCase()}</Text><TextInput value={quickValues[language] ?? ''} onChangeText={(value) => { setQuickValues((current) => ({ ...current, [language]: value })); setQuickMessage(''); }} placeholder="Сөз не тіркес" placeholderTextColor="#A79B8E" style={extraStyles.quickInput} returnKeyType="next" /></View>)}</ScrollView><View style={extraStyles.quickFooter}><Text style={extraStyles.quickMessage}>{quickMessage}</Text><TouchableOpacity style={extraStyles.quickSave} onPress={() => void saveQuick()}><Plus size={15} color="#FFF9F1" /><Text style={extraStyles.quickSaveText}>Қосу</Text></TouchableOpacity></View></Card>
    <View style={styles.searchBox}><Search size={17} color={colors.muted} /><TextField value={query} onChangeText={setQuery} placeholder="Сөзді немесе аударманы іздеу" containerStyle={{ flex: 1 }} inputMode="search" /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{([['all', 'Барлығы'], ['due', 'Қайталау'], ['learned', 'Үйренген'], ['favorite', 'Таңдаулы']] as const).map(([value, label]) => <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value ? styles.filterActive : null]}><Text style={[styles.filterText, filter === value ? styles.filterTextActive : null]}>{label}</Text></TouchableOpacity>)}</ScrollView>
    <View style={styles.sortRow}><Text style={styles.sortLabel}>Реттеу</Text>{([['due', 'Қайталау күні'], ['alphabetical', 'Әліпби'], ['newest', 'Жаңасы']] as const).map(([value, label]) => <TouchableOpacity key={value} onPress={() => setSort(value)} style={[styles.sortChip, sort === value ? styles.sortChipActive : null]}><Text style={[styles.sortText, sort === value ? styles.sortTextActive : null]}>{label}</Text></TouchableOpacity>)}</View>
    <View style={styles.countRow}><Text style={styles.sectionTitle}>Жеке сөздігіңіз</Text><Text style={styles.count}>{visible.length} сөз</Text></View>
    {visible.length ? visible.map((word) => <Card key={word.id} style={styles.wordCard}>
      <View style={styles.wordTop}><TouchableOpacity onPress={() => setExpandedWord((current) => current === word.id ? null : word.id)} style={{ flex: 1 }}><Text style={styles.sourceWord}>{word.source}</Text><Text style={styles.translation}>{word.translation}</Text></TouchableOpacity><TouchableOpacity onPress={() => void toggleFavorite(word)} accessibilityLabel={word.favorite ? 'Таңдаулыдан алу' : 'Таңдаулыға қосу'} style={styles.favorite}>{word.favorite ? <Heart size={18} color="#C36664" fill="#C36664" /> : <Heart size={18} color="#C3B6A8" />}</TouchableOpacity><TouchableOpacity onPress={() => askDelete(word)} style={{ padding: 5 }} accessibilityLabel="Сөзді өшіру"><Trash2 size={16} color="#B2A699" /></TouchableOpacity></View>
      <View style={styles.wordMeta}><Text style={styles.language}>{(word.translations ?? []).map((item) => item.languageCode.toUpperCase()).join(' · ') || `${word.sourceLanguage} → ${word.targetLanguage}`}</Text>{word.learned ? <Text style={styles.learned}>Үйренілді</Text> : <Text style={styles.due}>{word.nextReview <= localDate() ? 'Қайталау керек' : `Келесі: ${word.nextReview}`}</Text>}</View>
      {expandedWord === word.id ? <>{(word.translations ?? []).slice(2).map((item) => <View key={item.id} style={extraStyles.extraTranslation}><Text style={styles.language}>{item.languageCode.toUpperCase()}</Text><Text style={styles.translation}>{item.value}</Text></View>)}{word.example ? <Text style={styles.example}>“{word.example}”</Text> : null}{word.notes ? <Text style={styles.example}>{word.notes}</Text> : null}{word.tags?.length ? <Text style={styles.language}>Белгілер: {word.tags.join(', ')}</Text> : null}</> : null}
      <View style={extraStyles.cardActions}><TouchableOpacity onPress={() => setExpandedWord((current) => current === word.id ? null : word.id)}><Text style={styles.learningToggleText}>{expandedWord === word.id ? 'Жасыру' : 'Көру'}</Text></TouchableOpacity><TouchableOpacity onPress={() => resetForm(word)}><Text style={styles.learningToggleText}>Өңдеу</Text></TouchableOpacity></View>
      <TouchableOpacity onPress={() => void setWordLearningStatus(db, word.id, !word.learned).then(refresh)} style={styles.learningToggle} accessibilityRole="button">
        <Text style={styles.learningToggleText}>{word.learned ? 'Үйреніп жүрмін деп белгілеу' : 'Үйрендім деп белгілеу'}</Text>
      </TouchableOpacity>
    </Card>) : <Card style={styles.empty}><View style={styles.emptyIcon}><Sparkles size={21} color={colors.accent} /></View><Text style={styles.emptyTitle}>{query ? 'Сөз табылмады' : 'Сөздік әлі бос'}</Text><Text style={styles.emptyText}>{query ? 'Басқа сөзбен іздеп көріңіз.' : 'Кездескен жаңа сөзді осында сақтаңыз.'}</Text><PrimaryButton title="Алғашқы сөзді қосу" icon={<Plus size={16} color="#FFF9F1" />} onPress={() => resetForm()} style={{ marginTop: 14 }} /></Card>}
    <View style={styles.transferRow}><TouchableOpacity onPress={() => void transfer('export')} style={styles.transferButton}><Download size={15} color={colors.accent} /><Text style={styles.transferText}>JSON экспорт</Text></TouchableOpacity><TouchableOpacity onPress={() => void transfer('import')} style={styles.transferButton}><Upload size={15} color={colors.accent} /><Text style={styles.transferText}>JSON импорт</Text></TouchableOpacity><TouchableOpacity onPress={() => setBulkModal(true)} style={styles.transferButton}><Plus size={15} color={colors.accent} /><Text style={styles.transferText}>Көп сөз қосу</Text></TouchableOpacity></View>

    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
      <View style={styles.modalShade}><View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>{editing ? 'Сөзді өңдеу' : 'Жаңа сөз'}</Text><TouchableOpacity onPress={() => setModal(false)}><X size={19} color={colors.muted} /></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Аудармалар</Text>
          <Text style={extraStyles.quickHint}>Әр жолда тіл кодын және сөздің сол тілдегі нұсқасын енгізіңіз. Қажет болса, кез келген тіл санын қосуға болады.</Text>
          {editTranslations.map((item, index) => <View key={item.key} style={extraStyles.translationEditRow}>
            <View style={{ flex: 1 }}>
              <Text style={extraStyles.translationLanguage}>{languageLabels[item.languageCode] || item.languageCode.toUpperCase() || 'Тіл атауы'}</Text>
              <TextField label="Тіл коды" value={item.languageCode} onChangeText={(languageCode) => setEditTranslations((items) => items.map((candidate) => candidate.key === item.key ? { ...candidate, languageCode } : candidate))} placeholder="kk" autoCapitalize="none" maxLength={12} />
              <TextField label="Осы тілдегі сөз немесе тіркес" value={item.value} onChangeText={(value) => setEditTranslations((items) => items.map((candidate) => candidate.key === item.key ? { ...candidate, value } : candidate))} placeholder="Мысалы, алма" />
            </View>
            <View style={extraStyles.translationActions}>
              <TouchableOpacity onPress={() => moveTranslation(index, -1)} disabled={index === 0} accessibilityLabel="Тілді жоғары жылжыту"><Text style={[extraStyles.orderButton, index === 0 ? extraStyles.orderButtonDisabled : null]}>↑</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => moveTranslation(index, 1)} disabled={index === editTranslations.length - 1} accessibilityLabel="Тілді төмен жылжыту"><Text style={[extraStyles.orderButton, index === editTranslations.length - 1 ? extraStyles.orderButtonDisabled : null]}>↓</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => removeTranslation(item.key)} accessibilityLabel="Тіл жолын алып тастау"><Trash2 size={16} color={colors.red} /></TouchableOpacity>
            </View>
          </View>)}
          <TouchableOpacity onPress={addTranslation} style={extraStyles.addTranslation}><Plus size={15} color={colors.accent} /><Text style={extraStyles.configure}>Тіл қосу</Text></TouchableOpacity>
          <TextField label="Мысал сөйлем" value={example} onChangeText={setExample} placeholder="Сөзді сөйлем ішінде қолданыңыз" />
          <TextField label="Мысалдың аудармасы" value={exampleTranslation} onChangeText={setExampleTranslation} placeholder="Сөйлем аудармасы" />
          <TextField label="Жазба" value={notes} onChangeText={setNotes} placeholder="Ескертпе немесе түсіндірме" />
          <TextField label="Белгілер (үтірмен бөліңіз)" value={tagsText} onChangeText={setTagsText} placeholder="күнделікті, оқу" />
          <TouchableOpacity style={extraStyles.favoriteToggle} onPress={() => setFavoriteInput((value) => !value)}><Heart size={17} color={favoriteInput ? '#C36664' : colors.muted} fill={favoriteInput ? '#C36664' : 'transparent'} /><Text style={styles.fieldLabel}>{favoriteInput ? 'Таңдаулы сөз' : 'Таңдаулыға қосу'}</Text></TouchableOpacity>
        </ScrollView>
        <PrimaryButton title="Сақтау" onPress={() => void save()} style={{ marginTop: 14 }} />
      </View></View>
    </Modal>
    <Modal visible={languageModal} transparent animationType="fade" onRequestClose={() => setLanguageModal(false)}><View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalTitle}>Тілдерді және баған ретін реттеу</Text><Text style={extraStyles.quickHint}>Тіл кодтарын үтірмен бөліңіз. Мысалы: kk, ru, en, tr</Text><TextInput value={languageText} onChangeText={setLanguageText} autoCapitalize="none" style={extraStyles.languageInput} placeholder="kk, ru, en" /><PrimaryButton title="Сақтау" onPress={() => void saveLanguages()} /></View></View></Modal>
    <Modal visible={bulkModal} transparent animationType="fade" onRequestClose={() => setBulkModal(false)}><View style={styles.modalShade}><View style={styles.modal}><Text style={styles.modalTitle}>Көп сөзді бірден қосу</Text><Text style={extraStyles.quickHint}>Әр жолға бір сөз. Бағандарды | таңбасымен бөліңіз: {languages.join(' | ')}</Text><TextInput multiline value={bulkText} onChangeText={setBulkText} style={extraStyles.bulkInput} placeholder="алма | яблоко | apple" textAlignVertical="top" autoCapitalize="none" /><ScrollView style={{ maxHeight: 190 }}>{bulkRows.map((row) => <Text key={row.line} style={[extraStyles.previewRow, row.error ? extraStyles.previewError : null]}>{row.error ? `Жол ${row.line}: ${row.error}` : `${row.line}. ${row.values.join('  ·  ')}`}</Text>)}</ScrollView><PrimaryButton title={`Алдын ала көру және сақтау (${bulkRows.filter((row) => !row.error).length})`} onPress={() => void importBulk()} disabled={!bulkRows.length || bulkRows.some((row) => row.error)} style={{ marginTop: 10 }} /></View></View></Modal>
  </AppScreen>;
}

const extraStyles = StyleSheet.create({ quickCard: { marginTop: 12, padding: 12 }, quickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, configure: { color: colors.accent, fontSize: 10, fontWeight: '700' }, quickFields: { gap: 8, paddingVertical: 9 }, quickField: { width: 136 }, quickLanguage: { color: colors.muted, fontSize: 10, fontWeight: '700', marginBottom: 5 }, quickInput: { height: 42, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 9, color: colors.ink, backgroundColor: '#FFF', fontSize: 13 }, quickFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }, quickMessage: { color: colors.green, fontSize: 10, flex: 1 }, quickSave: { backgroundColor: colors.ink, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 }, quickSaveText: { color: '#FFF9F1', fontSize: 11, fontWeight: '700' }, extraTranslation: { flexDirection: 'row', gap: 9, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, translationEditRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, translationLanguage: { color: colors.accent, fontSize: 11, fontWeight: '700', marginBottom: 5 }, translationActions: { alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 4 }, orderButton: { color: colors.accent, fontSize: 21, fontWeight: '700', minWidth: 22, textAlign: 'center' }, orderButtonDisabled: { color: '#D4C9BC' }, addTranslation: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 8 }, cardActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7, marginTop: 3, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, quickHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, favoriteToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, languageInput: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, color: colors.ink, marginVertical: 12 }, bulkInput: { minHeight: 105, maxHeight: 190, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 11, color: colors.ink, marginTop: 10 }, previewRow: { color: colors.muted, fontSize: 11, paddingVertical: 4 }, previewError: { color: colors.red, fontWeight: '700' } });

const styles = StyleSheet.create({ headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE', borderRadius: 14 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderWidth: 0 }, heroIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: '#FAF5ED', alignItems: 'center', justifyContent: 'center' }, heroTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 }, heroSub: { color: colors.muted, fontSize: 11, marginTop: 3 }, reviewButton: { width: 41, height: 41, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, marginTop: 15 }, filters: { gap: 7, paddingVertical: 13 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 11, backgroundColor: '#EFE8DE' }, filterActive: { backgroundColor: colors.ink }, filterText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, filterTextActive: { color: '#FFF9F1' }, sortRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }, sortLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginRight: 2 }, sortChip: { borderRadius: 9, backgroundColor: '#F1EBE2', paddingHorizontal: 8, paddingVertical: 6 }, sortChipActive: { backgroundColor: '#E4D2BD' }, sortText: { color: colors.muted, fontSize: 9, fontWeight: '600' }, sortTextActive: { color: colors.ink }, countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 5 }, sectionTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700' }, count: { color: colors.muted, fontSize: 11 }, wordCard: { padding: 14, marginTop: 9 }, wordTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, sourceWord: { color: colors.ink, fontFamily: 'serif', fontSize: 17, fontWeight: '700' }, translation: { color: colors.accent, fontSize: 13, marginTop: 3 }, favorite: { padding: 5 }, wordMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }, language: { color: colors.muted, fontSize: 10, textTransform: 'uppercase' }, due: { color: '#A67845', fontSize: 10 }, learned: { color: colors.green, fontSize: 10 }, example: { color: '#766B61', fontFamily: 'serif', fontSize: 12, fontStyle: 'italic', marginTop: 9 }, learningToggle: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 8, marginTop: 5 }, learningToggleText: { color: colors.accent, fontSize: 10, fontWeight: '700' }, empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, marginTop: 10 }, emptyIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2E7D9' }, emptyTitle: { color: colors.ink, fontFamily: 'serif', fontWeight: '700', fontSize: 17, marginTop: 12 }, emptyText: { color: colors.muted, fontSize: 12, marginTop: 5, textAlign: 'center' }, transferRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 17 }, transferButton: { flexDirection: 'row', alignItems: 'center', gap: 6 }, transferText: { color: colors.accent, fontSize: 11, fontWeight: '700' }, modalShade: { flex: 1, backgroundColor: '#1D1915A0', justifyContent: 'flex-end', padding: 9 }, modal: { maxHeight: '92%', backgroundColor: colors.background, borderRadius: 23, padding: 19 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, modalTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 20, fontWeight: '700' }, langRow: { flexDirection: 'row', gap: 9 }, fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }, langOptions: { gap: 4 }, langChip: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EEE7DD', marginBottom: 3, alignItems: 'center' }, langChipActive: { backgroundColor: '#E8D7C2' }, langText: { color: colors.muted, fontSize: 10 }, langTextActive: { color: colors.accent, fontWeight: '700' }
});
