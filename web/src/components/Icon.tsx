const PATHS: Record<IconName, string> = {
  trash:
    "M4 6h16M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6m2 0-.7 12.6A2 2 0 0 1 14.3 20.5H9.7a2 2 0 0 1-2-1.9L7 6m3 4.5v6m4-6v6",
  pencil:
    "M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5 17v3ZM14.5 8 16 6.5l3 3L17.5 11 14.5 8Z",
  sun: "M12 4V2m0 20v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  moon: "M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z",
  chevron: "M6 9l6 6 6-6",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5.5v-.4c0-.85.5-1.3 1.05-1.7.6-.43 1.2-.9 1.2-1.9A2.25 2.25 0 0 0 12 9.25 2.25 2.25 0 0 0 9.75 11.5M12 17.75h.01",
  warning:
    "M12 3.5 2 20.5h20L12 3.5Zm0 6.5v4.5m0 3h.01",
};

const VIEW_BOX: Record<IconName, string> = {
  trash: "0 0 22 24",
  pencil: "0 0 22 24",
  sun: "0 0 24 24",
  moon: "0 0 24 24",
  chevron: "0 0 24 24",
  question: "0 0 24 24",
  warning: "0 0 24 24",
};

export type IconName = "trash" | "pencil" | "sun" | "moon" | "chevron" | "question" | "warning";

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX[name]}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
