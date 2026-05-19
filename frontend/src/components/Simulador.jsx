import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadProjects, saveProjects, resetProjects, subscribeToSaves } from "../storage.js";

// ============================================================
// SIMULADOR PNLD — v2 (UX redesenhado)
// ============================================================

const HISTORICAL_MEDIANS = {
  "Validação de Inscrição": { "Didático": 61, "Literário": 121, "RED": 91, "Pedagógico": 61 },
  "Avaliação Pedagógica":   { "Didático": 152, "Literário": 200, "RED": 182, "Pedagógico": 166 },
  "Análise de Atributos":   { "Didático": 90, "Literário": 90, "RED": 90, "Pedagógico": 90 },
  "Acessibilidade":         { "Didático": 88, "Literário": 95, "RED": 90, "Pedagógico": 90 },
  "Insumos de Qualificação":{ "Didático": 24, "Literário": 30, "RED": 30, "Pedagógico": 24 },
};

const PHASE_COLORS = {
  "Validação de Inscrição": "#2F7DFA",
  "Avaliação Pedagógica": "#B7AF18",
  "Análise de Atributos": "#E8A838",
  "Acessibilidade": "#06B6D4",
  "Insumos de Qualificação": "#8B5CF6",
};

const DEFAULT_PHASE_NAMES = [
  "Validação de Inscrição",
  "Avaliação Pedagógica",
  "Análise de Atributos",
  "Acessibilidade",
  "Insumos de Qualificação",
];

const TIPOS = ["Didático", "Literário", "RED", "Pedagógico"];
const ROOT_ID = "__ROOT__";

const phaseColor = (name) => PHASE_COLORS[name] || "var(--brand-strong)";

const fromISO = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const fmt = (d) => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtShort = (d) => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtMonth = (d) => d.toLocaleDateString("pt-BR", { month: "short" });
const fmtMonthYear = (d) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const addBusinessDays = (start, n) => { let d = new Date(start), added = 0; while (added < n) { d = addDays(d, 1); const dow = d.getDay(); if (dow !== 0 && dow !== 6) added++; } return d; };
const toCalendarDays = (q, u) => u === "dias_uteis" ? Math.round(q * 7 / 5) : u === "semanas" ? q * 7 : u === "meses" ? Math.round(q * 30.44) : q;
const computeEnd = (s, q, u) => u === "dias_uteis" ? addBusinessDays(s, q) : addDays(s, toCalendarDays(q, u) - 1);
const makeId = () => window.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

function computeSchedule(phases, baseISO) {
  const baseDate = fromISO(baseISO);
  const byId = Object.fromEntries(phases.map((p) => [p.id, p]));
  const W = 0, G = 1, B = 2;
  const color = Object.fromEntries(phases.map((p) => [p.id, W]));
  const order = [];
  let cycle = false;
  const dfs = (id) => {
    if (cycle) return;
    color[id] = G;
    const p = byId[id];
    const dep = p?.dependsOn;
    if (dep && dep !== ROOT_ID && byId[dep]) {
      if (color[dep] === G) { cycle = true; return; }
      if (color[dep] === W) dfs(dep);
    }
    color[id] = B;
    order.push(id);
  };
  phases.forEach((p) => { if (color[p.id] === W) dfs(p.id); });
  if (cycle) return { hasCycle: true, items: phases.map((p) => ({ ...p, start: baseDate, end: baseDate, durDiasCorridos: 0 })) };
  const computed = {};
  for (const id of order) {
    const p = byId[id];
    let start;
    if (!p.dependsOn || p.dependsOn === ROOT_ID || !computed[p.dependsOn]) start = baseDate;
    else {
      const parent = computed[p.dependsOn];
      if (p.linkType === "no_inicio") start = parent.start;
      else if (p.linkType === "apos_inicio") start = addDays(parent.start, p.lag || 0);
      else start = addDays(parent.end, 1 + (p.lag || 0));
    }
    const end = computeEnd(start, p.duracao, p.unidade);
    computed[id] = { start, end };
  }
  return {
    hasCycle: false,
    items: phases.map((p) => {
      const c = computed[p.id];
      return { ...p, start: c.start, end: c.end, durDiasCorridos: Math.floor((c.end - c.start) / 86400000) + 1 };
    }),
  };
}

const Icon = ({ children, size = 14 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} style={{ flexShrink: 0 }}>{children}</svg>
);
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const TrashIcon = () => <Icon><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Icon>;
const ResetIcon = () => <Icon><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>;
const ChevronDown = () => <Icon><path d="m6 9 6 6 6-6" /></Icon>;
const InfoIcon = () => <Icon size={13}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></Icon>;

