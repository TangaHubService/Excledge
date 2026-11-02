import { useState, useEffect, useRef } from "react";
import {
  Menu,
  User,
  LogOut,
  ChevronDown,
  ArrowLeft,
  Search,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BranchSelector } from "./BranchSelector";

import { apiClient } from "../lib/api-client";
import { Link, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { useTranslation } from 'react-i18next';
import { cn } from "../lib/utils";
import { VsdcPresenceIndicator } from "./VsdcPresenceIndicator";

/* ─── Types ─────────────────────────────────────────── */

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string;
};

interface HeaderProps {
  onMenuClick: () => void;
  onOpenSearch?: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** BRANCH_MANAGER → "branch manager" (capitalised by CSS). */
const formatRole = (role: string) => role.toLowerCase().replace(/_/g, ' ');

/* ─── Component ─────────────────────────────────────── */

export function Header({ onMenuClick, onOpenSearch }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSystemOwner } = useAuth();
  const { organization } = useOrganization();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    apiClient.logout();
    window.location.href = '/';
  };

  useEffect(() => {
    apiClient.profile()
      .then(data => setProfile(data as Profile))
      .catch(() => { /* silent — user can still navigate */ });
  }, []);

  /* Close user menu on outside click */
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  return (
    <header className="dashboard-chrome sticky top-0 z-30 flex h-14 shrink-0 items-center border-b px-3 lg:px-5">
      {/* Mobile menu trigger */}
      <button
        type="button"
        className="chrome-icon-btn lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="chrome-icon-btn group ml-1 lg:ml-0"
        title={t('common.back')}
        aria-label={t('common.back')}
      >
        <ArrowLeft className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5" />
      </button>

      {/* Global search */}
      <div className="mx-3 hidden max-w-md flex-1 items-center md:flex">
        <button
          type="button"
          onClick={onOpenSearch}
          className="group flex h-9 w-full items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-[0.8125rem] text-slate-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-slate-200"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Search products, sales, customers…</span>
          <kbd className="hidden rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400 lg:inline">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>

      {/* Right side controls */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {!isSystemOwner() && (
          <BranchSelector toolbar />
        )}

        {isSystemOwner() && organization && (
          <OrganizationSwitcher toolbar />
        )}

        <div className="hidden items-center gap-1.5 sm:flex">
          <VsdcPresenceIndicator />
          <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
          <ThemeToggle className="text-slate-300 hover:bg-white/[0.08] hover:text-white" />
          <LanguageSwitcher toolbar />
          <NotificationBell toolbar />
        </div>

        {/* User profile dropdown */}
        <div ref={userMenuRef} className="relative ml-1 border-l border-white/10 pl-2 sm:ml-2 sm:pl-3">
          <button
            type="button"
            onClick={() => setUserMenuOpen(prev => !prev)}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 text-white transition-colors hover:bg-white/[0.08]"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-[0.8125rem] font-semibold text-white ring-1 ring-white/20">
              {profile?.profileImage ? (
                <img
                  src={profile.profileImage}
                  alt={profile.name}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                profile?.name?.charAt(0)?.toUpperCase() || 'U'
              )}
            </div>
            <span className="hidden min-w-0 text-left leading-tight lg:block">
              <span className="block max-w-[10rem] truncate text-[0.8125rem] font-medium text-white">
                {profile?.name || t('common.user')}
              </span>
              {profile?.role && (
                <span className="block text-[0.6875rem] capitalize text-slate-400">
                  {formatRole(profile.role)}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
                userMenuOpen && "rotate-180",
              )}
            />
          </button>

          {userMenuOpen && (
            <div
              className={cn(
                "panel absolute right-0 mt-2 w-60 overflow-hidden p-1 shadow-dropdown animate-in fade-in slide-in-from-top-2 duration-200",
              )}
            >
              <div className="mb-1 border-b border-border/70 px-3 pb-2.5 pt-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.name || t('common.user')}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email || ''}
                </p>
              </div>

              <Link
                to="/dashboard/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <User className="h-4 w-4" />
                {t('nav.profile')}
              </Link>

              <div className="my-1 border-t border-border/70" />

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
