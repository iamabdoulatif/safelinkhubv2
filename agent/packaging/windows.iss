; Installeur Windows de l'agent SafeLinkHub (Inno Setup 6).
; Installation par utilisateur, sans droits administrateur. Non signé : au premier
; lancement, SmartScreen demande « Informations complémentaires › Exécuter quand même ».
; Compilé par .github/workflows/agent-installers.yml après build-sea.mjs.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6B0F3C1E-5A2D-4C8B-9E3F-2A7D51C0B8E4}
AppName=SafeLinkHub Agent
AppVersion={#AppVersion}
AppPublisher=SafeLinkHub
AppPublisherURL=https://safelinkhub.io
DefaultDirName={localappdata}\Programs\SafeLinkHub Agent
DefaultGroupName=SafeLinkHub
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist-agent
OutputBaseFilename=SafeLinkHub-Agent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=SafeLinkHub Agent

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "..\..\dist-agent\safelinkhub-agent.exe"; DestDir: "{app}"; DestName: "SafeLinkHub Agent.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\SafeLinkHub Agent"; Filename: "{app}\SafeLinkHub Agent.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\SafeLinkHub Agent"; Filename: "{app}\SafeLinkHub Agent.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\SafeLinkHub Agent.exe"; Description: "Lancer SafeLinkHub Agent"; Flags: nowait postinstall skipifsilent
