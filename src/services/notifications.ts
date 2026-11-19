import { AndroidImportance, getPermissionsAsync, requestPermissionsAsync, scheduleNotificationAsync, SchedulableTriggerInputTypes, setNotificationChannelAsync, setNotificationHandler } from 'expo-notifications';
import { Platform } from 'react-native';

setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

export async function scheduleDailyReminder(): Promise<string> {
  const permissions = await getPermissionsAsync();
  const requested = permissions.granted ? permissions : await requestPermissionsAsync();
  if (!requested.granted) throw new Error('Еске салуға рұқсат берілмеді. Құрылғы баптауынан қосыңыз.');
  if (Platform.OS === 'android') await setNotificationChannelAsync('lumi-reminders', { name: 'LUMI еске салуы', importance: AndroidImportance.DEFAULT, vibrationPattern: [0, 150, 120, 150] });
  return scheduleNotificationAsync({
    content: { title: 'LUMI — өзіңізге бір сәт', body: 'Бүгінгі ойыңызды жазып, ертеңгі жоспарыңызды қараңыз.' },
    trigger: { type: SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 30, ...(Platform.OS === 'android' ? { channelId: 'lumi-reminders' } : {}) }
  });
}
