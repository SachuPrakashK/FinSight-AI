import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", label: "English" },
  { code: "ml", label: "മലയാളം" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
];

export function LanguageSelect() {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage?.split("-")[0] ?? "en";

  return (
    <label className="language-control">
      <span className="sr-only">{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        value={currentLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
