import { type CSSProperties, useEffect, useRef, useState } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { attackButtonStyle, overlayBackdropStyle } from "../../styles/shared";

export function CoinFlipOverlay({
  result = "heads",
  results,
  message,
  onContinue,
  mode = "result",
  onChoose,
  canChoose = true,
}: {
  result?: "heads" | "tails";
  results?: Array<"heads" | "tails"> | undefined;
  message: string;
  onContinue?: () => void;
  mode?: "result" | "prompt";
  onChoose?: ((choice: "heads" | "tails") => void) | undefined;
  canChoose?: boolean | undefined;
}) {
  const isPrompt = mode === "prompt";
  const flipResults = results && results.length > 0 ? results : [result];
  const [activeIndex, setActiveIndex] = useState(0);
  const [angle, setAngle] = useState(0);
  const [isSettled, setIsSettled] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const onContinueRef = useRef(onContinue ?? (() => undefined));
  const continuedRef = useRef(false);
  const activeResult = flipResults[activeIndex] ?? result;
  const finalAngle = 2160 + (activeResult === "heads" ? 0 : 180);
  const hasMoreFlips = activeIndex < flipResults.length - 1;

  useEffect(() => {
    onContinueRef.current = onContinue ?? (() => undefined);
  }, [onContinue]);

  useEffect(() => {
    if (isPrompt) return undefined;
    let frame = 0;
    const totalFrames = 22;
    setAngle(0);
    setIsSettled(false);
    setCountdown(5);
    const intervalId = window.setInterval(() => {
      frame += 1;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAngle(finalAngle * eased);
      if (progress >= 1) {
        setIsSettled(true);
        window.clearInterval(intervalId);
      }
    }, 32);

    return () => window.clearInterval(intervalId);
  }, [finalAngle, activeIndex, isPrompt]);

  useEffect(() => {
    if (isPrompt) return undefined;
    if (!isSettled) return undefined;
    if (hasMoreFlips) {
      continuedRef.current = false;
      const timeoutId = window.setTimeout(() => {
        setActiveIndex((current) => Math.min(current + 1, flipResults.length - 1));
      }, 720);
      return () => window.clearTimeout(timeoutId);
    }
    continuedRef.current = false;
    setCountdown(3);
    const intervalId = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSettled, hasMoreFlips, flipResults.length, isPrompt]);

  useEffect(() => {
    if (isPrompt || !isSettled || hasMoreFlips || countdown > 0 || continuedRef.current) return;
    continuedRef.current = true;
    onContinueRef.current();
  }, [countdown, isPrompt, isSettled, hasMoreFlips]);

  if (isPrompt) {
    const promptTitle = canChoose ? "Choose Heads or Tails" : "Preparing coin flip";
    return (
      <div style={coinFlipBackdropStyle}>
        <style>{OVERLAY_FADE_IN_KEYFRAMES}</style>
        <section style={coinFlipShellStyle}>
          <span style={coinFlipKickerStyle}>Coin Flip</span>
          <div style={coinSlotStyle}>
            <div aria-hidden="true" style={coinStyle(0, "heads")}>
              <div style={coinFaceStyle("heads")}>
                <span style={coinFaceMarkStyle}>H</span>
                <span style={coinFaceLabelStyle}>Heads</span>
              </div>
              <div style={coinFaceStyle("tails")}>
                <span style={coinFaceMarkStyle}>T</span>
                <span style={coinFaceLabelStyle}>Tails</span>
              </div>
              <div style={coinEdgeStyle} />
            </div>
          </div>
          <strong style={coinResultStyle}>{promptTitle}</strong>
          <div style={coinChoiceRowStyle}>
            <NeutralButton
              style={attackButtonStyle(canChoose)}
              disabled={!canChoose}
              onClick={() => onChoose?.("heads")}
            >
              Heads
            </NeutralButton>
            <NeutralButton
              style={attackButtonStyle(canChoose)}
              disabled={!canChoose}
              onClick={() => onChoose?.("tails")}
            >
              Tails
            </NeutralButton>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={coinFlipBackdropStyle}>
      <style>{OVERLAY_FADE_IN_KEYFRAMES}</style>
      <section style={coinFlipShellStyle}>
        <span style={coinFlipKickerStyle}>{flipResults.length > 1 ? `Coin Flip ${activeIndex + 1} / ${flipResults.length}` : "Coin Flip"}</span>
        <div style={coinSlotStyle}>
          <div aria-hidden="true" style={coinStyle(angle, activeResult)}>
            <div style={coinFaceStyle("heads")}>
              <span style={coinFaceMarkStyle}>H</span>
              <span style={coinFaceLabelStyle}>Heads</span>
            </div>
            <div style={coinFaceStyle("tails")}>
              <span style={coinFaceMarkStyle}>T</span>
              <span style={coinFaceLabelStyle}>Tails</span>
            </div>
            <div style={coinEdgeStyle} />
          </div>
        </div>
        <div style={coinPipsStyle} aria-hidden="true">
          {flipResults.map((entry, index) => (
            <span key={`${entry}-${index}`} style={coinPipStyle(entry, index, activeIndex, isSettled)}>{coinPipLabel(entry, index, activeIndex, isSettled)}</span>
          ))}
        </div>
        <strong style={coinResultStyle}>{isSettled ? (activeResult === "heads" ? "Heads" : "Tails") : "Flipping..."}</strong>
        <span style={coinMessageStyle}>{isSettled && !hasMoreFlips ? message : ""}</span>
        <span style={coinCountdownStyle}>{isSettled && !hasMoreFlips ? `Continuing in ${countdown}s` : ""}</span>
      </section>
    </div>
  );
}

const coinFlipBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 90,
  background: "rgba(15, 23, 42, 0.72)",
  animation: "overlay-fade-in 140ms ease both",
};

