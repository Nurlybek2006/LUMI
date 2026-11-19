import { Tabs } from 'expo-router';
import { BookOpen, CalendarCheck, Languages, Library, MoreHorizontal } from 'lucide-react-native';
import { colors } from '@/components/ui';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: '#9B9084', tabBarStyle: { height: 67, paddingTop: 7, paddingBottom: 7, backgroundColor: '#FFFCF7', borderTopColor: '#EAE1D6' }, tabBarLabelStyle: { fontSize: 10, fontWeight: '700' } }}>
    <Tabs.Screen name="index" options={{ title: 'Сөре', tabBarIcon: ({ color, size }) => <Library color={color} size={size} /> }} />
    <Tabs.Screen name="journal" options={{ title: 'Күнделік', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }} />
    <Tabs.Screen name="planner" options={{ title: 'Жоспар', tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }} />
    <Tabs.Screen name="vocabulary" options={{ title: 'Сөздік', tabBarIcon: ({ color, size }) => <Languages color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: 'Тағы', tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }} />
    <Tabs.Screen name="calendar" options={{ href: null }} />
  </Tabs>;
}
