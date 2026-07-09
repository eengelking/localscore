import { Icon } from "./Icon.js";

export function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="callout-warning" role="alert">
      <Icon name="warning" size={18} />
      <p>{children}</p>
    </div>
  );
}