const OVERLAY_FADE_IN_KEYFRAMES = `
@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;

const coinFlipShellStyle: CSSProperties = {
  width: "min(560px, calc(100vw - 36px))",
  minHeight: 320,
  borderRadius: 14,
  border: "1px solid rgba(255, 255, 255, 0.26)",
  background: "radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(15, 23, 42, 0.96) 58%)",
  boxShadow: "0 26px 90px rgba(0, 0, 0, 0.48)",
  padding: "22px 18px",
  display: "grid",
  justifyItems: "center",
  gap: 10,
  color: "#f8fafc",
  textAlign: "center",
};

const coinFlipKickerStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "rgba(226, 232, 240, 0.9)",
};

const coinSlotStyle: CSSProperties = {
  width: 164,
  height: 164,
  display: "grid",
  placeItems: "center",
  perspective: 1200,
};

function coinStyle(angle: number, result: "heads" | "tails"): CSSProperties {
  return {
    width: 140,
    height: 140,
    borderRadius: "50%",
    boxShadow: result === "heads"
      ? "0 16px 38px rgba(250, 204, 21, 0.34)"
      : "0 16px 38px rgba(148, 163, 184, 0.3)",
    transform: `rotateY(${angle}deg)`,
    transformStyle: "preserve-3d",
    WebkitTransformStyle: "preserve-3d",
    transition: "transform 32ms linear",
    willChange: "transform",
    position: "relative",
  };
}

function coinFaceStyle(face: "heads" | "tails"): CSSProperties {
  const tone = coinFaceTone(face);

  return {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: tone.border,
    background: tone.background,
    color: tone.color,
    display: "grid",
    placeItems: "center",
    gridTemplateRows: "1fr auto",
    padding: "28px 0 22px",
    boxSizing: "border-box",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    transform: face === "heads" ? "translateZ(7px)" : "rotateY(180deg) translateZ(7px)",
    overflow: "hidden",
  };
}

function coinFaceTone(face: "heads" | "tails"): { border: string; background: string; color: string } {
  if (face === "heads") {
    return {
      border: "2px solid rgba(250, 204, 21, 0.96)",
      background: "linear-gradient(145deg, #fde047 0%, #facc15 48%, #ca8a04 100%)",
      color: "#451a03",
    };
  }

  return {
    border: "2px solid rgba(148, 163, 184, 0.78)",
    background: "linear-gradient(145deg, #cbd5e1 0%, #64748b 50%, #1e293b 100%)",
    color: "#f8fafc",
  };
}

const coinFaceMarkStyle: CSSProperties = {
  width: 74,
  height: 74,
  borderRadius: "50%",
  border: "2px solid currentColor",
  display: "grid",
  placeItems: "center",
  fontSize: 48,
  lineHeight: 1,
  fontWeight: 950,
  boxShadow: "inset 0 0 0 5px rgba(255, 255, 255, 0.08)",
};

const coinFaceLabelStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 950,
  textTransform: "uppercase",
  textShadow: "0 0 0 ",
};

const coinEdgeStyle: CSSProperties = {
  position: "absolute",
  inset: 4,
  borderRadius: "50%",
  border: "10px solid rgba(120, 53, 15, 0.72)",
  transform: "translateZ(-1px)",
  pointerEvents: "none",
};

const coinResultStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 950,
  textShadow: "0 0 0",
};

const coinPipsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 26,
};

const coinChoiceRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "center",
};

function coinPipStyle(result: "heads" | "tails", index: number, activeIndex: number, isSettled: boolean): CSSProperties {
  const revealed = index < activeIndex || (index === activeIndex && isSettled);
  return {
    width: 26,
    height: 26,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    border: revealed
      ? result === "heads" ? "1px solid rgba(250, 204, 21, 0.9)" : "1px solid rgba(148, 163, 184, 0.82)"
      : "1px solid rgba(226, 232, 240, 0.24)",
    background: revealed
      ? result === "heads" ? "rgba(250, 204, 21, 0.92)" : "rgba(100, 116, 139, 0.92)"
      : "rgba(15, 23, 42, 0.64)",
    color: revealed ? result === "heads" ? "#451a03" : "#f8fafc" : "rgba(226, 232, 240, 0.44)",
    fontSize: 12,
    fontWeight: 950,
    lineHeight: 1,
  };
}

function coinPipLabel(result: "heads" | "tails", index: number, activeIndex: number, isSettled: boolean): string {
  const revealed = index < activeIndex || (index === activeIndex && isSettled);
  if (!revealed) return "";
  return result === "heads" ? "H" : "T";
}

const coinMessageStyle: CSSProperties = {
  maxWidth: 500,
  minHeight: 18,
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 800,
  color: "rgba(226, 232, 240, 0.96)",
  textShadow: "0 0 0",
};

const coinCountdownStyle: CSSProperties = {
  minHeight: 16,
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 900,
  color: "rgba(226, 232, 240, 0.72)",
  textShadow: "0 0 0",
};
