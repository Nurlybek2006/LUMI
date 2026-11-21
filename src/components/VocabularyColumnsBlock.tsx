import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
import type { EntryBlock } from '@/types/models';
import { colors } from '@/components/ui';

const labels: Record<string, string> = { kk: 'Қазақша', ru: 'Орысша', en: 'Ағылшынша' };
type Column = NonNullable<EntryBlock['columns']>[number];

export function VocabularyColumnsBlock({ block, editable, onChange }: { block: EntryBlock; editable: boolean; onChange?: (next: EntryBlock) => void }) {
  const columns = block.columns?.length ? block.columns : [
    { languageCode: 'kk', title: 'Қазақша', cells: [''] },
    { languageCode: 'ru', title: 'Орысша', cells: [''] },
    { languageCode: 'en', title: 'Ағылшынша', cells: [''] }
  ];
  const update = (next: Column[]) => onChange?.({ ...block, columns: next });
  const setCell = (columnIndex: number, rowIndex: number, value: string) => update(columns.map((column, index) => index !== columnIndex ? column : { ...column, cells: column.cells.map((cell, cellIndex) => cellIndex === rowIndex ? value : cell) }));
  const addColumn = () => {
    if (columns.length >= 8) return;
    const code = `lang${columns.length + 1}`;
    update([...columns, { languageCode: code, title: code, cells: Array.from({ length: Math.max(1, columns[0]?.cells.length ?? 1) }, () => '') }]);
  };
  const shiftColumn = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= columns.length) return;
    const next = [...columns]; [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]; update(next);
  };
  const rows = Math.max(1, ...columns.map((column) => column.cells.length));
  return <View style={styles.wrap}>
    {editable ? <View style={styles.actions}><Text style={styles.hint}>Тіл бағандары</Text><TouchableOpacity onPress={() => columns.length > 2 && update(columns.slice(0, -1))} disabled={columns.length <= 2}><X size={17} color={columns.length <= 2 ? '#C8BFB5' : colors.muted} /></TouchableOpacity><TouchableOpacity onPress={addColumn} disabled={columns.length >= 8}><Plus size={17} color={colors.accent} /></TouchableOpacity></View> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled"><View style={styles.table}>
      <View style={styles.row}>{columns.map((column, columnIndex) => <View key={`${column.languageCode}-${columnIndex}`} style={[styles.cell, styles.header, columnIndex < columns.length - 1 ? styles.separator : null]}>
        {editable ? <><TextInput value={column.languageCode} onChangeText={(languageCode) => update(columns.map((item, index) => index === columnIndex ? { ...item, languageCode } : item))} placeholder="kk" style={styles.codeInput} autoCapitalize="none" accessibilityLabel="Тіл коды" /><TextInput value={column.title} onChangeText={(title) => update(columns.map((item, index) => index === columnIndex ? { ...item, title } : item))} placeholder={labels[column.languageCode] ?? column.languageCode} style={styles.titleInput} accessibilityLabel="Баған атауы" /><View style={styles.order}><TouchableOpacity onPress={() => shiftColumn(columnIndex, -1)} disabled={columnIndex === 0}><ChevronLeft size={14} color={columnIndex === 0 ? '#C8BFB5' : colors.accent} /></TouchableOpacity><TouchableOpacity onPress={() => shiftColumn(columnIndex, 1)} disabled={columnIndex === columns.length - 1}><ChevronRight size={14} color={columnIndex === columns.length - 1 ? '#C8BFB5' : colors.accent} /></TouchableOpacity></View></> : <Text style={styles.title}>{column.title || labels[column.languageCode] || column.languageCode}</Text>}
      </View>)}</View>
      {Array.from({ length: rows }, (_, rowIndex) => <View key={rowIndex} style={styles.row}>{columns.map((column, columnIndex) => <View key={`${column.languageCode}-${columnIndex}`} style={[styles.cell, columnIndex < columns.length - 1 ? styles.separator : null]}>
        {editable ? <TextInput multiline value={column.cells[rowIndex] ?? ''} onChangeText={(value) => setCell(columnIndex, rowIndex, value)} placeholder="Сөз не тіркес" style={styles.valueInput} textAlignVertical="top" accessibilityLabel={`${column.title || column.languageCode}, ${rowIndex + 1}-жол`} /> : <Text style={styles.value}>{column.cells[rowIndex] ?? ''}</Text>}
      </View>)}</View>)}
      {editable ? <TouchableOpacity onPress={() => update(columns.map((column) => ({ ...column, cells: [...column.cells, ''] })))} style={styles.addRow}><Plus size={15} color={colors.accent} /><Text style={styles.addLabel}>Жол қосу</Text></TouchableOpacity> : null}
    </View></ScrollView>
  </View>;
}

const styles = StyleSheet.create({ wrap: { borderWidth: 1, borderColor: '#E8DED2', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFCF7' }, actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 13, paddingHorizontal: 11, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#EEE5DA' }, hint: { flex: 1, color: colors.muted, fontSize: 11 }, table: { minWidth: '100%' }, row: { flexDirection: 'row' }, cell: { width: 152, minHeight: 48, padding: 9, justifyContent: 'center' }, separator: { borderRightWidth: 1, borderRightColor: '#D9CBBB' }, header: { backgroundColor: '#F3ECE2', minHeight: 51, borderBottomWidth: 1, borderBottomColor: '#E1D6C9' }, order: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2, gap: 4 }, title: { color: colors.ink, fontWeight: '700', fontSize: 12 }, codeInput: { color: colors.muted, fontSize: 9, padding: 0, height: 15 }, titleInput: { color: colors.ink, fontSize: 12, fontWeight: '700', padding: 0, height: 22 }, valueInput: { color: colors.ink, minHeight: 32, padding: 0, fontSize: 14, lineHeight: 20 }, value: { color: colors.ink, fontSize: 14, lineHeight: 20 }, addRow: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 }, addLabel: { color: colors.accent, fontSize: 11, fontWeight: '700' } });
