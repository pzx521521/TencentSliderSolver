FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# gcc 仅在 quickjs 无预编译 wheel 时用于编译,装完即清理
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove gcc \
    && rm -rf /var/lib/apt/lists/*

COPY app/ /app/

# 端口可由平台注入的 PORT 环境变量覆盖(Railway/Render/Koyeb/HF Spaces 等),默认 7860
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
