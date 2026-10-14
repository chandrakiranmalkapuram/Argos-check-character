export type CheckMode = 'auto' | 'store' | 'rfc' | 'reverse';

export type ResultKind = 'store' | 'rfc' | 'fixed' | 'empty' | 'invalid';

export interface CalculationResult {
  kind: ResultKind;
  label: string | null;
  location: string;
  spokenText: string;
  checkChar: string;
  formulaDescription: string;
  breakdown: string[];
  isValid: boolean;
  errorMessage?: string;
}

export interface SimilarLocation {
  location: string;
  spokenText: string;
  checkChar: string;
  reason: string;
}

export interface ReverseLookupResult {
  checkChar: string;
  phoneticWord: string;
  totalMatches: number;
  aisles: {
    aisle: string;
    locations: string[];
  }[];
}

export interface ValidationState {
  isValid: boolean;
  detectedMode: CheckMode;
  formattedInput: string;
  guidanceMessage: string;
}

export interface HistoryItem {
  id: string;
  query: string;
  timestamp: number;
  resultSummary: string;
  spokenSummary: string;
  mode: CheckMode;
}
