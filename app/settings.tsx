import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Directory, Paths } from 'expo-file-system';
import { BellRing, BookOpen, Check, Fingerprint, Languages, LockKeyhole, Moon, Palette, ShieldCheck, Smartphone, Upload, Download } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, TextField, colors, useAppAppearance, ThemedText as Text, ThemedView as View } from '@/components/ui';
import { readSetting, writeSetting } from '@/database/settings';
import { themes, themeIds } from '@/themes/registry';
import type { ThemeId } from '@/types/models';
import { setPin, removePin, hasPin, setBiometricEnabled } from '@/services/security';
import { DEFAULT_AUTO_LOCK_MINUTES } from '@/services/lockPolicy';
import { useSession } from '@/store/session';
import { exportBackup, importBackup } from '@/services/backup';
import { scheduleDailyReminder } from '@/services/notifications';
import type { ReactNode } from 'react';
import type { AppearanceMode } from '@/services/appearance';
import { LumiConfirmDialog, LumiDialog } from '@/components/LumiModal';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const appearance = useAppAppearance();
  const [pageAnimation, setPageAnimation] = useState('smooth');
  const [pinOn, setPinOn] = useState(false);
  const [biometrics, setBiometrics] = useState(false);
  const [autoLock, setAutoLock] = useState(String(DEFAULT_AUTO_LOCK_MINUTES));
  const [defaultTheme, setDefaultTheme] = useState<ThemeId>('warm');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [storageSize, setStorageSize] = useState(0);
  const [working, setWorking] = useState(false);
  const [removePinConfirm, setRemovePinConfirm] = useState(false);

  const refresh = useCallback(async () => {
    const [pinConfigured, lockDelay, selectedTheme, motion, reminderOn, bioEnabled, animation] = await Promise.all([
      hasPin(), readSetting(db, 'auto_lock_minutes'), readSetting(db, 'default_theme'), readSetting(db, 'reduced_motion'), readSetting(db, 'local_reminder'), import('@/services/security').then((module) => module.biometricEnabled()), readSetting(db, 'page_animation')
    ]);
    setPinOn(pinConfigured); setAutoLock(lockDelay ?? String(DEFAULT_AUTO_LOCK_MINUTES)); setDefaultTheme((selectedTheme as ThemeId) || 'warm'); setReducedMotion(motion === 'true'); setReminder(reminderOn === 'true'); setBiometrics(bioEnabled); setPageAnimation(animation ?? 'smooth');
    const mediaDir = new Directory(Paths.document, 'media'); setStorageSize(mediaDir.size ?? 0);
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const savePin = async () => {
    if (pin.length < 4 || pin !== pinAgain) { Alert.alert('PIN тексеріңіз', 'Төрт немесе одан көп санды екі рет бірдей енгізіңіз.'); return; }
    setWorking(true);
    try { await setPin(pin); setPinOn(true); setPinModal(false); setPinValue(''); setPinAgain(''); useSession.getState().lock(); }
    catch (error) { Alert.alert('PIN орнатылмады', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
    finally { setWorking(false); }
  };
  const togglePin = (value: boolean) => {
    if (value) setPinModal(true);
    else setRemovePinConfirm(true);
  };
  const toggleBiometric = async (value: boolean) => {
    if (!pinOn) { Alert.alert('Алдымен PIN орнатыңыз', 'Биометрия PIN қорғанысымен бірге жұмыс істейді.'); return; }
    if (value) {
      const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (!hardware || !enrolled) { Alert.alert('Биометрия қолжетімсіз', 'Құрылғыда саусақ ізі немесе бет тану бапталуы керек.'); return; }
    }
    await setBiometricEnabled(value); setBiometrics(value);
  };
  const toggleReminder = async (value: boolean) => {
    if (!value) {
      const id = await readSetting(db, 'reminder_id'); if (id) await Notifications.cancelScheduledNotificationAsync(id);
      await writeSetting(db, 'local_reminder', 'false'); setReminder(false); return;
    }
    try { const id = await scheduleDailyReminder(); await writeSetting(db, 'reminder_id', id); await writeSetting(db, 'local_reminder', 'true'); setReminder(true); }
    catch (error) { Alert.alert('Еске салу қосылмады', error instanceof Error ? error.message : 'Рұқсатты тексеріңіз.'); }
  };
  const backup = async () => {
    setWorking(true);
    try { await exportBackup(db); Alert.alert('Сақтық көшірме дайын', 'LUMI архиві бөлісу терезесіне жіберілді. Файлды құрылғыдан тыс жерде сақтаңыз.'); }
    catch (error) { Alert.alert('Көшірме жасалмады', error instanceof Error ? error.message : 'Қайталап көріңіз.'); }
    finally { setWorking(false); }
  };
  const askImport = async () => {
    setWorking(true);
    try {
      const result = await importBackup(db, (counts) => new Promise((resolve) => Alert.alert('Бар деректі ауыстыру керек пе?', `${counts.notebookCount} дәптер мен ${counts.entryCount} жазба қалпына келтіріледі. Қазіргі кітапхана толығымен ауысады.`, [{ text: 'Болдырмау', style: 'cancel', onPress: () => resolve(false) }, { text: 'Ауыстыру', style: 'destructive', onPress: () => resolve(true) }])));
      if (result.cancelled) return;
      await refresh(); Alert.alert('Қалпына келтіру аяқталды', `${result.notebookCount} дәптер және ${result.entryCount} жазба қалпына келді.`);
    } catch (error) { Alert.alert('Көшірме оқылмады', error instanceof Error ? error.message : 'Файл пішімі немесе бүтіндігі жарамсыз.'); }
    finally { setWorking(false); }
  };

  return <AppScreen title="Баптаулар" subtitle="Жеке кеңістігіңізді өзіңізге ыңғайлаңыз">
    <Text style={[styles.section, { color: appearance.palette.ink }]}>Қауіпсіздік және құпиялылық</Text>
    <Card style={styles.settingsCard}>
      <SettingRow icon={<LockKeyhole size={18} color={colors.accent} />} title="PIN құлпы" subtitle={pinOn ? 'Қосылған • қолданба фоннан ашылғанда құлыпталады' : 'Қалауыңызша 4–8 сандық PIN орнату'}><Switch value={pinOn} onValueChange={togglePin} trackColor={{ true: '#AF865C' }} /></SettingRow>
      <SettingRow icon={<Fingerprint size={18} color="#6B8060" />} title="Биометриялық ашу" subtitle={pinOn ? 'Құрылғы қолдаса, саусақ ізі немесе бет тану' : 'Алдымен PIN құлпын қосыңыз'}><Switch value={biometrics} disabled={!pinOn} onValueChange={(value) => void toggleBiometric(value)} trackColor={{ true: '#AF865C' }} /></SettingRow>
      <View style={styles.settingLine}><View style={styles.settingIcon}><Smartphone size={18} color="#81709A" /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Автоматты құлыптау</Text><Text style={styles.settingSub}>Қолданба фоннан ашылғанда</Text><View style={styles.optionRow}>{([['0', 'Дереу'], ['1', '1 мин'], ['5', '5 мин'], ['15', '15 мин']] as const).map(([value, label]) => <TouchableOpacity key={value} onPress={() => { setAutoLock(value); void writeSetting(db, 'auto_lock_minutes', value); }} style={[styles.option, autoLock === value ? styles.optionActive : null]}><Text style={[styles.optionText, autoLock === value ? styles.optionTextActive : null]}>{label}</Text></TouchableOpacity>)}</View></View></View>
      <SettingRow icon={<Moon size={18} color="#81709A" />} title="Қимылды азайту" subtitle="Кітап беттері мен ауысуларда жұмсақ режим"><Switch value={reducedMotion} onValueChange={(value) => { setReducedMotion(value); void writeSetting(db, 'reduced_motion', String(value)); }} trackColor={{ true: '#AF865C' }} /></SettingRow>
    </Card>
    <Card style={styles.privacyNote}><ShieldCheck size={17} color={colors.green} /><Text style={styles.privacyCopy}>PIN құрылғының қауіпсіз сақтауында тексеру кілті ретінде сақталады. PIN кіруді шектейді, бірақ SQLite дерекқорын шифрламайды. Сақтық көшірме де шифрланбаған файл болып шығады.</Text></Card>

    <Text style={[styles.section, { color: appearance.palette.ink }]}>Көрініс</Text><Card style={styles.settingsCard}>
      <Text style={[styles.settingTitle, { color: appearance.palette.ink }]}>Қолданба көрінісі</Text><Text style={[styles.settingSub, { color: appearance.palette.muted }]}>Дәптердің жеке тақырыбы бөлек сақталады</Text><View style={styles.optionRow}>{([['light', 'Жарық'], ['dark', 'Қараңғы'], ['system', 'Жүйемен']] as [AppearanceMode, string][]).map(([value, label]) => <TouchableOpacity key={value} onPress={() => appearance.setMode(value)} style={[styles.option, { backgroundColor: value === appearance.mode ? appearance.palette.ink : appearance.palette.accentSoft }, appearance.mode === value ? styles.optionActive : null]}><Text style={[styles.optionText, { color: value === appearance.mode ? '#FFFFFF' : appearance.palette.ink }, appearance.mode === value ? styles.optionTextActive : null]}>{label}</Text></TouchableOpacity>)}</View>
      <View style={styles.settingLine}><View style={styles.settingIcon}><BookOpen size={18} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Кітап анимациясы</Text><Text style={styles.settingSub}>Бет ауыстыру тәсілін таңдаңыз</Text><View style={styles.optionRow}>{([['realistic', 'Бетті бүктеу'], ['smooth', 'Жұмсақ бұру'], ['slide', 'Сырғыту'], ['none', 'Өшіру']] as const).map(([value, label]) => <TouchableOpacity key={value} onPress={() => { setPageAnimation(value); void writeSetting(db, 'page_animation', value); }} style={[styles.option, pageAnimation === value ? styles.optionActive : null]}><Text style={[styles.optionText, pageAnimation === value ? styles.optionTextActive : null]}>{label}</Text></TouchableOpacity>)}</View><Text style={styles.settingSub}>Бүктеу кезінде бет мазмұны бір рет суретке түсіріліп, құрылғыда өңделеді.</Text></View></View>
      <View style={styles.settingLine}><View style={styles.settingIcon}><Palette size={18} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Жаңа дәптер тақырыбы</Text><Text style={styles.settingSub}>Әр дәптерге кейін жеке тақырып таңдауға болады</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeList}>{themeIds.map((id) => <TouchableOpacity key={id} onPress={() => { setDefaultTheme(id); void writeSetting(db, 'default_theme', id); }} style={[styles.themeChoice, { backgroundColor: themes[id].cover, borderColor: defaultTheme === id ? themes[id].accent : 'transparent' }]}><Text style={styles.themeChoiceName}>{themes[id].name}</Text>{defaultTheme === id ? <Check size={14} color="#FFF" /> : null}</TouchableOpacity>)}</ScrollView></View></View>
      <View style={styles.settingLine}><View style={styles.settingIcon}><Moon size={18} color="#81709A" /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Оқу бетінің көрінісі</Text><Text style={styles.settingSub}>Әр дәптерге бөлек ашық немесе түнгі тақырып таңдаңыз</Text></View></View>
      <View style={styles.settingLine}><View style={styles.settingIcon}><Languages size={18} color="#81709A" /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Қолданба тілі</Text><Text style={styles.settingSub}>Қазақша интерфейс • орысша және ағылшынша аударма ресурстары әзірленген</Text></View></View>
    </Card>

    <Text style={styles.section}>Еске салулар</Text><Card style={styles.settingsCard}><SettingRow icon={<BellRing size={18} color="#A8784E" />} title="Күнделікті еске салу" subtitle="Күн сайын 20:30 • тек осы құрылғыда"><Switch value={reminder} onValueChange={(value) => void toggleReminder(value)} trackColor={{ true: '#AF865C' }} /></SettingRow></Card>

    <Text style={styles.section}>Сақтық көшірме</Text><Card style={styles.settingsCard}><Text style={styles.backupInfo}>Дәптерлер, жазбалар, жоспарлар, сөздер және қосылған суреттер бір .lumibackup архивіне жиналады.</Text><PrimaryButton title={working ? 'Дайындалып жатыр…' : 'Сақтық көшірмені экспорттау'} icon={<Download size={17} color="#FFF9F1" />} onPress={() => void backup()} disabled={working} /><PrimaryButton title="Архивтен қалпына келтіру" icon={<Upload size={17} color={colors.ink} />} secondary onPress={() => void askImport()} disabled={working} style={{ marginTop: 9 }} /><Text style={styles.backupWarn}>Қалпына келтіру қазіргі кітапхананы ауыстырады. Архив файлын басқа құрылғыда да ашуға болады.</Text></Card>

    <Text style={styles.section}>Құрылғыдағы сақтау орны</Text><Card style={styles.storage}><View style={styles.storageIcon}><BookOpen size={18} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>LUMI медиа файлдары</Text><Text style={styles.settingSub}>{storageSize > 0 ? `${(storageSize / (1024 * 1024)).toFixed(1)} МБ` : 'Сурет файлдары әлі жоқ'}</Text></View><TouchableOpacity onPress={() => void refresh()}><Text style={styles.refresh}>Жаңарту</Text></TouchableOpacity></Card>
    <Text style={styles.about}>LUMI 1.0.0 • офлайн күнделік пен жеке кітапхана</Text>

    <LumiDialog visible={pinModal} title="Жеке PIN орнату" onClose={() => setPinModal(false)}><Text style={styles.pinHint}>4–8 сан енгізіңіз. PIN жоғалса, оны қалпына келтіру мүмкін емес.</Text><TextField label="PIN" value={pin} onChangeText={(value) => setPinValue(value.replace(/\D/gu, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" /><TextField label="PIN қайталау" value={pinAgain} onChangeText={(value) => setPinAgain(value.replace(/\D/gu, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" /><PrimaryButton title={working ? 'Сақталуда…' : 'PIN орнату'} onPress={() => void savePin()} disabled={working} style={{ marginTop: 16 }} /></LumiDialog>
    <LumiConfirmDialog visible={removePinConfirm} title="PIN құлпын алып тастау керек пе?" message="Бұл құрылғыдағы қолданбаға PIN-сіз кіруге мүмкіндік береді." confirmLabel="PIN-ді алып тастау" onClose={() => setRemovePinConfirm(false)} onConfirm={() => { setRemovePinConfirm(false); void removePin().then(() => { setPinOn(false); setBiometrics(false); }); }} />
  </AppScreen>;
}

function SettingRow({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  useAppAppearance();
  return <View style={styles.settingLine}><View style={styles.settingIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSub}>{subtitle}</Text></View>{children}</View>;
}

const styles = StyleSheet.create({ section: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 10 }, settingsCard: { paddingHorizontal: 14, paddingVertical: 4 }, settingLine: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0EBE4' }, settingIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#F1EAE1', alignItems: 'center', justifyContent: 'center' }, settingTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' }, settingSub: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 }, optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 }, option: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#F1EBE2', borderRadius: 9 }, optionActive: { backgroundColor: '#4B3028' }, optionText: { color: colors.muted, fontSize: 10, fontWeight: '600' }, optionTextActive: { color: '#FFF9F1' }, privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10, padding: 12, backgroundColor: '#EDF0E8', borderColor: '#E1E7DB' }, privacyCopy: { flex: 1, color: '#596B59', fontSize: 10, lineHeight: 15 }, themeList: { gap: 6, paddingTop: 8, paddingBottom: 2 }, themeChoice: { minWidth: 79, borderRadius: 10, borderWidth: 2, paddingVertical: 7, paddingHorizontal: 8, gap: 5, alignItems: 'center' }, themeChoiceName: { color: '#FFF', fontSize: 9, fontWeight: '700' }, backupInfo: { color: colors.muted, fontSize: 11, lineHeight: 16, paddingVertical: 11 }, backupWarn: { color: '#9A6C4D', fontSize: 10, lineHeight: 15, marginTop: 9 }, storage: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 }, storageIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F0E7DB', alignItems: 'center', justifyContent: 'center' }, refresh: { color: colors.accent, fontSize: 11, fontWeight: '700' }, about: { textAlign: 'center', color: '#A3998E', fontSize: 10, marginTop: 21, marginBottom: 12 }, pinHint: { color: colors.muted, fontSize: 11, lineHeight: 16 }
});
