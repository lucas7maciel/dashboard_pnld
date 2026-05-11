import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "./components/ui/chart.jsx";
import GanttChart from "./components/GanttChart.jsx";

const CHART_FONT_FAMILY = "Nunito, sans-serif";
const THEME_STORAGE_KEY = "pnld-dashboard-theme";
const FALLBACK_TEXT = "-";
const PUBLIC_BASE_URL = import.meta.env.BASE_URL;
const API_URL =
  "https://script.google.com/macros/s/AKfycbxwajnGtG-iPSmkr4u9LgKJvW4-FbjVbDefnuT8IdWjg4qJqkbCcMJC8PUT_1i9K-XL-Q/exec";

const PHASE_KEYS = [
  { key: "vi", consolidacaoKey: "validação de inscrição", label: "Validação de Inscrição", short: "VI", color: "#2F7DFA" },
  { key: "ap", consolidacaoKey: "avaliação pedagogica", label: "Avaliação Pedagógica", short: "AP", color: "#DAD21D" },
  { key: "at", consolidacaoKey: "analise de atributos", label: "Análise de Atributos", short: "Atrib", color: "#EFE777" },
  { key: "ac", consolidacaoKey: "acessibilidade", label: "Acessibilidade", short: "Acess", color: "#B7AF18", opacity: 0.6 },
  { key: "iq", consolidacaoKey: "insumos de qualificação", label: "Insumos de Qualificação", short: "Insumos", color: "#B7AF18" },
];

const STATUS_LABELS = {
  CONCLUIDO: "Concluído",
  EM_ANDAMENTO: "Em andamento",
  PENDENTE: "Pendente",
  SUSPENSO: "Suspenso",
  SEM_DADOS: "Sem dados",
};

// ---------- helpers ----------

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const formatNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FALLBACK_TEXT;
  return new Intl.NumberFormat("pt-BR").format(numeric);
};

const formatPercent = (value, digits = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FALLBACK_TEXT;
  return `${numeric.toFixed(digits)}%`;
};

const normalizeCellStatus = (raw) => {
  if (raw === null || raw === undefined) return "sem dados";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "sem dados";
  if (s === "ok") return "ok";
  if (s.includes("andamento")) return "em andamento";
  if (s.includes("suspens")) return "suspenso";
  if (s.includes("pendente")) return "pendente";
  return "sem dados";
};

const computeObjectStatus = (cellStatuses) => {
  // cellStatuses: array of normalized status strings
  const real = cellStatuses.filter((s) => s !== "sem dados");
  if (real.length === 0) return "SEM_DADOS";
  if (cellStatuses.includes("suspenso")) return "SUSPENSO";
  if (cellStatuses.includes("em andamento")) return "EM_ANDAMENTO";
  if (cellStatuses.includes("pendente")) return "PENDENTE";
  if (real.every((s) => s === "ok") && real.length === PHASE_KEYS.length) return "CONCLUIDO";
  // mixed ok with some sem dados → em andamento
  return "EM_ANDAMENTO";
};

const computeFaseAtual = (phases) => {
  // first non-ok / non-sem-dados; otherwise last completed; else first
  for (const p of phases) {
    if (p.status === "em andamento" || p.status === "suspenso" || p.status === "pendente") return p.label;
  }
  // all ok or sem dados
  const lastOk = [...phases].reverse().find((p) => p.status === "ok");
  if (lastOk) return lastOk.label;
  return PHASE_KEYS[0].label;
};

// ---------- transform ----------

