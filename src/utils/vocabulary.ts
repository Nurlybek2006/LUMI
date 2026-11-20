export interface BulkVocabularyRow { line: number; values: string[]; error?: string }
export function parseBulkVocabulary(text: string, languages: readonly string[]): BulkVocabularyRow[] {
  return text.split(/\r?\n/u).map((raw, index) => ({ raw, line: index + 1 })).filter(({ raw }) => raw.trim().length > 0).map(({ raw, line }) => {
    const values = raw.split('|').map((value) => value.trim());
    if (values.length !== languages.length) return { line, values, error: `${languages.length} баған болуы керек, ${values.length} берілді.` };
    if (values.some((value) => !value)) return { line, values, error: 'Бос баған бар.' };
    return { line, values };
  });
}
