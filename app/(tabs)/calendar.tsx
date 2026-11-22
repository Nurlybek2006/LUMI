import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Circle, Plus } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, useAppAppearance, ThemedText as Text, ThemedView as View } from '@/components/ui';
import { addLocalDays, localDate } from '@/utils/core';
import { currentMonthKey, monthGrid, moveCalendarSelection, shiftMonth, visibleCalendarDates, weekStart, type CalendarMode } from '@/utils/calendar';

type DayActivity = { entries: { id: string; title: string; notebookId: string }[]; tasks: { id: string; title: string; completed: boolean; dueTime: string | null; notebookId: string | null }[] };
const weekDays = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жс'];
const emptyActivity = (): DayActivity => ({ entries: [], tasks: [] });

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ date?: string }>();
  const { palette } = useAppAppearance();
  const [mode, setMode] = useState<CalendarMode>('month');
  const [month, setMonth] = useState(currentMonthKey);
  const [selected, setSelected] = useState(() => typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(params.date) ? params.date : localDate());
  const [activity, setActivity] = useState<Record<string, DayActivity>>({});
  const [loadedRange, setLoadedRange] = useState('');
  const dates = useMemo(() => visibleCalendarDates(mode, selected, month), [mode, month, selected]);
  const rangeStart = dates[0] ?? localDate();
  const rangeEnd = dates.at(-1) ?? rangeStart;
  const rangeKey = `${rangeStart}:${rangeEnd}`;

  const refresh = useCallback(async () => {
    try {
      const [entries, tasks] = await Promise.all([
        db.getAllAsync<{ id: string; entry_date: string; title: string; notebook_id: string }>('SELECT id,entry_date,title,notebook_id FROM entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date,updated_at DESC', rangeStart, rangeEnd),
        db.getAllAsync<{ id: string; task_date: string; title: string; completed: number; due_time: string | null; notebook_id: string | null }>('SELECT id,task_date,title,completed,due_time,notebook_id FROM tasks WHERE task_date BETWEEN ? AND ? ORDER BY task_date,sort_order,created_at', rangeStart, rangeEnd)
      ]);
      const next: Record<string, DayActivity> = {};
      for (const row of entries) { (next[row.entry_date] ??= emptyActivity()).entries.push({ id: row.id, title: row.title, notebookId: row.notebook_id }); }
      for (const row of tasks) { (next[row.task_date] ??= emptyActivity()).tasks.push({ id: row.id, title: row.title, completed: Boolean(row.completed), dueTime: row.due_time, notebookId: row.notebook_id }); }
      setActivity(next);
      setLoadedRange(rangeKey);
    } catch (error) {
      console.error('[LUMI calendar] Күнтізбе деректерін жүктеу қатесі', error);
      setActivity({});
      setLoadedRange(rangeKey);
    }
  }, [db, rangeEnd, rangeKey, rangeStart]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const selectDate = (date: string) => {
    setSelected(date);
    setMonth(date.slice(0, 7));
  };
  const movePeriod = (delta: -1 | 1) => {
    if (mode === 'week') {
      const nextDate = moveCalendarSelection(selected, mode, delta);
      setSelected(nextDate);
      setMonth(nextDate.slice(0, 7));
    } else {
      const nextMonth = shiftMonth(month, delta);
      setMonth(nextMonth);
      if (!selected.startsWith(nextMonth)) setSelected(`${nextMonth}-01`);
    }
  };
  const openPlanner = (notebookId?: string, add = false) => router.push({ pathname: '/(tabs)/planner', params: { date: selected, ...(notebookId ? { notebookId } : {}), ...(add ? { add: '1' } : {}) } });
  const openJournal = (notebookId?: string) => router.push({ pathname: '/(tabs)/journal', params: { date: selected, ...(notebookId ? { notebookId } : {}) } });
  const selectedActivity = activity[selected] ?? emptyActivity();
  const periodTitle = mode === 'month'
    ? new Intl.DateTimeFormat('kk-KZ', { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`))
    : `${new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'short' }).format(new Date(`${weekStart(selected)}T12:00:00`))} – ${new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${addLocalDays(weekStart(selected), 6)}T12:00:00`))}`;
  const visibleGrid = mode === 'month' ? monthGrid(month) : dates;

  return <AppScreen title="Күнтізбе" subtitle="Күнделік пен жоспарды бір жерден қараңыз" right={<TouchableOpacity style={[styles.todayButton, { backgroundColor: palette.accentSoft }]} onPress={() => { setMonth(currentMonthKey()); setSelected(localDate()); }} accessibilityRole="button"><Text style={[styles.todayText, { color: palette.ink }]}>Бүгін</Text></TouchableOpacity>}>
    <View style={[styles.modeSwitch, { backgroundColor: palette.accentSoft }]}>
      {(['week', 'month'] as const).map((value) => <TouchableOpacity key={value} onPress={() => setMode(value)} style={[styles.modeButton, mode === value ? { backgroundColor: palette.paper } : null]} accessibilityRole="button" accessibilityState={{ selected: mode === value }}><Text style={[styles.modeText, { color: mode === value ? palette.ink : palette.muted }]}>{value === 'week' ? 'Апта' : 'Ай'}</Text></TouchableOpacity>)}
    </View>
    <Card style={styles.calendarCard}>
      <View style={styles.monthBar}><TouchableOpacity onPress={() => movePeriod(-1)} style={[styles.monthArrow, { backgroundColor: palette.accentSoft }]} accessibilityRole="button" accessibilityLabel="Алдыңғы кезең"><ArrowLeft size={17} color={palette.ink} /></TouchableOpacity><Text style={[styles.monthTitle, { color: palette.ink }]}>{periodTitle}</Text><TouchableOpacity onPress={() => movePeriod(1)} style={[styles.monthArrow, { backgroundColor: palette.accentSoft }]} accessibilityRole="button" accessibilityLabel="Келесі кезең"><ArrowRight size={17} color={palette.ink} /></TouchableOpacity></View>
      <View style={styles.grid}>{weekDays.map((day) => <Text key={day} style={[styles.weekday, { color: palette.muted }]}>{day}</Text>)}</View>
      <View style={styles.grid}>{visibleGrid.map((date, index) => {
        if (date === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
        const day = Number(date.slice(-2)); const item = activity[date]; const isToday = date === localDate(); const isSelected = date === selected;
        return <TouchableOpacity key={date} onPress={() => selectDate(date)} style={styles.dayCell} accessibilityRole="button" accessibilityState={{ selected: isSelected }} accessibilityLabel={`${date}${item?.tasks.length ? `, ${item.tasks.length} тапсырма` : ''}${item?.entries.length ? ', күнделік жазбасы бар' : ''}`}>
          <View style={[styles.dayNumber, { backgroundColor: isSelected ? palette.ink : 'transparent', borderColor: isToday ? palette.accent : 'transparent' }, isToday ? styles.todayCircle : null]}><Text style={[styles.dayText, { color: isSelected ? palette.paper : isToday ? palette.accent : palette.ink, fontWeight: isToday || isSelected ? '800' : '500' }]}>{day}</Text></View>
          <View style={styles.dots}>{item?.entries.length ? <View style={[styles.dot, { backgroundColor: palette.accent }]} /> : null}{item?.tasks.length ? <View style={[styles.dot, { backgroundColor: palette.green }]} /> : null}{item?.tasks.some((task) => task.completed) ? <View style={[styles.dot, { backgroundColor: palette.muted }]} /> : null}</View>
        </TouchableOpacity>;
      })}</View>
    </Card>
    <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: palette.accent }]} /><Text style={[styles.legendText, { color: palette.muted }]}>Күнделік</Text></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: palette.green }]} /><Text style={[styles.legendText, { color: palette.muted }]}>Тапсырма</Text></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: palette.muted }]} /><Text style={[styles.legendText, { color: palette.muted }]}>Орындалған</Text></View></View>
    <Text style={[styles.sectionTitle, { color: palette.ink }]}>{new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'long', weekday: 'long', year: 'numeric' }).format(new Date(`${selected}T12:00:00`))}</Text>
    <Card style={styles.selectedCard}>
      <View style={styles.detailHeading}><CalendarDays size={17} color={palette.accent} /><Text style={[styles.activityTitle, { color: palette.ink }]}>Күнделік жазбалары</Text></View>
      {selectedActivity.entries.length ? selectedActivity.entries.map((entry) => <TouchableOpacity key={entry.id} style={[styles.activityRow, { borderBottomColor: palette.line }]} onPress={() => openJournal(entry.notebookId)}><View style={[styles.activityIcon, { backgroundColor: palette.accentSoft }]}><BookOpen size={17} color={palette.accent} /></View><View style={{ flex: 1 }}><Text style={[styles.activityTitle, { color: palette.ink }]}>{entry.title || 'Атаусыз жазба'}</Text><Text style={[styles.activitySub, { color: palette.muted }]}>Күнделікке өту</Text></View><ArrowRight size={17} color={palette.muted} /></TouchableOpacity>) : <Text style={[styles.emptyText, { color: palette.muted }]}>Бұл күнге жазба жоқ.</Text>}
      <View style={styles.detailHeading}><CheckCircle2 size={17} color={palette.green} /><Text style={[styles.activityTitle, { color: palette.ink }]}>Тапсырмалар · {selectedActivity.tasks.filter((task) => task.completed).length}/{selectedActivity.tasks.length}</Text></View>
      {selectedActivity.tasks.length ? selectedActivity.tasks.map((task) => <TouchableOpacity key={task.id} style={[styles.taskRow, { borderBottomColor: palette.line }]} onPress={() => openPlanner(task.notebookId ?? undefined)}><View style={{ width: 23 }}>{task.completed ? <CheckCircle2 size={18} color={palette.green} /> : <Circle size={18} color={palette.muted} />}</View><Text style={[styles.taskTitle, { color: palette.ink }, task.completed ? styles.completedTask : null]}>{task.title}</Text>{task.dueTime ? <Text style={[styles.taskTime, { color: palette.muted }]}>{task.dueTime}</Text> : null}</TouchableOpacity>) : <Text style={[styles.emptyText, { color: palette.muted }]}>Бұл күнге тапсырма жоқ.</Text>}
      <View style={styles.actions}><TouchableOpacity onPress={() => openPlanner(undefined, true)} style={[styles.actionButton, { backgroundColor: palette.accentSoft }]}><Plus size={15} color={palette.accent} /><Text style={[styles.actionText, { color: palette.ink }]}>Тапсырма қосу</Text></TouchableOpacity><TouchableOpacity onPress={() => openJournal()} style={[styles.actionButton, { backgroundColor: palette.accentSoft }]}><BookOpen size={15} color={palette.accent} /><Text style={[styles.actionText, { color: palette.ink }]}>Күнделік ашу</Text></TouchableOpacity></View>
    </Card>
    <PrimaryButton title="Күн жоспарын ашу" onPress={() => openPlanner()} style={{ marginTop: 12 }} />
    {loadedRange !== rangeKey ? <Text style={[styles.loading, { color: palette.muted }]}>Күндер жүктелуде…</Text> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({ todayButton: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12 }, todayText: { fontSize: 12, fontWeight: '700' }, modeSwitch: { flexDirection: 'row', alignSelf: 'center', borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 }, modeButton: { minWidth: 82, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 9 }, modeText: { fontSize: 12, fontWeight: '700' }, calendarCard: { paddingHorizontal: 10, paddingVertical: 15 }, monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, monthArrow: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, monthTitle: { fontFamily: 'serif', fontSize: 18, textTransform: 'capitalize', fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, fontWeight: '700', paddingBottom: 8 }, dayCell: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' }, dayNumber: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 }, todayCircle: { borderWidth: 1 }, dayText: { fontSize: 12 }, dots: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 7 }, dot: { width: 4, height: 4, borderRadius: 2 }, legend: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendText: { fontSize: 9 }, sectionTitle: { fontFamily: 'serif', fontSize: 17, fontWeight: '700', marginTop: 9, marginBottom: 10, textTransform: 'capitalize' }, selectedCard: { paddingVertical: 8 }, detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 9, paddingBottom: 4 }, activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, activityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, activityTitle: { fontSize: 13, fontWeight: '700' }, activitySub: { fontSize: 10, marginTop: 3 }, taskRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth }, taskTitle: { flex: 1, fontSize: 12 }, completedTask: { textDecorationLine: 'line-through', opacity: 0.75 }, taskTime: { fontSize: 10 }, emptyText: { fontSize: 11, paddingVertical: 9 }, actions: { flexDirection: 'row', gap: 8, paddingTop: 12 }, actionButton: { minHeight: 39, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, paddingHorizontal: 6 }, actionText: { fontSize: 10, fontWeight: '700' }, loading: { fontSize: 10, textAlign: 'center', marginTop: 8 } });
