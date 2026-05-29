import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslation from "../locales/en/translation.json";
import arTranslation from "../locales/ar/translation.json";

const STORAGE_KEY = "veego_language";

export function getStoredLanguage(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "en";
}

export function setStoredLanguage(lang: string): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

export function applyDirection(lang: string): void {
  const dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ar: { translation: arTranslation },
    },
    lng: getStoredLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: [],
    },
  });

applyDirection(getStoredLanguage());

export default i18n;
