import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Package, Eye, EyeOff } from "lucide-react";
import { apiClient } from "../../lib/api-client";
import { loginSchema } from "../../schema";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(loginSchema),
    });

    useEffect(() => {
        const currentPharmacyId = localStorage.getItem("current_pharmacy_id");
        if (currentPharmacyId) {
            navigate("/");
        }
    }, [navigate]);

    const showToast = (message: string, type: "error" | "success") => {
        if (type === "error") {
            setError(message);
            setSuccess("");
        } else {
            setSuccess(message);
            setError("");
        }
        setTimeout(() => {
            setError("");
            setSuccess("");
        }, 5000);
    };

    const onSubmit = async (data: { email: string; password: string }) => {
        setIsLoading(true);
        setError("");
        setSuccess("");

        try {
            const result = await apiClient.login(data);

            // Set user data with role information
            if (result?.user) {
                const accessToken = result.accessToken ?? result.token;
                const userData = {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name,
                    token: accessToken,
                    role: result.user.role,
                };
                login(userData);
            }

            if (result?.user?.requirePasswordChange) {
                showToast("Please change your password to continue", "success");
                setTimeout(() => navigate("/change-password"), 2000);
                return;
            }
            if (result?.user?.role === "SYSTEM_OWNER") {
                showToast(`Welcome back ${result?.user.name}!`, "success");
                setTimeout(() => navigate("/dashboard/system-owner"), 2000);
                return;
            }
            if (!result?.hasOrganization) {
                showToast(`Welcome back ${result?.user.name}!`, "success");
                setTimeout(() => navigate("/create-organization"), 2000);
                return;
            }
            if (result?.organizations.length > 1) {
                showToast("Please switch to your organization to continue", "success");
                setTimeout(() => navigate("/select-organization"), 2000);
                return;
            }
            if (result?.organizations.length === 1) {
                localStorage.setItem("current_organization_id", result?.organizations[0].id);
                showToast(`Welcome back ${result?.user.name}!`, "success");
                apiClient.switchOrganization({ organizationId: result?.organizations[0].id });
                setTimeout(() => navigate("/dashboard"), 2000);
                return;
            }

            showToast(`Welcome back ${result?.user.name}!`, "success");
            setTimeout(() => navigate("/dashboard"), 2000);
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Invalid credentials",
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
            <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[2px]"></div>

            <div className="relative w-full max-w-[400px] mx-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                                <Package className="h-6 w-6 text-white" />
                            </div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                                Excledge
                            </h1>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Welcome Back 👋
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Sign in to manage your business operations.
                        </p>
                    </div>

                    <div className="p-6">
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <p className="text-xs text-green-600 dark:text-green-400 font-medium">{success}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    {...register("email")}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-500 font-medium">
                                        {errors.email.message}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                        Password
                                    </label>
                                    <Link
                                        to="/forgot-password"
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
                                    >
                                        Forgot?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        {...register("password")}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p className="text-xs text-red-500 font-medium">
                                        {errors.password.message}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-sm"
                            >
                                {isLoading ? "Signing in..." : "Sign In"}
                            </button>

                            <div className="text-center pt-2">
                                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                    New to Excledge?{" "}
                                    <Link
                                        to="/signup"
                                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                                    >
                                        Create an account
                                    </Link>
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
