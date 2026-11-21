import { Tabs } from 'expo-router';
import { Pressable, type ColorValue, type PressableProps } from 'react-native';
import { CalendarCheck, Languages, Library, MoreHorizontal, PencilLine } from 'lucide-react-native';
import { useAppAppearance } from '@/components/ui';

export default function TabLayout() {
  const { palette } = useAppAppearance();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.accent, tabBarInactiveTintColor: palette.muted, tabBarStyle: { height: 67, paddingTop: 7, paddingBottom: 7, backgroundColor: palette.navigation, borderTopColor: palette.line, elevation: 0 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '700' }, tabBarButton: (props) => <TabsButton {...props} /> }}>
    <Tabs.Screen name="index" options={{ title: 'Сөре', tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused}><Library color={color} size={size} /></TabIcon> }} />
    <Tabs.Screen name="editor" options={{ title: 'Редактор', tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused}><PencilLine color={color} size={size} /></TabIcon> }} />
    <Tabs.Screen name="journal" options={{ href: null }} />
    <Tabs.Screen name="planner" options={{ title: 'Жоспар', tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused}><CalendarCheck color={color} size={size} /></TabIcon> }} />
    <Tabs.Screen name="vocabulary" options={{ title: 'Сөздік', tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused}><Languages color={color} size={size} /></TabIcon> }} />
    <Tabs.Screen name="more" options={{ title: 'Тағы', tabBarIcon: ({ color, size, focused }) => <TabIcon color={color} size={size} focused={focused}><MoreHorizontal color={color} size={size} /></TabIcon> }} />
    <Tabs.Screen name="calendar" options={{ href: null }} />
  </Tabs>;
}

function TabsButton(props: PressableProps) {
  const { style, ...rest } = props;
  return <Pressable {...rest} style={(state) => [typeof style === 'function' ? style(state) : style, state.pressed ? { opacity: 0.76 } : null]} android_ripple={{ color: '#A76B4518', borderless: false }} />;
}

function TabIcon({ color, size, focused, children }: { color: ColorValue | null; size: number; focused: boolean; children: React.ReactNode }) {
  const tint = String(color ?? '#A76B45');
  return <Pressable pointerEvents="none" style={{ minWidth: size + 18, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${tint}18` : 'transparent' }}>{children}</Pressable>;
}