const transformToSnapshot = (raw) => {
  const consolidacao = Array.isArray(raw?.consolidacao) ? raw.consolidacao : [];
  const ap2 = Array.isArray(raw?.avaliacao_pedagogica_2) ? raw.avaliacao_pedagogica_2 : [];
  const acess = Array.isArray(raw?.acessibilidade) ? raw.acessibilidade : [];
  const insumos = Array.isArray(raw?.insumos_qualificacao) ? raw.insumos_qualificacao : [];
  const atributos = Array.isArray(raw?.analise_atributos) ? raw.analise_atributos : [];

  const matchKey = (edital, objeto) => `${String(edital || "").trim()}|${String(objeto || "").trim()}`;
  const findIn = (arr, edital, objeto) =>
    arr.find((r) => matchKey(r.Edital, r.Objeto) === matchKey(edital, objeto)) || null;

  const objetos = consolidacao.map((row) => {
    const edital = row.Edital;
    const objeto = row.Objeto;
    const tipo = row.Tipo;
    const id = slugify(`${edital}-${objeto}`);

    const phases = PHASE_KEYS.map((p) => ({
      key: p.key,
      label: p.label,
      short: p.short,
      status: normalizeCellStatus(row[p.consolidacaoKey]),
    }));

    const statusKey = computeObjectStatus(phases.map((p) => p.status));
    const faseAtual = computeFaseAtual(phases);

    const ap2Row = findIn(ap2, edital, objeto);
    const acessRow = findIn(acess, edital, objeto);
    const insumosRow = findIn(insumos, edital, objeto);
    const atribRow = findIn(atributos, edital, objeto);

    const inscritas = Number(ap2Row?.["Coleções incritas"]) || null;
    const validadas = Number(ap2Row?.["Coleções validadas"]) || null;
    const aprovadas = Number(ap2Row?.["Coleções Aprovadas"]) || null;
    const reprovadas = Number(ap2Row?.["Coleções Reprovadas"]) || null;
    const avaliadores = Number(ap2Row?.["Quantidade de avaliadores envolvidos"]) || null;
    const taxa =
      Number.isFinite(aprovadas) && Number.isFinite(validadas) && validadas > 0
        ? aprovadas / validadas
        : null;

    return {
      id,
      edital,
      objeto,
      tipo,
      nome: `${edital} — ${objeto}`,
      status: statusKey,
      statusLabel: STATUS_LABELS[statusKey],
      faseAtual,
      phases,
      ap: {
        inscritas,
        validadas,
        aprovadas,
        reprovadas,
        avaliadores,
        inicio: ap2Row?.["Início"] || null,
        termino: ap2Row?.["Término"] || null,
        taxa,
      },
      acessibilidade: {
        inicio: acessRow?.["Data de início da fase"] || null,
        fim: acessRow?.["Data de fim da fase"] || null,
        previsaoInicio: acessRow?.["Previsão de Início"] || null,
        previsaoFim: acessRow?.["Previsão de Fim"] || null,
      },
      insumos: {
        inicio: insumosRow?.["Data de início da fase"] || null,
        fim: insumosRow?.["Data de fim da fase"] || null,
        previsaoInicio: insumosRow?.["Previsão de Início"] || null,
        previsaoFim: insumosRow?.["Previsão de Fim"] || null,
      },
      atributos: {
        inicio: atribRow?.["Data de início da fase"] || null,
        fim: atribRow?.["Data de fim da fase"] || null,
      },
    };
  });

  // resumo
  const counts = { CONCLUIDO: 0, EM_ANDAMENTO: 0, PENDENTE: 0, SUSPENSO: 0, SEM_DADOS: 0 };
  objetos.forEach((o) => {
    counts[o.status]++;
  });
  const total = objetos.length;
  const resumo = {
    total_objetos: total,
    concluidos: counts.CONCLUIDO,
    em_andamento: counts.EM_ANDAMENTO,
    pendentes: counts.PENDENTE,
    em_risco: counts.SUSPENSO,
    sem_dados: counts.SEM_DADOS,
    percentual_concluido: total > 0 ? (counts.CONCLUIDO / total) * 100 : 0,
  };

  // KPIs por fase (aggregate from AP2 — only AP has real data)
  const apTotals = objetos.reduce(
    (acc, o) => {
      acc.aprovadas += Number(o.ap.aprovadas) || 0;
      acc.validadas += Number(o.ap.validadas) || 0;
      acc.reprovadas += Number(o.ap.reprovadas) || 0;
      acc.invalidadas += Math.max(
        (Number(o.ap.inscritas) || 0) - (Number(o.ap.validadas) || 0),
        0,
      );
      return acc;
    },
    { aprovadas: 0, validadas: 0, reprovadas: 0, invalidadas: 0 },
  );

  const kpisPorFase = PHASE_KEYS.map((p) => {
    const okCount = objetos.filter((o) => o.phases.find((x) => x.key === p.key)?.status === "ok").length;
    return {
      fase: p.label,
      short: p.short,
      color: p.color,
      ok: okCount,
      total,
      taxa: total > 0 ? (okCount / total) * 100 : 0,
    };
  });

  // Alertas
  const alertas = [];
  objetos.forEach((o) => {
    if (o.phases.some((p) => p.status === "suspenso")) {
      alertas.push({
        id: `${o.id}-susp`,
        tipo: "critico",
        titulo: o.objeto,
        descricao: `${o.edital} — fase suspensa`,
      });
    }
  });
  objetos.forEach((o) => {
    if (o.phases.some((p) => p.status === "pendente")) {
      alertas.push({
        id: `${o.id}-pend`,
        tipo: "andamento",
        titulo: o.objeto,
        descricao: `${o.edital} — fase pendente`,
      });
    }
  });
  objetos.forEach((o) => {
    const ap = o.phases.find((p) => p.key === "ap");
    if (ap?.status === "em andamento") {
      alertas.push({
        id: `${o.id}-ap`,
        tipo: "info",
        titulo: o.objeto,
        descricao: `${o.edital} — Avaliação Pedagógica em andamento`,
      });
    }
  });

  return {
    metadata: raw?.metadata || {},
    resumo_executivo: resumo,
    objetos,
    kpis_por_fase: kpisPorFase,
    ap_totais: apTotals,
    alertas,
  };
};

