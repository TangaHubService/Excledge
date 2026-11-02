import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { subscriptionService } from '../services/subscriptionService';
import { useSubscription } from '../context/SubscriptionContext';
import { toast } from '../hooks/use-toast';

export default function SubscriptionSuccess() {
    const [sessionId, setSessionId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshSubscription } = useSubscription();
    const organizationId = localStorage.getItem('current_organization_id');

    useEffect(() => {
        const verifyPayment = async () => {
            const sessionId = searchParams.get('session_id');
            console.log(sessionId);

            if (!sessionId) {
                setError('No session ID found in the URL');
                setLoading(false);
                return;
            }

            if (!organizationId) {
                setError('Organization not found. Please log in again.');
                setLoading(false);
                return;
            }

            setSessionId(sessionId);

            try {
                // Verify the payment with the backend
                await subscriptionService.verifyPayment(organizationId, sessionId);
                await refreshSubscription();

                toast({
                    title: 'Success!',
                    description: 'Your subscription has been activated successfully.',
                    variant: 'default',
                });
            } catch (err) {
                console.error('Payment verification failed:', err);
                setError('Failed to verify your payment. Please contact support if the issue persists.');
                toast({
                    title: 'Verification Failed',
                    description: 'We encountered an issue verifying your payment.',
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
            }
        };

        verifyPayment();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <Loader2 className="w-16 h-16 text-success animate-spin mx-auto mb-4" />
                    <p className="text-lg text-muted-foreground">Verifying your subscription...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <div className="bg-card rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-danger/15 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-danger" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">Verification Failed</h1>
                    <p className="text-muted-foreground mb-6">{error}</p>
                    <div className="space-y-3">
                        <button
                            onClick={() => navigate('/subscription')}
                            className="w-full bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                        >
                            Back to Subscription
                        </button>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full bg-muted text-foreground px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-xl p-8 max-w-md w-full">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-success/15 rounded-full mb-4 animate-bounce">
                        <CheckCircle className="w-12 h-12 text-success" />
                    </div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                        Payment Successful!
                    </h1>
                    <p className="text-muted-foreground">
                        Thank you for subscribing. Your subscription is now active.
                    </p>
                </div>

                <div className="bg-surface-subtle rounded-lg p-4 mb-6">
                    <h2 className="text-sm font-semibold text-foreground mb-2">Transaction Details</h2>
                    <div className="space-y-2">
                        <div>
                            <p className="text-xs text-muted-foreground">Session ID</p>
                            <p className="text-sm font-mono text-foreground break-all">{sessionId}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/15 text-success">
                                Active
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                    >
                        Go to Dashboard
                    </button>
                    <button
                        onClick={() => navigate('/subscription')}
                        className="w-full bg-muted text-foreground px-6 py-3 rounded-lg font-semibold hover:bg-muted transition-colors"
                    >
                        Back to Subscription
                    </button>
                </div>

                <div className="mt-6 pt-6 border-t border-border text-center">
                    <p className="text-sm text-muted-foreground">
                        A confirmation email has been sent to your inbox.
                    </p>
                </div>
            </div>
        </div>
    );
}