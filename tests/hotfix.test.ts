import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SaveQueue } from '../src/services/autosave.ts';
import { isExternalActivityActive, withExternalActivity } from '../src/services/externalActivity.ts';
import { DEFAULT_AUTO_LOCK_MINUTES, shouldAutoLockAfterBackground } from '../src/services/lockPolicy.ts';
import { normalizeVocabularyTranslations } from '../src/utils/vocabulary.ts';
import { paletteFor, resolveAppearance } from '../src/services/appearance.ts';

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('global appearance resolves Light, Dark and System palettes without touching notebook themes', () => {
  assert.equal(resolveAppearance('light', true), 'light');
  assert.equal(resolveAppearance('dark', false), 'dark');
  assert.equal(resolveAppearance('system', true), 'dark');
  assert.equal(resolveAppearance('system', false), 'light');
  assert.notEqual(paletteFor('dark', false).background, paletteFor('light', false).background);
  assert.equal(paletteFor('system', true).ink, paletteFor('dark', false).ink);
});

test('lock policy defaults to one minute and only locks after an eligible background interval', () => {
  assert.equal(DEFAULT_AUTO_LOCK_MINUTES, 1);
  const base = { pinConfigured: true, backgroundedAt: 10_000, now: 69_999, delayMinutes: 1 };
  assert.equal(shouldAutoLockAfterBackground(base), false);
  assert.equal(shouldAutoLockAfterBackground({ ...base, now: 70_000 }), true);
  assert.equal(shouldAutoLockAfterBackground({ ...base, delayMinutes: 0 }), true);
  assert.equal(shouldAutoLockAfterBackground({ ...base, pinConfigured: false, now: 70_000 }), false);
  assert.equal(shouldAutoLockAfterBackground({ ...base, externalActivity: true, now: 70_000 }), false);
  assert.equal(shouldAutoLockAfterBackground({ ...base, backgroundedAt: null, now: 70_000 }), false);
});

test('external activity suppression is scoped and always released after success or failure', async () => {
  let finish!: () => void;
  const pending = withExternalActivity(() => new Promise<void>((resolve) => { finish = resolve; }));
  assert.equal(isExternalActivityActive(), true);
  finish();
  await pending;
  assert.equal(isExternalActivityActive(Date.now() + 2_100), false);
  await assert.rejects(withExternalActivity(async () => { throw new Error('picker failed'); }), /picker failed/u);
  assert.equal(isExternalActivityActive(Date.now() + 2_100), false);
});

test('large Cyrillic drafts keep only the newest queued editor value', async () => {
  const persisted: string[] = [];
  const queue = new SaveQueue<string>(async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    persisted.push(value);
  });
  const draft = 'Қазақша күнделік · кітапхана · ';
  const older = draft.repeat(20) + 'алдыңғы';
  const latest = draft.repeat(25) + 'соңғы';
  assert.ok(Array.from(latest).length >= 500);
  void queue.enqueue(older);
  void queue.enqueue(latest);
  await queue.flush();
  assert.equal(persisted.at(-1), latest);

  const editor = file('app/notebook/[id]/edit.tsx');
  const journal = file('app/(tabs)/journal.tsx');
  assert.match(editor, /useState\(\(\) => pageId \?\? randomUUID\(\)\)/u);
  assert.doesNotMatch(editor, /setDocumentId/u);
  assert.match(editor, /key=\{block\.id\}/u);
  assert.match(editor, /value=\{block\.text \?\? ''\}/u);
  assert.match(journal, /key=\{block\.id\}/u);
  assert.match(journal, /onChangeText=\{\(text\) => updateBlock\(block\.id, text\)\}/u);
  assert.match(journal, /loadSequence\.current/u);
});

