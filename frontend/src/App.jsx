import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./components/ui/chart.jsx";

const CHART_FONT_FAMILY = "Nunito, sans-serif";
const THEME_STORAGE_KEY = "pnld-dashboard-theme";
const FALLBACK_TEXT = "-";
const PUBLIC_BASE_URL = import.meta.env.BASE_URL;
const FALLBACK_CRONOGRAMA = {
  status_contagem: {
    FINALIZADO: 9,
    "EM ANDAMENTO": 7,
    SUSPENSO: 3,
    "SEM DADOS": 4,
  },
  atividades_suspensas: [
    {
      Objeto: "PNLD EJA 2026-2029 - Objeto 01: Obras Didáticas destinadas à Educação de Jovens e Adultos (EJA)",
      Atividade: "Validação documental complementar",
      Status: "Suspenso",
    },
    {
      Objeto: "PNLD 2024-2027 - ANOS FINAIS - Objeto: 03 - Obras Literárias destinadas aos Anos Finais",
      Atividade: "Revisão de parecer pedagógico",
      Status: "Suspenso",
    },
    {
      Objeto: "PNLD Educação Infantil 2026-2029 - Objeto 02",
      Atividade: "Conferência de acessibilidade editorial",
      Status: "Suspenso",
    },
  ],
};
const PHASES_ORDER = [
  "VALIDAÇÃO DE INSCRIÇÃO",
  "AVALIAÇÃO PEDAGÓGICA",
  "ANÁLISE DE ATRIBUTOS",
  "ACESSIBILIDADE",
  "INSUMOS DE QUALIFICAÇÃO",
];

const STATUS_TONE = {
  "CONCLUÍDO": "ok",
  "EM ANDAMENTO": "andamento",
  "SEM DADOS": "critico",
  FINALIZADO: "ok",
  SUSPENSO: "critico",
};

const decodePossibleMojibake = (value) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!/[ÃÂâï]/.test(text)) return text;

  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8").decode(bytes).trim();
    if (decoded && !decoded.includes("�")) return decoded;
  } catch {
    return text;
  }

  return text;
};

const sanitizeSnapshot = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeSnapshot);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, innerValue]) => [key, sanitizeSnapshot(innerValue)]),
    );
  }

  return decodePossibleMojibake(value);
};