export default function Simulador() {
  const [projects, setProjects] = useState(() => loadProjects());
  const [selectedId, setSelectedId] = useState(null);
  const [editorTab, setEditorTab] = useState("fases");
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => { saveProjects(projects); }, [projects]);
  useEffect(() => {
    const unsubscribe = subscribeToSaves((ts) => setSavedAt(ts));
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!selectedId && projects.length) setSelectedId(projects[0].id);
  }, [projects, selectedId]);

  const updateProject = (id, patch) => setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const project = projects.find((p) => p.id === selectedId);

  const handleReset = () => {
    if (!window.confirm("Apagar todos os cenários e voltar ao seed inicial? Esta ação não pode ser desfeita.")) return;
    const seed = resetProjects();
    setProjects(seed);
    setSelectedId(seed[0]?.id || null);
  };

  const schedule = useMemo(
    () => project ? computeSchedule(project.phases, project.dataPublicacao) : { hasCycle: false, items: [] },
    [project]
  );

  if (!project) {
    return (
      <div className="sim-empty-state">
        <p>Nenhum objeto disponível.</p>
        <button type="button" className="sim-btn-add" onClick={handleReset}>
          <ResetIcon /> Restaurar cenários iniciais
        </button>
      </div>
    );
  }

  const setPhases = (newPhases) => updateProject(project.id, { phases: newPhases });
  const updatePhase = (id, patch) => setPhases(project.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePhase = (id) => setPhases(project.phases.filter((p) => p.id !== id).map((p) => p.dependsOn === id ? { ...p, dependsOn: ROOT_ID } : p));
  const addPhase = (nome) => {
    if (!nome.trim()) return;
    const lastId = project.phases[project.phases.length - 1]?.id || ROOT_ID;
    setPhases([...project.phases, { id: makeId(), nome: nome.trim(), duracao: 30, unidade: "dias", dependsOn: lastId, linkType: "apos_fim", lag: 0 }]);
  };

  const projectStart = schedule.items[0]?.start;
  const projectEnd = schedule.items.length ? schedule.items.reduce((m, s) => (s.end > m ? s.end : m), schedule.items[0].end) : null;
  const totalDias = projectStart && projectEnd ? Math.floor((projectEnd - projectStart) / 86400000) + 1 : 0;

  return (
    <div className="sim-shell">
      <div className="sim-header-bar">
        <div className="sim-kpi-row">
          <KpiCompact label="Início" value={projectStart ? fmtShort(projectStart) : "—"} sub={projectStart ? fmt(projectStart) : ""} />
          <KpiCompact label="Fim previsto" value={projectEnd ? fmtShort(projectEnd) : "—"} sub={projectEnd ? fmt(projectEnd) : ""} />
          <KpiCompact label="Duração" value={`${totalDias}d`} sub={`≈ ${(totalDias / 30.44).toFixed(1)} meses`} highlight />
          <KpiCompact label="Fases" value={project.phases.length} sub="configuradas" />
        </div>

        <div className="sim-context-bar">
          <div className="sim-context-left">
            <span className="sim-context-label">Simulando:</span>
            <select className="sim-context-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.edital} — {p.objeto.length > 50 ? p.objeto.slice(0, 50) + "…" : p.objeto}</option>
              ))}
            </select>
            <span className="sim-tipo-badge">{project.tipo}</span>
          </div>
          <div className="sim-context-right">
            {savedAt && (
              <span className="sim-save-indicator">
                <span className="sim-save-dot" />
                salvo às {new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button type="button" className="sim-icon-btn" onClick={handleReset} title="Restaurar cenários iniciais">
              <ResetIcon /> <span>Resetar</span>
            </button>
          </div>
        </div>
      </div>

      {schedule.hasCycle && (
        <div className="sim-alert-bar">
          <strong>Ciclo de dependência detectado.</strong> Ajuste as dependências para evitar referências circulares.
        </div>
      )}

      <div className="sim-workspace">
        <aside className="sim-editor">
          <div className="sim-editor-tabs">
            <button type="button" className={editorTab === "parametros" ? "active" : ""} onClick={() => setEditorTab("parametros")}>Parâmetros</button>
            <button type="button" className={editorTab === "fases" ? "active" : ""} onClick={() => setEditorTab("fases")}>
              Fases <span className="sim-tab-count">{project.phases.length}</span>
            </button>
          </div>

          <div className="sim-editor-body">
            {editorTab === "parametros" ? (
              <ParametrosPanel project={project} onChange={(patch) => updateProject(project.id, patch)} />
            ) : (
              <FasesPanel project={project} schedule={schedule} onUpdatePhase={updatePhase} onRemovePhase={removePhase} onAddPhase={addPhase} />
            )}
          </div>
        </aside>

        <section className="sim-canvas">
          <div className="sim-canvas-card sim-canvas-gantt">
            <div className="sim-canvas-head">
              <div>
                <h2>Linha do tempo</h2>
                <p>Gantt do cronograma simulado · setas tracejadas indicam dependências</p>
              </div>
              <div className="sim-legend">
                {DEFAULT_PHASE_NAMES.slice(0, 5).map((name) => (
                  <span key={name} className="sim-legend-item">
                    <span className="sim-legend-dot" style={{ background: phaseColor(name) }} />
                    {name.split(" ")[0]}
                  </span>
                ))}
              </div>
            </div>
            <GanttView schedule={schedule} projectStart={projectStart} projectEnd={projectEnd} />
          </div>

          <div className="sim-canvas-card">
            <div className="sim-canvas-head">
              <h2>Detalhamento</h2>
              <p>Tabela das fases calculadas a partir da configuração à esquerda</p>
            </div>
            <DetailTable schedule={schedule} phases={project.phases} />
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCompact({ label, value, sub, highlight }) {
  return (
    <div className={`sim-kpi ${highlight ? "highlight" : ""}`}>
      <div className="sim-kpi-label">{label}</div>
      <div className="sim-kpi-value">{value}</div>
      {sub && <div className="sim-kpi-sub">{sub}</div>}
    </div>
  );
}

function ParametrosPanel({ project, onChange }) {
  return (
    <div className="sim-params">
      <div className="sim-field">
        <label>Nome do edital</label>
        <input type="text" value={project.edital} onChange={(e) => onChange({ edital: e.target.value })} />
      </div>
      <div className="sim-field">
        <label>Objeto</label>
        <textarea rows={2} value={project.objeto} onChange={(e) => onChange({ objeto: e.target.value })} />
      </div>
      <div className="sim-field-row">
        <div className="sim-field">
          <label>Tipo de objeto</label>
          <select value={project.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>
            {TIPOS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="sim-field">
          <label>Data base (publicação)</label>
          <input type="date" value={project.dataPublicacao} onChange={(e) => onChange({ dataPublicacao: e.target.value })} />
        </div>
      </div>
      <div className="sim-hint-box">
        <InfoIcon />
        <div>
          <strong>Sobre o tipo</strong>
          <p>Alterar o tipo de objeto não altera as durações já configuradas. Use o catálogo histórico de cada fase como referência (visível ao editar uma fase).</p>
        </div>
      </div>
    </div>
  );
}

function FasesPanel({ project, schedule, onUpdatePhase, onRemovePhase, onAddPhase }) {
  const [newPhaseName, setNewPhaseName] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="sim-fases">
      <p className="sim-fases-hint">
        Toque em uma fase para configurar dependências. As setas no Gantt à direita acompanham as alterações.
      </p>

      <div className="sim-fases-list">
        {schedule.items.map((p) => (
          <FaseCard
            key={p.id}
            phase={p}
            allPhases={project.phases}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            onUpdate={(patch) => onUpdatePhase(p.id, patch)}
            onRemove={() => onRemovePhase(p.id)}
            historicalMedian={HISTORICAL_MEDIANS[p.nome]?.[project.tipo]}
          />
        ))}
      </div>

      <div className="sim-add-fase">
        <input
          type="text"
          value={newPhaseName}
          onChange={(e) => setNewPhaseName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onAddPhase(newPhaseName); setNewPhaseName(""); } }}
          placeholder="Nome da nova fase (ex: Validação interna)"
        />
        <button type="button" className="sim-btn-add" onClick={() => { onAddPhase(newPhaseName); setNewPhaseName(""); }}>
          <PlusIcon /> Adicionar
        </button>
      </div>
    </div>
  );
}

function FaseCard({ phase, allPhases, expanded, onToggle, onUpdate, onRemove, historicalMedian }) {
  const color = phaseColor(phase.nome);
  const availableDeps = allPhases.filter((p) => p.id !== phase.id);
  const depName = phase.dependsOn === ROOT_ID ? "Início do edital" : allPhases.find((p) => p.id === phase.dependsOn)?.nome || "—";
  const linkLabel = { apos_fim: "após o fim", no_inicio: "no início de", apos_inicio: "após o início de" }[phase.linkType];

  return (
    <div className={`sim-fase-card ${expanded ? "expanded" : ""}`}>
      <button type="button" className="sim-fase-header" onClick={onToggle}>
        <span className="sim-fase-dot" style={{ background: color }} />
        <span className="sim-fase-name">{phase.nome}</span>
        <span className="sim-fase-summary">
          <strong>{phase.duracao}</strong>
          <span className="sim-fase-unit">{phase.unidade === "dias" ? "dias" : phase.unidade === "dias_uteis" ? "d.ú." : phase.unidade === "semanas" ? "sem" : "meses"}</span>
        </span>
        <span className={`sim-fase-chevron ${expanded ? "open" : ""}`}><ChevronDown /></span>
      </button>

      {!expanded && (
        <div className="sim-fase-depinfo">
          <span className="sim-fase-depinfo-arrow">↳</span>
          começa <strong>{linkLabel}</strong> {depName}
          {phase.lag !== 0 && <> <span className="sim-fase-lag">{phase.lag > 0 ? "+" : ""}{phase.lag}d</span></>}
        </div>
      )}

      {expanded && (
        <div className="sim-fase-editor">
          <div className="sim-edit-section">
            <label className="sim-edit-label">Duração</label>
            <div className="sim-duration-input">
              <input
                type="number"
                min="1"
                value={phase.duracao}
                onChange={(e) => onUpdate({ duracao: parseInt(e.target.value) || 1 })}
              />
              <select value={phase.unidade} onChange={(e) => onUpdate({ unidade: e.target.value })}>
                <option value="dias">dias corridos</option>
                <option value="dias_uteis">dias úteis</option>
                <option value="semanas">semanas</option>
                <option value="meses">meses</option>
              </select>
            </div>
            {historicalMedian && (
              <button
                type="button"
                className="sim-historical-hint"
                onClick={() => onUpdate({ duracao: historicalMedian, unidade: "dias" })}
                title="Aplicar mediana histórica"
              >
                Mediana histórica: <strong>{historicalMedian}d</strong> · clique para aplicar
              </button>
            )}
          </div>

          <div className="sim-edit-section">
            <label className="sim-edit-label">Dependência</label>
            <div className="sim-dep-builder">
              <div className="sim-dep-row">
                <span className="sim-dep-prefix">Começa</span>
                <select value={phase.linkType} onChange={(e) => onUpdate({ linkType: e.target.value })} className="sim-dep-link">
                  <option value="apos_fim">após o fim</option>
                  <option value="no_inicio">no início</option>
                  <option value="apos_inicio">após o início</option>
                </select>
                <span className="sim-dep-prefix">de</span>
                <select value={phase.dependsOn} onChange={(e) => onUpdate({ dependsOn: e.target.value })} className="sim-dep-target">
                  <option value={ROOT_ID}>Início do edital</option>
                  {availableDeps.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              {(phase.linkType === "apos_inicio" || phase.linkType === "apos_fim") && (
                <div className="sim-dep-lag-row">
                  <span className="sim-dep-prefix">com defasagem de</span>
                  <input type="number" value={phase.lag} onChange={(e) => onUpdate({ lag: parseInt(e.target.value) || 0 })} className="sim-dep-lag" />
                  <span className="sim-dep-prefix">dias</span>
                </div>
              )}
            </div>
          </div>

          <div className="sim-edit-actions">
            <button type="button" className="sim-btn-danger" onClick={onRemove}>
              <TrashIcon /> Remover fase
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GanttView({ schedule, projectStart, projectEnd }) {
  const ref = useRef(null);
  const [paths, setPaths] = useState([]);

  const totalMs = projectStart && projectEnd ? Math.max(projectEnd - projectStart, 1) : 1;
  const xPct = (d) => ((d - projectStart) / totalMs) * 100;
  const wPct = (s, e) => ((e - s) / totalMs) * 100;

  const months = [];
  if (projectStart && projectEnd) {
    let cur = new Date(projectStart.getFullYear(), projectStart.getMonth(), 1);
    while (cur <= projectEnd) {
      months.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }
  const showFullYear = months.length <= 10;

  useLayoutEffect(() => {
    if (!ref.current || schedule.hasCycle) { setPaths([]); return; }
    const cont = ref.current;
    const contRect = cont.getBoundingClientRect();
    const newPaths = [];
    schedule.items.forEach((p) => {
      if (!p.dependsOn || p.dependsOn === ROOT_ID) return;
      const parent = schedule.items.find((x) => x.id === p.dependsOn);
      if (!parent) return;
      const parentEl = cont.querySelector(`[data-bar-id="${parent.id}"]`);
      const childEl = cont.querySelector(`[data-bar-id="${p.id}"]`);
      if (!parentEl || !childEl) return;
      const pr = parentEl.getBoundingClientRect();
      const cr = childEl.getBoundingClientRect();
      let x1, y1, x2, y2;
      if (p.linkType === "apos_fim") { x1 = pr.right - contRect.left; y1 = pr.top + pr.height / 2 - contRect.top; }
      else { x1 = pr.left - contRect.left; y1 = pr.top + pr.height / 2 - contRect.top; }
      x2 = cr.left - contRect.left - 2;
      y2 = cr.top + cr.height / 2 - contRect.top;
      const dx = x2 - x1;
      const cornerX = x1 + Math.max(10, dx / 2);
      newPaths.push({ d: `M ${x1} ${y1} L ${cornerX} ${y1} L ${cornerX} ${y2} L ${x2} ${y2}`, key: p.id });
    });
    setPaths(newPaths);
  }, [schedule, projectStart, projectEnd]);

  if (schedule.hasCycle) return <p className="sim-gantt-empty">Não é possível renderizar — há ciclo de dependência.</p>;
  if (!schedule.items.length || !projectStart || !projectEnd) return <p className="sim-gantt-empty">Adicione fases para visualizar a linha do tempo.</p>;

  const today = new Date();
  const todayInRange = today >= projectStart && today <= projectEnd;

  return (
    <div className="sim-gantt-v2" ref={ref}>
      <div className="sim-gantt-axis-v2">
        {months.map((m, i) => (
          <div key={i} className="sim-gantt-tick" style={{ left: `${xPct(m)}%` }}>
            <span>{showFullYear ? fmtMonthYear(m) : fmtMonth(m)}</span>
          </div>
        ))}
        {todayInRange && (
          <div className="sim-gantt-today-label" style={{ left: `${xPct(today)}%` }}>hoje</div>
        )}
      </div>

      <div className="sim-gantt-body">
        {todayInRange && <div className="sim-gantt-today-line" style={{ left: `${xPct(today)}%` }} />}

        {schedule.items.map((p, i) => {
          const color = phaseColor(p.nome);
          const barLeft = xPct(p.start);
          const barWidth = Math.max(wPct(p.start, p.end), 0.5);
          return (
            <div key={p.id} className="sim-gantt-row-v2">
              <div className="sim-gantt-rowlabel">
                <span className="sim-gantt-rowidx">{String(i + 1).padStart(2, "0")}</span>
                <span className="sim-gantt-rowname" title={p.nome}>{p.nome}</span>
              </div>
              <div className="sim-gantt-rowtrack">
                <div
                  data-bar-id={p.id}
                  className="sim-gantt-bar-v2"
                  style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: color }}
                >
                  <span className="sim-gantt-bar-dur">{p.durDiasCorridos}d</span>
                  <div className="sim-gantt-tooltip">
                    <strong>{p.nome}</strong>
                    <div>{fmt(p.start)} — {fmt(p.end)}</div>
                    <div className="sim-gantt-tooltip-dur">{p.durDiasCorridos} dias corridos</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <svg className="sim-gantt-arrows-v2" aria-hidden="true">
          <defs>
            <marker id="sim-arrow-v2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#sim-arrow-v2)" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function DetailTable({ schedule, phases }) {
  return (
    <div className="sim-detail-table-wrap">
      <table className="sim-detail-table">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Dependência</th>
            <th>Início</th>
            <th>Fim</th>
            <th className="num">Duração</th>
          </tr>
        </thead>
        <tbody>
          {schedule.items.map((p) => {
            const dep = phases.find((x) => x.id === p.dependsOn);
            const depLabel = p.dependsOn === ROOT_ID ? "Início do edital" : (dep?.nome || "—");
            const linkLabel = { apos_fim: "após o fim", no_inicio: "no início", apos_inicio: "após o início" }[p.linkType];
            return (
              <tr key={p.id}>
                <td>
                  <div className="sim-detail-name">
                    <span className="sim-detail-dot" style={{ background: phaseColor(p.nome) }} />
                    <strong>{p.nome}</strong>
                  </div>
                </td>
                <td>
                  <div>{depLabel}</div>
                  <small>{linkLabel}{p.lag ? ` +${p.lag}d` : ""}</small>
                </td>
                <td>{fmtShort(p.start)}</td>
                <td>{fmtShort(p.end)}</td>
                <td className="num"><strong>{p.durDiasCorridos}</strong> dias</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