test('system image-picker flows use a finally-scoped external activity guard', () => {
  const guard = file('src/services/externalActivity.ts');
  const notebookEditor = file('app/notebook/[id]/edit.tsx');
  const journalEditor = file('app/(tabs)/journal.tsx');
  const transfer = file('src/services/vocabularyTransfer.ts');
  assert.match(guard, /finally\s*\{/u);
  assert.match(notebookEditor, /withExternalActivity\(\(\) => ImagePicker\.launchImageLibraryAsync/u);
  assert.match(journalEditor, /withExternalActivity\(\(\) => ImagePicker\.launchImageLibraryAsync/u);
  assert.match(notebookEditor, /result\.canceled/u);
  assert.match(journalEditor, /picked\.canceled/u);
  assert.match(transfer, /withExternalActivity\(\(\) => DocumentPicker\.getDocumentAsync/u);
  assert.match(transfer, /withExternalActivity\(\(\) => Sharing\.shareAsync/u);
});

test('screenshot prevention is absent while PIN unlock keeps the navigation stack mounted', () => {
  const layout = file('app/_layout.tsx');
  assert.doesNotMatch(layout, /usePreventScreenCapture|preventScreenCaptureAsync|FLAG_SECURE/u);
  assert.ok(layout.indexOf('<Stack') < layout.indexOf('{locked ?'));
  assert.match(layout, /verifyPin\(pin\)/u);
  assert.match(layout, /authenticateBiometric\(\)/u);
});

test('editor tab routes each notebook kind explicitly and missing notebooks show a readable error', () => {
  const editorTab = file('app/(tabs)/editor.tsx');
  const reader = file('app/notebook/[id].tsx');
  const editor = file('app/notebook/[id]/edit.tsx');
  for (const route of ['/notebook/[id]/edit', '/(tabs)/journal', '/(tabs)/vocabulary', '/(tabs)/planner']) assert.ok(editorTab.includes(route), `missing route ${route}`);
  assert.match(editor, /Дәптер табылмады/u);
  assert.match(editor, /router\.canGoBack\(\) \? router\.back\(\)/u);
  assert.match(reader, /requestedPageId && generalPages\.some/u);
});

test('vocabulary translation drafts accept three and four languages, reject duplicates, and retain existing IDs', () => {
  const three = normalizeVocabularyTranslations([
    { id: 'kk-id', languageCode: 'KK', value: 'алма' },
    { id: 'ru-id', languageCode: 'ru', value: 'яблоко' },
    { id: 'en-id', languageCode: 'en', value: 'apple' }
  ]);
  const four = normalizeVocabularyTranslations([...three, { id: 'tr-id', languageCode: 'tr', value: 'elma' }]);
  assert.equal(three.length, 3);
  assert.equal(four.length, 4);
  assert.equal(four[0]?.id, 'kk-id');
  assert.throws(() => normalizeVocabularyTranslations([{ languageCode: 'en', value: 'apple' }, { languageCode: 'EN', value: 'fruit' }]), /Әр тіл/u);

  const vocabulary = file('app/(tabs)/vocabulary.tsx');
  const repository = file('src/database/repository.ts');
  const transfer = file('src/services/vocabularyTransfer.ts');
  assert.match(vocabulary, /editTranslations\.map/u);
  assert.match(vocabulary, /moveTranslation\(index/u);
  assert.match(vocabulary, /saveMultilingualWord\(db, \{[^\n]*id: editing\.id/u);
  assert.match(repository, /SELECT id,language_code FROM vocabulary_translations WHERE entry_id=\?/u);
  assert.match(repository, /ON CONFLICT\(entry_id,language_code\) DO UPDATE/u);
  assert.match(repository, /existingByLanguage\.get\(item\.languageCode\)/u);
  assert.match(transfer, /FROM vocabulary_translations WHERE entry_id IN/u);
  assert.match(transfer, /saveMultilingualWord\(db/u);
});

test('vocabulary notebook pages open the complete scrollable reader separately from word collection', () => {
  const reader = file('app/notebook/[id].tsx');
  assert.match(reader, /Сөздік қоры · \{words\.length\}/u);
  assert.match(reader, /Дәптер беттері · \{pages\.length\}/u);
  assert.match(reader, /pageId: page\.id/u);
  assert.match(reader, /numberOfLines=\{3\}/u);
  assert.match(reader, /<ScrollView style=\{readerStyles\.generalPageScroll\}/u);
  assert.match(reader, /active\.blocks\.map/u);
  assert.match(reader, /'Бетті өшіру'/u);
});

test('global search debounces requests, ignores stale responses, and routes pages to read mode', () => {
  const search = file('app/search.tsx');
  assert.match(search, /setTimeout\(\(\) => \{/u);
  assert.match(search, /180/u);
  assert.match(search, /requestSequence\.current === requestId/u);
  assert.match(search, /pageId: item\.id/u);
  assert.match(search, /pathname: '\/notebook\/\[id\]'/u);
});
