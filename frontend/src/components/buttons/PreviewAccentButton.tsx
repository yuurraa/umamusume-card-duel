import { type CSSProperties, type ReactNode, useState } from "react";
import { previewAccentButtonStyle } from "../../styles/shared";

type PreviewAccentButtonStyle = CSSProperties | ((state: { enabled: boolean; hovered: boolean; accent: string }) => CSSProperties);

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
  style?: PreviewAccentButtonStyle;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = !disabled;
  const extraStyle = typeof style === "function" ? style({ enabled, hovered, accent }) : style;

  return (
    <button
      type="button"
      style={{ ...previewAccentButtonStyle(enabled, hovered, accent), ...extraStyle }}
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
