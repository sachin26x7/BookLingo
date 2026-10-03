export const SUPPORTED_LANGUAGES = [
  'English',
  'Hindi',
  'Bengali',
  'Spanish',
  'French',
  'German',
  'Arabic',
  'Portuguese',
  'Russian',
  'Urdu',
  'Chinese',
  'Japanese',
  'Italian',
  'Korean',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];