import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Eye, EyeOff, Lock } from "lucide-react";
import { apiClient } from "../../lib/api-client";

export const ChangePasswordPage = () => {
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPasswords, setShowPasswords] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const showToast = (message: string, type: "error" | "success") => {
        if (type === "error") {
            setError(message);
            setSuccess("");
        } else {
            setSuccess(message);
            setError("");
        }
        // Auto-clear after 5 seconds
        setTimeout(() => {
            setError("");
            setSuccess("");
        }, 5000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast("Please fill in all fields", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast("New passwords do not match", "error");
            return;
        }

        if (newPassword.length < 6) {
            showToast("Password must be at least 6 characters", "error");
            return;
        }

        setIsLoading(true);

        try {
            await apiClient.changePassword({
                currentPassword,
                newPassword,
            });
            showToast("Your password has been updated successfully", "success");
            setTimeout(() => {
                navigate("/login");
            }, 1500);
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Failed to change password",
                "error"
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat transition-all duration-500"
            style={{ backgroundImage: "url('/auth-bg.png')" }}
        >
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px]"></div>

            <div className="relative w-full max-w-[400px] mx-4">
                <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden text-sm">
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                                <Package className="h-6 w-6 text-white" />
                            </div>
                            <h1 className="text-xl font-bold text-foreground dark:text-white tracking-tight">
                                Excledge
                            </h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-warning" />
                            <h2 className="text-lg font-semibold text-foreground dark:text-white">
                                Change Password
                            </h2>
                        </div>
                        <p className="text-muted-foreground mt-1 leading-relaxed">
                            Securing your account is our top priority.
                        </p>
                    </div>

                    <div className="p-6">
                        {error && (
                            <div className="mb-4 p-3 bg-danger/10 border border-red-500/20 rounded-lg">
                                <p className="text-xs text-danger dark:text-red-400 font-medium">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div className="mb-4 p-3 bg-success/10 border border-green-500/20 rounded-lg">
                                <p className="text-xs text-success dark:text-green-400 font-medium">{success}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-foreground">
                                    Current Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPasswords ? "text" : "password"}
                                        placeholder="Enter current password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all text-sm"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-muted-foreground transition-colors"
                                        onClick={() => setShowPasswords(!showPasswords)}
                                    >
                                        {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-foreground">
                                    New Password
                                </label>
                                <input
                                    type={showPasswords ? "text" : "password"}
                                    placeholder="At least 6 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-foreground">
                                    Confirm New Password
                                </label>
                                <input
                                    type={showPasswords ? "text" : "password"}
                                    placeholder="Re-enter new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all text-sm"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-sm"
                            >
                                {isLoading ? "Updating..." : "Update Password"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};