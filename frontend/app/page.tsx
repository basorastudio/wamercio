import { AppProviders } from '@/providers/AppProviders';
import AppRoot from '@/AppRoot';
import DynamicPWA from '@/components/DynamicPWA';

export default function Page() {
  return (
    <AppProviders>
      <DynamicPWA />
      <AppRoot />
    </AppProviders>
  );
}
