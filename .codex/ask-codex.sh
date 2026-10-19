#!/usr/bin/env bash
# Liaison Claude <-> Codex : consulte Codex en une commande.
# Claude (ou toi) l'appelle pour un second avis ; la réponse ressort sur stdout.
#
#   .codex/ask-codex.sh "ta question"      # lecture seule (défaut, sûr)
#   .codex/ask-codex.sh -w "applique X"    # autorise Codex à écrire (workspace-write)
#   echo "$DIFF" | .codex/ask-codex.sh "relis ce diff"   # entrée via stdin
#
# Codex tourne sur ton compte ChatGPT : chaque appel consomme ton quota.
set -euo pipefail

sandbox="read-only"
[[ "${1:-}" == "-w" ]] && { sandbox="workspace-write"; shift; }

prompt="${*:-}"
# Pas d'argument : lire la question depuis stdin.
[[ -z "$prompt" && ! -t 0 ]] && prompt="$(cat)"
[[ -z "$prompt" ]] && { echo "usage: ask-codex.sh [-w] \"question\"" >&2; exit 2; }

exec codex exec -s "$sandbox" "$prompt"
