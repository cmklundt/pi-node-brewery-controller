/** ReportsTab — brew session logs, charts, CSV export (requirement #6). */
import React, { useState, useEffect } from "react";
import { C, legend, mono } from "../theme.js";
import { Panel, Row, Tap, Note } from "../ui.jsx";
import Graph from "../Graph.jsx";
import { get } from "../api.js";

export default function ReportsTab({ config }) {
  const [sessions, setSessions] = useState([]);
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState(null);

  useEffect(() => { get("/api/sessions").then(setSessions).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel) return setRows(null);
    get(`/api/sessions/${sel}`).then(setRows).catch(() => setRows([]));
  }, [sel]);

  const samples = (rows || []).filter((r) => r.kind === "sample");
  const events = (rows || []).filter((r) => r.kind === "event");
  const meta = (rows || []).find((r) => r.kind === "meta");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,340px) 1fr", gap: 12, alignItems: "start" }}>
      <Panel title="Brew sessions">
        {sessions.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>
          No sessions logged yet — every brew you start is recorded automatically.
        </div>}
        {sessions.map((s) => (
          <Row key={s.id} k={s.recipe} v={(s.bytes / 1024).toFixed(0) + " KB"}
            sub={s.startedAt ? new Date(s.startedAt).toLocaleString() : s.id} ok={s.id === sel}
            onClick={() => setSel(s.id)} />
        ))}
        <Note>Sessions live on the Pi as append-only logs. Open one to chart it or pull CSV into a spreadsheet.</Note>
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {!sel && <Panel title="Pick a session"><div style={{ fontSize: 12.5, color: C.faint }}>Select a brew session on the left to see its full temperature record and event timeline.</div></Panel>}
        {sel && rows && (<>
          <Graph rows={samples} config={config} title={`${meta?.recipeName || sel} — temperatures`} domain={[40, 220]} />
          <Panel title="Event timeline" right={
            <a href={`/api/sessions/${sel}.csv`} download style={{ textDecoration: "none" }}>
              <Tap color={C.amber} pad="8px 14px" size={11}>Download CSV</Tap>
            </a>}>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "7px 4px", borderBottom: `1px solid ${C.ruleSoft}` }}>
                  <span style={{ ...mono, fontSize: 10.5, color: C.faint, whiteSpace: "nowrap" }}>
                    {e.ts ? new Date(e.ts).toLocaleTimeString() : ""}
                  </span>
                  <span style={{ ...legend, fontSize: 11.5, color: C.dim }}>{e.type}</span>
                  <span style={{ fontSize: 11.5, color: C.text }}>{e.step || e.name || e.recipe || ""}</span>
                </div>
              ))}
              {events.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>No events in this session.</div>}
            </div>
          </Panel>
        </>)}
      </div>
    </div>
  );
}
