import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BookHeart, Check, Fingerprint, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react-native';
import { AppScreen, Card, PrimaryButton, TextField, colors } from '@/components/ui';
import { themes, themeIds } from '@/themes/registry';
import type { ThemeId } from '@/types/models';
import { setPin } from '@/services/security';
import { writeSetting } from '@/database/settings';
import { updateNotebook } from '@/database/repository';

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const [theme, setTheme] = useState<ThemeId>('classic');
  const [pin, setPinValue] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (pin && (pin.length < 4 || pin !== pinAgain)) { Alert.alert('PIN тексеріңіз', 'Екі өріске бірдей, кемінде төрт сан енгізіңіз.'); return; }
    setSaving(true);
    try {
      if (pin) await setPin(pin);
      await updateNotebook(db, 'diary', { themeId: theme });
      await writeSetting(db, 'default_theme', theme);
      await writeSetting(db, 'onboarding_complete', 'true');
      router.replace('/(tabs)');
    } catch (error) { Alert.alert('Сақтау қатесі', error instanceof Error ? error.message : 'Қайта көріңіз.'); }
    finally { setSaving(false); }
  };

  return <AppScreen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>L</Text><Sparkles size={21} color="#C49A54" style={{ position: 'absolute', right: 9, top: 8 }} /></View>
        <Text style={styles.title}>LUMI</Text><Text style={styles.subtitle}>Жеке әлемің</Text>
        <Text style={styles.lead}>Ойларыңызға орын, күндеріңізге әдемі бет.</Text>
        <View style={styles.benefits}>
          <Card style={styles.benefit}><BookHeart size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>Кітаптай күнделік</Text><Text style={styles.benefitText}>Жазба, жоспар мен сөздік бір шаңырақта.</Text></View></Card>
          <Card style={styles.benefit}><ShieldCheck size={20} color={colors.green} /><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>Жеке кеңістік</Text><Text style={styles.benefitText}>Мазмұн құрылғыңызда сақталады. Интернет қажет емес.</Text></View></Card>
          <Card style={styles.benefit}><LockKeyhole size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>Өзіңіз басқарасыз</Text><Text style={styles.benefitText}>Қосымшаны өшірмес бұрын сақтық көшірме жасаңыз.</Text></View></Card>
        </View>
        <Text style={styles.section}>Алғашқы дәптер стилі</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
          {themeIds.map((id) => { const item = themes[id]; return <TouchableOpacity key={id} onPress={() => setTheme(id)} style={[styles.theme, { backgroundColor: item.cover, borderColor: theme === id ? item.accent : 'transparent' }]}><Text style={{ color: '#FFF9F1', fontFamily: 'serif', fontSize: 21 }}>{item.ornament}</Text><Text style={styles.themeName}>{item.name}</Text>{theme === id ? <Check size={14} color="#FFF9F1" style={styles.selected} /> : null}</TouchableOpacity>; })}
        </ScrollView>
        <TouchableOpacity onPress={() => setShowPin((value) => !value)} style={styles.pinToggle}><Fingerprint size={19} color={colors.accent} /><Text style={styles.pinToggleText}>{showPin ? 'PIN-ді қазір орнатпау' : 'Қосымша PIN орнату (қалауыңызша)'}</Text></TouchableOpacity>
        {showPin ? <View style={styles.pinFields}><TextField label="4–8 сандық PIN" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/gu, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" /><TextField label="PIN-ді қайталау" value={pinAgain} onChangeText={(v) => setPinAgain(v.replace(/\D/gu, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" /></View> : null}
        <PrimaryButton title={saving ? 'Дайындалып жатыр…' : 'LUMI-ді бастау'} onPress={() => void finish()} disabled={saving} style={{ marginTop: 22 }} />
        <Text style={styles.footer}>Сақтық көшірме баптаулардан қолжетімді</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </AppScreen>;
}

const styles = StyleSheet.create({ body: { padding: 24, paddingTop: 28, paddingBottom: 32 }, logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#EFE3D2', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 }, logoText: { fontFamily: 'serif', fontSize: 48, color: '#80543D', lineHeight: 56 }, title: { fontFamily: 'serif', color: colors.ink, fontSize: 31, textAlign: 'center', letterSpacing: 5 }, subtitle: { color: colors.accent, textAlign: 'center', fontSize: 13, letterSpacing: 2, marginTop: 2 }, lead: { color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: 18, marginBottom: 20 }, benefits: { gap: 9 }, benefit: { flexDirection: 'row', gap: 13, padding: 14 }, benefitTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 }, benefitText: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }, section: { color: colors.ink, fontFamily: 'serif', fontWeight: '700', marginTop: 24, marginBottom: 10, fontSize: 16 }, theme: { width: 114, height: 84, borderRadius: 13, padding: 12, borderWidth: 2, justifyContent: 'space-between' }, themeName: { color: '#FFF9F1', fontSize: 12, fontWeight: '700' }, selected: { position: 'absolute', right: 8, top: 8 }, pinToggle: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, paddingVertical: 8 }, pinToggleText: { color: colors.accent, fontSize: 13, fontWeight: '700' }, pinFields: { gap: 12, marginTop: 8 }, footer: { color: '#A69A8D', textAlign: 'center', fontSize: 11, marginTop: 14 }
});