// ---------- icons (kept) ----------

const Icon = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="nav-icon"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const PanoramaIcon = () => (
  <Icon>
    <path d="M3 12 12 4l9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
const ObjetosIcon = () => (
  <Icon>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <rect x="14" y="4" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);
const CronogramaIcon = () => (
  <Icon>
    <path d="M7 2v4" />
    <path d="M17 2v4" />
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
  </Icon>
);
const IndicadoresIcon = () => (
  <Icon>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20v-11" />
  </Icon>
);
const ExploracaoIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

const CollapseIcon = ({ collapsed }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="toggle-icon" aria-hidden="true">
    <path d="M4 5h16v14H4z" />
    <path d="M9 5v14" />
    {collapsed ? <path d="m14 12 3-3v6l-3-3Z" /> : <path d="m10 12 4-3v6l-4-3Z" />}
  </svg>
);

const MenuIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="toggle-icon" aria-hidden="true">
    {open ? (<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>) : (<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>)}
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="theme-icon" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5" /><path d="M12 19v2.5" /><path d="m4.9 4.9 1.8 1.8" /><path d="m17.3 17.3 1.8 1.8" /><path d="M2.5 12H5" /><path d="M19 12h2.5" /><path d="m4.9 19.1 1.8-1.8" /><path d="m17.3 6.7 1.8-1.8" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="theme-icon" aria-hidden="true">
    <path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6.2 6.2 0 0 0 20 14.5Z" />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="info-icon" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6" />
    <path d="M12 7h.01" />
  </svg>
);

// ---------- UI primitives ----------

const STATUS_TONE_CLASS = {
  CONCLUIDO: "ok",
  EM_ANDAMENTO: "andamento",
  PENDENTE: "pendente",
  SUSPENSO: "critico",
  SEM_DADOS: "muted",
};

const StatusBadge = ({ statusKey, label }) => {
  const tone = STATUS_TONE_CLASS[statusKey] || "muted";
  return <span className={`badge badge-${tone}`}>{label || STATUS_LABELS[statusKey] || "—"}</span>;
};

const InfoTooltip = ({ text }) => (
  <span className="info-tooltip">
    <button type="button" className="info-tooltip-trigger" aria-label={text} title={text}>
      <InfoIcon />
    </button>
    <span className="info-tooltip-content" role="tooltip">{text}</span>
  </span>
);

// ---------- Heatmap ----------

const HEATMAP_CELL_CLASS = {
  ok: "heatcell heatcell-ok",
  "em andamento": "heatcell heatcell-info",
  pendente: "heatcell heatcell-warning",
  suspenso: "heatcell heatcell-danger",
  "sem dados": "heatcell heatcell-muted",
};

const HEATMAP_CELL_LABEL = {
  ok: "OK",
  "em andamento": "Em andamento",
  pendente: "Pendente",
  suspenso: "Suspenso",
  "sem dados": "Sem dados",
};

