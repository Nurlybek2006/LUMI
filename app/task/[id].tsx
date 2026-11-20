import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { CalendarDays, Edit3 } from 'lucide-react-native';
import { AppScreen, Card, colors } from '@/components/ui';
import { getTask } from '@/database/repository';
import type { PlannerTask } from '@/types/models';

export default function TaskReader() {
  const { id } = useLocalSearchParams<{ id: string }>(); const db = useSQLiteContext(); const [task, setTask] = useState<PlannerTask | null>(null);
  useEffect(() => { void getTask(db, id).then(setTask); }, [db, id]);
  if (!task) return <AppScreen title="Тапсырма" subtitle="Тапсырма табылмады" />;
  return <AppScreen title="Тапсырма" subtitle="Оқу режимі" right={<TouchableOpacity style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE' }} onPress={() => router.push({ pathname: '/(tabs)/planner', params: { date: task.date, ...(task.notebookId ? { notebookId: task.notebookId } : {}) } })}><Edit3 size={17} color={colors.ink} /></TouchableOpacity>}>
    <Card style={{ marginTop: 12, padding: 18 }}><Text style={{ color: colors.ink, fontFamily: 'serif', fontSize: 24, fontWeight: '700' }}>{task.title}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15 }}><CalendarDays size={16} color={colors.accent} /><Text style={{ color: colors.muted }}>{task.date}{task.dueTime ? ` · ${task.dueTime}` : ''}</Text></View><Text style={{ color: colors.accent, marginTop: 11 }}>{task.completed ? 'Орындалды' : 'Орындалмаған'}</Text><Text style={{ color: colors.muted, marginTop: 7 }}>Маңыздылығы: {task.priority}</Text></Card>
  </AppScreen>;
}
