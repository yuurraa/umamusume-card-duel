import { type CSSProperties, type ReactNode, useState } from "react";
import { previewAccentButtonStyle } from "../../styles/shared";

export function PreviewAccentButton({
  children,
  onClick,
  disabled = false,
  accent,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent: string;
  style?: CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = !disabled;

  return (
    <button
      type="button"
      style={{ ...previewAccentButtonStyle(enabled, hovered, accent), ...style }}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {children}
    </button>
  );
}
