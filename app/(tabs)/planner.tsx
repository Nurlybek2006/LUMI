import { useCallback, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock3, CopyPlus, ListTodo, Plus, Star, X } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, TextField, colors } from '@/components/ui';
import { addTask, deleteTask, listTasks, moveTask, reorderTask, updateTask } from '@/database/repository';
import { addLocalDays, localDate } from '@/utils/core';
import type { PlannerTask } from '@/types/models';

export default function PlannerScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate = typeof params.date === 'string' ? params.date : localDate();
  return <PlannerForDate key={initialDate} initialDate={initialDate} />;
}

function PlannerForDate({ initialDate }: { initialDate: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState(0);
  const [saving, setSaving] = useState(false);
  const done = tasks.filter((task) => task.completed).length;
  const ratio = tasks.length ? done / tasks.length : 0;
  const dateTitle = date === localDate() ? 'Бүгін' : date === addLocalDays(localDate(), 1) ? 'Ертең' : new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(`${date}T12:00:00`));

  const refresh = useCallback(async () => { setTasks(await listTasks(db, date)); }, [db, date]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const stepDate = (days: number) => setDate((value) => addLocalDays(value, days));
  const openAdd = () => { setEditing(null); setTitle(''); setTime(''); setPriority(0); setModal(true); };
  const openEdit = (task: PlannerTask) => { setEditing(task); setTitle(task.title); setTime(task.dueTime ?? ''); setPriority(task.priority); setModal(true); };
  const save = async () => {
    if (!title.trim()) return;
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) { Alert.alert('Уақытты тексеріңіз', 'Уақытты сағат:минут үлгісінде енгізіңіз, мысалы 09:30.'); return; }
    setSaving(true);
    try {
      if (editing) await updateTask(db, editing.id, { title: title.trim(), priority, dueTime: time || null });
      else await addTask(db, date, title.trim(), priority, time || null);
      setModal(false); await refresh();
    } catch (error) { Alert.alert('Жоспар сақталмады', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
    finally { setSaving(false); }
  };
  const carryForward = async () => {
    const unfinished = tasks.filter((task) => !task.completed);
    if (!unfinished.length) return;
    Alert.alert('Орындалмаған істерді көшіру керек пе?', `${unfinished.length} тапсырма ${addLocalDays(date, 1)} күніне көшеді.`, [{ text: 'Болдырмау', style: 'cancel' }, { text: 'Көшіру', onPress: () => { void Promise.all(unfinished.map((task) => moveTask(db, task, addLocalDays(date, 1)))).then(refresh); } }]);
  };

  return <AppScreen title="Күн жоспары" subtitle="Кішкентай қадамдар да алға бастырады" right={<TouchableOpacity onPress={() => router.push('/calendar')} style={styles.headerButton}><ListTodo size={18} color={colors.ink} /></TouchableOpacity>}>
    <View style={styles.daySwitch}><TouchableOpacity onPress={() => stepDate(-1)} style={styles.dayArrow}><ArrowLeft size={18} color={colors.ink} /></TouchableOpacity><View style={styles.dayTitleWrap}><Text style={styles.dayTitle}>{dateTitle}</Text><Text style={styles.dayDate}>{new Intl.DateTimeFormat('kk-KZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))}</Text></View><TouchableOpacity onPress={() => stepDate(1)} style={styles.dayArrow} disabled={date >= localDate()}><ArrowRight size={18} color={date >= localDate() ? '#C6BDB3' : colors.ink} /></TouchableOpacity></View>
    <View style={styles.quickDays}><TouchableOpacity onPress={() => setDate(localDate())} style={[styles.quickDay, date === localDate() ? styles.quickDayActive : null]}><Text style={[styles.quickText, date === localDate() ? styles.quickTextActive : null]}>Бүгін</Text></TouchableOpacity><TouchableOpacity onPress={() => setDate(addLocalDays(localDate(), 1))} style={[styles.quickDay, date === addLocalDays(localDate(), 1) ? styles.quickDayActive : null]}><Text style={[styles.quickText, date === addLocalDays(localDate(), 1) ? styles.quickTextActive : null]}>Ертең</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push('/calendar')} style={styles.quickDay}><Text style={styles.quickText}>Күнтізбе</Text></TouchableOpacity></View>
    <Card style={styles.progressCard} color="#EDE5DA"><View style={styles.progressHeader}><View><Text style={styles.progressTitle}>Бүгінгі қозғалыс</Text><Text style={styles.progressSub}>{done} / {tasks.length} тапсырма орындалды</Text></View><View style={styles.progressCircle}><Text style={styles.progressPercent}>{Math.round(ratio * 100)}%</Text></View></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} /></View></Card>
    <View style={styles.tasksHeader}><Text style={styles.sectionTitle}>Істер тізімі</Text><Text style={styles.count}>{tasks.length} тапсырма</Text></View>
    {tasks.length ? tasks.map((task, index) => <Card key={task.id} style={[styles.taskCard, task.completed ? styles.doneCard : null]}>
      <TouchableOpacity onPress={() => void updateTask(db, task.id, { completed: !task.completed }).then(refresh)} style={styles.checkButton} accessibilityRole="checkbox" accessibilityState={{ checked: task.completed }} accessibilityLabel={task.completed ? 'Орындалған тапсырма' : 'Тапсырманы орындау'}>{task.completed ? <CheckCircle2 size={23} color={colors.green} /> : <Circle size={23} color="#C6B7A5" />}</TouchableOpacity>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => openEdit(task)} onLongPress={() => Alert.alert(task.title, 'Тапсырманы өшіру керек пе?', [{ text: 'Болдырмау', style: 'cancel' }, { text: 'Өшіру', style: 'destructive', onPress: () => { void deleteTask(db, task.id).then(refresh); } }])}>
        <Text style={[styles.taskTitle, task.completed ? styles.taskTitleDone : null]}>{task.title}</Text><View style={styles.taskMeta}>{task.dueTime ? <View style={styles.timeRow}><Clock3 size={12} color={colors.muted} /><Text style={styles.timeText}>{task.dueTime}</Text></View> : null}{task.priority ? <View style={styles.priorityRow}><Star size={12} color="#B7864A" fill="#B7864A" /><Text style={styles.priorityText}>Маңызды</Text></View> : null}</View>
      </TouchableOpacity>
      <View style={styles.orderButtons}><TouchableOpacity onPress={() => void reorderTask(db, date, task.id, -1).then(refresh)} disabled={index === 0} accessibilityLabel="Жоғары жылжыту"><ArrowLeft size={15} color={index === 0 ? '#D9D1C9' : colors.muted} style={{ transform: [{ rotate: '90deg' }] }} /></TouchableOpacity><TouchableOpacity onPress={() => void reorderTask(db, date, task.id, 1).then(refresh)} disabled={index === tasks.length - 1} accessibilityLabel="Төмен жылжыту"><ArrowRight size={15} color={index === tasks.length - 1 ? '#D9D1C9' : colors.muted} style={{ transform: [{ rotate: '90deg' }] }} /></TouchableOpacity></View>
    </Card>) : <Card style={styles.emptyCard}><View style={styles.emptyIcon}><Check size={24} color={colors.green} /></View><Text style={styles.emptyTitle}>Бүгінге бос орын бар</Text><Text style={styles.emptyText}>Өзіңізге маңызды бір істен бастаңыз.</Text></Card>}
    <PrimaryButton title="Тапсырма қосу" icon={<Plus size={18} color="#FFF9F1" />} onPress={openAdd} style={{ marginTop: 14 }} />
    {tasks.some((task) => !task.completed) ? <TouchableOpacity style={styles.carry} onPress={carryForward}><CopyPlus size={16} color={colors.accent} /><Text style={styles.carryText}>Орындалмағанды ертеңге көшіру</Text></TouchableOpacity> : null}
    <TouchableOpacity onPress={() => router.push('/statistics')} style={styles.history}><Text style={styles.historyText}>Тапсырмалар тарихы мен статистика</Text><ArrowRight size={15} color={colors.accent} /></TouchableOpacity>

    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}><View style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{editing ? 'Тапсырманы өзгерту' : 'Жаңа тапсырма'}</Text><TouchableOpacity onPress={() => setModal(false)}><X size={19} color={colors.muted} /></TouchableOpacity></View><TextField label="Іс атауы" value={title} onChangeText={setTitle} placeholder="Мысалы, 20 минут кітап оқу" autoFocus onSubmitEditing={() => void save()} /><TextField label="Уақыты (қалауыңызша)" value={time} onChangeText={setTime} placeholder="09:30" keyboardType="numbers-and-punctuation" maxLength={5} /><TouchableOpacity onPress={() => setPriority((v) => v ? 0 : 1)} style={styles.priorityToggle}><Star size={16} color={priority ? '#B7864A' : colors.muted} fill={priority ? '#B7864A' : 'transparent'} /><Text style={{ color: colors.ink, fontSize: 13 }}>Маңызды тапсырма</Text><View style={[styles.switch, priority ? styles.switchOn : null]}><View style={[styles.switchKnob, priority ? styles.switchKnobOn : null]} /></View></TouchableOpacity><PrimaryButton title={saving ? 'Сақталуда…' : 'Сақтау'} onPress={() => void save()} disabled={saving} /></View></View></Modal>
  </AppScreen>;
}

