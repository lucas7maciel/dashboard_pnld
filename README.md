# PNLD Dashboard (React + Containers)

Projeto profissional com **React** para visualização e **Python 3.11** para gerar o snapshot JSON. Tudo containerizado.

## Estrutura
```
pnld_dashboard/
├── generate_snapshot.py
├── generator.Dockerfile
├── requirements.txt
├── docker-compose.yml
├── out/
│   ├── snapshot.json
│   ├── schema.json
│   └── report.md
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── index.html
    └── src/
        ├── App.jsx
        ├── main.jsx
        └── styles.css
```

## Rodar via Docker (recomendado)
1) Gerar o snapshot:
```
docker compose run --rm generator
```

2) Subir o frontend:
```
docker compose up --build web
```

3) Acessar no navegador:
```
http://localhost:8501
```

## Rodar localmente (sem Docker)
### Gerar snapshot (Python 3.11)
```
py -3.11 -m pip install -r requirements.txt
py -3.11 generate_snapshot.py --input "..\Dashboard - Objetos PNLD.xlsx" --outdir ".\out"
```

### Frontend React
```
cd frontend
npm install
npm run dev
```
Abra `http://localhost:5173` no navegador.
Para o modo dev, copie o snapshot para `frontend/public/snapshot.json`:
```
copy ..\out\snapshot.json .\public\snapshot.json
```

## Observações
- O dashboard **lê apenas** `out/snapshot.json`.
- O arquivo `out/report.md` registra alertas de colunas ausentes.
