import { getIntegrations } from '@/actions/integration-actions';
import { IntegrationsClient } from '@/components/IntegrationsClient';

export default async function IntegrationsPage() {
  const integrations = await getIntegrations();
  
  return <IntegrationsClient initialData={integrations} />;
}
