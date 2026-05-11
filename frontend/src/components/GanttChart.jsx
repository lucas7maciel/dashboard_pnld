import React, { useEffect, useMemo, useRef, useState } from "react";

const PHASE_KEYS = [
  { key: "vi", label: "Validação de Inscrição", short: "VI", color: "#2F7DFA" },
  { key: "ap", label: "Avaliação Pedagógica", short: "AP", color: "#B7AF18" },
  { key: "at", label: "Análise de Atributos", short: "Atrib", color: "#E8A838" },
  { key: "ac", label: "Acessibilidade", short: "Acess", color: "#06B6D4" },
  { key: "iq", label: "Insumos de Qualificação", short: "Insumos", color: "#8B5CF6" },
];

const SCALE_CONFIG = {
  meses: { months: 1, colWidth: 60, formatLabel: (d) => `${monthShort(d.getMonth())} ${d.getFullYear()}` },
  bimestre: { months: 2, colWidth: 80, formatLabel: (d) => `${monthShort(d.getMonth())}-${monthShort((d.getMonth() + 1) % 12)} ${d.getFullYear()}` },
  semestre: { months: 6, colWidth: 100, formatLabel: (d) => `${d.getMonth() < 6 ? "S1" : "S2"} ${d.getFullYear()}` },
  ano: { months: 12, colWidth: 120, formatLabel: (d) => `${d.getFullYear()}` },
};

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function monthShort(idx) { return MONTHS_SHORT[idx]; }

const RANGE_START = new Date(2021, 6, 1);
const RANGE_END = new Date(2026, 11, 31);

const editalApprox = {
  "PNLD 2021 - EDITAL COMPLEMENTAR - Ensino Médio": ["2021-01-01", "2023-06-01"],
  "PNLD 2022 - EDUCAÇÃO INFANTIL": ["2021-08-01", "2023-06-01"],
  "PNLD 2023 - Anos Iniciais": ["2022-01-01", "2023-12-01"],
  "PNLD 2024-2027 - ANOS FINAIS ": ["2022-08-01", "2024-06-01"],
};

function parseDate(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = m[3] ? parseInt(m[3], 10) : 1;
  return new Date(y, mo, d);
}

function dateToX(date, scale, colWidthOverride) {
  const dateMonths = (date.getFullYear() - RANGE_START.getFullYear()) * 12
    + date.getMonth() - RANGE_START.getMonth()
    + date.getDate() / 30;
  const cfg = SCALE_CONFIG[scale];
  const cw = colWidthOverride || cfg.colWidth;
  return (dateMonths / cfg.months) * cw;
}

