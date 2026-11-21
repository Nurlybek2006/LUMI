import { ThemedView as View } from '@/components/ui';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { readSetting } from '@/database/settings';

export default function IndexRoute() {
  const db = useSQLiteContext();
  useEffect(() => { void readSetting(db, 'onboarding_complete').then((done) => router.replace(done === 'true' ? '/(tabs)' : '/onboarding')); }, [db]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#A76B45" /></View>;
}