const styles = StyleSheet.create({ headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E9DE', borderRadius: 14 }, daySwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }, dayArrow: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EFE7DB', alignItems: 'center', justifyContent: 'center' }, dayTitleWrap: { alignItems: 'center' }, dayTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 20, fontWeight: '700', textTransform: 'capitalize' }, dayDate: { color: colors.muted, fontSize: 11, marginTop: 3 }, quickDays: { flexDirection: 'row', alignSelf: 'center', borderRadius: 13, backgroundColor: '#EEE7DE', padding: 4, gap: 3, marginTop: 7 }, quickDay: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }, quickDayActive: { backgroundColor: '#FFFCF7', shadowColor: '#594A3A', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 }, quickText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, quickTextActive: { color: colors.ink, fontWeight: '700' }, progressCard: { borderWidth: 0, marginTop: 18, padding: 15 }, progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, progressTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 }, progressSub: { color: colors.muted, fontSize: 11, marginTop: 4 }, progressCircle: { width: 47, height: 47, borderRadius: 24, backgroundColor: '#FBF7F0', alignItems: 'center', justifyContent: 'center' }, progressPercent: { color: colors.accent, fontWeight: '800', fontSize: 12 }, progressTrack: { height: 6, borderRadius: 5, backgroundColor: '#DCD2C5', marginTop: 14, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#A9805A', borderRadius: 5 }, tasksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 }, sectionTitle: { color: colors.ink, fontFamily: 'serif', fontWeight: '700', fontSize: 18 }, count: { color: colors.muted, fontSize: 11 }, taskCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, marginBottom: 8, gap: 11 }, doneCard: { backgroundColor: '#F8F6F1' }, checkButton: { width: 29, alignItems: 'center' }, taskTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' }, taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' }, taskMeta: { flexDirection: 'row', gap: 11, marginTop: 5 }, time: { color: colors.muted, fontSize: 10 }, priority: { color: '#A8793D', fontSize: 10 }, timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timeText: { color: colors.muted, fontSize: 10 }, priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, priorityText: { color: '#A8793D', fontSize: 10 }, orderButtons: { justifyContent: 'space-between', height: 43, paddingVertical: 4 }, emptyCard: { alignItems: 'center', paddingVertical: 26, marginTop: 3 }, emptyIcon: { width: 51, height: 51, backgroundColor: '#EBF0E9', borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.ink, fontFamily: 'serif', fontWeight: '700', fontSize: 17, marginTop: 12 }, emptyText: { color: colors.muted, fontSize: 12, marginTop: 5 }, carry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 13 }, carryText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, history: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 10, padding: 10 }, historyText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, modalShade: { flex: 1, backgroundColor: '#1D1915A0', justifyContent: 'center', padding: 22 }, modalCard: { backgroundColor: colors.background, borderRadius: 22, padding: 20, gap: 15 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 19, fontWeight: '700' }, priorityToggle: { flexDirection: 'row', alignItems: 'center', gap: 9 }, switch: { marginLeft: 'auto', width: 38, height: 22, backgroundColor: '#DDD3C7', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 }, switchOn: { backgroundColor: '#B98C5A' }, switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'white' }, switchKnobOn: { alignSelf: 'flex-end' }
});
