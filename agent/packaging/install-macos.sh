#!/bin/bash
# Installe SafeLinkHub Agent sur macOS SANS compte Apple.
#
# macOS bloque toute application non notarisée téléchargée par un navigateur
# (« l'application ne répond pas » / « développeur non vérifié ») : c'est l'attribut
# de quarantaine + Gatekeeper. Ce script, lancé depuis le Terminal, télécharge
# l'app, l'installe dans Applications et LÈVE la quarantaine — l'étape qui débloque
# tout. Un fichier récupéré par `curl | bash` n'est pas mis en quarantaine.
#
#   curl -fsSL https://raw.githubusercontent.com/iamabdoulatif/safelinkhubv2/main/agent/packaging/install-macos.sh | bash
set -euo pipefail

REPO="iamabdoulatif/safelinkhubv2"
ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)
URL="https://github.com/${REPO}/releases/download/agent-latest/SafeLinkHub-Agent-macOS-${ARCH}.dmg"
APP="/Applications/SafeLinkHub Agent.app"
TMP="$(mktemp -d)"
MNT="$(mktemp -d)"
cleanup() { hdiutil detach "$MNT" >/dev/null 2>&1 || true; rm -rf "$TMP" "$MNT"; }
trap cleanup EXIT

echo "→ Téléchargement de SafeLinkHub Agent ($ARCH)…"
curl -fSL --progress-bar -o "$TMP/agent.dmg" "$URL"

echo "→ Installation dans Applications…"
hdiutil attach "$TMP/agent.dmg" -nobrowse -mountpoint "$MNT" >/dev/null
# L'app peut déjà tourner : la fermer avant de remplacer.
pkill -f "SafeLinkHub Agent.app/Contents/MacOS/safelinkhub-agent" 2>/dev/null || true
rm -rf "$APP"
cp -R "$MNT/SafeLinkHub Agent.app" /Applications/
hdiutil detach "$MNT" >/dev/null 2>&1 || true

echo "→ Autorisation de l'application (levée de la quarantaine)…"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "→ Lancement…"
open "$APP"
echo ""
echo "✓ SafeLinkHub Agent est installé et lancé. Il s'ouvre dans votre navigateur."
echo "  Pour le rouvrir plus tard : Applications → SafeLinkHub Agent."
