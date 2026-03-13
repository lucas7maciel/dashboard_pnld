import json
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import plotly.express as px
import streamlit as st


BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "dashboard_config.json"
SNAPSHOT_PATH = BASE_DIR / "out" / "snapshot.json"


def load_json(path: Path) -> Dict[str, Any]:
    # Carrega JSON e interrompe se não existir
    if not path.exists():
        st.error(f"Arquivo não encontrado: {path}")
        st.stop()
    return json.loads(path.read_text(encoding="utf-8"))


def apply_theme(colors: Dict[str, str]) -> None:
    # Estilo visual centralizado via config
    st.markdown(
        f"""
        <style>
        .stApp {{ background-color: {colors['background']}; color: {colors['text']}; }}
        .kpi-card {{
            background: white;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #E9ECEF;
        }}
        .next-card {{
            background: #FFF4E5;
            border: 1px solid #FFE0B2;
            border-radius: 12px;
            padding: 16px;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def dataframe_objects(snapshot: Dict[str, Any]) -> pd.DataFrame:
    # Converte objetos do snapshot em DataFrame
    return pd.DataFrame(snapshot.get("objetos", []))


def dataframe_phases(snapshot: Dict[str, Any]) -> pd.DataFrame:
    # Estrutura longa por fases para visualizações
    rows: List[Dict[str, Any]] = []
    for obj in snapshot.get("objetos", []):
        for fase in obj.get("fases", []):
            row = {"id": obj.get("id"), "nome": obj.get("nome")}
            row.update(fase)
            rows.append(row)
    return pd.DataFrame(rows)


def format_percent(value: Any) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}%"


def main() -> None:
    st.set_page_config(page_title="PNLD Dashboard", layout="wide")
    config = load_json(CONFIG_PATH)
    snapshot = load_json(SNAPSHOT_PATH)
    if "resumo_executivo" not in snapshot:
        st.error("snapshot.json inválido ou vazio. Gere o snapshot antes de abrir o dashboard.")
        st.code(
            'python generate_snapshot.py --input "Dashboard - Objetos PNLD.xlsx" --outdir "./out"'
        )
        st.stop()

    colors = config["theme"]
    thresholds = config["thresholds"]
    labels = config["labels"]
    apply_theme(colors)

    st.title("PNLD Dashboard")
    st.caption("Painel executivo baseado no snapshot JSON.")

    objetos_df = dataframe_objects(snapshot)
    fases_df = dataframe_phases(snapshot)
    kpis_fase_df = pd.DataFrame(snapshot.get("kpis_por_fase", []))

    tabs = st.tabs(
        [
            "Panorama Executivo",
            "Objetos",
            "Cronograma",
            "Indicadores",
            "Exploração Livre",
        ]
    )

    with tabs[0]:
        resumo = snapshot["resumo_executivo"]
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total Objetos", resumo["total_objetos"])
        col2.metric("Concluídos", resumo["concluidos"])
        col3.metric("Em Andamento", resumo["em_andamento"])
        col4.metric("% Concluído", format_percent(resumo["percentual_concluido"]))

        proximo = resumo.get("proximo_objeto", {})
        st.markdown(
            f"""
            <div class="next-card">
                <h4>🔥 Próximo Objeto</h4>
                <strong>{proximo.get('nome','-')}</strong><br/>
                Fase atual: {proximo.get('fase_atual','-')}<br/>
                <em>{proximo.get('motivo','-')}</em>
            </div>
            """,
            unsafe_allow_html=True,
        )

        left, mid, right = st.columns(3)
        with left:
            status_counts = (
                objetos_df["status_objeto"].value_counts().reset_index(name="count")
                if not objetos_df.empty
                else pd.DataFrame(columns=["index", "status_objeto"])
            )
            if not status_counts.empty:
                fig_status = px.bar(
                    status_counts,
                    x="status_objeto",
                    y="count",
                    labels={"status_objeto": "Status", "count": "Objetos"},
                    color="status_objeto",
                    color_discrete_map={
                        "CONCLUÍDO": colors["ok"],
                        "EM ANDAMENTO": colors["andamento"],
                        "SEM DADOS": colors["critico"],
                    },
                )
                st.plotly_chart(fig_status, use_container_width=True)

        with mid:
            cronograma = snapshot.get("cronograma", {}).get("status_contagem", {})
            if cronograma:
                cron_df = pd.DataFrame(
                    {"status": list(cronograma.keys()), "qtd": list(cronograma.values())}
                )
                fig_pie = px.pie(cron_df, names="status", values="qtd")
                st.plotly_chart(fig_pie, use_container_width=True)

        with right:
            if not kpis_fase_df.empty:
                melted = kpis_fase_df.melt(
                    id_vars=["fase"],
                    value_vars=[
                        "colecoes_entrada",
                        "colecoes_aprovadas",
                        "colecoes_invalidadas_desclassificadas",
                    ],
                    var_name="tipo",
                    value_name="valor",
                )
                fig_kpi = px.bar(
                    melted,
                    x="fase",
                    y="valor",
                    color="tipo",
                    barmode="stack",
                )
                st.plotly_chart(fig_kpi, use_container_width=True)

    with tabs[1]:
        status_options = sorted(objetos_df["status_objeto"].dropna().unique())
        fase_options = sorted(objetos_df["fase_atual"].dropna().unique())
        c1, c2 = st.columns(2)
        status_filter = c1.multiselect("Status", status_options, default=status_options)
        fase_filter = c2.multiselect("Fase Atual", fase_options, default=fase_options)

        filtered = objetos_df.copy()
        if status_filter:
            filtered = filtered[filtered["status_objeto"].isin(status_filter)]
        if fase_filter:
            filtered = filtered[filtered["fase_atual"].isin(fase_filter)]

        st.dataframe(
            filtered[["nome", "status_objeto", "fase_atual", "kpis"]],
            use_container_width=True,
        )

        for obj in snapshot.get("objetos", []):
            if obj.get("nome") not in filtered["nome"].tolist():
                continue
            with st.expander(obj.get("nome", "Objeto")):
                st.write(f"Status: {obj.get('status_objeto')}")
                st.write(f"Fase atual: {obj.get('fase_atual')}")
                fases = pd.DataFrame(obj.get("fases", []))
                if not fases.empty:
                    st.dataframe(fases, use_container_width=True)

    with tabs[2]:
        cronograma = snapshot.get("cronograma", {}).get("status_contagem", {})
        if cronograma:
            cron_df = pd.DataFrame(
                {"status": list(cronograma.keys()), "qtd": list(cronograma.values())}
            )
            fig_status = px.bar(cron_df, x="status", y="qtd", color="status")
            st.plotly_chart(fig_status, use_container_width=True)

        st.subheader("Atividades suspensas")
        susp = snapshot.get("cronograma", {}).get("atividades_suspensas", [])
        if susp:
            st.dataframe(pd.DataFrame(susp), use_container_width=True)
        else:
            st.write("Nenhuma atividade suspensa encontrada.")

    with tabs[3]:
        fase_map = config["fase_map"]
        fase_key = st.selectbox("Selecione a fase", list(fase_map.keys()))
        fase_nome = fase_map[fase_key]
        fase_dados = fases_df[fases_df["fase"] == fase_nome]

        if fase_dados.empty:
            st.info("Sem dados para esta fase.")
        else:
            fase_dados = fase_dados.copy()
            fase_dados["taxa_aprovacao"] = pd.to_numeric(
                fase_dados["taxa_aprovacao"], errors="coerce"
            )
            ok = fase_dados[fase_dados["taxa_aprovacao"] >= thresholds["ok"]]
            risco = fase_dados[
                (fase_dados["taxa_aprovacao"] < thresholds["ok"])
                & (fase_dados["taxa_aprovacao"] >= thresholds["risco"])
            ]
            critico = fase_dados[fase_dados["taxa_aprovacao"] < thresholds["risco"]]

            c1, c2, c3 = st.columns(3)
            c1.metric("OK", len(ok))
            c2.metric("RISCO", len(risco))
            c3.metric("CRÍTICO", len(critico))

            ranking = (
                fase_dados.sort_values("taxa_aprovacao")
                .head(10)[["nome", "taxa_aprovacao"]]
            )
            st.subheader("Ranking de objetos problemáticos")
            st.dataframe(ranking, use_container_width=True)

    with tabs[4]:
        st.subheader("Snapshot JSON")
        st.json(snapshot)
        st.subheader("Tabela completa")
        st.dataframe(fases_df, use_container_width=True)

        csv = fases_df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="Exportar CSV",
            data=csv,
            file_name="pnld_fases.csv",
            mime="text/csv",
        )


if __name__ == "__main__":
    main()
