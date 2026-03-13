import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import typer
from pydantic import BaseModel, Field


app = typer.Typer(add_completion=False, no_args_is_help=True)

PHASES_ORDER = [
    "VALIDAÇÃO DE INSCRIÇÃO",
    "AVALIAÇÃO PEDAGÓGICA",
    "ANÁLISE DE ATRIBUTOS",
    "ACESSIBILIDADE",
    "INSUMOS DE QUALIFICAÇÃO",
]

PHASE_SHEET_MAP = {
    "Con_VI": "VALIDAÇÃO DE INSCRIÇÃO",
    "Con_Atrib": "ANÁLISE DE ATRIBUTOS",
    "Con_Acess": "ACESSIBILIDADE",
    "Con_IQ": "INSUMOS DE QUALIFICAÇÃO",
}


class ProximoObjeto(BaseModel):
    id: Optional[str]
    nome: Optional[str]
    fase_atual: Optional[str]
    motivo: Optional[str]


class ResumoExecutivo(BaseModel):
    total_objetos: int
    concluidos: int
    em_andamento: int
    sem_dados: int
    percentual_concluido: Optional[float]
    proximo_objeto: ProximoObjeto


class CronogramaResumo(BaseModel):
    status_contagem: Dict[str, int] = Field(default_factory=dict)
    atividades_suspensas: List[Dict[str, Any]] = Field(default_factory=list)


class KpiFase(BaseModel):
    fase: str
    colecoes_entrada: Optional[float]
    colecoes_aprovadas: Optional[float]
    colecoes_invalidadas_desclassificadas: Optional[float]
    falhas_diligencias: Optional[float]
    volumes_entrada: Optional[float]
    analistas_env: Optional[float]
    orcamento_estimado: Optional[float]
    taxa_aprovacao: Optional[float]
    custo_por_aprovada: Optional[float]


class FaseObjeto(BaseModel):
    fase: str
    status_fase: Optional[str]
    previsao_inicio: Optional[str]
    previsao_fim: Optional[str]
    inicio: Optional[str]
    fim: Optional[str]
    colecoes_entrada: Optional[float]
    colecoes_aprovadas: Optional[float]
    colecoes_invalidadas_desclassificadas: Optional[float]
    falhas_diligencias: Optional[float]
    volumes_entrada: Optional[float]
    analistas_env: Optional[float]
    orcamento_estimado: Optional[float]
    taxa_aprovacao: Optional[float]
    custo_por_aprovada: Optional[float]


class Objeto(BaseModel):
    id: str
    nome: str
    status_objeto: str
    fase_atual: Optional[str]
    kpis: KpiFase
    fases: List[FaseObjeto]


class Snapshot(BaseModel):
    metadata: Dict[str, Any]
    resumo_executivo: ResumoExecutivo
    cronograma: CronogramaResumo
    kpis_por_fase: List[KpiFase]
    objetos: List[Objeto]


def normalize_text(value: Any) -> str:
    # Normaliza texto para comparação robusta de colunas e fases
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text).strip().upper()
    return text


