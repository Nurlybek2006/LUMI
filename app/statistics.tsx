import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BookOpenText, CheckCircle2, Flame, Languages, PenLine, Star, Target } from 'lucide-react-native';
import { AppScreen, Card, colors } from '@/components/ui';
import { getStats, listEntries } from '@/database/repository';
import { addLocalDays, localDate, wordCount } from '@/utils/core';
import type { ReactNode } from 'react';

export default function StatisticsScreen() {
  const db = useSQLiteContext();
  const [stats, setStats] = useState({ entries: 0, words: 0, tasksDone: 0, tasksTotal: 0, wordsReviewedToday: 0, wordsLearned: 0, totalWords: 0, streak: 0, longest: 0, monthlyDays: [] as string[] });
  const [wordsWritten, setWordsWritten] = useState(0);
  const [monthDays, setMonthDays] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    const [result, entries] = await Promise.all([getStats(db), listEntries(db)]);
    setStats(result); setWordsWritten(entries.reduce((sum, entry) => sum + wordCount(entry.content), 0));
    const all = await db.getAllAsync<{ event_date: string }>('SELECT event_date FROM activity_events WHERE event_date>=? GROUP BY event_date', addLocalDays(localDate(), -29));
    setMonthDays(all.map((row) => row.event_date));
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const completion = stats.tasksTotal ? Math.round((stats.tasksDone / stats.tasksTotal) * 100) : 0;
  const activitySet = new Set(monthDays);
  const today = new Date(`${localDate()}T12:00:00`);
  const lastDays = Array.from({ length: 30 }, (_, index) => { const date = new Date(today); date.setDate(today.getDate() - (29 - index)); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });

  return <AppScreen title="Менің жолым" subtitle="Жеке дамуыңыздың шынайы көрінісі">
    <View style={styles.streakRow}><Card style={styles.streakCard} color="#EFE3D4"><Flame size={21} color="#AD6846" /><Text style={styles.streakValue}>{stats.streak}</Text><Text style={styles.streakLabel}>күндік қатар</Text></Card><Card style={styles.streakCard} color="#E8ECE2"><Star size={20} color="#6B8060" /><Text style={styles.streakValue}>{stats.longest}</Text><Text style={styles.streakLabel}>ең ұзақ қатар</Text></Card></View>
    <Text style={styles.heading}>Күнделік беттері</Text><View style={styles.metrics}><Metric icon={<BookOpenText size={19} color="#A56D48" />} value={stats.entries} label="Жазба" tint="#F3E8DA" /><Metric icon={<PenLine size={19} color="#81709A" />} value={wordsWritten} label="Жазылған сөз" tint="#ECE8F3" /></View>
    <Card style={styles.monthCard}><View style={styles.monthHead}><Text style={styles.cardTitle}>Соңғы 30 күн</Text><Text style={styles.monthSub}>{monthDays.length} белсенді күн</Text></View><View style={styles.activityGrid}>{lastDays.map((date) => <View key={date} style={[styles.activityCell, activitySet.has(date) ? styles.activityOn : null]} />)}</View><View style={styles.activityLegend}><Text style={styles.legendText}>Аз</Text>{['#F0E9DF', '#D9C9B4', '#B99773', '#7D6045'].map((color) => <View key={color} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendText}>Көп</Text></View></Card>
    <Text style={styles.heading}>Жоспарлау</Text><Card style={styles.metricWide}><View style={styles.metricIcon}><CheckCircle2 size={20} color="#578060" /></View><View style={{ flex: 1 }}><Text style={styles.metricLabel}>Аяқталған тапсырмалар</Text><Text style={styles.metricValue}>{stats.tasksDone} <Text style={styles.metricSmall}>/ {stats.tasksTotal}</Text></Text><View style={styles.track}><View style={[styles.fill, { width: `${completion}%`, backgroundColor: '#6C8B70' }]} /></View></View><Text style={styles.percent}>{completion}%</Text></Card>
    <Text style={styles.heading}>Сөздік қоры</Text><View style={styles.metrics}><Metric icon={<Languages size={19} color="#85749F" />} value={stats.words} label="Барлық сөз" tint="#ECE8F3" /><Metric icon={<Target size={19} color="#648168" />} value={stats.wordsLearned} label="Үйренілген" tint="#E6EEE4" /></View><Card style={styles.metricWide}><View style={[styles.metricIcon, { backgroundColor: '#F2E9DC' }]}><Star size={19} color="#B1824B" /></View><View style={{ flex: 1 }}><Text style={styles.metricLabel}>Бүгін қайталанды</Text><Text style={styles.metricValue}>{stats.wordsReviewedToday} <Text style={styles.metricSmall}>сөз</Text></Text></View></Card>
    <Text style={styles.footer}>Статистика құрылғыдағы сақталған деректерден есептеледі.</Text>
  </AppScreen>;
}

function Metric({ icon, value, label, tint }: { icon: ReactNode; value: number; label: string; tint: string }) {
  return <Card style={styles.metricCard}><View style={[styles.metricIcon, { backgroundColor: tint }]}>{icon}</View><Text style={styles.metricValue}>{value.toLocaleString('kk-KZ')}</Text><Text style={styles.metricLabel}>{label}</Text></Card>;
}

const styles = StyleSheet.create({ streakRow: { flexDirection: 'row', gap: 10 }, streakCard: { flex: 1, alignItems: 'center', paddingVertical: 16, borderWidth: 0 }, streakValue: { color: colors.ink, fontFamily: 'serif', fontSize: 27, fontWeight: '700', marginTop: 7 }, streakLabel: { color: colors.muted, fontSize: 10, marginTop: 2 }, heading: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700', marginTop: 22, marginBottom: 10 }, metrics: { flexDirection: 'row', gap: 10 }, metricCard: { flex: 1, padding: 13 }, metricIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, metricValue: { color: colors.ink, fontFamily: 'serif', fontSize: 23, fontWeight: '700', marginTop: 10 }, metricLabel: { color: colors.muted, fontSize: 11, marginTop: 3 }, monthCard: { padding: 15 }, monthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }, cardTitle: { color: colors.ink, fontWeight: '700', fontSize: 13 }, monthSub: { color: colors.muted, fontSize: 10 }, activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, activityCell: { width: '8.2%', aspectRatio: 1, borderRadius: 4, backgroundColor: '#F0E9DF' }, activityOn: { backgroundColor: '#A78560' }, activityLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 11 }, legendText: { color: colors.muted, fontSize: 9 }, legendCell: { width: 10, height: 10, borderRadius: 3 }, metricWide: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, metricSmall: { color: colors.muted, fontFamily: undefined, fontSize: 13, fontWeight: '400' }, track: { height: 5, backgroundColor: '#EAE5DC', borderRadius: 4, overflow: 'hidden', marginTop: 9 }, fill: { height: '100%', borderRadius: 4 }, percent: { color: colors.green, fontSize: 12, fontWeight: '700' }, footer: { color: '#A3988C', fontSize: 10, textAlign: 'center', marginTop: 20, marginBottom: 14 }
});
