import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CircleDollarSign,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("dashboard.eyebrow")}</p>
          <h1>{t("dashboard.title")}</h1>
          <p className="page-subtitle">{t("dashboard.subtitle")}</p>
        </div>
        <div className="period-chip">
          <span className="status-dot" />
          {t("dashboard.period")}
        </div>
      </div>

      <section className="summary-grid" aria-label={t("dashboard.summary")}>
        <SummaryCard
          icon={CircleDollarSign}
          label={t("dashboard.totalBalance")}
          helper={t("dashboard.availableAcrossAccounts")}
          tone="green"
        />
        <SummaryCard
          icon={ArrowDownLeft}
          label={t("dashboard.income")}
          helper={t("dashboard.selectedPeriod")}
          tone="blue"
        />
        <SummaryCard
          icon={ArrowUpRight}
          label={t("dashboard.spending")}
          helper={t("dashboard.selectedPeriod")}
          tone="orange"
        />
        <SummaryCard
          icon={Sparkles}
          label={t("dashboard.savingsRate")}
          helper={t("dashboard.netOfIncomeAndSpending")}
          tone="purple"
        />
      </section>

      <section className="welcome-panel">
        <div className="welcome-icon">
          <Sparkles size={21} />
        </div>
        <div>
          <h2>{t("dashboard.foundationTitle")}</h2>
          <p>{t("dashboard.foundationBody")}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="surface-card chart-card">
          <div className="card-heading">
            <div>
              <h2>{t("dashboard.cashFlow")}</h2>
              <p>{t("dashboard.cashFlowDescription")}</p>
            </div>
            <div className="legend">
              <span>
                <i className="legend-income" />
                {t("dashboard.income")}
              </span>
              <span>
                <i className="legend-spending" />
                {t("dashboard.spending")}
              </span>
            </div>
          </div>
          <div className="empty-chart">
            <div className="chart-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="empty-chart-message">
              <span className="empty-chart-icon">
                <CircleDollarSign size={20} />
              </span>
              <strong>{t("dashboard.noFinancialData")}</strong>
              <span>{t("dashboard.dataWillAppear")}</span>
            </div>
          </div>
        </div>

        <div className="surface-card activity-card">
          <div className="card-heading">
            <div>
              <h2>{t("dashboard.recentActivity")}</h2>
              <p>{t("dashboard.latestTransactions")}</p>
            </div>
          </div>
          <div className="empty-activity">
            <div className="activity-illustration">
              <ArrowLeftRight size={21} />
            </div>
            <strong>{t("dashboard.noActivity")}</strong>
            <span>{t("dashboard.activityWillAppear")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  helper: string;
  tone: "green" | "blue" | "orange" | "purple";
}) {
  return (
    <article className="surface-card summary-card">
      <div className={`summary-icon tone-${tone}`}>
        <Icon size={19} strokeWidth={1.9} />
      </div>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">—</strong>
      <span className="summary-helper">{helper}</span>
    </article>
  );
}