def slugify(value: str) -> str:
    text = normalize_text(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "objeto"


def safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    # Divisão segura sem risco de divisão por zero
    if a is None or b is None:
        return None
    if pd.isna(a) or pd.isna(b):
        return None
    if b == 0:
        return None
    return a / b


def to_iso(value: Any) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


def find_column(
    columns: List[Any], keywords: List[str], used: Optional[set] = None
) -> Optional[Any]:
    used = used or set()
    for col in columns:
        if col in used:
            continue
        col_norm = normalize_text(col)
        if any(key in col_norm for key in keywords):
            return col
    return None


def find_column_priority(
    columns: List[Any],
    priority_keywords: List[List[str]],
    used: Optional[set] = None,
) -> Optional[Any]:
    used = used or set()
    for keywords in priority_keywords:
        found = find_column(columns, keywords, used)
        if found is not None:
            return found
    return None


def parse_previsao(value: Any) -> Tuple[Optional[str], Optional[str]]:
    if value is None or pd.isna(value):
        return None, None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        iso = to_iso(value)
        return iso, iso
    text = str(value)
    dates = re.findall(r"\d{1,2}/\d{1,2}/\d{2,4}", text)
    if not dates:
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
        iso = to_iso(parsed)
        return iso, iso
    parsed_dates = [pd.to_datetime(d, errors="coerce", dayfirst=True) for d in dates]
    parsed_dates = [d for d in parsed_dates if not pd.isna(d)]
    if len(parsed_dates) == 1:
        iso = to_iso(parsed_dates[0])
        return iso, iso
    if len(parsed_dates) >= 2:
        return to_iso(parsed_dates[0]), to_iso(parsed_dates[1])
    return None, None


def match_phase(raw: Any) -> str:
    raw_norm = normalize_text(raw)
    for phase in PHASES_ORDER:
        if normalize_text(phase) in raw_norm or raw_norm in normalize_text(phase):
            return phase
    return str(raw).strip()


def extract_phase_metrics(df: pd.DataFrame, warnings: List[str]) -> pd.DataFrame:
    columns = list(df.columns)
    obj_col = find_column(columns, ["OBJETO", "EDITAL"])
    if obj_col is None:
        obj_col = columns[0]
        warnings.append("Coluna de objeto não identificada; usando primeira coluna.")
    mapping = {
        "colecoes_entrada": None,
        "colecoes_aprovadas": ["APROVAD"],
        "colecoes_invalidadas_desclassificadas": ["INVALID", "DESCLASS"],
        "falhas_diligencias": ["FALHA", "DILIG"],
        "volumes_entrada": ["VOLUME"],
        "analistas_env": ["ANALISTA", "ENV"],
        "orcamento_estimado": ["ORCAMENTO", "ORCAMENTO ESTIMADO"],
    }
    selected = {"edital_objeto": obj_col}
    used_cols = {obj_col}
    for key, keywords in mapping.items():
        if key == "colecoes_entrada":
            col = find_column_priority(
                columns,
                [
                    ["COLECOES DE ENTRADA", "COLECOES ENTRADA"],
                    ["COLECOES INSCRIT"],
                    ["VOLUME", "ENTRADA"],
                ],
                used_cols,
            )
        else:
            col = find_column(columns, keywords, used_cols)
        if col is None:
            warnings.append(f"Coluna ausente para {key}.")
        selected[key] = col
        if col is not None:
            used_cols.add(col)
    data = df[[c for c in selected.values() if c is not None]].copy()
    rename = {v: k for k, v in selected.items() if v is not None}
    data = data.rename(columns=rename)
    if data.columns.duplicated().any():
        data = data.loc[:, ~data.columns.duplicated(keep="first")]
    for col in [
        "colecoes_entrada",
        "colecoes_aprovadas",
        "colecoes_invalidadas_desclassificadas",
        "falhas_diligencias",
        "volumes_entrada",
        "analistas_env",
        "orcamento_estimado",
    ]:
        if col in data.columns:
            series = data[col]
            if isinstance(series, pd.DataFrame):
                series = series.iloc[:, 0]
            data[col] = pd.to_numeric(series, errors="coerce")
    return data


def parse_status_cronograma(path: Path, warnings: List[str]) -> pd.DataFrame:
    # Aba com cabeçalho duplo: FASE / STATUS-PREVISAO-INICIO-FIM
    df = pd.read_excel(path, sheet_name="Status Cronograma", header=[0, 1])
    obj_col = None
    for col in df.columns:
        if isinstance(col, tuple):
            if any(
                key in normalize_text(col[0]) or key in normalize_text(col[1])
                for key in ["OBJETO", "EDITAL"]
            ):
                obj_col = col
                break
    if obj_col is None:
        obj_col = df.columns[0]
        warnings.append("Coluna de objeto não identificada em Status Cronograma.")
    records = {}
    for _, row in df.iterrows():
        obj_val = row[obj_col]
        if pd.isna(obj_val):
            continue
        for col in df.columns:
            if col == obj_col or not isinstance(col, tuple):
                continue
            fase_raw, sub_raw = col
            if pd.isna(fase_raw) or pd.isna(sub_raw):
                continue
            fase = match_phase(fase_raw)
            sub_norm = normalize_text(sub_raw)
            key = (normalize_text(obj_val), fase)
            record = records.setdefault(
                key,
                {
                    "edital_objeto": obj_val,
                    "fase": fase,
                    "status_fase": None,
                    "previsao_inicio": None,
                    "previsao_fim": None,
                    "inicio": None,
                    "fim": None,
                },
            )
            value = row[col]
            if "STATUS" in sub_norm:
                record["status_fase"] = None if pd.isna(value) else str(value).strip()
            elif "PREV" in sub_norm:
                prev_ini, prev_fim = parse_previsao(value)
                record["previsao_inicio"] = prev_ini
                record["previsao_fim"] = prev_fim
            elif "INICIO" in sub_norm:
                record["inicio"] = to_iso(pd.to_datetime(value, errors="coerce"))
            elif "FIM" in sub_norm:
                record["fim"] = to_iso(pd.to_datetime(value, errors="coerce"))
    return pd.DataFrame(records.values())


def build_atividades_suspensas(df: pd.DataFrame) -> List[Dict[str, Any]]:
    if df.empty:
        return []
    columns = list(df.columns)
    status_col = find_column(columns, ["STATUS"])
    if status_col is None:
        return []
    mask = df[status_col].astype(str).str.upper().str.contains("SUSPENS", na=False)
    if not mask.any():
        return []
    subset = df[mask].copy()
    subset = subset.where(pd.notna(subset), None)
    return subset.to_dict(orient="records")


def compute_status_counts(df: pd.DataFrame) -> Dict[str, int]:
    if df.empty or "status_fase" not in df.columns:
        return {}
    status = df["status_fase"].dropna().astype(str).str.strip()
    status = status[status != ""]
    return status.value_counts().to_dict()


def fase_atual_calc(fases: List[Dict[str, Any]]) -> Optional[str]:
    by_phase = {f["fase"]: f.get("status_fase") for f in fases}
    atual = None
    for phase in PHASES_ORDER:
        status = by_phase.get(phase)
        if status is None:
            continue
        status_norm = normalize_text(status)
        if status_norm and status_norm != "SEM DADOS":
            atual = phase
    return atual


def status_objeto_calc(fases: List[Dict[str, Any]]) -> str:
    status_by_phase = {f["fase"]: f.get("status_fase") for f in fases}
    iq_status = normalize_text(status_by_phase.get("INSUMOS DE QUALIFICAÇÃO"))
    if iq_status == "FINALIZADO":
        return "CONCLUÍDO"
    all_empty = True
    any_finalizado = False
    for status in status_by_phase.values():
        if status is None:
            continue
        status_norm = normalize_text(status)
        if status_norm and status_norm != "SEM DADOS":
            all_empty = False
        if status_norm == "FINALIZADO":
            any_finalizado = True
    if all_empty:
        return "SEM DADOS"
    if any_finalizado:
        return "EM ANDAMENTO"
    return "EM ANDAMENTO"


def sum_field(values: List[Optional[float]]) -> Optional[float]:
    vals = [v for v in values if v is not None and not pd.isna(v)]
    if not vals:
        return None
    return float(pd.Series(vals).sum())


def clean_nan(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def build_snapshot(input_path: Path, outdir: Path) -> Snapshot:
    # Pipeline completo: leitura, normalização, KPIs e snapshot final
    warnings: List[str] = []
    xl = pd.ExcelFile(input_path)
    sheets = {
        name: pd.read_excel(input_path, sheet_name=name)
        for name in [
            "Dados",
            "Con_VI",
            "Con_Atrib",
            "Con_Acess",
            "Con_IQ",
            "cronograma",
        ]
        if name in xl.sheet_names
    }
    if "Status Cronograma" not in xl.sheet_names:
        raise ValueError("A aba 'Status Cronograma' é obrigatória.")
    status_df = parse_status_cronograma(input_path, warnings)

    metrics_rows = []
    for sheet, fase in PHASE_SHEET_MAP.items():
        if sheet not in sheets:
            warnings.append(f"Aba ausente: {sheet}")
            continue
        metrics = extract_phase_metrics(sheets[sheet], warnings)
        metrics["fase"] = fase
        metrics_rows.append(metrics)
    metrics_df = (
        pd.concat(metrics_rows, ignore_index=True) if metrics_rows else pd.DataFrame()
    )

    dados_df = sheets.get("Dados", pd.DataFrame())
    dados_obj_col = find_column(list(dados_df.columns), ["OBJETO", "EDITAL"])
    if dados_obj_col is None and not dados_df.empty:
        warnings.append("Coluna de objeto não identificada na aba Dados.")
    dados_objects = (
        dados_df[dados_obj_col].dropna().astype(str).tolist()
        if dados_obj_col is not None
        else []
    )

    def build_obj_map(values: List[Any], prefer: Dict[str, str]) -> Dict[str, str]:
        for val in values:
            key = normalize_text(val)
            if key and key not in prefer:
                prefer[key] = str(val)
        return prefer

    obj_map: Dict[str, str] = {}
    obj_map = build_obj_map(dados_objects, obj_map)
    if not status_df.empty:
        obj_map = build_obj_map(status_df["edital_objeto"].tolist(), obj_map)
    if not metrics_df.empty:
        obj_map = build_obj_map(metrics_df["edital_objeto"].tolist(), obj_map)

    status_df["obj_key"] = status_df["edital_objeto"].apply(normalize_text)
    metrics_df["obj_key"] = (
        metrics_df["edital_objeto"].apply(normalize_text)
        if not metrics_df.empty
        else None
    )

    status_lookup = {
        (row["obj_key"], row["fase"]): row.to_dict()
        for _, row in status_df.iterrows()
    }
    metrics_lookup = {
        (row["obj_key"], row["fase"]): row.to_dict()
        for _, row in metrics_df.iterrows()
    }

    objects: List[Objeto] = []
    for obj_key, obj_name in obj_map.items():
        fases = []
        for fase in PHASES_ORDER:
            status_record = status_lookup.get((obj_key, fase), {})
            metrics_record = metrics_lookup.get((obj_key, fase), {})
            combined = {
                "fase": fase,
                "status_fase": clean_nan(status_record.get("status_fase")),
                "previsao_inicio": clean_nan(status_record.get("previsao_inicio")),
                "previsao_fim": clean_nan(status_record.get("previsao_fim")),
                "inicio": clean_nan(status_record.get("inicio")),
                "fim": clean_nan(status_record.get("fim")),
                "colecoes_entrada": clean_nan(metrics_record.get("colecoes_entrada")),
                "colecoes_aprovadas": clean_nan(metrics_record.get("colecoes_aprovadas")),
                "colecoes_invalidadas_desclassificadas": clean_nan(metrics_record.get(
                    "colecoes_invalidadas_desclassificadas"
                )),
                "falhas_diligencias": clean_nan(metrics_record.get("falhas_diligencias")),
                "volumes_entrada": clean_nan(metrics_record.get("volumes_entrada")),
                "analistas_env": clean_nan(metrics_record.get("analistas_env")),
                "orcamento_estimado": clean_nan(metrics_record.get("orcamento_estimado")),
                "taxa_aprovacao": safe_div(
                    metrics_record.get("colecoes_aprovadas"),
                    metrics_record.get("colecoes_entrada"),
                ),
                "custo_por_aprovada": safe_div(
                    metrics_record.get("orcamento_estimado"),
                    metrics_record.get("colecoes_aprovadas"),
                ),
            }
            has_data = any(
                value is not None and value != ""
                for value in combined.values()
                if value is not None
            )
            if has_data:
                fases.append(combined)
        fase_atual = fase_atual_calc(fases)
        status_objeto = status_objeto_calc(fases)
        kpi = {
            "fase": "TOTAL",
            "colecoes_entrada": sum_field(
                [f.get("colecoes_entrada") for f in fases]
            ),
            "colecoes_aprovadas": sum_field(
                [f.get("colecoes_aprovadas") for f in fases]
            ),
            "colecoes_invalidadas_desclassificadas": sum_field(
                [f.get("colecoes_invalidadas_desclassificadas") for f in fases]
            ),
            "falhas_diligencias": sum_field(
                [f.get("falhas_diligencias") for f in fases]
            ),
            "volumes_entrada": sum_field(
                [f.get("volumes_entrada") for f in fases]
            ),
            "analistas_env": sum_field(
                [f.get("analistas_env") for f in fases]
            ),
            "orcamento_estimado": sum_field(
                [f.get("orcamento_estimado") for f in fases]
            ),
        }
        kpi["taxa_aprovacao"] = safe_div(
            kpi["colecoes_aprovadas"], kpi["colecoes_entrada"]
        )
        kpi["custo_por_aprovada"] = safe_div(
            kpi["orcamento_estimado"], kpi["colecoes_aprovadas"]
        )
        objeto = Objeto(
            id=slugify(obj_name),
            nome=obj_name,
            status_objeto=status_objeto,
            fase_atual=fase_atual,
            kpis=KpiFase(**kpi),
            fases=[FaseObjeto(**f) for f in fases],
        )
        objects.append(objeto)

    kpis_por_fase: List[KpiFase] = []
    for phase in PHASES_ORDER:
        phase_fases = [
            f
            for obj in objects
            for f in obj.fases
            if f.fase == phase
        ]
        kpi = {
            "fase": phase,
            "colecoes_entrada": sum_field(
                [f.colecoes_entrada for f in phase_fases]
            ),
            "colecoes_aprovadas": sum_field(
                [f.colecoes_aprovadas for f in phase_fases]
            ),
            "colecoes_invalidadas_desclassificadas": sum_field(
                [f.colecoes_invalidadas_desclassificadas for f in phase_fases]
            ),
            "falhas_diligencias": sum_field(
                [f.falhas_diligencias for f in phase_fases]
            ),
            "volumes_entrada": sum_field(
                [f.volumes_entrada for f in phase_fases]
            ),
            "analistas_env": sum_field(
                [f.analistas_env for f in phase_fases]
            ),
            "orcamento_estimado": sum_field(
                [f.orcamento_estimado for f in phase_fases]
            ),
        }
        kpi["taxa_aprovacao"] = safe_div(
            kpi["colecoes_aprovadas"], kpi["colecoes_entrada"]
        )
        kpi["custo_por_aprovada"] = safe_div(
            kpi["orcamento_estimado"], kpi["colecoes_aprovadas"]
        )
        kpis_por_fase.append(KpiFase(**kpi))

    total_objetos = len(objects)
    concluidos = len([o for o in objects if o.status_objeto == "CONCLUÍDO"])
    em_andamento = len([o for o in objects if o.status_objeto == "EM ANDAMENTO"])
    sem_dados = len([o for o in objects if o.status_objeto == "SEM DADOS"])
    percentual_concluido = (
        safe_div(concluidos * 100, total_objetos) if total_objetos else None
    )

    non_concluidos = [o for o in objects if o.status_objeto != "CONCLUÍDO"]
    proximo_objeto = ProximoObjeto(id=None, nome=None, fase_atual=None, motivo=None)
    if non_concluidos:
        def phase_rank(fase: Optional[str]) -> int:
            if fase in PHASES_ORDER:
                return PHASES_ORDER.index(fase)
            return len(PHASES_ORDER) + 1

        non_concluidos.sort(
            key=lambda o: (phase_rank(o.fase_atual), -(o.kpis.colecoes_aprovadas or 0), o.nome)
        )
        chosen = non_concluidos[0]
        motivo = (
            f"Está na fase mais inicial ({chosen.fase_atual}) "
            f"e possui {int(chosen.kpis.colecoes_aprovadas or 0)} coleções aprovadas."
        )
        proximo_objeto = ProximoObjeto(
            id=chosen.id, nome=chosen.nome, fase_atual=chosen.fase_atual, motivo=motivo
        )

    cronograma_df = sheets.get("cronograma", pd.DataFrame())
    cronograma = CronogramaResumo(
        status_contagem=compute_status_counts(status_df),
        atividades_suspensas=build_atividades_suspensas(cronograma_df),
    )

    snapshot = Snapshot(
        metadata={
            "fonte": input_path.name,
            "tipo": "snapshot",
            "data_geracao": date.today().isoformat(),
            "versao_modelo": "1.0",
        },
        resumo_executivo=ResumoExecutivo(
            total_objetos=total_objetos,
            concluidos=concluidos,
            em_andamento=em_andamento,
            sem_dados=sem_dados,
            percentual_concluido=percentual_concluido,
            proximo_objeto=proximo_objeto,
        ),
        cronograma=cronograma,
        kpis_por_fase=kpis_por_fase,
        objetos=objects,
    )

    report_path = outdir / "report.md"
    report_lines = [
        "# Relatório de geração",
        "",
        f"- Fonte: {input_path.name}",
        f"- Data: {date.today().isoformat()}",
        f"- Objetos: {total_objetos}",
        f"- Concluídos: {concluidos}",
        f"- Em andamento: {em_andamento}",
        f"- Sem dados: {sem_dados}",
        "",
        "## Alertas",
    ]
    if warnings:
        report_lines.extend([f"- {w}" for w in warnings])
    else:
        report_lines.append("- Nenhum alerta.")
    report_path.write_text("\n".join(report_lines), encoding="utf-8")

    schema_path = outdir / "schema.json"
    schema_path.write_text(
        json.dumps(snapshot.model_json_schema(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    snapshot_path = outdir / "snapshot.json"
    snapshot_path.write_text(
        json.dumps(snapshot.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return snapshot


@app.command()
def main(
    input: Path = typer.Option(..., "--input", help="Caminho do Excel"),
    outdir: Path = typer.Option(..., "--outdir", help="Diretório de saída"),
) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    snapshot = build_snapshot(input, outdir)
    typer.echo(f"Snapshot gerado: {outdir / 'snapshot.json'}")
    typer.echo(f"Objetos: {snapshot.resumo_executivo.total_objetos}")


if __name__ == "__main__":
    app()
