# Uso de Ábaco

Guía rápida de qué hace cada pantalla. Para instalar/desplegar, mira [README.md](README.md).

Ábaco lleva dos cosas independientes bajo el mismo techo: **Cartera** (tus inversiones) y
**Economía** (tus finanzas del día a día). En ambas, la sub-pestaña **Resumen** es solo de
consulta; todo lo que se edita/añade vive en **Operaciones**.

## Dashboard (portada)

Mezcla lo esencial de Cartera y Economía en una sola pantalla: patrimonio total y su evolución,
ingresos/gastos del mes en curso, y tus mejores/peores posiciones por rentabilidad o por peso.

## Cartera

- **Resumen**: patrimonio total, curva de valor, rentabilidad por bróker, asignación por tipo de
  activo/bróker.
- **Posiciones**: se calculan solas a partir de tus operaciones (no se editan a mano). A cada una
  le asignas una **fuente de precio**: "Yahoo Finance" (automática, se actualiza sola) o "Manual"
  (lo escribes tú cuando quieras). Sin ninguna fuente, la posición se valora "al coste" — 0% de
  rentabilidad hasta que le pongas un precio.
- **Operaciones**: histórico completo, editable fila a fila. El botón "Importar CSV" (arriba)
  abre el asistente para subir un extracto de tu bróker (Trade Republic e Interactive Brokers/
  MEXEM se detectan solos; cualquier otro CSV se mapea a mano).
- **Histórico**: registra el valor total de tu cartera a mano de vez en cuando (alternativa a
  asignar fuentes de precio), o consulta la curva de "Rentabilidad automática" — esta última
  necesita que cada posición (abierta o ya vendida) tenga una fuente de precio asignada; las que
  no la tienen salen listadas para que se la pongas.

## Economía

- **Resumen**: resumen del mes (ingresos/gastos/ahorro), gasto por categoría, y la evolución mes
  a mes de todo el histórico.
- **Operaciones**: la tabla de movimientos (filtros, edición en bloque, alta manual) y, arriba,
  los menús de gestión:
  - **Cuentas**: tus cuentas bancarias, cada una con un **% de reparto** — qué parte de sus
    movimientos es realmente tuya (útil en cuentas compartidas). Puedes marcar una cuenta como
    "no genera ingresos reales" si solo recibe traspasos desde otra (p.ej. una cuenta conjunta
    que solo recibe la nómina de otra persona).
  - **Reglas**: auto-clasificación por palabra clave en la descripción (p.ej. "Mercadona" →
    Supermercado), aplicable también con retroactivo a movimientos ya guardados.
  - **Detectar traspasos**: encuentra movimientos de Economía que en realidad son dinero movido
    hacia/desde Cartera (mismo importe y fecha), para reclasificarlos como "Transferencia
    interna" y que no infle tus Ingresos/Gastos reales.
  - **Importar CSV**: igual que en Cartera, pero para tu banco (ING se detecta solo).
- **Análisis**: desglose de gastos por categoría (donut + ranking) y su evolución mensual.

## Conceptos que no son obvios

- **Bonos/T-Bills**: se importan como movimiento de caja suelto ("Otro"), no como una posición
  con cantidad — así el vencimiento no te deja una posición fantasma abierta para siempre.
- **Transferencia interna** / **Aportación de tercero**: tipos de movimiento de Economía que no
  cuentan como ingreso/gasto real (dinero que ya era tuyo o de otra persona, no una ganancia).
- **Rentabilidad automática vs. Patrimonio total**: el patrimonio total siempre incluye
  el efectivo real, se le haya asignado precio a algo o no. La curva de "Rentabilidad automática"
  (Histórico) es más exigente: solo cuenta lo que tiene fuente de precio asignada.

## Backup

Botón "Backup JSON" en la cabecera descarga todas tus operaciones, valoraciones y precios.
"Restaurar" hace el proceso inverso (sobrescribe todo lo que haya en la base de datos actual).
