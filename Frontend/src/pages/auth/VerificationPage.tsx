import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { apiClient } from "../../lib/api-client";
import * as yup from "yup";
import { toast } from "react-toastify";
import { toastError } from "../../lib/friendly-error";

const verificationSchema = yup.object().shape({
    code: yup.string().required("Verification code is required"),
});

export default function VerificationPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [isResendLoading, setIsResendLoading] = useState(false);
    const [showEmailInput, setShowEmailInput] = useState(false);
    const [resendEmail, setResendEmail] = useState("");
    const [email, setEmail] = useState(searchParams.get("email") || "");
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: yupResolver(verificationSchema),
    });



    const onSubmit = async (data: { code: string }) => {
        setIsLoading(true);
        try {
            const response = await apiClient.verifyAccount({
                code: data.code,
            });

            toast.success(response.message || "Account verified successfully!");
            setTimeout(() => {
                navigate("/login");
            }, 2000);
        } catch (error: any) {
            toastError(error, "Could not verify your account");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendCode = async () => {
        if (!showEmailInput && !email) {
            setShowEmailInput(true);
            return;
        }

        const emailToUse = email || resendEmail;
        if (!emailToUse) {
            toast.error("Email is required to resend verification code");
            return;
        }

        try {
            setIsResendLoading(true);
            await apiClient.resendVerificationCode({ email: emailToUse });
            toast.success("Verification code resent successfully");
            setShowEmailInput(false);
            if (!email) setEmail(emailToUse);
        } catch (error: any) {
            toastError(error, "Could not resend verification code");
        } finally {
            setIsResendLoading(false);
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
                        <h2 className="text-lg font-semibold text-foreground dark:text-white">
                            Verify Account
                        </h2>
                        <p className="text-muted-foreground mt-1">
                            {email
                                ? `Enter the 6-digit verification code sent to ${email}`
                                : "Enter the verification code sent to your email."}
                        </p>
                    </div>

                    <div className="p-6">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-foreground">
                                    Verification Code
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    {...register("code")}
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary text-center tracking-[0.5em] text-lg font-bold transition-all text-sm"
                                />
                                {errors.code && (
                                    <p className="text-xs text-danger font-medium">
                                        {errors.code.message}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center">
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verifying...
                                    </div>
                                ) : (
                                    "Verify Account"
                                )}
                            </button>

                            {showEmailInput && (
                                <div className="mt-4 space-y-2 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                                    <label className="block text-xs font-medium text-foreground ml-1">
                                        Email Address
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="email"
                                            value={resendEmail}
                                            onChange={(e) => setResendEmail(e.target.value)}
                                            className="flex-1 px-3 py-1.5 border border-border rounded-lg bg-card text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 text-xs"
                                            placeholder="Enter your email"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleResendCode}
                                            disabled={isResendLoading || !resendEmail}
                                            className="px-3 py-1.5 bg-primary text-white font-semibold rounded-lg text-xs disabled:opacity-50 transition-all hover:bg-primary/90"
                                        >
                                            {isResendLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col items-center space-y-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => showEmailInput ? setShowEmailInput(false) : handleResendCode()}
                                    disabled={isResendLoading}
                                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                                >
                                    {showEmailInput ? "Cancel Resend" : "Didn't receive a code? Resend"}
                                </button>

                                <Link
                                    to="/login"
                                    className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-primary transition-all"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                                    Back to Login
                                </Link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}