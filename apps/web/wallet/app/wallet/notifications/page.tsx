import { UnavailableFeaturePage } from '../../components/UnavailableFeaturePage';

export default function NotificationsPage() {
  return (
    <UnavailableFeaturePage
      title="Notification center is not connected to real event delivery"
      summary="This route displayed and mutated browser-local notifications rather than a server-side event stream or a durable notification backend."
      reason="A real notification system would need event sources from wallet and node activity, persistence, delivery preferences, and tested browser or push integrations. The current route only simulates those behaviors locally."
      availableNow={[
        'Live wallet, explorer, and ops pages that can be refreshed directly',
        'Derived alerts based on current node health in /ops/alerts',
        'Wallet history and node monitoring without a notification queue',
      ]}
    />
  );
}