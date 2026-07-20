FROM node:20-bookworm-slim

WORKDIR /app

# Dependencias de compilación necesarias para better-sqlite3 (módulo nativo).
# tzdata es necesario para que la variable TZ (ver docker-compose.yml) surta efecto de verdad
# -- sin el paquete instalado, Node no tiene de dónde leer el desfase horario de Europe/Madrid
# y la hora local se queda silenciosamente en UTC.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ ca-certificates tzdata && \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/cartera.db

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server.js"]
