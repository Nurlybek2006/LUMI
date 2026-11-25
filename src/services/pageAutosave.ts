/**
 * Жалпы дәптер беттерінің autosave логикасы. Модуль сыртқы тәуелділіксіз
 * жазылған, сондықтан Node тестілерінде тікелей тексеріледі.
 */

type PageBlockLike = { type: string; text?: string | undefined };
type PagePayloadLike = { title: string; blocks: readonly PageBlockLike[] };

/**
 * Сақталатын беттің ID-ін анықтайды. Бар бет болса — соның ID-і, әйтпесе
 * редактор алдын ала берген ID қолданылады. Тек ешқандай ID берілмеген
 * жағдайда ғана (мысалы, көшірме жасау) жаңа ID генерацияланады.
 *
 * Бұрын берілген ID еленбей, әр autosave сайын жаңа ID жасалатын — сол себепті
 * жазу кезінде дәптерде жаңа беттер өздігінен пайда болатын.
 */
export function resolveNotebookPageId(existingId: string | null | undefined, requestedId: string | undefined, generate: () => string): string {
  return existingId ?? (requestedId || generate());
}

export function hasPageContent(payload: PagePayloadLike): boolean {
  return Boolean(payload.title.trim()) || payload.blocks.some((block) => block.type === 'image' || block.type === 'vocabulary_columns' || Boolean(block.text?.trim()));
}

/**
 * Бос жаңа бет базаға жазылмайды. Бірақ бет бір рет сақталған соң, кейінгі
 * өзгерістер (мәтінді толық өшіру де) сол бетке жазыла береді.
 */
export function shouldPersistPage(payload: PagePayloadLike, alreadyPersisted: boolean): boolean {
  return alreadyPersisted || hasPageContent(payload);
}
