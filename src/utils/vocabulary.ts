export interface BulkVocabularyRow { line: number; values: string[]; error?: string }

export interface VocabularyDraftTranslation { id?: string; languageCode: string; value: string }

export function normalizeVocabularyTranslations(translations: readonly VocabularyDraftTranslation[]): VocabularyDraftTranslation[] {
  const clean = translations.map((item) => ({ ...(item.id ? { id: item.id } : {}), languageCode: item.languageCode.trim().normalize('NFKC').toLocaleLowerCase(), value: item.value.trim() })).filter((item) => item.value.length > 0);
  if (clean.some((item) => !item.languageCode)) throw new Error('Әр аудармаға тіл кодын енгізіңіз.');
  if (new Set(clean.map((item) => item.languageCode)).size !== clean.length) throw new Error('Әр тіл бір рет қана көрсетілуі керек.');
  if (clean.length < 2) throw new Error('Кемінде екі тілдегі сөзді енгізіңіз.');
  return clean;
}

export function parseBulkVocabulary(text: string, languages: readonly string[]): BulkVocabularyRow[] {
  return text.split(/\r?\n/u).map((raw, index) => ({ raw, line: index + 1 })).filter(({ raw }) => raw.trim().length > 0).map(({ raw, line }) => {
    const values = raw.split('|').map((value) => value.trim());
    if (values.length !== languages.length) return { line, values, error: `${languages.length} баған болуы керек, ${values.length} берілді.` };
    if (values.some((value) => !value)) return { line, values, error: 'Бос баған бар.' };
    return { line, values };
  });
}