const HeatmapTable = ({ objetos }) => (
  <div className="heatmap-shell">
    <table className="heatmap">
      <thead>
        <tr>
          <th className="heatmap-th-objeto">Objeto</th>
          {PHASE_KEYS.map((p) => (
            <th key={p.key} title={p.label}>{p.short}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {objetos.map((o) => {
          const hasNonOk = o.phases.some((p) => p.status !== "ok" && p.status !== "sem dados");
          return (
            <tr key={o.id}>
              <td className={`heatmap-name${hasNonOk ? " heatmap-name-active" : ""}`}>
                <strong>{o.objeto}</strong>
                <span className="heatmap-edital">{o.edital}</span>
              </td>
              {o.phases.map((p) => (
                <td key={p.key} className="heatmap-cell-td">
                  <span className={HEATMAP_CELL_CLASS[p.status]} title={`${p.label}: ${HEATMAP_CELL_LABEL[p.status]}`}>
                    {HEATMAP_CELL_LABEL[p.status]}
                  </span>
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ---------- Gantt removed (now in components/GanttChart.jsx) ----------
// ---------- App ----------

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("panorama");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    let cancelled = false;
    fetch(API_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Erro ao buscar dados da API");
        return r.json();
      })
      .then((raw) => {
        if (!cancelled) setSnapshot(transformToSnapshot(raw));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Erro ao carregar dados");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#", "").trim().toLowerCase();
      const allowed = ["panorama", "objetos", "cronograma", "indicadores", "exploracao"];
      setActiveTab(allowed.includes(hash) ? hash : "panorama");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => { if (!e.matches) setIsMobileMenuOpen(false); };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const navItems = useMemo(
    () => [
      { id: "panorama", label: "Panorama", icon: <PanoramaIcon /> },
      { id: "objetos", label: "Objetos", icon: <ObjetosIcon /> },
      { id: "cronograma", label: "Cronograma", icon: <CronogramaIcon /> },
      { id: "indicadores", label: "Indicadores", icon: <IndicadoresIcon /> },
      { id: "exploracao", label: "Exploração", icon: <ExploracaoIcon /> },
    ],
    [],
  );

  // Heatmap filter
  const [heatmapFilter, setHeatmapFilter] = useState("andamento");

  // Cronograma collapse state
  const [collapsedEditals, setCollapsedEditals] = useState(new Set());
  const toggleEdital = (id) => {
    setCollapsedEditals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Exploração filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEdital, setFilterEdital] = useState("");

  // Objetos filters
  const [objetosStatusFilter, setObjetosStatusFilter] = useState('todos');
  const [objetosTipoFilter, setObjetosTipoFilter] = useState('');
  const [objetosFaseFilter, setObjetosFaseFilter] = useState('');

  const objetos = snapshot?.objetos ?? [];

  const objetosOrdered = useMemo(() => {
    const order = { SUSPENSO: 0, PENDENTE: 1, EM_ANDAMENTO: 2, CONCLUIDO: 3, SEM_DADOS: 4 };
    return [...objetos].sort((a, b) => order[a.status] - order[b.status]);
  }, [objetos]);

  const objetosTipos = useMemo(
    () => Array.from(new Set(objetos.map((o) => o.tipo).filter(Boolean))),
    [objetos],
  );

  const objetosFiltered = useMemo(() => {
    const statusMap = {
      andamento: 'EM_ANDAMENTO',
      concluidos: 'CONCLUIDO',
      pendentes: 'PENDENTE',
      suspensos: 'SUSPENSO',
    };
    return objetosOrdered.filter((o) => {
      if (objetosStatusFilter !== 'todos' && o.status !== statusMap[objetosStatusFilter]) return false;
      if (objetosTipoFilter && o.tipo !== objetosTipoFilter) return false;
      if (objetosFaseFilter && o.faseAtual !== objetosFaseFilter) return false;
      return true;
    });
  }, [objetosOrdered, objetosStatusFilter, objetosTipoFilter, objetosFaseFilter]);

  const editais = useMemo(() => Array.from(new Set(objetos.map((o) => o.edital))), [objetos]);

  const heatmapObjetos = useMemo(() => {
    if (heatmapFilter === "todos") return objetos;
    return objetos.filter((o) => {
      const allOk = o.phases.length === PHASE_KEYS.length && o.phases.every((p) => p.status === "ok");
      return heatmapFilter === "concluidos" ? allOk : !allOk;
    });
  }, [objetos, heatmapFilter]);

  const filteredExploracao = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return objetos.filter((o) => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterEdital && o.edital !== filterEdital) return false;
      if (!term) return true;
      return (
        o.edital.toLowerCase().includes(term) ||
        o.objeto.toLowerCase().includes(term) ||
        (o.tipo || "").toLowerCase().includes(term)
      );
    });
  }, [objetos, searchTerm, filterStatus, filterEdital]);

  const riskRanking = useMemo(
    () =>
      objetos
        .filter((o) => o.status !== "SEM_DADOS" && Number.isFinite(o.ap.taxa))
        .sort((a, b) => a.ap.taxa - b.ap.taxa),
    [objetos],
  );

  const logoTextSrc = theme === "light"
    ? `${PUBLIC_BASE_URL}logo_text.svg`
    : `${PUBLIC_BASE_URL}logo_text_dark.svg`;

  if (error) {
    return (
      <div className="page error">
        <div><h1>{error}</h1></div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="page loading">
        <div className="loader" aria-label="Carregando" />
      </div>
    );
  }

  const resumo = snapshot.resumo_executivo;
  const alertas = snapshot.alertas;
  const kpisPorFase = snapshot.kpis_por_fase;
  const apTotais = snapshot.ap_totais;

  const exportCSV = () => {
    const headers = ["Edital", "Objeto", "Tipo", "VI", "AP", "Atrib", "Acess", "IQ", "Aprov.AP %", "Avaliadores"];
    const rows = filteredExploracao.map((o) => [
      o.edital, o.objeto, o.tipo,
      ...PHASE_KEYS.map((p) => HEATMAP_CELL_LABEL[o.phases.find((x) => x.key === p.key).status]),
      o.ap.taxa != null ? (o.ap.taxa * 100).toFixed(1) : "",
      o.ap.avaliadores ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pnld-objetos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiBarData = kpisPorFase.map((k) => ({ fase: k.short, ok: k.ok, fill: k.color }));

  return (
    <div className={`app${isSidebarCollapsed ? " sidebar-collapsed" : ""}${isMobileMenuOpen ? " mobile-menu-open" : ""}`}>
      <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setIsMobileMenuOpen(false)} />
      <aside className={`sidebar${isSidebarCollapsed ? " collapsed" : ""}${isMobileMenuOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <img src={`${PUBLIC_BASE_URL}logo_icon.svg`} alt="PNLD" className="brand-logo brand-logo-icon" />
            <img src={logoTextSrc} alt="PNLD" className="brand-logo brand-logo-text" />
          </div>
        </div>

        <nav id="sidebar-navigation" className="nav" aria-label="Seções">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "active" : ""}
              onClick={() => {
                setActiveTab(item.id);
                window.location.hash = item.id;
                setIsMobileMenuOpen(false);
              }}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <img src={`${PUBLIC_BASE_URL}PNLD_TRINCA_preview.png`} alt="PNLD Trinca" className="sidebar-footer-mark" />
          <p>Portfólio de Projetos do PNLD - NEES/UFAL | 2026</p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            <button type="button" className="sidebar-toggle mobile-nav-toggle" onClick={() => setIsMobileMenuOpen((c) => !c)} aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={isMobileMenuOpen} aria-controls="sidebar-navigation">
              <MenuIcon open={isMobileMenuOpen} />
            </button>
            <button type="button" className="sidebar-toggle topbar-toggle" onClick={() => setIsSidebarCollapsed((c) => !c)} aria-label={isSidebarCollapsed ? "Maximizar sidebar" : "Minimizar sidebar"}>
              <CollapseIcon collapsed={isSidebarCollapsed} />
            </button>
            <h1>Dashboard</h1>
          </div>

          <button type="button" className="theme-toggle" onClick={() => setTheme((c) => (c === "light" ? "dark" : "light"))} aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"} title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}>
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </header>

        {activeTab === "panorama" && (
          <>
            <section className="panorama-metrics">
              <article className="card metric">
                <div className="metric-header"><h3>Total Objetos</h3><InfoTooltip text="Total de objetos da consolidação." /></div>
                <h2>{formatNumber(resumo.total_objetos)}</h2>
              </article>
              <article className="card metric">
                <div className="metric-header"><h3>Concluídos</h3><InfoTooltip text="Objetos com todas as fases finalizadas." /></div>
                <h2>{formatNumber(resumo.concluidos)}</h2>
                <p className="metric-sub">{formatPercent(resumo.percentual_concluido)} do total</p>
              </article>
              <article className="card metric">
                <div className="metric-header"><h3>Em andamento</h3><InfoTooltip text="Objetos com pelo menos uma fase em execução." /></div>
                <h2>{formatNumber(resumo.em_andamento)}</h2>
              </article>
              <article className="card metric">
                <div className="metric-header"><h3>Pendentes</h3><InfoTooltip text="Objetos com fases pendentes." /></div>
                <h2>{formatNumber(resumo.pendentes)}</h2>
              </article>
              <article className="card metric">
                <div className="metric-header"><h3>Em risco</h3><InfoTooltip text="Objetos com pelo menos uma fase suspensa." /></div>
                <h2>{formatNumber(resumo.em_risco)}</h2>
              </article>
            </section>

            <section className="panorama-main-grid">
              <article className="card heatmap-card">
                <div className="card-head">
                  <h3>Mapa objeto × fase</h3>
                  <InfoTooltip text="Status de cada uma das 5 fases para os 17 objetos." />
                </div>
                <div className="heatmap-filters">
                  {[
                    { id: "todos", label: "Todos" },
                    { id: "andamento", label: "Em andamento" },
                    { id: "concluidos", label: "Concluídos" },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`heatmap-chip${heatmapFilter === chip.id ? " active" : ""}`}
                      onClick={() => setHeatmapFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <HeatmapTable objetos={heatmapObjetos} />
              </article>

              <article className="card alerts-card">
                <div className="card-head">
                  <h3>Alertas ativos</h3>
                  <InfoTooltip text="Alertas gerados a partir das fases suspensas, pendentes e em andamento." />
                </div>
                <ul className="alerts-list">
                  {alertas.length === 0 && <li className="alert-empty">Nenhum alerta no momento.</li>}
                  {alertas.map((a) => (
                    <li key={a.id} className={`alert-item alert-${a.tipo}`}>
                      <span className="alert-dot" />
                      <div>
                        <strong>{a.titulo}</strong>
                        <span>{a.descricao}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          </>
        )}

        {activeTab === "objetos" && (
          <section className="objetos-main-grid">
            <article className="card status-card">
              <div className="card-head">
                <h3>Status geral</h3>
                <InfoTooltip text="Distribuição dos objetos por status." />
              </div>
              <div className="status-counters">
                <div className="status-counter status-counter-ok">
                  <span>Concluídos</span>
                  <strong>{resumo.concluidos}</strong>
                </div>
                <div className="status-counter status-counter-info">
                  <span>Em andamento</span>
                  <strong>{resumo.em_andamento}</strong>
                </div>
                <div className="status-counter status-counter-warning">
                  <span>Pendentes</span>
                  <strong>{resumo.pendentes}</strong>
                </div>
                <div className="status-counter status-counter-danger">
                  <span>Suspensos</span>
                  <strong>{resumo.em_risco}</strong>
                </div>
              </div>
            </article>

            <article className="card">
              <div className="card-head">
                <h3>Objetos</h3>
                <InfoTooltip text="Aprovação AP = Coleções aprovadas ÷ validadas × 100." />
              </div>
              <div className="objetos-filters">
                <div className="objetos-chips">
                  {[
                    { id: "todos", label: "Todos", tone: "" },
                    { id: "andamento", label: "Em andamento", tone: "chip-info" },
                    { id: "concluidos", label: "Concluídos", tone: "chip-brand" },
                    { id: "pendentes", label: "Pendentes", tone: "chip-warning" },
                    { id: "suspensos", label: "Suspensos", tone: "chip-danger" },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`heatmap-chip ${chip.tone}${objetosStatusFilter === chip.id ? " active" : ""}`}
                      onClick={() => setObjetosStatusFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <span className="objetos-filters-divider" />
                <select
                  className="objetos-select"
                  value={objetosTipoFilter}
                  onChange={(e) => setObjetosTipoFilter(e.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  {objetosTipos.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  className="objetos-select"
                  value={objetosFaseFilter}
                  onChange={(e) => setObjetosFaseFilter(e.target.value)}
                >
                  <option value="">Todas as fases</option>
                  {PHASE_KEYS.map((p) => (
                    <option key={p.key} value={p.label}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="object-table-shell">
                <table className="object-table">
                  <thead>
                    <tr>
                      <th>Edital</th>
                      <th>Objeto</th>
                      <th>Tipo</th>
                      <th className="col-status">Status</th>
                      <th>Fase atual</th>
                      <th>Aprov. AP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objetosFiltered.map((o) => (
                      <tr key={o.id}>
                        <td className="object-edital-cell">{o.edital}</td>
                        <td className="object-name-cell"><strong>{o.objeto}</strong></td>
                        <td>{o.tipo}</td>
                        <td className="col-status"><StatusBadge statusKey={o.status} /></td>
                        <td className="object-phase-cell">{o.faseAtual}</td>
                        <td className="object-approval-cell">
                          {o.ap.taxa != null ? formatPercent(o.ap.taxa * 100) : FALLBACK_TEXT}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeTab === "cronograma" && (
          <section className="grid full">
            <article className="card full">
              <div className="card-head">
                <h3>Cronograma — Gantt</h3>
                <InfoTooltip text="Datas reais de AP, Acessibilidade e Insumos. Linha tracejada = previsto. Linha vermelha = HOJE." />
              </div>
              <GanttChart objetos={objetos} collapsedEditals={collapsedEditals} toggleEdital={toggleEdital} setCollapsedEditals={setCollapsedEditals} />
            </article>
          </section>
        )}

        {activeTab === "indicadores" && (
          <section className="indicadores-main-grid">
            <div className="indicadores-right">
              <article className="card">
                <div className="card-head">
                  <h3>Coleções (Avaliação Pedagógica)</h3>
                  <InfoTooltip text="Total agregado de aprovadas, invalidadas (inscritas-validadas) e reprovadas." />
                </div>
                <div className="stacked-bars">
                  {[
                    { label: "Aprovadas", value: apTotais.aprovadas, color: "var(--brand-strong)" },
                    { label: "Invalidadas", value: apTotais.invalidadas, color: "var(--warning)" },
                    { label: "Reprovadas", value: apTotais.reprovadas, color: "#dc2626" },
                  ].map((row) => {
                    const max = Math.max(apTotais.aprovadas, apTotais.invalidadas, apTotais.reprovadas, 1);
                    const w = (row.value / max) * 100;
                    return (
                      <div key={row.label} className="stacked-bar-row">
                        <span className="stacked-bar-label">{row.label}</span>
                        <div className="stacked-bar-track">
                          <div className="stacked-bar-fill" style={{ width: `${w}%`, background: row.color }} />
                        </div>
                        <span className="stacked-bar-value">{formatNumber(row.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <h3>Fases concluídas (por fase)</h3>
                  <InfoTooltip text='Quantidade de objetos com a fase marcada como "ok".' />
                </div>
                <ChartContainer className="plot plot-fade-in" config={{ ok: { label: "Concluídas" } }}>
                  <BarChart data={kpiBarData} margin={{ top: 12, right: 12, bottom: 16, left: 12 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="fase" tickLine={false} axisLine={false} tick={{ fill: "var(--text)", fontFamily: CHART_FONT_FAMILY, fontSize: 12 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--text)", fontFamily: CHART_FONT_FAMILY, fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => formatNumber(v)} />} />
                    <Bar dataKey="ok" radius={[8, 8, 0, 0]}>
                      {kpiBarData.map((e) => (<Cell key={e.fase} fill={e.fill} />))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </article>
            </div>

            <article className="card">
              <div className="card-head">
                <h3>Ranking de risco</h3>
                <InfoTooltip text="Apenas objetos com dados de Avaliação Pedagógica. Taxa = aprovadas ÷ validadas." />
              </div>
              <div className="risk-table">
                <div className="risk-header">
                  <span className="risk-col-rank">#</span>
                  <span className="risk-col-name">Objeto</span>
                  <span className="risk-col-edital">Edital</span>
                  <span className="risk-col-status">Status</span>
                  <span className="risk-col-rate">Aprovação AP</span>
                </div>
                <div className="risk-rows risk-list-scroll">
                  {riskRanking.map((o, idx) => {
                    const pct = o.ap.taxa * 100;
                    const rateCls = pct < 50 ? "low" : pct < 70 ? "mid" : "high";
                    const fillBg = pct < 50 ? "#DC2626" : pct < 70 ? "#D97706" : "var(--brand-strong)";
                    return (
                      <div key={o.id} className={`risk-row ${idx % 2 === 1 ? "even" : ""} ${idx < 3 ? "top" : ""}`}>
                        <span className="risk-col-rank">
                          <span className="risk-rank-num">{idx + 1}</span>
                        </span>
                        <span className="risk-col-name" title={o.objeto}>
                          {o.objeto}
                          <small>{formatNumber(o.ap.validadas)} val. → {formatNumber(o.ap.aprovadas)} apr.</small>
                        </span>
                        <span className="risk-col-edital" title={o.edital}>{o.edital}</span>
                        <span className="risk-col-status">
                          <StatusBadge statusKey={o.status} />
                        </span>
                        <span className="risk-col-rate">
                          <div className="risk-bar-wrapper">
                            <div className="risk-bar-track">
                              <div className="risk-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: fillBg }} />
                            </div>
                            <span className={`risk-rate-text ${rateCls}`}>{formatPercent(pct)}</span>
                          </div>
                        </span>
                      </div>
                    );
                  })}
                  {riskRanking.length === 0 && <p className="muted">Sem dados de avaliação pedagógica.</p>}
                </div>
              </div>
            </article>
          </section>
        )}

        {activeTab === "exploracao" && (
          <section className="grid full">
            <article className="card full">
              <div className="card-head">
                <h3>Exploração</h3>
                <InfoTooltip text="Pesquise, filtre e exporte objetos." />
              </div>
              <div className="exploracao-toolbar">
                <input
                  type="text"
                  className="exploracao-input"
                  placeholder="Buscar por edital, objeto, tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select className="exploracao-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">Todos os status</option>
                  <option value="CONCLUIDO">Concluído</option>
                  <option value="EM_ANDAMENTO">Em andamento</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="SUSPENSO">Suspenso</option>
                  <option value="SEM_DADOS">Sem dados</option>
                </select>
                <select className="exploracao-select" value={filterEdital} onChange={(e) => setFilterEdital(e.target.value)}>
                  <option value="">Todos os editais</option>
                  {editais.map((ed) => (<option key={ed} value={ed}>{ed}</option>))}
                </select>
                <button type="button" className="exploracao-export" onClick={exportCSV}>Exportar CSV</button>
              </div>

              <div className="object-table-shell">
                <table className="object-table exploracao-table">
                  <thead>
                    <tr>
                      <th>Edital</th>
                      <th>Objeto</th>
                      <th>Tipo</th>
                      {PHASE_KEYS.map((p) => (<th key={p.key}>{p.short}</th>))}
                      <th>Aprov. AP</th>
                      <th>Avaliadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExploracao.map((o) => {
                      const danger = o.status === "SUSPENSO" || o.status === "PENDENTE";
                      return (
                        <tr key={o.id} className={danger ? "row-attention" : ""}>
                          <td>{o.edital}</td>
                          <td className="object-name-cell"><strong>{o.objeto}</strong></td>
                          <td>{o.tipo}</td>
                          {o.phases.map((p) => (
                            <td key={p.key}>
                              <span className={HEATMAP_CELL_CLASS[p.status]}>{HEATMAP_CELL_LABEL[p.status]}</span>
                            </td>
                          ))}
                          <td className="object-approval-cell">
                            {o.ap.taxa != null ? formatPercent(o.ap.taxa * 100) : FALLBACK_TEXT}
                          </td>
                          <td>{o.ap.avaliadores != null ? formatNumber(o.ap.avaliadores) : FALLBACK_TEXT}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
