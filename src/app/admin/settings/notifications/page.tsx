import { getTelegramSettings } from '@/lib/notifications/telegram-actions';
import TelegramSettings from './TelegramSettings';

export default async function NotificationsPage() {
  const view = await getTelegramSettings();
  if (!view) return <p className="text-sm text-ink-soft">Ces réglages sont réservés aux administrateurs de votre organisation.</p>;
  return <TelegramSettings initial={view}/>;
}
