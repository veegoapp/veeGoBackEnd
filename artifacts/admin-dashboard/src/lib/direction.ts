export type Direction = 'ltr' | 'rtl';

export function applyDirection(lang: string): void {
  const dir: Direction = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
  document.documentElement.setAttribute('data-dir', dir);
}

export function getCurrentDirection(): Direction {
  return document.documentElement.dir as Direction || 'ltr';
}

export function isRTL(): boolean {
  return getCurrentDirection() === 'rtl';
}
