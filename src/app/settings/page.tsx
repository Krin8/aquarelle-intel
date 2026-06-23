import { SettingsClient } from '@/components/SettingsClient';
import { getPitchTemplates } from '@/actions/pitch-actions';

export default async function SettingsPage() {
  const templates = await getPitchTemplates();

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage AI Pitch Templates and Preferences</p>
        </div>
      </div>
      <SettingsClient initialTemplates={templates} />
    </div>
  );
}
