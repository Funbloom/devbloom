"use client";

/**
 * UI Builder — studio tool (all projects). Layout mirrors Image Gen: fixed-width left panel + flexible right panel.
 */
export default function UIBuilderPage() {
  return (
    <main>
      <div className="imagegen-shell">
        <div className="imagegen-left">
          <div className="imagegen-panel">
            <h2 className="imagegen-panel-title">Tools</h2>
            <div className="imagegen-panel-body">
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted, #94a3b8)" }}>
                Left panel — controls and structure will go here.
              </p>
            </div>
          </div>
        </div>
        <div className="imagegen-right">
          <div className="imagegen-panel" style={{ flex: 1, minHeight: "min(70vh, 900px)" }}>
            <h2 className="imagegen-panel-title">Canvas</h2>
            <div className="imagegen-panel-body" style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted, #94a3b8)" }}>
                Right panel — preview and canvas will go here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
