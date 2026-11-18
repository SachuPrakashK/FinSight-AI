import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import ml from "./locales/ml.json";
import ta from "./locales/ta.json";

const savedLanguage = window.localStorage.getItem("finsight-language") ?? "en";

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    ml: { translation: ml },
    ta: { translation: ta },
  },
  lng: savedLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  window.localStorage.setItem("finsight-language", language);
  document.documentElement.lang = language;
});

document.documentElement.lang = i18n.resolvedLanguage ?? savedLanguage;

export default i18n;
