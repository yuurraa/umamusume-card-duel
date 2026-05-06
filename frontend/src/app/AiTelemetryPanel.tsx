import { useEffect, useMemo, useState } from "react";
import { clearAiTelemetry, getAiTelemetrySnapshot, type AiTelemetryRecord } from "../game/engine/flow/ai/telemetry";

type EventFilter = "all" | "turn_goal" | "trainer_bundle_scores" | "combat_candidates";

export function AiTelemetryPanel() {
  const [open, setOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [records, setRecords] = useState<AiTelemetryRecord[]>(() => getAiTelemetrySnapshot());

  useEffect(() => {
    const onTelemetry = () => {
      if (paused) return;
      setRecords(getAiTelemetrySnapshot());
    };
    globalThis.addEventListener("uma-ai-telemetry", onTelemetry);
    return () => globalThis.removeEventListener("uma-ai-telemetry", onTelemetry);
  }, [paused]);

  const filtered = useMemo(() => {
    const source = records.slice(-200).reverse();
    if (eventFilter === "all") return source;
    return source.filter((record) => record.event === eventFilter);
  }, [records, eventFilter]);

  return (
    <aside style={panelStyle(open)}>
      <div style={headerStyle}>
        <strong style={{ fontSize: 12 }}>AI Telemetry</strong>
        <div style={rowStyle}>
          <button type="button" style={btnStyle} onClick={() => setOpen((current) => !current)}>{open ? "Hide" : "Show"}</button>
          <button type="button" style={btnStyle} onClick={() => setPaused((current) => !current)}>{paused ? "Resume" : "Pause"}</button>
          <button type="button" style={btnStyle} onClick={downloadLogs}>Download</button>
          <button type="button" style={btnStyle} onClick={() => { clearAiTelemetry(); setRecords([]); }}>Clear</button>
        </div>
      </div>
      {open && (
        <>
          <div style={controlsStyle}>
            <label style={{ fontSize: 11 }}>
              Event:
              <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)} style={selectStyle}>
                <option value="all">All</option>
                <option value="turn_goal">turn_goal</option>
                <option value="trainer_bundle_scores">trainer_bundle_scores</option>
                <option value="combat_candidates">combat_candidates</option>
              </select>
            </label>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{filtered.length} shown</span>
          </div>
          <div style={listStyle}>
            {filtered.map((record) => (
              <div key={record.seq} style={entryStyle}>
                <div style={entryHeadStyle}>
                  <span>{record.event}</span>
                  <span style={{ opacity: 0.72 }}>{new Date(record.ts).toLocaleTimeString()}</span>
                </div>
                <pre style={preStyle}>{JSON.stringify(record.payload, null, 2)}</pre>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ fontSize: 11, opacity: 0.7 }}>No telemetry yet.</div>}
          </div>
        </>
      )}
    </aside>
  );

  function downloadLogs() {
    const payload = {
      exportedAt: new Date().toISOString(),
      count: records.length,
      records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `ai-telemetry-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function panelStyle(open: boolean) {
  return {
    position: "fixed" as const,
    right: 8,
    bottom: 8,
    width: 420,
    maxHeight: open ? "60vh" : 42,
    zIndex: 500,
    background: "rgba(8, 13, 20, 0.94)",
    color: "#dbe7ff",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    borderRadius: 10,
    boxShadow: "0 10px 26px rgba(0,0,0,0.45)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflow: "hidden",
  };
}

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
};

const controlsStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 10px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
};

const rowStyle = {
  display: "flex",
  gap: 6,
};

const listStyle = {
  maxHeight: "45vh",
  overflowY: "auto" as const,
  padding: 8,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

const entryStyle = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 8,
  padding: 6,
  background: "rgba(22, 30, 44, 0.72)",
};

const entryHeadStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 11,
  marginBottom: 4,
};

const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap" as const,
  fontSize: 10,
  lineHeight: 1.35,
};

const btnStyle = {
  background: "rgba(56, 189, 248, 0.14)",
  border: "1px solid rgba(56, 189, 248, 0.36)",
  color: "#e6f4ff",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 11,
  cursor: "pointer",
};

const selectStyle = {
  marginLeft: 6,
  background: "rgba(15, 23, 42, 0.9)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: 11,
};
