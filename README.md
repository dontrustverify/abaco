# Ábaco — registro de inversiones autoalojado

App de un solo contenedor (Node + Express + SQLite) para llevar el registro de tus
inversiones (posiciones, operaciones, curva de valor, rentabilidad) y tu economía
doméstica (ingresos, gastos, reparto de cuentas). Todo se guarda en un fichero SQLite
dentro de un volumen que tú controlas — sin telemetría ni servicios externos, salvo
que actives la actualización de precios (ver más abajo).

Este README es sobre instalación. Para una guía de uso (qué hace cada pantalla), mira
[USO.md](USO.md).

## Arrancar

```bash
docker compose up -d --build
```

La app queda en `http://localhost:8080` (o la IP del host donde lo despliegues). Los
datos viven en `./data/cartera.db`, fuera del contenedor — reconstruir la imagen no
borra nada.

Para actualizar tras un cambio de código:

```bash
docker compose down && docker compose up -d --build
```

## Importar operaciones

Desde **Operaciones → Importar CSV** puedes subir el CSV de tu bróker. Trade Republic
e Interactive Brokers/MEXEM se detectan y mapean automáticamente; cualquier otro CSV
con cabecera funciona en modo genérico, asociando tú mismo cada columna. Revisa siempre
la vista previa antes de confirmar.

## Precios en vivo (opcional)

En **Posiciones** puedes asignar Yahoo Finance como fuente automática por cada
posición (acciones, ETF, cripto). Es la única llamada externa de toda la app: solo
envía el símbolo de las posiciones marcadas como automáticas, nunca cantidades ni
identidad.

## Seguridad

Sin autenticación por defecto — pensada para tu red local. Para exponerla más allá,
descomenta `APP_USER`/`APP_PASSWORD` en `docker-compose.yml`, o ponla detrás de un
reverse proxy con HTTPS.

## Backup

Botón "Backup JSON" en la cabecera descarga todas tus operaciones, valoraciones y
precios. "Restaurar" hace el proceso inverso.
