FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY generate_snapshot.py /app/generate_snapshot.py

ENTRYPOINT ["python", "generate_snapshot.py"]
