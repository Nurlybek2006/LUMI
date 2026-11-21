import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { migrateDatabase } from '@/database/migrations';
import { readSetting, writeSetting } from '@/database/settings';
import { isExternalActivityActive, withExternalActivity } from '@/services/externalActivity';
import { DEFAULT_AUTO_LOCK_MINUTES, shouldAutoLockAfterBackground } from '@/services/lockPolicy';
import { authenticateBiometric, biometricEnabled, hasPin, verifyPin } from '@/services/security';
import { useSession } from '@/store/session';
import { AppAppearanceContext, colors } from '@/components/ui';
import { paletteFor, resolveAppearance, type AppearanceMode } from '@/services/appearance';
import { Fingerprint, LockKeyhole } from 'lucide-react-native';

function AppGate() {
  const db = useSQLiteContext();
  const locked = useSession((state) => state.locked);
  const unlock = useSession((state) => state.unlock);
  const [initialized, setInitialized] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const systemScheme = useColorScheme();
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>('system');
  const backgroundedAt = useRef<number | null>(null);
  const checkingLock = useRef(false);
  const [splashOpacity] = useState(() => new Animated.Value(0));
  const [splashScale] = useState(() => new Animated.Value(0.96));
  useEffect(() => {
    void readSetting(db, 'appearance_mode').then((value) => { if (value === 'light' || value === 'dark' || value === 'system') setAppearanceMode(value); });
  }, [db]);

  useEffect(() => {
    if (initialized) return;
    const animation = Animated.parallel([
      Animated.timing(splashOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(splashScale, { toValue: 1, damping: 18, stiffness: 170, useNativeDriver: true })
    ]);
    animation.start();
    return () => animation.stop();
  }, [initialized, splashOpacity, splashScale]);

  useEffect(() => {
    void Promise.all([hasPin(), biometricEnabled()]).then(([exists, biometric]) => {
      setBiometricReady(biometric); setInitialized(true);
      if (exists) useSession.getState().lock();
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = isExternalActivityActive() ? null : Date.now();
        return;
      }
      if (state !== 'active') return;
      const backgroundStarted = backgroundedAt.current;
      backgroundedAt.current = null;
      if (backgroundStarted === null || isExternalActivityActive() || checkingLock.current) return;
      checkingLock.current = true;
      void (async () => {
        try {
          const configured = await hasPin();
          const delay = Number(await readSetting(db, 'auto_lock_minutes') ?? DEFAULT_AUTO_LOCK_MINUTES);
          if (shouldAutoLockAfterBackground({ pinConfigured: configured, backgroundedAt: backgroundStarted, now: Date.now(), delayMinutes: delay, externalActivity: isExternalActivityActive() })) useSession.getState().lock();
        } finally {
          checkingLock.current = false;
        }
      })();
    });
    return () => subscription.remove();
  }, [db]);

  useEffect(() => {
    if (!locked) return;
    void Promise.all([hasPin(), biometricEnabled()]).then(([exists, biometric]) => { setBiometricReady(biometric); if (!exists) unlock(); });
  }, [locked, unlock]);

  const submitPin = async () => {
    const result = await verifyPin(pin);
    if (result.valid) { setPin(''); setError(''); unlock(); return; }
    setPin(''); setError(result.waitSeconds ? `${result.waitSeconds} секунд күтіңіз.` : 'PIN қате. Қайта көріңіз.');
  };
  const unlockWithBiometrics = async () => {
    const valid = await withExternalActivity(() => authenticateBiometric());
    if (valid) { setError(''); unlock(); }
    else setError('Биометриялық тексеру орындалмады. PIN енгізіңіз.');
  };

  const palette = paletteFor(appearanceMode, systemScheme === 'dark'); const isDark = resolveAppearance(appearanceMode, systemScheme === 'dark') === 'dark';
  if (!initialized) return <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' }}><Animated.View style={{ opacity: splashOpacity, transform: [{ scale: splashScale }], alignItems: 'center' }}><Text style={{ fontFamily: 'serif', color: palette.accent, fontSize: 44 }}>LUMI</Text><Text style={{ color: palette.muted, marginTop: 8 }}>Жеке әлемің</Text></Animated.View></View>;
  return <AppAppearanceContext.Provider value={{ mode: appearanceMode, palette, setMode: (mode) => { setAppearanceMode(mode); void writeSetting(db, 'appearance_mode', mode); } }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom', contentStyle: { backgroundColor: colors.background } }} />
    {locked ? <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, elevation: 100, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <View style={{ width: 78, height: 78, borderRadius: 26, backgroundColor: '#EFE6D9', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><LockKeyhole size={30} color={colors.accent} /></View>
      <Text style={{ fontFamily: 'serif', color: colors.ink, fontSize: 28 }}>Қош келдіңіз</Text><Text style={{ color: colors.muted, fontSize: 14, marginTop: 8, marginBottom: 28 }}>Жеке кеңістігіңізді ашу үшін PIN енгізіңіз</Text>
      <TextInput value={pin} onChangeText={(value) => setPin(value.replace(/\D/gu, '').slice(0, 8))} onSubmitEditing={() => void submitPin()} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="••••" placeholderTextColor="#B9AC9D" style={{ width: 220, height: 56, backgroundColor: colors.paper, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 16, textAlign: 'center', fontSize: 24, letterSpacing: 12 }} accessibilityLabel="Қолданбаны ашу PIN-і" />
      <TouchableOpacity onPress={() => void submitPin()} accessibilityRole="button" style={{ marginTop: 16, backgroundColor: colors.ink, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 }}><Text style={{ color: '#FFF9F1', fontWeight: '700' }}>Ашу</Text></TouchableOpacity>
      {biometricReady ? <TouchableOpacity onPress={() => void unlockWithBiometrics()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20 }}><Fingerprint size={17} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '700' }}>Биометриямен ашу</Text></TouchableOpacity> : null}
      {error ? <Text style={{ color: colors.red, marginTop: 14 }}>{error}</Text> : null}
    </View> : null}
  </AppAppearanceContext.Provider>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SQLiteProvider databaseName="lumi.db" onInit={migrateDatabase} useSuspense><AppGate /></SQLiteProvider></SafeAreaProvider></GestureHandlerRootView>;
}
