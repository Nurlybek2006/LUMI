import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, X } from 'lucide-react-native';
import { AppScreen, colors, ThemedText as Text, useAppAppearance, ThemedView as View } from '@/components/ui';
import { listWords, reviewWord } from '@/database/repository';
import { readSetting } from '@/database/settings';
import { addLocalDays, localDate, nextReview } from '@/utils/core';
import type { VocabularyWord } from '@/types/models';

export default function ReviewScreen() {
  useAppAppearance();
  const db = useSQLiteContext();
  const [queue, setQueue] = useState<VocabularyWord[]>([]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const offset = useSharedValue(0);
  const scale = useSharedValue(1);
  const card = queue[index];

  const load = useCallback(async () => {
    const [all, motion] = await Promise.all([listWords(db), readSetting(db, 'reduced_motion')]);
    const due = all.filter((word) => !word.learned && word.nextReview <= localDate());
    setReducedMotion(motion === 'true');
    setQueue(due); setIndex(0); setReviewed(0); setCorrect(0); setShowBack(false); setLoaded(true);
  }, [db]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => { offset.value = reducedMotion ? 0 : withSpring(0); scale.value = reducedMotion ? 1 : withSpring(1); }, [index, offset, scale, reducedMotion]);
  const advance = (direction: number) => {
    setShowBack(false);
    if (direction < 0) setIndex((value) => Math.max(0, value - 1)); else setIndex((value) => Math.min(queue.length - 1, value + 1));
  };
  const pan = Gesture.Pan().onEnd((event) => {
    if (event.translationX < -55) {
      // Reanimated shared values are intentionally mutable inside gesture callbacks.
      // eslint-disable-next-line react-hooks/immutability -- Reanimated gesture state is mutable by design.
      offset.value = withTiming(-65, { duration: reducedMotion ? 0 : 100 }, () => runOnJS(advance)(1));
    } else if (event.translationX > 55) {
      offset.value = withTiming(65, { duration: reducedMotion ? 0 : 100 }, () => runOnJS(advance)(-1));
    }
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }, { scale: scale.value }, { rotateZ: `${offset.value / 18}deg` }] }));
  const flipCard = () => {
    // Reanimated shared values are intentionally mutable inside animation callbacks.
    // eslint-disable-next-line react-hooks/immutability -- Reanimated animation state is mutable by design.
    scale.value = withTiming(0.97, { duration: reducedMotion ? 0 : 100 }, () => {
      runOnJS(setShowBack)(!showBack);
      scale.value = reducedMotion ? 1 : withSpring(1);
    });
  };

  const answer = async (remembered: boolean) => {
    if (!card) return;
    const schedule = nextReview(localDate(), card.repetitions, remembered);
    try { await reviewWord(db, card, remembered, schedule.date, schedule.repetitions); setReviewed((value) => value + 1); setCorrect((value) => value + (remembered ? 1 : 0)); setQueue((items) => items.filter((word) => word.id !== card.id)); setIndex(0); setShowBack(false); }
    catch (error) { Alert.alert('Қайталау сақталмады', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
  };

  return <AppScreen title="Сөз қайталау" subtitle={loaded && queue.length ? `${index + 1} / ${queue.length} сөз` : 'Есте сақтау жаттығуы'} scroll={false} contentStyle={styles.content} right={<TouchableOpacity style={styles.close} onPress={() => router.back()} accessibilityLabel="Жабу"><X size={20} color={colors.ink} /></TouchableOpacity>}>
    {!loaded ? <Text style={styles.loading}>Қайталау дайындалып жатыр…</Text> : !queue.length ? <View style={styles.doneWrap}><View style={styles.doneIcon}><Sparkles size={29} color={colors.accent} /></View><Text style={styles.doneTitle}>{reviewed ? 'Керемет жұмыс!' : 'Бүгінге сөз жоқ'}</Text><Text style={styles.doneBody}>{reviewed ? `${reviewed} сөз қайталанды. ${correct} сөз есіңізде қалды.` : 'Жаңа сөз қоссаңыз, кейін қайталауға келеді.'}</Text><View style={styles.summary}><Text style={styles.summaryText}>Келесі шолу күні бойынша жоспарланады</Text></View><TouchableOpacity style={styles.doneButton} onPress={() => router.back()}><Text style={styles.doneButtonText}>Сөздікке қайту</Text></TouchableOpacity></View> : !card ? <Text style={styles.loading}>Сөз дайындалып жатыр…</Text> : <>
      <View style={styles.sessionProgress}><View style={[styles.progressBar, { width: `${Math.max(3, Math.round((reviewed / Math.max(1, reviewed + queue.length)) * 100))}%` }]} /></View>
      <View style={styles.cardArea}><GestureDetector gesture={pan}><Animated.View style={[styles.flashcard, animatedStyle]}>
        <View style={styles.cardTop}><Text style={styles.cardLabel}>{showBack ? 'АУДАРМАСЫ' : 'СӨЗ'}</Text><Text style={styles.cardCount}>{index + 1} / {queue.length}</Text></View>
        <TouchableOpacity activeOpacity={0.92} onPress={flipCard} style={styles.cardFace}>
          <Text style={styles.word}>{showBack ? card.translation : card.source}</Text>
          {showBack && card.example ? <Text style={styles.example}>“{card.example}”{card.exampleTranslation ? `\n${card.exampleTranslation}` : ''}</Text> : null}
          {showBack && card.notes ? <Text style={styles.notes}>{card.notes}</Text> : null}
          <View style={styles.flipHint}><RotateCcw size={14} color={colors.muted} /><Text style={styles.flipText}>Бетін аудару үшін түртіңіз</Text></View>
        </TouchableOpacity>
      </Animated.View></GestureDetector></View>
      <View style={styles.navRow}><TouchableOpacity onPress={() => advance(-1)} disabled={index === 0} style={styles.nav}><ArrowLeft size={18} color={index === 0 ? '#CFC5B9' : colors.ink} /><Text style={[styles.navText, index === 0 ? { color: '#CFC5B9' } : null]}>Алдыңғы</Text></TouchableOpacity><TouchableOpacity onPress={() => advance(1)} disabled={index >= queue.length - 1} style={styles.nav}><Text style={[styles.navText, index >= queue.length - 1 ? { color: '#CFC5B9' } : null]}>Келесі</Text><ArrowRight size={18} color={index >= queue.length - 1 ? '#CFC5B9' : colors.ink} /></TouchableOpacity></View>
      <View style={styles.answers}><TouchableOpacity onPress={() => void answer(false)} style={styles.again}><RotateCcw size={17} color="#A96F50" /><Text style={styles.againText}>Қиын болды</Text><Text style={styles.interval}>1 күн</Text></TouchableOpacity><TouchableOpacity onPress={() => void answer(true)} style={styles.remembered}><Check size={18} color="#FFF" /><Text style={styles.rememberedText}>Есімде қалды</Text><Text style={styles.intervalLight}>{addLocalDays(localDate(), Math.min(30, [1, 3, 7, 14, 30][Math.min(card.repetitions, 4)] ?? 30))}</Text></TouchableOpacity></View>
      <Text style={styles.tip}>Солға/оңға сырғытып сөз ауыстырыңыз</Text>
    </>}
  </AppScreen>;
}

const styles = StyleSheet.create({ content: { paddingHorizontal: 18 }, close: { width: 40, height: 40, backgroundColor: '#F1E9DE', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, loading: { color: colors.muted, marginTop: 25, textAlign: 'center' }, sessionProgress: { height: 5, backgroundColor: '#E9E0D5', borderRadius: 4, marginTop: 10, overflow: 'hidden' }, progressBar: { height: '100%', backgroundColor: '#B99064', borderRadius: 4 }, cardArea: { flex: 1, justifyContent: 'center', paddingVertical: 18 }, flashcard: { minHeight: 360, backgroundColor: '#FFFDF8', borderRadius: 25, borderWidth: 1, borderColor: '#EBE2D7', padding: 22, shadowColor: '#594A3A', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, cardLabel: { color: '#AC9C8A', letterSpacing: 2, fontSize: 10, fontWeight: '700' }, cardCount: { color: colors.muted, fontSize: 11 }, cardFace: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, word: { color: colors.ink, fontFamily: 'serif', fontSize: 31, fontWeight: '700', textAlign: 'center' }, example: { color: '#75675B', fontFamily: 'serif', fontStyle: 'italic', fontSize: 15, lineHeight: 24, textAlign: 'center', marginTop: 22 }, notes: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 14 }, flipHint: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', bottom: 4 }, flipText: { color: colors.muted, fontSize: 11 }, navRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, nav: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9 }, navText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, answers: { flexDirection: 'row', gap: 10 }, again: { flex: 1, backgroundColor: '#F3E6D9', borderRadius: 15, paddingVertical: 13, alignItems: 'center', gap: 5 }, againText: { color: '#8B5D42', fontWeight: '700', fontSize: 12 }, interval: { color: '#A37A5F', fontSize: 10 }, remembered: { flex: 1, backgroundColor: '#5B7B63', borderRadius: 15, paddingVertical: 13, alignItems: 'center', gap: 5 }, rememberedText: { color: '#FFF', fontWeight: '700', fontSize: 12 }, intervalLight: { color: '#E4EBDD', fontSize: 10 }, tip: { color: '#A4988D', fontSize: 10, textAlign: 'center', marginTop: 12, marginBottom: 13 }, doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, doneIcon: { width: 67, height: 67, borderRadius: 24, backgroundColor: '#F1E4D5', alignItems: 'center', justifyContent: 'center' }, doneTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 25, fontWeight: '700', marginTop: 18 }, doneBody: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 9, lineHeight: 21 }, summary: { backgroundColor: '#EEE6DB', borderRadius: 13, padding: 13, marginTop: 21 }, summaryText: { color: colors.muted, fontSize: 11 }, doneButton: { backgroundColor: colors.ink, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 22 }, doneButtonText: { color: '#FFF9F1', fontWeight: '700' }
});