const formatDisplayText = (value, fallback = FALLBACK_TEXT) => {
  if (value === null || value === undefined || value === "") return fallback;
  const text = decodePossibleMojibake(String(value).trim());
  const lettersOnly = text.replace(/[^A-Za-zÀ-ÿ]+/g, "");

  if (!lettersOnly) return text;
  if (lettersOnly !== lettersOnly.toUpperCase()) return text;

  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

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

const getPhaseIndex = (phase) => {
  const normalized = decodePossibleMojibake(String(phase || "")).toUpperCase();
  const index = PHASES_ORDER.indexOf(normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const getStatusTone = (label) => {
  const normalized = decodePossibleMojibake(String(label || "")).toUpperCase();
  return STATUS_TONE[normalized] || "andamento";
};

const getChartTheme = (theme) =>
  theme === "light"
    ? {
        text: "#202124",
        grid: "rgba(32, 33, 36, 0.16)",
        hoverBg: "#FFFFFF",
        hoverBorder: "rgba(218, 210, 29, 0.35)",
        line: "#B7AF18",
        lineMarkerStroke: "#F7FAF8",
        status: ["#2F7DFA", "#DAD21D", "#D97706"],
        pie: ["#B7AF18", "#EFE777", "#D97706", "#2F7DFA"],
        bar: "#2F7DFA",
      }
    : {
        text: "#F8F8FF",
        grid: "rgba(255, 255, 255, 0.14)",
        hoverBg: "#12081E",
        hoverBorder: "rgba(218, 210, 29, 0.4)",
        line: "#27A7F7",
        lineMarkerStroke: "#0F0718",
        status: ["#2F7DFA", "#DAD21D", "#D97706"],
        pie: ["#2F7DFA", "#DAD21D", "#D97706", "#EFE777"],
        bar: "#2F7DFA",
      };

const formatPhaseAxisLabel = (phase) => {
  const labels = {
    "VALIDAÇÃO DE INSCRIÇÃO": "Validação de\nInscrição",
    "AVALIAÇÃO PEDAGÓGICA": "Avaliação\nPedagógica",
    "ANÁLISE DE ATRIBUTOS": "Análise de\nAtributos",
    ACESSIBILIDADE: "Acessibilidade",
    "INSUMOS DE QUALIFICAÇÃO": "Insumos de\nQualificação",
  };

  const normalized = decodePossibleMojibake(String(phase || "")).toUpperCase();
  return labels[normalized] || formatDisplayText(normalized);
};

const fetchSnapshot = async () => {
  const response = await fetch(`${PUBLIC_BASE_URL}snapshot.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Snapshot não encontrado");
  }

  const json = await response.json();
  return sanitizeSnapshot(json);
};

const getStatusCounts = (items = []) => {
  const counts = {};
  items.forEach((item) => {
    const status = decodePossibleMojibake(item.status_objeto || "SEM DADOS").toUpperCase();
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
};

const getPhaseKpis = (phases = []) =>
  phases.map((phase) => ({
    fase: decodePossibleMojibake(phase.fase || ""),
    entrada: Number(phase.colecoes_entrada) || 0,
    aprovadas: Number(phase.colecoes_aprovadas) || 0,
    invalidadas: Number(phase.colecoes_invalidadas_desclassificadas) || 0,
    taxaAprovacao: Number(phase.taxa_aprovacao),
  }));

const getRiskRanking = (objects = []) =>
  [...objects]
    .map((item) => ({
      ...item,
      taxaAprovacao: Number(item?.kpis?.taxa_aprovacao),
    }))
    .sort((left, right) => {
      const leftRate = Number.isFinite(left.taxaAprovacao) ? left.taxaAprovacao : Infinity;
      const rightRate = Number.isFinite(right.taxaAprovacao) ? right.taxaAprovacao : Infinity;
      return leftRate - rightRate;
    });

const getHighlights = (objects = []) =>
  [...objects].sort((left, right) => {
    const leftIndex = getPhaseIndex(left.fase_atual);
    const rightIndex = getPhaseIndex(right.fase_atual);

    if (leftIndex !== rightIndex) return rightIndex - leftIndex;

    const leftApproval = Number(left?.kpis?.colecoes_aprovadas) || 0;
    const rightApproval = Number(right?.kpis?.colecoes_aprovadas) || 0;
    return rightApproval - leftApproval;
  });

const extractApprovedCount = (text) => {
  const match = decodePossibleMojibake(String(text || "")).match(/(\d+)\s+coleç(?:ões|ao|ões)/i);
  return match ? Number(match[1]) : null;
};

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
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="toggle-icon"
    aria-hidden="true"
  >
    <path d="M4 5h16v14H4z" />
    <path d="M9 5v14" />
    {collapsed ? <path d="m14 12 3-3v6l-3-3Z" /> : <path d="m10 12 4-3v6l-4-3Z" />}
  </svg>
);

const MenuIcon = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="toggle-icon"
    aria-hidden="true"
  >
    {open ? (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ) : (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    )}
  </svg>
);

const SunIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="theme-icon"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5" />
    <path d="M12 19v2.5" />
    <path d="m4.9 4.9 1.8 1.8" />
    <path d="m17.3 17.3 1.8 1.8" />
    <path d="M2.5 12H5" />
    <path d="M19 12h2.5" />
    <path d="m4.9 19.1 1.8-1.8" />
    <path d="m17.3 6.7 1.8-1.8" />
  </svg>
);

const MoonIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="theme-icon"
    aria-hidden="true"
  >
    <path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6.2 6.2 0 0 0 20 14.5Z" />
  </svg>
);

const InfoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="info-icon"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6" />
    <path d="M12 7h.01" />
  </svg>
);

const StatusBadge = ({ label, tone }) => (
  <span className={`badge badge-${tone}`}>{formatDisplayText(label)}</span>
);

const InfoTooltip = ({ text }) => (
  <span className="info-tooltip">
    <button type="button" className="info-tooltip-trigger" aria-label={text} title={text}>
      <InfoIcon />
    </button>
    <span className="info-tooltip-content" role="tooltip">
      {text}
    </span>
  </span>
);

const MultilineAxisTick = ({ x, y, payload, color }) => {
  const lines = String(payload?.value || "").split("\n");

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={color}
        fontFamily={CHART_FONT_FAMILY}
        fontSize={13}
      >
        {lines.map((line, index) => (
          <tspan key={`${payload?.value}-${index}`} x={0} dy={index === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("panorama");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    let cancelled = false;

    fetchSnapshot()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError.message || "Erro ao carregar snapshot");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#", "").trim().toLowerCase();
      const allowedTabs = ["panorama", "objetos", "cronograma", "indicadores", "exploracao"];
      setActiveTab(allowedTabs.includes(hash) ? hash : "panorama");
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
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = (event) => {
      if (!event.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const resumo = snapshot?.resumo_executivo ?? {};
  const objetos = snapshot?.objetos ?? [];
  const cronograma = useMemo(() => {
    const rawCronograma = snapshot?.cronograma ?? {};
    const statusContagem = rawCronograma.status_contagem || {};
    const atividadesSuspensas = rawCronograma.atividades_suspensas || [];

    return {
      ...rawCronograma,
      status_contagem: Object.keys(statusContagem).length
        ? statusContagem
        : FALLBACK_CRONOGRAMA.status_contagem,
      atividades_suspensas: atividadesSuspensas.length
        ? atividadesSuspensas
        : FALLBACK_CRONOGRAMA.atividades_suspensas,
    };
  }, [snapshot]);
  const kpisPorFase = snapshot?.kpis_por_fase ?? [];
  const nextObject = resumo?.proximo_objeto ?? null;

  const chartTheme = useMemo(() => getChartTheme(theme), [theme]);

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

  const statusCounts = useMemo(() => getStatusCounts(objetos), [objetos]);
  const phaseKpis = useMemo(() => getPhaseKpis(kpisPorFase), [kpisPorFase]);
  const highlights = useMemo(() => getHighlights(objetos), [objetos]);
  const riskRanking = useMemo(() => getRiskRanking(objetos), [objetos]);

  const nextObjectApprovedCount = useMemo(() => {
    const fromReason = extractApprovedCount(nextObject?.motivo);
    if (Number.isFinite(fromReason)) return fromReason;
    const match = objetos.find((item) => item.id === nextObject?.id);
    return Number(match?.kpis?.colecoes_aprovadas) || 0;
  }, [nextObject, objetos]);

  const statusChartRows = useMemo(
    () =>
      Object.entries(statusCounts).map(([status, count], index) => ({
        status: formatDisplayText(status),
        total: count,
        fill: chartTheme.status[index % chartTheme.status.length],
      })),
    [statusCounts, chartTheme],
  );

  const cronogramaStatusEntries = useMemo(
    () => Object.entries(cronograma.status_contagem || {}),
    [cronograma.status_contagem],
  );

  const cronogramaDonutRows = useMemo(
    () =>
      cronogramaStatusEntries.map(([label, count], index) => ({
        name: formatDisplayText(label),
        value: count,
        fill: chartTheme.pie[index % chartTheme.pie.length],
      })),
    [cronogramaStatusEntries, chartTheme],
  );

  const phaseChartRows = useMemo(
    () =>
      phaseKpis.map((item) => ({
        fase: formatPhaseAxisLabel(item.fase),
        entrada: item.entrada,
        aprovadas: item.aprovadas,
        invalidadas: item.invalidadas,
      })),
    [phaseKpis],
  );

  const cronogramaBarRows = useMemo(
    () =>
      cronogramaStatusEntries.map(([label, count]) => ({
        status: formatDisplayText(label),
        total: count,
      })),
    [cronogramaStatusEntries],
  );

  const approvalByPhaseRows = useMemo(
    () =>
      phaseKpis.map((item) => ({
        fase: formatDisplayText(item.fase),
        aprovacao: Number.isFinite(item.taxaAprovacao) ? item.taxaAprovacao * 100 : null,
      })),
    [phaseKpis],
  );

  const statusChartConfig = useMemo(() => ({ total: { label: "Objetos" } }), []);

  const cronogramaChartConfig = useMemo(() => ({ total: { label: "Atividades" } }), []);

  const phaseChartConfig = useMemo(
    () => ({
      invalidadas: { label: "Invalidadas", color: "#DAD21D" },
      aprovadas: { label: "Aprovadas", color: "#FF8B1A" },
      entrada: { label: "Entrada", color: "#4A8CCA" },
    }),
    [],
  );

  const approvalChartConfig = useMemo(
    () => ({
      aprovacao: { label: "Taxa de aprovação", color: chartTheme.line },
    }),
    [chartTheme.line],
  );

  const logoTextSrc = theme === "light"
    ? `${PUBLIC_BASE_URL}logo_text.svg`
    : `${PUBLIC_BASE_URL}logo_text_dark.svg`;

  if (error) {
    return (
      <div className="page error">
        <div>
          <h1>{error}</h1>
        </div>
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

  return (
    <div
      className={`app${isSidebarCollapsed ? " sidebar-collapsed" : ""}${isMobileMenuOpen ? " mobile-menu-open" : ""}`}
    >
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Fechar menu"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside className={`sidebar${isSidebarCollapsed ? " collapsed" : ""}${isMobileMenuOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <img
              src={`${PUBLIC_BASE_URL}logo_icon.svg`}
              alt="PNLD"
              className="brand-logo brand-logo-icon"
            />
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
          <p>Portfólio de Projetos do PNLD</p>
          <p>NEES / UFAL | 2026</p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="sidebar-toggle mobile-nav-toggle"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="sidebar-navigation"
            >
              <MenuIcon open={isMobileMenuOpen} />
            </button>
            <button
              type="button"
              className="sidebar-toggle topbar-toggle"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              aria-label={isSidebarCollapsed ? "Maximizar sidebar" : "Minimizar sidebar"}
            >
              <CollapseIcon collapsed={isSidebarCollapsed} />
            </button>
            <h1>Dashboard</h1>
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
            title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </header>

        {activeTab === "panorama" && (
          <section className="grid panorama-grid">
            <article className="card metric">
              <div className="metric-header">
                <h3>Total Objetos</h3>
                <InfoTooltip text="Total de objetos disponíveis no snapshot." />
              </div>
              <h2>{formatNumber(resumo.total_objetos)}</h2>
            </article>

            <article className="card metric">
              <div className="metric-header">
                <h3>Concluídos</h3>
                <InfoTooltip text="Objetos com fase de qualificação finalizada." />
              </div>
              <h2>{formatNumber(resumo.concluidos)}</h2>
            </article>

            <article className="card metric">
              <div className="metric-header">
                <h3>Em andamento</h3>
                <InfoTooltip text="Objetos com alguma fase iniciada e sem conclusão final." />
              </div>
              <h2>{formatNumber(resumo.em_andamento)}</h2>
            </article>

            <article className="card metric">
              <div className="metric-header">
                <h3>Concluído</h3>
                <InfoTooltip text="Percentual de objetos concluídos em relação ao total." />
              </div>
              <h2>{formatPercent(resumo.percentual_concluido)}</h2>
            </article>

            <article className="card highlight">
              <div className="card-head">
                <div className="highlight-heading">
                  <h3>Próximo Objeto</h3>
                  <span className="highlight-eyebrow">Em foco</span>
                </div>
                <InfoTooltip text="Regra = fase mais inicial; desempate por maior volume aprovado." />
              </div>

              <div className="highlight-body">
                <div className="highlight-main">
                  <h2 className="title">{nextObject?.nome || FALLBACK_TEXT}</h2>
                  <p className="highlight-summary">
                    {nextObject?.motivo || "Nenhum objeto definido como destaque no snapshot."}
                  </p>
                </div>

                <div className="highlight-meta">
                  <div className="highlight-pill">
                    <span>Fase atual</span>
                    <strong>{formatDisplayText(nextObject?.fase_atual)}</strong>
                  </div>
                  <div className="highlight-pill highlight-pill-accent">
                    <span>Aprovadas</span>
                    <strong>{formatNumber(nextObjectApprovedCount)}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="card chart">
              <div className="card-head">
                <h3>Status dos Objetos</h3>
                <InfoTooltip text="Legenda: Concluído, Em andamento e Sem dados." />
              </div>
              <ChartContainer className="plot plot-fade-in" config={statusChartConfig}>
                <BarChart data={statusChartRows} margin={{ top: 12, right: 12, bottom: 16, left: 12 }}>
                  <CartesianGrid vertical={false} stroke={chartTheme.grid} />
                  <XAxis
                    dataKey="status"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 13 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 13 }}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                    content={<ChartTooltipContent valueFormatter={(value) => formatNumber(value)} />}
                  />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                    {statusChartRows.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </article>

            <article className="card chart">
              <div className="card-head">
                <h3>Cronograma</h3>
                <InfoTooltip text='Status = contagem de status da aba "Status Cronograma".' />
              </div>
              <ChartContainer className="plot plot-fade-in" config={cronogramaChartConfig}>
                <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        valueFormatter={(value) => `${formatNumber(value)} atividades`}
                      />
                    }
                  />
                  <Pie
                    data={cronogramaDonutRows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={3}
                    strokeWidth={0}
                    label={({ percent }) => (percent ? `${Math.round(percent * 100)}%` : "")}
                    labelLine={false}
                  >
                    {cronogramaDonutRows.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend verticalAlign="middle" align="right" layout="vertical" content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            </article>

            <article className="card chart wide">
              <div className="card-head">
                <h3>KPIs por fase</h3>
                <InfoTooltip text="Coleções por fase: entrada, aprovadas e invalidadas." />
              </div>
              <ChartContainer className="plot plot-fade-in" config={phaseChartConfig}>
                <BarChart data={phaseChartRows} margin={{ top: 14, right: 12, bottom: 32, left: 12 }}>
                  <CartesianGrid vertical={false} stroke={chartTheme.grid} />
                  <XAxis
                    dataKey="fase"
                    height={70}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    tick={(props) => <MultilineAxisTick {...props} color={chartTheme.text} />}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 13 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent valueFormatter={(value) => formatNumber(value)} />}
                  />
                  <ChartLegend verticalAlign="top" align="right" content={<ChartLegendContent />} />
                  <Bar dataKey="invalidadas" stackId="phase" fill="var(--color-invalidadas)" radius={[0, 0, 6, 6]} />
                  <Bar dataKey="aprovadas" stackId="phase" fill="var(--color-aprovadas)" />
                  <Bar dataKey="entrada" stackId="phase" fill="var(--color-entrada)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </article>
          </section>
        )}

        {activeTab === "objetos" && (
          <section className="grid full objetos-grid">
            <article className="card objetos-fill">
              <div className="card-head">
                <h3>Destaques</h3>
                <InfoTooltip text="Destaques = objetos ordenados por fase atual." />
              </div>

              <div className="detail-stack">
                {highlights.map((item, index) => (
                  <article key={item.id} className="detail-card detail-spotlight">
                    <div className="detail-rank">{String(index + 1).padStart(2, "0")}</div>
                    <div className="detail-content">
                      <strong>{item.nome}</strong>
                      <span className="detail-phase">{formatDisplayText(item.fase_atual)}</span>
                      <div className="detail-meta-row">
                        <span className="detail-meta-label">Aprovadas</span>
                        <span className="detail-meta-value">
                          {formatNumber(item?.kpis?.colecoes_aprovadas)}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="card full">
              <div className="card-head">
                <h3>Objetos</h3>
                <InfoTooltip text="Aprovação = coleções aprovadas ÷ coleções de entrada × 100." />
              </div>

              <div className="object-table-shell">
                <table className="object-table">
                  <thead>
                    <tr>
                      <th>Objeto</th>
                      <th>Status</th>
                      <th>Fase atual</th>
                      <th>Aprovação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objetos.map((item) => (
                      <tr key={item.id}>
                        <td className="object-name-cell">
                          <strong>{item.nome}</strong>
                        </td>
                        <td>
                          <StatusBadge
                            label={item.status_objeto || "Sem dados"}
                            tone={getStatusTone(item.status_objeto)}
                          />
                        </td>
                        <td className="object-phase-cell">{formatDisplayText(item.fase_atual)}</td>
                        <td className="object-approval-cell">
                          {formatPercent((Number(item?.kpis?.taxa_aprovacao) || 0) * 100)}
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
          <section className="grid full cronograma-grid">
            <article className="card cronograma-fill">
              <div className="card-head">
                <h3>Atividades suspensas</h3>
                <InfoTooltip text='Suspensas = linhas com status contendo "Suspenso".' />
              </div>

              {cronograma.atividades_suspensas?.length ? (
                <ul className="list">
                  {cronograma.atividades_suspensas.map((item, index) => (
                    <li key={`${item.Objeto}-${item.Atividade}-${index}`} className="suspension-item">
                      <div className="suspension-main">
                        <div className="suspension-index">{String(index + 1).padStart(2, "0")}</div>
                        <div className="suspension-content">
                          <strong>{item.Objeto || FALLBACK_TEXT}</strong>
                          <p className="suspension-subtitle">
                            {item.Atividade
                              ? `Atividade: ${formatDisplayText(item.Atividade)}`
                              : "Atividade sem descrição."}
                          </p>
                        </div>
                      </div>
                      <StatusBadge label={item.Status || "Suspenso"} tone="critico" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="suspension-empty">Nenhuma atividade suspensa no cronograma.</div>
              )}
            </article>

            <article className="card chart">
              <div className="card-head">
                <h3>Status do cronograma</h3>
                <InfoTooltip text='Status = contagem por status na aba "Status Cronograma".' />
              </div>
              {cronogramaBarRows.length ? (
                <ChartContainer className="plot plot-fade-in" config={cronogramaChartConfig}>
                  <BarChart data={cronogramaBarRows} margin={{ top: 12, right: 12, bottom: 16, left: 12 }}>
                    <CartesianGrid vertical={false} stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="status"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 13 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 13 }}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent valueFormatter={(value) => formatNumber(value)} />}
                    />
                    <Bar dataKey="total" fill={chartTheme.bar} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="chart-empty">Nenhum status disponível no cronograma.</div>
              )}
            </article>
          </section>
        )}

        {activeTab === "indicadores" && (
          <section className="grid full indicators-grid">
            <article className="card full">
              <div className="card-head">
                <h3>Ranking de risco</h3>
                <InfoTooltip text="Ranking = menor taxa de aprovação por objeto." />
              </div>

              <div className="legend">
                <span>
                  <span className="dot ok" />
                  Concluído
                </span>
                <span>
                  <span className="dot andamento" />
                  Em andamento
                </span>
                <span>
                  <span className="dot critico" />
                  Sem dados
                </span>
              </div>

              <div className="risk-list">
                {riskRanking.map((item) => (
                  <article key={item.id} className="risk-item">
                    <div>
                      <strong>{item.nome}</strong>
                      <StatusBadge
                        label={item.status_objeto || "Sem dados"}
                        tone={getStatusTone(item.status_objeto)}
                      />
                    </div>
                    <span>{formatPercent((Number(item?.kpis?.taxa_aprovacao) || 0) * 100)}</span>
                  </article>
                ))}
              </div>
            </article>

            <article className="card chart wide tall full">
              <div className="card-head">
                <h3>Aprovação por fase</h3>
                <InfoTooltip text="Taxa por fase = aprovadas ÷ entrada × 100 (por fase)." />
              </div>
              <ChartContainer className="plot tall plot-fade-in" config={approvalChartConfig}>
                <LineChart data={approvalByPhaseRows} margin={{ top: 18, right: 16, bottom: 24, left: 12 }}>
                  <CartesianGrid vertical={false} stroke={chartTheme.grid} />
                  <XAxis
                    dataKey="fase"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 105]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: chartTheme.text, fontFamily: CHART_FONT_FAMILY, fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent valueFormatter={(value) => formatPercent(value)} />}
                  />
                  <Line
                    type="monotone"
                    dataKey="aprovacao"
                    stroke="var(--color-aprovacao)"
                    strokeWidth={3.5}
                    dot={{
                      r: 4.5,
                      fill: chartTheme.line,
                      stroke: chartTheme.lineMarkerStroke,
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: chartTheme.line,
                      stroke: chartTheme.lineMarkerStroke,
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ChartContainer>
            </article>
          </section>
        )}

        {activeTab === "exploracao" && (
          <section className="grid full">
            <article className="card full">
              <div className="card-head">
                <h3>Snapshot bruto</h3>
                <InfoTooltip text="Fonte única: out/snapshot.json" />
              </div>
              <pre className="json">{JSON.stringify(snapshot, null, 2)}</pre>
            </article>

            <article className="card full">
              <div className="card-head">
                <h3>Objetos detalhados</h3>
                <InfoTooltip text="Tabela com status e marcos por fase para cada objeto." />
              </div>

              <div className="object-table-shell">
                <table className="object-table">
                  <thead>
                    <tr>
                      <th>Objeto</th>
                      <th>Fase</th>
                      <th>Status da fase</th>
                      <th>Início</th>
                      <th>Fim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objetos.flatMap((item) =>
                      (item.fases || []).map((fase) => (
                        <tr key={`${item.id}-${fase.fase}`}>
                          <td className="object-name-cell">
                            <strong>{item.nome}</strong>
                          </td>
                          <td>{formatDisplayText(fase.fase)}</td>
                          <td>{formatDisplayText(fase.status_fase)}</td>
                          <td>{fase.inicio || fase.previsao_inicio || FALLBACK_TEXT}</td>
                          <td>{fase.fim || fase.previsao_fim || FALLBACK_TEXT}</td>
                        </tr>
                      )),
                    )}
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
