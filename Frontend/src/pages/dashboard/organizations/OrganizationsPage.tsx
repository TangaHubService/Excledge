import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Loader2, Check, Settings } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import { useOrganization } from '../../../context/OrganizationContext';
import { useSubscription } from '../../../context/SubscriptionContext';
import { PricingCard } from '../../../components/landing/PricingCard';
import CreateOrganizationModal from '../../../components/CreateOrganizationModal';
import { useTranslation } from 'react-i18next';

interface Organization {
  id: number;
  name: string;
  businessType: string;
  address?: string;
  phone?: string;
  email?: string;
  role: string;
  isOwner: boolean;
  hasActiveSubscription?: boolean;
  subscriptionStatus?: string | null;
  subscriptionEndDate?: string | null;
}

export default function OrganizationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, login, refreshUserProfile } = useAuth();
  const { organization, setOrganization } = useOrganization();
  const { plans, isLoading: plansLoading } = useSubscription();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOrganization = organization !== null || localStorage.getItem('current_organization_id') !== null;
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoading(true);
        setError(null);

        // If user is authenticated, fetch their organizations
        const data = await apiClient.getUserOrganizations();
        const orgs = Array.isArray(data) ? data : (data.organizations || []);
        setOrganizations(orgs);
      } catch (err: any) {
        console.error('Failed to load organizations:', err);
        setError(err.message || 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, []);

  const handleSelectOrganization = async (org: Organization) => {
    try {
      const response = await apiClient.switchOrganization({ organizationId: org.id });
      if (response.organization && response.token && response.user) {
        localStorage.setItem('current_organization_id', String(org.id));
        localStorage.setItem('organization', JSON.stringify(response.organization));
        setOrganization({
          id: response.organization.id,
          name: response.organization.name,
          businessType: response.organization.businessType,
          address: response.organization.address,
          phone: response.organization.phone,
          email: response.organization.email,
        });

        // Update auth context with new token/user if provided
        if (response.token && response.user) {
          apiClient.setToken(response.token);
          localStorage.setItem('token', response.token);

          login({
            id: String(response.user.id),
            email: response.user.email,
            name: response.user.name,
            token: response.token,
            role: response.user.role,
          });

          await refreshUserProfile();
        }

        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Failed to switch organization:', err);
      setError(err.message || 'Failed to switch organization');
      return false;
    }
  };

  const onSelectOrg = async (org: Organization) => {
    const currentOrgId = organization?.id || localStorage.getItem('current_organization_id');
    if (String(org.id) === String(currentOrgId)) {
      navigate('/dashboard');
      return;
    }

    const success = await handleSelectOrganization(org);
    if (success) {
      navigate('/dashboard');
    }
  };

  const handleConfigure = async (e: React.MouseEvent, org: Organization) => {
    e.stopPropagation();
    const success = await handleSelectOrganization(org);
    if (success) {
      navigate('/dashboard/organization-config');
    }
  };

  const handleCreateSuccess = async () => {
    setIsCreateModalOpen(false);
    await refreshUserProfile();
    try {
      const data = await apiClient.getUserOrganizations();
      const orgs = Array.isArray(data) ? data : (data.organizations || []);
      setOrganizations(orgs);
    } catch (err) {
      console.error('Failed to refresh organizations:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // If user has no organization, show enhanced onboarding state
  if (!hasOrganization && organizations.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary mb-6 group hover:scale-110 transition-transform duration-300">
            <Building2 size={48} className="transition-transform group-hover:rotate-12" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('organizations.welcomeTitle')}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            {t('organizations.welcomeDesc')}
          </p>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95"
          >
            <Plus className="h-5 w-5" />
            {t('organizations.createOrganization')}
          </button>
        </div>

        <div className="space-y-8 rounded-2xl bg-[#f2f4f7] px-4 py-10 sm:px-8 sm:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t('subscription.choosePlan')}
            </h2>
            <p className="text-base text-muted-foreground sm:text-lg">
              {t('subscription.planDesc')}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {[t('subscription.trustSecure'), t('subscription.trustSupport'), t('subscription.trustActivate')].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {plans.slice(1).map((plan: any, index: number) => (
                <PricingCard
                  key={plan.id}
                  title={plan.name}
                  price={plan.price.toLocaleString()}
                  period={plan.billingCycle}
                  features={plan.features.map((f: any) => f.name)}
                  popular={index === 1}
                  onSelect={() => setIsCreateModalOpen(true)}
                />
              ))}
            </div>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {t('subscription.plansFootnote')}
          </p>
        </div>

        <CreateOrganizationModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      </div>
    );
  }

  // If admin has organizations, show list
  if (isAdmin && organizations.length > 0) {
    const currentOrgId = organization?.id || localStorage.getItem('current_organization_id');

    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('organizations.myOrganizations') || 'My Organizations'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t('organizations.selectOrCreate') || 'Select an organization or create a new one'}
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('organizations.createNew') || 'Create New'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-danger/10 dark:bg-danger/20 border border-danger/25 dark:border-red-800 rounded-lg">
              <p className="text-sm text-danger dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {organizations.map((org) => {
              const isCurrent = String(org.id) === String(currentOrgId);
              return (
                <div
                  key={org.id}
                  onClick={() => onSelectOrg(org)}
                  className={`bg-card rounded-xl shadow-sm border-2 transition-all cursor-pointer hover:shadow-md group/card ${isCurrent
                    ? 'border-primary bg-primary/50'
                    : 'border-border hover:border-primary/30'
                    }`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-primary/15 text-primary">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-foreground truncate">
                            {org.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {org.businessType.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      {isCurrent && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-primary/15 text-primary rounded-full text-xs font-medium">
                          <Check className="h-3 w-3" />
                          {t('organizations.current') || 'Current'}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {org.address && (
                        <p className="text-sm text-muted-foreground truncate">
                          📍 {org.address}
                        </p>
                      )}
                      {org.phone && (
                        <p className="text-sm text-muted-foreground">
                          📞 {org.phone}
                        </p>
                      )}
                      {org.email && (
                        <p className="text-sm text-muted-foreground truncate">
                          ✉️ {org.email}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('organizations.role') || 'Role'}: {org.role}
                        </span>
                        {org.isOwner && (
                          <span className="text-xs font-medium text-primary">
                            {t('organizations.owner') || 'Owner'}
                          </span>
                        )}
                      </div>

                      {(org.role === 'ADMIN' || org.isOwner) && (
                        <button
                          onClick={(e) => handleConfigure(e, org)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors group"
                          title={t('common.configure') || 'Configure'}
                        >
                          <Settings className="h-4 w-4 group-hover:rotate-45 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <CreateOrganizationModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-surface-subtle/50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-card rounded-2xl shadow-sm border border-border p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <p className="text-muted-foreground">
              {t('organizations.noOrganizations') || 'No organizations found'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
