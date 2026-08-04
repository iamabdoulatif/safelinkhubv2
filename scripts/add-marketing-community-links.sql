-- Liens communautaires (page Support) : chaîne YouTube, groupe Telegram, groupe
-- WhatsApp. Gérés par le superadmin dans Marketing, affichés aux orgs sur /admin/support.
ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS community_youtube_url text,
  ADD COLUMN IF NOT EXISTS community_telegram_url text,
  ADD COLUMN IF NOT EXISTS community_whatsapp_url text
