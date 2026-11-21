import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CheckCircle2, Circle, ListTodo } from 'lucide-react-native';
import { AppScreen, Card, colors, useAppAppearance, ThemedText as Text, ThemedView as View } from '@/components/ui';

type Task = { id: string; task_date: string; title: string; completed: number; due_time: string | null };
type Filter = 'all' | 'open' | 'done';

export default function TasksScreen() {
  const db = useSQLiteContext();
  const { palette } = useAppAppearance();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const refresh = useCallback(async () => {
    setTasks(await db.getAllAsync<Task>('SELECT id,task_date,title,completed,due_time FROM tasks ORDER BY task_date DESC, completed ASC, due_time ASC, sort_order ASC'));
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const shown = useMemo(() => tasks.filter((task) => filter === 'all' || (filter === 'done' ? Boolean(task.completed) : !task.completed)), [tasks, filter]);
  const filters: [Filter, string][] = [['all', 'Барлығы'], ['open', 'Орындалмаған'], ['done', 'Орындалған']];
  return <AppScreen title="Барлық тапсырма" subtitle={`${shown.length} іс`}>
    <View style={styles.filters}>{filters.map(([key, label]) => <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, { backgroundColor: filter === key ? palette.ink : palette.accentSoft }]} accessibilityRole="button" accessibilityState={{ selected: filter === key }}><Text style={[styles.filterText, { color: filter === key ? '#FFF9F1' : palette.ink }]}>{label}</Text></Pressable>)}</View>
    {shown.map((task) => <Pressable key={task.id} onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} accessibilityRole="button" accessibilityLabel={`${task.title}, ${task.task_date}${task.completed ? ', орындалған' : ', орындалмаған'}`}><Card style={styles.row}><View style={[styles.icon, { backgroundColor: palette.accentSoft }]}>{task.completed ? <CheckCircle2 size={19} color={palette.green} /> : <Circle size={19} color={palette.accent} />}</View><View style={{ flex: 1 }}><Text style={[styles.title, { color: palette.ink }, Boolean(task.completed) && { color: palette.muted, textDecorationLine: 'line-through' }]}>{task.title}</Text><Text style={[styles.meta, { color: palette.muted }]}>{task.task_date}{task.due_time ? ` · ${task.due_time}` : ''}</Text></View></Card></Pressable>)}
    {!shown.length ? <Card style={styles.empty}><ListTodo size={24} color={colors.muted} /><Text style={styles.meta}>Бұл сүзгіде тапсырма жоқ.</Text></Card> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({ filters: { flexDirection: 'row', gap: 7, marginBottom: 14 }, filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, backgroundColor: '#EFE8DE' }, filterActive: { backgroundColor: '#4B3028' }, filterText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, filterTextActive: { color: '#FFF9F1' }, row: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8, minHeight: 64 }, icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F1E9DE' }, title: { color: colors.ink, fontWeight: '700', fontSize: 14 }, done: { color: colors.muted, textDecorationLine: 'line-through' }, meta: { color: colors.muted, fontSize: 11, marginTop: 4 }, empty: { alignItems: 'center', gap: 10, padding: 24 } });
