from pathlib import Path

import pandas as pd
from openpyxl import Workbook


OUTPUT_PATH = Path("mock_pnld_input.xlsx")

OBJECTS = [
    "PNLD 2026 - Objeto 01 - Obras Didaticas",
    "PNLD 2026 - Objeto 02 - Obras Literarias",
    "PNLD 2026 - Objeto 03 - Recursos Digitais",
]


def build_dados() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Objeto": OBJECTS,
            "Responsavel": ["Equipe A", "Equipe B", "Equipe C"],
        }
    )


def build_phase_sheet(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def build_status_cronograma() -> pd.DataFrame:
    columns = pd.MultiIndex.from_tuples(
        [
            ("Objeto", "Nome"),
            ("VALIDACAO DE INSCRICAO", "Status"),
            ("VALIDACAO DE INSCRICAO", "Previsao"),
            ("VALIDACAO DE INSCRICAO", "Inicio"),
            ("VALIDACAO DE INSCRICAO", "Fim"),
            ("AVALIACAO PEDAGOGICA", "Status"),
            ("AVALIACAO PEDAGOGICA", "Previsao"),
            ("AVALIACAO PEDAGOGICA", "Inicio"),
            ("AVALIACAO PEDAGOGICA", "Fim"),
            ("ANALISE DE ATRIBUTOS", "Status"),
            ("ANALISE DE ATRIBUTOS", "Previsao"),
            ("ANALISE DE ATRIBUTOS", "Inicio"),
            ("ANALISE DE ATRIBUTOS", "Fim"),
            ("ACESSIBILIDADE", "Status"),
            ("ACESSIBILIDADE", "Previsao"),
            ("ACESSIBILIDADE", "Inicio"),
            ("ACESSIBILIDADE", "Fim"),
            ("INSUMOS DE QUALIFICACAO", "Status"),
            ("INSUMOS DE QUALIFICACAO", "Previsao"),
            ("INSUMOS DE QUALIFICACAO", "Inicio"),
            ("INSUMOS DE QUALIFICACAO", "Fim"),
        ]
    )

    data = [
        [
            OBJECTS[0],
            "FINALIZADO",
            "01/02/2026 a 05/02/2026",
            "2026-02-01",
            "2026-02-05",
            "EM ANDAMENTO",
            "06/02/2026 a 10/02/2026",
            "2026-02-06",
            None,
            "SEM DADOS",
            None,
            None,
            None,
            "SEM DADOS",
            None,
            None,
            None,
            "SEM DADOS",
            None,
            None,
            None,
        ],
        [
            OBJECTS[1],
            "FINALIZADO",
            "01/02/2026 a 03/02/2026",
            "2026-02-01",
            "2026-02-03",
            "FINALIZADO",
            "04/02/2026 a 08/02/2026",
            "2026-02-04",
            "2026-02-08",
            "EM ANDAMENTO",
            "09/02/2026 a 14/02/2026",
            "2026-02-09",
            None,
            "SEM DADOS",
            None,
            None,
            None,
            "SEM DADOS",
            None,
            None,
            None,
        ],
        [
            OBJECTS[2],
            "FINALIZADO",
            "01/02/2026 a 02/02/2026",
            "2026-02-01",
            "2026-02-02",
            "FINALIZADO",
            "03/02/2026 a 04/02/2026",
            "2026-02-03",
            "2026-02-04",
            "FINALIZADO",
            "05/02/2026 a 07/02/2026",
            "2026-02-05",
            "2026-02-07",
            "FINALIZADO",
            "08/02/2026 a 10/02/2026",
            "2026-02-08",
            "2026-02-10",
            "FINALIZADO",
            "11/02/2026 a 13/02/2026",
            "2026-02-11",
            "2026-02-13",
        ],
    ]

    return pd.DataFrame(data, columns=columns)


def build_cronograma() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"Objeto": OBJECTS[0], "Atividade": "Avaliacao inicial", "Status": "Em andamento"},
            {"Objeto": OBJECTS[1], "Atividade": "Revisao tecnica", "Status": "Suspenso"},
            {"Objeto": OBJECTS[2], "Atividade": "Publicacao", "Status": "Finalizado"},
        ]
    )


def write_status_sheet(workbook: Workbook) -> None:
    ws = workbook.create_sheet("Status Cronograma")
    status_df = build_status_cronograma()

    ws.append([col[0] for col in status_df.columns])
    ws.append([col[1] for col in status_df.columns])

    for row in status_df.itertuples(index=False, name=None):
        ws.append(list(row))


def main() -> None:
    con_vi = build_phase_sheet(
        [
            {
                "Objeto": OBJECTS[0],
                "Colecoes de Entrada": 120,
                "Colecoes Aprovadas": 100,
                "Colecoes Invalidadas/Desclassificadas": 20,
                "Falhas/Diligencias": 12,
                "Volumes de Entrada": 400,
            },
            {
                "Objeto": OBJECTS[1],
                "Colecoes de Entrada": 80,
                "Colecoes Aprovadas": 60,
                "Colecoes Invalidadas/Desclassificadas": 20,
                "Falhas/Diligencias": 8,
                "Volumes de Entrada": 250,
            },
            {
                "Objeto": OBJECTS[2],
                "Colecoes de Entrada": 50,
                "Colecoes Aprovadas": 45,
                "Colecoes Invalidadas/Desclassificadas": 5,
                "Falhas/Diligencias": 3,
                "Volumes de Entrada": 140,
            },
        ]
    )

    con_atrib = build_phase_sheet(
        [
            {
                "Objeto": OBJECTS[1],
                "Colecoes de Entrada": 60,
                "Colecoes Aprovadas": 40,
                "Colecoes Invalidadas/Desclassificadas": 5,
                "Falhas/Diligencias": 10,
                "Analistas ENV": 6,
            },
            {
                "Objeto": OBJECTS[2],
                "Colecoes de Entrada": 45,
                "Colecoes Aprovadas": 38,
                "Colecoes Invalidadas/Desclassificadas": 2,
                "Falhas/Diligencias": 4,
                "Analistas ENV": 4,
            },
        ]
    )

    con_acess = build_phase_sheet(
        [
            {
                "Objeto": OBJECTS[2],
                "Colecoes de Entrada": 38,
                "Colecoes Aprovadas": 35,
                "Colecoes Invalidadas/Desclassificadas": 1,
                "Falhas/Diligencias": 2,
                "Analistas ENV": 3,
            }
        ]
    )

    con_iq = build_phase_sheet(
        [
            {
                "Objeto": OBJECTS[2],
                "Colecoes de Entrada": 35,
                "Colecoes Aprovadas": 35,
                "Colecoes Invalidadas/Desclassificadas": 0,
                "Falhas/Diligencias": 1,
                "Orcamento Estimado": 150000,
            }
        ]
    )

    with pd.ExcelWriter(OUTPUT_PATH, engine="openpyxl") as writer:
        build_dados().to_excel(writer, sheet_name="Dados", index=False)
        con_vi.to_excel(writer, sheet_name="Con_VI", index=False)
        con_atrib.to_excel(writer, sheet_name="Con_Atrib", index=False)
        con_acess.to_excel(writer, sheet_name="Con_Acess", index=False)
        con_iq.to_excel(writer, sheet_name="Con_IQ", index=False)
        build_cronograma().to_excel(writer, sheet_name="cronograma", index=False)
        write_status_sheet(writer.book)

    print(f"Mock workbook generated at {OUTPUT_PATH.resolve()}")


if __name__ == "__main__":
    main()
