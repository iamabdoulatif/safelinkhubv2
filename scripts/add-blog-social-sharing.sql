-- Diffusion automatique des articles de blog vers Telegram et Facebook.
--
-- À passer sur la base de production AVANT le déploiement du code : les
-- colonnes sont lues par la page des réglages marketing, et la table par
-- l'éditeur d'article. Idempotent — relançable sans risque.
--
-- Pas de colonne WhatsApp : l'API Groupes de Meta plafonne un groupe à 8
-- participants, ce qui exclut un groupe communautaire. Diffusion manuelle.

BEGIN;

ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token   text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id     text,
  ADD COLUMN IF NOT EXISTS facebook_page_id     text,
  ADD COLUMN IF NOT EXISTS facebook_page_token  text;

COMMENT ON COLUMN marketing_settings.telegram_bot_token IS
  'Chiffré au repos (AES-256-GCM dérivé d''AUTH_SECRET) — jamais en clair.';
COMMENT ON COLUMN marketing_settings.facebook_page_token IS
  'Chiffré au repos (AES-256-GCM dérivé d''AUTH_SECRET) — jamais en clair.';

CREATE TABLE IF NOT EXISTS blog_post_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  channel       text NOT NULL,
  status        text NOT NULL,
  external_url  text,
  error         text,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

-- L'idempotence est garantie ICI, pas seulement dans le code : republier un
-- article déjà diffusé ne doit jamais produire un second message.
CREATE UNIQUE INDEX IF NOT EXISTS blog_post_shares_post_channel_uniq
  ON blog_post_shares (post_id, channel);

COMMIT;
