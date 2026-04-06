import { useState, useEffect } from "react";
import {
    Menu,
    User,
    LogOut,
    ChevronDown,
    ArrowLeft
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BranchSelector } from "./BranchSelector";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { apiClient } from "../lib/api-client";
import { Link, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { useTranslation } from 'react-i18next';


type Profile = {
    id: string;
    name: string;
    email: string;
    role: string;
    profileImage?: string;
};
interface HeaderProps {
    onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);

    const handleLogout = () => {
        apiClient.logout();
        window.location.href = '/';
    };

    useEffect(() => {
        const getData = async () => {
            try {
                // Get user profile
                const profileData = await apiClient.profile();
                setProfile(profileData as Profile);
            } catch (error) {
                console.error("Failed to fetch data:", error);
            }
        };

        getData();
    }, []);

    return (
        <header className="dashboard-chrome sticky top-0 z-30 flex h-16 shrink-0 items-center border-b px-4 lg:px-6">
            <button
                type="button"
                className="lg:hidden rounded-lg p-2 text-white transition-colors hover:bg-white/10"
                onClick={onMenuClick}
            >
                <Menu className="h-5 w-5" />
            </button>

            <button
                type="button"
                onClick={() => navigate(-1)}
                className="group ml-2 flex items-center gap-2 rounded-lg p-2 text-white transition-colors hover:bg-white/10 lg:ml-0"
                title={t('common.back')}
            >
                <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
                <span className="hidden text-sm font-medium sm:inline">{t('common.back')}</span>
            </button>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <OrganizationSwitcher toolbar />
                <BranchSelector toolbar />
                <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />

                <LanguageSwitcher toolbar />

                <NotificationBell toolbar />

                {/* User Profile */}
                <div className="relative ml-1 sm:ml-2">
                    <button
                        type="button"
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="flex items-center gap-2 rounded-lg p-1.5 text-white transition-colors hover:bg-white/10"
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-medium text-white ring-2 ring-white/30">
                            {profile?.profileImage ? (
                                <img
                                    src={profile.profileImage}
                                    alt={profile.name}
                                    className="h-8 w-8 rounded-full"
                                />
                            ) : (
                                profile?.name?.charAt(0) || t('common.user').charAt(0)
                            )}

                        </div>
                        <span className="hidden text-sm font-medium text-white sm:inline">
                            {profile?.name || t('common.user')}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* User Dropdown Menu */}
                    {userMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-gray-700/30 dark:to-transparent">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {profile?.name || t('common.user')}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {profile?.role || t('common.user')}
                                </p>
                            </div>
                            <Link to="/dashboard/profile"
                                onClick={() => setUserMenuOpen(false)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-100 hover:to-gray-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 transition-all duration-200">
                                <User className="h-4 w-4" />
                                {t('nav.profile')}
                            </Link>

                            <div className="border-t border-gray-200/50 dark:border-gray-700/50 my-1"></div>
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100/50 dark:hover:from-red-900/20 dark:hover:to-red-900/10 transition-all duration-200"
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

