import { type CSSProperties, type ReactNode, useState } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { APP_BACKGROUND_FALLBACK, CARD_ASPECT_RATIO, GLASS_TILE_BACKGROUND, GLASS_TILE_BACKDROP_FILTER, borders, colors, glassPanelStyle, radius, shadows, previewKickerStyle, uiTextColor, uiTextShadow } from "../styles/shared";
import type { CustomisationOption, CustomisationSettings } from "../utils/customisation";
import { playmatOptions, sleeveOptions } from "../utils/customisation";

const SELECTED_TICK = "\u2713";

export function CustomisationScreen({
  settings,
  onChange,
  onBack,
}: {
  settings: CustomisationSettings;
  onChange: (settings: CustomisationSettings) => void;
  onBack: () => void;
}) {
  return (
    <section style={customisationShellStyle}>
      <header style={customisationHeaderStyle}>
        <div>
          <div style={previewKickerStyle}>Customisation</div>
          <h1 style={customisationTitleStyle}>Set your look</h1>
          <p style={customisationSubtitleStyle}>Pick a playmat background and card sleeve for your cards.</p>
        </div>
        <NeutralButton style={backButtonStyle} onClick={onBack}>Back</NeutralButton>
      </header>

      <CustomisationSection title="Playmat" subtitle="Changes your playmat.">
        {playmatOptions.map((option) => (
          <CustomisationTile
            key={option.id}
            option={option}
            selected={option.id === settings.playmatId}
            previewKind="playmat"
            onSelect={() => onChange({ ...settings, playmatId: option.id })}
          />
        ))}
      </CustomisationSection>

      <CustomisationSection title="Sleeve" subtitle="Changes your card sleeve.">
        {sleeveOptions.map((option) => (
          <CustomisationTile
            key={option.id}
            option={option}
            selected={option.id === settings.sleeveId}
            previewKind="sleeve"
            onSelect={() => onChange({ ...settings, sleeveId: option.id })}
          />
        ))}
      </CustomisationSection>
    </section>
  );
}

function CustomisationSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section style={customisationPanelStyle}>
      <div>
        <div style={previewKickerStyle}>{title}</div>
        <h2 style={sectionTitleStyle}>{subtitle}</h2>
      </div>
      <div style={optionGridStyle}>{children}</div>
    </section>
  );
}

function CustomisationTile({
  option,
  selected,
  previewKind,
  onSelect,
}: {
  option: CustomisationOption;
  selected: boolean;
  previewKind: "playmat" | "sleeve";
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      style={optionTileStyle(selected, hovered)}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {selected && <span style={selectedBadgeStyle}>{SELECTED_TICK}</span>}
      <span style={optionPreviewWrapStyle(previewKind)}>
        {option.image && previewKind === "sleeve" ? (
          <span style={sleevePreviewClipStyle}>
            <img style={sleevePreviewImageStyle} src={option.image} alt="" draggable={false} />
          </span>
        ) : option.image ? (
          <img style={optionPreviewImageStyle(previewKind)} src={option.image} alt="" draggable={false} />
        ) : (
          <span style={defaultPreviewStyle(previewKind)}>
            <span style={defaultPreviewMarkStyle}>D</span>
          </span>
        )}
      </span>
      <strong style={optionNameStyle}>{option.name}</strong>
    </button>
  );
}

const customisationShellStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gap: 22,
  padding: "24px 0 40px",
};

const customisationHeaderStyle: CSSProperties = {
  ...glassPanelStyle,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: 18,
};

const customisationTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

const customisationSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 850,
};

const backButtonStyle: CSSProperties = {
  padding: "0 16px",
  height: 44,
};

const customisationPanelStyle: CSSProperties = {
  ...glassPanelStyle,
  display: "grid",
  gap: 16,
  padding: 18,
};

const sectionTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const optionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

function optionTileStyle(selected: boolean, hovered: boolean): CSSProperties {
  return {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    gap: 10,
    borderRadius: radius.md,
    border: selected
      ? "2px solid rgba(0, 0, 0, 0.62)"
      : hovered
        ? "1px solid rgba(0, 0, 0, 0.36)"
        : borders.neutralStrong,
    background: GLASS_TILE_BACKGROUND,
    boxShadow: hovered || selected ? "0 18px 42px rgba(17, 24, 39, 0.18)" : shadows.sm,
    padding: 12,
    cursor: "pointer",
    color: uiTextColor,
    transform: hovered && !selected ? "translateY(-3px)" : undefined,
    transition: "background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
    backdropFilter: GLASS_TILE_BACKDROP_FILTER,
    textShadow: uiTextShadow,
  };
}

function optionPreviewWrapStyle(kind: "playmat" | "sleeve"): CSSProperties {
  return {
    width: kind === "playmat" ? "100%" : 96,
    aspectRatio: kind === "playmat" ? "16 / 9" : CARD_ASPECT_RATIO,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    borderRadius: radius.md,
    border: "1px solid rgba(217, 225, 218, 0.82)",
    background: GLASS_TILE_BACKGROUND,
    boxShadow: "0 14px 30px rgba(17, 24, 39, 0.14)",
  };
}

function optionPreviewImageStyle(kind: "playmat" | "sleeve"): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
  };
}

const sleevePreviewClipStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "block",
  overflow: "hidden",
};

const sleevePreviewImageStyle: CSSProperties = {
  position: "absolute",
  inset: "-6%",
  width: "112%",
  height: "112%",
  objectFit: "cover",
  display: "block",
};

function defaultPreviewStyle(kind: "playmat" | "sleeve"): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    background: kind === "playmat"
      ? `radial-gradient(circle at 20% 12%, rgba(255,255,255,0.9), transparent 30%), linear-gradient(135deg, ${APP_BACKGROUND_FALLBACK} 0%, #2a4a45 52%, #d6519d 100%)`
      : "linear-gradient(145deg, #17211c 0%, #284135 48%, #d6519d 100%)",
  };
}

const defaultPreviewMarkStyle: CSSProperties = {
  width: 42,
  height: 42,
  display: "grid",
  placeItems: "center",
  borderRadius: radius.circle,
  background: colors.glassStrong,
  color: colors.black,
  fontSize: 20,
  fontWeight: 950,
  lineHeight: 1,
};

const optionNameStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 14,
  fontWeight: 950,
  textAlign: "center",
};

const selectedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  zIndex: 1,
  width: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  borderRadius: radius.circle,
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: colors.black,
  color: colors.white,
  fontSize: 15,
  fontWeight: 950,
};
