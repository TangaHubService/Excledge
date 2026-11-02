export function Loading() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-card">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-border border-t-blue-600 dark:border-t-blue-500"></div>
                <p className="mt-4 text-muted-foreground">Loading...</p>
            </div>
        </div>
    );
}