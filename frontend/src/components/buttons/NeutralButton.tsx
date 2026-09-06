import { type CSSProperties, type ReactNode, useState } from "react";
import { neutralButtonStyle, type NeutralButtonTone } from "../../styles/shared";

export function NeutralButton({
  children,
  onClick,
  disabled = false,
  tone = "default",
  style,
  ariaLabel,
  autoFocus = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: NeutralButtonTone;
  style?: CSSProperties;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const enabled = !disabled;

  return (
    <button
      type="button"
      style={{ ...neutralButtonStyle(enabled, hovered, tone), ...style }}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  );
}
