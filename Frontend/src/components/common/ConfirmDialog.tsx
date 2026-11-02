import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { useTheme } from "../../context/ThemeContext";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive" | "warning";
    loading?: boolean;
}

export default function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    loading = false
}: ConfirmDialogProps) {
    const { theme } = useTheme();

    const getVariantColors = () => {
        switch (variant) {
            case "destructive":
                return {
                    title: theme === "dark" ? "text-red-400" : "text-danger",
                    button: theme === "dark" ? "bg-danger hover:bg-danger/90 text-white" : "bg-danger hover:bg-danger/90 text-white"
                };
            case "warning":
                return {
                    title: theme === "dark" ? "text-amber-400" : "text-warning",
                    button: theme === "dark" ? "bg-warning hover:bg-warning/90 text-white" : "bg-warning hover:bg-warning/90 text-white"
                };
            default:
                return {
                    title: theme === "dark" ? "text-white" : "text-foreground",
                    button: "bg-primary hover:bg-primary/90 text-white"
                };
        }
    };

    const colors = getVariantColors();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent
                className={`sm:max-w-[425px] rounded-2xl shadow-lg border ${theme === "dark"
                    ? "bg-gray-900 border-gray-700 text-gray-100"
                    : "bg-card border-border text-foreground"
                    }`}
            >
                <DialogHeader>
                    <DialogTitle className={`text-xl font-semibold ${colors.title}`}>
                        {title}
                    </DialogTitle>
                    <DialogDescription className={theme === "dark" ? "text-muted-foreground" : "text-muted-foreground"}>
                        {message}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="flex justify-end gap-3 mt-4">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                        className={`px-4 rounded-lg transition-colors ${theme === "dark"
                            ? "border-gray-700 text-muted-foreground/60 hover:bg-gray-800"
                            : "border-border text-foreground hover:bg-muted"
                            }`}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-6 rounded-lg font-medium transition-all ${colors.button}`}
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{confirmText}...</span>
                            </div>
                        ) : (
                            confirmText
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
