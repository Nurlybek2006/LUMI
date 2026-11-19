import { useEffect, useState } from 'react';
import { AppState, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { migrateDatabase } from '@/database/migrations';
import { readSetting } from '@/database/settings';
import { authenticateBiometric, biometricEnabled, hasPin, verifyPin } from '@/services/security';
import { useSession } from '@/store/session';
import { colors } from '@/components/ui';
import { Fingerprint, LockKeyhole } from 'lucide-react-native';

function AppGate() {
  const db = useSQLiteContext();
  const locked = useSession((state) => state.locked);
  const unlock = useSession((state) => state.unlock);
  const [initialized, setInitialized] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const [backgroundedAt, setBackgroundedAt] = useState<number | null>(null);
  usePreventScreenCapture(pinConfigured ? 'lumi-private' : 'lumi-public');

  useEffect(() => {
    void Promise.all([hasPin(), biometricEnabled()]).then(([exists, biometric]) => {
      setPinConfigured(exists); setBiometricReady(biometric); setInitialized(true);
      if (exists) useSession.getState().lock();
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') { setBackgroundedAt(Date.now()); return; }
      if (state !== 'active' || backgroundedAt === null) return;
      const elapsed = Date.now() - backgroundedAt;
      setBackgroundedAt(null);
      void (async () => {
        const configured = await hasPin();
        const delay = Number(await readSetting(db, 'auto_lock_minutes') ?? 0);
        if (configured && elapsed >= delay * 60_000) useSession.getState().lock();
      })();
    });
    return () => subscription.remove();
  }, [backgroundedAt, db]);

  useEffect(() => {
    if (!locked) return;
    void Promise.all([hasPin(), biometricEnabled()]).then(([exists, biometric]) => { setPinConfigured(exists); setBiometricReady(biometric); if (!exists) unlock(); });
  }, [locked, unlock]);

  const submitPin = async () => {
    const result = await verifyPin(pin);
    if (result.valid) { setPin(''); setError(''); unlock(); setPinConfigured(true); return; }
    setPin(''); setError(result.waitSeconds ? `${result.waitSeconds} секунд күтіңіз.` : 'PIN қате. Қайта көріңіз.');
  };
  const unlockWithBiometrics = async () => {
    const valid = await authenticateBiometric();
    if (valid) { setError(''); unlock(); }
    else setError('Биометриялық тексеру орындалмады. PIN енгізіңіз.');
  };

  if (!initialized) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: 'serif', color: colors.accent, fontSize: 44 }}>LUMI</Text><Text style={{ color: colors.muted, marginTop: 8 }}>Жеке әлемің</Text></View>;
  if (locked) return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
    <View style={{ width: 78, height: 78, borderRadius: 26, backgroundColor: '#EFE6D9', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><LockKeyhole size={30} color={colors.accent} /></View>
    <Text style={{ fontFamily: 'serif', color: colors.ink, fontSize: 28 }}>Қош келдіңіз</Text><Text style={{ color: colors.muted, fontSize: 14, marginTop: 8, marginBottom: 28 }}>Жеке кеңістігіңізді ашу үшін PIN енгізіңіз</Text>
    <TextInput value={pin} onChangeText={(value) => setPin(value.slice(0, 8))} onSubmitEditing={() => void submitPin()} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="••••" placeholderTextColor="#B9AC9D" style={{ width: 220, height: 56, backgroundColor: colors.paper, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 16, textAlign: 'center', fontSize: 24, letterSpacing: 12 }} accessibilityLabel="Қолданбаны ашу PIN-і" />
    <Text onPress={() => void submitPin()} style={{ marginTop: 16, backgroundColor: colors.ink, color: '#FFF9F1', overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14, fontWeight: '700' }}>Ашу</Text>
    {biometricReady ? <TouchableOpacity onPress={() => void unlockWithBiometrics()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20 }}><Fingerprint size={17} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '700' }}>Биометриямен ашу</Text></TouchableOpacity> : null}
    {error ? <Text style={{ color: colors.red, marginTop: 14 }}>{error}</Text> : null}
  </View>;
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom', contentStyle: { backgroundColor: colors.background } }} /></>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SQLiteProvider databaseName="lumi.db" onInit={migrateDatabase} useSuspense><AppGate /></SQLiteProvider></SafeAreaProvider></GestureHandlerRootView>;
}
