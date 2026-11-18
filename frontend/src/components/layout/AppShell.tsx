import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  Menu,
  WalletCards,
  X,
  Target,
  ArrowLeftRight,
} from "lucide-react";
import { LanguageSelect } from "./LanguageSelect";

const navigation = [
  { to: "/", key: "nav.overview", icon: LayoutDashboard, end: true },
  { to: "/transactions", key: "nav.transactions", icon: ArrowLeftRight },
  { to: "/accounts", key: "nav.accounts", icon: WalletCards },
  { to: "/budgets", key: "nav.budgets", icon: BarChart3 },
  { to: "/goals", key: "nav.goals", icon: Target },
];

export function AppShell() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const activeRoute = navigation.find(({ to, end }) =>
    end ? location.pathname === to : location.pathname.startsWith(to),
  );

  return (
    <div className="app-frame">
      {menuOpen && (
        <button
          className="mobile-scrim"
          aria-label={t("common.closeMenu")}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            F
          </div>
          <div>
            <strong>FinSight</strong>
            <span>AI</span>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label={t("common.closeMenu")}
            onClick={() => setMenuOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-label">{t("app.workspace")}</div>
        <nav className="side-nav" aria-label={t("app.primaryNavigation")}>
          {navigation.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">FS</div>
          <div className="profile-label">
            <strong>{t("app.demoWorkspace")}</strong>
            <span>{t("app.setupStage")}</span>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={t("common.openMenu")}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            {t("app.workspace")} <span>/</span>{" "}
            <strong>{t(activeRoute?.key ?? "nav.overview")}</strong>
          </div>
          <div className="topbar-actions">
            <LanguageSelect />
            <span className="icon-button notification-button" aria-hidden="true">
              <Bell size={19} />
            </span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <nav className="mobile-nav" aria-label={t("app.primaryNavigation")}>
          {navigation.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `mobile-nav-link${isActive ? " mobile-nav-active" : ""}`}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