function buildHeaderCells(scale) {
  const cfg = SCALE_CONFIG[scale];
  const cells = [];
  let cursor = new Date(RANGE_START.getFullYear(), RANGE_START.getMonth(), 1);
  while (cursor <= RANGE_END) {
    cells.push({ date: new Date(cursor), label: cfg.formatLabel(cursor) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + cfg.months, 1);
  }
  return cells;
}

function formatDate(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function GanttChart({ objetos, collapsedEditals, toggleEdital, setCollapsedEditals }) {
  const [timeScale, setTimeScale] = useState("semestre");
  const [labelWidth, setLabelWidth] = useState(350);
  const labelsRef = useRef(null);
  const timelineRef = useRef(null);
  const syncing = useRef(false);

  const cfg = SCALE_CONFIG[timeScale];
  const headerCells = useMemo(() => buildHeaderCells(timeScale), [timeScale]);

  // Track timeline container width so columns stretch to fill larger screens
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    if (!timelineRef.current) return;
    const el = timelineRef.current;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveColW = Math.max(
    cfg.colWidth,
    headerCells.length > 0 ? containerW / headerCells.length : cfg.colWidth
  );
  const totalWidth = headerCells.length * effectiveColW;
  const todayX = dateToX(new Date(), timeScale, effectiveColW);

  const groups = useMemo(() => {
    const map = new Map();
    objetos.forEach((o) => {
      if (!map.has(o.edital)) map.set(o.edital, []);
      map.get(o.edital).push(o);
    });
    return Array.from(map.entries());
  }, [objetos]);

  const editalIds = useMemo(() => groups.map(([edital]) => edital), [groups]);

  // Init: collapse all editais on first load
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && editalIds.length > 0 && setCollapsedEditals) {
      setCollapsedEditals(new Set(editalIds));
      initRef.current = true;
    }
  }, [editalIds, setCollapsedEditals]);

  const allExpanded = collapsedEditals.size === 0;
  const toggleAll = () => {
    if (!setCollapsedEditals) return;
    if (allExpanded) setCollapsedEditals(new Set(editalIds));
    else setCollapsedEditals(new Set());
  };

  // Total content height (for grid columns)
  const contentHeight = useMemo(() => {
    let h = 0;
    groups.forEach(([edital, list]) => {
      h += 32; // group row
      if (!collapsedEditals.has(edital)) h += list.length * 36;
    });
    return h;
  }, [groups, collapsedEditals]);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollLeft = Math.max(0, todayX - timelineRef.current.clientWidth / 3);
    }
  }, [timeScale]);

  // Vertical sync
  const onLabelsScroll = () => {
    if (syncing.current) return;
    if (timelineRef.current && labelsRef.current) {
      syncing.current = true;
      timelineRef.current.scrollTop = labelsRef.current.scrollTop;
      syncing.current = false;
    }
  };
  const onTimelineScroll = () => {
    if (syncing.current) return;
    if (timelineRef.current && labelsRef.current) {
      syncing.current = true;
      labelsRef.current.scrollTop = timelineRef.current.scrollTop;
      syncing.current = false;
    }
  };

  // Resize
  const onResizerDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = labelWidth;
    const onMove = (ev) => {
      const next = Math.min(600, Math.max(200, startW + (ev.clientX - startX)));
      setLabelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Compute bars for each object
  function computeBars(o) {
    const bars = [];
    const approx = editalApprox[o.edital];
    PHASE_KEYS.forEach((p, idx) => {
      const phase = o.phases.find((x) => x.key === p.key);
      if (!phase || phase.status === "sem dados") return;

      let start = null;
      let end = null;
      let dashed = false;

      if (p.key === "ap" && o.ap.inicio) {
        start = parseDate(o.ap.inicio);
        end = parseDate(o.ap.termino) || (start && addMonths(start, 3));
      } else if (p.key === "ac" && (o.acessibilidade.inicio || o.acessibilidade.previsaoInicio)) {
        start = parseDate(o.acessibilidade.inicio || o.acessibilidade.previsaoInicio);
        end = parseDate(o.acessibilidade.fim || o.acessibilidade.previsaoFim) || (start && addMonths(start, 3));
        dashed = !o.acessibilidade.inicio;
      } else if (p.key === "iq" && (o.insumos.inicio || o.insumos.previsaoInicio)) {
        start = parseDate(o.insumos.inicio || o.insumos.previsaoInicio);
        end = parseDate(o.insumos.fim || o.insumos.previsaoFim) || (start && addMonths(start, 3));
        dashed = !o.insumos.inicio;
      } else if (p.key === "at" && o.atributos.inicio) {
        start = parseDate(o.atributos.inicio);
        end = parseDate(o.atributos.fim) || (start && addMonths(start, 3));
      } else if (approx) {
        const a = parseDate(approx[0]);
        const b = parseDate(approx[1]);
        if (!a || !b) return;
        const totalMs = b - a;
        const span = totalMs / PHASE_KEYS.length;
        start = new Date(a.getTime() + idx * span);
        end = new Date(start.getTime() + span * 0.9);
        dashed = true;
      } else {
        return;
      }

      if (!start || !end) return;
      const x = dateToX(start, timeScale, effectiveColW);
      const w = Math.max(dateToX(end, timeScale, effectiveColW) - x, 6);
      const isSusp = phase.status === "suspenso";
      const bg = dashed ? "transparent" : isSusp ? "#DC2626" : p.color;
      const opacity = isSusp ? 0.6 : (p.opacity ?? 1);
      bars.push({
        key: `${o.id}-${p.key}`,
        x, w, bg, opacity, dashed,
        title: `${p.label}: ${formatDate(start)} — ${formatDate(end)}`,
      });
    });
    return bars;
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  }

  // Macro bar per edital
  function computeMacro(edital, list) {
    const allBars = list.flatMap((o) => computeBars(o));
    if (allBars.length === 0) return null;
    const macroStartX = Math.min(...allBars.map((b) => b.x));
    const macroEndX = Math.max(...allBars.map((b) => b.x + b.w));

    const total = list.length;
    const concluidos = list.filter((o) => o.status === "CONCLUIDO").length;
    const suspensos = list.filter((o) => o.status === "SUSPENSO").length;
    const pendentes = list.filter((o) => o.status === "PENDENTE").length;
    const andamento = list.filter((o) => o.status === "EM_ANDAMENTO").length;

    let statusClass = "andamento";
    let statusTxt = `${andamento} em andamento`;
    if (concluidos === total) {
      statusClass = "concluido";
      statusTxt = `${concluidos}/${total} concluídos`;
    } else if (suspensos > 0) {
      statusClass = "suspenso";
      statusTxt = `${suspensos} suspenso(s)`;
    } else if (pendentes > 0) {
      statusClass = "pendente";
      statusTxt = `${pendentes} pendente(s)`;
    } else if (andamento > 0) {
      statusClass = "andamento";
      statusTxt = `${andamento} em andamento`;
    }

    // Find date range from raw bar times: convert min x back not trivial; instead compute from list
    let minDate = null;
    let maxDate = null;
    list.forEach((o) => {
      const candidates = [
        o.ap?.inicio, o.ap?.termino,
        o.acessibilidade?.inicio, o.acessibilidade?.fim,
        o.acessibilidade?.previsaoInicio, o.acessibilidade?.previsaoFim,
        o.insumos?.inicio, o.insumos?.fim,
        o.insumos?.previsaoInicio, o.insumos?.previsaoFim,
        o.atributos?.inicio, o.atributos?.fim,
      ];
      candidates.forEach((s) => {
        const d = parseDate(s);
        if (!d) return;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      });
    });
    const rangeTxt = minDate && maxDate ? `${formatDate(minDate)} – ${formatDate(maxDate)}` : "";
    const title = `${edital}${rangeTxt ? `: ${rangeTxt}` : ""} | ${statusTxt}`;

    return { x: macroStartX, w: macroEndX - macroStartX, statusClass, title };
  }

  // Render rows (left and right share order)
  const rows = [];
  groups.forEach(([edital, list]) => {
    const collapsed = collapsedEditals.has(edital);
    const macro = computeMacro(edital, list);
    rows.push({ type: "group", edital, count: list.length, collapsed, macro });
    if (!collapsed) {
      list.forEach((o) => rows.push({ type: "obj", obj: o }));
    }
  });

  return (
    <div className="gantt-container">
      <div className="gantt-toolbar">
        {[
          { id: "meses", label: "Meses" },
          { id: "bimestre", label: "Bimestre" },
          { id: "semestre", label: "Semestre" },
          { id: "ano", label: "Ano" },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            className={`heatmap-chip${timeScale === s.id ? " active" : ""}`}
            onClick={() => setTimeScale(s.id)}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="gantt-toggle-all" onClick={toggleAll}>
          {allExpanded ? "↕ Colapsar todos" : "↕ Expandir todos"}
        </button>
      </div>

      <div className="gantt-body">
        <div
          className="gantt-labels"
          style={{ width: labelWidth }}
          ref={labelsRef}
          onScroll={onLabelsScroll}
        >
          <div className="gantt-labels-header">Objeto</div>
          {rows.map((r, i) => {
            if (r.type === "group") {
              return (
                <div
                  key={`g-${i}`}
                  className="gantt-group-row"
                  onClick={() => toggleEdital(r.edital)}
                  title={r.edital}
                >
                  {`${r.collapsed ? "▶" : "▼"}  ${r.edital}  (${r.count} obj)`}
                </div>
              );
            }
            return (
              <div key={`l-${r.obj.id}`} className="gantt-row" title={r.obj.objeto}>
                {r.obj.objeto}
              </div>
            );
          })}
        </div>

        <div
          className="gantt-resizer"
          style={{ left: labelWidth - 2 }}
          onMouseDown={onResizerDown}
        />

        <div
          className="gantt-timeline"
          ref={timelineRef}
          onScroll={onTimelineScroll}
        >
          <div className="gantt-timeline-header" style={{ width: totalWidth }}>
            {headerCells.map((c, i) => (
              <div
                key={i}
                className="gantt-timeline-header-cell"
                style={{ width: effectiveColW }}
              >
                {c.label}
              </div>
            ))}
          </div>

          <div
            className="gantt-timeline-grid"
            style={{ width: totalWidth, height: contentHeight }}
          >
            {headerCells.map((_, i) => (
              <div
                key={i}
                className="gantt-grid-col"
                style={{ left: i * effectiveColW }}
              />
            ))}
            <div className="gantt-today-line" style={{ left: todayX }} />
            <div className="gantt-today-label" style={{ left: todayX + 4 }}>HOJE</div>

            {(() => {
              let yCursor = 0;
              const els = [];
              rows.forEach((r, i) => {
                if (r.type === "group") {
                  els.push(
                    <div
                      key={`gt-${i}`}
                      className="gantt-group-row-timeline"
                      style={{ position: "absolute", top: yCursor, left: 0, width: totalWidth }}
                    >
                      {r.macro && (
                        <div
                          className={`gantt-macro-bar ${r.macro.statusClass}`}
                          style={{ left: r.macro.x, width: r.macro.w }}
                          title={r.macro.title}
                        />
                      )}
                    </div>
                  );
                  yCursor += 32;
                } else {
                  const bars = computeBars(r.obj);
                  els.push(
                    <div
                      key={`rt-${r.obj.id}`}
                      className="gantt-row-timeline"
                      style={{ position: "absolute", top: yCursor, left: 0, width: totalWidth }}
                    >
                      {bars.map((b) => (
                        <div
                          key={b.key}
                          className={`gantt-bar${b.dashed ? " gantt-bar-dashed" : ""}`}
                          style={{
                            left: b.x,
                            width: b.w,
                            background: b.bg,
                            opacity: b.opacity,
                          }}
                          title={b.title}
                        />
                      ))}
                    </div>
                  );
                  yCursor += 36;
                }
              });
              return els;
            })()}
          </div>
        </div>
      </div>

      <div className="gantt-legend">
        {PHASE_KEYS.map((p) => (
          <div key={p.key} className="gantt-legend-item">
            <span
              className="gantt-legend-swatch"
              style={{ background: p.color, opacity: p.opacity ?? 1 }}
            />
            {p.label}
          </div>
        ))}
        <div className="gantt-legend-item">
          <span className="gantt-legend-swatch" style={{ background: "#DC2626", opacity: 0.6 }} />
          Suspenso
        </div>
        <div className="gantt-legend-item">
          <span className="gantt-legend-swatch" style={{ border: "1.5px dashed var(--text-muted)" }} />
          Previsto
        </div>
      </div>
    </div>
  );
}
