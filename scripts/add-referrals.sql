-- Parrainage : un utilisateur invite, et touche des Safecoins quand son filleul
-- franchit une étape (inscription activée 5 SC, auto-setup 10 SC, accès distant
-- 1 an 8 SC). Voir src/lib/referrals/.
--
-- referral_code est NULLABLE et UNIQUE : les orgs créées avant la
-- fonctionnalité n'en ont pas, il est frappé à la demande (ensureReferralCode)
-- le jour où l'utilisateur ouvre sa carte de parrainage. Pas de backfill : un
-- code jamais partagé ne sert à rien, et le générer pour tout le monde
-- consommerait l'espace de noms sans raison.
--
-- referred_by_org_id est ON DELETE SET NULL (et NON cascade) : supprimer un
-- parrain ne doit évidemment pas supprimer ses filleuls.
alter table organizations add column if not exists referral_code text;
alter table organizations add column if not exists referred_by_org_id uuid
  references organizations(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_referral_code_unique'
  ) then
    alter table organizations
      add constraint organizations_referral_code_unique unique (referral_code);
  end if;
end $$;

-- Une prime VERSÉE, une ligne par (filleul, étape).
--
-- L'unicité (referred_org_id, event) est le VERROU MÉTIER : c'est elle qui
-- garantit qu'une étape n'est primée qu'une seule fois, même si deux
-- auto-setups du même filleul se terminent en même temps. La clé d'idempotence
-- du grand livre Safecoin offre la même garantie sur l'écriture comptable ; les
-- deux se couvrent mutuellement.
--
-- ledger_entry_id est une simple référence de traçabilité (pas de FK : le
-- grand livre a sa propre vie, une écriture peut être contre-passée).
create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  referred_org_id uuid not null references organizations(id) on delete cascade,
  event text not null,
  amount_sc_cents integer not null,
  ledger_entry_id uuid,
  created_at timestamp not null default now()
);

create unique index if not exists referral_rewards_referred_event_key
  on referral_rewards (referred_org_id, event);
create index if not exists referral_rewards_referrer_idx
  on referral_rewards (referrer_org_id);
