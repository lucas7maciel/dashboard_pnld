// ============================================================
// STORAGE — camada de persistência isolada
//
// IMPORTANTE: este módulo é a ÚNICA porta de entrada/saída de
// dados do simulador. O resto do código não conhece localStorage.
// Quando migrarmos para API/banco, só este arquivo muda.
//
// API pública:
//   loadProjects()         → array de projetos (ou seed inicial)
//   saveProjects(projects) → persiste
//   resetProjects()        → apaga tudo, volta ao seed
//   subscribeToSaves(cb)   → notifica quando salva (para indicador "salvo às 14:32")
// ============================================================

const STORAGE_KEY = "pnld-sim-projects";
const VERSION_KEY = "pnld-sim-version";
const CURRENT_VERSION = "1";

const safeParse = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};

const isValidProjectsShape = (v) =>
  Array.isArray(v) && v.every((p) =>
    p && typeof p.id === "string" && Array.isArray(p.phases)
  );

const ROOT_ID = "__ROOT__";

const HISTORICAL_MEDIANS = {
  "Validação de Inscrição": { "Didático": 61, "Literário": 121, "RED": 91, "Pedagógico": 61 },
  "Avaliação Pedagógica":   { "Didático": 152, "Literário": 200, "RED": 182, "Pedagógico": 166 },
  "Análise de Atributos":   { "Didático": 90, "Literário": 90, "RED": 90, "Pedagógico": 90 },
  "Acessibilidade":         { "Didático": 88, "Literário": 95, "RED": 90, "Pedagógico": 90 },
  "Insumos de Qualificação":{ "Didático": 24, "Literário": 30, "RED": 30, "Pedagógico": 24 },
};

const DEFAULT_PHASE_NAMES = [
  "Validação de Inscrição",
  "Avaliação Pedagógica",
  "Análise de Atributos",
  "Acessibilidade",
  "Insumos de Qualificação",
];

const makeId = () =>
  window.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const makeDefaultPhases = (tipo) => {
  const ids = DEFAULT_PHASE_NAMES.map(() => makeId());
  return DEFAULT_PHASE_NAMES.map((nome, i) => ({
    id: ids[i],
    nome,
    duracao: HISTORICAL_MEDIANS[nome]?.[tipo] ?? 30,
    unidade: "dias",
    dependsOn: i === 0 ? ROOT_ID : ids[i - 1],
    linkType: "apos_fim",
    lag: 0,
  }));
};

const buildSeed = () => [
  { id: makeId(), edital: "PNLD LITERÁRIO EQUIDADE", objeto: "Objeto 1: Obras literárias destinadas à EJA", tipo: "Literário", dataPublicacao: "2025-12-01", phases: makeDefaultPhases("Literário") },
  { id: makeId(), edital: "PNLD ANOS INICIAIS 2027-2030", objeto: "Objeto 01: Obras Didáticas — Anos Iniciais", tipo: "Didático", dataPublicacao: "2026-02-01", phases: makeDefaultPhases("Didático") },
  { id: makeId(), edital: "PNLD ANOS INICIAIS 2027-2030", objeto: "Objeto 2: Obras de apoio teórico-metodológico", tipo: "Pedagógico", dataPublicacao: "2026-02-01", phases: makeDefaultPhases("Pedagógico") },
  { id: makeId(), edital: "PNLD LITERÁRIO EQUIDADE", objeto: "Objeto 2: Obras literárias — Ensino Médio Regular", tipo: "Literário", dataPublicacao: "2026-03-01", phases: makeDefaultPhases("Literário") },
];

const subscribers = new Set();
const notifySaved = (timestamp) => {
  subscribers.forEach((cb) => {
    try { cb(timestamp); } catch (e) { console.error("[storage] subscriber error:", e); }
  });
};

export function loadProjects() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = buildSeed();
      saveProjects(seed);
      window.localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      return seed;
    }
    const parsed = safeParse(raw);
    if (!isValidProjectsShape(parsed)) {
      console.warn("[storage] dados corrompidos no localStorage, voltando ao seed");
      const seed = buildSeed();
      saveProjects(seed);
      return seed;
    }
    return parsed;
  } catch (err) {
    console.error("[storage] loadProjects falhou:", err);
    return buildSeed();
  }
}

export function saveProjects(projects) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    notifySaved(Date.now());
  } catch (err) {
    console.error("[storage] saveProjects falhou:", err);
  }
}

export function resetProjects() {
  const seed = buildSeed();
  saveProjects(seed);
  return seed;
}

export function subscribeToSaves(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
