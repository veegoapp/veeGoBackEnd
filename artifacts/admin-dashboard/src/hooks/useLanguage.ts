import { useTranslation } from 'react-i18next';
import { applyDirection } from '../lib/direction';

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language?.startsWith('ar') ? 'ar' : 'en';
  const isArabic = currentLang === 'ar';

  const switchLanguage = (lang: 'en' | 'ar') => {
    i18n.changeLanguage(lang);
    applyDirection(lang);
    localStorage.setItem('veego_language', lang);
  };

  const initDirection = () => {
    applyDirection(currentLang);
  };

  return { currentLang, isArabic, switchLanguage, initDirection };
}
