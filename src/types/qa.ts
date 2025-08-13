export type ChoiceKey = 'A' | 'B' | 'C' | 'D';

export interface OptionItem {
  key: ChoiceKey;
  text_html: string;
  translation?: string;
}

export interface QAItem {
  id: string;
  type: 'single-choice';
  stem_html: string;
  options: OptionItem[];
  answer: ChoiceKey;
  explanation?: string;
  rationales: Record<ChoiceKey, string>;
  meta?: {
    difficulty?: '易' | '中' | '難';
    tags?: string[];
    source?: string;
  };
}
