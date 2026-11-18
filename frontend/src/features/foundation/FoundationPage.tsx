import { useTranslation } from "react-i18next";

export function FoundationPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("app.workspace")}</p>
          <h1>{t(titleKey)}</h1>
          <p className="page-subtitle">{t("foundation.moduleSubtitle")}</p>
        </div>
      </div>
      <section className="surface-card foundation-card">
        <div className="foundation-orb" />
        <h2>{t("foundation.title")}</h2>
        <p>{t("foundation.body")}</p>
      </section>
    </div>
  );
}
