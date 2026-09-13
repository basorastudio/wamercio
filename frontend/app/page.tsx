import { AppProviders } from '@/providers/AppProviders';
import AppRoot from '@/AppRoot';
import DynamicPWA from '@/components/DynamicPWA';

export default function Page() {
  return (
    <div id="wamercio-app-root">
      <AppProviders>
        <DynamicPWA />
        <AppRoot />
      </AppProviders>
    </div>
  );
}
