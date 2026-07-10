export type CvssVersion = "4.0" | "3.1";
export type EffectType = "override" | "cap";

export interface MetricEffect {
  version: CvssVersion;
  metric: string; // 'MAV', 'CR', 'S', ...
  value: string; // 'A', 'H', 'P', ...
  effect: EffectType;
}

export interface Option {
  id: string;
  label: string;
  description?: string;
  effects: MetricEffect[]; // empty array = Not Defined
}

export interface Question {
  id: string;
  order: number;
  question: string;
  whyWeAsk: string;
  finePrint?: string; // optional "what this maps to" disclosure for curious/expert users
  helpDetail?: string[]; // richer plain-English paragraphs for the question-help modal
  options: Option[]; // includes the implicit "Skip" option, see withSkip()
}
