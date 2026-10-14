#!/bin/bash
# .app + .dmg de l'agent (macOS), signature ad hoc — pas de compte Apple requis.
# Prérequis : dist-agent/safelinkhub-agent (build-sea.mjs). Usage : macos-dmg.sh <arm64|x64>
set -euo pipefail
ARCH="${1:-$(uname -m)}"
APP="dist-agent/SafeLinkHub Agent.app"
VERSION="$(date +%Y.%m.%d)"
rm -rf "$APP" dist-agent/dmg && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" dist-agent/dmg
cp dist-agent/safelinkhub-agent "$APP/Contents/MacOS/safelinkhub-agent"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>SafeLinkHub Agent</string>
  <key>CFBundleDisplayName</key><string>SafeLinkHub Agent</string>
  <key>CFBundleIdentifier</key><string>io.safelinkhub.agent</string>
  <key>CFBundleExecutable</key><string>safelinkhub-agent</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- Agent sans fenêtre native (il sert une interface web) : sans ceci, macOS
       attend une fenêtre et affiche « l'application ne répond pas ». Accessoire =
       pas d'icône Dock ; on la quitte depuis le bouton « Quitter » de l'interface. -->
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST
# Icône : logo SafeLinkHub (encre + carré lime), rendu en PNG puis .icns.
ICON=dist-agent/icon && rm -rf "$ICON" && mkdir -p "$ICON/AppIcon.iconset"
cat > "$ICON/logo.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="230" fill="#12301D"/>
<g transform="translate(192 192) scale(20)"><path d="M26 7H12v9h8v9H6" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="2.4" y="21.4" width="7.2" height="7.2" rx="2.1" fill="#fff"/><rect x="22.4" y="3.4" width="7.2" height="7.2" rx="2.1" fill="#D6F344"/></g></svg>
SVG
if qlmanage -t -s 1024 -o "$ICON" "$ICON/logo.svg" >/dev/null 2>&1 && [ -f "$ICON/logo.svg.png" ]; then
  for s in 16 32 128 256 512; do
    sips -z $s $s "$ICON/logo.svg.png" --out "$ICON/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$ICON/logo.svg.png" --out "$ICON/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICON/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
fi
codesign --sign - --force --deep "$APP"

# .pkg (installeur guidé) EN PLUS du .dmg. Avantage : installable aussi sans
# clic, en une commande Terminal — `sudo installer -pkg … -target /` — qui ne
# déclenche pas la boîte Gatekeeper ; et le postinstall lève la quarantaine de
# l'app posée, donc elle démarre même quand le .pkg a été téléchargé par le
# navigateur. (Le .pkg lui-même reste non notarisé : en double-clic, 1er
# lancement par clic droit › Ouvrir, comme le .dmg.)
PKGROOT=dist-agent/pkgroot && rm -rf "$PKGROOT" && mkdir -p "$PKGROOT"
cp -R "$APP" "$PKGROOT/"
SCRIPTS=dist-agent/pkg-scripts && rm -rf "$SCRIPTS" && mkdir -p "$SCRIPTS"
cat > "$SCRIPTS/postinstall" <<'POST'
#!/bin/bash
# Lève la quarantaine PUIS lance l'agent dans la session de l'utilisateur
# connecté. Pourquoi lancer ici : un .app sans fenêtre (LSUIElement) ouvert par
# un DOUBLE-CLIC Finder déclenche le chien de garde « l'application ne répond
# pas » — alors que l'app tourne. En le lançant via launchctl asuser depuis le
# postinstall (comme le fait install-macos.sh avec `open`), l'utilisateur n'a
# pas à double-cliquer : l'agent démarre et ouvre le navigateur tout seul.
APP="/Applications/SafeLinkHub Agent.app"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
uid="$(stat -f %u /dev/console 2>/dev/null)"
[ -n "$uid" ] && launchctl asuser "$uid" open "$APP" 2>/dev/null || true
exit 0
POST
chmod +x "$SCRIPTS/postinstall"
PKG="dist-agent/SafeLinkHub-Agent-macOS-${ARCH}.pkg"
rm -f "$PKG"
pkgbuild --root "$PKGROOT" --install-location /Applications --scripts "$SCRIPTS" \
  --identifier io.safelinkhub.agent --version "$VERSION" "$PKG"
echo "OK : $PKG"

cp -R "$APP" dist-agent/dmg/
ln -s /Applications dist-agent/dmg/Applications
OUT="dist-agent/SafeLinkHub-Agent-macOS-${ARCH}.dmg"
rm -f "$OUT"
# Un volume resté monté d'un build précédent fait échouer hdiutil (« Resource busy ») :
# le démonter, puis réessayer quelques fois.
hdiutil detach "/Volumes/SafeLinkHub Agent" -force >/dev/null 2>&1 || true
for attempt in 1 2 3 4 5; do
  if hdiutil create -volname "SafeLinkHub Agent" -srcfolder dist-agent/dmg -ov -format UDZO "$OUT" >/dev/null 2>&1; then
    echo "OK : $OUT"; exit 0
  fi
  echo "hdiutil occupé, nouvelle tentative ($attempt)…"; sleep 3
  hdiutil detach "/Volumes/SafeLinkHub Agent" -force >/dev/null 2>&1 || true
done
# Dernier essai sans masquer l'erreur, pour la voir dans les logs.
hdiutil create -volname "SafeLinkHub Agent" -srcfolder dist-agent/dmg -ov -format UDZO "$OUT"
echo "OK : $OUT"
