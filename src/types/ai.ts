import type { WordInput } from './domain';

export const AI_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const AI_MAX_TEXT_LENGTH = 50_000;
export const AI_MAX_WORDS = 30;
export const AI_FILE_ACCEPT = '.pdf,.txt,.md,.csv';
export type AiSource =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string }
  | { kind: 'file'; name: string; data: string };
export interface AiGenerateRequest {
  source: AiSource;
  count: number;
}
export interface AiGenerateResult {
  words: WordInput[];
  source: { label: string; url?: string };
  warnings: string[];
}
export interface AiConfig {
  enabled: boolean;
  provider: string;
}
