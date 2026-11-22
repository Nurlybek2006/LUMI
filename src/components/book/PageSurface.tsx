import { forwardRef } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { HostInstance, StyleProp, TextStyle } from 'react-native';
import type { ThemeId } from '@/types/models';
import type { RenderedBookPage } from '@/utils/pagination';
import { getTheme } from '@/themes/registry';
import { mediaUri } from '@/services/media';

type Props = { page: RenderedBookPage; pageNumber: number; themeId: ThemeId };

export const PageSurface = forwardRef<HostInstance, Props>(function PageSurface({ page, pageNumber, themeId }, ref) {
  const theme = getTheme(themeId);
  return <View ref={ref} collapsable={false} style={[styles.page, { backgroundColor: theme.page, borderColor: theme.line }]}>
    <View style={[styles.marginLine, { backgroundColor: theme.accent }]} />
    <View style={styles.pageTop}><Text style={[styles.pageBrand, { color: theme.muted }]}>L U M I</Text><Text style={[styles.pageCounter, { color: theme.muted }]}>{pageNumber}</Text></View>
    {page.segment === 0 && page.entry.title ? <Text style={[styles.entryTitle, { color: theme.ink, fontFamily: theme.serif }]}>{page.entry.title}</Text> : null}
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {page.blocks.map((block) => block.type === 'image' && block.uri
        ? <Image key={block.id} source={{ uri: mediaUri(block.uri) }} style={styles.readerImage} resizeMode="contain" />
        : <FormattedText key={block.id} content={block.type === 'list' ? `• ${block.text ?? ''}` : block.type === 'checklist' ? `${block.checked ? '☑' : '☐'} ${block.text ?? ''}` : block.text ?? ''} style={[styles.readerText, { color: theme.ink, fontFamily: theme.serif }, block.type === 'heading' ? styles.readerHeading : null, block.type === 'quote' ? [styles.readerQuote, { borderColor: theme.accent }] : null, block.type === 'code' ? styles.readerCode : null, block.type === 'list' ? styles.readerList : null, block.type === 'checklist' && block.checked ? { textDecorationLine: 'line-through', opacity: 0.6 } : null]} />)}
    </ScrollView>
    {page.segmentCount > 1 ? <Text style={[styles.segmentHint, { color: theme.muted }]}>{page.segment + 1} / {page.segmentCount} • жалғасы келесі бетте</Text> : null}
    <View style={[styles.pageFoot, { borderColor: theme.line }]}><Text style={[styles.footText, { color: theme.muted }]}>{page.entry.mood ?? '✧'}  •  {page.entry.tags.join('  ·  ')}</Text><Text style={[styles.footText, { color: theme.muted }]}>{pageNumber}</Text></View>
  </View>;
});

function FormattedText({ content, style }: { content: string; style: StyleProp<TextStyle> }) {
  const pieces = content.split(/(\*\*[^*]+\*\*|_[^_]+_)/gu);
  return <Text style={style}>{pieces.map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**')) return <Text key={index} style={{ fontWeight: '700' }}>{piece.slice(2, -2)}</Text>;
    if (piece.startsWith('_') && piece.endsWith('_')) return <Text key={index} style={{ fontStyle: 'italic' }}>{piece.slice(1, -1)}</Text>;
    return <Text key={index}>{piece}</Text>;
  })}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, borderWidth: 1, borderRadius: 17, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 11, overflow: 'hidden', shadowColor: '#42362A', shadowOffset: { width: 2, height: 4 }, shadowRadius: 9 },
  marginLine: { position: 'absolute', top: 0, bottom: 0, left: 41, width: 1, opacity: 0.3 },
  pageTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  pageBrand: { fontSize: 8, letterSpacing: 3, fontWeight: '700' }, pageCounter: { fontSize: 10 },
  entryTitle: { fontSize: 21, fontWeight: '700', marginBottom: 11, paddingLeft: 20 },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 12 },
  readerText: { fontSize: 16, lineHeight: 24, marginBottom: 10, paddingLeft: 20 },
  readerHeading: { fontSize: 19, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  readerQuote: { fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10, marginLeft: 18 },
  readerCode: { fontFamily: 'monospace', fontSize: 13, backgroundColor: '#0000000D', padding: 7, borderRadius: 5 },
  readerList: { paddingLeft: 29 }, readerImage: { width: '100%', height: 195, marginVertical: 8, borderRadius: 11 },
  segmentHint: { fontSize: 9, textAlign: 'right', marginBottom: 5 }, pageFoot: { borderTopWidth: 1, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }, footText: { fontSize: 9 }
});
