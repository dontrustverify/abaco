"use strict";

// ---------- Índice ----------
//  1. Configuración y conexión a la base de datos
//  2. Esquema: creación de tablas
//  3. Migraciones (columnas añadidas en versiones posteriores)
//  4. Datos iniciales (siembra)
//  5. App Express y autenticación opcional
//  6. API: Operaciones (Cartera)
//  7. API: Valoraciones
//  8. API: Economía doméstica
//  9. API: Cuentas (Economía)
// 10. API: Reglas de categorización (Economía)
// 11. API: Precios (precio actual manual por activo)
// 12. Yahoo Finance: precio actual
// 13. Yahoo Finance: histórico de precios (fetch + dedupe)
// 14. Yahoo Finance: conversión de divisa a EUR
// 15. API: Búsqueda de símbolo (Yahoo Finance)
// 16. API: Verificación puntual de un símbolo
// 17. API: Histórico de tipo de cambio
// 18. API: Refresco de precios (actual + histórico)
// 19. API: Backup / restore completo
// 20. Cron: actualización automática diaria
// 21. Arranque del servidor

// ---------- 1. Configuración y conexión a la base de datos ----------
const express = require("express");
const compression = require("compression");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "cartera.db");
const AUTH_USER = process.env.APP_USER;
const AUTH_PASS = process.env.APP_PASSWORD;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---------- 2. Esquema: creación de tablas ----------
db.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  broker TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  ticker TEXT,
  asset_type TEXT,
  quantity REAL,
  price REAL,
  fee REAL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  amount REAL,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS valuations (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  cashflow REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prices (
  asset_key TEXT PRIMARY KEY,
  broker TEXT,
  ticker TEXT,
  name TEXT,
  price REAL NOT NULL,
  auto_source TEXT,
  auto_symbol TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cierres diarios cacheados para las posiciones con fuente automática asignada (Yahoo Finance),
-- usados para reconstruir la curva de valor de la cartera desde el inicio sin pedir al usuario
-- que registre valoraciones manuales. Solo cubre activos con fuente asignada -- para los que no
-- la tienen, la app no inventa un histórico, lo pide en la interfaz.
CREATE TABLE IF NOT EXISTS price_history (
  asset_key TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (asset_key, date)
);

CREATE TABLE IF NOT EXISTS household_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  recurring INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cuentas bancarias de Economía (Domiciliaciones/Conjunta/Nómina...) con su % de reparto: qué
-- parte de cada movimiento de esa cuenta es realmente del usuario (p.ej. 50% en una cuenta a
-- medias con otra persona que no usa la app). household_entries.account_id (más abajo) referencia
-- esto, pero sin FK real -- igual que asset_key/ticker en el resto del esquema, no se fuerza
-- integridad referencial; borrar una cuenta simplemente desasigna sus movimientos (ver DELETE
-- /api/accounts/:id) en vez de dejarlos huérfanos apuntando a un id inexistente.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  split_pct REAL NOT NULL DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Reglas de categorización automática de Economía: si household_entries.notes contiene
-- "keyword" (subcadena, sin distinguir mayúsculas/acentos), se preselecciona esta
-- categoría/subcategoría -- al importar CSV (preview editable) o al aplicar retroactivamente
-- desde el panel de Reglas. Nunca se escribe sola sobre household_entries; la resolución entre
-- reglas que coincidan a la vez (más específica gana) vive en el cliente, no aquí.
CREATE TABLE IF NOT EXISTS category_rules (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_val_date ON valuations(date);
CREATE INDEX IF NOT EXISTS idx_price_history_key ON price_history(asset_key);
CREATE INDEX IF NOT EXISTS idx_household_date ON household_entries(date);
`);

// ---------- 3. Migraciones (columnas añadidas en versiones posteriores) ----------
// Bases de datos creadas con una versión anterior del esquema no tienen estas columnas --
// cada ALTER TABLE se intenta y se ignora en silencio si ya existe (SQLite no soporta
// "ADD COLUMN IF NOT EXISTS").
try { db.exec("ALTER TABLE prices ADD COLUMN auto_source TEXT"); } catch (e) { /* ya existe */ }
try { db.exec("ALTER TABLE prices ADD COLUMN auto_symbol TEXT"); } catch (e) { /* ya existe */ }
// Divisa nativa del símbolo (p.ej. "USD" para SPCX en Nasdaq) -- si se rellena, el precio se
// convierte a EUR con el tipo de cambio del día antes de guardarse. Vacía/NULL = sin convertir
// (comportamiento de siempre, el precio se guarda tal cual lo da la fuente).
try { db.exec("ALTER TABLE prices ADD COLUMN auto_currency TEXT"); } catch (e) { /* ya existe */ }
// Corrección manual del Tipo de una posición (Acción/ETF/Cripto/Fondo/Otro) -- el CSV
// importado no siempre lo clasifica bien (de hecho, el importador genérico lo deja siempre en
// "Otro"), y hasta ahora no había forma de arreglarlo desde la interfaz salvo editando las
// operaciones una a una. Vacío/NULL = sin override, se sigue derivando de transactions.asset_type
// como siempre.
try { db.exec("ALTER TABLE prices ADD COLUMN asset_type_override TEXT"); } catch (e) { /* ya existe */ }
// Sub-cuenta/cartera dentro del propio bróker (p.ej. Trade Republic separa "Cuenta de
// Valores", "Private Markets" y "Wallet Cripto", cada una con su propia rentabilidad) --
// texto libre en vez de una lista fija, porque cada bróker usa su propio vocabulario y no
// todos tienen este concepto (IBKR no lo necesita). Vacío/NULL = sin sub-cuenta asignada, la
// posición se sigue contando en el total del bróker como siempre, pero no en ningún desglose.
try { db.exec("ALTER TABLE prices ADD COLUMN sub_account TEXT"); } catch (e) { /* ya existe */ }
// Subcategoría separada de la categoría (p.ej. ING trae CATEGORÍA y SUBCATEGORÍA en su CSV,
// pero antes solo se guardaba una de las dos en "category") -- permite corregir en bloque
// clasificaciones erróneas del propio banco por subcategoría o descripción, sin perder ese
// segundo nivel de detalle.
try { db.exec("ALTER TABLE household_entries ADD COLUMN subcategory TEXT"); } catch (e) { /* ya existe */ }
// Cuenta bancaria del movimiento (ver tabla "accounts" más arriba) -- NULL = "Sin cuenta", que
// se trata como 100% del usuario (comportamiento de siempre, para no reinterpretar con un
// reparto que no existía las filas ya registradas antes de esta función).
try { db.exec("ALTER TABLE household_entries ADD COLUMN account_id TEXT"); } catch (e) { /* ya existe */ }
// Nombre de la persona con la que se reparte esta cuenta (p.ej. "Ana" en Domiciliaciones/
// Conjunta) -- fijo por cuenta, no por movimiento: se configura una vez desde "⚙ Cuentas" y
// cada movimiento tipo "aportacion_tercero" de esa cuenta se le atribuye automáticamente, sin
// tener que escribirlo en cada operación. NULL/vacío = cuenta sin tercero configurado.
try { db.exec("ALTER TABLE accounts ADD COLUMN third_party_name TEXT"); } catch (e) { /* ya existe */ }
// 1 (por defecto, para no cambiar el comportamiento de cuentas ya existentes) = los "ingreso" de
// esta cuenta cuentan como ingreso real. 0 = esta cuenta no genera ingresos propios (p.ej.
// Domiciliaciones/Conjunta, que solo reciben traspasos desde Nómina) -- el importador CSV
// preselecciona "Transferencia interna" en vez de "Ingreso" para sus abonos, aunque el usuario
// puede corregirlo fila a fila igual que cualquier otra preselección (ver findAportacionTerceroMatch).
try { db.exec("ALTER TABLE accounts ADD COLUMN income_source INTEGER DEFAULT 1"); } catch (e) { /* ya existe */ }
// Modo de coincidencia de una regla de categorización: 'contains' (por defecto, comportamiento
// de siempre) = subcadena en cualquier punto de la descripción, así que "DIGI" también
// coincidiría con "DIGITAL". 'word' = solo si aparece como palabra/frase completa (con límites
// de palabra a los dos lados), para poder distinguir "DIGI" de "DIGITAL" cuando el usuario
// quiere justo eso. Se guarda por regla, no globalmente, porque cada palabra clave puede
// necesitar un criterio distinto.
try { db.exec("ALTER TABLE category_rules ADD COLUMN match_type TEXT DEFAULT 'contains'"); } catch (e) { /* ya existe */ }

// ---------- 4. Datos iniciales (siembra) ----------
// Siembra inicial de las 3 cuentas del usuario -- solo la primera vez que arranca con esta
// función (tabla "accounts" vacía). Si el usuario borra alguna después, no se vuelve a crear
// (el chequeo es "¿hay CERO cuentas?", no "¿faltan estas 3 en concreto?").
if (db.prepare("SELECT COUNT(*) c FROM accounts").get().c === 0) {
  const seedAccount = db.prepare("INSERT INTO accounts (id,name,split_pct) VALUES (?,?,?)");
  seedAccount.run(crypto.randomUUID(), "Domiciliaciones", 50);
  seedAccount.run(crypto.randomUUID(), "Conjunta", 50);
  seedAccount.run(crypto.randomUUID(), "Nómina", 100);
}

// ---------- 5. App Express y autenticación opcional ----------
const app = express();
// Comprime tanto las respuestas JSON de /api/* como los estáticos servidos más abajo -- el
// histórico de precios (/api/prices/history) es el caso extremo: crece sin límite con el uso
// normal (cada "Actualizar precios e histórico" añade filas) y ya pesa varios cientos de KB en
// una cartera con historial largo; comprimido baja a un 13% de su tamaño.
app.use(compression());
app.use(express.json({ limit: "15mb" }));

// Autenticación básica opcional -- se activa poniendo las variables de entorno
// APP_USER + APP_PASSWORD (ver docker-compose.yml); sin ellas, la app queda abierta.
if (AUTH_USER && AUTH_PASS) {
  app.use((req, res, next) => {
    const hdr = req.headers.authorization || "";
    if (hdr.startsWith("Basic ")) {
      const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === AUTH_USER && p === AUTH_PASS) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Ábaco"');
    res.status(401).send("Autenticacion requerida");
  });
}

function uid() {
  return crypto.randomUUID();
}

// ---------- 6. API: Operaciones (Cartera) ----------
app.get("/api/transactions", (req, res) => {
  const rows = db.prepare("SELECT * FROM transactions ORDER BY date DESC, created_at DESC").all();
  res.json(rows);
});

// Upsert por id -- mismo patrón que POST /api/accounts, /api/prices y /api/valuations: si no
// llega id, se crea una operación nueva; si llega el id de una ya existente, se actualiza en el
// sitio. Antes solo se podía borrar una operación mal importada y crearla de cero a mano para
// corregirla (p.ej. ajustar cantidad/precio tras un split) -- ahora se puede editar directamente.
app.post("/api/transactions", (req, res) => {
  const t = req.body || {};
  if (!t.broker || !t.date || !t.type) {
    return res.status(400).json({ error: "broker, date y type son obligatorios" });
  }
  const row = {
    id: t.id || uid(),
    broker: String(t.broker).trim(),
    date: t.date,
    type: t.type,
    name: t.name || null,
    ticker: t.ticker || null,
    asset_type: t.asset_type || null,
    quantity: t.quantity != null ? Number(t.quantity) : null,
    price: t.price != null ? Number(t.price) : null,
    fee: t.fee != null ? Number(t.fee) : 0,
    currency: t.currency || "EUR",
    amount: t.amount != null ? Number(t.amount) : null,
    notes: t.notes || null,
    source: t.source || "manual"
  };
  db.prepare(`INSERT INTO transactions
    (id,broker,date,type,name,ticker,asset_type,quantity,price,fee,currency,amount,notes,source)
    VALUES (@id,@broker,@date,@type,@name,@ticker,@asset_type,@quantity,@price,@fee,@currency,@amount,@notes,@source)
    ON CONFLICT(id) DO UPDATE SET broker=excluded.broker, date=excluded.date, type=excluded.type,
      name=excluded.name, ticker=excluded.ticker, asset_type=excluded.asset_type,
      quantity=excluded.quantity, price=excluded.price, fee=excluded.fee, currency=excluded.currency,
      amount=excluded.amount, notes=excluded.notes, source=excluded.source`
  ).run(row);
  res.status(201).json(row);
});

app.post("/api/transactions/bulk", (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: "Se esperaba un array de operaciones" });

  const insert = db.prepare(`INSERT INTO transactions
    (id,broker,date,type,name,ticker,asset_type,quantity,price,fee,currency,amount,notes,source)
    VALUES (@id,@broker,@date,@type,@name,@ticker,@asset_type,@quantity,@price,@fee,@currency,@amount,@notes,@source)`);

  let inserted = 0;
  const errors = [];
  const runAll = db.transaction((items) => {
    items.forEach((t, i) => {
      if (!t.broker || !t.date || !t.type) {
        errors.push({ index: i, error: "broker, date y type son obligatorios" });
        return;
      }
      insert.run({
        id: uid(),
        broker: String(t.broker).trim(),
        date: t.date,
        type: t.type,
        name: t.name || null,
        ticker: t.ticker || null,
        asset_type: t.asset_type || null,
        quantity: t.quantity != null ? Number(t.quantity) : null,
        price: t.price != null ? Number(t.price) : null,
        fee: t.fee != null ? Number(t.fee) : 0,
        currency: t.currency || "EUR",
        amount: t.amount != null ? Number(t.amount) : null,
        notes: t.notes || null,
        source: t.source || "import"
      });
      inserted++;
    });
  });
  runAll(rows);
  res.json({ inserted, skipped: errors.length, errors });
});

app.delete("/api/transactions/:id", (req, res) => {
  db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Borrado en bloque de un conjunto de ids concreto -- mismo patrón que
// /api/household/bulk-delete, pensado para deshacer una importación de CSV desastrosa (p.ej.
// mapeo de columnas equivocado) filtrando por bróker en la interfaz y borrando solo esas filas,
// sin perder el resto del histórico de operaciones.
app.post("/api/transactions/bulk-delete", (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: "Se esperaba un array de ids" });
  const stmt = db.prepare("DELETE FROM transactions WHERE id = ?");
  const runAll = db.transaction((idList) => { idList.forEach((id) => stmt.run(id)); });
  runAll(ids);
  res.json({ deleted: ids.length });
});

// ---------- 7. API: Valoraciones ----------
app.get("/api/valuations", (req, res) => {
  res.json(db.prepare("SELECT * FROM valuations ORDER BY date ASC").all());
});

// Upsert por id -- mismo patrón que POST /api/accounts y POST /api/prices: si no llega id, se
// crea una valoración nueva; si llega el id de una ya existente, se actualiza en el sitio. Antes
// solo se podía borrar una valoración mal introducida y volver a crearla; ahora se puede corregir
// directamente desde la tabla.
app.post("/api/valuations", (req, res) => {
  const v = req.body || {};
  if (!v.date || v.value == null) return res.status(400).json({ error: "date y value son obligatorios" });
  const row = { id: v.id || uid(), date: v.date, value: Number(v.value), cashflow: Number(v.cashflow) || 0, notes: v.notes || null };
  db.prepare(`INSERT INTO valuations (id,date,value,cashflow,notes) VALUES (@id,@date,@value,@cashflow,@notes)
    ON CONFLICT(id) DO UPDATE SET date=excluded.date, value=excluded.value, cashflow=excluded.cashflow, notes=excluded.notes`
  ).run(row);
  res.status(201).json(row);
});

app.delete("/api/valuations/:id", (req, res) => {
  db.prepare("DELETE FROM valuations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- 8. API: Economía doméstica ----------
// Ingresos/gastos del día a día, independiente de las operaciones de Cartera.
// "transferencia" (movimiento interno entre cuentas propias, p.ej. Nómina -> Domiciliaciones)
// se añadió junto a ingreso/gasto -- el cliente la excluye de los totales de Ingresos/Gastos/
// Ahorro (igual que Cartera separa ingreso/retirada de compra/venta), pero sigue siendo una
// fila normal de household_entries a todos los efectos de guardado/borrado/importación.
// "aportacion_tercero": dinero que otra persona ingresa en una cuenta compartida (Domicilia-
// ciones/Conjunta) para pagar su parte de los gastos a medias -- NO es ingreso del usuario, así
// que el cliente lo excluye de los totales exactamente igual que "transferencia", pero se
// muestra aparte como dato informativo (ver computeHouseholdByAccountForMonth).
const HOUSEHOLD_TYPES = ["ingreso", "gasto", "transferencia", "aportacion_tercero"];

app.get("/api/household", (req, res) => {
  res.json(db.prepare("SELECT * FROM household_entries ORDER BY date DESC, created_at DESC").all());
});

app.post("/api/household", (req, res) => {
  const h = req.body || {};
  if (!h.type || !h.category || h.amount == null || !h.date) {
    return res.status(400).json({ error: "type, category, amount y date son obligatorios" });
  }
  if (HOUSEHOLD_TYPES.indexOf(h.type) === -1) {
    return res.status(400).json({ error: "type debe ser 'ingreso', 'gasto', 'transferencia' o 'aportacion_tercero'" });
  }
  const row = {
    id: uid(),
    type: h.type,
    category: String(h.category).trim(),
    subcategory: h.subcategory ? String(h.subcategory).trim() : null,
    amount: Math.abs(Number(h.amount)) || 0,
    date: h.date,
    recurring: h.recurring ? 1 : 0,
    notes: h.notes || null,
    account_id: h.account_id || null
  };
  db.prepare(`INSERT INTO household_entries (id,type,category,subcategory,amount,date,recurring,notes,account_id)
    VALUES (@id,@type,@category,@subcategory,@amount,@date,@recurring,@notes,@account_id)`
  ).run(row);
  res.status(201).json(row);
});

app.delete("/api/household/:id", (req, res) => {
  db.prepare("DELETE FROM household_entries WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

app.post("/api/household/bulk", (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: "Se esperaba un array de movimientos" });

  const insert = db.prepare(`INSERT INTO household_entries (id,type,category,subcategory,amount,date,recurring,notes,account_id)
    VALUES (@id,@type,@category,@subcategory,@amount,@date,@recurring,@notes,@account_id)`);

  let inserted = 0;
  const errors = [];
  const runAll = db.transaction((items) => {
    items.forEach((h, i) => {
      if (!h.type || !h.category || h.amount == null || !h.date || HOUSEHOLD_TYPES.indexOf(h.type) === -1) {
        errors.push({ index: i, error: "type ('ingreso'/'gasto'/'transferencia'/'aportacion_tercero'), category, amount y date son obligatorios" });
        return;
      }
      insert.run({
        id: uid(), type: h.type, category: String(h.category).trim(),
        subcategory: h.subcategory ? String(h.subcategory).trim() : null,
        amount: Math.abs(Number(h.amount)) || 0, date: h.date,
        recurring: h.recurring ? 1 : 0, notes: h.notes || null,
        account_id: h.account_id || null
      });
      inserted++;
    });
  });
  runAll(rows);
  res.json({ inserted, skipped: errors.length, errors });
});

// Reclasificación en bloque -- pensada para corregir categorías mal asignadas por el propio
// banco al importar (p.ej. ING categorizando un recibo del IBI como "Educación"): el cliente
// filtra en memoria por categoría/subcategoría/descripción actuales y manda aquí solo los ids
// que quiere corregir + el/los campo(s) nuevo(s). Se deja sin tocar el campo que no se mande
// (para poder cambiar solo category o solo subcategory sin pisar el otro), a diferencia de
// POST /api/household que siempre espera el objeto completo.
app.post("/api/household/bulk-update", (req, res) => {
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: "Se esperaba un array de ids" });
  // "!== undefined" (no "!= null"): subcategory admite null explícito para poder BORRARLA
  // (el cliente lo manda así al vaciar el campo en la edición por fila) -- con "!= null" un
  // null explícito se confundía con "campo no enviado" y el borrado no llegaba a aplicarse.
  // category no admite null (la columna es NOT NULL), así que ahí sí se descarta.
  const hasCategory = body.category !== undefined && body.category !== null;
  const hasSubcategory = body.subcategory !== undefined;
  // account_id sigue el mismo criterio que subcategory: "undefined" = no tocar, "null" explícito
  // = desasignar cuenta (pasa a "Sin cuenta" = 100%) -- usado tanto por la reasignación en bloque
  // desde "Todas las operaciones" como por DELETE /api/accounts/:id al borrar una cuenta.
  const hasAccount = body.account_id !== undefined;
  // type no admite null (la columna es NOT NULL, igual que category) -- se usa desde "Detectar
  // traspasos" para reclasificar en bloque gastos que en realidad son transferencias hacia el
  // bróker (ver detectPortfolioTransfers en el cliente).
  const hasType = body.type !== undefined && body.type !== null;
  // notes sigue el mismo criterio que subcategory: "undefined" = no tocar, "null"/vacío = borrar
  // la descripción -- usado por la edición en línea de la columna Descripción en "Todas las
  // operaciones" (antes solo de lectura).
  const hasNotes = body.notes !== undefined;
  if (!hasCategory && !hasSubcategory && !hasAccount && !hasType && !hasNotes) {
    return res.status(400).json({ error: "Indica al menos category, subcategory, account_id, type o notes" });
  }
  const sets = [];
  const params = {};
  if (hasCategory) {
    const cat = String(body.category).trim();
    if (!cat) return res.status(400).json({ error: "category no puede quedar vacía" });
    sets.push("category = @category");
    params.category = cat;
  }
  if (hasSubcategory) {
    sets.push("subcategory = @subcategory");
    params.subcategory = body.subcategory == null ? null : (String(body.subcategory).trim() || null);
  }
  if (hasAccount) {
    sets.push("account_id = @account_id");
    params.account_id = body.account_id == null ? null : String(body.account_id).trim();
  }
  if (hasType) {
    if (HOUSEHOLD_TYPES.indexOf(body.type) === -1) {
      return res.status(400).json({ error: "type debe ser 'ingreso', 'gasto', 'transferencia' o 'aportacion_tercero'" });
    }
    sets.push("type = @type");
    params.type = body.type;
  }
  if (hasNotes) {
    sets.push("notes = @notes");
    params.notes = body.notes == null ? null : (String(body.notes).trim() || null);
  }
  const stmt = db.prepare(`UPDATE household_entries SET ${sets.join(", ")} WHERE id = @id`);
  const runAll = db.transaction((idList) => {
    idList.forEach((id) => stmt.run(Object.assign({}, params, { id })));
  });
  runAll(ids);
  res.json({ updated: ids.length });
});

// Borrado en bloque de un conjunto de ids concreto -- usado por "Eliminar filtrados" en la
// interfaz (deshacer una importación errónea sin perder el resto del histórico), a diferencia
// del DELETE /api/household de abajo, que vacía la tabla entera.
app.post("/api/household/bulk-delete", (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: "Se esperaba un array de ids" });
  const stmt = db.prepare("DELETE FROM household_entries WHERE id = ?");
  const runAll = db.transaction((idList) => { idList.forEach((id) => stmt.run(id)); });
  runAll(ids);
  res.json({ deleted: ids.length });
});

// Vacía TODA la tabla de Economía doméstica -- pensado para deshacer una importación
// desastrosa de golpe (p.ej. CSV con el mapeo de columnas equivocado) y volver a intentarlo.
// No toca ninguna otra tabla (transactions, valuations, prices...).
app.delete("/api/household", (req, res) => {
  db.prepare("DELETE FROM household_entries").run();
  res.status(204).end();
});

// ---------- 9. API: Cuentas (Economía) ----------
// Cuentas bancarias de Economía (Domiciliaciones/Conjunta/Nómina...).
app.get("/api/accounts", (req, res) => {
  res.json(db.prepare("SELECT * FROM accounts ORDER BY name").all());
});

// Upsert por id -- mismo patrón que POST /api/prices: si no llega id, se genera una cuenta
// nueva; si llega el id de una cuenta existente, se actualiza en el sitio (permite editar
// nombre/% desde el mismo formulario que crea cuentas nuevas).
app.post("/api/accounts", (req, res) => {
  const a = req.body || {};
  if (!a.name || a.split_pct == null) return res.status(400).json({ error: "name y split_pct son obligatorios" });
  const row = {
    id: a.id || uid(), name: String(a.name).trim(), split_pct: Number(a.split_pct),
    third_party_name: a.third_party_name ? String(a.third_party_name).trim() || null : null,
    income_source: a.income_source === false || a.income_source === 0 ? 0 : 1
  };
  if (!row.name) return res.status(400).json({ error: "name no puede quedar vacío" });
  if (!Number.isFinite(row.split_pct) || row.split_pct < 0 || row.split_pct > 100) {
    return res.status(400).json({ error: "split_pct debe ser un número entre 0 y 100" });
  }
  db.prepare(`INSERT INTO accounts (id,name,split_pct,third_party_name,income_source) VALUES (@id,@name,@split_pct,@third_party_name,@income_source)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, split_pct=excluded.split_pct, third_party_name=excluded.third_party_name, income_source=excluded.income_source`
  ).run(row);
  res.json(db.prepare("SELECT * FROM accounts WHERE id = ?").get(row.id));
});

// Borrar una cuenta NO borra sus movimientos -- los desasigna primero (misma semántica que
// "Sin cuenta" = 100%), para no perder histórico de Economía solo por reorganizar cuentas.
app.delete("/api/accounts/:id", (req, res) => {
  const id = req.params.id;
  const runAll = db.transaction(() => {
    db.prepare("UPDATE household_entries SET account_id = NULL WHERE account_id = ?").run(id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  });
  runAll();
  res.status(204).end();
});

// ---------- 10. API: Reglas de categorización (Economía) ----------
// "contains"/"word"/"starts_with"/"ends_with" son variantes de coincidencia POSITIVA (con qué
// texto cuenta como encontrado); "not_contains" es la única negativa -- una regla así solo se usa
// como respaldo cuando ninguna regla positiva coincide en la misma operación (ver
// findCategoryRuleMatch en el cliente, que es quien decide cuál gana si hay varias). "keyword"
// puede traer varias palabras separadas por comas (sinónimos); toda la lógica de esa parte vive
// en el cliente, aquí solo se guarda el texto tal cual.
const CATEGORY_RULE_MATCH_TYPES = ["contains", "not_contains", "word", "starts_with", "ends_with"];

app.get("/api/category-rules", (req, res) => {
  res.json(db.prepare("SELECT * FROM category_rules ORDER BY keyword").all());
});

app.post("/api/category-rules", (req, res) => {
  const r = req.body || {};
  const keyword = String(r.keyword || "").trim();
  const category = String(r.category || "").trim();
  if (!keyword || !category) return res.status(400).json({ error: "keyword y category son obligatorios" });
  const row = {
    id: r.id || uid(), keyword, category,
    subcategory: r.subcategory ? String(r.subcategory).trim() || null : null,
    match_type: CATEGORY_RULE_MATCH_TYPES.indexOf(r.match_type) >= 0 ? r.match_type : "contains"
  };
  db.prepare(`INSERT INTO category_rules (id,keyword,category,subcategory,match_type) VALUES (@id,@keyword,@category,@subcategory,@match_type)
    ON CONFLICT(id) DO UPDATE SET keyword=excluded.keyword, category=excluded.category, subcategory=excluded.subcategory, match_type=excluded.match_type`
  ).run(row);
  res.json(db.prepare("SELECT * FROM category_rules WHERE id = ?").get(row.id));
});

app.delete("/api/category-rules/:id", (req, res) => {
  db.prepare("DELETE FROM category_rules WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- 11. API: Precios (precio actual manual por activo) ----------
app.get("/api/prices", (req, res) => {
  res.json(db.prepare("SELECT * FROM prices").all());
});

app.post("/api/prices", (req, res) => {
  const p = req.body || {};
  if (!p.asset_key || p.price == null) return res.status(400).json({ error: "asset_key y price son obligatorios" });
  const row = {
    asset_key: p.asset_key,
    broker: p.broker || null,
    ticker: p.ticker || null,
    name: p.name || null,
    price: Number(p.price),
    auto_source: p.auto_source || null,
    auto_symbol: p.auto_symbol || null,
    auto_currency: p.auto_currency || null,
    asset_type_override: p.asset_type_override || null,
    sub_account: p.sub_account || null
  };
  // Si cambia el símbolo o la divisa de conversión, el histórico ya descargado con los valores
  // ANTERIORES deja de corresponder a esta posición -- se borra para forzar una redescarga limpia
  // (ver "Actualizar precios e histórico"/"Calcular / actualizar histórico"). Sin esto, fechas que
  // la redescarga no vuelva a cubrir se quedan contaminadas con el símbolo/divisa viejo para
  // siempre, distorsionando la curva de rentabilidad en silencio aunque el precio de hoy esté bien.
  const existing = db.prepare("SELECT auto_symbol, auto_currency FROM prices WHERE asset_key = ?").get(p.asset_key);
  const staleHistory = existing && (
    (existing.auto_symbol || null) !== row.auto_symbol || (existing.auto_currency || null) !== row.auto_currency
  );
  const runAll = db.transaction(() => {
    if (staleHistory) db.prepare("DELETE FROM price_history WHERE asset_key = ?").run(p.asset_key);
    db.prepare(`INSERT INTO prices (asset_key,broker,ticker,name,price,auto_source,auto_symbol,auto_currency,asset_type_override,sub_account,updated_at)
      VALUES (@asset_key,@broker,@ticker,@name,@price,@auto_source,@auto_symbol,@auto_currency,@asset_type_override,@sub_account,datetime('now'))
      ON CONFLICT(asset_key) DO UPDATE SET price=excluded.price, auto_source=excluded.auto_source, auto_symbol=excluded.auto_symbol, auto_currency=excluded.auto_currency, asset_type_override=excluded.asset_type_override, sub_account=excluded.sub_account, updated_at=datetime('now')`
    ).run(row);
  });
  runAll();
  res.json(db.prepare("SELECT * FROM prices WHERE asset_key = ?").get(p.asset_key));
});

// ---------- 12. Yahoo Finance: precio actual ----------
// Solo consulta Yahoo Finance para las posiciones a las que el usuario haya asignado
// explícitamente auto_source + auto_symbol (acciones/ETF/índices/cripto, símbolo tal como lo
// usa Yahoo, p.ej. AAPL, VWCE.DE, DOT-USD). Es gratuita y no requiere API key.
async function fetchYahooPrice(symbol) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; abaco-app/1.0)" }
  });
  if (!r.ok) throw new Error("Yahoo Finance respondió " + r.status);
  const data = await r.json();
  const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  const price = meta ? meta.regularMarketPrice : null;
  if (!Number.isFinite(price)) throw new Error("Símbolo no encontrado en Yahoo Finance: " + symbol);
  // La divisa viene en el mismo meta -- se usa para que el usuario compruebe que ha elegido
  // el mercado correcto (p.ej. Xetra en EUR frente a Nasdaq en USD para el mismo valor).
  return { price, currency: meta.currency || null };
}

// ---------- 13. Yahoo Finance: histórico de precios (fetch + dedupe) ----------
// Para la curva de rentabilidad automática. Devuelve un cierre por día como máximo -- si la fuente da más de un punto el mismo día
// (no debería, pedimos intervalo diario) nos quedamos con el último.
// OJO: el isFinite() global hace coerción de tipos y considera "finito" un close null
// (Number(null) === 0) -- con símbolos reales que sí tienen buen histórico (comprobado con
// SXR8.DE, 1147 puntos) es habitual que algún día concreto venga con close null (hueco de
// datos de Yahoo), y colaba un NULL hasta la tabla, donde price_history.close es NOT NULL --
// esto hacía fallar la transacción entera de inserción para ese activo, sin ningún aviso claro
// sobre la causa real. Number.isFinite() no hace coerción, así que sí descarta null/undefined.
function dedupDaily(points) {
  const byDate = {};
  points.forEach((p) => { if (p.date && Number.isFinite(p.close)) byDate[p.date] = p.close; });
  return Object.keys(byDate).sort().map((date) => ({ date, close: byDate[date] }));
}

// period1/period2 explícitos (en vez de range=max) porque Yahoo reduce la granularidad a
// mensual en rangos largos aunque se pida interval=1d -- con fechas concretas sí devuelve
// un cierre por día de mercado (probado: range=max daba ~170 puntos en 40 años, period1/
// period2 acotado a los últimos 3 años dio ~750, uno por día hábil).
async function fetchYahooHistory(symbol, sinceDate) {
  // Si no llega "since" (no debería, el cliente lo manda siempre a partir de la primera
  // operación de cada activo), acotamos a 10 años en vez de época 0 -- si no, un símbolo
  // veterano como AAPL devuelve miles de puntos de sobra sin ningún uso.
  const tenYearsAgo = Math.floor(Date.now() / 1000) - 10 * 365 * 86400;
  const period1 = sinceDate ? Math.floor(new Date(sinceDate + "T00:00:00Z").getTime() / 1000) - 86400 : tenYearsAgo;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) +
    "?period1=" + period1 + "&period2=" + period2 + "&interval=1d";
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; abaco-app/1.0)" }
  });
  if (!r.ok) throw new Error("Yahoo Finance respondió " + r.status);
  const data = await r.json();
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  const ts = result && result.timestamp;
  const closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
  if (!ts || !closes) throw new Error("Sin datos históricos de Yahoo Finance para " + symbol);
  const points = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }));
  return dedupDaily(points);
}

// ---------- 14. Yahoo Finance: conversión de divisa a EUR ----------
// P.ej. SPCX/AAPL en USD, comprado desde un bróker que solo opera en euros -- opt-in por
// posición vía auto_currency. Yahoo Finance también
// publica pares de cambio con el mismo formato que cualquier símbolo bursátil (p.ej.
// "USDEUR=X"), así que se reutilizan fetchYahooPrice/fetchYahooHistory tal cual en vez de
// depender de un proveedor de FX aparte.
const fxRateCache = new Map(); // currency -> { rate, ts }
const FX_RATE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchFxRateToEur(currencyCode) {
  if (!currencyCode || currencyCode === "EUR") return 1;
  const cached = fxRateCache.get(currencyCode);
  if (cached && (Date.now() - cached.ts) < FX_RATE_CACHE_TTL_MS) return cached.rate;
  const { price } = await fetchYahooPrice(currencyCode + "EUR=X");
  fxRateCache.set(currencyCode, { rate: price, ts: Date.now() });
  return price;
}

async function convertToEur(rawPrice, currencyCode) {
  const rate = await fetchFxRateToEur(currencyCode);
  return rawPrice * rate;
}

// Histórico de tipo de cambio para convertir la curva de precios día a día (no solo el precio
// actual) -- se cachea por proceso, ya varias posiciones en la misma divisa (p.ej. varias
// acciones USD) reutilizan el mismo histórico de cambio en vez de pedirlo una vez por fila.
const fxHistoryCache = new Map(); // "currency|since" -> Promise<points[]>

function fetchFxHistoryToEur(currencyCode, sinceDate) {
  if (!currencyCode || currencyCode === "EUR") return Promise.resolve(null);
  const cacheKey = currencyCode + "|" + (sinceDate || "");
  if (!fxHistoryCache.has(cacheKey)) {
    fxHistoryCache.set(cacheKey, fetchYahooHistory(currencyCode + "EUR=X", sinceDate));
  }
  return fxHistoryCache.get(cacheKey);
}

// points y fxPoints vienen ordenados por fecha ascendente (dedupDaily los ordena) -- avance en
// paralelo en vez de buscar cada fecha desde cero. Usa el tipo de cambio del último día
// conocido hasta esa fecha (fin de semana/festivo del mercado de divisas vs. del bursátil).
function convertPointsToEur(points, fxPoints) {
  if (!fxPoints || fxPoints.length === 0) return points;
  let fi = 0;
  return points.map((p) => {
    while (fi + 1 < fxPoints.length && fxPoints[fi + 1].date <= p.date) fi++;
    const rate = fxPoints[fi].close;
    return { date: p.date, close: p.close * rate };
  });
}


// ---------- 15. API: Búsqueda de símbolo (Yahoo Finance) ----------
// Yahoo devuelve 0 resultados en cuanto la consulta se parece al nombre completo real de un
// fondo ("Core S&P 500 USD", "iShares Core MSCI Emerging Markets IMI") en vez de degradar a
// menos coincidencias -- comprobado: "Core S&P 500 USD" da 0, pero quitando solo "USD" ya
// aparece SXR8.DE; "iShares Core MSCI Emerging Markets IMI" da 0, pero "iShares Core" ya
// devuelve IEMG. Como el buscador se rellena por defecto con el nombre tal cual viene del CSV
// del bróker (a menudo con divisa/sufijo/ISIN incluidos), esto hacía fallar la búsqueda para
// fondos enteros aunque sí coticen y el usuario escribiera el nombre correcto. Se generan
// variantes cada vez más cortas y se prueban en orden hasta que alguna dé resultados.
const SEARCH_NOISE_WORDS = /\b(UCITS|ETF|ETC|ETN|ETP|FUND|ACC|ACCUM|ACCUMULATING|DIST|DISTRIBUTING|INC|SHARES|CLASS|USD|EUR|GBP|CHF|JPY|IMI)\b/gi;
const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/gi;

function buildSearchCandidates(rawQuery) {
  var q = rawQuery.trim();
  var candidates = [q];
  var cleaned = q
    .replace(/\([^)]*\)/g, " ")
    .replace(ISIN_PATTERN, " ")
    .replace(SEARCH_NOISE_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && cleaned.toLowerCase() !== q.toLowerCase()) candidates.push(cleaned);
  var words = cleaned.split(" ").filter(Boolean);
  for (var n = words.length - 1; n >= 2; n--) {
    candidates.push(words.slice(0, n).join(" "));
  }
  var seen = {};
  return candidates.filter(function (c) {
    if (!c || seen[c.toLowerCase()]) return false;
    seen[c.toLowerCase()] = true;
    return true;
  });
}

// Búsqueda de símbolo en Yahoo Finance por ISIN o nombre -- para que el usuario elija entre
// coincidencias reales en vez de que la app adivine un sufijo de mercado a ciegas (probado:
// adivinar sufijos como .DE puede devolver un instrumento totalmente distinto sin avisar).
// region=DE&lang=de-DE sesga los resultados hacia las bolsas alemanas (Xetra/Fráncfort/
// Stuttgart), que suelen ser donde brókers como Trade Republic cotizan en euros valores que
// no son alemanes (comprobado con Novo Nordisk: sin este sesgo no aparecía su cotización en
// euros de Xetra, solo la de Copenhague en coronas).
app.get("/api/yahoo-search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Falta el parámetro q" });
  try {
    // No basta con parar en el primer candidato que dé ALGÚN resultado -- comprobado con
    // "iShares Core MSCI Emerging Markets IMI": quitar solo "IMI" ya da 1 resultado, pero es
    // un listado raro (un wrapper cripto tokenizado), y para ahí antes de llegar a "iShares
    // Core" (7 resultados, los ETF reales). Se exige un mínimo de 3 coincidencias para aceptar
    // un candidato como bueno; si ninguno lo alcanza, se usa el que más haya dado.
    const MIN_GOOD_RESULTS = 3;
    let results = [];
    let usedQuery = q;
    let bestResults = [];
    let bestQuery = q;
    for (const candidate of buildSearchCandidates(q)) {
      const url = "https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(candidate) + "&quotesCount=10&newsCount=0&lang=de-DE&region=DE";
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; abaco-app/1.0)" }
      });
      if (!r.ok) throw new Error("Yahoo Finance respondió " + r.status);
      const data = await r.json();
      const filtered = (data.quotes || [])
        .filter((x) => x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF" || x.quoteType === "CRYPTOCURRENCY" || x.quoteType === "MUTUALFUND" || x.quoteType === "INDEX"))
        .map((x) => ({
          symbol: x.symbol,
          name: x.longname || x.shortname || x.symbol,
          exchange: x.exchDisp || x.exchange || "",
          type: x.typeDisp || x.quoteType || ""
        }));
      if (filtered.length > bestResults.length) { bestResults = filtered; bestQuery = candidate; }
      if (filtered.length >= MIN_GOOD_RESULTS) { results = filtered; usedQuery = candidate; break; }
    }
    if (results.length === 0) { results = bestResults; usedQuery = bestQuery; }

    // La búsqueda de /v1/finance/search no incluye divisa -- se completa cada resultado con
    // una consulta aparte a /v8/finance/chart (mismo endpoint que fetchYahooPrice), para que
    // el usuario vea precio y divisa reales antes de asignar el símbolo (p.ej. distinguir el
    // mismo valor cotizando en EUR en Xetra frente a USD en Nasdaq).
    await Promise.all(results.map(async (item) => {
      try {
        const { price, currency } = await fetchYahooPrice(item.symbol);
        item.price = price;
        item.currency = currency;
      } catch (e) {
        item.price = null;
        item.currency = null;
      }
    }));

    res.json({ results, query: usedQuery, originalQuery: q });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- 16. API: Verificación puntual de un símbolo ----------
// Verificación puntual de un símbolo ya elegido (o tecleado a mano) contra Yahoo Finance, sin
// guardar nada -- para comprobar antes de asignarlo que el precio y la divisa que devuelve son
// los esperados (usado tanto en Posiciones como en el aviso de activos sin fuente de Histórico).
// convert=<código de divisa>: opcional -- si se manda (p.ej. "USD" para un símbolo en dólares
// como SPCX), la respuesta añade eurPrice/fxRate para que se pueda confirmar el valor
// convertido antes de guardar la fuente, no solo el precio en su divisa original.
app.get("/api/price-check", async (req, res) => {
  const source = req.query.source;
  const symbol = (req.query.symbol || "").trim();
  const convert = (req.query.convert || "").trim();
  if (!source || !symbol) return res.status(400).json({ error: "Faltan los parámetros source y symbol" });
  if (source !== "yahoo") return res.status(400).json({ error: "Fuente desconocida: " + source });
  try {
    const { price, currency } = await fetchYahooPrice(symbol);
    const result = { price, currency };
    if (convert && convert !== "EUR") {
      const fxRate = await fetchFxRateToEur(convert);
      result.eurPrice = price * fxRate;
      result.fxRate = fxRate;
    }
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- 17. API: Histórico de tipo de cambio ----------
// Hacia EUR para una divisa -- reexpone fetchFxHistoryToEur (ya
// usada internamente para convertir la curva de precios histórica) para que el cliente pueda
// reconstruir la rentabilidad de una posición en su divisa nativa a partir del precio/comisión
// ya guardados en EUR: basta con dividir por el tipo de cambio de la fecha de cada operación
// (ver "Rentabilidad en divisa nativa" en Posiciones, app.js). Sin "since" -- se apoya en el
// mismo caché de 10 años que ya usa el histórico de precios, así que pedir la misma divisa dos
// veces (p.ej. varias posiciones en USD) no dispara una segunda consulta a Yahoo.
app.get("/api/fx-history", async (req, res) => {
  const currency = (req.query.currency || "").trim().toUpperCase();
  if (!currency || currency === "EUR") return res.status(400).json({ error: "Falta el parámetro currency (código de divisa distinto de EUR)" });
  try {
    const points = await fetchFxHistoryToEur(currency, null);
    res.json({ currency, points: points || [] });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- 18. API: Refresco de precios (actual + histórico) ----------
// Extraído de la ruta para poder llamarlo también desde el cron diario y desde el botón
// combinado de Cartera > Resumen, no solo desde el botón de Posiciones.
async function refreshCurrentPrices() {
  // El filtro por auto_source="yahoo" es defensivo: descarta en silencio filas antiguas que
  // quedaran con "stooq"/"coingecko" de antes de retirar esas fuentes, en vez de intentar
  // consultarlas contra un proveedor que ya no existe en el código.
  const rows = db.prepare("SELECT * FROM prices WHERE auto_source = 'yahoo' AND auto_symbol IS NOT NULL AND auto_symbol != ''").all();
  const updated = [];
  const errors = [];

  for (const r of rows) {
    try {
      let { price } = await fetchYahooPrice(r.auto_symbol);
      if (r.auto_currency) price = await convertToEur(price, r.auto_currency);
      db.prepare("UPDATE prices SET price=?, updated_at=datetime('now') WHERE asset_key=?").run(price, r.asset_key);
      updated.push(r.asset_key);
    } catch (e) {
      errors.push({ asset_key: r.asset_key, symbol: r.auto_symbol, error: e.message });
    }
  }

  return { updated, errors };
}

app.post("/api/prices/refresh", async (req, res) => {
  const { updated, errors } = await refreshCurrentPrices();
  res.json({ updated: updated.length, errors, prices: db.prepare("SELECT * FROM prices").all() });
});

// Extraído de la ruta por el mismo motivo que refreshCurrentPrices: reutilizable desde el
// cron diario y desde el botón combinado de Cartera > Resumen.
// sinceMap: { "<asset_key>": "YYYY-MM-DD", ... } -- fecha de la primera operación de cada
// activo, para no pedir más histórico del que hace falta. Solo se consulta para filas con
// fuente automática asignada (igual que refreshCurrentPrices); el resto los pide la interfaz.
async function refreshPriceHistory(sinceMap) {
  sinceMap = sinceMap || {};
  // Ver nota del filtro equivalente en refreshCurrentPrices: descarta en silencio filas
  // antiguas con una fuente ya retirada en vez de intentar consultarlas.
  const rows = db.prepare("SELECT * FROM prices WHERE auto_source = 'yahoo' AND auto_symbol IS NOT NULL AND auto_symbol != ''").all();
  const updated = [], errors = [];
  const upsert = db.prepare(`INSERT INTO price_history (asset_key,date,close) VALUES (@asset_key,@date,@close)
    ON CONFLICT(asset_key,date) DO UPDATE SET close=excluded.close`);
  const insertAll = db.transaction((assetKey, points) => {
    points.forEach((p) => upsert.run({ asset_key: assetKey, date: p.date, close: p.close }));
  });

  for (const r of rows) {
    const since = sinceMap[r.asset_key] || null;
    try {
      let points = await fetchYahooHistory(r.auto_symbol, since);
      if (r.auto_currency) {
        const fxPoints = await fetchFxHistoryToEur(r.auto_currency, since);
        points = convertPointsToEur(points, fxPoints);
      }
      // Algunos mercados secundarios (p.ej. DXE/Cboe Europe, Stuttgart) dan precio en vivo en
      // Yahoo pero no publican histórico diario -- comprobado con símbolos reales del mismo
      // fondo: IUSAM.XD/CSPXA.XD (DXE) y SXR8.SG (Stuttgart) devuelven 0 puntos, mientras que
      // SXR8.DE (Xetra) da el histórico completo. Sin este mínimo, un símbolo así "tenía éxito"
      // con 1 solo punto suelto -- insuficiente para una curva, pero no se avisaba de nada.
      if (points.length < 2) {
        throw new Error(
          (points.length === 0 ? "La fuente no devolvió histórico" : "La fuente solo devolvió " + points.length + " punto(s), insuficiente") +
          " -- prueba con otro mercado/listado del mismo instrumento (p.ej. Xetra en vez de Stuttgart/DXE)"
        );
      }
      insertAll(r.asset_key, points);
      updated.push({ asset_key: r.asset_key, points: points.length });
    } catch (e) {
      errors.push({ asset_key: r.asset_key, symbol: r.auto_symbol, source: r.auto_source, error: e.message });
    }
  }

  return { updated, errors };
}

// Mismo asset_key que ya calcula el cliente (ver assetKey() en app.js): broker + ticker/name
// en mayúsculas. El cron y el botón combinado no tienen "since" del cliente (viene de recorrer
// TX en el navegador), así que lo recalculan aquí a partir de la primera compra/venta de cada
// activo -- sin esto, refreshPriceHistory() pediría el histórico completo (10 años) cada vez
// en vez de solo lo necesario.
function computeSinceMap() {
  const rows = db.prepare("SELECT broker, ticker, name, date FROM transactions WHERE type IN ('compra','venta') ORDER BY date ASC").all();
  const since = {};
  rows.forEach((t) => {
    const key = (t.broker || "").trim().toUpperCase() + "|" + ((t.ticker || t.name || "").trim().toUpperCase());
    if (!since[key]) since[key] = t.date;
  });
  return since;
}

app.post("/api/prices/history/refresh", async (req, res) => {
  const sinceMap = (req.body && req.body.since) || {};
  const { updated, errors } = await refreshPriceHistory(sinceMap);
  res.json({ updated, errors });
});

// Botón combinado de Cartera > Resumen: precio actual + histórico en una sola llamada, mismo
// alcance que el cron diario (ver runDailyPriceRefresh más abajo).
app.post("/api/prices/refresh-all", async (req, res) => {
  const priceResult = await refreshCurrentPrices();
  const historyResult = await refreshPriceHistory(computeSinceMap());
  res.json({
    prices: { updated: priceResult.updated.length, errors: priceResult.errors },
    history: { updated: historyResult.updated, errors: historyResult.errors }
  });
});

app.get("/api/prices/history", (req, res) => {
  res.json(db.prepare("SELECT asset_key, date, close FROM price_history ORDER BY asset_key, date").all());
});

// Borra el histórico de precios de UNA posición -- para forzar una redescarga limpia si
// sospechas que quedó contaminado con un símbolo/divisa anterior (ver borrado automático en
// POST /api/prices). No toca el precio actual ni tus operaciones, solo la curva histórica; se
// vuelve a calcular pulsando "Actualizar precios e histórico" o "Calcular / actualizar histórico".
app.delete("/api/price-history/:assetKey", (req, res) => {
  db.prepare("DELETE FROM price_history WHERE asset_key = ?").run(req.params.assetKey);
  res.status(204).end();
});

// ---------- 19. API: Backup / restore completo ----------
app.get("/api/export", (req, res) => {
  res.json({
    transactions: db.prepare("SELECT * FROM transactions").all(),
    valuations: db.prepare("SELECT * FROM valuations").all(),
    prices: db.prepare("SELECT * FROM prices").all(),
    price_history: db.prepare("SELECT * FROM price_history").all(),
    household: db.prepare("SELECT * FROM household_entries").all(),
    accounts: db.prepare("SELECT * FROM accounts").all(),
    category_rules: db.prepare("SELECT * FROM category_rules").all(),
    exported_at: new Date().toISOString()
  });
});

app.post("/api/import-json", (req, res) => {
  const data = req.body || {};
  if (!Array.isArray(data.transactions) || !Array.isArray(data.valuations)) {
    return res.status(400).json({ error: "Formato de backup no reconocido" });
  }
  const replaceAll = db.transaction(() => {
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM valuations").run();
    db.prepare("DELETE FROM prices").run();
    db.prepare("DELETE FROM price_history").run();
    db.prepare("DELETE FROM household_entries").run();
    db.prepare("DELETE FROM accounts").run();
    db.prepare("DELETE FROM category_rules").run();

    const insTx = db.prepare(`INSERT INTO transactions
      (id,broker,date,type,name,ticker,asset_type,quantity,price,fee,currency,amount,notes,source)
      VALUES (@id,@broker,@date,@type,@name,@ticker,@asset_type,@quantity,@price,@fee,@currency,@amount,@notes,@source)`);
    data.transactions.forEach(t => insTx.run({
      id: t.id || uid(), broker: t.broker, date: t.date, type: t.type,
      name: t.name || null, ticker: t.ticker || null, asset_type: t.asset_type || null,
      quantity: t.quantity, price: t.price, fee: t.fee || 0, currency: t.currency || "EUR",
      amount: t.amount, notes: t.notes || null, source: t.source || "restore"
    }));

    const insVal = db.prepare("INSERT INTO valuations (id,date,value,cashflow,notes) VALUES (@id,@date,@value,@cashflow,@notes)");
    data.valuations.forEach(v => insVal.run({
      id: v.id || uid(), date: v.date, value: v.value, cashflow: v.cashflow || 0, notes: v.notes || null
    }));

    if (Array.isArray(data.prices)) {
      // auto_source/auto_symbol se restauran también -- si no, un backup/restore "olvida" la
      // fuente automática de cada posición y la curva de rentabilidad automática (que depende
      // de esta asignación) volvería a pedir todas las fuentes como si faltaran. auto_currency
      // y asset_type_override se restauran por el mismo motivo -- auto_currency se había
      // quedado fuera de esta lista desde que se añadió esa columna (un backup/restore hasta
      // ahora "olvidaba" la conversión de divisa configurada). sub_account igual: sin ella un
      // restore "olvidaría" el desglose por sub-cuenta ya asignado.
      const insPrice = db.prepare(`INSERT INTO prices (asset_key,broker,ticker,name,price,auto_source,auto_symbol,auto_currency,asset_type_override,sub_account,updated_at)
        VALUES (@asset_key,@broker,@ticker,@name,@price,@auto_source,@auto_symbol,@auto_currency,@asset_type_override,@sub_account,@updated_at)`);
      data.prices.forEach(p => insPrice.run({
        asset_key: p.asset_key, broker: p.broker || null, ticker: p.ticker || null,
        name: p.name || null, price: p.price, auto_source: p.auto_source || null, auto_symbol: p.auto_symbol || null,
        auto_currency: p.auto_currency || null, asset_type_override: p.asset_type_override || null,
        sub_account: p.sub_account || null,
        updated_at: p.updated_at || new Date().toISOString()
      }));
    }

    if (Array.isArray(data.price_history)) {
      const insHist = db.prepare("INSERT INTO price_history (asset_key,date,close) VALUES (@asset_key,@date,@close)");
      data.price_history.forEach(p => insHist.run({ asset_key: p.asset_key, date: p.date, close: p.close }));
    }

    // Se restauran antes que household -- sin FK real no es estrictamente necesario, pero así
    // las cuentas ya existen en cuanto se insertan los movimientos que las referencian.
    if (Array.isArray(data.accounts)) {
      const insAccount = db.prepare("INSERT INTO accounts (id,name,split_pct,created_at) VALUES (@id,@name,@split_pct,@created_at)");
      data.accounts.forEach(a => insAccount.run({
        id: a.id || uid(), name: a.name, split_pct: a.split_pct, created_at: a.created_at || new Date().toISOString()
      }));
    }

    if (Array.isArray(data.household)) {
      const insHousehold = db.prepare(`INSERT INTO household_entries (id,type,category,subcategory,amount,date,recurring,notes,account_id,created_at)
        VALUES (@id,@type,@category,@subcategory,@amount,@date,@recurring,@notes,@account_id,@created_at)`);
      data.household.forEach(h => insHousehold.run({
        id: h.id || uid(), type: h.type, category: h.category, subcategory: h.subcategory || null, amount: h.amount, date: h.date,
        recurring: h.recurring ? 1 : 0, notes: h.notes || null, account_id: h.account_id || null,
        created_at: h.created_at || new Date().toISOString()
      }));
    }

    if (Array.isArray(data.category_rules)) {
      const insRule = db.prepare("INSERT INTO category_rules (id,keyword,category,subcategory,match_type,created_at) VALUES (@id,@keyword,@category,@subcategory,@match_type,@created_at)");
      data.category_rules.forEach(r => insRule.run({
        id: r.id || uid(), keyword: r.keyword, category: r.category, subcategory: r.subcategory || null,
        match_type: CATEGORY_RULE_MATCH_TYPES.indexOf(r.match_type) >= 0 ? r.match_type : "contains",
        created_at: r.created_at || new Date().toISOString()
      }));
    }
  });
  replaceAll();
  res.json({ ok: true });
});

// ---------- 20. Cron: actualización automática diaria ----------
// Se dispara una vez al día a la hora local del contenedor (fijar TZ=Europe/Madrid en
// docker-compose.yml para que sea hora de España) -- pensada para primera hora de la mañana,
// antes de que el usuario abra la app. Recalcula el propio disparo cada vez con setTimeout en
// vez de un setInterval fijo de 24h, para no desincronizarse con el cambio de horario
// verano/invierno (con setInterval, un cambio de hora dejaría el disparo una hora desplazado
// hasta el siguiente reinicio del contenedor).
const DAILY_REFRESH_HOUR = 8;
const DAILY_REFRESH_MINUTE = 0;

async function runDailyPriceRefresh() {
  console.log("[cron] Actualización diaria de precios: empieza");
  try {
    const priceResult = await refreshCurrentPrices();
    const historyResult = await refreshPriceHistory(computeSinceMap());
    console.log(
      "[cron] Actualización diaria de precios: " + priceResult.updated.length + " precio(s) actualizado(s) (" +
      priceResult.errors.length + " error(es)), histórico de " + historyResult.updated.length + " activo(s) (" +
      historyResult.errors.length + " error(es))"
    );
  } catch (e) {
    console.error("[cron] Actualización diaria de precios: fallo inesperado", e);
  }
}

function scheduleDailyPriceRefresh() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAILY_REFRESH_HOUR, DAILY_REFRESH_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delayMs = next.getTime() - now.getTime();
  console.log("[cron] Próxima actualización diaria de precios: " + next.toString());
  setTimeout(function () {
    runDailyPriceRefresh().finally(scheduleDailyPriceRefresh);
  }, delayMs);
}

scheduleDailyPriceRefresh();

// ---------- 21. Arranque del servidor ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Ábaco escuchando en el puerto ${PORT} (DB: ${DB_PATH})`);
});
