import type { Question } from '../src/types';

export function quizPlaylist(questions: readonly Question[], seed: string): Question[];
export function quizPlaylistSlice(questions: readonly Question[], seed: string, from?: number, count?: number): { questions: Question[]; total: number };
export function dailyQuizQuestion(questions: readonly Question[], date?: Date): Question | null;

