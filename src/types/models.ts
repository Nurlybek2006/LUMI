export type ThemeId = 'classic' | 'halloween' | 'winter' | 'creative' | 'midnight' | 'warm';
export type BlockType = 'paragraph' | 'heading' | 'quote' | 'list' | 'checklist' | 'code' | 'image';

export interface Notebook {
  id: string;
  title: string;
  icon: string;
  themeId: ThemeId;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface Entry {
  id: string;
  notebookId: string;
  date: string;
  title: string;
  content: string;
  blocks: EntryBlock[];
  mood: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
export interface EntryBlock {
  id: string;
  type: BlockType;
  text?: string;
  uri?: string;
  checked?: boolean;
}
export interface PlannerTask {
  id: string;
  date: string;
  title: string;
  priority: number;
  dueTime: string | null;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
}
export interface VocabularyWord {
  id: string;
  source: string;
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  example: string;
  exampleTranslation: string;
  notes: string;
  favorite: boolean;
  learned: boolean;
  repetitions: number;
  nextReview: string;
  createdAt: string;
}
