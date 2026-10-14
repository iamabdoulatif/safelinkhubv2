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
cp -R "$APP" dist-agent/dmg/
ln -s /Applications dist-agent/dmg/Applications
OUT="dist-agent/SafeLinkHub-Agent-macOS-${ARCH}.dmg"
rm -f "$OUT"
hdiutil create -volname "SafeLinkHub Agent" -srcfolder dist-agent/dmg -ov -format UDZO "$OUT" >/dev/null
echo "OK : $OUT"
