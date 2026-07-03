import SettingsTabs from "./SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SettingsTabs />
      {children}
    </div>
  );
}
