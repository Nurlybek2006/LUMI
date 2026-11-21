import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, Languages } from 'lucide-react-native';
import { AppScreen, Card, colors, useAppAppearance, ThemedText as Text, ThemedView as View } from '@/components/ui';
import { localDate } from '@/utils/core';

type DayActivity = { entries: string[]; tasks: number; completed: number; reviews: number };
const weekDays = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жс'];

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const { palette } = useAppAppearance();
  const [month, setMonth] = useState(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
  const [activity, setActivity] = useState<Record<string, DayActivity>>({});
  const [selected, setSelected] = useState(localDate());
  const [loadedMonth, setLoadedMonth] = useState('');
  const [moods, setMoods] = useState<Record<string, string | null>>({});

  const refresh = useCallback(async () => {
    const [entries, tasks, reviews] = await Promise.all([
      db.getAllAsync<{ entry_date: string; id: string; mood: string | null }>('SELECT entry_date,id,mood FROM entries WHERE entry_date LIKE ?', `${month}-%`),
      db.getAllAsync<{ task_date: string; total: number; completed: number }>('SELECT task_date,COUNT(*) AS total,SUM(completed) AS completed FROM tasks WHERE task_date LIKE ? GROUP BY task_date', `${month}-%`),
      db.getAllAsync<{ reviewed_at: string; total: number }>('SELECT reviewed_at,COUNT(*) AS total FROM vocabulary_reviews WHERE reviewed_at LIKE ? GROUP BY reviewed_at', `${month}-%`)
    ]);
    const next: Record<string, DayActivity> = {}; const moodMap: Record<string, string | null> = {};
    for (const row of entries) { next[row.entry_date] ??= { entries: [], tasks: 0, completed: 0, reviews: 0 }; next[row.entry_date]!.entries.push(row.id); if (row.mood) moodMap[row.entry_date] = row.mood; }
    for (const row of tasks) { next[row.task_date] ??= { entries: [], tasks: 0, completed: 0, reviews: 0 }; next[row.task_date]!.tasks = row.total; next[row.task_date]!.completed = row.completed ?? 0; }
    for (const row of reviews) { next[row.reviewed_at] ??= { entries: [], tasks: 0, completed: 0, reviews: 0 }; next[row.reviewed_at]!.reviews = row.total; }
    setActivity(next); setMoods(moodMap); setLoadedMonth(month);
  }, [db, month]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const calendarDays = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number); const first = new Date(year ?? 2000, (monthNumber ?? 1) - 1, 1); const daysInMonth = new Date(year ?? 2000, monthNumber ?? 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  }, [month]);
  const moveMonth = (delta: number) => { const [year, m] = month.split('-').map(Number); const date = new Date(year ?? 2000, (m ?? 1) - 1 + delta, 1); setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`); };
  const selectedActivity = activity[selected] ?? { entries: [], tasks: 0, completed: 0, reviews: 0 };
  const monthLabel = new Intl.DateTimeFormat('kk-KZ', { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`));

  return <AppScreen title="Күнтізбе" subtitle={`${Object.values(activity).filter((item) => item.entries.length).length} күнде жазба бар`} right={<TouchableOpacity style={[styles.todayButton, { backgroundColor: palette.accentSoft }]} onPress={() => { setMonth(localDate().slice(0, 7)); setSelected(localDate()); }} accessibilityRole="button"><Text style={[styles.todayText, { color: palette.ink }]}>Бүгін</Text></TouchableOpacity>}>
    <Card style={styles.calendarCard}>
      <View style={styles.monthBar}><TouchableOpacity onPress={() => moveMonth(-1)} style={[styles.monthArrow, { backgroundColor: palette.accentSoft }]} accessibilityLabel="Алдыңғы ай"><ArrowLeft size={17} color={palette.ink} /></TouchableOpacity><Text style={[styles.monthTitle, { color: palette.ink }]}>{monthLabel}</Text><TouchableOpacity onPress={() => moveMonth(1)} style={[styles.monthArrow, { backgroundColor: palette.accentSoft }]} accessibilityLabel="Келесі ай"><ArrowRight size={17} color={palette.ink} /></TouchableOpacity></View>
      <View style={styles.grid}>{weekDays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.grid}>{calendarDays.map((day, index) => {
        if (day === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
        const date = `${month}-${String(day).padStart(2, '0')}`; const item = activity[date]; const isToday = date === localDate(); const isSelected = date === selected;
        return <TouchableOpacity key={date} onPress={() => setSelected(date)} onLongPress={() => router.replace({ pathname: '/(tabs)/journal', params: { date } })} style={styles.dayCell} accessibilityRole="button" accessibilityLabel={`${date}${item ? ', белсенділік бар' : ''}`}>
          <View style={[styles.dayNumber, isToday ? styles.todayCircle : null, isSelected ? styles.selectedCircle : null, !isSelected ? { backgroundColor: palette.accentSoft } : null]}><Text style={[styles.dayText, { color: palette.ink }, isSelected ? { color: '#FFF9F1' } : null, isToday && !isSelected ? { color: palette.accent, fontWeight: '800' } : null]}>{day}</Text></View>
          <View style={styles.dots}>{item?.entries.length ? <View style={[styles.dot, { backgroundColor: isSelected ? '#F5DDAF' : '#A76B45' }]} /> : null}{item?.tasks ? <View style={[styles.dot, { backgroundColor: isSelected ? '#D7E5D6' : '#638267' }]} /> : null}{item?.reviews ? <View style={[styles.dot, { backgroundColor: isSelected ? '#DAD5EC' : '#85749F' }]} /> : null}{moods[date] ? <Text style={styles.moodTiny}>{moods[date]}</Text> : null}</View>
        </TouchableOpacity>;
      })}</View>
    </Card>
    <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#A76B45' }]} /><Text style={styles.legendText}>Күнделік</Text></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#638267' }]} /><Text style={styles.legendText}>Жоспар</Text></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#85749F' }]} /><Text style={styles.legendText}>Сөз қайталау</Text></View></View>
    <Text style={styles.sectionTitle}>{new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(`${selected}T12:00:00`))}</Text>
    <Card style={styles.selectedCard}>
      {selectedActivity.entries.length ? <TouchableOpacity style={styles.activityRow} onPress={() => router.replace({ pathname: '/(tabs)/journal', params: { date: selected } })}><View style={[styles.activityIcon, { backgroundColor: '#F1E5D8' }]}><BookOpen size={17} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.activityTitle}>Күнделік беті бар</Text><Text style={styles.activitySub}>{selectedActivity.entries.length} жазба {moods[selected] ? `• ${moods[selected]}` : ''}</Text></View><ArrowRight size={17} color={colors.muted} /></TouchableOpacity> : <TouchableOpacity style={styles.activityRow} onPress={() => router.replace({ pathname: '/(tabs)/journal', params: { date: selected } })}><View style={[styles.activityIcon, { backgroundColor: '#F1E5D8' }]}><BookOpen size={17} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.activityTitle}>Күнделік беті бос</Text><Text style={styles.activitySub}>Осы күнге жазба қосу</Text></View><ArrowRight size={17} color={colors.muted} /></TouchableOpacity>}
      {selectedActivity.tasks ? <View style={styles.activityRow}><View style={[styles.activityIcon, { backgroundColor: '#E6EEE4' }]}><CheckCircle2 size={17} color={colors.green} /></View><View style={{ flex: 1 }}><Text style={styles.activityTitle}>Күн жоспары</Text><Text style={styles.activitySub}>{selectedActivity.completed} / {selectedActivity.tasks} тапсырма орындалған</Text></View></View> : <View style={styles.activityRow}><View style={[styles.activityIcon, { backgroundColor: '#E6EEE4' }]}><Circle size={17} color={colors.green} /></View><View style={{ flex: 1 }}><Text style={styles.activityTitle}>Жоспар жоқ</Text><Text style={styles.activitySub}>Іс қосуды жоспардан бастаңыз</Text></View></View>}
      <View style={styles.activityRow}><View style={[styles.activityIcon, { backgroundColor: '#ECE9F3' }]}><Languages size={17} color="#85749F" /></View><View style={{ flex: 1 }}><Text style={styles.activityTitle}>Сөз қайталау</Text><Text style={styles.activitySub}>{selectedActivity.reviews} сөз қайталанды</Text></View></View>
    </Card>
    {loadedMonth !== month ? <Text style={styles.loading}>Күндер жүктелуде…</Text> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({ todayButton: { backgroundColor: '#F1E9DE', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12 }, todayText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, calendarCard: { paddingHorizontal: 10, paddingVertical: 15 }, monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, monthArrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F1EAE1', alignItems: 'center', justifyContent: 'center' }, monthTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 18, textTransform: 'capitalize', fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: `${100 / 7}%`, textAlign: 'center', color: '#9A8D7E', fontSize: 10, fontWeight: '700', paddingBottom: 8 }, dayCell: { width: `${100 / 7}%`, height: 51, alignItems: 'center', justifyContent: 'center' }, dayNumber: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, todayCircle: { borderWidth: 1, borderColor: '#C99D73' }, selectedCircle: { backgroundColor: colors.ink }, dayText: { color: colors.ink, fontSize: 12 }, dots: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 8, marginTop: 0 }, dot: { width: 4, height: 4, borderRadius: 2 }, moodTiny: { fontSize: 7, lineHeight: 8 }, legend: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendText: { color: colors.muted, fontSize: 9 }, sectionTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 17, fontWeight: '700', marginTop: 9, marginBottom: 10, textTransform: 'capitalize' }, selectedCard: { paddingVertical: 5 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1ECE4' }, activityIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, activityTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, activitySub: { color: colors.muted, fontSize: 10, marginTop: 3 }, loading: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }
});
