import { useMemo, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { useAppAppearance } from '@/components/ui';

type BaseProps = PropsWithChildren<{ visible: boolean; title?: string; onClose: () => void; dismissible?: boolean; footer?: ReactNode }>;

export function LumiDialog({ visible, title, onClose, dismissible = true, footer, children }: BaseProps) {
  const { palette } = useAppAppearance();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (dismissible) onClose(); }} statusBarTranslucent>
    <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
      {dismissible ? <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Жабу" accessibilityRole="button" /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.center}><View style={[styles.dialog, { backgroundColor: palette.paper, borderColor: palette.line }]}>
        {title ? <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>{title}</Text> : null}{children}{footer}
      </View></KeyboardAvoidingView>
    </View>
  </Modal>;
}

export function LumiBottomSheet({ visible, title, onClose, dismissible = true, children, footer }: BaseProps) {
  const { palette } = useAppAppearance(); const [drag] = useState(() => new Animated.Value(0));
  const responder = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, gesture) => dismissible && gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx), onPanResponderMove: (_, gesture) => { if (gesture.dy > 0) drag.setValue(gesture.dy); }, onPanResponderRelease: (_, gesture) => { if (dismissible && gesture.dy > 90) onClose(); Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(); }, onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start() }), [dismissible, drag, onClose]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (dismissible) onClose(); }} statusBarTranslucent><View style={[styles.sheetBackdrop, { backgroundColor: palette.overlay }]}>{dismissible ? <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Жабу" accessibilityRole="button" /> : null}<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}><Animated.View {...responder.panHandlers} style={[styles.sheet, { backgroundColor: palette.paper, transform: [{ translateY: drag }] }]}><View style={styles.handle} />{title ? <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>{title}</Text> : null}{children}{footer}</Animated.View></KeyboardAvoidingView></View></Modal>;
}

export function LumiActionSheet({ actions, ...props }: BaseProps & { actions: { label: string; onPress: () => void; destructive?: boolean }[] }) {
  const { palette } = useAppAppearance();
  return <LumiBottomSheet {...props}>{actions.map((action) => <Pressable key={action.label} onPress={action.onPress} style={[styles.action, { borderBottomColor: palette.line }]} accessibilityRole="button"><Text style={{ color: action.destructive ? palette.red : palette.ink, fontSize: 16 }}>{action.label}</Text></Pressable>)}</LumiBottomSheet>;
}

export function LumiConfirmDialog({ message, confirmLabel = 'Растау', onConfirm, ...props }: BaseProps & { message: string; confirmLabel?: string; onConfirm: () => void }) {
  const { palette } = useAppAppearance();
  return <LumiDialog {...props}><Text style={{ color: palette.muted, lineHeight: 22 }}>{message}</Text><View style={styles.confirmActions}><Pressable onPress={props.onClose} style={[styles.cancel, { borderColor: palette.line }]} accessibilityRole="button"><Text style={{ color: palette.ink, fontWeight: '700' }}>Болдырмау</Text></Pressable><Pressable onPress={onConfirm} style={[styles.confirm, { backgroundColor: palette.accent }]} accessibilityRole="button"><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{confirmLabel}</Text></Pressable></View></LumiDialog>;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'center', padding: 22 }, center: { flex: 1, justifyContent: 'center' }, dialog: { maxHeight: '92%', borderRadius: 24, borderWidth: 1, padding: 22, gap: 14, elevation: 12 }, title: { fontFamily: 'serif', fontSize: 21, fontWeight: '700' }, sheetBackdrop: { flex: 1, justifyContent: 'flex-end' }, sheetKeyboard: { justifyContent: 'flex-end' }, sheet: { maxHeight: '88%', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30, gap: 10, elevation: 14 }, handle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', backgroundColor: '#A79B8E', marginBottom: 8 }, action: { minHeight: 52, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, confirmActions: { flexDirection: 'row', gap: 9, justifyContent: 'flex-end' }, cancel: { minHeight: 48, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }, confirm: { minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 } });
