(function () {
  "use strict";

  /* ---------------- Índice ---------------- */
  // 1. Constantes y estado global
  // 2. Modo privacidad (sustituye los importes por ***** en pantalla)
  // 3. Modo claro/oscuro
  // 4. API
  // 5. Cálculo de posiciones a partir de operaciones
  // 6. Cálculo de efectivo a partir de operaciones
  // 7. Dividendos e intereses recibidos
  // 8. Economía doméstica (independiente de Cartera)
  // 9. Detección de traspasos Economía <-> Cartera
  // 10. Métricas de cartera
  // 11. Curva de rentabilidad automática (histórico de precios)
  // 12. SVG charts
  // 13. Tooltip compartido para gráficos de barras mensuales
  // 14. Render: Dashboard
  // 15. Render: Dividendos e intereses
  // 16. Render: Positions
  // 17. Widget de Fuente + Símbolo
  // 18. Render: Cartera > Resumen -- lista esquemática de posiciones
  // 19. Render: Efectivo por bróker
  // 20. Render: Rentabilidad automática
  // 21. Render: Operations
  // 22. Render: Valuations
  // 23. Render: Economía doméstica
  // 24. Render: Todas las operaciones (revisar/corregir categorías)
  // 25. Render: Análisis de Economía doméstica
  // 26. Render: flyout "Cuentas" (Economía)
  // 27. Render: flyout "Reglas" de categorización (Economía)
  // 28. Render: flyout "Detectar traspasos" (Economía)
  // 29. Tabs (dos niveles)
  // 30. Formularios manuales
  // 31. Exportar operaciones a CSV (para comparar en Excel)
  // 32. Backup / restore
  // 33. Importador de CSV (Cartera)
  // 34. Importador de CSV para Economía doméstica
  // 35. Autodetección de "Aportación de tercero" al importar CSV
  // 36. Reglas de categorización automática (Economía)
  // 37. Importador de CSV para Economía doméstica: mapeo y vista previa
  // 38. Menús modales de Economía (Importar CSV, Cuentas, Detectar traspasos)
  // 39. Init

  /* ---------------- 1. Constantes y estado global ---------------- */
  // Paleta categórica de los donuts/barras de sub-cuenta -- 8 tonos con matiz (hue) bien
  // separado entre sí -- teal (el propio acento), azul, ámbar, violeta, naranja/teja, verde,
  // rosa/berenjena y gris cálido neutro -- para que cada porción se distinga de un vistazo
  // incluso con 6-8 categorías a la vez (la primera versión, solo variaciones tonales del
  // acento, costaba de diferenciar -- ver feedback del usuario 2026-07-17). Se evita
  // deliberadamente la zona de rojo/carmín de --negative para no confundir "categoría" con
  // "pérdida". Son funciones (no constantes de módulo) porque tienen que poder cambiar sin
  // recargar la página en cuanto el usuario alterna el interruptor de tema -- ver "Modo
  // claro/oscuro" más abajo.
  // Saturación subida a mano (mismo matiz, más croma) sobre los tonos que habían quedado muy
  // apagados -- verde musgo y azul pizarra, ver feedback del usuario 2026-07-18. El azul pizarra
  // en concreto no se limitó a saturarse: su matiz original (~216°) quedaba a solo 3° del azul
  // del índice 1 (~213°), casi indistinguibles ya antes de tocar nada -- al subir la saturación
  // de los dos por igual se habrían vuelto directamente el mismo azul, así que ese tono se
  // sustituyó por un rosa/berenjena (~320°) bien separado de el resto de matices en vez de
  // solo intensificarlo. El último tono (gris cálido neutro, bucket "Efectivo"/"Otro") se deja
  // sin tocar a propósito -- es neutro por diseño, no una categoría más.
  var CHART_PALETTE_LIGHT = ["#0F6B5C", "#2E67AD", "#C98A2E", "#8B37CA", "#B2592E", "#2A9C4F", "#BF4A98", "#8C857A"];
  var CHART_PALETTE_DARK = ["#2BAA92", "#5B9BDB", "#E0AC4E", "#B080DA", "#E08A54", "#63D283", "#D27FB6", "#ACA599"];
  function chartPalette() { return resolvedTheme() === "dark" ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT; }
  function typeColors() {
    var p = chartPalette();
    return { "Acción": p[0], "ETF": p[1], "Cripto": p[4], "Fondo": p[5], "Otro": p[7] };
  }
  // Mismas 5 opciones que ya usa el <select name="asset_type"> del formulario de Operaciones --
  // se reutilizan aquí para el desplegable de Tipo de Posiciones, así los colores de los donuts
  // (typeColors()) y el resto de la app siguen viendo los mismos valores de siempre.
  var ASSET_TYPES = ["Acción", "ETF", "Cripto", "Fondo", "Otro"];
  function brokerPalette() { return chartPalette(); }
  // Bonos/T-Bills (detectados por CUSIP, ver isBondLike en computeAutoEquity) nunca pasan por el
  // desplegable de Tipo de Posiciones -- no son una "posición" ahí, solo movimientos de caja --
  // así que se tratan como un bucket de tipo aparte, fuera de ASSET_TYPES, solo para el desglose
  // de rentabilidad por tipo de activo de Cartera > Resumen.
  var BOND_TYPE = "Renta fija";
  var BOND_TICKER_RE = /^[0-9A-Z]{9}$/;
  // Bucket de aviso del desglose de rentabilidad por sub-cuenta (ver brokerSubAccountBuckets) --
  // agrupa las posiciones de un bróker que YA usa sub-cuentas pero a las que aún no se les ha
  // asignado ninguna, para que sea visible que falta clasificarlas en vez de desaparecer del
  // desglose sin más.
  var UNCLASSIFIED = "Sin clasificar";
  // Bucket sintético (igual que BOND_TYPE) que detecta si el bróker paga intereses sobre el
  // efectivo no invertido (type=INTEREST_PAYMENT en el CSV de Trade Republic, clasificado como
  // "dividendo") -- esas filas llegan SIN ticker ni nombre porque no están ligadas a ningún
  // activo concreto, así que resolveHoldingSubAccounts (que solo etiqueta claves vistas en
  // compra/venta) nunca les asigna sub-cuenta real y sin este bucket caían siempre en
  // UNCLASSIFIED con capital=0 -- y como computeGroupReturn oculta cualquier grupo con
  // capital<=0 (hasData:false), ese interés desaparecía del desglose por completo. La presencia
  // de intereses solo se usa para DECIDIR si mostrar el bucket (ver brokerSubAccountBuckets);
  // el número que se enseña en él es el efectivo TOTAL del bróker (computeCashByBroker), no solo
  // lo cobrado en intereses -- así la barra responde "¿cuánto efectivo tengo parado en este
  // bróker ahora mismo?", que es lo que de verdad se compara contra el saldo de caja del bróker.
  var CASH_INTEREST_GROUP = "Efectivo";
  var TYPE_LABELS = { compra: "Compra", venta: "Venta", dividendo: "Dividendo", comision: "Comisión", ingreso: "Ingreso", retirada: "Retirada", otro: "Otro" };

  var TX = [], VAL = [], PRICES = [], HOUSEHOLD = [], ACCOUNTS = [], CATEGORY_RULES = [];
  // Mes (YYYY-MM) seleccionado en la pestaña Economía -- COMPARTIDO entre Resumen y Operaciones
  // (a petición del usuario, 2026-07-20; antes cada sub-pestaña llevaba su propio mes). Se
  // mantiene entre renders para no volver siempre al mes actual cada vez que loadAll() vuelve a
  // pintar tras un alta/baja. Cambiarlo desde cualquiera de las dos sub-pestañas repinta también
  // la otra (ver onSelectMonth en renderHousehold/refreshHouseholdRecatFilterOptions) para que el
  // selector de la que no está a la vista quede sincronizado igualmente. Ver también
  // householdOpsAllMonths, el único caso en el que Operaciones se desvía de este mes.
  var householdSelectedMonth = null;
  // Tamaño de página de la tabla de Economía > Operaciones (ver renderHouseholdRecat).
  var HOUSEHOLD_MOVEMENTS_PAGE_SIZE = 15;
  // Filtros del subapartado "Todas las operaciones" -- se mantienen entre renders por el mismo
  // motivo que householdSelectedMonth. Categoría y subcategoría son desplegables INDEPENDIENTES
  // (no un único combinado, ver refreshHouseholdRecatFilterOptions): subcategoría solo lista las
  // subcategorías de la categoría elegida, o todas si no hay categoría elegida. La descripción
  // sigue siendo texto libre (no se puede enumerar en un desplegable). Todos se combinan con AND.
  var householdRecatCategoryFilter = "";
  var householdRecatSubcategoryFilter = "";
  // "__none__" (sentinel) = solo movimientos sin cuenta asignada -- "" sigue significando "sin
  // filtrar" (Todas), igual que el resto de filtros, así que no puede reutilizarse para "Sin
  // cuenta" como hace el <select> de reasignación en bloque (ahí "" sí significa "Sin cuenta").
  var householdRecatAccountFilter = "";
  var householdRecatAmountMin = "";
  var householdRecatAmountMax = "";
  var householdRecatTypeFilter = "";
  var householdRecatTextFilter = "";
  // Página actual (0-based) de "Todas las operaciones" -- se resetea a 0 cada vez que cambia
  // el filtro (ver los listeners de category-filter/text-filter). Reutiliza el mismo tamaño de
  // página que "Movimientos" (HOUSEHOLD_MOVEMENTS_PAGE_SIZE).
  var householdRecatPage = 0;
  // "Todos los meses" de Economía > Operaciones -- único caso en el que esa sub-pestaña se
  // desvía del mes compartido (householdSelectedMonth), porque Resumen no puede mostrar "todos"
  // (siempre necesita un mes concreto para sus cifras). Al activarlo, Operaciones deja de
  // filtrar por mes pero Resumen conserva el último mes concreto tal cual; en cuanto se vuelve a
  // elegir un mes concreto desde cualquiera de las dos, la sincronización se retoma normal.
  var householdOpsAllMonths = false;
  // Orden por columna de la tabla de Operaciones -- mismo patrón que positionsSort/
  // operationsSort (ver setPositionsSort/setOperationsSort más abajo).
  var householdOpsSort = { key: "date", dir: "desc" };
  var HOUSEHOLD_OPS_TEXT_SORT_KEYS = { type: true, account: true, category: true, subcategory: true };
  // Filas marcadas para el bulk-apply de "Todas las operaciones" -- por id, true por defecto (así
  // "Aplicar a los filtrados" se sigue comportando igual que antes si no se desmarca nada). Se
  // conserva entre renders con el mismo patrón que pendingTransferMatches/pendingHouseholdImportRows.
  var householdRecatChecked = {};
  var HOUSEHOLD_CATEGORY_SUGGESTIONS_STATIC = ["Nómina", "Alquiler", "Suministros", "Supermercado", "Transporte", "Seguros", "Suscripciones", "Ocio", "Salud", "Otros"];
  // "transferencia" (movimiento interno entre cuentas propias, p.ej. Nómina -> Domiciliaciones)
  // no es ni ingreso ni gasto real -- se excluye de los totales en computeHouseholdMonthly/
  // computeExpenseByCategory, pero sigue siendo un tipo normal a la hora de guardar/mostrar.
  var HOUSEHOLD_TYPE_LABELS = { ingreso: "Ingreso", gasto: "Gasto", transferencia: "Transferencia", aportacion_tercero: "Aportación de tercero" };
  var CATEGORY_RULE_MATCH_TYPES = ["contains", "not_contains", "word", "starts_with", "ends_with"];
  // Tipos que NO son ni ingreso ni gasto real del usuario -- se excluyen de los totales de
  // Ingresos/Gastos/Ahorro (computeHouseholdMonthly, computeHouseholdByAccountForMonth) y se
  // pintan sin signo/color en las tablas de movimientos, igual que "transferencia" ya hacía.
  var HOUSEHOLD_NEUTRAL_TYPES = { transferencia: true, aportacion_tercero: true };
  // Escala del gráfico "Evolución mes a mes" (Resumen) y del de "Evolución de gastos por mes"
  // (Análisis) -- logarítmica por defecto, porque un mes puntual (p.ej. una reforma) varias
  // veces mayor que el resto es más habitual que un histórico perfectamente uniforme, y en
  // escala lineal ese mes aplasta a todos los demás contra el eje.
  var householdEvolutionScale = "log";
  var householdAnalysisScale = "log";
  // Zoom temporal de "Evolución mes a mes" (Resumen) y de "Evolución de gastos por mes"
  // (Análisis) -- mismo esquema de valores ("all"/"12"/"6"/"3"), pero cada panel recuerda su
  // propio zoom por separado. householdAnalysisPeriod es un selector aparte (el de "Periodo"
  // arriba del todo en Análisis) que solo afecta al desglose por categoría, no a este gráfico.
  var householdEvolutionPeriod = "all";
  var householdAnalysisEvolutionPeriod = "all";
  var householdAnalysisPeriod = "all";
  // Se carga siempre en loadAll() (lectura local, sin llamadas externas) -- null solo antes de
  // la primera carga; después será un array, vacío si aún no se ha calculado ningún histórico.
  var PRICE_HISTORY = null;
  // Histórico de tipo de cambio hacia EUR, por divisa -- a diferencia de PRICE_HISTORY (lectura
  // local), esto SÍ pide a Yahoo Finance (vía /api/fx-history, que reutiliza el mismo caché de
  // servidor que ya usa la curva de precios) la primera vez que aparece una posición con
  // "auto_currency" asignado. Se rellena bajo demanda (ver ensureFxHistory(), llamada tras cada
  // loadAll()) en vez de en la carga inicial, porque la mayoría de carteras no tienen ninguna
  // posición en divisa extranjera y no merece la pena pedirlo siempre. Mapa
  // "USD" -> [{date, close}, ...] (close = EUR por 1 unidad de esa divisa, orden ascendente).
  var FX_HISTORY = {};
  var fxHistoryLoading = {};
  var activeTab = "dashboard";
  // Columnas de texto empiezan en orden ascendente al pulsarlas por primera vez, las
  // numéricas en descendente (de mayor a menor) porque es lo que se suele querer ver primero
  // (posición más grande, mejor/peor rentabilidad) -- si el usuario vuelve a pulsar la misma
  // columna, se invierte.
  var TEXT_SORT_KEYS = { broker: true, name: true, type: true };
  var positionsSort = { key: "value", dir: "desc" };
  // Criterio de orden de la caja "Mejores posiciones" del Dashboard -- "pnlPct" (rentabilidad %) o
  // "weightPct" (peso sobre el patrimonio total), ver <select id="top-positions-sort">.
  var topPositionsSortKey = "pnlPct";
  // Rango temporal del selector sobre la curva de "Evolución del patrimonio" en Cartera >
  // Resumen (ver #cartera-equity-range) -- "all" (histórico completo) por defecto, para no
  // cambiar el comportamiento de antes de que existiera el selector. Solo afecta a esa curva
  // (id chart-cartera-equity); la del Dashboard (chart-equity) siempre muestra el
  // histórico completo. curvePoints ya calculados en el último renderDashboard(), para que
  // cambiar de rango no tenga que recalcular toda la cartera de nuevo (ver
  // renderCarteraEquityChart()).
  var carteraEquityRange = "all";
  var lastCurvePoints = [];

  var fmtEUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  var fmtPct = function (n) { if (n === null || n === undefined || isNaN(n)) return "—"; var s = n >= 0 ? "+" : ""; return s + n.toFixed(2) + "%"; };
  var fmtDate = function (iso) { if (!iso) return "—"; var d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); };
  function escapeHtml(str) { return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // "#RRGGBB" -> "rgba(r,g,b,alpha)" -- para atenuar un color de la paleta categórica (que solo
  // existe como hex) al pintar el track de fondo de una barra de progreso, mismo efecto que las
  // variables --accent-rgb/--negative-rgb ya usadas en CSS pero para colores dinámicos que no
  // tienen una variable CSS propia.
  function hexToRgba(hex, alpha) {
    var h = hex.replace("#", "");
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  // Limpia sufijos de clase de acción entre paréntesis ("Novo-Nordisk (B)") y guiones que la
  // búsqueda de Yahoo Finance no maneja bien -- probado: "Novo-Nordisk (B)" solo encuentra
  // Copenhague, pero "Novo Nordisk" (limpio) encuentra también la cotización de Xetra en euros.
  function cleanSearchName(name) {
    return String(name || "").replace(/\([^)]*\)/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  }

  /* ---------------- 2. Modo privacidad (sustituye los importes por ***** en pantalla) ---------------- */
  // A diferencia de un difuminado CSS, aquí el texto real nunca llega a pintarse -- fmtMoney()
  // sustituye la cifra por PRIVACY_MASK antes de construir el HTML, así que activar/desactivar
  // el modo tiene que volver a renderizar todo (renderAll()), no solo alternar una clase visual.
  // Un único toggle global cubre toda la app (Cartera, Economía, lo que venga después) porque
  // todos los importes en pantalla pasan por fmtMoney() en vez de por fmtEUR.format() directo.
  var PRIVACY_KEY = "cartera-privacy-mode";
  var PRIVACY_MASK = "*****";
  function isPrivacyMode() { return localStorage.getItem(PRIVACY_KEY) === "1"; }
  function fmtMoney(n) { return isPrivacyMode() ? PRIVACY_MASK : fmtEUR.format(n); }
  // Rentabilidad en € (a diferencia de un importe normal, aquí interesa ver el signo siempre,
  // igual que ya hace fmtPct con el % -- fmtEUR.format() ya antepone "-" a los negativos, solo
  // hace falta añadir el "+" a los positivos) -- "—" si no hay coste con el que calcularla
  // (misma condición que deja pnlPct en null, ver computeHoldings).
  function fmtMoneySigned(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    if (isPrivacyMode()) return PRIVACY_MASK;
    return (n >= 0 ? "+" : "") + fmtEUR.format(n);
  }
  // btn-privacy-toggle (escritorio/tablet, en el header) y btn-privacy-toggle-mobile (menú
  // lateral en móvil, ver #mobile-menu-panel en index.html) son DOS botones distintos que
  // llaman a esta misma función -- no un único botón reposicionado, para que el panel móvil
  // pueda vivir fuera de <header> (ver comentario de #mobile-menu-panel en index.html sobre por
  // qué). applyPrivacyMode() actualiza el texto de los dos a la vez.
  function applyPrivacyMode() {
    var on = isPrivacyMode();
    document.body.classList.toggle("privacy-mode", on);
    var label = on ? "👁 Mostrar cifras" : "🙈 Ocultar cifras";
    ["btn-privacy-toggle", "btn-privacy-toggle-mobile"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.textContent = label;
    });
  }
  function togglePrivacyMode() {
    localStorage.setItem(PRIVACY_KEY, isPrivacyMode() ? "0" : "1");
    applyPrivacyMode();
    renderAll();
  }
  document.getElementById("btn-privacy-toggle").addEventListener("click", togglePrivacyMode);
  applyPrivacyMode();

  /* ---------------- 3. Modo claro/oscuro ---------------- */
  // Mismo patrón que el modo privacidad de arriba: la preferencia manual se guarda en
  // localStorage y gana sobre prefers-color-scheme (ver styles.css, selectores
  // :root[data-theme="dark"/"light"]) hasta que el usuario la borre. Sin preferencia guardada,
  // no se toca el atributo -- el @media (prefers-color-scheme) del CSS ya resuelve el tema del
  // sistema operativo por su cuenta.
  // A diferencia del modo privacidad (que solo cambia texto), aquí también hay que forzar un
  // renderAll(): equitySvg/donutSvg/miniSparkSvg/monthlyBarsSvg incrustan los colores como hex
  // fijos en el propio string SVG en el momento de generarlo (ver themeColor() más abajo) --
  // cambiar solo las variables CSS no repinta un SVG ya construido. segmentedBarHtml/
  // subAccountBarsHtml ya no son SVG pero tienen el mismo problema con sus colores inline
  // (chartPalette()/brokerPalette() eligen entre paleta clara/oscura según el tema activo).
  var THEME_KEY = "cartera-theme";
  function storedTheme() { return localStorage.getItem(THEME_KEY); } // "light" | "dark" | null
  function resolvedTheme() {
    return storedTheme() || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  // Lee el valor YA resuelto de una variable CSS del tema activo -- usado por las funciones que
  // generan SVG (equitySvg, donutSvg...) para incrustar el color correcto en vez de un hex fijo.
  function themeColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  // Mismos dos botones que btn-privacy-toggle/-mobile más arriba -- ver ese comentario.
  function applyTheme() {
    var s = storedTheme();
    if (s) document.documentElement.setAttribute("data-theme", s);
    else document.documentElement.removeAttribute("data-theme");
    var label = resolvedTheme() === "dark" ? "☀ Modo claro" : "🌙 Modo oscuro";
    ["btn-theme-toggle", "btn-theme-toggle-mobile"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.textContent = label;
    });
  }
  function toggleTheme() {
    localStorage.setItem(THEME_KEY, resolvedTheme() === "dark" ? "light" : "dark");
    applyTheme();
    renderAll();
  }
  document.getElementById("btn-theme-toggle").addEventListener("click", toggleTheme);
  applyTheme();
  // El sistema operativo puede cambiar de tema en caliente (p.ej. franja horaria de "oscuro
  // automático") mientras la pestaña sigue abierta -- si el usuario nunca ha elegido a mano,
  // los SVG ya pintados se quedarían con los colores del tema anterior hasta recargar sin este
  // listener.
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (!storedTheme()) { applyTheme(); renderAll(); }
    });
  }

  /* ---------------- 4. API ---------------- */
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts))
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || (r.status + " " + r.statusText)); });
        if (r.status === 204) return null;
        return r.json();
      });
  }

  function loadAll() {
    // /api/prices/history queda FUERA del Promise.all principal a propósito -- crece sin límite
    // con el uso normal (cada "Actualizar precios e histórico" añade filas) y en una cartera con
    // historial largo ya pesa varios cientos de KB, suficiente para notarse en el primer render
    // si lo bloquea. El resto del código ya sabe degradarse sin él (PRICE_HISTORY empieza en
    // null, ver línea ~169): computeAutoEquity() trata null como "sin histórico todavía"
    // (`(PRICE_HISTORY || [])`), renderAutoEquity() lo detecta explícitamente para pintar el
    // aviso de "Pulsa Calcular/actualizar histórico", y renderDashboard() cae a las valoraciones
    // manuales mientras tanto -- mismo patrón que ensureFxHistory() más abajo: pedirlo aparte
    // tras el primer render y repintar solo cuando llegue.
    return Promise.all([api("/api/transactions"), api("/api/valuations"), api("/api/prices"), api("/api/household"), api("/api/accounts"), api("/api/category-rules")])
      .then(function (res) {
        TX = res[0]; VAL = res[1]; PRICES = res[2]; HOUSEHOLD = res[3]; ACCOUNTS = res[4]; CATEGORY_RULES = res[5];
        renderAll();
        // Ídem -- no bloquea el render inicial: la tabla de Posiciones se pinta ya, y en cuanto
        // llegue el histórico de cambio (si hace falta) se vuelve a pintar sola con la
        // rentabilidad en divisa nativa (ver computeNativePnl/ensureFxHistory).
        ensureFxHistory().then(function (gotNew) { if (gotNew) renderAll(); });
        api("/api/prices/history")
          .then(function (history) { PRICE_HISTORY = history; renderAll(); })
          .catch(function (err) { console.error("No se pudo cargar el histórico de precios: " + err.message); });
      })
      .catch(function (err) { console.error(err); alert("No se pudo conectar con el servidor: " + err.message); });
  }

  // Pide el histórico de tipo de cambio de cada divisa distinta que aparezca en PRICES
  // ("auto_currency") y que todavía no esté en FX_HISTORY -- una sola petición por divisa
  // aunque varias posiciones la compartan (p.ej. varias acciones en USD). Devuelve una promesa
  // que resuelve a true si trajo algo nuevo (para que el llamante decida si merece la pena
  // volver a pintar) o false si no había nada que pedir. Los fallos se ignoran en silencio --
  // esta rentabilidad es informativa/secundaria, no debe romper el resto de la pantalla si
  // Yahoo Finance no responde.
  function ensureFxHistory() {
    var currencies = Array.from(new Set(
      PRICES.map(function (p) { return (p.auto_currency || "").trim().toUpperCase(); }).filter(Boolean)
    )).filter(function (c) { return c !== "EUR" && !FX_HISTORY[c] && !fxHistoryLoading[c]; });
    if (currencies.length === 0) return Promise.resolve(false);
    currencies.forEach(function (c) { fxHistoryLoading[c] = true; });
    return Promise.all(currencies.map(function (c) {
      return api("/api/fx-history?currency=" + encodeURIComponent(c))
        .then(function (res) {
          FX_HISTORY[c] = (res.points || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
        })
        .catch(function (err) { console.error("No se pudo cargar el histórico de " + c + ": " + err.message); })
        .finally(function () { delete fxHistoryLoading[c]; });
    })).then(function () { return true; });
  }

  /* ---------------- 5. Cálculo de posiciones a partir de operaciones ---------------- */
  function assetKey(t) { return (t.broker || "").trim().toUpperCase() + "|" + ((t.ticker || t.name || "").trim().toUpperCase()); }

  // Identidad de bróker para agrupar/comparar -- el nombre se escribe siempre a mano (alta
  // manual, importación CSV, edición inline), sin ningún desplegable que evite escribir el
  // mismo bróker de dos formas distintas (mayúsculas, espacios, un typo). brokerNormKey da la
  // clave para COMPARAR/AGRUPAR (nunca para mostrar); brokerDisplayName da el nombre a
  // MOSTRAR -- el primero (más antiguo por fecha) que se usó para ese nombre normalizado, para
  // no enseñar nunca la clave en minúsculas al usuario.
  function brokerNormKey(broker) {
    var raw = (broker || "Sin especificar").trim();
    return (raw || "Sin especificar").toLowerCase();
  }

  // Cacheada contra la propia referencia de TX -- brokerDisplayName() (la única llamante) se
  // usa DENTRO de bucles sobre TX/holdings en varios sitios (computeCashByBroker,
  // computeDividends, los desplegables de filtro de bróker...), así que sin caché esto
  // reconstruía TX.slice().sort() entero UNA VEZ POR CADA TRANSACCIÓN dentro de esos bucles --
  // O(n²) en vez de O(n), con n = número de operaciones. Con una cartera de cientos/miles de
  // operaciones eso se nota mucho más que el mismo problema por bróker que ya se arregló en
  // computeAutoEquity (aquí escala con el histórico de OPERACIONES, no con el número de
  // brókers). Sentinela propio en vez de null -- mismo motivo que priceHistoryIndexCacheSource
  // (app.js:1262 aprox.): aunque TX nunca vale null (empieza en [], no en null), un sentinela
  // dedicado evita depender de esa garantía.
  var BROKER_CANONICAL_NAMES_UNSET = {};
  var brokerCanonicalNamesCache = null;
  var brokerCanonicalNamesCacheSource = BROKER_CANONICAL_NAMES_UNSET;
  function brokerCanonicalNames() {
    if (brokerCanonicalNamesCacheSource === TX) return brokerCanonicalNamesCache;
    var names = {};
    TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
      var raw = (t.broker || "Sin especificar").trim() || "Sin especificar";
      var key = raw.toLowerCase();
      if (!names[key]) names[key] = raw;
    });
    brokerCanonicalNamesCache = names;
    brokerCanonicalNamesCacheSource = TX;
    return names;
  }

  function brokerDisplayName(broker) {
    return brokerCanonicalNames()[brokerNormKey(broker)] || ((broker || "Sin especificar").trim() || "Sin especificar");
  }

  // Interés sobre efectivo no invertido (p.ej. INTEREST_PAYMENT de Trade Republic) -- se
  // clasifica como "dividendo" (ver classifyTypeTradeRepublic) pero, a diferencia de un
  // dividendo real, no trae ticker ni nombre porque no está ligado a ningún activo. Ver
  // CASH_INTEREST_GROUP para por qué hace falta distinguirlo del resto de "dividendo".
  function isCashInterestTx(t) {
    return t.type === "dividendo" && !(t.ticker || "").trim() && !(t.name || "").trim();
  }

  function computeHoldings() {
    var groups = {};
    TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
      if (t.type !== "compra" && t.type !== "venta") return;
      var key = assetKey(t);
      if (!groups[key]) groups[key] = { key: key, broker: t.broker, name: t.name || t.ticker || "(sin nombre)", ticker: t.ticker, type: t.asset_type || "Otro", qty: 0, costBasis: 0 };
      var g = groups[key];
      if (t.name) g.name = t.name;
      if (t.asset_type) g.type = t.asset_type;
      var qty = Number(t.quantity) || 0, price = Number(t.price) || 0, fee = Number(t.fee) || 0;
      if (t.type === "compra") {
        g.costBasis += qty * price + fee;
        g.qty += qty;
      } else {
        var avgCost = g.qty > 0 ? g.costBasis / g.qty : 0;
        g.costBasis -= avgCost * Math.min(qty, g.qty);
        g.qty -= qty;
      }
    });

    var priceMap = {};
    PRICES.forEach(function (p) { priceMap[p.asset_key] = p; });

    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      if (g.qty <= 0.00001) return null;
      var avgPrice = g.qty > 0 ? g.costBasis / g.qty : 0;
      var priceEntry = priceMap[k];
      var currentPrice = priceEntry ? priceEntry.price : avgPrice;
      var value = g.qty * currentPrice;
      var pnlPct = g.costBasis > 0 ? ((value - g.costBasis) / g.costBasis) * 100 : null;
      // Rentabilidad en € (además del %) -- misma condición de "sin coste" que pnlPct (p.ej.
      // una posición asignada gratis) para que las dos columnas queden en "—" a la vez, en vez
      // de mostrar un € suelto sin el % que le da contexto.
      var pnlAbs = g.costBasis > 0 ? (value - g.costBasis) : null;
      // El Tipo derivado de las operaciones (g.type) se puede corregir a mano desde Posiciones
      // -- el importador de CSV genérico siempre lo deja en "Otro", así que sin esto no hay
      // forma de arreglarlo salvo editando cada operación. Se guarda como asset_type_override
      // en "prices" (misma tabla que ya guarda auto_source/auto_symbol/auto_currency por
      // posición) y gana sobre el valor derivado si está presente.
      var type = (priceEntry && priceEntry.asset_type_override) ? priceEntry.asset_type_override : g.type;
      return {
        key: k, broker: g.broker, name: g.name, ticker: g.ticker, type: type,
        qty: g.qty, avgPrice: avgPrice, currentPrice: currentPrice, hasPrice: !!priceEntry,
        value: value, cost: g.costBasis, pnlPct: pnlPct, pnlAbs: pnlAbs
      };
    }).filter(Boolean).sort(function (a, b) { return b.value - a.value; });
  }

  // Sub-cuenta asignada (prices.sub_account) de CADA activo alguna vez operado en compra/venta,
  // esté abierto o ya cerrado -- a diferencia del Tipo de activo, no hay fallback a nivel de
  // transacción: prices.sub_account es la única fuente, string vacío si no se ha asignado
  // ninguna. Sin filtrar por qty>0 porque computeAutoEquity necesita también las posiciones ya
  // cerradas para reconstruir el histórico completo de cada sub-cuenta.
  function resolveHoldingSubAccounts() {
    var priceMap = {};
    PRICES.forEach(function (p) { priceMap[p.asset_key] = p; });
    var subByKey = {};
    TX.forEach(function (t) {
      if (t.type !== "compra" && t.type !== "venta") return;
      var key = assetKey(t);
      var pe = priceMap[key];
      subByKey[key] = (pe && pe.sub_account) ? pe.sub_account.trim() : "";
    });
    return subByKey;
  }

  // Grupos con datos para el desglose de rentabilidad de un bróker concreto: las sub-cuentas
  // reales que el usuario ha ido asignando (vía el campo "Sub-cuenta" de Posiciones), más
  // BOND_TYPE ("Renta fija") si el bróker tiene bonos/T-Bills (detectados por CUSIP, nunca
  // pasan por ese campo porque no tienen fila en "prices"), más UNCLASSIFIED ("Sin clasificar")
  // -- pero esta última SOLO si ya hay alguna sub-cuenta real asignada en este bróker y además
  // queda alguna posición sin asignar, para que un bróker que nunca ha usado el campo (p.ej.
  // IBKR) no muestre una única barra inútil al 100%. El panel solo tiene sentido pintarlo con
  // 2 o más grupos (con 1 solo grupo coincide siempre con el total que ya se ve arriba).
  function brokerSubAccountBuckets(broker) {
    var subs = resolveHoldingSubAccounts();
    var tags = {}, hasUnclassified = false, hasBonds = false, hasInterest = false;
    TX.forEach(function (t) {
      if (brokerNormKey(t.broker) !== brokerNormKey(broker)) return;
      if (t.type === "compra" || t.type === "venta") {
        var s = subs[assetKey(t)];
        if (s) tags[s] = true; else hasUnclassified = true;
      } else if (t.type === "otro" && BOND_TICKER_RE.test((t.ticker || "").trim().toUpperCase())) {
        hasBonds = true;
      } else if (isCashInterestTx(t)) {
        hasInterest = true;
      }
    });
    var list = Object.keys(tags).sort();
    if (hasBonds) list.push(BOND_TYPE);
    if (hasInterest) list.push(CASH_INTEREST_GROUP);
    if (Object.keys(tags).length > 0 && hasUnclassified) list.push(UNCLASSIFIED);
    return list;
  }

  // holdings + weightPct de cada uno -- % que representa cada posición sobre el patrimonio
  // total (posiciones + efectivo, pero el efectivo solo cuenta si es positivo; un efectivo
  // negativo/descubierto no "resta patrimonio diversificable" a estos efectos). Mismo criterio
  // que ya usa el donut "Distribución por activo" (computeMetrics -> allocByAsset). Se extrajo
  // de renderPositions() para reutilizarlo tal cual en la lista esquemática de Cartera > Resumen,
  // sin duplicar el cálculo.
  function computeHoldingsWithWeight() {
    var holdings = computeHoldings();
    var totalHoldingsValue = holdings.reduce(function (s, h) { return s + h.value; }, 0);
    var cash = computeCashByBroker();
    var totalPatrimonio = totalHoldingsValue + Math.max(cash.total, 0);
    holdings.forEach(function (h) { h.weightPct = totalPatrimonio > 0 ? (h.value / totalPatrimonio) * 100 : null; });
    return holdings;
  }

  // Tipo de cambio (EUR por 1 unidad de "currency") en la fecha dada -- último punto conocido
  // con fecha <= dateStr, igual que el "priceOn" de computeAutoEquity pero indexado por divisa
  // (FX_HISTORY) en vez de por activo.
  function fxRateOn(currency, dateStr) {
    var series = FX_HISTORY[currency];
    if (!series || series.length === 0) return null;
    var result = series[0].close;
    for (var i = 0; i < series.length; i++) {
      if (series[i].date > dateStr) break;
      result = series[i].close;
    }
    return result;
  }

  // Rentabilidad de una posición en SU divisa nativa (p.ej. USD), no en euros -- para poder
  // comparar directamente contra lo que muestra el propio bróker (que casi siempre reporta en
  // la divisa del valor, sin efecto de tipo de cambio). No hace falta que el importador ni las
  // transacciones guarden nada en la divisa original: "price"/"fee" en TX ya están en EUR (ver
  // computeHoldings), así que basta con des-convertirlos dividiendo por el tipo de cambio REAL
  // de la fecha de cada operación (fxRateOn) -- misma idea que ya usa el servidor para la curva
  // de precios histórica (fetchFxHistoryToEur/convertPointsToEur), aplicada en el sentido
  // contrario. El precio actual nativo sale de dividir el precio ya convertido a EUR
  // (priceEntry.price) por el ÚLTIMO punto del histórico de esa divisa (el tipo de cambio "de
  // hoy") -- así no hace falta guardar el precio nativo en ningún sitio aparte.
  // Devuelve null si la posición no tiene divisa asignada, si todavía no ha llegado su histórico
  // de tipo de cambio (ver ensureFxHistory), o si no hay coste con el que calcular un % -- el
  // llamante simplemente no pinta nada extra en esos casos.
  function computeNativePnl(key, priceEntry) {
    var currency = priceEntry && priceEntry.auto_currency;
    if (!currency) return null;
    var series = FX_HISTORY[currency];
    if (!series || series.length === 0) return null;

    var qty = 0, nativeCost = 0;
    TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
      if (t.type !== "compra" && t.type !== "venta") return;
      if (assetKey(t) !== key) return;
      var rate = fxRateOn(currency, t.date);
      if (!rate) return; // sin tipo de cambio para esa fecha (raro, solo si falta histórico muy antiguo)
      var q = Number(t.quantity) || 0, priceNative = (Number(t.price) || 0) / rate, feeNative = (Number(t.fee) || 0) / rate;
      if (t.type === "compra") {
        nativeCost += q * priceNative + feeNative;
        qty += q;
      } else {
        var avg = qty > 0 ? nativeCost / qty : 0;
        nativeCost -= avg * Math.min(q, qty);
        qty -= q;
      }
    });
    if (qty <= 0.00001 || nativeCost <= 0) return null;

    var avgNative = nativeCost / qty;
    var todayRate = series[series.length - 1].close;
    if (!todayRate) return null;
    var curNative = (Number(priceEntry.price) || 0) / todayRate;
    var pct = ((curNative - avgNative) / avgNative) * 100;
    var abs = (curNative - avgNative) * qty;
    return { currency: currency, pct: pct, abs: abs };
  }

  /* ---------------- 6. Cálculo de efectivo a partir de operaciones ---------------- */
  // El efectivo es la suma con signo de la columna "amount"/"Importe total" de TODAS las
  // filas, tal cual la reporta el bróker: una compra (BUY) trae amount negativo y resta,
  // una venta (SELL) trae amount positivo y suma, un dividendo o ingreso suma, una retirada
  // resta. No reinterpretamos el signo según el tipo clasificado -- así una fila mal
  // clasificada (p.ej. quedó como "Otro" porque el importador no reconoció el type del CSV)
  // sigue sumando/restando su importe real en vez de desaparecer silenciosamente del
  // cómputo.
  // El "amount" del bróker NO incluye la comisión ni la retención: van en columnas propias
  // (fee/tax en el CSV, combinadas al importar en el único campo "fee", siempre en positivo)
  // y hay que restarlas aparte para que la caja cuadre con el saldo real del bróker.
  // Solo si el importe falta (alta manual sin rellenar "Importe total") se recalcula a
  // partir de cantidad/precio/comisión para compra/venta; para ingreso/retirada/dividendo/
  // otro sin importe no hay forma de saber la cifra, así que no se cuentan.
  function txCashImpact(t) {
    var amount = t.amount != null && t.amount !== "" && !isNaN(Number(t.amount)) ? Number(t.amount) : null;
    var fee = Number(t.fee) || 0;
    if (amount != null) return amount - fee;
    // Una compra/venta de Trade Republic SIN importe no es una compra/venta con coste propio
    // -- es una fila de liquidación/entrega (p.ej. la confirmación de cuántas acciones te
    // asignó una IPO) cuyo coste real ya se cobró aparte, en otra operación de efectivo (la
    // reserva/devolución de la suscripción). Si aquí inventamos un importe a partir de
    // cantidad×precio, ese coste se cuenta dos veces. Igual que con MIGRATION: sin importe,
    // sin efecto de caja propio.
    if (/trade republic/i.test(t.broker || "") && (t.type === "compra" || t.type === "venta")) return 0;
    var qty = Number(t.quantity) || 0, price = Number(t.price) || 0;
    switch (t.type) {
      case "compra": return -(qty * price + fee);
      case "venta": return Math.max(qty * price - fee, 0);
      case "comision": return -fee;
      default: return 0;
    }
  }

  function computeCashByBroker() {
    var byBroker = {};
    TX.forEach(function (t) {
      var b = brokerDisplayName(t.broker);
      byBroker[b] = (byBroker[b] || 0) + txCashImpact(t);
    });
    var total = Object.keys(byBroker).reduce(function (s, k) { return s + byBroker[k]; }, 0);
    return { total: total, byBroker: byBroker };
  }

  // Capital externo neto = dinero real aportado desde el banco ("ingreso") menos lo retirado
  // hacia el banco ("retirada") -- el "DEPOSIT"/"WITHDRAWAL" del modelo de brokerAccounting.js
  // (ver ese archivo para la diferencia entre esta cifra y la rentabilidad de trading por
  // sub-cuenta que ya calcula computeGroupReturn). Deliberadamente NO incluye dividendos,
  // intereses ni traspasos en especie ("otro"): eso es rendimiento generado por la propia
  // cartera, no dinero nuevo puesto por el usuario, así que no debe inflar el capital de
  // referencia de rentabilidadTotalReal.
  // "brokerFilter" opcional -- restringe la suma a los ingresos/retiradas de un solo bróker
  // (comparado por nombre normalizado, ver brokerNormKey) para la verificación de
  // subAccountBreakdownHtml. Sin filtro, agrega toda la cartera igual que siempre.
  function computeCapitalExternoNeto(brokerFilter) {
    return TX.reduce(function (sum, t) {
      if (t.type !== "ingreso" && t.type !== "retirada") return sum;
      if (brokerFilter && brokerNormKey(t.broker) !== brokerNormKey(brokerFilter)) return sum;
      return sum + txCashImpact(t);
    }, 0);
  }

  // Verificación cruzada, deliberadamente simple, de la rentabilidad de un bróker: capital
  // externo neto (SOLO ingresos/retiradas de este bróker) contra el valor actual de todo lo
  // que hay en él (efectivo + posiciones abiertas) -- a diferencia de computeGroupReturn/
  // computeBrokerTotalReturn, no distingue capital reciclado (venta que financia otra compra)
  // de capital nuevo ni depende de cómo se haya clasificado cada operación individual, así que
  // sirve para comparar contra lo que muestra la web/app del propio bróker sin arrastrar
  // ningún matiz de clasificación: si diverge mucho, el problema está en cómo se importaron/
  // clasificaron las operaciones de ESE bróker. Reutiliza computeCapitalExternoNeto (con
  // filtro), computeCashByBroker (ya normalizado) y la misma fórmula de rentabilidad que ya usa
  // la cifra de cartera completa (rentabilidadTotalReal), en vez de reimplementar nada.
  function computeBrokerCapitalVerification(broker) {
    var capitalExternoNeto = computeCapitalExternoNeto(broker);
    var cashBroker = computeCashByBroker().byBroker[brokerDisplayName(broker)] || 0;
    var holdingsValue = computeHoldings().reduce(function (sum, h) {
      return brokerNormKey(h.broker) === brokerNormKey(broker) ? sum + h.value : sum;
    }, 0);
    var valorActual = cashBroker + holdingsValue;
    return {
      capitalExternoNeto: capitalExternoNeto,
      valorActual: valorActual,
      rentabilidadPct: window.BrokerAccounting.calcularRentabilidadSobreCapital(valorActual, capitalExternoNeto)
    };
  }

  /* ---------------- 7. Dividendos e intereses recibidos ---------------- */
  // Agrupa todas las operaciones tipo "dividendo" por activo+bróker de origen. En Trade
  // Republic la retribución por tener efectivo sin invertir llega con category
  // "INTEREST_PAYMENT", que classifyTypeTradeRepublic ya clasifica como "dividendo" (ver
  // /INTEREST/.test(combined)) -- normalmente sin nombre de activo asociado, así que cae en el
  // grupo "Intereses / efectivo" en vez de perderse mezclado sin más en el total de caja.
  function computeDividends() {
    var rows = TX.filter(function (t) { return t.type === "dividendo"; });
    var total = 0;
    var byGroup = {};
    rows.forEach(function (t) {
      var amount = txCashImpact(t);
      total += amount;
      var assetLabel = t.name || t.ticker || "Intereses / efectivo";
      var broker = brokerDisplayName(t.broker);
      var key = assetLabel + "|||" + broker;
      if (!byGroup[key]) byGroup[key] = { label: assetLabel + " (" + broker + ")", value: 0 };
      byGroup[key].value += amount;
    });
    var breakdown = Object.keys(byGroup).map(function (k) { return byGroup[k]; })
      .sort(function (a, b) { return b.value - a.value; });
    return { total: total, count: rows.length, breakdown: breakdown };
  }

  /* ---------------- 8. Economía doméstica (independiente de Cartera) ---------------- */
  function currentMonthStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }
  // Mes anterior al actual -- se usa para el resumen de ingresos/gastos del hero (ver
  // renderDashboard): los movimientos de un mes normalmente se vuelcan una vez cerrado, así
  // que el mes en curso casi siempre está vacío a medio mes; el mes anterior ya tiene datos.
  function previousMonthStr() {
    var d = new Date();
    var prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return prev.getFullYear() + "-" + pad2(prev.getMonth() + 1);
  }

  // Avanza una fecha YYYY-MM-DD un mes, con el día recortado al último día del mes destino
  // (p.ej. 31 ene -> 28/29 feb) en vez de dejar que Date.setMonth() se "desborde" al mes
  // siguiente (31 ene + 1 mes con setMonth da 3 marzo, no 28 feb) -- usado por "Repetir el mes
  // que viene" en movimientos recurrentes.
  function addOneMonthClamped(dateStr) {
    var parts = dateStr.split("-").map(Number);
    var y = parts[0], m0 = parts[1] - 1, day = parts[2];
    var nextY = y + (m0 + 1 >= 12 ? 1 : 0);
    var next0 = (m0 + 1) % 12;
    var daysInNextMonth = new Date(nextY, next0 + 1, 0).getDate();
    return nextY + "-" + pad2(next0 + 1) + "-" + pad2(Math.min(day, daysInNextMonth));
  }

  // % de reparto de una cuenta -- 100 si el movimiento no tiene cuenta asignada ("Sin cuenta")
  // o si apunta a una cuenta que ya no existe (borrada), para no perder de vista ese importe.
  function accountSplitPct(accountId) {
    if (!accountId) return 100;
    var acc = ACCOUNTS.find(function (a) { return a.id === accountId; });
    return acc ? Number(acc.split_pct) : 100;
  }
  function accountNameFor(accountId) {
    if (!accountId) return "—";
    var acc = ACCOUNTS.find(function (a) { return a.id === accountId; });
    return acc ? acc.name : "—";
  }
  // Si esta cuenta genera ingresos reales -- true por defecto ("Sin cuenta" o cuenta borrada
  // siguen contando, mismo criterio que accountSplitPct). Falso para cuentas como Domiciliaciones/
  // Conjunta que solo reciben traspasos desde Nómina: el importador CSV preselecciona
  // "Transferencia interna" en vez de "Ingreso" para sus abonos (ver household-btn-preview-csv).
  function accountIsIncomeSource(accountId) {
    if (!accountId) return true;
    var acc = ACCOUNTS.find(function (a) { return a.id === accountId; });
    return !acc || acc.income_source !== 0;
  }
  // <option> compartidas por todos los desplegables de cuenta (formulario manual, importador
  // CSV, reasignación en bloque) -- muestra el % junto al nombre para elegir a ciegas sin tener
  // que ir a comprobarlo en "⚙ Cuentas".
  function accountOptionsHtml(selectedId, emptyLabel) {
    var html = '<option value="">' + escapeHtml(emptyLabel || "Sin cuenta") + "</option>";
    html += ACCOUNTS.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === selectedId ? " selected" : "") + '>' + escapeHtml(a.name) + " (" + a.split_pct + "%)</option>";
    }).join("");
    return html;
  }
  // Importe real de un movimiento tras aplicar el % de su cuenta -- se aplica igual a ingresos
  // y gastos (decisión del usuario: el % es "qué parte de esto es mío", no solo para gastos).
  function realShare(h) {
    return (Number(h.amount) || 0) * (accountSplitPct(h.account_id) / 100);
  }

  // income/expense/savings son el IMPORTE REAL (tras reparto) -- es el número principal en
  // todo Economía (resumen mensual, evolución mes a mes, análisis por categoría), así que el
  // gráfico y los chips que ya consumen estos campos no necesitan tocarse aparte.
  // incomeTotal/expenseTotal guardan el importe registrado sin repartir, como dato secundario.
  // "transferencia" y "aportacion_tercero" se excluyen por completo (ninguna es ingreso ni gasto
  // real del usuario, ver HOUSEHOLD_NEUTRAL_TYPES) -- antes de esto, cualquier tipo que no fuera
  // "ingreso" caía en la rama "else" y se contaba como gasto, así que sin esta exclusión
  // explícita una transferencia (o una aportación de tercero) se habría sumado como gasto por error.
  function computeHouseholdMonthly() {
    var byMonth = {};
    HOUSEHOLD.forEach(function (h) {
      var m = (h.date || "").slice(0, 7);
      if (!m || HOUSEHOLD_NEUTRAL_TYPES[h.type]) return;
      if (!byMonth[m]) byMonth[m] = { month: m, income: 0, expense: 0, incomeTotal: 0, expenseTotal: 0 };
      var amt = Number(h.amount) || 0;
      var real = realShare(h);
      if (h.type === "ingreso") { byMonth[m].income += real; byMonth[m].incomeTotal += amt; }
      else if (h.type === "gasto") { byMonth[m].expense += real; byMonth[m].expenseTotal += amt; }
    });
    return Object.keys(byMonth).sort().map(function (k) {
      var b = byMonth[k];
      return {
        month: k, income: b.income, expense: b.expense, savings: b.income - b.expense,
        incomeTotal: b.incomeTotal, expenseTotal: b.expenseTotal
      };
    });
  }

  // Lista de meses (YYYY-MM, orden descendente) con movimientos -- la usa renderMonthPicker
  // (ver más abajo) solo para saber qué AÑOS ofrecer en la vista de años del selector de mes
  // compartido de Economía (Resumen y Operaciones); dentro de un año ya elegido, el picker deja
  // elegir cualquier mes, tenga o no movimientos. A diferencia de computeHouseholdMonthly() (que
  // solo cuenta ingreso/gasto, ver HOUSEHOLD_NEUTRAL_TYPES), aquí cuenta CUALQUIER movimiento --
  // una transferencia o aportación de tercero también debe poder marcar su año como navegable.
  // Se fuerzan siempre el mes actual y el anterior aunque no tengan movimientos todavía, para que
  // sus años aparezcan incluso en una instalación nueva sin histórico.
  function householdAllMonths() {
    var monthSet = {};
    HOUSEHOLD.forEach(function (h) { var m = (h.date || "").slice(0, 7); if (m) monthSet[m] = true; });
    monthSet[currentMonthStr()] = true;
    monthSet[previousMonthStr()] = true;
    return Object.keys(monthSet).sort().reverse();
  }

  // Desglose por cuenta de un mes concreto -- para la tabla "Por cuenta" del resumen mensual:
  // cuánto se registró en cada cuenta y cuánto es realmente del usuario tras su %. Incluye un
  // grupo "Sin cuenta" si hay movimientos sueltos sin cuenta asignada ese mes. thirdParty es el
  // total de "aportacion_tercero" de esa cuenta ese mes -- puramente informativo (ver
  // HOUSEHOLD_NEUTRAL_TYPES), nunca entra en income/expense/incomeReal/expenseReal.
  function computeHouseholdByAccountForMonth(monthStr) {
    var byAccount = {};
    HOUSEHOLD.forEach(function (h) {
      if ((h.date || "").slice(0, 7) !== monthStr || h.type === "transferencia") return;
      var key = h.account_id || "";
      if (!byAccount[key]) {
        var acc = key ? ACCOUNTS.find(function (a) { return a.id === key; }) : null;
        byAccount[key] = {
          name: acc ? acc.name : "Sin cuenta", splitPct: acc ? Number(acc.split_pct) : 100,
          thirdPartyName: acc ? acc.third_party_name : null,
          income: 0, expense: 0, incomeReal: 0, expenseReal: 0, thirdParty: 0
        };
      }
      var amt = Number(h.amount) || 0, real = realShare(h);
      if (h.type === "ingreso") { byAccount[key].income += amt; byAccount[key].incomeReal += real; }
      else if (h.type === "gasto") { byAccount[key].expense += amt; byAccount[key].expenseReal += real; }
      else if (h.type === "aportacion_tercero") { byAccount[key].thirdParty += amt; }
    });
    return Object.keys(byAccount).map(function (k) { return byAccount[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "es"); });
  }

  /* ---------------- 9. Detección de traspasos Economía <-> Cartera ---------------- */
  // Dos direcciones -- antes solo se cubría la primera, ver feedback del usuario 2026-07-18
  // ("los traspasos... no tienen en cuenta los retiros de un bróker, hay una transacción que
  // cuenta como ingreso cuando es un retiro"):
  //  - "in" (dinero HACIA el bróker): un gasto de Economía que en realidad es dinero movido al
  //    bróker para invertir aparece también como "ingreso" en Cartera (mismo importe, misma
  //    fecha) si el usuario lo registró ahí.
  //  - "out" (dinero DESDE el bróker): una retirada de Cartera que vuelve a las cuentas del día
  //    a día aparece también como "ingreso" en Economía (mismo importe, misma fecha) -- y sin
  //    reclasificar, ese "ingreso" infla Ingresos/Ahorro como si fuera dinero nuevo (nómina,
  //    etc.) cuando en realidad es capital que ya era tuyo, solo movido de sitio.
  // Los dos casos buscan pares por coincidencia EXACTA de fecha + importe (0,5 céntimos de
  // margen por redondeo de coma flotante). household.amount siempre es positivo (ver
  // Math.abs en server.js); un "ingreso" de Cartera también es positivo por convención, pero una
  // "retirada" se guarda en NEGATIVO (resta caja, ver txCashImpact) -- por eso el caso "out"
  // compara contra el valor absoluto del importe de la retirada, a diferencia del caso "in".
  // Emparejamiento 1 a 1 en cada dirección por separado: cada operación de Cartera se usa como
  // mucho una vez, para que dos coincidencias casuales el mismo día por el mismo importe no se
  // cuelen ambas contra la misma operación real.
  function detectPortfolioTransfers() {
    var carteraIncomes = TX.filter(function (t) { return t.type === "ingreso"; });
    var carteraWithdrawals = TX.filter(function (t) { return t.type === "retirada"; });
    var usedTxIds = {};
    var matches = [];
    HOUSEHOLD.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).forEach(function (h) {
      var amt = Number(h.amount) || 0;
      if (h.type === "gasto") {
        var incomeMatch = carteraIncomes.find(function (t) {
          return !usedTxIds[t.id] && t.date === h.date && Math.abs((Number(t.amount) || 0) - amt) < 0.005;
        });
        if (!incomeMatch) return;
        usedTxIds[incomeMatch.id] = true;
        matches.push({
          householdId: h.id, date: h.date, amount: amt, category: h.category,
          txId: incomeMatch.id, txBroker: incomeMatch.broker || "Sin especificar", direction: "in"
        });
      } else if (h.type === "ingreso") {
        var withdrawalMatch = carteraWithdrawals.find(function (t) {
          return !usedTxIds[t.id] && t.date === h.date && Math.abs(Math.abs(Number(t.amount) || 0) - amt) < 0.005;
        });
        if (!withdrawalMatch) return;
        usedTxIds[withdrawalMatch.id] = true;
        matches.push({
          householdId: h.id, date: h.date, amount: amt, category: h.category,
          txId: withdrawalMatch.id, txBroker: withdrawalMatch.broker || "Sin especificar", direction: "out"
        });
      }
    });
    return matches;
  }

  // Recorta la lista de meses (ya calculada por computeHouseholdMonthly) a los últimos N meses
  // COMPLETOS -- period: "all" (sin recortar) o un número de meses en forma de string ("12"/
  // "6"/"3"), mismo esquema que computeExpenseByCategory pero sin "current" (aquí siempre
  // interesa una serie de varios meses, no uno solo).
  // El mes en curso NUNCA cuenta para "últimos N meses": muchos bancos/brokers se importan a
  // mes vencido, así que el mes actual suele llegar vacío o a medias -- si contara, "últimos 3
  // meses" mostraría 2 meses reales + 1 mes en curso incompleto en vez de 3 meses reales. Se
  // descarta primero y se retrocede un mes extra el punto de partida para compensarlo.
  function filterMonthsByPeriod(months, period) {
    if (period === "all") return months;
    var n = parseInt(period, 10);
    if (!n) return months;
    var curMonth = currentMonthStr();
    var d = new Date();
    d.setMonth(d.getMonth() - n);
    var startM = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    return months.filter(function (m) { return m.month >= startM && m.month !== curMonth; });
  }

  // Gastos agrupados por categoría dentro de un periodo -- period: "all" (todo el histórico),
  // "current" (solo el mes en curso), o un número de meses hacia atrás desde hoy ("12"/"6"/"3")
  // en forma de string, como llega del <select> del periodo en Análisis.
  function computeExpenseByCategory(period) {
    var result = {};
    var currentM = currentMonthStr();
    var startM = null;
    if (period !== "all" && period !== "current") {
      var d = new Date();
      d.setMonth(d.getMonth() - (parseInt(period, 10) - 1));
      startM = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    }
    HOUSEHOLD.forEach(function (h) {
      if (h.type !== "gasto") return;
      var m = (h.date || "").slice(0, 7);
      if (period === "current" && m !== currentM) return;
      if (startM && m < startM) return;
      var cat = h.category || "Sin categoría";
      result[cat] = (result[cat] || 0) + realShare(h);
    });
    return result;
  }

  // Misma agrupación que computeExpenseByCategory pero acotada a UN mes exacto ("aaaa-mm") en
  // vez de un periodo relativo a hoy -- la usa el desglose por categoría de Resumen, que sigue el
  // mismo mes que su propio selector (householdSelectedMonth), no necesariamente el mes en curso.
  function computeExpenseByCategoryForMonth(month) {
    var result = {};
    HOUSEHOLD.forEach(function (h) {
      if (h.type !== "gasto") return;
      if ((h.date || "").slice(0, 7) !== month) return;
      var cat = h.category || "Sin categoría";
      result[cat] = (result[cat] || 0) + realShare(h);
    });
    return result;
  }

  // Misma agrupación que el donut pero como lista ordenada con importe exacto + % -- el donut
  // (donutSvg) ya calcula un legendHtml con el %, pero no muestra el importe, y aquí interesan
  // las dos cifras a la vez para comparar categorías con precisión.
  function categoryRankingHtml(dataObj) {
    var entries = Object.keys(dataObj).map(function (k) { return { label: k, value: dataObj[k] }; }).filter(function (e) { return e.value > 0; });
    if (entries.length === 0) return "<li>Sin gastos en este periodo</li>";
    entries.sort(function (a, b) { return b.value - a.value; });
    var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
    return entries.map(function (e) {
      var pct = total > 0 ? (e.value / total) * 100 : 0;
      return '<li><span>' + escapeHtml(e.label) + '</span><span class="mono money">' + fmtMoney(e.value) + " · " + pct.toFixed(1) + "%</span></li>";
    }).join("");
  }

  /* ---------------- 10. Métricas de cartera ---------------- */
  function computeMetrics() {
    var holdings = computeHoldings();
    var totalHoldingsValue = holdings.reduce(function (s, h) { return s + h.value; }, 0);
    var valuations = VAL.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    var points = [], maxDD = 0, cumIndex = null, totalReturn = null, cagr = null, totalDays = 0;
    if (valuations.length >= 1) {
      cumIndex = 100;
      var peak = 100;
      points.push({ date: valuations[0].date, value: valuations[0].value, index: 100, dd: 0 });
      for (var i = 1; i < valuations.length; i++) {
        var prev = valuations[i - 1], curr = valuations[i];
        var cf = Number(curr.cashflow) || 0;
        var periodReturn = prev.value > 0 ? (curr.value - prev.value - cf) / prev.value : 0;
        cumIndex = cumIndex * (1 + periodReturn);
        peak = Math.max(peak, cumIndex);
        var dd = peak > 0 ? ((cumIndex - peak) / peak) * 100 : 0;
        maxDD = Math.min(maxDD, dd);
        points.push({ date: curr.date, value: curr.value, index: cumIndex, dd: dd });
      }
      totalReturn = cumIndex - 100;
      var first = new Date(valuations[0].date + "T00:00:00");
      var last = new Date(valuations[valuations.length - 1].date + "T00:00:00");
      totalDays = Math.max(1, Math.round((last - first) / (1000 * 3600 * 24)));
      var years = totalDays / 365.25;
      cagr = years > 0 ? (Math.pow(cumIndex / 100, 1 / years) - 1) * 100 : null;
    }

    var best = null, worst = null;
    holdings.forEach(function (h) {
      if (h.pnlPct === null) return;
      if (best === null || h.pnlPct > best.pnlPct) best = h;
      if (worst === null || h.pnlPct < worst.pnlPct) worst = h;
    });

    var cash = computeCashByBroker();
    // Patrimonio total = valor de las posiciones abiertas + efectivo de TODOS los brokers (con
    // su signo real -- puede salir negativo si falta importar algún ingreso). Antes solo sumaba
    // las posiciones y se olvidaba del efectivo, así que el patrimonio total salía
    // sistemáticamente por debajo del real para cualquiera con saldo en cuenta. Si no hay
    // ninguna operación registrada (solo valoraciones manuales, sin importar nada), se cae a la
    // última valoración manual como aproximación, igual que antes.
    var totalValue = TX.length > 0 ? (totalHoldingsValue + cash.total) : (valuations.length ? valuations[valuations.length - 1].value : 0);

    // Rentabilidad TOTAL real de la cartera (rentabilidadTotalPortfolio de brokerAccounting.js,
    // ver ese archivo para el porqué): patrimonio actual (posiciones + efectivo de TODOS los
    // brokers) contra el capital externo neto realmente aportado desde el banco. A propósito
    // reutiliza totalHoldingsValue/cash.total ya calculados arriba (que ya tienen en cuenta
    // comisiones, dividendos, intereses y traspasos en especie) en vez de recalcular el saldo
    // de caja con el ledger reducido de 4 tipos del módulo -- ese ledger reducido solo conoce
    // BUY/SELL/DEPOSIT/WITHDRAWAL y perdería esos matices. Es una cifra DISTINTA de la
    // rentabilidad por sub-cuenta de computeGroupReturn (desglose de Cartera > Resumen): esa
    // responde "¿cómo me ha ido comprando/vendiendo dentro de este bróker/sub-cuenta?", esta
    // responde "¿cuánto he ganado con el dinero que he puesto de mi bolsillo?" -- no deben
    // confundirse en la UI.
    var capitalExternoNeto = computeCapitalExternoNeto();
    var rentabilidadTotalReal = window.BrokerAccounting.calcularRentabilidadSobreCapital(totalHoldingsValue + cash.total, capitalExternoNeto);

    var allocByType = {}, allocByBroker = {};
    holdings.forEach(function (h) {
      allocByType[h.type] = (allocByType[h.type] || 0) + h.value;
      allocByBroker[brokerDisplayName(h.broker)] = (allocByBroker[brokerDisplayName(h.broker)] || 0) + h.value;
    });

    // Distribución por activo individual (Apple, Nvidia...) + efectivo, para ver qué % de la
    // cartera total representa cada cosa. Se agrupa por nombre para juntar el mismo activo si
    // lo tienes repartido entre varios brókers.
    var allocByAsset = {};
    holdings.forEach(function (h) {
      var label = h.name || h.ticker || "(sin nombre)";
      allocByAsset[label] = (allocByAsset[label] || 0) + h.value;
    });
    if (cash.total > 0) allocByAsset["Efectivo"] = (allocByAsset["Efectivo"] || 0) + cash.total;

    return { holdings: holdings, totalHoldingsValue: totalHoldingsValue, points: points, maxDD: maxDD, totalReturn: totalReturn, cagr: cagr, totalDays: totalDays, best: best, worst: worst, totalValue: totalValue, allocByType: allocByType, allocByBroker: allocByBroker, allocByAsset: allocByAsset, cash: cash, capitalExternoNeto: capitalExternoNeto, rentabilidadTotalReal: rentabilidadTotalReal };
  }

  // Rentabilidad SIMPLE (no ponderada por tiempo) de un grupo del desglose por sub-cuenta de un
  // bróker. Primera versión: "invertido" = suma de TODAS las compras, "recuperado" = ventas +
  // dividendos + valor actual -- verificada contra el caso de prueba del usuario (coincidía
  // exacto), pero probada con datos reales dio las MISMAS cifras que la versión anterior (suma
  // simple con txCashImpact), confirmando que el problema no era "amount" sino la reinversión:
  // el usuario vende y recompra con frecuencia, y sumar TODAS las compras cuenta el mismo dinero
  // otra vez como "capital nuevo" cada vez que se reinvierte, diluyendo el %.
  //
  // Arreglo: en vez de "invertido" = suma de compras, se lleva un "capital" que solo crece con
  // dinero que NO se pudo pagar con caja ya disponible dentro del propio grupo (de una venta o
  // dividendo anterior DEL MISMO grupo) -- capital "de verdad nuevo", no reinvertido. Sigue
  // siendo una fórmula simple de una sola pasada (sin encadenar variaciones día a día como TWR,
  // sin resolver ninguna ecuación como IRR), pero ahora reinvertir no diluye el %: comprar con
  // dinero que ya tenías dentro no aumenta el capital de referencia. Verificado que con el caso
  // de prueba del usuario (sin reinversión) da exactamente el mismo resultado que la versión
  // anterior (+27,77%), y que con reinversión total (vender y recomprar 4 veces seguidas con
  // +10% cada vez) da ~46% en vez del ~10% que daba sumar todas las compras.
  //
  // También incorpora los traspasos en especie descubiertos con datos reales (filas tipo "Otro"
  // con cantidad y precio pero importe 0 -- p.ej. Walt Disney en Trade Republic, confirmado con
  // el usuario que no llevan ningún dividendo asociado): se tratan como un dividendo pagado en
  // acciones -- su valor en el momento de llegar se suma a la caja disponible del grupo (no al
  // capital nuevo) y su cantidad entra en la posición, para que cuenten en el valor mientras se
  // mantienen y no aparezcan como ganancia gratis sin coste si luego se venden.
  //
  // % alternativo "estilo Trade Republic" -- reverse-engineered comparando el desglose de
  // Wallet Cripto contra la cifra real de Trade Republic (verificado 2026-07-17: con Capital
  // nuevo 35.191,39€/Disponible 31.494,64€/Valor 10.052,01€/Compras 68.992,04€/Ventas
  // 65.295,12€/Dividendos 0,17€, esta fórmula da +171,91%, que coincide con el +171% real,
  // mientras que la fórmula principal -- "capital nuevo", ver comentario de computeGroupReturn
  // -- da +18%). Trade Republic parece usar "compras − ventas − dividendos" como base de
  // inversión en vez de nuestro "capital nuevo": cuando se ha vendido casi tanto como
  // comprado dentro del grupo (mucho trading, como en Wallet Cripto) esa base se queda
  // pequeñísima y la misma ganancia en euros, dividida entre una base minúscula, dispara el %
  // -- es matemáticamente inestable (si se ha vendido en total más de lo comprado, la base es
  // negativa o cero) y por eso NO sustituye a la fórmula principal, solo se enseña aparte para
  // poder comparar directamente contra el bróker (ver subAccountBreakdownHtml). Con grupos sin
  // reinversión sobrante ("Disponible" en 0, p.ej. Cuenta de valores) esta fórmula colapsa a
  // ser idéntica a la principal, así que ahí ambas ya coincidían.
  function computeReturnPctTR(counts, currentValue) {
    var netInvertidoTR = (counts.sumaCompras || 0) - (counts.sumaVentas || 0) - (counts.sumaDividendos || 0) - (counts.sumaTraspasos || 0);
    if (netInvertidoTR <= 0) return null;
    return ((currentValue - netInvertidoTR) / netInvertidoTR) * 100;
  }

  // "groupFilter": una sub-cuenta real (prices.sub_account), BOND_TYPE ("Renta fija") o
  // UNCLASSIFIED ("Sin clasificar") -- mismo vocabulario que brokerSubAccountBuckets.
  function computeGroupReturn(broker, groupFilter) {
    var isBondGroup = groupFilter === BOND_TYPE;
    var isInterestGroup = groupFilter === CASH_INTEREST_GROUP;
    var subAccounts = isBondGroup ? null : resolveHoldingSubAccounts();
    function matchesGroup(key) {
      return groupFilter === UNCLASSIFIED ? !subAccounts[key] : subAccounts[key] === groupFilter;
    }
    var priceMap = {};
    PRICES.forEach(function (p) { priceMap[p.asset_key] = p; });

    var capital = 0, available = 0, qty = {}, bondHeld = {};
    // Recuento por tipo de operación SOLO para depurar (contarBuys/Sells/... y sus sumas en
    // bruto, sin la lógica de "capital nuevo") -- se expone en el resultado para poder comparar
    // estas cifras contra lo que el usuario sabe de sus propias operaciones sin tener que
    // revisarlas una a una, cuando el % calculado no cuadra con lo que reporta el bróker.
    var counts = { compra: 0, venta: 0, dividendo: 0, traspaso: 0, sumaCompras: 0, sumaVentas: 0, sumaDividendos: 0, sumaTraspasos: 0 };
    TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
      if (brokerNormKey(t.broker) !== brokerNormKey(broker)) return;
      var key = assetKey(t);
      var isBondLike = t.type === "otro" && BOND_TICKER_RE.test((t.ticker || "").trim().toUpperCase());
      if (isBondGroup) {
        if (!isBondLike) return;
        var bondImpact = txCashImpact(t);
        if (bondImpact < 0) { capital += -bondImpact; bondHeld[key] = (bondHeld[key] || 0) + (-bondImpact); }
        else { available += bondImpact; bondHeld[key] = 0; }
        return;
      }
      // Bucket de intereses (ver CASH_INTEREST_GROUP): se calcula aparte de cualquier sub-cuenta
      // real porque estas filas no tienen ticker/nombre al que asociarlas.
      if (isInterestGroup) {
        if (!isCashInterestTx(t)) return;
        var interestImpact = txCashImpact(t);
        available += interestImpact;
        counts.dividendo++; counts.sumaDividendos += interestImpact;
        return;
      }
      if (isBondLike) return;
      // El interés ya se cuenta aparte en CASH_INTEREST_GROUP -- sin esto, como no tiene ticker
      // ni sub-cuenta asignable, matchesGroup(UNCLASSIFIED) lo aceptaría también aquí y el mismo
      // importe aparecería duplicado en dos barras distintas del desglose.
      if (isCashInterestTx(t)) return;
      if (t.type !== "compra" && t.type !== "venta" && t.type !== "dividendo" && t.type !== "otro") return;
      if (!matchesGroup(key)) return;
      var q = Number(t.quantity) || 0, price = Number(t.price) || 0, fee = Number(t.fee) || 0;
      if (t.type === "compra") {
        var cost = q * price + fee;
        var fundedFromAvailable = Math.min(Math.max(available, 0), cost);
        available -= fundedFromAvailable;
        capital += cost - fundedFromAvailable;
        qty[key] = (qty[key] || 0) + q;
        counts.compra++; counts.sumaCompras += cost;
      } else if (t.type === "venta") {
        var proceeds = q * price - fee;
        available += proceeds;
        qty[key] = (qty[key] || 0) - q;
        counts.venta++; counts.sumaVentas += proceeds;
      } else if (t.type === "dividendo") {
        var divImpact = txCashImpact(t);
        available += divImpact;
        counts.dividendo++; counts.sumaDividendos += divImpact;
      } else {
        // "otro" (no bono): solo cuenta si es un traspaso en especie -- cantidad>0 y sin importe
        // en efectivo. El resto de "otro" (comisiones sueltas, ajustes de caja sin activo) se
        // ignora, igual que antes.
        var hasCashAmount = t.amount != null && t.amount !== "" && !isNaN(Number(t.amount)) && Number(t.amount) !== 0;
        if (hasCashAmount || q <= 0) return;
        var traspasoValue = q * price;
        available += traspasoValue;
        qty[key] = (qty[key] || 0) + q;
        counts.traspaso++; counts.sumaTraspasos += traspasoValue;
      }
    });

    var currentValue = 0;
    if (isBondGroup) {
      Object.keys(bondHeld).forEach(function (k) { currentValue += bondHeld[k]; });
    } else {
      Object.keys(qty).forEach(function (k) {
        if (qty[k] <= 0.00001) return;
        var pe = priceMap[k];
        if (pe) currentValue += qty[k] * pe.price;
      });
    }

    // El bucket "Efectivo" nunca tiene "capital" (no es una inversión, es dinero parado) -- un %
    // de rentabilidad no tendría sentido, así que en la barra se enseña el efectivo TOTAL del
    // bróker (computeCashByBroker, misma cifra que "Efectivo por bróker") en vez de solo lo
    // acumulado en intereses -- "available"/counts.sumaDividendos siguen guardando solo el
    // interés (se ven en el desglose de cifras) por si hace falta comparar cuánto de ese
    // efectivo vino de intereses frente al saldo total.
    if (isInterestGroup) {
      var totalCashBroker = computeCashByBroker().byBroker[brokerDisplayName(broker)] || 0;
      return { hasData: true, returnPct: null, returnPctTR: null, value: totalCashBroker, capital: 0, available: available, counts: counts };
    }

    if (capital <= 0) return { hasData: false, returnPct: null, returnPctTR: computeReturnPctTR(counts, currentValue), value: currentValue, capital: capital, available: available, counts: counts };
    var returnPct = ((available + currentValue - capital) / capital) * 100;
    return { hasData: true, returnPct: returnPct, returnPctTR: computeReturnPctTR(counts, currentValue), value: currentValue, capital: capital, available: available, counts: counts };
  }

  // Misma fórmula que computeGroupReturn, pero sin filtrar por grupo -- para brokers que no
  // usan sub-cuentas (p.ej. Interactive Brokers, una única cuenta) y para los que el desglose
  // por sub-cuenta no tiene nada que enseñar (brokerSubAccountBuckets da 0-1 grupos). En vez de
  // reescribir computeGroupReturn para que admita "todos los grupos a la vez" (arriesgaría el
  // cálculo por sub-cuenta de Trade Republic, ya verificado con datos reales), se duplica su
  // misma contabilidad por transacción pero fusionando las tres ramas (grupo real / BOND_TYPE /
  // CASH_INTEREST_GROUP) en una sola pasada: todo lo del bróker (compra, venta, dividendo --
  // incluidos los intereses de efectivo, que aquí no necesitan bucket aparte porque no hay
  // "Sin clasificar" del que escapar -- y traspaso en especie/bonos vía "otro") cae en el mismo
  // capital/disponible/posiciones.
  // "broker" es opcional -- sin él, agrega TODA la cartera (lo usa computeAutoEquity para el
  // chip de rentabilidad de la pestaña Histórico, que no filtra por bróker).
  // NOTA (2026-07-17): la versión anterior de esta función tenía dos bugs que hacían que, con
  // el CSV real de Interactive Brokers del usuario, diera 1,42%/2,09% en vez del 7,71% que
  // reporta el propio bróker -- un comentario de esta misma función afirmaba estar "verificada
  // a mano" contra ese CSV, pero no lo estaba (ver memoria "Verify before claiming done").
  // Bug 1: las compras de bonos/T-Bills siempre sumaban a "capital" entero, sin descontar el
  // efectivo ya disponible (a diferencia de una compra normal, que sí usa esa caja antes de
  // contar capital nuevo) -- así que cada vencimiento+recompra de T-Bill (dinero que NUNCA sale
  // de la cuenta) se contaba como aportación de capital nueva, diluyendo el % hacia casi cero.
  // Bug 2: cualquier fila "Otro" con importe en efectivo pero sin ser un traspaso en especie
  // (el ajuste de FX Translations P&L, comisiones sueltas, intereses de deudor/acreedor,
  // retenciones de impuestos sobre dividendos e intereses) se descartaba del todo -- ni sumaba
  // ni restaba nada, perdiendo ganancias y costes reales de la cuenta.
  // Arreglo: en vez de una rama distinta por tipo de operación, se recorren TODAS las filas
  // (excepto ingreso/retirada, que son capital externo y no rentabilidad de trading) y se les
  // aplica la MISMA lógica de "capital nuevo" ya usada para compras normales, a partir del
  // impacto de caja real de cada una (txCashImpact, la misma fuente que ya usa "Efectivo por
  // bróker" así que nada quedaría descuadrado entre las dos vistas): si el impacto es negativo
  // (compra, bono, comisión, interés deudor, retención), se paga primero con caja ya disponible
  // del propio bróker y solo lo que falte cuenta como capital nuevo; si es positivo (venta,
  // dividendo, vencimiento de bono, ajuste a favor, traspaso en especie), engorda la caja
  // disponible para financiar la siguiente compra sin diluir el %.
  function computeBrokerTotalReturn(broker) {
    var priceMap = {};
    PRICES.forEach(function (p) { priceMap[p.asset_key] = p; });

    var capital = 0, available = 0, qty = {}, bondHeld = {};
    var counts = { compra: 0, venta: 0, dividendo: 0, traspaso: 0, sumaCompras: 0, sumaVentas: 0, sumaDividendos: 0, sumaTraspasos: 0 };
    TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (t) {
      if (broker && brokerNormKey(t.broker) !== brokerNormKey(broker)) return;
      if (t.type === "ingreso" || t.type === "retirada") return;
      var key = assetKey(t);
      var isBondLike = t.type === "otro" && BOND_TICKER_RE.test((t.ticker || "").trim().toUpperCase());
      // Traspaso en especie: cantidad>0 sin importe en efectivo -- su valor entra directo en la
      // caja disponible (como un dividendo pagado en acciones) sin pasar por capital nuevo.
      var q = Number(t.quantity) || 0, price = Number(t.price) || 0;
      var isInKindTransfer = t.type === "otro" && !isBondLike &&
        !(t.amount != null && t.amount !== "" && !isNaN(Number(t.amount)) && Number(t.amount) !== 0) && q > 0;
      var impact = isInKindTransfer ? (q * price) : txCashImpact(t);

      if (impact < 0) {
        var cost = -impact;
        var fundedFromAvailable = Math.min(Math.max(available, 0), cost);
        available -= fundedFromAvailable;
        capital += cost - fundedFromAvailable;
      } else {
        available += impact;
      }

      if (t.type === "compra") { qty[key] = (qty[key] || 0) + q; counts.compra++; counts.sumaCompras += Math.max(-impact, 0); }
      else if (t.type === "venta") { qty[key] = (qty[key] || 0) - q; counts.venta++; counts.sumaVentas += Math.max(impact, 0); }
      else if (t.type === "dividendo") { counts.dividendo++; counts.sumaDividendos += impact; }
      else if (isBondLike) { bondHeld[key] = impact < 0 ? (bondHeld[key] || 0) + (-impact) : 0; }
      else if (isInKindTransfer) { qty[key] = (qty[key] || 0) + q; counts.traspaso++; counts.sumaTraspasos += impact; }
    });

    var currentValue = 0;
    Object.keys(qty).forEach(function (k) {
      if (qty[k] <= 0.00001) return;
      var pe = priceMap[k];
      if (pe) currentValue += qty[k] * pe.price;
    });
    Object.keys(bondHeld).forEach(function (k) { currentValue += bondHeld[k]; });

    if (capital <= 0) return { hasData: false, returnPct: null, returnPctTR: computeReturnPctTR(counts, currentValue), value: currentValue, capital: capital, available: available, counts: counts };
    var returnPct = ((available + currentValue - capital) / capital) * 100;
    return { hasData: true, returnPct: returnPct, returnPctTR: computeReturnPctTR(counts, currentValue), value: currentValue, capital: capital, available: available, counts: counts };
  }

  /* ---------------- 11. Curva de rentabilidad automática (histórico de precios) ---------------- */
  // A diferencia de computeMetrics() (que usa las valoraciones manuales que registras a mano),
  // esto reconstruye el valor de la cartera desde el histórico de precios de las posiciones con
  // fuente asignada (Posiciones > Fuente). En cada fecha de compra/venta se usa el precio real
  // de esa operación -- no el cierre histórico de ese día -- como valor de ese instante, así una
  // posición ya vendida queda con su rentabilidad realizada (precio de compra vs. precio de
  // venta real) incorporada para siempre al índice acumulado, en vez de desaparecer del cálculo
  // en cuanto se cierra (igual que ocurre hoy en Posiciones, que solo muestra lo abierto).
  // Los activos sin fuente de precio asignada (o con fuente pero sin histórico descargado
  // todavía) no entran en el cálculo -- no se inventa un valor, se piden en la interfaz.
  // Agrupar+ordenar PRICE_HISTORY por asset_key es lo mismo sea cual sea brokerFilter -- se
  // cachea contra la propia referencia del array (PRICE_HISTORY solo se reasigna a un array
  // NUEVO cuando de verdad llega histórico nuevo, ver app.js:338,3061), así que sirve de caché
  // válida entre llamadas mientras no cambie. Sin esto, con un histórico grande (miles de filas)
  // renderBrokerEquity() lo reconstruía entero UNA VEZ POR BRÓKER (más una vez para el Dashboard
  // y otra para Cartera > Histórico) en cada renderAll() -- trabajo idéntico repetido N+2 veces,
  // perceptible en carteras con mucho histórico aunque la red ya vaya rápida.
  // Sentinela propio para "todavía no se ha calculado ninguna caché" -- PRICE_HISTORY empieza
  // en null (app.js:169, antes de la primera carga) y {} !== null, así que un objeto cualquiera
  // sirve como valor que nunca podrá coincidir con PRICE_HISTORY por accidente. BUG que tuvo
  // esto en la primera versión: usar null como valor inicial de priceHistoryIndexCacheSource
  // coincidía con el PRICE_HISTORY === null de antes de cargar, así que la "caché" se daba por
  // válida sin haberse construido nunca y devolvía null en vez de un índice -- reventaba
  // computeAutoEquity() con "Cannot read properties of null" en cuanto se llamaba antes de que
  // llegara el histórico de precios.
  var PRICE_HISTORY_INDEX_UNSET = {};
  var priceHistoryIndexCache = null;
  var priceHistoryIndexCacheSource = PRICE_HISTORY_INDEX_UNSET;
  function getPriceHistoryIndex() {
    if (priceHistoryIndexCacheSource === PRICE_HISTORY) return priceHistoryIndexCache;
    var historyIndex = {};
    (PRICE_HISTORY || []).forEach(function (p) {
      (historyIndex[p.asset_key] || (historyIndex[p.asset_key] = [])).push(p);
    });
    Object.keys(historyIndex).forEach(function (key) {
      historyIndex[key].sort(function (a, b) { return a.date.localeCompare(b.date); });
    });
    priceHistoryIndexCache = historyIndex;
    priceHistoryIndexCacheSource = PRICE_HISTORY;
    return historyIndex;
  }

  // brokerFilter opcional -- restringe la curva a las operaciones de un solo bróker (usado por
  // los mini-gráficos de rentabilidad por bróker en Cartera > Resumen, para poder comparar cada
  // uno con lo que reporta la web del propio bróker). Sin filtro, calcula la cartera entera
  // igual que siempre.
  function computeAutoEquity(brokerFilter) {
    var historyIndex = getPriceHistoryIndex();

    var trades = TX.filter(function (t) { return (t.type === "compra" || t.type === "venta") && (!brokerFilter || brokerNormKey(t.broker) === brokerNormKey(brokerFilter)); })
      .slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    var priceRows = {};
    PRICES.forEach(function (p) { priceRows[p.asset_key] = p; });

    var relevantKeys = {};
    trades.forEach(function (t) { relevantKeys[assetKey(t)] = true; });

    var missing = [], pricedKeys = {}, labelByKey = {}, infoByKey = {};
    Object.keys(relevantKeys).forEach(function (key) {
      var row = priceRows[key];
      var keyTrades = trades.filter(function (t) { return assetKey(t) === key; });
      var sample = keyTrades[0], lastTrade = keyTrades[keyTrades.length - 1];
      var label = (sample.name || sample.ticker || key) + " (" + sample.broker + ")";
      // broker/ticker/name/price del último precio conocido -- para poder ofrecer el mismo
      // widget de Fuente+Símbolo aquí que en Posiciones, aunque la posición ya esté vendida y
      // por tanto no tenga fila en Posiciones donde asignarle una fuente.
      var refInfo = { broker: sample.broker, ticker: sample.ticker, name: sample.name, price: Number(lastTrade.price) || 0 };
      labelByKey[key] = label; infoByKey[key] = refInfo;
      if (!row || !row.auto_source) {
        missing.push({ key: key, label: label, reason: "Sin fuente de precio asignada", info: refInfo });
        return;
      }
      // Elegir la fuente en el desplegable ya guarda la fila (se dispara al cambiarlo), antes
      // incluso de escribir un símbolo -- sin esto, esa fila a medias se confundía con un
      // intento de descarga fallido: "Calcular histórico" la salta en silencio (ni la
      // actualiza ni la cuenta como error, porque el símbolo está vacío) y el aviso pasaba a
      // decir "sin histórico descargado todavía", dando a entender que sí se había intentado.
      if (!row.auto_symbol) {
        missing.push({ key: key, label: label, reason: "Fuente elegida (" + row.auto_source + ") pero falta escribir o buscar el símbolo", info: refInfo });
        return;
      }
      if (!historyIndex[key] || historyIndex[key].length === 0) {
        missing.push({ key: key, label: label, reason: "Fuente asignada (" + row.auto_source + ") pero sin histórico descargado todavía", info: refInfo });
        return;
      }
      pricedKeys[key] = true;
    });

    // Posiciones YA CERRADAS (vendidas del todo, qty<=0 hoy) que ya tienen fuente asignada y
    // funcionando -- una vez asignada la fuente, desaparecían de "missing" (que solo lista lo
    // que falta) y, al no tener cantidad>0, tampoco aparecen en Posiciones para poder revisar o
    // corregir el símbolo/divisa asignados. Si te equivocaste de símbolo o divisa al asignarla
    // (p.ej. una acción en USD marcada sin conversión), no había ningún sitio donde volver a
    // verlo para arreglarlo -- toda la rentabilidad histórica quedaba silenciosamente distorsionada.
    var openKeys = {};
    computeHoldings().forEach(function (h) { openKeys[h.key] = true; });
    var assignedClosed = Object.keys(pricedKeys)
      .filter(function (key) { return !openKeys[key]; })
      .map(function (key) { return { key: key, label: labelByKey[key], info: infoByKey[key] }; });

    function priceOn(key, dateStr) {
      var series = historyIndex[key];
      if (!series || series.length === 0) return null;
      var result = series[0].close;
      for (var i = 0; i < series.length; i++) {
        if (series[i].date > dateStr) break;
        result = series[i].close;
      }
      return result;
    }

    // allTx: TODAS las operaciones del bróker filtrado (no solo compra/venta) -- antes "value"
    // solo sumaba qty*precio de los activos con fuente asignada, así que dividendos, bonos/
    // T-Bills (clasificados "Otro"), comisiones sueltas, ingresos y retiradas quedaban
    // completamente fuera del cálculo. Con una cartera con actividad de ese tipo, la rentabilidad
    // de la app podía diferir mucho de la que reporta el propio bróker, que parte del capital
    // total de la cuenta (efectivo incluido). Ahora "value" = efectivo real + valor de las
    // posiciones con precio, y el efectivo se calcula con txCashImpact (la misma función que ya
    // usa "Efectivo por bróker"), así que ambas cifras quedan consistentes entre sí. Solo
    // ingreso/retirada se tratan como aportación/retirada externa (no cuentan como ganancia o
    // pérdida, igual que en Valoraciones) -- todo lo demás (compra, venta, dividendo, comisión,
    // otro) es actividad real de la cartera y si afecta a la rentabilidad.
    var allTx = TX.filter(function (t) { return !brokerFilter || brokerNormKey(t.broker) === brokerNormKey(brokerFilter); })
      .slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    var dateSet = {};
    allTx.forEach(function (t) { dateSet[t.date] = true; });
    Object.keys(pricedKeys).forEach(function (key) {
      historyIndex[key].forEach(function (p) { dateSet[p.date] = true; });
    });
    var timeline = Object.keys(dateSet).sort();

    if (timeline.length < 2) {
      // totalReturn no depende de la curva (ver comentario más abajo) -- puede seguir dando un
      // número aunque casi no haya histórico de precios; cagr sí necesita un rango de fechas
      // fiable, que aquí no hay.
      return { points: [], missing: missing, assignedClosed: assignedClosed, hasData: false, totalReturn: computeBrokerTotalReturn(brokerFilter).returnPct, cagr: null, maxDD: 0 };
    }

    var qty = {}, txIdx = 0, cash = 0, bondValue = {}, cumIndex = 100, peak = 100, maxDD = 0;
    var points = [];

    for (var i = 0; i < timeline.length; i++) {
      var d = timeline[i];
      var externalCashflow = 0;
      // Precio real de cada operación ejecutada exactamente en esta fecha -- se usa como valor
      // de esa posición para este punto en vez del cierre histórico del día, que puede diferir
      // del precio real de ejecución. Así una venta queda medida con su precio de venta real
      // (y una compra con su precio de compra real).
      var tradedTodayPrice = {};
      while (txIdx < allTx.length && allTx[txIdx].date <= d) {
        var t = allTx[txIdx];
        var key = assetKey(t);
        var isTrade = t.type === "compra" || t.type === "venta";
        // Bonos/T-Bills: se importan como "Otro" (ver classifyTypeIBKR + detección de CUSIP en
        // el importador) para no quedar como una posición fantasma que nunca se cierra. Pero
        // sin ningún valor propio, comprar uno resta su coste del efectivo sin que nada lo
        // compense -- la cartera parece perder el 100% de ese dinero durante todo el tiempo que
        // se mantiene el bono, y lo "recupera" de golpe al vencer (justo la caída en picado +
        // suelo plano + repunte que se ve en la curva si tienes T-Bills). "bondValue" les da un
        // valor mantenido a coste mientras están en cartera: aumenta con cada compra (importe
        // negativo) y se cierra del todo con el vencimiento/cupón (importe positivo),
        // reconociendo la ganancia o pérdida real ese día en vez de repartirla en dos sustos.
        var isBondLike = t.type === "otro" && BOND_TICKER_RE.test((t.ticker || "").trim().toUpperCase());
        if (isTrade && !pricedKeys[key]) {
          // Activo de compra/venta sin fuente de precio asignada: ni su efectivo ni su cantidad
          // entran aquí -- se queda invisible en la curva hasta que se le asigne una fuente, en
          // vez de aparecer como una pérdida por el importe gastado sin ninguna posición que lo
          // compense (el hueco es el mismo aviso de "activos sin fuente" de Histórico).
        } else {
          var impact = txCashImpact(t);
          cash += impact;
          if (isTrade) {
            var q = Number(t.quantity) || 0;
            qty[key] = (qty[key] || 0) + (t.type === "compra" ? q : -q);
            tradedTodayPrice[key] = Number(t.price) || 0;
          } else if (t.type === "ingreso" || t.type === "retirada") {
            externalCashflow += impact;
          } else if (isBondLike) {
            if (impact < 0) bondValue[key] = (bondValue[key] || 0) + Math.abs(impact);
            else bondValue[key] = 0;
          }
        }
        txIdx++;
      }

      var positionsValue = 0;
      Object.keys(qty).forEach(function (k) {
        if (qty[k] <= 0.00001) return;
        var p = tradedTodayPrice[k] != null ? tradedTodayPrice[k] : priceOn(k, d);
        if (p != null) positionsValue += qty[k] * p;
      });
      var bondTotal = 0;
      Object.keys(bondValue).forEach(function (k) { bondTotal += bondValue[k]; });
      var value = cash + positionsValue + bondTotal;

      if (points.length === 0) {
        points.push({ date: d, value: value, index: 100, dd: 0 });
      } else {
        var prev = points[points.length - 1];
        var periodReturn = prev.value > 0 ? (value - prev.value - externalCashflow) / prev.value : 0;
        cumIndex = cumIndex * (1 + periodReturn);
        peak = Math.max(peak, cumIndex);
        var dd = peak > 0 ? ((cumIndex - peak) / peak) * 100 : 0;
        maxDD = Math.min(maxDD, dd);
        points.push({ date: d, value: value, index: cumIndex, dd: dd });
      }
    }

    // "Rentabilidad total"/"Rentabilidad anualizada" NO salen del índice día a día (cumIndex) --
    // ese índice ignora por completo cualquier compra/venta de un activo sin fuente de precio
    // asignada (ver el "if (isTrade && !pricedKeys[key])" más arriba), así que con una cartera
    // como Interactive Brokers (con posiciones recién asignadas y sin histórico completo todavía)
    // el índice se puede construir casi solo con dividendos/intereses y dar un % artificialmente
    // bajo y poco fiable. En su lugar se usa computeBrokerTotalReturn().returnPct (capital nuevo/
    // disponible, sin depender de histórico de precios descargado -- solo del precio actual en
    // "prices", que siempre existe tras el sembrado automático al importar). cumIndex/maxDD SÍ se
    // quedan como están: son los que dibujan la curva y el drawdown, que no tienen equivalente en
    // un totalReturn agregado (son una serie temporal, no dos totales sueltos).
    var totalReturn = computeBrokerTotalReturn(brokerFilter).returnPct;
    var firstD = new Date(points[0].date + "T00:00:00"), lastD = new Date(points[points.length - 1].date + "T00:00:00");
    var totalDays = Math.max(1, Math.round((lastD - firstD) / (1000 * 3600 * 24)));
    var years = totalDays / 365.25;
    var cagr = (totalReturn != null && years > 0) ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : null;

    return { points: points, missing: missing, assignedClosed: assignedClosed, hasData: true, totalReturn: totalReturn, cagr: cagr, maxDD: maxDD };
  }

  /* ---------------- 12. SVG charts ---------------- */
  function miniSparkSvg(points) {
    var W = 220, H = 90, pad = 4;
    if (points.length < 2) return null;
    var idxVals = points.map(function (p) { return p.index; });
    var minIdx = Math.min.apply(null, idxVals), maxIdx = Math.max.apply(null, idxVals);
    if (minIdx === maxIdx) { minIdx -= 1; maxIdx += 1; }
    function x(i) { return pad + (i / (points.length - 1)) * (W - 2 * pad); }
    function y(v) { return pad + (H - 2 * pad) - ((v - minIdx) / (maxIdx - minIdx)) * (H - 2 * pad); }
    var linePts = points.map(function (p, i) { return x(i) + "," + y(p.index); }).join(" ");
    var areaPts = "M" + x(0) + "," + (H - pad) + " L" + linePts.split(" ").join(" L") + " L" + x(points.length - 1) + "," + (H - pad) + " Z";
    var last = points[points.length - 1];
    var accent = themeColor("--accent");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + accent + '" stop-opacity="0.4"/><stop offset="100%" stop-color="' + accent + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + areaPts + '" fill="url(#heroGrad)"/>' +
      '<polyline points="' + linePts + '" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + x(points.length - 1) + '" cy="' + y(last.index) + '" r="3" fill="' + accent + '"/>' +
      "</svg>";
  }

  var MONTH_ABBR_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var MONTH_FULL_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  // "2026-07" -> "Julio 2026" -- cabecera de grupo mensual en la tabla de Movimientos de Economía.
  function monthHeadingLabel(monthStr) {
    var parts = monthStr.split("-");
    var name = MONTH_FULL_ES[parseInt(parts[1], 10) - 1] || "";
    return name.charAt(0).toUpperCase() + name.slice(1) + " " + parts[0];
  }

  // Selector de mes año->mes de Economía (Resumen y Operaciones) -- sustituye al <select> plano
  // de antes. Panel flotante en dos vistas (años, luego meses del año elegido), mismo mecanismo
  // de "solo uno abierto a la vez" que los flyouts (ver closeAllFlyouts) pero sin el modal a
  // pantalla completa: este control se usa constantemente. El estado de vista (años/meses, qué
  // año se está mirando) se guarda por panelId -- Resumen y Operaciones pueden estar cada uno en
  // una vista distinta sin pisarse, aunque los dos se repintan en cada cambio de mes compartido
  // (ver householdSelectedMonth).
  var monthPickerViewState = {};

  function closeAllMonthPickers() {
    document.querySelectorAll(".month-picker-panel.open").forEach(function (p) { p.classList.remove("open"); });
  }

  // toggleEl/panelEl de cada instancia creada por renderMonthPicker, por panelId -- hace falta
  // guardarlos en algún sitio accesible desde fuera de esa función para poder reposicionar TODOS
  // los paneles abiertos en cada scroll/resize de página (ver más abajo), no solo el que se
  // acaba de renderizar.
  var monthPickerInstances = {};

  // Reposiciona (no cierra) los paneles abiertos en cada scroll/resize de página -- cerrar era
  // más simple pero tenía un efecto colateral real: al hacer scroll DENTRO de la propia lista de
  // años (.month-picker-years tiene su propio overflow-y:auto) o al hacer scroll-into-view
  // automático del navegador sobre un botón del propio panel al pulsarlo, el listener de scroll
  // cerraba el panel a mitad de la interacción, antes de que el clic llegara a registrarse.
  // Reposicionar es idempotente (si el botón no se ha movido, deja las mismas coordenadas) así
  // que no tiene ese problema.
  function repositionOpenMonthPickers() {
    Object.keys(monthPickerInstances).forEach(function (panelId) {
      var inst = monthPickerInstances[panelId];
      if (inst.panelEl.classList.contains("open")) positionMonthPickerPanel(inst.toggleEl, inst.panelEl);
    });
  }

  // position:fixed (ver .month-picker-panel en styles.css -- a propósito, no absolute: .panel
  // lleva overflow:hidden para las esquinas redondeadas, y eso recortaba el desplegable cuando
  // se salía de los bordes de la tarjeta). Ancla el panel a las coordenadas reales del botón en
  // pantalla, con margen de seguridad para no salirse del viewport ni por la derecha ni por
  // abajo (en ese caso lo abre hacia arriba en vez de hacia abajo).
  function positionMonthPickerPanel(toggleEl, panelEl) {
    var rect = toggleEl.getBoundingClientRect();
    var margin = 8;
    var panelWidth = panelEl.offsetWidth || 210;
    var left = Math.min(rect.left, window.innerWidth - margin - panelWidth);
    left = Math.max(margin, left);
    var top = rect.bottom + 6;
    if (top + panelEl.offsetHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - panelEl.offsetHeight - 6);
    }
    panelEl.style.left = left + "px";
    panelEl.style.top = top + "px";
  }

  // opts: { toggleId, panelId, selected ("YYYY-MM"), months (array "YYYY-MM", solo para saber
  // qué años ofrecer en la vista de años -- lo trae cada llamante, ver householdAllMonths() /
  // carteraOperationsAllMonths()), allMonthsOption (bool), allMonthsActive (bool),
  // onSelectMonth(m), onSelectAllMonths() }. Genérico a propósito -- lo usan tanto los dos
  // selectores de Economía (mes compartido) como el filtro de mes de Cartera > Operaciones,
  // cada uno con su propia fuente de meses.
  function renderMonthPicker(opts) {
    var toggleEl = document.getElementById(opts.toggleId);
    var panelEl = document.getElementById(opts.panelId);
    if (!toggleEl || !panelEl) return;
    monthPickerInstances[opts.panelId] = { toggleEl: toggleEl, panelEl: panelEl };

    var years = {};
    (opts.months || []).forEach(function (m) { years[parseInt(m.slice(0, 4), 10)] = true; });
    years[new Date().getFullYear()] = true;
    var yearList = Object.keys(years).map(Number).sort(function (a, b) { return b - a; });

    var selectedYear = opts.selected ? parseInt(opts.selected.slice(0, 4), 10) : new Date().getFullYear();
    var selectedMonthIdx = opts.selected ? parseInt(opts.selected.slice(5, 7), 10) - 1 : null;

    toggleEl.textContent = opts.allMonthsActive ? "Todos los meses" : (MONTH_ABBR_ES[selectedMonthIdx] + " " + selectedYear);

    if (!monthPickerViewState[opts.panelId]) monthPickerViewState[opts.panelId] = { view: "years", year: selectedYear };
    var state = monthPickerViewState[opts.panelId];

    function paintPanel() {
      if (state.view === "months") {
        var y = state.year;
        panelEl.innerHTML =
          '<div class="month-picker-view-title"><button type="button" class="month-picker-back" data-action="back">&larr; ' + y + "</button></div>" +
          '<div class="month-picker-months">' + MONTH_ABBR_ES.map(function (label, idx) {
            var active = !opts.allMonthsActive && y === selectedYear && idx === selectedMonthIdx;
            return '<button type="button" class="month-picker-month' + (active ? " active" : "") + '" data-month-idx="' + idx + '">' + label + "</button>";
          }).join("") + "</div>";
        panelEl.querySelector('[data-action="back"]').addEventListener("click", function () {
          state.view = "years";
          paintPanel();
        });
        panelEl.querySelectorAll(".month-picker-month").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var idx = parseInt(btn.getAttribute("data-month-idx"), 10);
            closeAllMonthPickers();
            opts.onSelectMonth(y + "-" + pad2(idx + 1));
          });
        });
      } else {
        panelEl.innerHTML =
          (opts.allMonthsOption ? '<button type="button" class="month-picker-all' + (opts.allMonthsActive ? " active" : "") + '" data-action="all">Todos los meses</button>' : "") +
          '<div class="month-picker-years">' + yearList.map(function (y) {
            var active = !opts.allMonthsActive && y === selectedYear;
            return '<button type="button" class="month-picker-year' + (active ? " active" : "") + '" data-year="' + y + '">' + y + "</button>";
          }).join("") + "</div>";
        if (opts.allMonthsOption) {
          panelEl.querySelector('[data-action="all"]').addEventListener("click", function () {
            closeAllMonthPickers();
            opts.onSelectAllMonths();
          });
        }
        panelEl.querySelectorAll(".month-picker-year").forEach(function (btn) {
          btn.addEventListener("click", function () {
            state.year = parseInt(btn.getAttribute("data-year"), 10);
            state.view = "months";
            paintPanel();
          });
        });
      }
      // Reposiciona en cada repintado, no solo al abrir -- la vista de meses es más alta que
      // la de años, así que si se calculara solo una vez al abrir (en vista años), pasar a la
      // vista de meses podría dejar el panel más alto de lo que cabe y salirse del viewport.
      if (panelEl.classList.contains("open")) positionMonthPickerPanel(toggleEl, panelEl);
    }
    paintPanel();

    toggleEl.onclick = function (e) {
      e.stopPropagation();
      var willOpen = !panelEl.classList.contains("open");
      closeAllFlyouts();
      if (willOpen) {
        state.view = "years";
        state.year = selectedYear;
        panelEl.classList.add("open");
        paintPanel();
      }
    };
    panelEl.onclick = function (e) { e.stopPropagation(); };
  }

  document.addEventListener("click", closeAllMonthPickers);
  // position:fixed no sigue al botón si la página (o un contenedor con scroll propio, p.ej.
  // .table-wrap) se desplaza mientras el panel está abierto -- reposiciona en vez de cerrar (ver
  // repositionOpenMonthPickers). Captura (true) para enterarse también del scroll de
  // contenedores internos, que no burbujea hasta window.
  window.addEventListener("scroll", repositionOpenMonthPickers, true);
  window.addEventListener("resize", repositionOpenMonthPickers);

  // Marcas del eje horizontal cada monthStep meses (por defecto 3 = trimestral), alineadas a
  // calendario de verdad (no solo "primer/último punto" como antes) -- cada marca se ancla al
  // punto de datos real más cercano a ese 1º de mes, para que la posición en x siga siendo
  // exacta aunque los puntos no caigan justo en el día 1.
  function equityXTicks(points, monthStep) {
    var ticks = [];
    var firstDate = new Date(points[0].date + "T00:00:00");
    var lastDate = new Date(points[points.length - 1].date + "T00:00:00");
    var cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    var lastIdx = -1;
    while (cursor <= lastDate) {
      // OJO: cursor.toISOString() convierte a UTC un Date construido en hora LOCAL -- en
      // cualquier huso horario adelantado a UTC (p.ej. Europe/Madrid, +1/+2h) esto restaba un
      // día y anclaba cada marca al último día del mes ANTERIOR en vez de al día 1 del mes que
      // tocaba, desplazando todas las etiquetas un mes hacia atrás (comprobado: con TZ=Europe/
      // Madrid, el cursor de "may 2026" resolvía a "2026-04-30" y la marca acababa en "abr").
      // getFullYear/getMonth/getDate son locales y no sufren esa conversión.
      var targetStr = cursor.getFullYear() + "-" + pad2(cursor.getMonth() + 1) + "-" + pad2(cursor.getDate());
      var idx = points.length - 1;
      for (var i = 0; i < points.length; i++) { if (points[i].date >= targetStr) { idx = i; break; } }
      if (idx !== lastIdx) {
        // La etiqueta usa la fecha REAL del punto anclado (points[idx].date), no la fecha
        // nominal del cursor -- con pocos puntos muy espaciados (p.ej. pocas valoraciones
        // manuales) el cursor trimestral puede "saltarse" varios puntos de golpe y aterrizar
        // directamente en el último; con la fecha del cursor, esa marca final salía mal
        // etiquetada con una fecha muy anterior a la del punto que en realidad señala.
        var anchorDate = new Date(points[idx].date + "T00:00:00");
        ticks.push({ index: idx, label: MONTH_ABBR_ES[anchorDate.getMonth()] + " " + anchorDate.getFullYear() });
        lastIdx = idx;
      }
      cursor.setMonth(cursor.getMonth() + monthStep);
    }
    // El último punto real no siempre cae justo en un límite de trimestre -- se añade aparte
    // para que la fecha final de la curva no se quede nunca sin marca en el eje.
    if (ticks.length === 0 || ticks[ticks.length - 1].index !== points.length - 1) {
      var lastPointDate = new Date(points[points.length - 1].date + "T00:00:00");
      ticks.push({ index: points.length - 1, label: MONTH_ABBR_ES[lastPointDate.getMonth()] + " " + lastPointDate.getFullYear() });
    }
    return ticks;
  }

  function equitySvg(points) {
    // Solo evolución del patrimonio (sin drawdown) y con mucha menos altura que antes -- el
    // drawdown máximo sigue disponible como cifra suelta en el chip "Drawdown máximo" del
    // Resumen, esto era solo la sub-gráfica de área que ocupaba media tarjeta.
    var W = 800, H = 170, padL = 52, padR = 10, padT = 14, topH = 126;
    if (points.length < 2) {
      return '<svg viewBox="0 0 ' + W + ' ' + H + '"><text x="' + (W / 2) + '" y="' + (H / 2) + '" fill="' + themeColor("--text-secondary") + '" font-size="13" text-anchor="middle" font-family="IBM Plex Mono, monospace">Faltan al menos dos puntos de histórico para ver la curva</text></svg>';
    }
    var idxVals = points.map(function (p) { return p.index; });
    var minIdx = Math.min.apply(null, idxVals), maxIdx = Math.max.apply(null, idxVals);
    if (minIdx === maxIdx) { minIdx -= 1; maxIdx += 1; }
    var innerW = W - padL - padR;
    function x(i) { return padL + (i / (points.length - 1)) * innerW; }
    function yTop(v) { return padT + topH - ((v - minIdx) / (maxIdx - minIdx)) * topH; }
    var linePts = points.map(function (p, i) { return x(i) + "," + yTop(p.index); }).join(" ");
    var areaPts = "M" + x(0) + "," + (padT + topH) + " L" + linePts.split(" ").join(" L") + " L" + x(points.length - 1) + "," + (padT + topH) + " Z";
    // Cada línea de rejilla lleva su valor en el eje vertical -- el índice acumulado (base 100)
    // se muestra como % de rentabilidad respecto al origen (índice 100 = 0%), que es lo que
    // realmente se lee en un gráfico así, no el índice en bruto.
    var gridStroke = themeColor("--border"), axisText = themeColor("--text-secondary");
    var gridLines = "", yLabels = "";
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (topH / 3) * g;
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="' + gridStroke + '" stroke-width="1"/>';
      var gVal = maxIdx - (g / 3) * (maxIdx - minIdx);
      var gPct = gVal - 100;
      var gLabel = (gPct > 0 ? "+" : "") + Math.round(gPct) + "%";
      yLabels += '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" fill="' + axisText + '" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="end">' + gLabel + "</text>";
    }
    // Paso entre marcas (en meses) elegido según cuánto histórico hay que cubrir, no fijo a
    // trimestral -- con pocos años trimestral cabe de sobra, pero con un histórico largo (varios
    // años) marcas cada 3 meses se apelotonaban en el centro del eje (el ajuste de más abajo solo
    // corregía el primer/último hueco, no los del medio). MIN_LABEL_W es una estimación conservadora
    // del ancho de una etiqueta tipo "ene 2023" a 10.5px.
    var totalMonths = Math.max(1,
      (new Date(points[points.length - 1].date + "T00:00:00").getFullYear() - new Date(points[0].date + "T00:00:00").getFullYear()) * 12 +
      (new Date(points[points.length - 1].date + "T00:00:00").getMonth() - new Date(points[0].date + "T00:00:00").getMonth())
    );
    var MIN_LABEL_W = 65;
    var maxTicks = Math.max(2, Math.floor(innerW / MIN_LABEL_W));
    var MONTH_STEP_CANDIDATES = [1, 2, 3, 6, 12, 24, 36, 60, 120];
    var monthStep = MONTH_STEP_CANDIDATES[MONTH_STEP_CANDIDATES.length - 1];
    for (var msi = 0; msi < MONTH_STEP_CANDIDATES.length; msi++) {
      if (Math.ceil(totalMonths / MONTH_STEP_CANDIDATES[msi]) + 1 <= maxTicks) { monthStep = MONTH_STEP_CANDIDATES[msi]; break; }
    }
    var xTicks = equityXTicks(points, monthStep);
    // La 1ª y la última marca se fuerzan al borde del área de dibujo (ver más abajo) con anchor
    // start/end -- su texto entero cuelga hacia dentro desde ese borde (todo el ancho de la
    // etiqueta, no solo la mitad), mientras que la marca vecina (anchor middle) solo mete la
    // MITAD de su ancho hacia el borde. El hueco mínimo para no solaparse es por tanto ancho
    // completo + medio ancho, no un simple "más o menos 70px" (ese valor se quedaba corto:
    // con datos reales las dos primeras etiquetas por la izquierda seguían pisándose). Todas
    // las etiquetas miden lo mismo ("xxx yyyy": 3 letras de mes + espacio + año, 8 caracteres),
    // así que se puede estimar su ancho en píxeles a partir del tamaño de fuente monoespaciada.
    var LABEL_CHARS = 8;
    var MONO_CHAR_W = 0.62; // ancho medio de un carácter de IBM Plex Mono, en fracción de su font-size
    var LABEL_W = LABEL_CHARS * 10.5 * MONO_CHAR_W;
    var MIN_EDGE_TICK_GAP = LABEL_W * 1.5; // ancho completo (start/end) + medio ancho (middle)
    while (xTicks.length >= 3 && (x(xTicks[1].index) - x(xTicks[0].index)) < MIN_EDGE_TICK_GAP) {
      xTicks.splice(1, 1);
    }
    while (xTicks.length >= 3 && (x(xTicks[xTicks.length - 1].index) - x(xTicks[xTicks.length - 2].index)) < MIN_EDGE_TICK_GAP) {
      xTicks.splice(xTicks.length - 2, 1);
    }
    // Con rangos cortos (pocos meses) el último punto real y la última marca "de calendario"
    // del bucle pueden caer en el mismo mes -- suficientemente lejos en píxeles como para no
    // disparar el filtro de arriba, pero mostrando el mismo texto ("jul 2026") dos veces
    // seguidas, que se lee como un fallo aunque no se solapen.
    if (xTicks.length >= 3 && xTicks[xTicks.length - 1].label === xTicks[xTicks.length - 2].label) {
      xTicks.splice(xTicks.length - 2, 1);
    }
    var xLabels = xTicks.map(function (t, ti) {
      var anchor = ti === 0 ? "start" : (ti === xTicks.length - 1 ? "end" : "middle");
      var tx = x(t.index);
      // Ancla la primera/última etiqueta al borde del área de dibujo en vez de a su punto real
      // -- si no, con el eje empezando en padL (52px) la primera fecha de la curva quedaría
      // descentrada respecto al resto de marcas del eje.
      if (ti === 0) tx = padL; else if (ti === xTicks.length - 1) tx = W - padR;
      return '<text x="' + tx + '" y="' + (H - 4) + '" fill="' + axisText + '" font-size="10.5" font-family="IBM Plex Mono, monospace" text-anchor="' + anchor + '">' + t.label + "</text>";
    }).join("");
    var lastPoint = points[points.length - 1];
    var accent = themeColor("--accent");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + accent + '" stop-opacity="0.35"/><stop offset="100%" stop-color="' + accent + '" stop-opacity="0"/></linearGradient></defs>' +
      gridLines +
      '<path d="' + areaPts + '" fill="url(#valGrad)"/>' +
      '<polyline points="' + linePts + '" fill="none" stroke="' + accent + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + x(points.length - 1) + '" cy="' + yTop(lastPoint.index) + '" r="3.5" fill="' + accent + '"/>' +
      yLabels + xLabels +
      '</svg>';
  }

  // Recorta "points" (los mismos objetos {date, value, index, dd} que ya usa equitySvg) a los
  // que caen dentro del rango elegido en el selector de "Evolución del patrimonio" de Cartera >
  // Resumen -- NO reescala el índice al inicio del rango (el primer punto que quede dentro del
  // recorte conserva su índice acumulado real desde el origen de la curva completa, no se
  // rebasa a 100), a propósito: equitySvg ya calcula su propio eje Y a partir del min/max de lo
  // que reciba, así que la forma de la curva se ve bien igualmente, y el eje sigue mostrando el
  // % acumulado real desde que existe historial, solo que encuadrado en el rango visible. "all"
  // devuelve "points" tal cual, sin copiar ni filtrar.
  function filterPointsByRange(points, range) {
    if (range === "all" || !points.length) return points;
    var now = new Date();
    var cutoff;
    if (range === "ytd") {
      cutoff = new Date(now.getFullYear(), 0, 1);
    } else {
      var months = { "6m": 6, "1y": 12, "5y": 60 }[range] || 0;
      cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    }
    var cutoffStr = cutoff.getFullYear() + "-" + pad2(cutoff.getMonth() + 1) + "-" + pad2(cutoff.getDate());
    return points.filter(function (p) { return p.date >= cutoffStr; });
  }

  // SVG de aviso reutilizado por chart-equity/chart-cartera-equity cuando NO hay curva en
  // absoluto todavía (curvePoints.length < 2 antes de cualquier filtro de rango) -- distinto del
  // aviso "Faltan al menos dos puntos de histórico" que ya pinta equitySvg() por su cuenta
  // cuando SÍ hay curva pero el rango elegido la deja en menos de 2 puntos (ver
  // renderCarteraEquityChart), este es para cuando no hay ninguna fuente de precio/valoración
  // asignada todavía, sea cual sea el rango.
  function noEquityDataSvg() {
    return '<svg viewBox="0 0 800 170"><text x="400" y="85" fill="' + themeColor("--text-secondary") + '" font-size="13" text-anchor="middle" font-family="IBM Plex Mono, monospace">Asigna una fuente de precio en Posiciones, o registra valoraciones manuales en Histórico, para ver la curva</text></svg>';
  }

  // Repinta SOLO la curva de "Evolución del patrimonio" de Cartera > Resumen, aplicando el rango
  // elegido (carteraEquityRange) sobre lastCurvePoints (ya calculados en el último
  // renderDashboard(), no hace falta recalcular toda la cartera solo para cambiar de rango). La
  // curva del Dashboard (chart-equity) no se toca aquí -- siempre muestra el histórico
  // completo, ver renderDashboard().
  function renderCarteraEquityChart() {
    var el = document.getElementById("chart-cartera-equity");
    if (!el) return;
    if (lastCurvePoints.length < 2) { el.innerHTML = noEquityDataSvg(); return; }
    // Sin filtrar por rango, equitySvg ya pinta su propio aviso "Faltan al menos dos puntos de
    // histórico" si el recorte deja menos de 2 puntos -- no hace falta un estado especial aquí.
    el.innerHTML = equitySvg(filterPointsByRange(lastCurvePoints, carteraEquityRange));
  }

  var carteraEquityRangeEl = document.getElementById("cartera-equity-range");
  if (carteraEquityRangeEl) {
    carteraEquityRangeEl.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-range]");
      if (!btn) return;
      carteraEquityRange = btn.getAttribute("data-range");
      carteraEquityRangeEl.querySelectorAll("button").forEach(function (b) { b.classList.toggle("active", b === btn); });
      renderCarteraEquityChart();
    });
  }

  // Marcas de eje "redondas" (1/2/5 x 10^n) en vez de dividir el rango en tramos iguales -- así
  // el eje se lee como en cualquier gráfico financiero normal (p.ej. 500/1.000/1.500€) en vez de
  // fracciones arbitrarias del máximo (p.ej. "733€"). Devuelve el valor real en € de cada marca,
  // ya incluyendo 0 y cubriendo como mínimo el propio máximo (el último tick es siempre >= max).
  function niceLinearTicks(maxValue) {
    if (maxValue <= 0) return [0];
    var targetCount = 4;
    var rawStep = maxValue / targetCount;
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var norm = rawStep / mag;
    var niceNorm = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    var step = Math.max(niceNorm * mag, 1); // nunca por debajo de 1€ (cantidades monetarias)
    var numSteps = Math.max(1, Math.ceil(maxValue / step));
    var ticks = [];
    for (var i = 0; i <= numSteps; i++) ticks.push(Math.round(i * step));
    return ticks.filter(function (v, i) { return ticks.indexOf(v) === i; });
  }

  // En escala logarítmica los tramos "redondos" son potencias de diez (10/100/1.000...) -- cada
  // década es ya su propia marca natural, a diferencia del lineal no hace falta el paso 1/2/5.
  // Si el rango cubre muchas décadas de golpe, se recortan las más pequeñas (se queda con 0 +
  // las 5 potencias más altas) para que el eje no se llene de marcas apretadas.
  function niceLogTicks(maxValue) {
    if (maxValue <= 0) return [0];
    var maxExp = Math.max(1, Math.ceil(Math.log10(maxValue)));
    var ticks = [0];
    for (var e = 1; e <= maxExp; e++) ticks.push(Math.pow(10, e));
    if (ticks.length > 6) ticks = [0].concat(ticks.slice(ticks.length - 5));
    return ticks;
  }

  // A partir de 10.000€ se abrevia con "k" (10.000 -> "10k€") -- con el importe completo
  // ("100.000€") el primer dígito se salía del área de dibujo por la izquierda (el eje reserva
  // un ancho fijo, pensado para etiquetas de 3-4 cifras) y quedaba cortado.
  // useGrouping explícito porque toLocaleString("es-ES") sin opciones no agrupa millares en
  // números de 4 cifras en este motor (1000 -> "1000", no "1.000") -- comprobado en Node 20.
  function formatAxisMoney(v) {
    if (v >= 10000) return (v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1, useGrouping: true }) + "k€";
    return v.toLocaleString("es-ES", { useGrouping: true }) + "€";
  }

  // Barras por mes (una o varias series, p.ej. ingresos+gastos o solo gastos) -- mismo
  // lenguaje visual que equitySvg (rejilla, tipografía IBM Plex Mono) pero con forma de barras
  // en vez de curva, porque el dato es categórico (un mes es un mes, no un punto en una serie
  // continua indexada). seriesDefs: [{key,color}, ...] -- una barra por serie y mes.
  // scaleMode "log" comprime los valores grandes con log10(v+1) (el +1 evita log(0) y deja los
  // meses en 0€ pegados a la base) -- pensado para cuando un mes puntual (p.ej. una reforma)
  // es varias veces mayor que el resto y en escala lineal aplasta a todos los demás contra el
  // eje. Las etiquetas del eje siempre muestran el valor real (des-transformado), no el
  // logaritmo, para que se puedan leer directamente en euros.
  function monthlyBarsSvg(months, scaleMode, seriesDefs) {
    var W = 800, H = 260, padL = 52, padR = 10, padT = 16, padB = 30;
    var gridStroke = themeColor("--border"), axisText = themeColor("--text-secondary");
    if (months.length === 0) {
      return '<svg viewBox="0 0 ' + W + ' ' + H + '"><text x="' + (W / 2) + '" y="' + (H / 2) + '" fill="' + axisText + '" font-size="13" text-anchor="middle" font-family="IBM Plex Mono, monospace">Añade movimientos para ver la evolución mensual</text></svg>';
    }
    function xform(v) { return scaleMode === "log" ? Math.log10(Math.max(0, v) + 1) : v; }

    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = months.length;
    var bandW = innerW / n;
    var barGap = 3;
    var nSeries = seriesDefs.length;
    var barW = Math.max(3, Math.min(26, (bandW - barGap * (nSeries + 1)) / nSeries));
    var maxRaw = Math.max.apply(null, months.map(function (m) {
      return Math.max.apply(null, seriesDefs.map(function (s) { return m[s.key] || 0; }));
    }).concat([1]));
    // El dominio del eje se extiende hasta la marca redonda más alta (no hasta maxRaw exacto)
    // -- así la rejilla queda siempre dentro del área de dibujo, con el máximo real de los
    // datos por debajo de la última línea en vez de justo pegado a ella.
    var ticks = scaleMode === "log" ? niceLogTicks(maxRaw) : niceLinearTicks(maxRaw);
    var niceMax = Math.max(ticks[ticks.length - 1] || maxRaw, maxRaw);
    var maxVal = xform(niceMax) || 1;

    var gridLines = "", yLabels = "";
    ticks.forEach(function (tickVal) {
      var gy = padT + innerH - (xform(tickVal) / maxVal) * innerH;
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="' + gridStroke + '" stroke-width="1"/>';
      var gLabel = isPrivacyMode() ? PRIVACY_MASK : formatAxisMoney(tickVal);
      yLabels += '<text class="money" x="' + (padL - 8) + '" y="' + (gy + 4) + '" fill="' + axisText + '" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="end">' + gLabel + "</text>";
    });

    var bars = "", xLabels = "", hitRegions = "";
    // Mismo criterio que equitySvg (Cartera > Resumen, evolución del patrimonio): menos
    // etiquetas en vez de rotar el texto. El paso base ya acotaba a ~12 como mucho, pero forzar
    // SIEMPRE la última posición (para anclar el final de la serie) podía dejarla pegada a la
    // anterior cuando (n-1) no era múltiplo exacto del paso -- aquí se calculan primero los
    // índices a mostrar y, si las dos últimas quedan más cerca que el ancho estimado de una
    // etiqueta ("mmm aaaa" en fuente monoespaciada, mismo cálculo que equitySvg), se descarta la
    // penúltima (nunca la última real, que es la que ancla el final de la serie).
    var labelStep = Math.max(1, Math.ceil(n / 12));
    var MONO_CHAR_W = 0.62;
    var LABEL_W = 8 * 10 * MONO_CHAR_W;
    var labelIdx = [];
    for (var li = 0; li < n; li += labelStep) labelIdx.push(li);
    if (labelIdx[labelIdx.length - 1] !== n - 1) labelIdx.push(n - 1);
    while (labelIdx.length >= 2 && (labelIdx[labelIdx.length - 1] - labelIdx[labelIdx.length - 2]) * bandW < LABEL_W) {
      labelIdx.splice(labelIdx.length - 2, 1);
    }
    var showLabel = {};
    labelIdx.forEach(function (idx) { showLabel[idx] = true; });
    var totalBarsW = nSeries * barW + (nSeries - 1) * barGap;
    months.forEach(function (m, i) {
      var centerX = padL + i * bandW + bandW / 2;
      var startX = centerX - totalBarsW / 2;
      seriesDefs.forEach(function (s, si) {
        var v = m[s.key] || 0;
        var h = Math.max((xform(v) / maxVal) * innerH, 0);
        var x = startX + si * (barW + barGap);
        // rx acotado a la mitad de cada dimensión -- con un rx fijo, una barra casi a cero (una
        // entrada suelta de pocos euros) quedaba con las dos esquinas redondeadas hasta el
        // semicírculo completo (rx > altura/2), y el rectángulo se veía como una píldora/óvalo
        // suelto en vez de una barra corta.
        var rx = Math.min(1.5, h / 2, barW / 2);
        bars += '<rect x="' + x + '" y="' + (padT + innerH - h) + '" width="' + barW + '" height="' + h + '" fill="' + s.color + '" rx="' + rx + '"/>';
      });
      if (showLabel[i]) {
        var parts = m.month.split("-");
        var label = MONTH_ABBR_ES[parseInt(parts[1], 10) - 1] + " " + parts[0];
        xLabels += '<text x="' + centerX + '" y="' + (H - 8) + '" fill="' + axisText + '" font-size="10" font-family="IBM Plex Mono, monospace" text-anchor="middle">' + label + "</text>";
      }

      // Región invisible que cubre toda la columna del mes (más fácil de acertar con el ratón
      // que las barras finas de 3-26px) -- wireChartTooltips() lee el texto ya formado de
      // data-tooltip en vez de recalcular nada al vuelo. "||" separa título/líneas porque un
      // salto de línea literal dentro de un atributo HTML es válido pero frágil de manipular.
      var tooltipLines = [monthHeadingLabel(m.month)].concat(seriesDefs.map(function (s) {
        return (s.label || s.key) + ": " + fmtMoney(m[s.key] || 0);
      }));
      hitRegions += '<rect class="chart-hit" x="' + (padL + i * bandW) + '" y="' + padT + '" width="' + bandW + '" height="' + innerH +
        '" fill="transparent" data-tooltip="' + escapeHtml(tooltipLines.join("||")) + '"/>';
    });

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' + gridLines + bars + yLabels + xLabels + hitRegions + "</svg>";
  }

  /* ---------------- 13. Tooltip compartido para gráficos de barras mensuales ---------------- */
  // Un único div reutilizado por cualquier gráfico que llame a wireChartTooltips() -- sigue al
  // ratón (position:fixed) en vez de depender de coordenadas SVG, así funciona igual sea cual
  // sea el zoom/tamaño real con el que el navegador esté pintando el <svg> (viewBox escalado).
  function chartTooltipEl() { return document.getElementById("chart-tooltip"); }

  function positionChartTooltip(e, el) {
    var pad = 14;
    el.style.left = "0px"; el.style.top = "0px"; // evita medir con una posición previa fuera de pantalla
    var maxX = Math.max(10, window.innerWidth - el.offsetWidth - 10);
    var maxY = Math.max(10, window.innerHeight - el.offsetHeight - 10);
    el.style.left = Math.min(e.clientX + pad, maxX) + "px";
    el.style.top = Math.min(e.clientY + pad, maxY) + "px";
  }

  function showChartTooltip(e, text) {
    var el = chartTooltipEl();
    if (!el) return;
    var lines = text.split("||");
    el.innerHTML = '<div class="chart-tooltip-title">' + escapeHtml(lines[0]) + '</div>' +
      lines.slice(1).map(function (l) { return '<div class="chart-tooltip-row">' + escapeHtml(l) + '</div>'; }).join("");
    el.style.display = "block";
    positionChartTooltip(e, el);
  }

  function hideChartTooltip() {
    var el = chartTooltipEl();
    if (el) el.style.display = "none";
  }

  // Se llama tras pintar cualquier SVG generado por monthlyBarsSvg -- innerHTML sustituye el
  // contenido entero cada vez, así que el wiring hay que rehacerlo en cada render (no sirve de
  // nada delegar el evento más arriba una sola vez porque los <rect> son nodos nuevos).
  function wireChartTooltips(container) {
    if (!container) return;
    container.querySelectorAll("[data-tooltip]").forEach(function (region) {
      region.addEventListener("mousemove", function (e) { showChartTooltip(e, region.getAttribute("data-tooltip")); });
      region.addEventListener("mouseleave", hideChartTooltip);
    });
  }

  function donutSvg(dataObj, colorMap) {
    var entries = Object.keys(dataObj).map(function (k) { return { label: k, value: dataObj[k] }; }).filter(function (e) { return e.value > 0; });
    entries.sort(function (a, b) { return b.value - a.value; });
    var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
    if (total <= 0 || entries.length === 0) {
      return { svg: '<svg viewBox="0 0 200 200" width="225" height="225"><circle cx="100" cy="100" r="70" fill="none" stroke="' + themeColor("--border") + '" stroke-width="24"/></svg>', legendHtml: "<li>Sin datos aún</li>" };
    }
    var cx = 100, cy = 100, r = 70, sw = 26, circumference = 2 * Math.PI * r;
    var offset = 0, paths = "";
    entries.forEach(function (e, i) {
      var frac = e.value / total, dash = frac * circumference;
      var color = colorMap[e.label] || brokerPalette()[i % brokerPalette().length];
      paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-dasharray="' + dash + " " + (circumference - dash) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + " " + cy + ')"/>';
      offset += dash;
      e._color = color; e._pct = frac * 100;
    });
    var svg = '<svg viewBox="0 0 200 200" width="340" height="340">' + paths +
      '<text class="money" x="100" y="96" text-anchor="middle" fill="' + themeColor("--text-primary") + '" font-size="15" font-family="IBM Plex Mono, monospace" font-weight="600">' + fmtMoney(total) + '</text>' +
      '<text x="100" y="114" text-anchor="middle" fill="' + themeColor("--text-secondary") + '" font-size="10" font-family="IBM Plex Mono, monospace">total</text></svg>';
    var legendHtml = entries.map(function (e) {
      return '<li><span><i class="swatch" style="background:' + e._color + '"></i> ' + escapeHtml(e.label) + '</span><span class="mono">' + e._pct.toFixed(1) + '%</span></li>';
    }).join("");
    return { svg: svg, legendHtml: legendHtml };
  }

  // Barra 100% apilada -- una sola fila, cada categoría es un tramo con ancho proporcional a su
  // % del total, en vez de un donut. Se usa en Cartera > Resumen para "Asignación por tipo de
  // activo"/"Asignación por bróker" (a petición del usuario: más fácil comparar tamaños en línea
  // recta que en arco). Misma forma de retorno que donutSvg ({svg, legendHtml}) para poder
  // reutilizar tal cual la lista <ul class="donut-legend"> ya existente -- el único cambio en el
  // llamante es envolver el svg en ".chart-wrap" (ancho 100%) en vez de en ".donut-row" (flex),
  // porque esta barra es rectangular y ancha, no cuadrada como el donut.
  // CSS/HTML en vez de SVG a propósito -- versión anterior dibujaba esto con un <svg
  // viewBox="0 0 600 26"> escalado por CSS (width:100%, height:auto), y el grosor/redondeo de
  // la barra dependía del ancho REAL del contenedor (una columna angosta de .two-col daba una
  // barra más fina que una ancha, con el mismo código) -- el intento de arreglarlo forzando
  // preserveAspectRatio="none" + altura fija en el propio <svg> sí igualaba el grosor, pero esa
  // misma transformación no-uniforme también aplastaba cualquier texto dentro del mismo <svg>
  // (ver el bug de las etiquetas de subAccountBarsSvg, mismo motivo). Con CSS puro
  // (border-radius/height en px reales) el grosor y el redondeo son valores absolutos de
  // verdad, no dependen en absoluto del ancho del contenedor, y no hay ningún texto en la misma
  // "capa" que se pueda deformar -- por eso esta barra concreta ya no necesita SVG.
  function segmentedBarHtml(dataObj, colorMap) {
    var entries = Object.keys(dataObj).map(function (k) { return { label: k, value: dataObj[k] }; }).filter(function (e) { return e.value > 0; });
    entries.sort(function (a, b) { return b.value - a.value; });
    var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
    if (total <= 0 || entries.length === 0) {
      return { svg: '<div class="stacked-bar stacked-bar-empty"></div>', legendHtml: "<li>Sin datos aún</li>" };
    }
    // Cortes rectos entre tramos (divs planos, sin border-radius propio) + border-radius solo en
    // el contenedor (con overflow:hidden) para que únicamente los dos extremos de la barra
    // ENTERA queden en semicírculo -- mismo resultado que el clip-path SVG anterior, con CSS.
    var segs = entries.map(function (e, i) {
      var frac = e.value / total;
      var color = colorMap[e.label] || brokerPalette()[i % brokerPalette().length];
      e._color = color; e._pct = frac * 100;
      var borderStyle = i > 0 ? "border-left:1.5px solid var(--bg-card);" : "";
      return '<div style="flex:' + frac + ' 1 0%;background:' + color + ';' + borderStyle + '"></div>';
    }).join("");
    var html = '<div class="stacked-bar">' + segs + '</div>';
    var legendHtml = entries.map(function (e) {
      return '<li><span><i class="swatch" style="background:' + e._color + '"></i> ' + escapeHtml(e.label) + '</span><span class="mono">' + e._pct.toFixed(1) + '%</span></li>';
    }).join("");
    return { svg: html, legendHtml: legendHtml };
  }

  /* ---------------- 14. Render: Dashboard ---------------- */
  // isMoney envuelve el valor en <span class="money"> para que el modo privacidad (ver
  // styles.css) pueda difuminarlo -- solo se marca así en los chips que muestran un importe en
  // euros (Efectivo, Ingresos, Gastos, Ahorro...), no en los que muestran un % (rentabilidad,
  // drawdown) o un nombre de activo (mejor/peor posición).
  function chipHtml(label, value, sub, cls, isMoney) {
    var valueHtml = isMoney ? '<span class="money">' + value + "</span>" : value;
    return '<div class="chip ' + (cls || "") + '"><div class="chip-label">' + label + '</div><div class="chip-value mono ' + (cls || "") + '">' + valueHtml + "</div>" + (sub ? '<div class="chip-sub">' + sub + "</div>" : "") + "</div>";
  }

  function renderDashboard() {
    var m = computeMetrics();
    // La curva automática (precios reales de Yahoo Finance por posición, computeAutoEquity)
    // pasa a ser la fuente principal del Dashboard en cuanto hay datos -- antes el Dashboard SOLO
    // usaba valoraciones manuales (computeMetrics), así que para quien usa fuentes de precio en
    // vez de registrar valoraciones a mano (el caso normal ahora que hay búsqueda + conversión
    // de divisa en Posiciones) el gráfico y varios chips se quedaban vacíos para siempre. Las
    // valoraciones manuales quedan como respaldo si no hay curva automática todavía.
    var am = computeAutoEquity();
    var useAuto = am.hasData;
    var curvePoints = useAuto ? am.points : m.points;
    var curveReturn = useAuto ? am.totalReturn : m.totalReturn;
    var curveCagr = useAuto ? am.cagr : m.cagr;
    var curveMaxDD = useAuto ? am.maxDD : m.maxDD;
    var curveDays = curvePoints.length >= 2
      ? Math.max(1, Math.round((new Date(curvePoints[curvePoints.length - 1].date + "T00:00:00") - new Date(curvePoints[0].date + "T00:00:00")) / 86400000))
      : 0;

    // El Dashboard y Cartera > Resumen muestran exactamente los mismos números de
    // cartera (hero/curva/donuts) -- se calculan una sola vez arriba y se pintan en los dos
    // sitios (ids distintos) con este helper, en vez de duplicar el cálculo.
    function paintEach(ids, fn) {
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) fn(el);
      });
    }

    paintEach(["heroValue", "carteraHeroValue"], function (el) { el.textContent = fmtMoney(m.totalValue || 0); });

    var deltaHtml = "";
    if (curveReturn !== null) {
      var cls = curveReturn >= 0 ? "pos" : "neg";
      deltaHtml += '<span class="' + cls + '">' + fmtPct(curveReturn) + "</span> desde el origen";
      if (curveCagr !== null) deltaHtml += ' · <span class="' + (curveCagr >= 0 ? "pos" : "neg") + '">' + fmtPct(curveCagr) + "</span> anualizada";
    } else {
      deltaHtml = "Asigna una fuente de precio en Posiciones, o registra una valoración manual en Histórico, para ver la evolución";
    }
    paintEach(["heroDelta", "carteraHeroDelta"], function (el) { el.innerHTML = deltaHtml; });

    // El sparkline solo se conserva en Cartera > Resumen -- en el Dashboard lo sustituye
    // el gráfico de evolución completo (chart-equity), ya no hace falta duplicarlo en miniatura.
    var spark = miniSparkSvg(curvePoints);
    var sparkHtml = spark || '<div class="hero-spark-empty">La tendencia aparecerá aquí en cuanto haya al menos dos puntos de histórico (automático o manual).</div>';
    paintEach(["carteraHeroSpark"], function (el) { el.innerHTML = sparkHtml; });

    // Ingresos/gastos/ahorro del mes ANTERIOR (no el actual) en sus propias cajitas -- los
    // movimientos se suelen volcar una vez cerrado el mes, así que el mes en curso casi siempre
    // aparecería vacío aquí. Solo existe en el Dashboard (mezcla Cartera + Economía).
    var kpiIngresosEl = document.getElementById("kpi-ingresos-value");
    if (kpiIngresosEl) {
      var flowMonth = previousMonthStr();
      var flowData = computeHouseholdMonthly().find(function (hm) { return hm.month === flowMonth; }) || { income: 0, expense: 0, savings: 0 };
      var flowLabel = MONTH_ABBR_ES[parseInt(flowMonth.split("-")[1], 10) - 1];
      document.getElementById("kpi-ingresos-label").textContent = "Ingresos · " + flowLabel;
      document.getElementById("kpi-gastos-label").textContent = "Gastos · " + flowLabel;
      document.getElementById("kpi-ahorro-label").textContent = "Ahorro · " + flowLabel;
      kpiIngresosEl.innerHTML = '<span class="money">' + fmtMoney(flowData.income) + "</span>";
      document.getElementById("kpi-gastos-value").innerHTML = '<span class="money">' + fmtMoney(flowData.expense) + "</span>";
      var savingsCls = flowData.savings >= 0 ? "pos" : "neg";
      var savingsPct = flowData.income > 0 ? (flowData.savings / flowData.income) * 100 : null;
      var kpiAhorroValueEl = document.getElementById("kpi-ahorro-value");
      kpiAhorroValueEl.className = "kpi-value money " + savingsCls;
      kpiAhorroValueEl.innerHTML = '<span class="money">' + fmtMoney(flowData.savings) + "</span>";
      document.getElementById("kpi-ahorro-sub").innerHTML = savingsPct !== null ? '<span class="' + savingsCls + '">' + fmtPct(savingsPct) + "</span> de los ingresos" : "";
    }

    // Avisos -- solo se muestran si hay algo que decir. Efectivo negativo por bróker, curva sin
    // actualizar hace más de 32 días, y rentabilidad anualizada poco fiable (histórico corto) --
    // este último ya existía como texto suelto en el chip "Rentabilidad anualizada"; aquí se
    // hace explícito como aviso en vez de dejarlo solo como letra pequeña.
    var warnings = [];
    if (curveDays && curveDays < 90) {
      warnings.push("Rentabilidad anualizada poco fiable: solo " + curveDays + " días de histórico.");
    }
    Object.keys(m.cash.byBroker).forEach(function (b) {
      if (m.cash.byBroker[b] < 0) warnings.push("Efectivo negativo en " + escapeHtml(b) + ": " + fmtMoney(m.cash.byBroker[b]) + ".");
    });
    if (curvePoints.length) {
      var lastPointDate = new Date(curvePoints[curvePoints.length - 1].date + "T00:00:00");
      var daysSinceLastPoint = Math.round((new Date() - lastPointDate) / 86400000);
      if (daysSinceLastPoint > 32) {
        warnings.push("La curva de patrimonio no se actualiza desde hace " + daysSinceLastPoint + " días (último dato: " + fmtDate(curvePoints[curvePoints.length - 1].date) + ").");
      }
    }
    var warningsPanel = document.getElementById("dashboard-warnings");
    if (warningsPanel) {
      warningsPanel.style.display = warnings.length ? "block" : "none";
      document.getElementById("dashboard-warnings-list").innerHTML = warnings.map(function (w) { return "<li>" + w + "</li>"; }).join("");
    }

    // chart-equity (Dashboard) siempre muestra el histórico completo -- el selector de
    // rango solo existe en Cartera > Resumen (chart-cartera-equity), ver renderCarteraEquityChart().
    paintEach(["chart-equity"], function (el) { el.innerHTML = curvePoints.length >= 2 ? equitySvg(curvePoints) : noEquityDataSvg(); });
    lastCurvePoints = curvePoints;
    renderCarteraEquityChart();

    var chips = "";
    chips += chipHtml("Rentabilidad anualizada", curveCagr !== null ? fmtPct(curveCagr) : "—", curveDays ? curveDays + " días de histórico" : null, curveCagr >= 0 ? "pos" : "neg");
    // Rentabilidad TOTAL sobre el dinero externo aportado (ver computeCapitalExternoNeto y
    // brokerAccounting.js) -- a propósito NO se llama solo "Rentabilidad" ni se junta con el
    // desglose de rentabilidad por sub-cuenta de más abajo, para que quede claro que es una
    // cifra distinta: aquí no cuenta la plusvalía reinvertida entre brókers/sub-cuentas como
    // si fuera capital nuevo.
    chips += chipHtml("Rentabilidad total (capital externo)", m.rentabilidadTotalReal !== null ? fmtPct(m.rentabilidadTotalReal) : "—", m.capitalExternoNeto > 0 ? "sobre " + fmtMoney(m.capitalExternoNeto) + " aportados netos · no es la rentabilidad por sub-cuenta" : "Registra ingresos/retiradas para calcularla", m.rentabilidadTotalReal >= 0 ? "pos" : "neg");
    chips += chipHtml("Drawdown máximo", curvePoints.length ? fmtPct(curveMaxDD) : "—", null, "neg");
    chips += chipHtml("Mejor posición", m.best ? escapeHtml(m.best.name) : "—", m.best ? fmtPct(m.best.pnlPct) : null, "pos");
    chips += chipHtml("Peor posición", m.worst ? escapeHtml(m.worst.name) : "—", m.worst ? fmtPct(m.worst.pnlPct) : null, "neg");
    var brokerCount = Object.keys(m.cash.byBroker).length;
    chips += chipHtml("Efectivo disponible", fmtMoney(m.cash.total), brokerCount > 1 ? "en " + brokerCount + " brókers · detalle en Posiciones" : null, m.cash.total < 0 ? "neg" : "", true);
    var chipRowEl = document.getElementById("chip-row");
    if (chipRowEl) chipRowEl.innerHTML = chips; // solo en el Dashboard (ver plan)

    // Mejores posiciones -- lista vertical de 3, ordenable por rentabilidad % o por peso en
    // cartera (topPositionsSortKey, ver wiring del <select> más abajo). Se muestran siempre las
    // dos cifras a la vez, cambia solo el criterio de qué 3 se listan y en qué orden.
    var topPositionsEl = document.getElementById("top-positions-list");
    if (topPositionsEl) {
      var rankedHoldings = computeHoldingsWithWeight().slice().sort(function (a, b) {
        var av = a[topPositionsSortKey], bv = b[topPositionsSortKey];
        if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
        if (bv === null || bv === undefined) return -1;
        return bv - av;
      }).slice(0, 3);
      topPositionsEl.innerHTML = rankedHoldings.length
        ? rankedHoldings.map(function (h, i) {
            var pnlHtml = h.pnlPct !== null ? '<span class="' + (h.pnlPct >= 0 ? "pos" : "neg") + '">' + fmtPct(h.pnlPct) + "</span>" : "—";
            var weightHtml = h.weightPct !== null ? h.weightPct.toFixed(1) + "% del patrimonio" : "—";
            return '<li><span class="top-positions-rank">' + (i + 1) + '</span><span class="top-positions-name">' + escapeHtml(h.name) + '</span><span class="top-positions-stats">' + pnlHtml + '<span class="sep">·</span>' + weightHtml + "</span></li>";
          }).join("")
        : "<li>Sin posiciones abiertas todavía</li>";
    }

    // Los gráficos de asignación (tipo/bróker/activo) se eliminaron del Dashboard -- se
    // quedan únicamente en Cartera > Resumen (donut-cartera-*), sin duplicar aquí. Tipo/bróker
    // usan una barra 100% apilada (segmentedBarHtml) en vez de donut -- a petición del usuario,
    // más fácil comparar el tamaño de cada tramo en línea recta; "Distribución por activo" (más
    // abajo) conserva el donut porque ahí interesa ver también el total en € en el centro.
    var typeResult = segmentedBarHtml(m.allocByType, typeColors());
    var typeHtml = typeResult.svg + '<ul class="donut-legend">' + typeResult.legendHtml + "</ul>";
    paintEach(["donut-cartera-type"], function (el) { el.innerHTML = typeHtml; });

    var brokerColorMap = {};
    Object.keys(m.allocByBroker).forEach(function (b, i) { brokerColorMap[b] = brokerPalette()[i % brokerPalette().length]; });
    var brokerResult = segmentedBarHtml(m.allocByBroker, brokerColorMap);
    var brokerHtml = brokerResult.svg + '<ul class="donut-legend">' + brokerResult.legendHtml + "</ul>";
    paintEach(["donut-cartera-broker"], function (el) { el.innerHTML = brokerHtml; });

    // Último tono (el más neutro/grisáceo) de la paleta categórica -- mismo criterio que
    // typeColors() para "Otro", así el bucket de caja no queda con un gris suelto sin relación.
    var assetColorMap = { "Efectivo": chartPalette()[chartPalette().length - 1] };
    var assetResult = donutSvg(m.allocByAsset, assetColorMap);
    var assetHtml = "<div>" + assetResult.svg + "</div><ul class=\"donut-legend\">" + assetResult.legendHtml + "</ul>";
    paintEach(["donut-cartera-asset"], function (el) { el.innerHTML = assetHtml; });

    renderCarteraResumenPositions();
  }

  var topPositionsSortSelect = document.getElementById("top-positions-sort");
  if (topPositionsSortSelect) {
    topPositionsSortSelect.addEventListener("change", function () {
      topPositionsSortKey = topPositionsSortSelect.value;
      renderDashboard();
    });
  }

  // Cajitas KPI del Dashboard -- Patrimonio lleva a Cartera > Resumen, Ingresos/Gastos llevan a
  // Economía > Resumen; Ahorro es una cajita estática (.kpi-box-static en index.html), sin
  // pestaña propia a la que enlazar.
  var kpiPatrimonioEl = document.getElementById("kpi-patrimonio");
  if (kpiPatrimonioEl) kpiPatrimonioEl.addEventListener("click", function () { activateTab("cartera-resumen"); });
  ["kpi-ingresos", "kpi-gastos"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function () { activateTab("household"); });
  });

  /* ---------------- 15. Render: Dividendos e intereses ---------------- */
  function renderDividends() {
    var chipsEl = document.getElementById("dividends-chips");
    var listEl = document.getElementById("dividends-list");
    if (!chipsEl || !listEl) return;
    var d = computeDividends();
    chipsEl.innerHTML = chipHtml("Total recibido", fmtMoney(d.total), d.count + " pago(s) registrado(s)", d.total >= 0 ? "pos" : "neg", true);
    listEl.innerHTML = d.breakdown.length
      ? d.breakdown.map(function (e) {
          return '<li><span>' + escapeHtml(e.label) + '</span><span class="mono money">' + fmtMoney(e.value) + "</span></li>";
        }).join("")
      : "<li>Aún no hay dividendos ni intereses registrados</li>";
  }

  /* ---------------- 16. Render: Positions ---------------- */
  function sortHoldings(holdings) {
    var key = positionsSort.key, dir = positionsSort.dir === "asc" ? 1 : -1;
    return holdings.sort(function (a, b) {
      var av = a[key], bv = b[key];
      // Rent. % puede ser null (sin coste, p.ej. posición asignada gratis) -- lo mandamos
      // siempre al final en vez de dejar que null/undefined rompa la comparación numérica.
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "es") * dir;
      }
      return (av - bv) * dir;
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll("#tab-positions th.sortable").forEach(function (th) {
      var key = th.getAttribute("data-sort-key");
      var indicator = th.querySelector(".sort-indicator");
      if (key === positionsSort.key) {
        th.classList.add("sort-active");
        indicator.textContent = positionsSort.dir === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("sort-active");
        indicator.textContent = "";
      }
    });
    // Mismo estado de orden reflejado en el desplegable de la vista de tarjetas (móvil) --
    // así si se ordena desde las cabeceras de tabla (escritorio) y luego se reduce la
    // ventana, el desplegable aparece ya en el valor correcto en vez de volver a "Valor".
    var mobileSelect = document.getElementById("positions-sort-select");
    if (mobileSelect) mobileSelect.value = positionsSort.key + ":" + positionsSort.dir;
  }

  function setPositionsSort(key, dir) {
    if (dir) {
      positionsSort.key = key; positionsSort.dir = dir;
    } else if (positionsSort.key === key) {
      positionsSort.dir = positionsSort.dir === "asc" ? "desc" : "asc";
    } else {
      positionsSort.key = key;
      positionsSort.dir = TEXT_SORT_KEYS[key] ? "asc" : "desc";
    }
    renderPositions();
  }

  document.querySelectorAll("#tab-positions th.sortable[data-sort-key]").forEach(function (th) {
    th.addEventListener("click", function () { setPositionsSort(th.getAttribute("data-sort-key")); });
  });

  var positionsSortSelect = document.getElementById("positions-sort-select");
  if (positionsSortSelect) {
    positionsSortSelect.addEventListener("change", function () {
      var parts = positionsSortSelect.value.split(":");
      setPositionsSort(parts[0], parts[1]);
    });
  }

  /* ---------------- 17. Widget de Fuente + Símbolo ---------------- */
  // Reutilizado en Posiciones y en el aviso de activos sin fuente de Histórico, para
  // posiciones ya vendidas que no aparecen en Posiciones pero necesitan una fuente para que
  // su histórico cuente en la curva de rentabilidad.
  // Devuelve las dos piezas por separado -- en Posiciones van en celdas de tabla distintas
  // ("Fuente" y "Símbolo"); en el aviso de activos sin fuente de Histórico van juntas.
  function sourceWidgetHtml(key, name, ticker) {
    var priceMetaRow = PRICES.find(function (p) { return p.asset_key === key; });
    var priceMeta = priceMetaRow || {};
    // Sin fila en prices todavía, proponemos Yahoo Finance por defecto en vez de "Manual" --
    // si ya hay una fila guardada (aunque sea con fuente manual explícita), respetamos lo que
    // el usuario eligió.
    var autoSource = priceMetaRow ? (priceMeta.auto_source || "") : "yahoo";
    var autoSymbol = priceMeta.auto_symbol || "";
    var autoCurrency = priceMeta.auto_currency || "";
    var selectHtml = '<select class="source-select" data-source-key="' + key + '">' +
      '<option value="" ' + (autoSource === "" ? "selected" : "") + '>Manual</option>' +
      '<option value="yahoo" ' + (autoSource === "yahoo" ? "selected" : "") + '>Yahoo Finance</option>' +
      "</select>";
    // Selector de conversión a EUR (SPCX, AAPL... cotizan en USD y no tienen versión en euros
    // en ningún mercado -- se guarda el precio nativo pero se convierte con el tipo de cambio
    // del día antes de usarlo en la cartera). Vacío = sin convertir, igual que siempre. Se
    // oculta con Manual (no hay precio que convertir).
    var fxCurrencyOptions = ["USD", "GBP", "CHF", "JPY", "CAD", "AUD"];
    // Si la posición ya tenía guardada una divisa que no está en la lista habitual (poco común,
    // pero Yahoo puede devolver casi cualquier ISO -- DKK, SEK, etc.), se añade igualmente para
    // que el desplegable pueda mostrarla seleccionada en vez de quedarse en blanco.
    if (autoCurrency && fxCurrencyOptions.indexOf(autoCurrency) === -1) fxCurrencyOptions.push(autoCurrency);
    var fxSelectHtml = '<select class="fx-currency-select" data-fxcur-key="' + key + '" title="Si el precio viene en otra divisa, conviértelo a EUR con el tipo de cambio del día">' +
      '<option value="" ' + (autoCurrency === "" ? "selected" : "") + '>Sin convertir (ya en EUR)</option>' +
      fxCurrencyOptions.map(function (c) {
        return '<option value="' + c + '" ' + (autoCurrency === c ? "selected" : "") + ">" + c + " → EUR</option>";
      }).join("") +
      "</select>";
    // Compacto por defecto -- solo símbolo + verificar/borrar histórico + el interruptor que
    // despliega la búsqueda (buscador por nombre/ISIN + resultados, la parte que más alto hacía
    // la celda y que solo hace falta la primera vez que se asigna un símbolo o para corregirlo).
    // La conversión a divisa se deja fuera del desplegable a propósito -- es un ajuste que se
    // consulta a menudo (no solo al asignar), así que se queda siempre visible en vez de
    // esconderse detrás del mismo interruptor.
    var symbolHtml = '<div class="symbol-cell">' +
      '<input class="symbol-input" type="text" placeholder="ej. AAPL.US" value="' + escapeHtml(autoSymbol) + '" data-symbol-key="' + key + '">' +
      '<button type="button" class="icon-btn price-check-btn" data-check-key="' + key + '" title="Verificar precio y divisa actuales de este símbolo">💲</button>' +
      '<button type="button" class="icon-btn history-reset-btn" data-reset-history-key="' + key + '" title="Borrar el histórico de precios guardado de esta posición y forzar una redescarga limpia -- útil si cambiaste el símbolo o la divisa y la rentabilidad no cuadra">🗑</button>' +
      '<button type="button" class="icon-btn symbol-panel-toggle" data-toggle-panel-key="' + key + '" title="Buscar o cambiar el símbolo">🔍</button>' +
      "</div>" +
      '<div class="price-check-result" data-check-result-key="' + key + '"></div>' +
      '<div class="symbol-cell fx-currency-row" data-fxcur-row-key="' + key + '">' + fxSelectHtml + "</div>" +
      '<div class="symbol-search-panel" data-search-panel-key="' + key + '" style="display:none">' +
      '<div class="symbol-cell">' +
      '<input class="symbol-search-query" type="text" placeholder="nombre o ISIN" value="' + escapeHtml(cleanSearchName(name) || ticker || "") + '" data-query-key="' + key + '">' +
      '<select class="currency-select" data-currency-key="' + key + '" title="Filtrar resultados por divisa">' +
      '<option value="">Cualquier divisa</option>' +
      '<option value="EUR">EUR</option>' +
      '<option value="USD">USD</option>' +
      '<option value="GBP">GBP</option>' +
      '<option value="CHF">CHF</option>' +
      "</select>" +
      '<button type="button" class="icon-btn symbol-search-btn" data-search-key="' + key + '" title="Buscar en Yahoo Finance">🔍</button>' +
      "</div>" +
      '<div class="symbol-search-results" data-results-key="' + key + '"></div>' +
      "</div>";
    return { selectHtml: selectHtml, symbolHtml: symbolHtml };
  }

  // getPriceInfo(key) -> {price, broker, ticker, name}. El precio es obligatorio en la API
  // aunque solo se esté asignando una fuente (p.ej. para una posición ya vendida, que no tiene
  // "precio actual" que editar) -- cada llamador decide de dónde sacarlo. onSaved(key) es
  // opcional, para que el llamador reaccione después de guardar (p.ej. Posiciones se queda en
  // su propia pestaña).
  function wireSourceWidgets(container, getPriceInfo, onSaved) {
    function savePriceMeta(key) {
      var sourceSelect = container.querySelector('[data-source-key="' + key + '"]');
      var symbolInput = container.querySelector('[data-symbol-key="' + key + '"]');
      var fxSelect = container.querySelector('[data-fxcur-key="' + key + '"]');
      var typeSelect = container.querySelector('[data-typeoverride-key="' + key + '"]');
      var subAccountInput = container.querySelector('[data-subaccount-key="' + key + '"]');
      var info = getPriceInfo(key);
      if (!info || isNaN(info.price)) return;
      // El desplegable de Tipo solo existe en Posiciones, no en el aviso de "activos sin
      // fuente" de Histórico (ese contexto no tiene columna Tipo) -- si aquí se guarda desde
      // Histórico, en vez de mandar asset_type_override=null (que borraría un override ya
      // corregido en Posiciones para la misma posición), se reenvía el valor que ya hubiera en
      // PRICES tal cual, sin cambios.
      var existingRow = PRICES.find(function (p) { return p.asset_key === key; });
      var assetTypeOverride = typeSelect ? (typeSelect.value || null) : (existingRow ? existingRow.asset_type_override : null);
      // A diferencia del Tipo, el input de Sub-cuenta SÍ existe también en los dos avisos de
      // Histórico (activos sin fuente y posiciones ya cerradas) -- las posiciones vendidas del
      // todo nunca aparecen en Posiciones pero sí cuentan en el desglose por sub-cuenta
      // (computeAutoEquity las incluye igual que las abiertas), así que necesitan poder
      // asignarla desde ahí. Si algún contexto futuro reutiliza este widget sin ese input, se
      // reenvía el valor ya guardado tal cual en vez de mandar sub_account=null y borrarlo.
      var subAccount = subAccountInput ? (subAccountInput.value.trim() || null) : (existingRow ? existingRow.sub_account : null);
      api("/api/prices", { method: "POST", body: JSON.stringify({
        asset_key: key, broker: info.broker, ticker: info.ticker, name: info.name,
        price: info.price, auto_source: sourceSelect.value || null, auto_symbol: symbolInput.value.trim() || null,
        auto_currency: fxSelect ? (fxSelect.value || null) : null,
        asset_type_override: assetTypeOverride,
        sub_account: subAccount
      }) })
        .then(function () { return loadAll(); })
        .then(function () { if (onSaved) onSaved(key); });
    }

    // La conversión a EUR no pinta nada con Manual (no hay precio de una fuente que convertir).
    function syncFxRowVisibility(key) {
      var sourceSelect = container.querySelector('[data-source-key="' + key + '"]');
      var row = container.querySelector('[data-fxcur-row-key="' + key + '"]');
      if (!row) return;
      var hide = !sourceSelect || sourceSelect.value === "";
      row.style.display = hide ? "none" : "";
    }
    container.querySelectorAll("[data-fxcur-row-key]").forEach(function (row) {
      syncFxRowVisibility(row.getAttribute("data-fxcur-row-key"));
    });

    container.querySelectorAll("[data-source-key]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var key = sel.getAttribute("data-source-key");
        syncFxRowVisibility(key);
        savePriceMeta(key);
      });
    });
    container.querySelectorAll("[data-symbol-key]").forEach(function (inp) {
      inp.addEventListener("change", function () { savePriceMeta(inp.getAttribute("data-symbol-key")); });
    });
    container.querySelectorAll("[data-fxcur-key]").forEach(function (sel) {
      sel.addEventListener("change", function () { savePriceMeta(sel.getAttribute("data-fxcur-key")); });
    });
    container.querySelectorAll("[data-typeoverride-key]").forEach(function (sel) {
      sel.addEventListener("change", function () { savePriceMeta(sel.getAttribute("data-typeoverride-key")); });
    });
    container.querySelectorAll("[data-subaccount-key]").forEach(function (inp) {
      inp.addEventListener("change", function () { savePriceMeta(inp.getAttribute("data-subaccount-key")); });
    });

    // Botón "🗑": borra el histórico de precios ya descargado de esta posición (no toca el
    // precio actual ni las operaciones) -- para forzar una redescarga limpia si sospechas que
    // quedó contaminado con un símbolo/divisa anterior (ver borrado automático al cambiarlos en
    // savePriceMeta -> POST /api/prices, que ya evita que esto vuelva a pasar a partir de ahora).
    container.querySelectorAll("[data-reset-history-key]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-reset-history-key");
        if (!confirm("¿Borrar el histórico de precios guardado de esta posición? No toca tus operaciones ni el precio actual -- se volverá a descargar limpio la próxima vez que actualices el histórico.")) return;
        api("/api/price-history/" + encodeURIComponent(key), { method: "DELETE" })
          .then(loadAll)
          .catch(function (err) { alert("Error al borrar el histórico: " + err.message); });
      });
    });

    // Botón "🔍" de la fila compacta: despliega/oculta el buscador por nombre/ISIN (colapsado
    // por defecto, ver sourceWidgetHtml) -- no busca nada por sí mismo, eso lo sigue haciendo el
    // botón "Buscar en Yahoo Finance" de dentro del panel una vez desplegado.
    container.querySelectorAll("[data-toggle-panel-key]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var panel = container.querySelector('[data-search-panel-key="' + btn.getAttribute("data-toggle-panel-key") + '"]');
        if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
      });
    });

    function fmtPriceCurrency(price, currency) {
      var num = Number(price).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      return currency ? num + " " + currency : num;
    }

    // Botón "verificar" (💲): consulta en vivo el precio/divisa del símbolo ya escrito o
    // guardado, sin esperar al refresco general -- para confirmar que la fuente asignada
    // apunta al instrumento correcto antes de fiarse de ella para el histórico. Si hay una
    // conversión a EUR elegida, también muestra el valor ya convertido con el tipo de cambio
    // del momento (p.ej. SPCX en USD -> su equivalente en EUR ahora mismo).
    container.querySelectorAll(".price-check-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-check-key");
        var sourceSelect = container.querySelector('[data-source-key="' + key + '"]');
        var symbolInput = container.querySelector('[data-symbol-key="' + key + '"]');
        var fxSelect = container.querySelector('[data-fxcur-key="' + key + '"]');
        var resultEl = container.querySelector('.price-check-result[data-check-result-key="' + key + '"]');
        var source = sourceSelect ? sourceSelect.value : "";
        var symbol = symbolInput ? symbolInput.value.trim() : "";
        var convert = fxSelect ? fxSelect.value : "";
        if (!source) { resultEl.innerHTML = '<span class="no-price">Elige antes la fuente (Yahoo Finance).</span>'; return; }
        if (!symbol) { resultEl.innerHTML = '<span class="no-price">Escribe antes un símbolo.</span>'; return; }
        btn.disabled = true;
        resultEl.innerHTML = '<span class="hint" style="margin:0">Consultando…</span>';
        var url = "/api/price-check?source=" + encodeURIComponent(source) + "&symbol=" + encodeURIComponent(symbol);
        if (convert) url += "&convert=" + encodeURIComponent(convert);
        api(url)
          .then(function (res) {
            var html = '<span class="price-stamp">Último precio: ' + fmtPriceCurrency(res.price, res.currency) + "</span>";
            if (res.eurPrice != null) {
              html += '<span class="price-stamp">≈ ' + fmtPriceCurrency(res.eurPrice, "EUR") + " (cambio " + res.currency + "→EUR: " + res.fxRate.toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ")</span>";
            }
            resultEl.innerHTML = html;
          })
          .catch(function (err) {
            resultEl.innerHTML = '<span class="no-price">' + escapeHtml(err.message) + "</span>";
          })
          .finally(function () { btn.disabled = false; });
      });
    });

    // Buscador de símbolo (por nombre o ISIN, editable) en Yahoo Finance. Muestra precio y
    // divisa en vivo de cada coincidencia para que el usuario
    // elija la bolsa correcta (p.ej. Xetra en euros si es donde cotiza vía su bróker, no Nasdaq
    // en dólares) -- no se asigna nada sin confirmar, porque adivinar el sufijo de mercado a
    // ciegas puede devolver el precio de un instrumento distinto. El selector de divisa solo
    // filtra la lista ya traída, no repite la búsqueda.
    container.querySelectorAll(".symbol-search-btn").forEach(function (btn) {
      var key = btn.getAttribute("data-search-key");
      var lastResults = [];
      var lastSearchNote = "";

      function currencySelectEl() { return container.querySelector('[data-currency-key="' + key + '"]'); }

      function renderResults() {
        var resultsEl = container.querySelector('.symbol-search-results[data-results-key="' + key + '"]');
        var sel = currencySelectEl();
        var wantedCurrency = sel ? sel.value : "";
        var filtered = wantedCurrency ? lastResults.filter(function (r) { return r.currency === wantedCurrency; }) : lastResults;
        var noteHtml = lastSearchNote ? '<div class="search-hint">' + escapeHtml(lastSearchNote) + "</div>" : "";
        if (filtered.length === 0) {
          resultsEl.innerHTML = noteHtml + '<div class="search-hint">' + (lastResults.length ? "Ningún resultado cotiza en " + escapeHtml(wantedCurrency) + "." : "Sin resultados.") + "</div>";
          return;
        }
        resultsEl.innerHTML = noteHtml + filtered.map(function (r) {
          var i = lastResults.indexOf(r);
          return '<button type="button" class="search-result" data-result-index="' + i + '">' +
            '<span class="mono">' + escapeHtml(r.display) + '</span>' +
            '<span class="search-result-meta">' + escapeHtml(r.meta) +
            (r.price != null ? " · " + fmtPriceCurrency(r.price, r.currency) : " · divisa desconocida") + '</span>' +
            "</button>";
        }).join("");
        resultsEl.querySelectorAll(".search-result").forEach(function (rBtn) {
          rBtn.addEventListener("click", function () {
            var i = parseInt(rBtn.getAttribute("data-result-index"), 10);
            var symbolInput = container.querySelector('[data-symbol-key="' + key + '"]');
            var sourceSelect = container.querySelector('[data-source-key="' + key + '"]');
            var fxSelect = container.querySelector('[data-fxcur-key="' + key + '"]');
            var resultEl = container.querySelector('.price-check-result[data-check-result-key="' + key + '"]');
            symbolInput.value = lastResults[i].assign;
            sourceSelect.value = "yahoo";
            syncFxRowVisibility(key);
            // Ya sabemos la divisa real de este resultado (se pidió al buscar) -- se propone
            // directamente la conversión a EUR si no cotiza ya en euros, en vez de dejar que el
            // usuario tenga que descubrirlo y elegirlo aparte.
            if (fxSelect) {
              var pickedCurrency = lastResults[i].currency;
              if (pickedCurrency && pickedCurrency !== "EUR") {
                // La divisa real puede no estar entre las opciones fijas del desplegable (p.ej.
                // DKK, SEK) -- se añade sobre la marcha para poder seleccionarla igualmente.
                var hasOption = Array.prototype.some.call(fxSelect.options, function (o) { return o.value === pickedCurrency; });
                if (!hasOption) {
                  var opt = document.createElement("option");
                  opt.value = pickedCurrency;
                  opt.textContent = pickedCurrency + " → EUR";
                  fxSelect.appendChild(opt);
                }
                fxSelect.value = pickedCurrency;
              } else {
                fxSelect.value = "";
              }
            }
            if (lastResults[i].price != null) {
              resultEl.innerHTML = '<span class="price-stamp">Último precio: ' + fmtPriceCurrency(lastResults[i].price, lastResults[i].currency) + "</span>";
            }
            resultsEl.innerHTML = "";
            savePriceMeta(key);
          });
        });
      }

      var currencySelectElNode = currencySelectEl();
      if (currencySelectElNode) currencySelectElNode.addEventListener("change", renderResults);

      btn.addEventListener("click", function () {
        var queryInput = container.querySelector('[data-query-key="' + key + '"]');
        var query = queryInput ? queryInput.value.trim() : "";
        var resultsEl = container.querySelector('.symbol-search-results[data-results-key="' + key + '"]');
        if (!query) { resultsEl.innerHTML = '<div class="search-hint">Escribe un nombre o ISIN para buscar.</div>'; return; }
        btn.disabled = true;
        var originalText = btn.textContent;
        btn.textContent = "…";
        resultsEl.innerHTML = '<div class="search-hint">Buscando en Yahoo Finance (consultando precio de cada resultado)…</div>';
        api("/api/yahoo-search?q=" + encodeURIComponent(query))
          .then(function (res) {
            var raw = res.results || [];
            lastResults = raw.map(function (r) { return { display: r.symbol, assign: r.symbol, meta: r.exchange + (r.name ? " · " + r.name : ""), price: r.price, currency: r.currency }; });
            // Cuando Yahoo no da nada para el nombre completo del fondo, el servidor reintenta
            // solo con parte del texto (ver buildSearchCandidates) -- se avisa de qué texto
            // encontró resultados de verdad, para que no parezca magia ni un error silencioso.
            lastSearchNote = (res.query && res.originalQuery && res.query !== res.originalQuery && lastResults.length)
              ? 'Sin resultados para el nombre completo -- mostrando resultados para "' + res.query + '".'
              : "";
            if (lastResults.length === 0) {
              resultsEl.innerHTML = '<div class="search-hint">Sin resultados para "' + escapeHtml(query) + '".</div>';
              return;
            }
            renderResults();
          })
          .catch(function (err) {
            resultsEl.innerHTML = '<div class="search-hint">Error al buscar: ' + escapeHtml(err.message) + "</div>";
          })
          .finally(function () {
            btn.disabled = false;
            btn.textContent = originalText;
          });
      });
    });

    return savePriceMeta;
  }

  // Desplegable de Tipo en Posiciones -- corrige asset_type_override (guardado en "prices",
  // ver computeHoldings) sin opción de "(automático)": si te equivocas, simplemente eliges
  // otro valor de la lista, igual que el desplegable de Fuente.
  function assetTypeSelectHtml(key, currentType) {
    return '<select class="type-select" data-typeoverride-key="' + key + '">' +
      ASSET_TYPES.map(function (t) {
        return '<option value="' + t + '" ' + (t === currentType ? "selected" : "") + ">" + t + "</option>";
      }).join("") +
      "</select>";
  }

  // Input de texto libre de Sub-cuenta en Posiciones -- guarda sub_account (en "prices", ver
  // resolveHoldingSubAccounts) para el desglose de rentabilidad de Cartera > Resumen. Con
  // autocompletado (datalist #sub-account-options, poblado en renderPositions con los valores
  // ya usados) en vez de un desplegable fijo, para no imponer un vocabulario -- cada bróker
  // puede tener sus propias sub-cuentas (o ninguna).
  function subAccountInputHtml(key, currentSubAccount) {
    return '<input class="subaccount-input" type="text" list="sub-account-options" placeholder="p.ej. Cuenta de valores" value="' + escapeHtml(currentSubAccount || "") + '" data-subaccount-key="' + key + '">';
  }

  function renderPositions() {
    var holdings = computeHoldingsWithWeight();
    holdings = sortHoldings(holdings);
    var body = document.getElementById("positions-body");
    var emptyEl = document.getElementById("positions-empty");
    updateSortIndicators();
    if (holdings.length === 0) {
      body.innerHTML = "";
      emptyEl.innerHTML = '<div class="empty-state"><strong>Aún no hay posiciones</strong>Añade operaciones de compra en la pestaña "Operaciones" o impórtalas desde un CSV.</div>';
      return;
    }
    emptyEl.innerHTML = "";
    // El bróker se apila como línea secundaria dentro de "Activo" en vez de columna propia --
    // pero solo si hay más de uno en cartera: con un único bróker, repetirlo en cada fila no
    // aporta nada y solo ocupa sitio.
    var hasMultipleBrokers = new Set(holdings.map(function (h) { return brokerNormKey(h.broker); })).size > 1;
    body.innerHTML = holdings.map(function (h) {
      var pnlCls = h.pnlPct === null ? "" : (h.pnlPct >= 0 ? "pos" : "neg");
      var priceMetaRow = PRICES.find(function (p) { return p.asset_key === h.key; });
      var priceMeta = priceMetaRow || {};
      var stampHtml = "";
      if (priceMeta.auto_source && priceMeta.updated_at) {
        var sourceLabel = "Yahoo Finance";
        stampHtml = '<span class="price-stamp">' + sourceLabel + " · " + fmtDate(priceMeta.updated_at.slice(0, 10)) + "</span>";
      } else if (!h.hasPrice) {
        stampHtml = '<span class="no-price">sin actualizar</span>';
      }
      var widget = sourceWidgetHtml(h.key, h.name, h.ticker);
      // Rentabilidad en divisa nativa (p.ej. USD) -- solo si la posición tiene divisa asignada
      // y ya llegó su histórico de tipo de cambio (ver ensureFxHistory/computeNativePnl). Vive
      // dentro de la misma celda "Rentabilidad" en vez de una columna nueva.
      var nativePnl = computeNativePnl(h.key, priceMeta);
      var nativePnlHtml = "";
      if (nativePnl) {
        var nativeCls = nativePnl.abs >= 0 ? "pos" : "neg";
        var nativeAbsStr = isPrivacyMode() ? PRIVACY_MASK : ((nativePnl.abs >= 0 ? "+" : "") + nativePnl.abs.toFixed(2));
        nativePnlHtml = '<span class="pnl-sub ' + nativeCls + '">≈ ' + nativeAbsStr + " " + escapeHtml(nativePnl.currency) + "</span>";
      }
      return "<tr>" +
        '<td data-label="Activo">' + escapeHtml(h.name) + (h.ticker ? ' <span class="stat-sub">(' + escapeHtml(h.ticker) + ')</span>' : "") +
          (hasMultipleBrokers ? '<span class="price-stamp">' + escapeHtml(h.broker) + "</span>" : "") + "</td>" +
        '<td data-label="Tipo / Sub-cuenta">' + assetTypeSelectHtml(h.key, h.type) + subAccountInputHtml(h.key, priceMeta.sub_account) + "</td>" +
        '<td class="right mono" data-label="Cantidad / Coste medio">' + h.qty.toLocaleString("es-ES", { maximumFractionDigits: 8 }) +
          '<span class="price-stamp money">Coste medio: ' + fmtMoney(h.avgPrice) + "</span></td>" +
        '<td class="right mono" data-label="Precio actual"><input class="price-input" type="number" step="any" value="' + h.currentPrice.toFixed(6).replace(/\.?0+$/, "") + '" data-price-key="' + h.key + '" data-broker="' + escapeHtml(h.broker) + '" data-ticker="' + escapeHtml(h.ticker || "") + '" data-name="' + escapeHtml(h.name) + '">' + stampHtml + "</td>" +
        '<td data-label="Fuente">' + widget.selectHtml + "</td>" +
        '<td class="symbol-td" data-label="Símbolo">' + widget.symbolHtml + "</td>" +
        '<td class="right mono money" data-label="Valor / % Peso">' + fmtMoney(h.value) +
          (h.weightPct != null ? '<span class="price-stamp">' + h.weightPct.toFixed(1) + "% del patrimonio</span>" : "") + "</td>" +
        '<td class="right mono ' + pnlCls + '" data-label="Rentabilidad">' + fmtPct(h.pnlPct) +
          '<span class="pnl-sub money ' + pnlCls + '">' + fmtMoneySigned(h.pnlAbs) + "</span>" + nativePnlHtml + "</td>" +
        "</tr>";
    }).join("");

    var datalistEl = document.getElementById("sub-account-options");
    if (datalistEl) {
      var subAccountValues = Array.from(new Set(PRICES.map(function (p) { return (p.sub_account || "").trim(); }).filter(Boolean))).sort();
      datalistEl.innerHTML = subAccountValues.map(function (v) { return '<option value="' + escapeHtml(v) + '"></option>'; }).join("");
    }

    var savePriceMeta = wireSourceWidgets(body, function (key) {
      var priceInput = body.querySelector('[data-price-key="' + key + '"]');
      return {
        price: parseFloat(priceInput.value),
        broker: priceInput.getAttribute("data-broker"),
        ticker: priceInput.getAttribute("data-ticker"),
        name: priceInput.getAttribute("data-name")
      };
    }, function () { activateTab("positions"); });

    body.querySelectorAll("[data-price-key]").forEach(function (input) {
      input.addEventListener("change", function () { savePriceMeta(input.getAttribute("data-price-key")); });
    });
  }

  /* ---------------- 18. Render: Cartera > Resumen -- lista esquemática de posiciones ---------------- */
  // Versión reducida de renderPositions(): mismos datos (computeHoldingsWithWeight), pero solo
  // Activo/Valor/%Peso/Rentabilidad -- sin bróker/tipo/cantidad/coste medio/fuente/símbolo, que
  // se editan desde la tabla completa de Posiciones, no desde este vistazo de solo lectura.
  function renderCarteraResumenPositions() {
    var body = document.getElementById("cartera-resumen-positions-body");
    var emptyEl = document.getElementById("cartera-resumen-positions-empty");
    if (!body) return;
    var holdings = computeHoldingsWithWeight().sort(function (a, b) { return b.value - a.value; });
    if (holdings.length === 0) {
      body.innerHTML = "";
      if (emptyEl) emptyEl.innerHTML = '<div class="empty-state"><strong>Aún no hay posiciones</strong>Añade operaciones de compra en la pestaña "Operaciones" o impórtalas desde un CSV.</div>';
      return;
    }
    if (emptyEl) emptyEl.innerHTML = "";
    body.innerHTML = holdings.map(function (h) {
      var pnlCls = h.pnlPct === null ? "" : (h.pnlPct >= 0 ? "pos" : "neg");
      return "<tr>" +
        '<td data-label="Activo">' + escapeHtml(h.name) + "</td>" +
        '<td class="right mono money" data-label="Valor">' + fmtMoney(h.value) + "</td>" +
        '<td class="right mono" data-label="% Peso">' + (h.weightPct != null ? h.weightPct.toFixed(1) + "%" : "—") + "</td>" +
        '<td class="right mono ' + pnlCls + '" data-label="Rentabilidad">' + fmtPct(h.pnlPct) + "</td>" +
        '<td class="right mono money ' + pnlCls + '" data-label="Rentabilidad €">' + fmtMoneySigned(h.pnlAbs) + "</td>" +
        "</tr>";
    }).join("");
  }

  // Barras horizontales de rentabilidad por sub-cuenta dentro de un bróker -- mismo lenguaje
  // visual que equitySvg/donutSvg (viewBox propio, colores leídos del tema activo en el momento
  // de generar el SVG, ver themeColor()). La longitud de la barra es proporcional al dinero de
  // cada grupo; el % de rentabilidad se muestra como texto coloreado acento/negativo, igual que
  // .pos/.neg en el resto de la app. rows: [{label, value, returnPct}].
  // Un color fijo por sub-cuenta (mismo orden que llegan en "rows", que ya viene ordenado por
  // brokerSubAccountBuckets) en vez de una única barra -- de un vistazo se distingue Cuenta de
  // valores de Wallet Cripto sin tener que leer la etiqueta. Reutiliza la misma paleta categórica
  // que los donuts (chartPalette()), quitando el último tono (el neutro reservado para
  // "Efectivo"/"Otro") para que las barras de sub-cuenta se vean siempre con un color "con
  // cuerpo".
  function subaccountBarColors() { var p = chartPalette(); return p.slice(0, p.length - 1); }
  // CSS/HTML en vez de SVG -- la versión SVG anterior escalaba TODO (barra y texto) con el mismo
  // viewBox, así que forzar el grosor de la barra a un valor absoluto (preserveAspectRatio="none"
  // + altura fija) también achataba las etiquetas ("TOTAL", "CUENTA DE VALORES"...), que
  // comparten el mismo <svg> y por tanto la misma transformación no-uniforme. Con filas de HTML
  // normal, el texto es texto real (nunca se deforma) y la barra es un div con altura/redondeo
  // en px reales -- mismo componente .stacked-bar-track/.stacked-bar-fill que usa
  // segmentedBarHtml, para que las barras de los dos paneles midan literalmente lo mismo.
  function subAccountBarsHtml(rows) {
    var maxValue = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.value || 0; })));
    var barColors = subaccountBarColors();
    return '<div class="subaccount-bar-list">' + rows.map(function (r, i) {
      var color = barColors[i % barColors.length];
      var fillPct = r.value ? Math.max(1, (r.value / maxValue) * 100) : 0;
      var pctCls = (r.returnPct === null || r.returnPct === undefined) ? "" : (r.returnPct >= 0 ? "pos" : "neg");
      return '<div class="subaccount-bar-row">' +
        '<div class="subaccount-bar-row-head">' +
          '<span class="subaccount-bar-label mono">' + escapeHtml((r.label || "").toUpperCase()) + '</span>' +
          '<span class="subaccount-bar-value mono">' + (r.value != null ? fmtMoney(r.value) : "—") + '</span>' +
        '</div>' +
        '<div class="stacked-bar-track" style="background:' + hexToRgba(color, 0.16) + '"><div class="stacked-bar-fill" style="width:' + fillPct + '%;background:' + color + '"></div></div>' +
        '<div class="subaccount-bar-pct mono ' + pctCls + '">' + fmtPct(r.returnPct) + '</div>' +
      '</div>';
    }).join("") + '</div>';
  }

  // Gasto por categoría del mes seleccionado en Resumen (Economía) -- mismo componente visual
  // que subAccountBarsHtml (barras horizontales ordenadas, .stacked-bar-track/-fill), aquí con
  // "% del gasto del mes" en vez de rentabilidad, y ordenado de mayor a menor gasto en vez de por
  // el orden que ya trajera "rows" (aquí no hay un orden natural previo, el propio dato lo fija).
  function categoryExpenseBarsHtml(byCategory) {
    var entries = Object.keys(byCategory).map(function (k) { return { label: k, value: byCategory[k] }; }).filter(function (e) { return e.value > 0; });
    if (entries.length === 0) return '<div class="empty-state"><strong>Sin gastos este mes</strong></div>';
    entries.sort(function (a, b) { return b.value - a.value; });
    var total = entries.reduce(function (s, e) { return s + e.value; }, 0);
    var maxValue = entries[0].value;
    var colors = chartPalette();
    return '<div class="subaccount-bar-list">' + entries.map(function (e, i) {
      var color = colors[i % colors.length];
      var fillPct = Math.max(1, (e.value / maxValue) * 100);
      var pct = total > 0 ? (e.value / total) * 100 : 0;
      return '<div class="subaccount-bar-row">' +
        '<div class="subaccount-bar-row-head">' +
          '<span class="subaccount-bar-label mono">' + escapeHtml(e.label.toUpperCase()) + '</span>' +
          '<span class="subaccount-bar-value mono">' + fmtMoney(e.value) + '</span>' +
        '</div>' +
        '<div class="stacked-bar-track" style="background:' + hexToRgba(color, 0.16) + '"><div class="stacked-bar-fill" style="width:' + fillPct + '%;background:' + color + '"></div></div>' +
        '<div class="subaccount-bar-pct mono">' + pct.toFixed(1) + '% del gasto del mes</div>' +
      '</div>';
    }).join("") + '</div>';
  }

  // Desglose de rentabilidad por sub-cuenta dentro de un bróker -- solo tiene sentido pintarlo
  // cuando el bróker tiene 2+ grupos con datos (ver brokerSubAccountBuckets): algunos brókers
  // (p.ej. Trade Republic) separan la cartera en varias "cuentas" (Cuenta de valores, Renta
  // Fija, Wallet Cripto...) con su propia rentabilidad, y no siempre enseñan el % combinado que
  // ya da la tarjeta de arriba -- esto permite comparar cada trozo con lo que muestra el bróker.
  function subAccountBreakdownHtml(broker) {
    var groups = brokerSubAccountBuckets(broker);
    var results;
    if (groups.length >= 2) {
      results = groups.map(function (g) { return { label: g, gr: computeGroupReturn(broker, g) }; });
    } else {
      // Bróker sin sub-cuentas (p.ej. Interactive Brokers, una única cuenta) -- una sola fila
      // "Total" con la fórmula simple aplicada a todo el bróker, en vez de no pintar nada.
      var totalGr = computeBrokerTotalReturn(broker);
      if (!totalGr.hasData) return "";
      results = [{ label: "Total", gr: totalGr }];
    }
    var rows = results.map(function (r) { return { label: r.label, value: r.gr.value, returnPct: r.gr.returnPct }; });
    // Desglose de las cifras que entran en cada barra (capital nuevo, disponible, número y suma
    // de compras/ventas/dividendos/traspasos) -- para poder comparar estos números sueltos
    // contra lo que el usuario sabe de sus propias operaciones cuando el % no cuadra con lo que
    // reporta el bróker, sin tener que revisar operación por operación. Colapsado por defecto
    // (<details>) para no ensuciar la vista normal.
    // Verificación cruzada, independiente de las filas por sub-cuenta de abajo (que son
    // rentabilidad de TRADING): capital externo neto de este bróker (solo ingresos/retiradas)
    // contra el valor actual de todo lo que hay en él (efectivo + posiciones abiertas). A
    // propósito no distingue sub-cuentas ni capital reciclado -- sirve para comparar contra la
    // web/app del propio bróker sin depender de cómo se haya clasificado cada operación; ver
    // computeBrokerCapitalVerification.
    var verif = computeBrokerCapitalVerification(broker);
    var verifHtml = '<tr><td colspan="2"><strong>Verificación (capital externo)</strong></td></tr>' +
      '<tr><td title="Σ ingresos − Σ retiradas de este bróker (dinero real puesto/sacado desde el banco, sin contar dividendos, intereses ni traspasos en especie).">Capital externo neto</td><td class="right">' + fmtMoney(verif.capitalExternoNeto) + "</td></tr>" +
      '<tr><td title="Efectivo de este bróker + valor de mercado de sus posiciones abiertas ahora mismo.">Valor actual (bróker)</td><td class="right">' + fmtMoney(verif.valorActual) + "</td></tr>" +
      '<tr><td title="(Valor actual − Capital externo neto) / Capital externo neto. Deliberadamente más simple que las filas de abajo: no distingue capital reciclado (venta que financia otra compra) de capital nuevo, ni depende de cómo se haya clasificado cada operación -- compárala con lo que muestra la web/app de este bróker. Si diverge mucho, revisa la clasificación de sus operaciones.">Rentabilidad de verificación</td><td class="right">' +
      (verif.rentabilidadPct != null ? fmtPct(verif.rentabilidadPct) : "— (capital ≤ 0)") + "</td></tr>";
    var detailHtml = '<details class="broker-equity-debug"><summary>Ver desglose de cifras</summary><table class="mono"><tbody>' +
      verifHtml +
      results.map(function (r) {
        var c = r.gr.counts || {};
        return '<tr><td colspan="2"><strong>' + escapeHtml(r.label) + '</strong></td></tr>' +
          '<tr><td>Capital nuevo</td><td class="right">' + fmtMoney(r.gr.capital || 0) + "</td></tr>" +
          '<tr><td>' + (r.label === CASH_INTEREST_GROUP ? "Solo intereses (dividendos)" : "Disponible (ventas+dividendos+traspasos)") + '</td><td class="right">' + fmtMoney(r.gr.available || 0) + "</td></tr>" +
          '<tr><td>' + (r.label === CASH_INTEREST_GROUP ? "Efectivo total del bróker" : "Valor actual de lo abierto") + '</td><td class="right">' + fmtMoney(r.gr.value || 0) + "</td></tr>" +
          '<tr><td>Compras (nº / suma)</td><td class="right">' + (c.compra || 0) + " / " + fmtMoney(c.sumaCompras || 0) + "</td></tr>" +
          '<tr><td>Ventas (nº / suma)</td><td class="right">' + (c.venta || 0) + " / " + fmtMoney(c.sumaVentas || 0) + "</td></tr>" +
          '<tr><td>Dividendos (nº / suma)</td><td class="right">' + (c.dividendo || 0) + " / " + fmtMoney(c.sumaDividendos || 0) + "</td></tr>" +
          '<tr><td>Traspasos en especie (nº / suma)</td><td class="right">' + (c.traspaso || 0) + " / " + fmtMoney(c.sumaTraspasos || 0) + "</td></tr>" +
          '<tr><td title="Ganancia / (Compras − Ventas − Dividendos − Traspasos). Es la fórmula que parece usar Trade Republic en su propia app -- a diferencia del % principal (capital nuevo), no descuenta la reinversión, así que con mucho trading dentro del grupo puede dispararse o perder sentido (base cerca de 0 o negativa).">% estilo Trade Republic</td><td class="right">' +
          (r.label === CASH_INTEREST_GROUP ? "— (no es una inversión)" : (r.gr.returnPctTR != null ? fmtPct(r.gr.returnPctTR) : "— (base ≤ 0, inestable)")) + "</td></tr>";
      }).join("") +
      "</tbody></table></details>";
    return '<div class="broker-equity-breakdown">' + subAccountBarsHtml(rows) + detailHtml + "</div>";
  }

  // Mini-gráficos de rentabilidad por bróker, en Cartera > Resumen -- misma curva que la
  // combinada de arriba (computeAutoEquity) pero filtrada a un solo bróker cada vez, para poder
  // comparar el % de cada uno con lo que reporta la web del propio bróker y detectar si el
  // cálculo está bien hecho (más fácil de verificar por partes que sobre el total mezclado).
  function renderBrokerEquity() {
    var gridEl = document.getElementById("broker-equity-grid");
    var emptyEl = document.getElementById("broker-equity-empty");
    if (!gridEl) return;
    var brokers = Array.from(new Set(
      TX.filter(function (t) { return t.type === "compra" || t.type === "venta"; })
        .map(function (t) { return brokerDisplayName(t.broker); })
    )).sort();

    if (brokers.length === 0) {
      gridEl.innerHTML = "";
      if (emptyEl) emptyEl.innerHTML = '<div class="empty-state"><strong>Aún no hay operaciones de compra/venta</strong></div>';
      return;
    }
    if (emptyEl) emptyEl.innerHTML = "";

    gridEl.innerHTML = brokers.map(function (b) {
      var bm = computeAutoEquity(b);
      var returnHtml = bm.totalReturn !== null
        ? '<span class="' + (bm.totalReturn >= 0 ? "pos" : "neg") + '">' + fmtPct(bm.totalReturn) + "</span> desde el origen"
        : "Sin datos suficientes todavía -- revisa el aviso de \"activos sin fuente\" en la pestaña Histórico";
      var totalHtml = bm.points.length > 0
        ? '<div class="broker-equity-total">' + fmtMoney(bm.points[bm.points.length - 1].value) + "</div>"
        : "";
      var spark = bm.points.length >= 2 ? miniSparkSvg(bm.points) : null;
      var sparkHtml = spark || '<div class="hero-spark-empty">La tendencia aparecerá aquí en cuanto haya histórico</div>';
      return '<div class="broker-equity-card">' +
        '<div class="broker-equity-name">' + escapeHtml(b) + "</div>" +
        totalHtml +
        '<div class="broker-equity-return">' + returnHtml + "</div>" +
        '<div class="broker-equity-spark">' + sparkHtml + "</div>" +
        subAccountBreakdownHtml(b) +
        "</div>";
    }).join("");
  }

  /* ---------------- 19. Render: Efectivo por bróker ---------------- */
  function renderCash() {
    var cash = computeCashByBroker();
    var body = document.getElementById("cash-body");
    var emptyEl = document.getElementById("cash-empty");
    var brokers = Object.keys(cash.byBroker).sort(function (a, b) { return cash.byBroker[b] - cash.byBroker[a]; });
    if (brokers.length === 0) {
      body.innerHTML = "";
      emptyEl.innerHTML = '<div class="empty-state"><strong>Aún no hay movimientos de efectivo</strong>Se calcula a partir de tus operaciones de ingreso, retirada, compra, venta, dividendo y comisión.</div>';
      return;
    }
    emptyEl.innerHTML = "";
    // Nunca se enseña en negativo -- un bróker real no puede tener efectivo bajo cero, así que
    // un negativo aquí es siempre ruido de redondeo del histórico importado (céntimos), nunca
    // dinero real "en descubierto". Se acota solo en esta tabla (a 0, con Math.max) para no
    // enseñar un número confuso; el resto de cálculos (patrimonio total, rentabilidad) siguen
    // usando el valor real con su signo, sin este suelo -- ahí sí interesa que un negativo se
    // note, como aviso de que falta importar algún ingreso.
    var rows = brokers.map(function (b) {
      var v = Math.max(cash.byBroker[b], 0);
      return "<tr><td>" + escapeHtml(b) + '</td><td class="right mono money">' + fmtMoney(v) + "</td></tr>";
    }).join("");
    var total = Math.max(cash.total, 0);
    rows += '<tr><td><strong>Total</strong></td><td class="right mono money"><strong>' + fmtMoney(total) + "</strong></td></tr>";
    body.innerHTML = rows;
  }

  function refreshPrices(silent) {
    var statusEl = document.getElementById("refresh-status");
    var btn = document.getElementById("btn-refresh-prices");
    if (!silent) { btn.disabled = true; btn.textContent = "Actualizando…"; }
    return api("/api/prices/refresh", { method: "POST" })
      .then(function (res) {
        if (!silent) {
          statusEl.style.display = "block";
          var msg = res.updated + " precio(s) actualizado(s)";
          if (res.errors && res.errors.length) msg += " · " + res.errors.length + " con error: " + res.errors.map(function (e) { return e.symbol + " (" + e.error + ")"; }).join(", ");
          statusEl.textContent = msg;
        }
        return loadAll();
      })
      .then(function () { if (!silent) activateTab("positions"); })
      .catch(function (err) { if (!silent) { statusEl.style.display = "block"; statusEl.textContent = "Error al actualizar: " + err.message; } })
      .finally(function () { if (!silent) { btn.disabled = false; btn.textContent = "↻ Actualizar precios"; } });
  }
  document.getElementById("btn-refresh-prices").addEventListener("click", function () { refreshPrices(false); });

  // Auto-refresco silencioso cada 5 minutos si hay alguna posición con fuente automática
  setInterval(function () {
    if (PRICES.some(function (p) { return p.auto_source; })) refreshPrices(true);
  }, 5 * 60 * 1000);

  /* ---------------- 20. Render: Rentabilidad automática ---------------- */
  function renderAutoEquity() {
    var chartEl = document.getElementById("chart-auto-equity");
    var chipsEl = document.getElementById("auto-equity-chips");
    var missingEl = document.getElementById("auto-equity-missing");
    var closedEl = document.getElementById("auto-equity-closed");
    var m = computeAutoEquity();

    if (PRICE_HISTORY === null) {
      chartEl.innerHTML = '<svg viewBox="0 0 800 300"><text x="400" y="150" fill="' + themeColor("--text-secondary") + '" font-size="13" text-anchor="middle" font-family="IBM Plex Mono, monospace">Pulsa "Calcular / actualizar histórico" para generar la curva</text></svg>';
      chipsEl.innerHTML = "";
    } else {
      chartEl.innerHTML = m.hasData
        ? equitySvg(m.points)
        : '<svg viewBox="0 0 800 300"><text x="400" y="150" fill="' + themeColor("--text-secondary") + '" font-size="13" text-anchor="middle" font-family="IBM Plex Mono, monospace">Añade operaciones de compra o asigna una fuente a alguna posición para ver la curva</text></svg>';
      var chips = "";
      chips += chipHtml("Rentabilidad total", m.totalReturn !== null ? fmtPct(m.totalReturn) : "—", null, m.totalReturn >= 0 ? "pos" : "neg");
      chips += chipHtml("Rentabilidad anualizada", m.cagr !== null ? fmtPct(m.cagr) : "—", null, m.cagr >= 0 ? "pos" : "neg");
      chips += chipHtml("Drawdown máximo", m.hasData ? fmtPct(m.maxDD) : "—", null, "neg");
      chipsEl.innerHTML = m.hasData ? chips : "";
    }

    if (m.missing.length === 0) {
      missingEl.innerHTML = "";
    } else {
      // A diferencia de Posiciones (que solo lista lo que tienes abierto hoy), aquí puede haber
      // posiciones ya vendidas del todo -- no aparecen en Posiciones para asignarles fuente, así
      // que se ofrece el mismo widget de Fuente+Símbolo aquí mismo, con el precio de su última
      // operación conocida como referencia (ya que no hay "precio actual" que editar).
      missingEl.innerHTML = '<div class="privacy-note" style="margin-bottom:16px">' +
        '<b>' + m.missing.length + ' activo(s) no entran todavía en el cálculo.</b> Asígnales una fuente aquí mismo (incluye posiciones ya vendidas, que no aparecen en Posiciones) y vuelve a pulsar "Calcular / actualizar histórico".' +
        '<ul class="missing-asset-list">' +
        m.missing.map(function (x) {
          var widget = sourceWidgetHtml(x.key, x.info.name, x.info.ticker);
          var priceMetaRow = PRICES.find(function (p) { return p.asset_key === x.key; });
          return '<li class="missing-asset-item">' +
            '<div class="missing-asset-label">' + escapeHtml(x.label) + " — " + escapeHtml(x.reason) + "</div>" +
            '<div class="missing-asset-widget">' + widget.selectHtml + widget.symbolHtml + subAccountInputHtml(x.key, priceMetaRow && priceMetaRow.sub_account) + "</div>" +
            "</li>";
        }).join("") +
        "</ul></div>";

      var missingByKey = {};
      m.missing.forEach(function (x) { missingByKey[x.key] = x.info; });
      wireSourceWidgets(missingEl, function (key) { return missingByKey[key]; });
    }

    if (!closedEl) return;
    if (m.assignedClosed.length === 0) {
      closedEl.innerHTML = "";
      return;
    }
    // Posiciones ya vendidas del todo cuya fuente SÍ está asignada y funcionando -- una vez
    // asignada, dejan de aparecer arriba en "missing" (que solo lista lo pendiente), y como no
    // tienen cantidad>0 tampoco salen en Posiciones. Sin esta sección no había ningún sitio para
    // volver a ver o corregir el símbolo/divisa de una posición cerrada: si te equivocaste al
    // asignarla, la rentabilidad histórica quedaba mal para siempre sin que hubiera forma de
    // notarlo ni arreglarlo.
    closedEl.innerHTML = '<div class="privacy-note" style="margin-bottom:16px">' +
      '<b>' + m.assignedClosed.length + ' posición(es) ya cerrada(s), con fuente asignada.</b> No aparecen en Posiciones (ya no tienes cantidad en cartera), pero su histórico sigue entrando en el cálculo de arriba -- revisa aquí el símbolo/divisa si la rentabilidad no te cuadra.' +
      '<ul class="missing-asset-list">' +
      m.assignedClosed.map(function (x) {
        var widget = sourceWidgetHtml(x.key, x.info.name, x.info.ticker);
        var priceMetaRow = PRICES.find(function (p) { return p.asset_key === x.key; });
        return '<li class="missing-asset-item">' +
          '<div class="missing-asset-label">' + escapeHtml(x.label) + "</div>" +
          '<div class="missing-asset-widget">' + widget.selectHtml + widget.symbolHtml + subAccountInputHtml(x.key, priceMetaRow && priceMetaRow.sub_account) + "</div>" +
          "</li>";
      }).join("") +
      "</ul></div>";

    var closedByKey = {};
    m.assignedClosed.forEach(function (x) { closedByKey[x.key] = x.info; });
    wireSourceWidgets(closedEl, function (key) { return closedByKey[key]; });
  }

  function refreshPriceHistory() {
    var btn = document.getElementById("btn-refresh-history");
    var statusEl = document.getElementById("auto-equity-status");
    btn.disabled = true;
    btn.textContent = "Calculando…";
    statusEl.style.display = "none";

    // Solo pedimos histórico desde la primera operación de cada activo -- no hace falta más,
    // y así no descargamos años de precios que nunca vamos a usar.
    var since = {};
    TX.forEach(function (t) {
      if (t.type !== "compra" && t.type !== "venta") return;
      var key = assetKey(t);
      if (!since[key] || t.date < since[key]) since[key] = t.date;
    });

    return api("/api/prices/history/refresh", { method: "POST", body: JSON.stringify({ since: since }) })
      .then(function (res) {
        var msg = res.updated.length + " posición(es) con histórico actualizado";
        if (res.errors && res.errors.length) msg += " · " + res.errors.length + " con error: " + res.errors.map(function (e) { return e.symbol + " (" + e.error + ")"; }).join(", ");
        statusEl.style.display = "block";
        statusEl.textContent = msg;
        return api("/api/prices/history");
      })
      .then(function (history) {
        PRICE_HISTORY = history;
        renderAutoEquity();
      })
      .catch(function (err) {
        statusEl.style.display = "block";
        statusEl.textContent = "Error al calcular el histórico: " + err.message;
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "↻ Calcular / actualizar histórico";
      });
  }
  document.getElementById("btn-refresh-history").addEventListener("click", refreshPriceHistory);

  // Botón combinado de Cartera > Resumen -- mismo alcance que el cron diario del servidor
  // (precio actual + histórico), para no tener que ir a Posiciones e Histórico por separado.
  function refreshAllCartera() {
    var btn = document.getElementById("btn-refresh-all-cartera");
    var statusEl = document.getElementById("refresh-all-cartera-status");
    btn.disabled = true;
    btn.textContent = "Actualizando…";
    statusEl.style.display = "none";
    return api("/api/prices/refresh-all", { method: "POST" })
      .then(function (res) {
        var msg = res.prices.updated + " precio(s) actualizado(s)";
        if (res.prices.errors && res.prices.errors.length) msg += " · " + res.prices.errors.length + " error(es) de precio";
        msg += " · histórico de " + res.history.updated.length + " activo(s)";
        if (res.history.errors && res.history.errors.length) msg += " · " + res.history.errors.length + " error(es) de histórico";
        statusEl.style.display = "block";
        statusEl.textContent = msg;
        return loadAll();
      })
      .catch(function (err) {
        statusEl.style.display = "block";
        statusEl.textContent = "Error al actualizar: " + err.message;
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "↻ Actualizar precios e histórico";
      });
  }
  document.getElementById("btn-refresh-all-cartera").addEventListener("click", refreshAllCartera);

  /* ---------------- 21. Render: Operations ---------------- */
  // Filtros y orden de Operaciones -- estado a nivel de módulo, igual que householdSelectedMonth,
  // para que sobrevivan entre renders (p.ej. tras borrar filtradas).
  var operationsBrokerFilter = "";
  var operationsTypeFilter = "";
  var operationsTextFilter = "";
  var operationsDateFrom = "";
  var operationsDateTo = "";
  // Filtro de mes, aparte de Desde/Hasta -- "" = Todos los meses (ver carteraOperationsAllMonths
  // y el wiring de renderMonthPicker en renderOperations).
  var operationsMonthFilter = "";
  // Paginación -- mismo motivo que HOUSEHOLD_MOVEMENTS_PAGE_SIZE (app.js:110): con mucho
  // histórico, pintar todas las filas filtradas de golpe (cada una con sus botones editar/
  // eliminar) se nota al entrar en la pestaña. Constante propia en vez de reutilizar
  // HOUSEHOLD_MOVEMENTS_PAGE_SIZE -- mismo valor, pero es un tamaño de página de ESTA tabla, no
  // de Economía.
  var operationsPage = 0;
  var OPERATIONS_PAGE_SIZE = 15;
  var operationsSort = { key: "date", dir: "desc" };
  var OPERATIONS_TEXT_SORT_KEYS = { broker: true, type: true, name: true, ticker: true };
  // Fila en edición (o null) -- por defecto la tabla es de solo lectura; hace falta pulsar el
  // lápiz de una fila concreta para volverla editable. Con inputs siempre activos en toda la
  // tabla, un scroll del ratón sobre un campo numérico cambia su valor sin querer -- exigir un
  // clic explícito por fila hace que editar sea un gesto deliberado, no un riesgo ambiental.
  var editingTxId = null;

  function sortOperations(list) {
    var key = operationsSort.key, dir = operationsSort.dir === "asc" ? 1 : -1;
    return list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      // "date" no está en OPERATIONS_TEXT_SORT_KEYS (esa lista solo decide la dirección por
      // defecto al hacer clic por primera vez, y para fecha ese defecto debe ser "reciente
      // primero" como el resto de campos numéricos) pero SÍ hay que compararla como texto: es
      // un string "AAAA-MM-DD", y Number("2024-03-19") da NaN -- la comparación numérica
      // siempre devolvía NaN y el orden se quedaba tal cual estuviera.
      if (key === "date" || OPERATIONS_TEXT_SORT_KEYS[key]) return String(av).localeCompare(String(bv), "es") * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }

  function updateOperationsSortIndicators() {
    document.querySelectorAll("#tab-operations th.sortable").forEach(function (th) {
      var key = th.getAttribute("data-sort-key");
      var indicator = th.querySelector(".sort-indicator");
      if (key === operationsSort.key) {
        th.classList.add("sort-active");
        indicator.textContent = operationsSort.dir === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("sort-active");
        indicator.textContent = "";
      }
    });
    var mobileSelect = document.getElementById("operations-sort-select");
    if (mobileSelect) mobileSelect.value = operationsSort.key + ":" + operationsSort.dir;
  }

  function setOperationsSort(key, dir) {
    if (dir) {
      operationsSort.key = key; operationsSort.dir = dir;
    } else if (operationsSort.key === key) {
      operationsSort.dir = operationsSort.dir === "asc" ? "desc" : "asc";
    } else {
      operationsSort.key = key;
      operationsSort.dir = OPERATIONS_TEXT_SORT_KEYS[key] ? "asc" : "desc";
    }
    renderOperations();
  }

  document.querySelectorAll("#tab-operations th.sortable[data-sort-key]").forEach(function (th) {
    th.addEventListener("click", function () { setOperationsSort(th.getAttribute("data-sort-key")); });
  });
  var operationsSortSelect = document.getElementById("operations-sort-select");
  if (operationsSortSelect) {
    operationsSortSelect.addEventListener("change", function () {
      var parts = operationsSortSelect.value.split(":");
      setOperationsSort(parts[0], parts[1]);
    });
  }

  // Lista de meses (YYYY-MM, orden descendente) con operaciones -- mismo patrón que
  // householdAllMonths() (app.js:784) pero sobre TX en vez de HOUSEHOLD, y sin forzar el mes
  // anterior: aquí el filtro por defecto es "Todos" (operationsMonthFilter empieza en ""), no
  // un mes concreto, así que solo hace falta garantizar que el año en curso aparezca en la
  // vista de años aunque todavía no haya ninguna operación.
  function carteraOperationsAllMonths() {
    var monthSet = {};
    TX.forEach(function (t) { var m = (t.date || "").slice(0, 7); if (m) monthSet[m] = true; });
    monthSet[currentMonthStr()] = true;
    return Object.keys(monthSet).sort().reverse();
  }

  function renderOperations() {
    var allList = TX.slice();

    var brokerFilterEl = document.getElementById("operations-broker-filter");
    if (brokerFilterEl) {
      var brokers = Array.from(new Set(allList.map(function (t) { return brokerDisplayName(t.broker); }))).sort();
      if (operationsBrokerFilter && brokers.indexOf(operationsBrokerFilter) === -1) operationsBrokerFilter = "";
      brokerFilterEl.innerHTML = '<option value="">Todos</option>' + brokers.map(function (b) {
        return '<option value="' + escapeHtml(b) + '"' + (b === operationsBrokerFilter ? " selected" : "") + '>' + escapeHtml(b) + "</option>";
      }).join("");
      brokerFilterEl.onchange = function () { operationsBrokerFilter = brokerFilterEl.value; operationsPage = 0; renderOperations(); };
    }
    var typeFilterEl = document.getElementById("operations-type-filter");
    if (typeFilterEl) {
      typeFilterEl.innerHTML = '<option value="">Todos</option>' + Object.keys(TYPE_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (k === operationsTypeFilter ? " selected" : "") + '>' + TYPE_LABELS[k] + "</option>";
      }).join("");
      typeFilterEl.onchange = function () { operationsTypeFilter = typeFilterEl.value; operationsPage = 0; renderOperations(); };
    }
    var textFilterEl = document.getElementById("operations-text-filter");
    if (textFilterEl) {
      if (textFilterEl.value !== operationsTextFilter) textFilterEl.value = operationsTextFilter;
      textFilterEl.oninput = function () { operationsTextFilter = textFilterEl.value; operationsPage = 0; renderOperations(); };
    }
    var dateFromEl = document.getElementById("operations-date-from");
    if (dateFromEl) {
      if (dateFromEl.value !== operationsDateFrom) dateFromEl.value = operationsDateFrom;
      dateFromEl.onchange = function () { operationsDateFrom = dateFromEl.value; operationsPage = 0; renderOperations(); };
    }
    var dateToEl = document.getElementById("operations-date-to");
    if (dateToEl) {
      if (dateToEl.value !== operationsDateTo) dateToEl.value = operationsDateTo;
      dateToEl.onchange = function () { operationsDateTo = dateToEl.value; operationsPage = 0; renderOperations(); };
    }
    // Filtro de mes -- aparte de Desde/Hasta (se combinan con AND, no lo sustituye). "" =
    // Todos los meses, mismo criterio que operationsDateFrom/To vacíos.
    renderMonthPicker({
      toggleId: "operations-month-picker-toggle", panelId: "operations-month-picker-panel",
      selected: operationsMonthFilter || currentMonthStr(), months: carteraOperationsAllMonths(),
      allMonthsOption: true, allMonthsActive: !operationsMonthFilter,
      onSelectMonth: function (m) { operationsMonthFilter = m; operationsPage = 0; renderOperations(); },
      onSelectAllMonths: function () { operationsMonthFilter = ""; operationsPage = 0; renderOperations(); }
    });

    var hasActiveFilter = !!(operationsBrokerFilter || operationsTypeFilter || operationsTextFilter || operationsDateFrom || operationsDateTo || operationsMonthFilter);
    var textFilterLower = operationsTextFilter.trim().toLowerCase();
    var list = allList.filter(function (t) {
      if (operationsBrokerFilter && brokerNormKey(t.broker) !== brokerNormKey(operationsBrokerFilter)) return false;
      if (operationsTypeFilter && t.type !== operationsTypeFilter) return false;
      if (textFilterLower) {
        var haystack = ((t.ticker || "") + " " + (t.name || "")).toLowerCase();
        if (haystack.indexOf(textFilterLower) === -1) return false;
      }
      if (operationsDateFrom && t.date < operationsDateFrom) return false;
      if (operationsDateTo && t.date > operationsDateTo) return false;
      if (operationsMonthFilter && (t.date || "").slice(0, 7) !== operationsMonthFilter) return false;
      return true;
    });
    list = sortOperations(list);
    updateOperationsSortIndicators();

    var countEl = document.getElementById("operations-filtered-count");
    if (countEl) countEl.textContent = list.length;
    var deleteFilteredBtn = document.getElementById("operations-btn-delete-filtered");
    if (deleteFilteredBtn) {
      deleteFilteredBtn.onclick = function () {
        if (list.length === 0) { alert("No hay operaciones que coincidan con el filtro."); return; }
        var label = hasActiveFilter ? "que coinciden con el filtro actual" : "(TODOS los brokers, sin filtrar)";
        if (!confirm("¿Eliminar " + list.length + " operación(es) " + label + "? Esta acción no se puede deshacer.")) return;
        var ids = list.map(function (t) { return t.id; });
        api("/api/transactions/bulk-delete", { method: "POST", body: JSON.stringify({ ids: ids }) })
          .then(loadAll)
          .catch(function (err) { alert("Error al eliminar: " + err.message); });
      };
    }

    var body = document.getElementById("operations-body");
    var emptyEl = document.getElementById("operations-empty");
    if (list.length === 0) {
      body.innerHTML = "";
      emptyEl.innerHTML = '<div class="empty-state"><strong>' +
        (hasActiveFilter ? "Ningún resultado con ese filtro" : "Aún no hay operaciones") +
        '</strong>Añade tu primera operación con el formulario de abajo, o impórtalas desde un CSV.</div>';
      renderOperationsPagination(1);
      return;
    }
    emptyEl.innerHTML = "";

    // Paginación sobre "list" ya filtrada -- con mucho histórico, pintar todas las filas de
    // golpe (cada una con inputs editables ocultos tras el lápiz) se nota al entrar en la
    // pestaña. "Eliminar filtradas"/el contador de arriba siguen operando sobre "list" completa,
    // no sobre "pageList" -- mismo criterio que Economía > Operaciones (renderHouseholdRecat).
    var opsTotalPages = Math.max(1, Math.ceil(list.length / OPERATIONS_PAGE_SIZE));
    if (operationsPage >= opsTotalPages) operationsPage = opsTotalPages - 1;
    if (operationsPage < 0) operationsPage = 0;
    var opsPageStart = operationsPage * OPERATIONS_PAGE_SIZE;
    var pageList = list.slice(opsPageStart, opsPageStart + OPERATIONS_PAGE_SIZE);

    var typeOptionsHtml = Object.keys(TYPE_LABELS).map(function (k) { return '<option value="' + k + '">' + TYPE_LABELS[k] + "</option>"; }).join("");
    // Solo lectura por defecto -- para editar una fila hace falta pulsar antes su lápiz (✎),
    // que la convierte en editable solo a ella. Evita que un campo numérico esté siempre "vivo"
    // en toda la tabla (un scroll del ratón encima de un <input type=number> cambia su valor sin
    // querer). Al guardar o cancelar, la fila vuelve a modo lectura.
    body.innerHTML = pageList.map(function (t) {
      var id = t.id;
      // Sin importe propio, mostramos el mismo valor que realmente cuenta para el efectivo
      // (txCashImpact) en vez de recalcular cantidad×precio a secas -- así una compra sin
      // coste propio (p.ej. la confirmación de acciones asignadas en una IPO, ya cobradas
      // aparte) se ve como 0€ aquí también, en vez de un importe positivo que induce a error.
      var amount = t.amount != null ? t.amount : txCashImpact(t);

      if (id !== editingTxId) {
        return "<tr>" +
          '<td class="mono" data-label="Fecha">' + fmtDate(t.date) + "</td>" +
          '<td data-label="Bróker">' + escapeHtml(t.broker) + "</td>" +
          '<td data-label="Tipo">' + (TYPE_LABELS[t.type] || escapeHtml(t.type)) + "</td>" +
          '<td data-label="Activo">' + escapeHtml(t.name || "—") + "</td>" +
          '<td data-label="Ticker">' + escapeHtml(t.ticker || "—") + "</td>" +
          '<td class="right mono" data-label="Cantidad">' + (t.quantity != null ? t.quantity : "—") + "</td>" +
          '<td class="right mono money" data-label="Precio">' + (t.price != null ? fmtMoney(t.price) : "—") + "</td>" +
          '<td class="right mono money" data-label="Comisión">' + fmtMoney(Number(t.fee) || 0) + "</td>" +
          '<td class="right mono money" data-label="Importe">' + fmtMoney(amount) + "</td>" +
          '<td class="table-cards-action">' +
            '<button class="icon-btn" data-edit-tx="' + id + '" title="Editar">✎︎</button>' +
            '<button class="icon-btn" data-del-tx="' + id + '" title="Eliminar">✕︎</button>' +
          "</td>" +
          "</tr>";
      }

      return "<tr>" +
        '<td class="mono" data-label="Fecha"><input class="price-input" type="date" value="' + t.date + '" data-tx-id="' + id + '" data-tx-field="date"></td>' +
        '<td data-label="Bróker"><input class="recat-input" type="text" value="' + escapeHtml(t.broker) + '" data-tx-id="' + id + '" data-tx-field="broker"></td>' +
        '<td data-label="Tipo"><select class="recat-input" data-tx-id="' + id + '" data-tx-field="type">' +
          typeOptionsHtml.replace('value="' + t.type + '"', 'value="' + t.type + '" selected') + "</select></td>" +
        '<td data-label="Activo"><input class="recat-input" type="text" value="' + escapeHtml(t.name || "") + '" data-tx-id="' + id + '" data-tx-field="name"></td>' +
        '<td data-label="Ticker"><input class="symbol-input" type="text" value="' + escapeHtml(t.ticker || "") + '" data-tx-id="' + id + '" data-tx-field="ticker"></td>' +
        '<td class="right mono" data-label="Cantidad"><input class="price-input" type="number" step="any" value="' + (t.quantity != null ? t.quantity : "") + '" data-tx-id="' + id + '" data-tx-field="quantity"></td>' +
        '<td class="right mono money" data-label="Precio"><input class="price-input" type="number" step="any" value="' + (t.price != null ? t.price : "") + '" data-tx-id="' + id + '" data-tx-field="price"></td>' +
        '<td class="right mono money" data-label="Comisión"><input class="price-input" type="number" step="any" value="' + (Number(t.fee) || 0) + '" data-tx-id="' + id + '" data-tx-field="fee"></td>' +
        // Si t.amount es null (importe "auto", calculado a partir de cantidad×precio+comisión),
        // el input se deja VACÍO -- no relleno con el valor ya calculado -- para que si solo
        // editas cantidad/precio (p.ej. al corregir un split) el importe se siga recalculando
        // solo con los valores nuevos, en vez de quedar congelado con el importe viejo por el
        // simple hecho de haber tocado otro campo de la misma fila. El valor calculado se ve
        // igualmente como placeholder, de referencia.
        '<td class="right mono money" data-label="Importe"><input class="price-input" type="number" step="any" value="' + (t.amount != null ? t.amount : "") + '" placeholder="Auto: ' + fmtMoney(amount) + '" data-tx-id="' + id + '" data-tx-field="amount"></td>' +
        '<td class="table-cards-action">' +
          '<button class="icon-btn" data-done-tx="' + id + '" title="Terminar de editar">✓︎</button>' +
          '<button class="icon-btn" data-del-tx="' + id + '" title="Eliminar">✕︎</button>' +
        "</td>" +
        "</tr>";
    }).join("");

    function saveTxRow(id) {
      var orig = TX.find(function (t) { return t.id === id; });
      if (!orig) return;
      function fieldVal(field) { return body.querySelector('[data-tx-id="' + id + '"][data-tx-field="' + field + '"]').value; }
      var broker = fieldVal("broker").trim();
      var date = fieldVal("date");
      var type = fieldVal("type");
      if (!broker || !date || !type) { alert("Bróker, fecha y tipo son obligatorios."); renderOperations(); return; }
      var quantityRaw = fieldVal("quantity"), priceRaw = fieldVal("price"), feeRaw = fieldVal("fee"), amountRaw = fieldVal("amount");
      api("/api/transactions", { method: "POST", body: JSON.stringify({
        id: id, broker: broker, date: date, type: type,
        name: fieldVal("name").trim() || null, ticker: fieldVal("ticker").trim() || null,
        asset_type: orig.asset_type || null,
        quantity: quantityRaw === "" ? null : parseFloat(quantityRaw),
        price: priceRaw === "" ? null : parseFloat(priceRaw),
        fee: feeRaw === "" ? 0 : parseFloat(feeRaw),
        amount: amountRaw === "" ? null : parseFloat(amountRaw),
        currency: orig.currency || "EUR", notes: orig.notes || null, source: orig.source || "manual"
      }) })
        .then(loadAll)
        .catch(function (err) { alert("Error al guardar: " + err.message); });
    }
    body.querySelectorAll("[data-tx-field]").forEach(function (el) {
      el.addEventListener("change", function () { saveTxRow(el.getAttribute("data-tx-id")); });
    });
    body.querySelectorAll("[data-edit-tx]").forEach(function (btn) {
      btn.addEventListener("click", function () { editingTxId = btn.getAttribute("data-edit-tx"); renderOperations(); });
    });
    body.querySelectorAll("[data-done-tx]").forEach(function (btn) {
      btn.addEventListener("click", function () { editingTxId = null; renderOperations(); });
    });

    body.querySelectorAll("[data-del-tx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("¿Eliminar esta operación?")) return;
        api("/api/transactions/" + btn.getAttribute("data-del-tx"), { method: "DELETE" }).then(loadAll);
      });
    });

    renderOperationsPagination(opsTotalPages);
  }

  // Mismo patrón que renderHouseholdRecatPagination (app.js:3871 aprox.) -- cambiar de página
  // vuelve a renderizar la función entera (barato: es solo recortar un array ya calculado y
  // reconstruir la tabla) en vez de parchear filas sueltas.
  function renderOperationsPagination(totalPages) {
    var el = document.getElementById("operations-pagination");
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    el.innerHTML =
      '<button type="button" class="btn" id="operations-prev"' + (operationsPage === 0 ? " disabled" : "") + '>‹ Anterior</button>' +
      '<span class="csv-preview-page-info">Página ' + (operationsPage + 1) + " de " + totalPages + "</span>" +
      '<button type="button" class="btn" id="operations-next"' + (operationsPage >= totalPages - 1 ? " disabled" : "") + ">Siguiente ›</button>";
    var prevBtn = document.getElementById("operations-prev");
    var nextBtn = document.getElementById("operations-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { operationsPage--; renderOperations(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { operationsPage++; renderOperations(); });
  }

  /* ---------------- 22. Render: Valuations ---------------- */
  function renderValuations() {
    var list = VAL.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var body = document.getElementById("valuations-body");
    var emptyEl = document.getElementById("valuations-empty");
    if (list.length === 0) {
      body.innerHTML = "";
      emptyEl.innerHTML = '<div class="empty-state"><strong>Aún no hay valoraciones</strong>Registra el valor total de tu cartera periódicamente para calcular rentabilidad y drawdown.</div>';
      return;
    }
    emptyEl.innerHTML = "";
    // Fecha/Valor/Aportación son inputs editables in situ (mismo patrón que el precio de
    // Posiciones o las cuentas de Economía doméstica): al cambiar cualquiera se guarda solo esa
    // fila via upsert por id, sin necesidad de borrar y volver a crearla para corregir un dato
    // mal introducido.
    body.innerHTML = list.map(function (v) {
      return "<tr>" +
        '<td class="mono" data-label="Fecha"><input class="price-input" type="date" value="' + v.date + '" data-val-id="' + v.id + '" data-val-field="date"></td>' +
        '<td class="right mono money" data-label="Valor total (€)"><input class="price-input" type="number" step="any" min="0" value="' + v.value + '" data-val-id="' + v.id + '" data-val-field="value"></td>' +
        '<td class="right mono money" data-label="Aportación / retirada (€)"><input class="price-input" type="number" step="any" value="' + (Number(v.cashflow) || 0) + '" data-val-id="' + v.id + '" data-val-field="cashflow"></td>' +
        '<td class="table-cards-action"><button class="icon-btn" data-del-val="' + v.id + '" title="Eliminar">✕︎</button></td>' +
        "</tr>";
    }).join("");

    function saveValuationRow(id) {
      var dateInput = body.querySelector('[data-val-id="' + id + '"][data-val-field="date"]');
      var valueInput = body.querySelector('[data-val-id="' + id + '"][data-val-field="value"]');
      var cashflowInput = body.querySelector('[data-val-id="' + id + '"][data-val-field="cashflow"]');
      var date = dateInput.value;
      var value = parseFloat(valueInput.value);
      var cashflow = parseFloat(cashflowInput.value) || 0;
      if (!date || !Number.isFinite(value) || value < 0) { alert("Fecha y valor total (≥0) son obligatorios."); renderValuations(); return; }
      api("/api/valuations", { method: "POST", body: JSON.stringify({ id: id, date: date, value: value, cashflow: cashflow }) })
        .then(loadAll)
        .catch(function (err) { alert("Error al guardar: " + err.message); });
    }
    body.querySelectorAll("[data-val-field]").forEach(function (input) {
      input.addEventListener("change", function () { saveValuationRow(input.getAttribute("data-val-id")); });
    });
    body.querySelectorAll("[data-del-val]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("¿Eliminar esta valoración?")) return;
        api("/api/valuations/" + btn.getAttribute("data-del-val"), { method: "DELETE" }).then(loadAll);
      });
    });
  }

  /* ---------------- 23. Render: Economía doméstica ---------------- */
  function renderHousehold() {
    var formAccountEl = document.getElementById("household-form-account");
    if (formAccountEl) {
      var prevAccountVal = formAccountEl.value;
      formAccountEl.innerHTML = accountOptionsHtml(prevAccountVal);
    }
    var csvAccountEl = document.getElementById("household-csv-account");
    if (csvAccountEl) {
      var prevCsvAccountVal = csvAccountEl.value;
      csvAccountEl.innerHTML = accountOptionsHtml(prevCsvAccountVal);
    }

    var months = computeHouseholdMonthly();

    // Por defecto, mes ANTERIOR (no el actual) -- mismo criterio que renderDashboard() ya aplica
    // en las cajitas KPI de Ingresos/Gastos (ver previousMonthStr()): el mes en curso casi
    // siempre está vacío o a medias porque los movimientos se cargan a mes vencido. A diferencia
    // de antes, ya no se valida contra los meses con datos (el picker deja elegir cualquier año/
    // mes, con o sin movimientos) -- una vez fijado, el mes elegido se respeta sin más.
    if (!householdSelectedMonth) householdSelectedMonth = previousMonthStr();

    renderMonthPicker({
      toggleId: "household-month-picker-toggle", panelId: "household-month-picker-panel",
      selected: householdSelectedMonth, months: householdAllMonths(),
      onSelectMonth: function (m) {
        householdSelectedMonth = m;
        renderHousehold();
        renderHouseholdRecat();
      }
    });

    var monthData = months.find(function (m) { return m.month === householdSelectedMonth; }) || { income: 0, expense: 0, incomeTotal: 0, expenseTotal: 0 };
    var savings = monthData.income - monthData.expense;
    // income/expense ya son la parte real (ver computeHouseholdMonthly) -- el sub-texto del
    // chip muestra el importe total registrado solo cuando difiere (si no hay ninguna cuenta
    // con reparto <100% implicada, total y real coinciden y el sub-texto sería ruido redundante).
    var incomeSub = monthData.incomeTotal !== monthData.income ? "de " + fmtMoney(monthData.incomeTotal) + " registrados" : null;
    var expenseSub = monthData.expenseTotal !== monthData.expense ? "de " + fmtMoney(monthData.expenseTotal) + " registrados" : null;
    var chips = "";
    chips += chipHtml("Ingresos (mi parte)", fmtMoney(monthData.income), incomeSub, "pos", true);
    chips += chipHtml("Gastos (mi parte)", fmtMoney(monthData.expense), expenseSub, "neg", true);
    chips += chipHtml("Ahorro del mes (mi parte)", fmtMoney(savings), null, savings >= 0 ? "pos" : "neg", true);
    document.getElementById("household-chip-row").innerHTML = chips;
    // Mismos 3 chips, calculados una sola vez arriba, también en el Dashboard (mezcla
    // Cartera + Economía) -- ver dashboard-household-chip-row en tab-dashboard.
    var dashboardChipRowEl = document.getElementById("dashboard-household-chip-row");
    if (dashboardChipRowEl) dashboardChipRowEl.innerHTML = chips;

    var categoryBarsEl = document.getElementById("household-category-bars");
    if (categoryBarsEl) categoryBarsEl.innerHTML = categoryExpenseBarsHtml(computeExpenseByCategoryForMonth(householdSelectedMonth));

    var byAccount = computeHouseholdByAccountForMonth(householdSelectedMonth);
    var byAccountBody = document.getElementById("household-by-account-body");
    var byAccountEmpty = document.getElementById("household-by-account-empty");
    if (byAccountBody) {
      if (byAccount.length === 0) {
        byAccountBody.innerHTML = "";
        if (byAccountEmpty) byAccountEmpty.innerHTML = '<div class="empty-state"><strong>Sin movimientos este mes</strong></div>';
      } else {
        if (byAccountEmpty) byAccountEmpty.innerHTML = "";
        byAccountBody.innerHTML = byAccount.map(function (a) {
          // "Aportación de tercero" es puramente informativo (no entra en Ingresos/Gastos/Mi
          // parte de arriba) -- se muestra con el nombre configurado en "⚙ Cuentas" si lo hay
          // ("Aportado por Ana"), o solo el importe si la cuenta no tiene tercero configurado.
          var thirdPartyHtml = "—";
          if (a.thirdParty > 0) {
            thirdPartyHtml = fmtMoney(a.thirdParty) + (a.thirdPartyName ? '<div class="chip-sub" style="margin-top:0">Aportado por ' + escapeHtml(a.thirdPartyName) + "</div>" : "");
          }
          return "<tr>" +
            '<td data-label="Cuenta">' + escapeHtml(a.name) + "</td>" +
            '<td class="right mono" data-label="%">' + a.splitPct + "%</td>" +
            '<td class="right mono money" data-label="Ingresos">' + fmtMoney(a.income) + "</td>" +
            '<td class="right mono money" data-label="Gastos">' + fmtMoney(a.expense) + "</td>" +
            '<td class="right mono money" data-label="Mi parte ingresos">' + fmtMoney(a.incomeReal) + "</td>" +
            '<td class="right mono money" data-label="Mi parte gastos">' + fmtMoney(a.expenseReal) + "</td>" +
            '<td class="right mono money" data-label="Aportación de tercero">' + thirdPartyHtml + "</td>" +
            "</tr>";
        }).join("");
      }
    }

    var scaleSelEl = document.getElementById("household-evolution-scale");
    if (scaleSelEl && scaleSelEl.value !== householdEvolutionScale) scaleSelEl.value = householdEvolutionScale;
    var periodSelEl = document.getElementById("household-evolution-period");
    if (periodSelEl && periodSelEl.value !== householdEvolutionPeriod) periodSelEl.value = householdEvolutionPeriod;
    // El zoom recorta tanto el gráfico como la tabla de abajo (mismo panel, misma serie) -- ver
    // filterMonthsByPeriod. "months" (sin recortar) se sigue usando para el resto del panel
    // (Resumen mensual, que necesita el histórico completo para encontrar el mes seleccionado).
    var evolutionMonths = filterMonthsByPeriod(months, householdEvolutionPeriod);
    var chartHouseholdEl = document.getElementById("chart-household");
    chartHouseholdEl.innerHTML = monthlyBarsSvg(evolutionMonths, householdEvolutionScale, [
      { key: "income", color: themeColor("--accent"), label: "Ingresos" }, { key: "expense", color: themeColor("--negative"), label: "Gastos" }
    ]);
    wireChartTooltips(chartHouseholdEl);

    document.getElementById("household-monthly-body").innerHTML = evolutionMonths.slice().reverse().map(function (m) {
      var s = m.income - m.expense;
      var parts = m.month.split("-");
      var label = MONTH_ABBR_ES[parseInt(parts[1], 10) - 1] + " " + parts[0];
      return "<tr>" +
        '<td class="mono">' + label + "</td>" +
        '<td class="right mono money">' + fmtMoney(m.income) + "</td>" +
        '<td class="right mono money">' + fmtMoney(m.expense) + "</td>" +
        '<td class="right mono money ' + (s >= 0 ? "pos" : "neg") + '">' + fmtMoney(s) + "</td>" +
        "</tr>";
    }).join("");

  }

  // Sugerencias de categoría/subcategoría (formulario manual + filtro de "Todas las
  // operaciones") -- se reconstruyen en cada render a partir de lo que ya hay en HOUSEHOLD,
  // combinado con una lista fija de categorías típicas para cuando aún no hay histórico.
  function refreshHouseholdSuggestions() {
    var catSet = {}, subcatSet = {};
    HOUSEHOLD_CATEGORY_SUGGESTIONS_STATIC.forEach(function (c) { catSet[c] = true; });
    HOUSEHOLD.forEach(function (h) {
      if (h.category) catSet[h.category] = true;
      if (h.subcategory) subcatSet[h.subcategory] = true;
    });
    var catList = document.getElementById("household-category-suggestions");
    if (catList) catList.innerHTML = Object.keys(catSet).sort().map(function (c) { return '<option value="' + escapeHtml(c) + '">'; }).join("");
    var subList = document.getElementById("household-subcategory-suggestions");
    if (subList) subList.innerHTML = Object.keys(subcatSet).sort().map(function (s) { return '<option value="' + escapeHtml(s) + '">'; }).join("");
  }

  /* ---------------- 24. Render: Todas las operaciones (revisar/corregir categorías) ---------------- */
  // A diferencia de la tabla "Movimientos" (acotada al mes seleccionado, solo alta/baja), esta
  // vista cubre TODO el histórico y permite corregir Categoría/Subcategoría -- por fila suelta
  // (los <input> de la tabla guardan al cambiar) o en bloque sobre lo que deje el filtro (útil
  // cuando el propio banco clasifica mal algo de forma sistemática, p.ej. ING categorizando un
  // recibo del IBI como "Educación": filtras por "IBI" y corriges todas las filas de golpe en
  // vez de una a una).
  function bulkUpdateHousehold(ids, fields) {
    if (!ids.length) return Promise.resolve();
    var body = { ids: ids };
    if (fields.category !== undefined) body.category = fields.category;
    if (fields.subcategory !== undefined) body.subcategory = fields.subcategory;
    if (fields.account_id !== undefined) body.account_id = fields.account_id;
    if (fields.type !== undefined) body.type = fields.type;
    if (fields.notes !== undefined) body.notes = fields.notes;
    return api("/api/household/bulk-update", { method: "POST", body: JSON.stringify(body) });
  }

  // Categoría y subcategoría son ahora dos desplegables INDEPENDIENTES (antes uno combinado con
  // valores "cat:X"/"sub:X") -- subcategoría solo ofrece las subcategorías que aparecen en
  // movimientos de la categoría elegida (si hay alguna elegida); sin categoría elegida, ofrece
  // todas las subcategorías del histórico. Se llama en cada render porque HOUSEHOLD o el filtro
  // de categoría pueden haber cambiado.
  function refreshHouseholdRecatFilterOptions() {
    var catSel = document.getElementById("household-recat-category-filter");
    var subcatSel = document.getElementById("household-recat-subcategory-filter");
    var accountSel = document.getElementById("household-recat-account-filter");
    if (!catSel || !subcatSel) return;

    // El mes concreto es el compartido con Resumen (householdSelectedMonth) -- si aún no se ha
    // fijado (primera vez que se pinta esta tabla antes que Resumen), cae al mes ANTERIOR, mismo
    // criterio que antes. householdOpsAllMonths es el único estado propio de esta sub-pestaña
    // ("Todos los meses"), se deja tal cual el usuario lo cambie sin resetearse en renders
    // posteriores.
    if (!householdSelectedMonth) householdSelectedMonth = previousMonthStr();
    renderMonthPicker({
      toggleId: "household-ops-month-picker-toggle", panelId: "household-ops-month-picker-panel",
      selected: householdSelectedMonth, months: householdAllMonths(),
      allMonthsOption: true, allMonthsActive: householdOpsAllMonths,
      onSelectMonth: function (m) {
        householdSelectedMonth = m;
        householdOpsAllMonths = false;
        householdRecatPage = 0;
        renderHousehold();
        renderHouseholdRecat();
      },
      onSelectAllMonths: function () {
        householdOpsAllMonths = true;
        householdRecatPage = 0;
        renderHouseholdRecat();
      }
    });

    if (accountSel) {
      accountSel.innerHTML = '<option value="">Todas</option><option value="__none__">Sin cuenta</option>' +
        ACCOUNTS.map(function (a) { return '<option value="' + a.id + '">' + escapeHtml(a.name) + "</option>"; }).join("");
      accountSel.value = householdRecatAccountFilter;
      // Si la cuenta elegida ya no existe (se acaba de borrar), el <select> cae a "" -- se
      // refleja también en el estado, igual que categoría/subcategoría.
      if (accountSel.value !== householdRecatAccountFilter) householdRecatAccountFilter = accountSel.value;
    }

    var catSet = {};
    HOUSEHOLD.forEach(function (h) { if (h.category) catSet[h.category] = true; });
    var cats = Object.keys(catSet).sort();
    catSel.innerHTML = '<option value="">Todas</option>' + cats.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + "</option>";
    }).join("");
    catSel.value = householdRecatCategoryFilter;
    if (catSel.value !== householdRecatCategoryFilter) householdRecatCategoryFilter = catSel.value;

    var subcatSet = {};
    HOUSEHOLD.forEach(function (h) {
      if (!h.subcategory) return;
      if (householdRecatCategoryFilter && h.category !== householdRecatCategoryFilter) return;
      subcatSet[h.subcategory] = true;
    });
    var subcats = Object.keys(subcatSet).sort();
    subcatSel.innerHTML = '<option value="">Todas</option>' + subcats.map(function (s) {
      return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + "</option>";
    }).join("");
    subcatSel.value = householdRecatSubcategoryFilter;
    // Si la subcategoría elegida ya no encaja con la categoría elegida (o dejó de existir), el
    // <select> cae a "" -- se refleja también en el estado para no quedarse filtrando por un
    // valor fantasma que ya ni siquiera aparece en la lista.
    if (subcatSel.value !== householdRecatSubcategoryFilter) householdRecatSubcategoryFilter = subcatSel.value;
  }

  // Mismo patrón que sortOperations/setOperationsSort/updateOperationsSortIndicators
  // (#tab-operations, más arriba) para la tabla de Economía > Operaciones. "account" es el
  // único key que no es una propiedad directa del objeto -- se ordena por el NOMBRE de cuenta
  // resuelto (accountNameFor), no por account_id (un uuid no dice nada al usuario).
  function sortHouseholdOps(list) {
    var key = householdOpsSort.key, dir = householdOpsSort.dir === "asc" ? 1 : -1;
    return list.sort(function (a, b) {
      var av = key === "account" ? accountNameFor(a.account_id) : a[key];
      var bv = key === "account" ? accountNameFor(b.account_id) : b[key];
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      if (key === "date" || HOUSEHOLD_OPS_TEXT_SORT_KEYS[key]) return String(av).localeCompare(String(bv), "es") * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }

  function updateHouseholdOpsSortIndicators() {
    document.querySelectorAll("#tab-household-operations th.sortable").forEach(function (th) {
      var key = th.getAttribute("data-sort-key");
      var indicator = th.querySelector(".sort-indicator");
      if (key === householdOpsSort.key) {
        th.classList.add("sort-active");
        indicator.textContent = householdOpsSort.dir === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("sort-active");
        indicator.textContent = "";
      }
    });
  }

  function setHouseholdOpsSort(key) {
    if (householdOpsSort.key === key) {
      householdOpsSort.dir = householdOpsSort.dir === "asc" ? "desc" : "asc";
    } else {
      householdOpsSort.key = key;
      householdOpsSort.dir = HOUSEHOLD_OPS_TEXT_SORT_KEYS[key] ? "asc" : "desc";
    }
    renderHouseholdRecat();
  }

  document.querySelectorAll("#tab-household-operations th.sortable[data-sort-key]").forEach(function (th) {
    th.addEventListener("click", function () { setHouseholdOpsSort(th.getAttribute("data-sort-key")); });
  });

  function renderHouseholdRecat() {
    refreshHouseholdSuggestions();
    refreshHouseholdRecatFilterOptions();

    // "Dejar sin cambiar" (sentinel, valor imposible de confundir con un id real) es la opción
    // por defecto -- a diferencia de category/subcategory (texto libre, vacío = no tocar), un
    // <select> de cuenta necesita un tercer estado explícito porque "" ya significa "Sin cuenta"
    // (desasignar), no "no tocar".
    var recatAccountEl = document.getElementById("household-recat-account");
    if (recatAccountEl) {
      var prevRecatAccountVal = recatAccountEl.value || "__nochange__";
      recatAccountEl.innerHTML = '<option value="__nochange__">Dejar sin cambiar</option><option value="">Sin cuenta</option>' +
        ACCOUNTS.map(function (a) {
          return '<option value="' + a.id + '">' + escapeHtml(a.name) + " (" + a.split_pct + "%)</option>";
        }).join("");
      recatAccountEl.value = prevRecatAccountVal;
    }

    var typeFilterEl = document.getElementById("household-recat-type-filter");
    if (typeFilterEl && typeFilterEl.value !== householdRecatTypeFilter) typeFilterEl.value = householdRecatTypeFilter;
    var amountMinEl = document.getElementById("household-recat-amount-min");
    if (amountMinEl && amountMinEl.value !== householdRecatAmountMin) amountMinEl.value = householdRecatAmountMin;
    var amountMaxEl = document.getElementById("household-recat-amount-max");
    if (amountMaxEl && amountMaxEl.value !== householdRecatAmountMax) amountMaxEl.value = householdRecatAmountMax;
    var textFilterEl = document.getElementById("household-recat-text-filter");
    if (textFilterEl && textFilterEl.value !== householdRecatTextFilter) textFilterEl.value = householdRecatTextFilter;
    var needle = normalizeHeaderForMatch(householdRecatTextFilter);

    // Todos los filtros se combinan con AND -- cada uno recorta "list" sobre lo que dejó el
    // anterior, en vez de evaluarse de forma independiente y unir con OR. El orden final lo
    // decide sortHouseholdOps() más abajo (por defecto fecha descendente, igual que antes).
    var list = HOUSEHOLD.slice();
    if (!householdOpsAllMonths) {
      list = list.filter(function (h) { return (h.date || "").slice(0, 7) === householdSelectedMonth; });
    }
    if (householdRecatCategoryFilter) {
      list = list.filter(function (h) { return h.category === householdRecatCategoryFilter; });
    }
    if (householdRecatSubcategoryFilter) {
      list = list.filter(function (h) { return h.subcategory === householdRecatSubcategoryFilter; });
    }
    if (householdRecatAccountFilter === "__none__") {
      list = list.filter(function (h) { return !h.account_id; });
    } else if (householdRecatAccountFilter) {
      list = list.filter(function (h) { return h.account_id === householdRecatAccountFilter; });
    }
    if (householdRecatTypeFilter) {
      list = list.filter(function (h) { return h.type === householdRecatTypeFilter; });
    }
    var amountMin = householdRecatAmountMin !== "" ? Number(householdRecatAmountMin) : null;
    var amountMax = householdRecatAmountMax !== "" ? Number(householdRecatAmountMax) : null;
    if (amountMin !== null && !isNaN(amountMin)) {
      list = list.filter(function (h) { return (Number(h.amount) || 0) >= amountMin; });
    }
    if (amountMax !== null && !isNaN(amountMax)) {
      list = list.filter(function (h) { return (Number(h.amount) || 0) <= amountMax; });
    }
    if (needle) {
      list = list.filter(function (h) { return normalizeHeaderForMatch(h.notes || "").indexOf(needle) >= 0; });
    }
    list = sortHouseholdOps(list);
    updateHouseholdOpsSortIndicators();

    var body = document.getElementById("household-recat-body");
    var emptyEl = document.getElementById("household-recat-empty");
    if (!body) return;

    // Recuento de filas MARCADAS (no del total filtrado) -- "Aplicar a los filtrados" opera solo
    // sobre lo marcado, ver householdRecatChecked. Por defecto (id sin entrada) cuenta como
    // marcado, para que el botón se siga comportando como antes si no se desmarca nada.
    function updateRecatCheckedCount() {
      var countEl = document.getElementById("household-recat-count");
      if (countEl) countEl.textContent = list.filter(function (h) { return householdRecatChecked[h.id] !== false; }).length;
    }

    var anyFilterActive = !householdOpsAllMonths || !!householdRecatCategoryFilter || !!householdRecatSubcategoryFilter ||
      !!householdRecatAccountFilter || !!householdRecatTypeFilter || amountMin !== null || amountMax !== null || !!householdRecatTextFilter;
    if (list.length === 0) {
      body.innerHTML = "";
      if (emptyEl) emptyEl.innerHTML = '<div class="empty-state"><strong>Sin resultados</strong>' + (anyFilterActive ? "Ningún movimiento coincide con el filtro." : "Aún no hay movimientos registrados.") + "</div>";
      renderHouseholdRecatPagination(1);
      // Los ids "filtrados" para los botones de acción en bloque siguen siendo TODO lo que
      // deje el filtro (list), no lo que se pinta en esta página -- se guarda igual aunque no
      // haya filas que mostrar, para no dejar el array desactualizado.
      renderHouseholdRecat._filteredIds = [];
      renderHouseholdRecat._checkedIds = [];
      updateRecatCheckedCount();
      return;
    }
    if (emptyEl) emptyEl.innerHTML = "";

    // Paginación sobre "list" ya filtrada (no sobre todo el histórico) -- esta tabla existe para
    // reclasificar en bloque TODO lo que deje el filtro, así que "Aplicar a los filtrados"/
    // "Eliminar filtrados" siguen operando sobre "list" completa (ver más abajo), no sobre
    // "pageList". Sin esto, con cientos de filas la tabla entera quedaba ya construida en el DOM
    // aunque la pestaña estuviera oculta -- el navegador pospone el layout de un bloque
    // display:none hasta que se hace visible, así que el "parón" se notaba justo al entrar en
    // Economía (parecía que recargaba todo, cuando en realidad solo estaba dibujando de golpe
    // cientos de filas con 3 controles editables cada una).
    var recatTotalPages = Math.max(1, Math.ceil(list.length / HOUSEHOLD_MOVEMENTS_PAGE_SIZE));
    if (householdRecatPage >= recatTotalPages) householdRecatPage = recatTotalPages - 1;
    if (householdRecatPage < 0) householdRecatPage = 0;
    var recatPageStart = householdRecatPage * HOUSEHOLD_MOVEMENTS_PAGE_SIZE;
    var pageList = list.slice(recatPageStart, recatPageStart + HOUSEHOLD_MOVEMENTS_PAGE_SIZE);

    // Cabecera de mes intercalada en la propia tabla -- "list" ya viene ordenada por fecha
    // descendente, así que las filas del mismo mes quedan consecutivas dentro de la página; solo
    // se pinta una cabecera cuando el mes cambia respecto a la fila anterior DE LA PÁGINA (nunca
    // una cabecera para un mes que el filtro haya dejado sin ninguna fila, porque solo se mira
    // pageList, no todo el histórico de meses posibles).
    // La cabecera de mes intercalada solo tiene sentido cuando la tabla está ordenada por fecha
    // -- "list" ya viene ordenada así en ese caso, con las filas del mismo mes consecutivas.
    // Con cualquier otro orden (p.ej. por Importe) las filas de un mismo mes quedan dispersas
    // por toda la página, y repetir la cabecera de "jul 2026" varias veces intercalada con
    // otros meses se leería como roto en vez de como una agrupación real.
    var showMonthHeadings = householdOpsSort.key === "date";
    var lastMonthHeading = null;
    body.innerHTML = pageList.map(function (h) {
      var headingHtml = "";
      if (showMonthHeadings) {
        var rowMonth = (h.date || "").slice(0, 7);
        if (rowMonth !== lastMonthHeading) {
          headingHtml = '<tr class="month-group-heading-row"><td colspan="10">' + monthHeadingLabel(rowMonth) + "</td></tr>";
          lastMonthHeading = rowMonth;
        }
      }
      var isNeutral = !!HOUSEHOLD_NEUTRAL_TYPES[h.type];
      var sign = isNeutral ? "" : (h.type === "ingreso" ? "+" : "-");
      var amountCls = isNeutral ? "" : (h.type === "ingreso" ? "pos" : "neg");
      var checked = householdRecatChecked[h.id] !== false;
      var realPartHtml = isNeutral ? "—" : fmtMoney(realShare(h));
      return headingHtml + "<tr>" +
        '<td><input type="checkbox" data-recat-check-id="' + h.id + '" ' + (checked ? "checked" : "") + "></td>" +
        '<td class="mono" data-label="Fecha">' + fmtDate(h.date) + "</td>" +
        '<td data-label="Tipo">' + (HOUSEHOLD_TYPE_LABELS[h.type] || escapeHtml(h.type)) + "</td>" +
        '<td data-label="Cuenta"><select class="recat-input" data-recat-id="' + h.id + '" data-recat-field="account_id">' + accountOptionsHtml(h.account_id) + "</select></td>" +
        '<td data-label="Categoría"><input type="text" class="recat-input" list="household-category-suggestions" value="' + escapeHtml(h.category || "") + '" data-recat-id="' + h.id + '" data-recat-field="category"></td>' +
        '<td data-label="Subcategoría"><input type="text" class="recat-input" list="household-subcategory-suggestions" value="' + escapeHtml(h.subcategory || "") + '" data-recat-id="' + h.id + '" data-recat-field="subcategory"></td>' +
        '<td class="right mono money ' + amountCls + '" data-label="Importe">' + sign + fmtMoney(Number(h.amount) || 0) + "</td>" +
        '<td class="right mono money" data-label="Mi parte">' + realPartHtml + "</td>" +
        '<td data-label="Descripción"><input type="text" class="recat-input" value="' + escapeHtml(h.notes || "") + '" placeholder="Sin descripción" data-recat-id="' + h.id + '" data-recat-field="notes"></td>' +
        '<td class="table-cards-action">' +
          '<button class="icon-btn" data-rule-from-household="' + h.id + '" title="Crear regla de categorización desde esta operación">🏷</button>' +
          (h.recurring ? '<button class="icon-btn" data-repeat-household="' + h.id + '" title="Repetir el mes que viene">🔁</button>' : "") +
          '<button class="icon-btn" data-del-household="' + h.id + '" title="Eliminar">✕︎</button>' +
        "</td>" +
        "</tr>";
    }).join("");

    body.querySelectorAll("[data-recat-id]").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-recat-id");
        var field = input.getAttribute("data-recat-field");
        var fields = {};
        fields[field] = field === "category" ? input.value.trim() : (input.value.trim() || null);
        if (field === "category" && !fields.category) { alert("La categoría no puede quedar vacía."); renderHouseholdRecat(); return; }
        bulkUpdateHousehold([id], fields).then(loadAll).catch(function (err) { alert("Error al guardar: " + err.message); });
      });
    });
    body.querySelectorAll("[data-del-household]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("¿Eliminar este movimiento?")) return;
        api("/api/household/" + btn.getAttribute("data-del-household"), { method: "DELETE" }).then(loadAll);
      });
    });
    body.querySelectorAll("[data-rule-from-household]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var h = HOUSEHOLD.find(function (x) { return x.id === btn.getAttribute("data-rule-from-household"); });
        if (h) openRuleFormFromHousehold(h);
      });
    });
    body.querySelectorAll("[data-repeat-household]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = HOUSEHOLD.find(function (h) { return h.id === btn.getAttribute("data-repeat-household"); });
        if (!src) return;
        api("/api/household", { method: "POST", body: JSON.stringify({
          type: src.type, category: src.category, subcategory: src.subcategory, amount: src.amount,
          date: addOneMonthClamped(src.date), recurring: 1, notes: src.notes, account_id: src.account_id || null
        }) }).then(loadAll).catch(function (err) { alert("Error al repetir: " + err.message); });
      });
    });
    body.querySelectorAll("[data-recat-check-id]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        householdRecatChecked[cb.getAttribute("data-recat-check-id")] = cb.checked;
        // BUG previo: _checkedIds solo se recalculaba en un render completo (más abajo), y este
        // handler a propósito NO renderiza de nuevo (para no perder el foco del checkbox recién
        // tocado) -- así que marcar/desmarcar una fila suelta nunca llegaba a actualizar
        // _checkedIds, y "Aplicar a los marcados"/"Eliminar filtrados" leían una instantánea
        // vieja (comprobado: desmarcar "seleccionar todo" -- eso sí renderiza, _checkedIds
        // queda vacío -- y luego marcar una fila suelta dejaba _checkedIds vacío igual, y el
        // envío decía "no hay movimientos marcados" aunque se viera una fila marcada en
        // pantalla). Se recalcula aquí también, sin necesidad de un render completo.
        renderHouseholdRecat._checkedIds = list.filter(function (h) { return householdRecatChecked[h.id] !== false; }).map(function (h) { return h.id; });
        updateRecatCheckedCount();
        // El checkbox de cabecera refleja "¿está todo marcado?" -- se actualiza sin volver a
        // renderizar toda la tabla, para no perder el foco del checkbox que se acaba de tocar.
        var selectAllEl = document.getElementById("household-recat-select-all");
        if (selectAllEl) selectAllEl.checked = list.every(function (h) { return householdRecatChecked[h.id] !== false; });
      });
    });

    // Checkbox de cabecera: marca/desmarca TODO el filtro (list), no solo la página visible --
    // mismo alcance que ya tiene "Aplicar a los filtrados"/"Eliminar filtrados".
    var selectAllEl = document.getElementById("household-recat-select-all");
    if (selectAllEl) {
      selectAllEl.checked = list.every(function (h) { return householdRecatChecked[h.id] !== false; });
      selectAllEl.onchange = function () {
        list.forEach(function (h) { householdRecatChecked[h.id] = selectAllEl.checked; });
        renderHouseholdRecat();
      };
    }

    // Guarda la lista de ids de TODO el filtro (no solo la página visible) para "Aplicar a los
    // filtrados"/"Eliminar filtrados" -- se recalcula en cada render en vez de leerla del DOM.
    // _checkedIds es el subconjunto realmente marcado (ver householdRecatChecked); _filteredIds
    // se conserva por si algo más lo necesitara como "todo lo que deja el filtro".
    renderHouseholdRecat._filteredIds = list.map(function (h) { return h.id; });
    renderHouseholdRecat._checkedIds = list.filter(function (h) { return householdRecatChecked[h.id] !== false; }).map(function (h) { return h.id; });
    updateRecatCheckedCount();
    renderHouseholdRecatPagination(recatTotalPages);
  }

  // Mismo patrón que renderHouseholdMovementsPagination -- cambiar de página vuelve a
  // renderizar la función entera (barato: es solo recortar un array ya calculado y reconstruir
  // esa tabla) en vez de intentar parchear filas sueltas.
  function renderHouseholdRecatPagination(totalPages) {
    var el = document.getElementById("household-recat-pagination");
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    el.innerHTML =
      '<button type="button" class="btn" id="household-recat-prev"' + (householdRecatPage === 0 ? " disabled" : "") + '>‹ Anterior</button>' +
      '<span class="csv-preview-page-info">Página ' + (householdRecatPage + 1) + " de " + totalPages + "</span>" +
      '<button type="button" class="btn" id="household-recat-next"' + (householdRecatPage >= totalPages - 1 ? " disabled" : "") + ">Siguiente ›</button>";
    var prevBtn = document.getElementById("household-recat-prev");
    var nextBtn = document.getElementById("household-recat-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { householdRecatPage--; renderHouseholdRecat(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { householdRecatPage++; renderHouseholdRecat(); });
  }

  var householdEvolutionScaleEl = document.getElementById("household-evolution-scale");
  if (householdEvolutionScaleEl) {
    householdEvolutionScaleEl.addEventListener("change", function () {
      householdEvolutionScale = householdEvolutionScaleEl.value;
      renderHousehold();
    });
  }
  var householdEvolutionPeriodEl = document.getElementById("household-evolution-period");
  if (householdEvolutionPeriodEl) {
    householdEvolutionPeriodEl.addEventListener("change", function () {
      householdEvolutionPeriod = householdEvolutionPeriodEl.value;
      renderHousehold();
    });
  }

  var householdRecatCategoryFilterEl = document.getElementById("household-recat-category-filter");
  if (householdRecatCategoryFilterEl) {
    householdRecatCategoryFilterEl.addEventListener("change", function () {
      householdRecatCategoryFilter = householdRecatCategoryFilterEl.value;
      // Cambiar de categoría reinicia la subcategoría elegida -- una subcategoría de la
      // categoría anterior podría no existir (o significar otra cosa) en la nueva.
      householdRecatSubcategoryFilter = "";
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatSubcategoryFilterEl = document.getElementById("household-recat-subcategory-filter");
  if (householdRecatSubcategoryFilterEl) {
    householdRecatSubcategoryFilterEl.addEventListener("change", function () {
      householdRecatSubcategoryFilter = householdRecatSubcategoryFilterEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatAccountFilterEl = document.getElementById("household-recat-account-filter");
  if (householdRecatAccountFilterEl) {
    householdRecatAccountFilterEl.addEventListener("change", function () {
      householdRecatAccountFilter = householdRecatAccountFilterEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatTypeFilterEl = document.getElementById("household-recat-type-filter");
  if (householdRecatTypeFilterEl) {
    householdRecatTypeFilterEl.addEventListener("change", function () {
      householdRecatTypeFilter = householdRecatTypeFilterEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatAmountMinEl = document.getElementById("household-recat-amount-min");
  if (householdRecatAmountMinEl) {
    householdRecatAmountMinEl.addEventListener("input", function () {
      householdRecatAmountMin = householdRecatAmountMinEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatAmountMaxEl = document.getElementById("household-recat-amount-max");
  if (householdRecatAmountMaxEl) {
    householdRecatAmountMaxEl.addEventListener("input", function () {
      householdRecatAmountMax = householdRecatAmountMaxEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }
  var householdRecatTextFilterEl = document.getElementById("household-recat-text-filter");
  if (householdRecatTextFilterEl) {
    householdRecatTextFilterEl.addEventListener("input", function () {
      householdRecatTextFilter = householdRecatTextFilterEl.value;
      householdRecatPage = 0;
      renderHouseholdRecat();
    });
  }

  var formHouseholdRecat = document.getElementById("form-household-recat");
  if (formHouseholdRecat) {
    formHouseholdRecat.addEventListener("submit", function (e) {
      e.preventDefault();
      var ids = renderHouseholdRecat._checkedIds || [];
      if (ids.length === 0) { alert("No hay movimientos marcados a los que aplicar el cambio."); return; }
      var newCategory = document.getElementById("household-recat-category").value.trim();
      var newSubcategory = document.getElementById("household-recat-subcategory").value.trim();
      var recatAccountEl = document.getElementById("household-recat-account");
      var accountChanged = recatAccountEl && recatAccountEl.value !== "__nochange__";
      var recatTypeEl = document.getElementById("household-recat-type");
      var typeChanged = recatTypeEl && recatTypeEl.value !== "__nochange__";
      if (!newCategory && !newSubcategory && !accountChanged && !typeChanged) {
        alert("Escribe una categoría/subcategoría nueva, elige una cuenta, o elige un tipo nuevo.");
        return;
      }
      if (!confirm("¿Aplicar el cambio a " + ids.length + " movimiento(s) marcado(s)? Esta acción no se puede deshacer.")) return;
      var fields = {};
      if (newCategory) fields.category = newCategory;
      if (newSubcategory) fields.subcategory = newSubcategory;
      if (accountChanged) fields.account_id = recatAccountEl.value || null;
      if (typeChanged) fields.type = recatTypeEl.value;
      bulkUpdateHousehold(ids, fields)
        .then(function () { e.target.reset(); return loadAll(); })
        .then(function () { activateTab("household-operations"); })
        .catch(function (err) { alert("Error al aplicar el cambio: " + err.message); });
    });
  }

  // "Eliminar filtrados": borra solo lo que quede MARCADO del filtro actual (deshacer una
  // importación concreta, p.ej. filtrando por un texto que solo aparezca en esas filas, sin
  // perder el resto del histórico -- desmarca las que quieras conservar). "Eliminar todos los
  // movimientos": vacía Economía doméstica entera, para descartar de golpe una importación
  // desastrosa y empezar de nuevo -- no toca Cartera.
  var householdBtnDeleteFiltered = document.getElementById("household-btn-delete-filtered");
  if (householdBtnDeleteFiltered) {
    householdBtnDeleteFiltered.addEventListener("click", function () {
      var ids = renderHouseholdRecat._checkedIds || [];
      if (ids.length === 0) { alert("No hay movimientos marcados para eliminar."); return; }
      if (!confirm("¿Eliminar los " + ids.length + " movimiento(s) marcado(s)? Esta acción no se puede deshacer.")) return;
      api("/api/household/bulk-delete", { method: "POST", body: JSON.stringify({ ids: ids }) })
        .then(loadAll)
        .catch(function (err) { alert("Error al eliminar: " + err.message); });
    });
  }

  var householdBtnDeleteAll = document.getElementById("household-btn-delete-all");
  if (householdBtnDeleteAll) {
    householdBtnDeleteAll.addEventListener("click", function () {
      var count = HOUSEHOLD.length;
      if (count === 0) { alert("No hay movimientos que eliminar."); return; }
      if (!confirm(
        "¿Eliminar TODOS los " + count + " movimientos de Economía doméstica? Esta acción no se puede deshacer y no afecta a Cartera.\n\n" +
        "Si quieres conservar una copia antes, cancela y usa \"Backup JSON\" en la cabecera."
      )) return;
      api("/api/household", { method: "DELETE" })
        .then(loadAll)
        .catch(function (err) { alert("Error al eliminar: " + err.message); });
    });
  }

  /* ---------------- 25. Render: Análisis de Economía doméstica ---------------- */
  function renderHouseholdAnalysis() {
    var periodEl = document.getElementById("household-analysis-period");
    if (periodEl && periodEl.value !== householdAnalysisPeriod) periodEl.value = householdAnalysisPeriod;
    var scaleEl = document.getElementById("household-analysis-scale");
    if (scaleEl && scaleEl.value !== householdAnalysisScale) scaleEl.value = householdAnalysisScale;
    var evolutionPeriodEl = document.getElementById("household-analysis-evolution-period");
    if (evolutionPeriodEl && evolutionPeriodEl.value !== householdAnalysisEvolutionPeriod) evolutionPeriodEl.value = householdAnalysisEvolutionPeriod;

    var byCategory = computeExpenseByCategory(householdAnalysisPeriod);
    var donutResult = donutSvg(byCategory, {});
    var donutEl = document.getElementById("donut-household-category");
    if (donutEl) donutEl.innerHTML = "<div>" + donutResult.svg + "</div><ul class=\"donut-legend\">" + donutResult.legendHtml + "</ul>";

    var rankingEl = document.getElementById("household-category-ranking");
    if (rankingEl) rankingEl.innerHTML = categoryRankingHtml(byCategory);

    // Mismo mecanismo de zoom que "Evolución mes a mes" (Resumen) -- selector propio de este
    // panel, independiente del "Periodo" de arriba (ese solo afecta al desglose por categoría).
    var months = filterMonthsByPeriod(computeHouseholdMonthly(), householdAnalysisEvolutionPeriod);
    var chartEl = document.getElementById("chart-household-analysis");
    if (chartEl) {
      chartEl.innerHTML = monthlyBarsSvg(months, householdAnalysisScale, [{ key: "expense", color: themeColor("--negative"), label: "Gastos" }]);
      wireChartTooltips(chartEl);
    }
  }

  var householdAnalysisPeriodEl = document.getElementById("household-analysis-period");
  if (householdAnalysisPeriodEl) {
    householdAnalysisPeriodEl.addEventListener("change", function () {
      householdAnalysisPeriod = householdAnalysisPeriodEl.value;
      renderHouseholdAnalysis();
    });
  }
  var householdAnalysisScaleEl = document.getElementById("household-analysis-scale");
  if (householdAnalysisScaleEl) {
    householdAnalysisScaleEl.addEventListener("change", function () {
      householdAnalysisScale = householdAnalysisScaleEl.value;
      renderHouseholdAnalysis();
    });
  }
  var householdAnalysisEvolutionPeriodEl = document.getElementById("household-analysis-evolution-period");
  if (householdAnalysisEvolutionPeriodEl) {
    householdAnalysisEvolutionPeriodEl.addEventListener("change", function () {
      householdAnalysisEvolutionPeriod = householdAnalysisEvolutionPeriodEl.value;
      renderHouseholdAnalysis();
    });
  }

  /* ---------------- 26. Render: flyout "Cuentas" (Economía) ---------------- */
  function renderHouseholdAccounts() {
    var listEl = document.getElementById("household-accounts-list");
    if (!listEl) return;
    if (ACCOUNTS.length === 0) {
      listEl.innerHTML = '<p class="hint" style="margin:10px 0 0 0">Aún no hay cuentas -- añade una abajo.</p>';
      return;
    }
    listEl.innerHTML = ACCOUNTS.map(function (a) {
      return '<div class="account-row">' +
        '<input type="text" class="recat-input" value="' + escapeHtml(a.name) + '" data-account-id="' + a.id + '" data-account-field="name" title="Nombre">' +
        '<input type="text" class="recat-input" value="' + escapeHtml(a.third_party_name || "") + '" placeholder="Tercero (opcional)" data-account-id="' + a.id + '" data-account-field="third_party_name" title="Nombre de la otra persona, para “Aportación de tercero”">' +
        '<input type="number" min="0" max="100" step="any" value="' + a.split_pct + '" data-account-id="' + a.id + '" data-account-field="split_pct" title="% de reparto">' +
        '<label style="display:flex;align-items:center;gap:5px;flex:none;font-size:13px;color:var(--text-dim);white-space:nowrap" title="Si está marcado, los movimientos de tipo Ingreso de esta cuenta cuentan como ingreso real. Desmárcalo en cuentas que solo reciben traspasos desde otra (p.ej. Domiciliaciones/Conjunta) -- el importador CSV preseleccionará Transferencia interna para sus abonos.">' +
          '<input type="checkbox" style="width:auto" ' + (a.income_source !== 0 ? "checked" : "") + ' data-account-id="' + a.id + '" data-account-field="income_source"> Ingresos' +
        "</label>" +
        '<button type="button" class="icon-btn" data-del-account="' + a.id + '" title="Eliminar cuenta">✕︎</button>' +
        "</div>";
    }).join("");

    // Guarda la fila entera (name + split_pct + third_party_name + income_source) al cambiar
    // cualquiera de los campos -- POST /api/accounts exige name+split_pct a la vez (mismo patrón
    // upsert que POST /api/prices); third_party_name/income_source van sueltos por ser opcionales.
    function saveAccountRow(id) {
      var nameInput = listEl.querySelector('[data-account-id="' + id + '"][data-account-field="name"]');
      var pctInput = listEl.querySelector('[data-account-id="' + id + '"][data-account-field="split_pct"]');
      var thirdPartyInput = listEl.querySelector('[data-account-id="' + id + '"][data-account-field="third_party_name"]');
      var incomeSourceInput = listEl.querySelector('[data-account-id="' + id + '"][data-account-field="income_source"]');
      var name = nameInput.value.trim();
      var pct = parseFloat(pctInput.value);
      var thirdPartyName = thirdPartyInput ? thirdPartyInput.value.trim() : "";
      if (!name) { alert("El nombre no puede quedar vacío."); renderHouseholdAccounts(); return; }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { alert("El % debe estar entre 0 y 100."); renderHouseholdAccounts(); return; }
      api("/api/accounts", { method: "POST", body: JSON.stringify({
        id: id, name: name, split_pct: pct, third_party_name: thirdPartyName || null,
        income_source: incomeSourceInput ? incomeSourceInput.checked : true
      }) })
        .then(loadAll)
        .catch(function (err) { alert("Error al guardar: " + err.message); });
    }
    listEl.querySelectorAll("[data-account-field]").forEach(function (input) {
      input.addEventListener("change", function () { saveAccountRow(input.getAttribute("data-account-id")); });
    });
    listEl.querySelectorAll("[data-del-account]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del-account");
        var acc = ACCOUNTS.find(function (a) { return a.id === id; });
        if (!confirm('¿Eliminar la cuenta "' + (acc ? acc.name : "") + '"? Sus movimientos pasarán a "Sin cuenta" (100%) -- no se borran.')) return;
        api("/api/accounts/" + id, { method: "DELETE" }).then(loadAll).catch(function (err) { alert("Error al eliminar: " + err.message); });
      });
    });
  }

  var formHouseholdAccount = document.getElementById("form-household-account");
  if (formHouseholdAccount) {
    formHouseholdAccount.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var name = f.name.value.trim();
      var pct = parseFloat(f.split_pct.value);
      var thirdPartyName = f.third_party_name.value.trim();
      if (!name) return;
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { alert("El % debe estar entre 0 y 100."); return; }
      api("/api/accounts", { method: "POST", body: JSON.stringify({
        name: name, split_pct: pct, third_party_name: thirdPartyName || null, income_source: f.income_source.checked
      }) })
        .then(function () { f.reset(); return loadAll(); })
        .catch(function (err) { alert("Error al crear la cuenta: " + err.message); });
    });
  }

  /* ---------------- 27. Render: flyout "Reglas" de categorización (Economía) ---------------- */
  function renderCategoryRules() {
    var listEl = document.getElementById("household-rules-list");
    if (!listEl) return;
    if (CATEGORY_RULES.length === 0) {
      listEl.innerHTML = '<p class="hint" style="margin:10px 0 0 0">Aún no hay reglas -- añade una abajo.</p>';
      return;
    }
    var MATCH_TYPE_OPTIONS = [
      ["contains", "Contiene el texto"], ["not_contains", "No contiene el texto"],
      ["word", "Solo palabra exacta"], ["starts_with", "Empieza por"], ["ends_with", "Termina por"]
    ];
    listEl.innerHTML = '<p class="panel-subtitle" style="margin-top:0;padding-top:0;border-top:none;">Reglas guardadas</p>' +
      CATEGORY_RULES.map(function (r) {
      var matchType = r.match_type || "contains";
      return '<div class="account-row">' +
        '<input type="text" class="recat-input" value="' + escapeHtml(r.keyword) + '" data-rule-id="' + r.id + '" data-rule-field="keyword" title="Palabra(s), separadas por comas si hay varias">' +
        '<select class="recat-input" data-rule-id="' + r.id + '" data-rule-field="match_type" title="Cómo comparar la(s) palabra(s) con la descripción" style="flex:none;width:auto">' +
          MATCH_TYPE_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === matchType ? " selected" : "") + '>' + o[1] + "</option>"; }).join("") +
        "</select>" +
        '<input type="text" class="recat-input" value="' + escapeHtml(r.category) + '" list="household-category-suggestions" data-rule-id="' + r.id + '" data-rule-field="category" title="Categoría">' +
        '<input type="text" class="recat-input" value="' + escapeHtml(r.subcategory || "") + '" list="household-subcategory-suggestions" placeholder="Subcategoría (opcional)" data-rule-id="' + r.id + '" data-rule-field="subcategory" title="Subcategoría">' +
        '<button type="button" class="icon-btn" data-del-rule="' + r.id + '" title="Eliminar regla">✕︎</button>' +
        "</div>";
    }).join("");

    // Guarda la fila entera al cambiar cualquier campo (mismo patrón que saveAccountRow) y, si
    // hay operaciones ya guardadas que coincidan con el keyword resultante, ofrece aplicarla
    // retroactivamente -- igual que al crear una regla nueva desde el formulario de abajo.
    function saveRuleRow(id) {
      var keywordInput = listEl.querySelector('[data-rule-id="' + id + '"][data-rule-field="keyword"]');
      var categoryInput = listEl.querySelector('[data-rule-id="' + id + '"][data-rule-field="category"]');
      var subcategoryInput = listEl.querySelector('[data-rule-id="' + id + '"][data-rule-field="subcategory"]');
      var matchTypeInput = listEl.querySelector('[data-rule-id="' + id + '"][data-rule-field="match_type"]');
      var keyword = keywordInput.value.trim();
      var category = categoryInput.value.trim();
      var subcategory = subcategoryInput.value.trim();
      var matchType = matchTypeInput && CATEGORY_RULE_MATCH_TYPES.indexOf(matchTypeInput.value) >= 0 ? matchTypeInput.value : "contains";
      if (!keyword) { alert("La palabra/frase no puede quedar vacía."); renderCategoryRules(); return; }
      if (!category) { alert("La categoría no puede quedar vacía."); renderCategoryRules(); return; }
      api("/api/category-rules", { method: "POST", body: JSON.stringify({
        id: id, keyword: keyword, category: category, subcategory: subcategory || null, match_type: matchType
      }) })
        .then(function (rule) { return loadAll().then(function () { showRuleRetroPreview(rule); }); })
        .catch(function (err) { alert("Error al guardar: " + err.message); });
    }
    listEl.querySelectorAll("[data-rule-field]").forEach(function (input) {
      input.addEventListener("change", function () { saveRuleRow(input.getAttribute("data-rule-id")); });
    });
    listEl.querySelectorAll("[data-del-rule]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del-rule");
        var rule = CATEGORY_RULES.find(function (r) { return r.id === id; });
        if (!confirm('¿Eliminar la regla "' + (rule ? rule.keyword : "") + '"? Las operaciones ya categorizadas con ella no cambian.')) return;
        api("/api/category-rules/" + id, { method: "DELETE" }).then(loadAll).catch(function (err) { alert("Error al eliminar: " + err.message); });
      });
    });
  }

  // Vista previa de aplicación retroactiva de UNA regla (recién creada o editada) sobre
  // household_entries ya guardadas -- nunca se aplica sola. Marcada por defecto solo en las filas
  // sin categoría real ("Sin categoría"/vacía); las que ya tienen una categoría propia aparecen
  // como candidatas pero DESMARCADAS, para que sobrescribirlas sea una decisión explícita fila a
  // fila en vez de un bloque ciego.
  function showRuleRetroPreview(rule) {
    var wrap = document.getElementById("household-rules-retro");
    if (!wrap) return;
    var candidates = HOUSEHOLD.filter(function (h) { return ruleMatchesText(normalizeHeaderForMatch(h.notes || ""), rule); });
    if (!candidates.length) { wrap.style.display = "none"; return; }

    var matchLabel = CATEGORY_RULE_MATCH_LABELS[rule.match_type || "contains"] || "contiene";
    document.getElementById("household-rules-retro-count").textContent =
      candidates.length + (candidates.length === 1 ? " operación ya guardada " : " operaciones ya guardadas ") +
      matchLabel + ' "' + rule.keyword + '" en su descripción. Las que ya tenían categoría propia empiezan desmarcadas.';

    var body = document.getElementById("household-rules-retro-body");
    body.innerHTML = candidates.map(function (h) {
      var hasOwnCategory = !!(h.category && h.category !== "Sin categoría");
      var curLabel = (h.category || "Sin categoría") + (h.subcategory ? " / " + h.subcategory : "");
      var newLabel = rule.category + (rule.subcategory ? " / " + rule.subcategory : "");
      return "<tr>" +
        '<td><input type="checkbox" data-retro-id="' + h.id + '"' + (hasOwnCategory ? "" : " checked") + "></td>" +
        '<td class="mono">' + escapeHtml(h.date || "") + "</td>" +
        "<td>" + escapeHtml(h.notes || "—") + "</td>" +
        "<td>" + escapeHtml(curLabel) + " → " + escapeHtml(newLabel) + "</td>" +
        "</tr>";
    }).join("");

    var selectAllEl = document.getElementById("household-rules-retro-select-all");
    function updateSelCount() {
      var boxes = body.querySelectorAll("[data-retro-id]");
      document.getElementById("household-rules-retro-selcount").textContent =
        body.querySelectorAll("[data-retro-id]:checked").length;
      if (selectAllEl) selectAllEl.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (cb) { return cb.checked; });
    }
    body.querySelectorAll("[data-retro-id]").forEach(function (cb) { cb.addEventListener("change", updateSelCount); });
    if (selectAllEl) {
      selectAllEl.onchange = function () {
        body.querySelectorAll("[data-retro-id]").forEach(function (cb) { cb.checked = selectAllEl.checked; });
        updateSelCount();
      };
    }
    updateSelCount();

    document.getElementById("household-rules-retro-apply").onclick = function () {
      var ids = Array.prototype.slice.call(body.querySelectorAll("[data-retro-id]:checked")).map(function (cb) {
        return cb.getAttribute("data-retro-id");
      });
      if (!ids.length) { wrap.style.display = "none"; return; }
      // subcategory solo se manda si la regla la fija -- así una regla sin subcategoría no borra
      // la que ya tuviera una operación (ver semántica de hasSubcategory en /api/household/bulk-update).
      var body2 = { ids: ids, category: rule.category };
      if (rule.subcategory) body2.subcategory = rule.subcategory;
      api("/api/household/bulk-update", { method: "POST", body: JSON.stringify(body2) })
        .then(function () { wrap.style.display = "none"; return loadAll(); })
        .catch(function (err) { alert("Error al aplicar la regla: " + err.message); });
    };
    document.getElementById("household-rules-retro-dismiss").onclick = function () { wrap.style.display = "none"; };

    wrap.style.display = "block";
  }

  var formHouseholdRule = document.getElementById("form-household-rule");
  if (formHouseholdRule) {
    formHouseholdRule.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var keyword = f.keyword.value.trim();
      var category = f.category.value.trim();
      var subcategory = f.subcategory.value.trim();
      var matchType = CATEGORY_RULE_MATCH_TYPES.indexOf(f.match_type.value) >= 0 ? f.match_type.value : "contains";
      if (!keyword || !category) return;
      api("/api/category-rules", { method: "POST", body: JSON.stringify({
        keyword: keyword, category: category, subcategory: subcategory || null, match_type: matchType
      }) })
        .then(function (rule) { f.reset(); return loadAll().then(function () { showRuleRetroPreview(rule); }); })
        .catch(function (err) { alert("Error al crear la regla: " + err.message); });
    });
  }

  // Abre el panel de Reglas con el formulario de alta prerrellenado a partir de una operación ya
  // guardada (atajo "🏷" en Operaciones) -- reutiliza el mismo flyout/formulario, no un componente
  // aparte. El keyword se prellena con las notas completas de la fila; el usuario lo acorta si
  // quiere (p.ej. de "COMPRA TARJETA MERCADONA 1234 MADRID" a solo "Mercadona").
  function openRuleFormFromHousehold(h) {
    var toggle = document.getElementById("household-rules-toggle");
    if (toggle) toggle.click();
    var form = document.getElementById("form-household-rule");
    if (!form) return;
    form.keyword.value = h.notes || "";
    form.match_type.value = "contains";
    form.category.value = (h.category && h.category !== "Sin categoría") ? h.category : "";
    form.subcategory.value = h.subcategory || "";
    form.keyword.focus();
  }

  /* ---------------- 28. Render: flyout "Detectar traspasos" (Economía) ---------------- */
  var pendingTransferMatches = [];

  function renderPortfolioTransferMatches() {
    var body = document.getElementById("household-transfers-body");
    var emptyEl = document.getElementById("household-transfers-empty");
    var countEl = document.getElementById("household-transfers-count");
    if (!body) return;

    // Conserva qué filas tenía marcadas/desmarcadas el usuario en esta sesión, aunque el
    // conjunto de coincidencias cambie entre renders (p.ej. al añadir una operación nueva en
    // otra pestaña, que vuelve a llamar a renderAll()) -- por defecto una coincidencia nueva
    // sale marcada.
    var prevInclude = {};
    pendingTransferMatches.forEach(function (m) { prevInclude[m.householdId] = m.include; });
    pendingTransferMatches = detectPortfolioTransfers().map(function (m) {
      m.include = prevInclude[m.householdId] !== undefined ? prevInclude[m.householdId] : true;
      return m;
    });

    function updateCount() {
      if (countEl) countEl.textContent = pendingTransferMatches.filter(function (m) { return m.include; }).length;
    }

    if (pendingTransferMatches.length === 0) {
      body.innerHTML = "";
      if (emptyEl) emptyEl.innerHTML = '<div class="empty-state"><strong>Sin coincidencias</strong>Ningún movimiento de Economía coincide en fecha e importe con una operación de Cartera.</div>';
      updateCount();
      return;
    }
    if (emptyEl) emptyEl.innerHTML = "";

    body.innerHTML = pendingTransferMatches.map(function (m, i) {
      var directionHtml = m.direction === "out"
        ? '<span class="neg">← Retirada de Cartera</span>'
        : '<span class="pos">→ Ingreso en Cartera</span>';
      return "<tr>" +
        '<td><input type="checkbox" data-transfer-include data-transfer-index="' + i + '" ' + (m.include ? "checked" : "") + "></td>" +
        '<td class="mono">' + fmtDate(m.date) + "</td>" +
        '<td class="right mono money">' + fmtMoney(m.amount) + "</td>" +
        "<td>" + escapeHtml(m.category) + "</td>" +
        "<td>" + directionHtml + "</td>" +
        "<td>" + escapeHtml(m.txBroker) + "</td>" +
        "</tr>";
    }).join("");

    body.querySelectorAll("[data-transfer-include]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        pendingTransferMatches[parseInt(cb.getAttribute("data-transfer-index"), 10)].include = cb.checked;
        updateCount();
      });
    });

    updateCount();
  }

  var btnConfirmTransfers = document.getElementById("btn-confirm-transfers");
  if (btnConfirmTransfers) {
    btnConfirmTransfers.addEventListener("click", function () {
      var ids = pendingTransferMatches.filter(function (m) { return m.include; }).map(function (m) { return m.householdId; });
      if (ids.length === 0) { alert("No hay traspasos seleccionados."); return; }
      if (!confirm("¿Convertir " + ids.length + " movimiento(s) en \"Transferencia interna\"? No afecta a Cartera. Puedes deshacerlo a mano después desde \"Operaciones\".")) return;
      bulkUpdateHousehold(ids, { type: "transferencia" })
        .then(loadAll)
        .catch(function (err) { alert("Error al convertir: " + err.message); });
    });
  }

  function renderAll() { renderDashboard(); renderBrokerEquity(); renderDividends(); renderPositions(); renderCash(); renderOperations(); renderValuations(); renderAutoEquity(); renderHousehold(); renderHouseholdRecat(); renderHouseholdAnalysis(); renderHouseholdAccounts(); renderCategoryRules(); renderPortfolioTransferMatches(); }

  /* ---------------- 29. Tabs (dos niveles) ---------------- */
  // Dashboard/Cartera/Economía arriba, y dentro de Cartera y de Economía sus propias
  // subpestañas.
  // Las pestañas que activateTab() ya recibía en todo el código (desde formularios, importador,
  // refresco de precios...) siguen siendo las mismas de siempre (p.ej. "operations",
  // "valuations") -- activateTab() se limita a averiguar a qué grupo de nivel superior
  // pertenece cada una (si pertenece a alguno) y sincronizar los dos niveles de navegación,
  // sin tocar ninguna de esas llamadas. SUBTAB_GROUPS es genérico para poder añadir el mismo
  // patrón a una tercera sección (p.ej. Deudas) sin tocar esta función otra vez.
  var SUBTAB_GROUPS = {
    cartera: { tabs: ["cartera-resumen", "positions", "operations", "valuations"], navId: "nav-cartera-sub" },
    household: { tabs: ["household", "household-operations", "household-analysis"], navId: "nav-household-sub" }
  };
  var activeSubtab = { cartera: "cartera-resumen", household: "household" };

  function subtabGroupOf(tab) {
    for (var g in SUBTAB_GROUPS) { if (SUBTAB_GROUPS[g].tabs.indexOf(tab) !== -1) return g; }
    return null;
  }

  function activateTab(tab) {
    activeTab = tab;
    var group = subtabGroupOf(tab);
    var topLevel = group || tab;
    if (group) activeSubtab[group] = tab;

    document.querySelectorAll("nav.toplevel button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-toplevel") === topLevel);
    });
    Object.keys(SUBTAB_GROUPS).forEach(function (g) {
      var subNav = document.getElementById(SUBTAB_GROUPS[g].navId);
      if (!subNav) return;
      subNav.style.display = topLevel === g ? "flex" : "none";
      subNav.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-subtab") === tab);
      });
    });

    document.querySelectorAll("main > section").forEach(function (s) { s.classList.remove("active"); });
    document.getElementById("tab-" + tab).classList.add("active");
  }
  document.querySelectorAll("nav.toplevel button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var top = btn.getAttribute("data-toplevel");
      activateTab(SUBTAB_GROUPS[top] ? activeSubtab[top] : top);
    });
  });
  Object.keys(SUBTAB_GROUPS).forEach(function (g) {
    var subNav = document.getElementById(SUBTAB_GROUPS[g].navId);
    if (!subNav) return;
    subNav.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () { activateTab(btn.getAttribute("data-subtab")); });
    });
  });

  /* ---------------- 30. Formularios manuales ---------------- */
  document.getElementById("form-operation").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var payload = {
      broker: f.broker.value.trim(), date: f.date.value, type: f.type.value,
      name: f.name.value.trim() || null, ticker: f.ticker.value.trim() || null, asset_type: f.asset_type.value,
      quantity: f.quantity.value ? parseFloat(f.quantity.value) : null,
      price: f.price.value ? parseFloat(f.price.value) : null,
      fee: f.fee.value ? parseFloat(f.fee.value) : 0,
      amount: f.amount.value ? parseFloat(f.amount.value) : null,
      currency: "EUR", source: "manual"
    };
    api("/api/transactions", { method: "POST", body: JSON.stringify(payload) })
      .then(function () { f.reset(); return loadAll(); })
      .then(function () { activateTab("operations"); })
      .catch(function (err) { alert("Error al guardar: " + err.message); });
  });

  document.getElementById("form-valuation").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var payload = { date: f.date.value, value: parseFloat(f.value.value), cashflow: parseFloat(f.cashflow.value) || 0 };
    api("/api/valuations", { method: "POST", body: JSON.stringify(payload) })
      .then(function () { f.reset(); return loadAll(); })
      .then(function () { activateTab("valuations"); })
      .catch(function (err) { alert("Error al guardar: " + err.message); });
  });

  document.getElementById("form-household").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var payload = {
      type: f.type.value, category: f.category.value.trim(),
      subcategory: f.subcategory.value.trim() || null,
      amount: f.amount.value ? parseFloat(f.amount.value) : null,
      date: f.date.value, recurring: f.recurring.checked ? 1 : 0,
      notes: f.notes.value.trim() || null,
      account_id: f.account_id.value || null
    };
    api("/api/household", { method: "POST", body: JSON.stringify(payload) })
      .then(function () { f.reset(); return loadAll(); })
      .then(function () { activateTab("household-operations"); })
      .catch(function (err) { alert("Error al guardar: " + err.message); });
  });

  // Con "Transferencia interna" el campo Categoría no tiene un significado obvio (no es una
  // categoría de gasto) -- se sugiere anotar el destino ahí mismo en vez de añadir una columna
  // nueva solo para esto (una transferencia es un movimiento raro comparado con gasto/ingreso).
  var householdFormTypeEl = document.getElementById("household-form-type");
  var householdFormCategoryEl = document.getElementById("household-form-category");
  if (householdFormTypeEl && householdFormCategoryEl) {
    householdFormTypeEl.addEventListener("change", function () {
      householdFormCategoryEl.placeholder = householdFormTypeEl.value === "transferencia"
        ? "Ej. Hacia Domiciliaciones" : "Ej. Alquiler";
    });
  }

  /* ---------------- 31. Exportar operaciones a CSV (para comparar en Excel) ---------------- */
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // Separador de columnas ";" -> Excel en español espera coma decimal, no punto. Si se exportan
  // los números con punto (formato JS por defecto), Excel los interpreta como texto y una SUMA()
  // sobre esa columna da 0 en vez de fallar de forma visible -- parece un descuadre de datos
  // cuando en realidad es solo un problema de formato al abrir el fichero.
  function csvNumber(v) {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "";
    return String(v).replace(".", ",");
  }
  // Para importes en euros redondeamos a 2 decimales antes de formatear -- evita que restas
  // en coma flotante (99.95 - 18.99 = 80.96000000000001) se cuelen en el CSV.
  function csvMoney(v) {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "";
    return csvNumber(Math.round(Number(v) * 100) / 100);
  }
  document.getElementById("btn-export-operations-csv").addEventListener("click", function () {
    var headers = ["Fecha", "Bróker", "Tipo", "Activo", "Ticker", "Cantidad", "Precio", "Comisión", "Importe", "Efectivo (fila)"];
    var list = TX.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var lines = [headers.map(csvCell).join(";")];
    list.forEach(function (t) {
      lines.push([
        csvCell(t.date), csvCell(t.broker), csvCell(TYPE_LABELS[t.type] || t.type), csvCell(t.name || ""), csvCell(t.ticker || ""),
        csvNumber(t.quantity != null ? t.quantity : ""), csvMoney(t.price != null ? t.price : ""),
        csvMoney(Number(t.fee) || 0), csvMoney(t.amount != null ? t.amount : ""), csvMoney(txCashImpact(t))
      ].join(";"));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "cartera-operaciones-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ---------------- 32. Backup / restore ---------------- */
  // Mismos dos botones que btn-privacy-toggle/-mobile más arriba -- btn-export (escritorio) y
  // btn-export-mobile (menú lateral) llaman a la misma función.
  function exportBackup() {
    api("/api/export").then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "cartera-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  document.getElementById("btn-export").addEventListener("click", exportBackup);

  document.getElementById("import-json-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      try {
        var parsed = JSON.parse(evt.target.result);
        if (!confirm("Esto reemplazará TODOS los datos actuales por los del archivo importado. ¿Continuar?")) return;
        api("/api/import-json", { method: "POST", body: JSON.stringify(parsed) })
          .then(loadAll)
          .catch(function (err) { alert("Error al restaurar: " + err.message); });
      } catch (err) { alert("No se pudo leer el archivo: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  /* ---------------- 33. Importador de CSV (Cartera) ---------------- */
  var csvRows = null; // array de arrays (incluye cabecera en [0])
  var csvHeaders = [];
  var csvDelimiter = ",";
  var csvDecimal = ".";

  var FIELD_DEFS = [
    { key: "date", label: "Fecha", required: true, exact: ["fecha", "date"], pattern: /fecha|date|datum|zeit/i },
    // No obligatorio: algunos brokers (p.ej. DEGIRO) no traen ninguna columna de texto "Tipo"
    // -- compra/venta se deduce solo del signo del importe (ver el fallback en btn-preview-csv,
    // "type === 'otro' && qty != null && price != null"). Exigirlo aquí bloqueaba la vista
    // previa entera aunque no existiera ninguna columna real que el usuario pudiera asociar.
    // "action" con límites de palabra (\b) -- sin ellos, "action" también casa como subcadena
    // dentro de "Transaction" (trans-ACTION), así que en un CSV de IBKR la columna basura
    // "Transaction History" (título del informe, repetido igual en todas las filas) le ganaba
    // a la columna real "Transaction Type" por venir antes en el CSV.
    { key: "type", label: "Tipo de operación", required: false, exact: ["tipo", "type"], pattern: /tipo|\btype\b|\baction\b|buy\/sell|richtung/i },
    { key: "name", label: "Nombre del activo", required: false, exact: ["nombre", "activo", "name"], pattern: /nombre|activo|name|description|instrument/i },
    { key: "ticker", label: "Ticker / ISIN", required: false, exact: ["ticker", "isin", "symbol"], pattern: /ticker|isin|symbol|s[ií]mbolo/i },
    { key: "quantity", label: "Cantidad", required: false, exact: ["cantidad", "shares", "quantity", "units"], pattern: /cantidad|quantity|shares|units|nominal|st[uü]ck/i },
    { key: "price", label: "Precio", required: false, exact: ["precio", "price"], pattern: /precio|price|kurs|rate|tradeprice/i },
    { key: "fee", label: "Comisión", required: false, exact: ["comision", "comisión", "fee"], pattern: /comisi[oó]n|fee|commission|gastos|geb[uü]hr/i },
    { key: "tax", label: "Impuesto / retención (se suma a la comisión)", required: false, exact: ["tax", "impuesto", "retencion", "retención"], pattern: /^tax$|impuesto|retenci[oó]n|withholding/i },
    // "preferPattern": cuando varias columnas casan con el patrón normal (p.ej. IBKR trae
    // "Gross Amount" y "Net Amount" a la vez), se prefiere la que además case con este patrón
    // más específico -- "Importe total" tiene que ser el BRUTO (antes de comisión): txCashImpact
    // ya hace "amount - fee" para calcular el efectivo real de cada fila (misma convención que
    // Trade Republic, que trae amount/fee en columnas separadas). Si aquí se asocia Net Amount
    // (que ya lleva la comisión descontada), fee se resta dos veces y el efectivo importado queda
    // descuadrado por partida doble en cada operación -- justo al revés de lo que decía este
    // comentario antes de corregirlo.
    { key: "amount", label: "Importe total", required: false, exact: ["importe", "amount", "total"], pattern: /importe|amount|total|betrag|net ?cash/i, preferPattern: /gross|bruto/i },
    // Divisa del precio/importe de la fila -- IBKR reporta el precio de la operación en la
    // divisa del propio activo (columna "Price Currency"), no en EUR. Sin esta columna no hay
    // forma de saber que un precio en USD se estaba importando tal cual como si fuera EUR.
    { key: "currency", label: "Divisa del precio (si no es EUR)", required: false, exact: ["currency", "moneda", "divisa"], pattern: /currency|moneda|divisa/i }
  ];

  // Huella de columnas del CSV oficial de Trade Republic
  var TR_FINGERPRINT = ["account_type", "category", "asset_class", "counterparty_iban", "mcc_code", "transaction_id"];
  function looksLikeTradeRepublic(headers) {
    var lower = headers.map(function (h) { return h.trim().toLowerCase(); });
    var hits = TR_FINGERPRINT.filter(function (f) { return lower.indexOf(f) >= 0; }).length;
    return hits >= 3;
  }

  // Clasificación de operaciones específica para el CSV de Trade Republic, que usa dos
  // columnas (category/type) con valores tipo ORDER, TRANSFER_INSTANT_INBOUND, DIVIDEND_PAYOUT,
  // INTEREST_PAYOUT, CARD_PAYMENT, etc. La lista completa de valores posibles no está
  // documentada públicamente, así que esto es un mapeo por palabras clave: revisa siempre la
  // vista previa antes de confirmar, por si alguna fila queda como "Otro".
  function classifyTypeTradeRepublic(rawType, rawCategory, hasSharesAndPrice, amount) {
    var combined = ((rawType || "") + " " + (rawCategory || "")).toUpperCase();
    if (/BUY|SAVEBACK|SAVINGS_PLAN/.test(combined)) return "compra";
    if (/SELL/.test(combined)) return "venta";
    if (/DIVIDEND/.test(combined)) return "dividendo";
    if (/INTEREST/.test(combined)) return "dividendo";
    if (/^FEE|_FEE|COST/.test(combined)) return "comision";
    if (/TRANSFER.*OUT|WITHDRAW/.test(combined)) return "retirada";
    if (/TRANSFER.*IN|DEPOSIT/.test(combined)) return "ingreso";
    if (/CARD/.test(combined)) return amount != null && amount < 0 ? "retirada" : "ingreso";
    // Traspasos internos de custodia (MIGRATION/DELIVERY) traen cantidad y precio pero NUNCA
    // amount/fee/tax -- no mueven caja, solo reubican el mismo activo. Sin esta comprobación
    // "hasSharesAndPrice" los confundía con una compra/venta real e inventaba un importe de
    // caja como cantidad×precio, que ni entra ni sale del bróker.
    if (/MIGRATION|DELIVERY/.test(combined) && amount == null) return "otro";
    // Sin "amount" real de por medio, adivinar compra/venta a partir de cantidad+precio solo
    // tiene sentido para CSVs genéricos sin columna de importe -- en Trade Republic una compra o
    // venta real siempre trae amount, así que si falta es más probable que sea otro tipo de
    // evento no clasificado (como un traspaso) que una compra/venta legítima sin dato.
    if (hasSharesAndPrice && amount != null) return amount < 0 ? "compra" : "venta";
    if (amount != null) return amount < 0 ? "retirada" : "ingreso";
    return "otro";
  }

  // Huella de columnas del CSV de Interactive Brokers / MEXEM (Flex Query en formato CSV,
  // ver README §5). No hay una lista cerrada de nombres de columna (dependen de qué "Sections"
  // eligió el usuario al crear la query), así que se exige que casen varias de las más
  // características a la vez para no confundirlo con un CSV genérico que por casualidad tenga
  // una columna "Symbol" o "Commission".
  var IB_FINGERPRINT = ["transaction type", "price currency", "gross amount", "net amount"];
  function looksLikeIBKR(headers) {
    var lower = headers.map(function (h) { return h.trim().toLowerCase(); });
    var hits = IB_FINGERPRINT.filter(function (f) { return lower.indexOf(f) >= 0; }).length;
    return hits >= 3;
  }

  // Clasificación específica para "Transaction Type" de IBKR. Igual que con Trade Republic,
  // IBKR no publica la lista cerrada de valores posibles (varían según el tipo de evento
  // corporativo, custodia, etc.), así que es un mapeo por palabras clave -- revisa siempre la
  // vista previa. "Adjustment" (p.ej. FX Translations P&L) se deja como "Otro" a propósito: no
  // es una operación sobre ningún activo, es un ajuste contable de caja, así que cuenta para el
  // efectivo importado (que suma la columna Importe de TODAS las filas) sin colarse como compra/venta.
  function classifyTypeIBKR(rawType) {
    var t = (rawType || "").toUpperCase();
    if (/BUY/.test(t)) return "compra";
    if (/SELL/.test(t)) return "venta";
    if (/DIVIDEND/.test(t)) return "dividendo";
    // "Debit Interest" (interés que te cobra el bróker, p.ej. por posiciones en descubierto en
    // otra divisa -- un coste real) y "Credit Interest" (interés que te paga por el efectivo sin
    // invertir -- un ingreso real) contienen ambos la palabra "INTEREST", así que hay que mirar
    // "DEBIT"/"CREDIT" primero para no meter un coste dentro de Dividendos.
    if (/DEBIT.*INTEREST/.test(t)) return "comision";
    if (/INTEREST/.test(t)) return "dividendo";
    if (/WITHHOLDING|WITHHELD/.test(t)) return "comision";
    if (/^COMMISSION|COMMISSION ADJ/.test(t)) return "comision";
    if (/DEPOSIT/.test(t)) return "ingreso";
    if (/WITHDRAW/.test(t)) return "retirada";
    return "otro";
  }

  var TYPE_LOOKUP = {
    buy: "compra", compra: "compra", kauf: "compra", bought: "compra", purchase: "compra",
    sell: "venta", venta: "venta", verkauf: "venta", sold: "venta",
    dividend: "dividendo", dividendo: "dividendo", dividende: "dividendo",
    fee: "comision", comision: "comision", "comisión": "comision", gebuhr: "comision", "gebühr": "comision",
    deposit: "ingreso", ingreso: "ingreso", aportacion: "ingreso", "aportación": "ingreso",
    withdrawal: "retirada", retirada: "retirada", reembolso: "retirada"
  };
  function normalizeType(raw) {
    if (!raw) return "otro";
    var k = String(raw).trim().toLowerCase();
    return TYPE_LOOKUP[k] || "otro";
  }

  function detectDelimiter(text) {
    var firstLine = text.split(/\r?\n/)[0] || "";
    var commas = (firstLine.match(/,/g) || []).length;
    var semis = (firstLine.match(/;/g) || []).length;
    return semis > commas ? ";" : ",";
  }

  function parseCSV(text, delimiter) {
    var rows = [], field = "", row = [], inQuotes = false;
    var len = text.length;
    for (var i = 0; i < len; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === delimiter) { row.push(field); field = ""; }
        else if (c === "\r") { /* skip */ }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ""); });
  }

  function parseNumber(str, decimalSep) {
    if (str === null || str === undefined || String(str).trim() === "") return null;
    var s = String(str).trim().replace(/[€$]/g, "").trim();
    var negative = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, "");
    if (decimalSep === ",") s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return negative ? -n : n;
  }

  document.getElementById("csv-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    document.getElementById("csv-file-name").textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (evt) {
      var text = evt.target.result;
      csvDelimiter = detectDelimiter(text);
      csvDecimal = csvDelimiter === ";" ? "," : ".";
      csvRows = parseCSV(text, csvDelimiter);
      csvHeaders = (csvRows[0] || []).map(function (h) { return h.trim(); });

      document.getElementById("csv-delimiter").value = csvDelimiter;
      document.getElementById("csv-decimal").value = csvDecimal;
      document.getElementById("csv-format-row").style.display = "grid";

      buildMappingUI();
      document.getElementById("csv-mapping").style.display = "block";
      document.getElementById("csv-preview-wrap").style.display = "none";
    };
    reader.readAsText(file, "UTF-8");
  });

  document.getElementById("csv-delimiter").addEventListener("change", function () {
    var file = document.getElementById("csv-file").files[0];
    if (!file) return;
    csvDelimiter = this.value;
    var reader = new FileReader();
    reader.onload = function (evt) {
      csvRows = parseCSV(evt.target.result, csvDelimiter);
      csvHeaders = (csvRows[0] || []).map(function (h) { return h.trim(); });
      buildMappingUI();
    };
    reader.readAsText(file, "UTF-8");
  });
  document.getElementById("csv-decimal").addEventListener("change", function () { csvDecimal = this.value; });

  function buildMappingUI() {
    var used = {};
    var isTR = looksLikeTradeRepublic(csvHeaders);

    // Pase 1: coincidencias EXACTAS de nombre de columna (evita que p.ej. "account_type"
    // se confunda con "type" solo porque una contiene a la otra como subcadena).
    var guesses = {};
    FIELD_DEFS.forEach(function (fd) {
      var exactList = fd.exact || [];
      for (var i = 0; i < csvHeaders.length; i++) {
        var h = csvHeaders[i];
        if (used[h]) continue;
        if (exactList.indexOf(h.trim().toLowerCase()) >= 0) { guesses[fd.key] = h; used[h] = true; break; }
      }
    });
    // Pase 2: para los campos que sigan sin match, coincidencia difusa por patrón. Si varias
    // columnas casan a la vez (p.ej. "Gross Amount" y "Net Amount" casan las dos con /amount/i)
    // y el campo define un "preferPattern", se prioriza la que además case con ese patrón más
    // específico en vez de quedarse siempre con la primera columna del CSV.
    FIELD_DEFS.forEach(function (fd) {
      if (guesses[fd.key]) return;
      var candidates = [];
      for (var i = 0; i < csvHeaders.length; i++) {
        var h = csvHeaders[i];
        if (used[h]) continue;
        if (fd.pattern.test(h)) candidates.push(h);
      }
      if (!candidates.length) return;
      var chosen = candidates[0];
      if (fd.preferPattern) {
        var preferred = candidates.filter(function (h) { return fd.preferPattern.test(h); });
        if (preferred.length) chosen = preferred[0];
      }
      guesses[fd.key] = chosen; used[chosen] = true;
    });

    var grid = document.getElementById("mapping-grid");
    grid.innerHTML = FIELD_DEFS.map(function (fd) {
      var guess = guesses[fd.key] || "";
      var options = '<option value="">— no usar —</option>' + csvHeaders.map(function (h) {
        return '<option value="' + escapeHtml(h) + '"' + (h === guess ? " selected" : "") + '>' + escapeHtml(h) + "</option>";
      }).join("");
      return '<div class="field"><label>' + fd.label + (fd.required ? ' <small>(obligatorio)</small>' : '') + '</label><select data-field="' + fd.key + '">' + options + '</select></div>';
    }).join("");

    var isIB = looksLikeIBKR(csvHeaders);
    var banner = document.getElementById("csv-broker-detected");
    if (isTR || isIB) {
      banner.style.display = "block";
      var brokerInput = document.getElementById("csv-broker");
      if (!brokerInput.value.trim()) brokerInput.value = isTR ? "Trade Republic" : "Interactive Brokers";
    } else {
      banner.style.display = "none";
    }
  }

  document.getElementById("btn-preview-csv").addEventListener("click", function () {
    if (!csvRows || csvRows.length < 2) { alert("Sube primero un CSV con al menos una fila de datos."); return; }
    var mapping = {};
    document.querySelectorAll("#mapping-grid select").forEach(function (sel) { mapping[sel.getAttribute("data-field")] = sel.value; });
    if (!mapping.date) { alert("Debes asociar al menos la columna de Fecha."); return; }

    var idx = {};
    Object.keys(mapping).forEach(function (k) { idx[k] = mapping[k] ? csvHeaders.indexOf(mapping[k]) : -1; });

    var isTR = looksLikeTradeRepublic(csvHeaders);
    var isIB = looksLikeIBKR(csvHeaders);
    var categoryIdx = isTR ? csvHeaders.indexOf("category") : -1;
    var assetClassIdx = isTR ? csvHeaders.indexOf("asset_class") : -1;

    var broker = document.getElementById("csv-broker").value.trim() || "Sin especificar";
    var dataRows = csvRows.slice(1).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });

    var parsed = dataRows.map(function (r) {
      var rawDate = idx.date >= 0 ? r[idx.date] : "";
      var normDate = normalizeDate(rawDate, isIB);
      var rawType = idx.type >= 0 ? r[idx.type] : "";
      var qty = idx.quantity >= 0 ? parseNumber(r[idx.quantity], csvDecimal) : null;
      var price = idx.price >= 0 ? parseNumber(r[idx.price], csvDecimal) : null;
      var feeVal = idx.fee >= 0 ? Math.abs(parseNumber(r[idx.fee], csvDecimal) || 0) : 0;
      var taxVal = idx.tax >= 0 ? Math.abs(parseNumber(r[idx.tax], csvDecimal) || 0) : 0;
      var fee = feeVal + taxVal;
      var amount = idx.amount >= 0 ? parseNumber(r[idx.amount], csvDecimal) : null;
      var rawCurrency = idx.currency >= 0 ? (r[idx.currency] || "").trim().toUpperCase() : "";

      var type;
      if (isTR) {
        var rawCategory = categoryIdx >= 0 ? r[categoryIdx] : "";
        type = classifyTypeTradeRepublic(rawType, rawCategory, qty != null && price != null, amount);
      } else if (isIB) {
        type = classifyTypeIBKR(rawType);
        // Los bonos/T-Bills de IBKR traen el CUSIP directamente en Symbol (p.ej. "912797LL9"),
        // no un ticker de acción. No tiene sentido rastrearlos como una posición abierta con
        // cantidad de "acciones": el vencimiento (Bond Maturity) no llega como "Sell" así que la
        // posición nunca se cerraría sola y se quedaría fantasma en Cartera para siempre. En vez
        // de intentar reconstruir compra/venta con cantidades de valor nominal, se tratan la
        // compra y el vencimiento como simples movimientos de caja ("Otro") -- el importe de cada
        // fila ya entra en el efectivo total, así que la diferencia entre lo pagado al comprar y
        // lo cobrado al vencer sigue reflejando la rentabilidad real del bono, sin necesidad de
        // mostrarlo como posición.
        var tickerVal = idx.ticker >= 0 ? r[idx.ticker] : "";
        if ((type === "compra" || type === "venta") && /^[0-9A-Z]{9}$/.test((tickerVal || "").trim().toUpperCase())) {
          type = "otro";
        }
      } else {
        type = normalizeType(rawType);
        if (type === "otro" && qty != null && price != null) {
          // si no reconocemos el texto pero hay cantidad+precio, lo tratamos como compra/venta según el signo del importe
          type = (amount != null && amount < 0) ? "compra" : "venta";
        }
      }

      // Toda la app asume que "price" viene en EUR (no hay conversión de divisa al importar
      // operaciones, a diferencia de las cotizaciones en vivo de Posiciones). Brokers como IBKR
      // reportan el precio de la operación en la divisa del activo (p.ej. USD) mientras que el
      // importe bruto liquidado (columna "amount" = Gross Amount) suele venir en la divisa base
      // de la cuenta. Si hay divisa distinta de EUR, reconstruimos un precio "equivalente en EUR"
      // a partir de ese importe bruto en vez de usar el precio en divisa extranjera tal cual --
      // si no, el coste de la posición (cantidad×precio+comisión) queda inflado o desinflado por
      // el tipo de cambio de forma silenciosa. Como "amount" ya es el bruto (sin comisión), no
      // hace falta sumar/restar fee aquí -- eso ya lo hace aparte quien use el precio (p.ej.
      // computeHoldings con qty*price+fee).
      var fxNote = null;
      // Exige que parezca un código ISO 4217 real (3 letras) -- IBKR rellena esta columna con
      // "-" en filas sin precio (dividendos, retenciones, ajustes), y ese guion no debe leerse
      // como "divisa desconocida distinta de EUR" y disparar un aviso de conversión sin sentido.
      var isForeignCurrency = /^[A-Z]{3}$/.test(rawCurrency) && rawCurrency !== "EUR";
      // Solo importa la divisa para compra/venta -- es el único caso donde "price" se usa para
      // calcular coste de posición (qty*price+fee). Para el resto de tipos (dividendo, comisión,
      // ingreso/retirada, y filas "Otro" como los asientos internos de conversión de divisa que
      // genera IBKR con ticker tipo "EUR.GBP") el precio no entra en ningún cálculo, así que
      // avisar de que "no se pudo convertir" ahí sería ruido sin nada que corregir.
      if (isForeignCurrency && (type === "compra" || type === "venta")) {
        if (qty != null && qty !== 0 && amount != null) {
          var impliedGross = Math.abs(amount);
          if (impliedGross > 0) {
            if (price != null) fxNote = "orig. " + price + " " + rawCurrency;
            price = impliedGross / Math.abs(qty);
          }
        } else {
          fxNote = "⚠ divisa " + rawCurrency + ", no se pudo convertir a EUR automáticamente (falta importe o cantidad) -- revisa el precio a mano";
        }
      }

      // Traspasos internos de custodia de Trade Republic (type=MIGRATION, ver
      // classifyTypeTradeRepublic más arriba) llegan SIEMPRE en pares -- una fila con acciones
      // negativas (sale de la custodia vieja) y otra positiva (entra en la nueva), mismo activo,
      // misma cantidad, mismo precio, sin importe -- y las dos legs pasan a tener cantidad
      // POSITIVA tras el Math.abs() de más abajo. Si se importan, computeGroupReturn (desglose de
      // rentabilidad por sub-cuenta) no puede distinguirlas de un traspaso en especie genuino
      // (p.ej. un dividendo pagado en acciones) y las cuenta las DOS como entrada de valor nuevo,
      // duplicando cantidad y "disponible" del activo migrado en ese desglose (aunque no afecta a
      // Posiciones ni al total, que solo miran compra/venta). Como no mueven caja ni cambian la
      // posición real, no aportan nada al importar -- se excluyen aquí, no solo se dejan
      // desmarcadas, para que no haya que acordarse de destildarlas a mano en cada importación.
      var isMigration = isTR && /^MIGRATION$/i.test((rawType || "").trim());

      // Sub-cuenta sugerida a partir de asset_class (columna propia del CSV de Trade Republic,
      // hasta ahora solo se usaba para detectar el formato) -- se usa más abajo, al confirmar la
      // importación, para etiquetar automáticamente los activos NUEVOS con la sub-cuenta que les
      // corresponde (prices.sub_account), sin tocar ningún activo que ya tenga una asignada a
      // mano. No es información propia de una operación -- viaja aparte de "type" y no se guarda
      // en la tabla "transactions".
      var rawAssetClass = assetClassIdx >= 0 ? (r[assetClassIdx] || "").trim().toUpperCase() : "";
      var subAccountGuess = (rawAssetClass === "STOCK" || rawAssetClass === "FUND") ? "Cuenta de valores"
        : rawAssetClass === "CRYPTO" ? "Wallet Cripto" : null;

      return {
        include: !!normDate && !isMigration,
        broker: broker,
        date: normDate,
        type: type,
        name: idx.name >= 0 ? r[idx.name] : (idx.ticker >= 0 ? r[idx.ticker] : ""),
        ticker: idx.ticker >= 0 ? r[idx.ticker] : "",
        asset_type: "Otro",
        quantity: qty != null ? Math.abs(qty) : null,
        price: price != null ? Math.abs(price) : null,
        fee: fee,
        amount: amount,
        currency: "EUR",
        fxNote: fxNote,
        subAccountGuess: subAccountGuess,
        source: "import"
      };
    });

    renderCsvPreview(parsed);
  });

  // preferMonthFirst: en el caso genuinamente ambiguo (separador+año de 4 cifras con los dos
  // números ≤12) desempata a mes-primero en vez de día-primero -- pásalo a true cuando ya se
  // sabe que el CSV entero es de IBKR (confirmado mes-primero con datos reales, ver comentario
  // más abajo), para no dar por buena la asunción día-primero (pensada para brokers europeos)
  // en una fecha de IBKR solo porque esa fila en concreto no tenía ningún número >12 que la
  // desambiguara sin ambigüedad.
  function normalizeDate(raw, preferMonthFirst) {
    if (!raw) return "";
    raw = raw.trim();
    var m;
    if ((m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + "-" + m[2] + "-" + m[3];
    // Guion con año de 2 cifras (MM-DD-YY) -- IBKR mezcla este formato en la MISMA columna
    // "Date" con otros de 4 cifras, según de qué sección interna de su export combinado venga
    // cada fila (Corporate Actions, Interest...). Confirmado con datos reales: el vencimiento
    // de un mismo T-Bill aparece como "09-18-24" en una fila y "09/18/2024" en otra del mismo
    // CSV -- las dos son el 18 de septiembre, así que este formato de 2 cifras es mes-día-año,
    // no día-mes-año. Antes esto cala al parser nativo de Date(), que además de no reconocer
    // bien el formato, con string sin hora aplica la zona horaria local antes de convertir a
    // ISO -- desplazando la fecha un día en cualquier huso horario negativo respecto a UTC.
    if ((m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/))) {
      var mm2 = parseInt(m[1], 10), dd2 = parseInt(m[2], 10);
      if (mm2 >= 1 && mm2 <= 12 && dd2 >= 1 && dd2 <= 31) return "20" + m[3] + "-" + pad2(m[1]) + "-" + pad2(m[2]);
    }
    // Barra, punto o guion con año de 4 cifras -- día-mes-año (brokers europeos, p.ej.
    // "15-01-2026") y mes-día-año (IBKR con barras, p.ej. "09/18/2024") conviven según el
    // bróker, incluso según la sección del mismo CSV. Si uno de los dos números no puede ser
    // un mes (>12) no hay ambigüedad real -- ese es el día seguro; solo cuando los dos son ≤12
    // (caso genuinamente ambiguo) se mantiene la asunción día-primero ya probada, para no
    // romper el comportamiento donde ya funcionaba.
    if ((m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) {
      var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
      if (x > 12 && y <= 12) return m[3] + "-" + pad2(y) + "-" + pad2(x); // x solo puede ser día
      if (y > 12 && x <= 12) return m[3] + "-" + pad2(x) + "-" + pad2(y); // y solo puede ser día
      // Ambiguo de verdad (los dos ≤12): mes-primero si ya sabemos que es un CSV de IBKR,
      // si no, la asunción día-primero de siempre.
      return preferMonthFirst ? m[3] + "-" + pad2(x) + "-" + pad2(y) : m[3] + "-" + pad2(y) + "-" + pad2(x);
    }
    // YYYYMMDD sin separadores -- formato de fecha por defecto en muchas Flex Query de IBKR si
    // no se elige explícitamente uno con guiones/barras. Date() nativo no lo reconoce (da
    // Invalid Date), así que sin esto esas filas se descartarían todas silenciosamente.
    if ((m = raw.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + "-" + m[2] + "-" + m[3];
    var d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  }
  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }

  var pendingImportRows = [];
  var csvPreviewPage = 0;
  var CSV_PAGE_SIZE = 50;

  // Antes se recortaba la vista previa a las primeras 200 filas ("mostrando las primeras
  // 200") pero se importaban TODAS igualmente -- con un CSV de varios años (habitual en
  // Trade Republic/IBKR) eso significaba confirmar cientos de filas sin haberlas visto ni
  // podido corregir. Ahora se pagina: todas las filas quedan revisables, solo cambia cuántas
  // se pintan en el DOM a la vez.
  function renderCsvPreview(parsed) {
    pendingImportRows = parsed;
    csvPreviewPage = 0;
    renderCsvPreviewPage();
    document.getElementById("csv-preview-wrap").style.display = "block";
  }

  function renderCsvPreviewPage() {
    var body = document.getElementById("csv-preview-body");
    var total = pendingImportRows.length;
    var totalPages = Math.max(1, Math.ceil(total / CSV_PAGE_SIZE));
    if (csvPreviewPage >= totalPages) csvPreviewPage = totalPages - 1;
    if (csvPreviewPage < 0) csvPreviewPage = 0;
    var start = csvPreviewPage * CSV_PAGE_SIZE;
    var end = Math.min(total, start + CSV_PAGE_SIZE);

    document.getElementById("csv-preview-count").textContent =
      total + " filas detectadas · mostrando " + (total ? (start + 1) : 0) + "–" + end + " de " + total +
      ". Revisa el tipo de cada fila y desmarca las que no quieras importar.";

    body.innerHTML = pendingImportRows.slice(start, end).map(function (row, iRel) {
      var i = start + iRel;
      var typeOptions = Object.keys(TYPE_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (k === row.type ? " selected" : "") + '>' + TYPE_LABELS[k] + "</option>";
      }).join("");
      return "<tr data-row-index=\"" + i + "\">" +
        '<td><input type="checkbox" data-row-include ' + (row.include ? "checked" : "") + "></td>" +
        '<td class="mono">' + (row.date || '<span class="no-price">fecha inválida</span>') + "</td>" +
        '<td><select class="type-select" data-row-type>' + typeOptions + "</select></td>" +
        "<td>" + escapeHtml(row.name || "—") + "</td>" +
        "<td>" + escapeHtml(row.ticker || "—") + "</td>" +
        '<td class="right mono">' + (row.quantity != null ? row.quantity : "—") + "</td>" +
        '<td class="right mono">' + (row.price != null ? row.price : "—") +
          (row.fxNote ? '<br><small class="no-price">' + escapeHtml(row.fxNote) + "</small>" : "") + "</td>" +
        '<td class="right mono">' + row.fee + "</td>" +
        '<td class="right mono">' + (row.amount != null ? row.amount : "—") + "</td>" +
        "</tr>";
    }).join("");

    body.querySelectorAll("tr").forEach(function (tr) {
      var i = parseInt(tr.getAttribute("data-row-index"), 10);
      tr.querySelector("[data-row-include]").addEventListener("change", function () { pendingImportRows[i].include = this.checked; });
      tr.querySelector("[data-row-type]").addEventListener("change", function () { pendingImportRows[i].type = this.value; });
    });

    renderCsvPreviewPagination(totalPages);
  }

  function renderCsvPreviewPagination(totalPages) {
    var el = document.getElementById("csv-preview-pagination");
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    el.innerHTML =
      '<button type="button" class="btn" id="csv-preview-prev"' + (csvPreviewPage === 0 ? " disabled" : "") + '>‹ Anterior</button>' +
      '<span class="csv-preview-page-info">Página ' + (csvPreviewPage + 1) + " de " + totalPages + "</span>" +
      '<button type="button" class="btn" id="csv-preview-next"' + (csvPreviewPage >= totalPages - 1 ? " disabled" : "") + ">Siguiente ›</button>";
    var prevBtn = document.getElementById("csv-preview-prev");
    var nextBtn = document.getElementById("csv-preview-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { csvPreviewPage--; renderCsvPreviewPage(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { csvPreviewPage++; renderCsvPreviewPage(); });
  }

  document.getElementById("btn-confirm-import").addEventListener("click", function () {
    var included = pendingImportRows.filter(function (r) { return r.include && r.date; });
    if (included.length === 0) { alert("No hay filas seleccionadas para importar."); return; }

    // Auto-siembra una fila en "prices" para los activos NUEVOS de CUALQUIER bróker que todavía
    // no tengan ninguna -- sin esto, computeGroupReturn/computeBrokerTotalReturn (rentabilidad
    // por sub-cuenta o "Total" de Cartera > Resumen) no encuentran precio para valorar una
    // posición todavía abierta y la cuentan como 0€ de valor actual (con su coste ya restando en
    // "capital"), hundiendo el % de forma silenciosa -- se detectó importando Interactive
    // Brokers, que no trae ningún dato de clase de activo con el que adivinar sub-cuenta y por
    // tanto se quedaba sin ninguna fila en "prices" en absoluto. El precio inicial que se guarda
    // es el de la operación de compra/venta más reciente del propio CSV -- el mismo valor que ya
    // se usaría como fallback (avgPrice) en Posiciones si no se creara esta fila, así que no
    // inventa nada nuevo, solo lo deja explícito (y editable/reemplazable por una fuente real
    // desde Posiciones). Solo para activos que todavía no tienen ninguna fila en "prices": si ya
    // existe una, puede traer un precio o una sub-cuenta puestos a mano y no hay que pisarlos.
    // La sub-cuenta (ver subAccountGuess) solo se rellena cuando el CSV la trae (hoy, solo Trade
    // Republic vía su columna asset_class) -- para el resto queda sin asignar, como ya pasaba
    // antes de este cambio. Tiene que calcularse ANTES de despojar subAccountGuess de las filas
    // (más abajo, al construir "toImport"), o ya no quedaría de dónde leerlo.
    var existingKeys = {};
    PRICES.forEach(function (p) { existingKeys[p.asset_key] = true; });
    var newAssetPrices = {};
    included.forEach(function (r) {
      if ((r.type !== "compra" && r.type !== "venta") || r.price == null) return;
      var key = assetKey(r);
      if (existingKeys[key]) return;
      if (!newAssetPrices[key] || r.date > newAssetPrices[key].date) {
        newAssetPrices[key] = { date: r.date, asset_key: key, broker: r.broker, ticker: r.ticker, name: r.name, price: r.price, sub_account: r.subAccountGuess || null };
      }
    });

    var toImport = included.map(function (r) {
      var copy = Object.assign({}, r);
      delete copy.include;
      delete copy.subAccountGuess;
      return copy;
    });

    Promise.all(Object.keys(newAssetPrices).map(function (k) {
      return api("/api/prices", { method: "POST", body: JSON.stringify(newAssetPrices[k]) });
    }))
      .then(function () { return api("/api/transactions/bulk", { method: "POST", body: JSON.stringify(toImport) }); })
      .then(function (res) {
        alert("Importadas " + res.inserted + " operaciones" + (res.skipped ? " (" + res.skipped + " con errores)" : "") + ".");
        pendingImportRows = [];
        document.getElementById("csv-preview-wrap").style.display = "none";
        document.getElementById("csv-mapping").style.display = "none";
        document.getElementById("csv-format-row").style.display = "none";
        document.getElementById("csv-file").value = "";
        closeAllFlyouts();
        return loadAll();
      })
      .then(function () { activateTab("operations"); })
      .catch(function (err) { alert("Error al importar: " + err.message); });
  });

  /* ---------------- 34. Importador de CSV para Economía doméstica ---------------- */
  // Reutiliza detectDelimiter/parseCSV/parseNumber/normalizeDate/pad2 tal cual (son genéricos,
  // no atados al importador de Cartera) -- solo se define un mapeo de campos y una detección de
  // formato propios, porque los campos de un movimiento bancario (fecha/importe/categoría/nota)
  // no tienen nada que ver con los de una operación de bróker (cantidad/precio/ticker...).
  var householdCsvRows = null;
  var householdCsvHeaders = [];
  var householdCsvDelimiter = ",";
  var householdCsvDecimal = ".";

  // Compara cabeceras sin acentos -- "CATEGORÍA"/"DESCRIPCIÓN" no coincidirían nunca con
  // "categoria"/"descripcion" en una comparación literal, y a diferencia del importador de
  // Cartera (donde las cabeceras de Trade Republic/IBKR ya vienen en inglés sin tildes) aquí sí
  // hace falta at para que la detección de ING funcione con su cabecera real en español.
  var DIACRITIC_MARKS_RE = new RegExp("[\\u0300-\\u036f]", "g");
  function normalizeHeaderForMatch(h) {
    return String(h || "").normalize("NFD").replace(DIACRITIC_MARKS_RE, "").toLowerCase().trim();
  }

  var HOUSEHOLD_FIELD_DEFS = [
    { key: "date", label: "Fecha", required: true, exact: ["fecha", "date", "f. valor", "f valor"], pattern: /fecha|date|f\.?\s*valor/i },
    { key: "amount", label: "Importe (con signo: negativo = gasto, positivo = ingreso)", required: true, exact: ["importe", "importe (€)", "amount"], pattern: /importe|amount/i },
    // El patrón de categoría se ancla al principio ("^categor") para no confundirse con
    // "subcategoria" en la pasada de coincidencia difusa -- la coincidencia EXACTA ya los
    // distingue bien (son cadenas distintas), pero el patrón de reserva sin anclar los
    // habría emparejado indistintamente con cualquiera de las dos columnas.
    { key: "category", label: "Categoría", required: false, exact: ["categoria"], pattern: /^categor/i },
    { key: "subcategory", label: "Subcategoría", required: false, exact: ["subcategoria"], pattern: /subcategor/i },
    { key: "notes", label: "Descripción / concepto (notas)", required: false, exact: ["descripcion", "concepto", "comentario"], pattern: /descripci|concepto|comentario|detalle/i }
  ];

  // Huella de columnas de la exportación de movimientos de ING (Movimientos -> Exportar),
  // comprobada con un CSV real: "F. VALOR,CATEGORÍA,SUBCATEGORÍA,DESCRIPCIÓN,COMENTARIO,
  // IMPORTE (€),SALDO (€)", delimitador coma, decimales con coma entre comillas (para no
  // confundirse con el propio delimitador), sin columna de tipo -- el signo del importe es lo
  // único que distingue ingreso de gasto. Igual que con Trade Republic, ING no publica la lista
  // completa de categorías posibles: se preasocian las columnas pero se pide revisar la vista
  // previa igualmente.
  var ING_FINGERPRINT = ["categoria", "subcategoria", "descripcion", "comentario", "saldo"];
  function looksLikeING(headers) {
    var norm = headers.map(normalizeHeaderForMatch);
    var hits = ING_FINGERPRINT.filter(function (f) { return norm.some(function (h) { return h.indexOf(f) >= 0; }); }).length;
    return hits >= 3;
  }

  /* ---------------- 35. Autodetección de "Aportación de tercero" al importar CSV ---------------- */
  // Margen de coincidencia por importe -- 5%, no exacto, porque la misma persona a veces varía un
  // poco el importe mes a mes (redondeo, pequeño ajuste). Solo se compara contra aportaciones YA
  // EXISTENTES de la MISMA cuenta -- no tiene sentido comparar aportaciones entre cuentas distintas.
  var APORTACION_MATCH_AMOUNT_MARGIN = 0.05;
  // Umbral de solape de palabras "significativas" (longitud >= 3, no puramente numéricas -- para
  // ignorar referencias/números de operación que cambian cada mes) entre dos descripciones. 0.5 =
  // al menos la mitad de las palabras significativas de una están también en la otra.
  var APORTACION_MATCH_DESC_THRESHOLD = 0.5;

  function significantWords(text) {
    return normalizeHeaderForMatch(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(function (w) { return w.length >= 3 && !/^\d+$/.test(w); });
  }
  function descriptionSimilarity(a, b) {
    var wordsA = significantWords(a), wordsB = significantWords(b);
    if (!wordsA.length || !wordsB.length) return 0;
    var setB = {};
    wordsB.forEach(function (w) { setB[w] = true; });
    var common = wordsA.filter(function (w) { return setB[w]; }).length;
    return common / Math.max(wordsA.length, wordsB.length);
  }

  // Busca si una fila candidata del CSV (positiva, futura "ingreso") se parece a una "Aportación
  // de tercero" ya registrada en la MISMA cuenta -- por importe (±5%) O por descripción parecida
  // (criterio combinado elegido para no dejar pasar coincidencias reales: como esto solo
  // preselecciona en la vista previa y nunca se guarda sin que el usuario confirme, un falso
  // positivo ocasional solo cuesta desmarcarlo a mano). Devuelve la mejor coincidencia (o null)
  // para poder explicar el motivo en la vista previa.
  function findAportacionTerceroMatch(row, accountId) {
    var candidates = HOUSEHOLD.filter(function (h) {
      return h.type === "aportacion_tercero" && (h.account_id || null) === (accountId || null);
    });
    var rowAmt = Number(row.amount) || 0;
    var best = null;
    candidates.forEach(function (h) {
      var pastAmt = Number(h.amount) || 0;
      var amountClose = pastAmt > 0 && Math.abs(rowAmt - pastAmt) <= pastAmt * APORTACION_MATCH_AMOUNT_MARGIN;
      var descSim = descriptionSimilarity(row.notes, h.notes);
      var descClose = descSim >= APORTACION_MATCH_DESC_THRESHOLD;
      if (!amountClose && !descClose) return;
      var score = (amountClose ? 1 : 0) + descSim;
      if (!best || score > best.score) best = { amountClose: amountClose, descClose: descClose, score: score };
    });
    return best;
  }

  /* ---------------- 36. Reglas de categorización automática (Economía) ---------------- */
  function escapeRegExpChars(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  var CATEGORY_RULE_MATCH_LABELS = {
    contains: "contiene", not_contains: "no contiene", word: "es exactamente la palabra",
    starts_with: "empieza por", ends_with: "termina por"
  };

  // El campo "keyword" admite varias palabras/frases separadas por comas (sinónimos, p.ej.
  // "Mercadona, Carrefour, Lidl"); se tratan con "cualquiera de ellas cuenta" en los modos
  // positivos. Ya normalizado (sin acentos, minúsculas) para comparar directo contra el texto
  // ya normalizado de la descripción.
  function ruleSynonyms(rule) {
    return String(rule.keyword || "").split(",")
      .map(function (k) { return normalizeHeaderForMatch(k.trim()); })
      .filter(Boolean);
  }

  // Coincidencia de UNA palabra/frase suelta contra el texto ya normalizado, según el modo:
  // "contains" = subcadena en cualquier punto ("DIGI" también encontraría "DIGITAL").
  // "word" = solo como palabra/frase completa (límite de palabra a los dos lados).
  // "starts_with"/"ends_with" = al principio/final exacto de la descripción.
  function singleTermMatches(text, needle, mode) {
    if (!needle) return false;
    if (mode === "word") return new RegExp("\\b" + escapeRegExpChars(needle) + "\\b", "i").test(text);
    if (mode === "starts_with") return text.indexOf(needle) === 0;
    if (mode === "ends_with") return text.length >= needle.length && text.slice(text.length - needle.length) === needle;
    return text.indexOf(needle) >= 0;
  }

  // "not_contains" es el único modo NEGATIVO: la regla aplica si NINGUNA de las palabras de la
  // lista aparece en la descripción (útil como respaldo genérico, p.ej. "si no menciona
  // ninguna de mis suscripciones conocidas -> Varios"). El resto de modos son positivos: aplica
  // si CUALQUIERA de las palabras coincide (OR).
  function ruleMatchesText(text, rule) {
    var words = ruleSynonyms(rule);
    if (!words.length) return false;
    var mode = rule.match_type || "contains";
    if (mode === "not_contains") return words.every(function (w) { return text.indexOf(w) < 0; });
    return words.some(function (w) { return singleTermMatches(text, w, mode); });
  }

  // Coincidencia entre las reglas y las notas de una operación. Reglas positivas (cualquier modo
  // salvo "no contiene") siempre ganan a las negativas -- una regla "no contiene" es un respaldo
  // genérico que solo debe aplicar cuando ninguna regla positiva encaja, nunca competir con ellas
  // por especificidad. Dentro de cada grupo, gana la palabra coincidente más larga (más
  // específica); un empate exacto no se autoasigna solo -- se devuelve como "ambiguous" para que
  // quien llama lo marque a revisar en vez de decidir a ciegas. Nunca escribe nada por sí sola,
  // solo calcula qué aplicaría.
  function findCategoryRuleMatch(notes, rules) {
    var text = normalizeHeaderForMatch(notes || "");
    if (!text) return null;
    var hits = (rules || []).filter(function (r) { return r.keyword && ruleMatchesText(text, r); });
    if (!hits.length) return null;

    var positive = hits.filter(function (r) { return (r.match_type || "contains") !== "not_contains"; });
    var pool = positive.length ? positive : hits;

    var scored = pool.map(function (r) {
      if ((r.match_type || "contains") === "not_contains") return { rule: r, len: 0 };
      var matchedLens = ruleSynonyms(r).filter(function (w) { return singleTermMatches(text, w, r.match_type || "contains"); })
        .map(function (w) { return w.length; });
      return { rule: r, len: matchedLens.length ? Math.max.apply(null, matchedLens) : 0 };
    });
    var maxLen = Math.max.apply(null, scored.map(function (s) { return s.len; }));
    var best = scored.filter(function (s) { return s.len === maxLen; }).map(function (s) { return s.rule; });
    return best.length === 1 ? { rule: best[0], ambiguous: null } : { rule: null, ambiguous: best };
  }

  document.getElementById("household-csv-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    document.getElementById("household-csv-file-name").textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (evt) {
      var text = evt.target.result;
      householdCsvDelimiter = detectDelimiter(text);
      householdCsvRows = parseCSV(text, householdCsvDelimiter);
      householdCsvHeaders = (householdCsvRows[0] || []).map(function (h) { return h.trim(); });
      // ING usa coma como delimitador Y como separador decimal a la vez (los importes van
      // entre comillas para no confundirse) -- la heurística genérica de "coma delimitador
      // => punto decimal" no vale aquí, así que con ING detectado se fuerza coma decimal.
      householdCsvDecimal = looksLikeING(householdCsvHeaders) ? "," : (householdCsvDelimiter === ";" ? "," : ".");

      document.getElementById("household-csv-delimiter").value = householdCsvDelimiter;
      document.getElementById("household-csv-decimal").value = householdCsvDecimal;
      document.getElementById("household-csv-format-row").style.display = "grid";

      buildHouseholdMappingUI();
      document.getElementById("household-csv-mapping").style.display = "block";
      document.getElementById("household-csv-preview-wrap").style.display = "none";
    };
    reader.readAsText(file, "UTF-8");
  });

  document.getElementById("household-csv-delimiter").addEventListener("change", function () {
    var file = document.getElementById("household-csv-file").files[0];
    if (!file) return;
    householdCsvDelimiter = this.value;
    var reader = new FileReader();
    reader.onload = function (evt) {
      householdCsvRows = parseCSV(evt.target.result, householdCsvDelimiter);
      householdCsvHeaders = (householdCsvRows[0] || []).map(function (h) { return h.trim(); });
      buildHouseholdMappingUI();
    };
    reader.readAsText(file, "UTF-8");
  });
  document.getElementById("household-csv-decimal").addEventListener("change", function () { householdCsvDecimal = this.value; });

  /* ---------------- 37. Importador de CSV para Economía doméstica: mapeo y vista previa ---------------- */
  // Continuación del importador de arriba -- separado de él por la sección de Reglas de
  // categorización porque la vista previa llama a findCategoryRuleMatch() para preseleccionar
  // categoría/subcategoría fila a fila.
  function buildHouseholdMappingUI() {
    var used = {};
    var isING = looksLikeING(householdCsvHeaders);

    var guesses = {};
    HOUSEHOLD_FIELD_DEFS.forEach(function (fd) {
      for (var i = 0; i < householdCsvHeaders.length; i++) {
        var h = householdCsvHeaders[i];
        if (used[h]) continue;
        if (fd.exact.indexOf(normalizeHeaderForMatch(h)) >= 0) { guesses[fd.key] = h; used[h] = true; break; }
      }
    });
    HOUSEHOLD_FIELD_DEFS.forEach(function (fd) {
      if (guesses[fd.key]) return;
      for (var i = 0; i < householdCsvHeaders.length; i++) {
        var h = householdCsvHeaders[i];
        if (used[h]) continue;
        if (fd.pattern.test(h)) { guesses[fd.key] = h; used[h] = true; break; }
      }
    });

    var grid = document.getElementById("household-mapping-grid");
    grid.innerHTML = HOUSEHOLD_FIELD_DEFS.map(function (fd) {
      var guess = guesses[fd.key] || "";
      var options = '<option value="">— no usar —</option>' + householdCsvHeaders.map(function (h) {
        return '<option value="' + escapeHtml(h) + '"' + (h === guess ? " selected" : "") + '>' + escapeHtml(h) + "</option>";
      }).join("");
      return '<div class="field"><label>' + fd.label + (fd.required ? ' <small>(obligatorio)</small>' : '') + '</label><select data-hfield="' + fd.key + '">' + options + '</select></div>';
    }).join("");

    document.getElementById("household-csv-bank-detected").style.display = isING ? "block" : "none";
  }

  document.getElementById("household-btn-preview-csv").addEventListener("click", function () {
    if (!householdCsvRows || householdCsvRows.length < 2) { alert("Sube primero un CSV con al menos una fila de datos."); return; }
    var mapping = {};
    document.querySelectorAll("#household-mapping-grid select").forEach(function (sel) { mapping[sel.getAttribute("data-hfield")] = sel.value; });
    if (!mapping.date || !mapping.amount) { alert("Debes asociar al menos las columnas de Fecha e Importe."); return; }

    var idx = {};
    Object.keys(mapping).forEach(function (k) { idx[k] = mapping[k] ? householdCsvHeaders.indexOf(mapping[k]) : -1; });

    var dataRows = householdCsvRows.slice(1).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });

    // La cuenta elegida se aplica a TODAS las filas del lote -- cada extracto bancario que se
    // importa aquí pertenece a una sola cuenta (Domiciliaciones/Conjunta/Nómina...), así que
    // etiquetarlas ya en la importación evita tener que reasignarlas luego a mano en bloque
    // desde "Todas las operaciones".
    var csvAccountId = (document.getElementById("household-csv-account") || {}).value || null;

    var parsed = dataRows.map(function (r) {
      var normDate = normalizeDate(idx.date >= 0 ? r[idx.date] : "");
      var amount = idx.amount >= 0 ? parseNumber(r[idx.amount], householdCsvDecimal) : null;
      var type = (amount != null && amount < 0) ? "gasto" : "ingreso";
      var notes = idx.notes >= 0 ? ((r[idx.notes] || "").trim() || null) : null;
      // Preselecciona el tipo en la vista previa según lo que ya hay guardado en Economía --
      // nunca se guarda nada sin que el usuario confirme (ver punto 4). Solo aplica a filas
      // positivas (candidatas a ingreso); un gasto (importe negativo) no se toca. Orden de
      // prioridad: 1) "Aportación de tercero" (más específico); 2) si la cuenta no genera
      // ingresos propios (ver accountIsIncomeSource, "⚙ Cuentas"), "Transferencia interna" por
      // defecto -- p.ej. Domiciliaciones/Conjunta, que solo reciben traspasos desde Nómina.
      var autodetected = null;
      if (amount != null && type === "ingreso") {
        var aportacionMatch = findAportacionTerceroMatch({ amount: Math.abs(amount), notes: notes }, csvAccountId);
        if (aportacionMatch) {
          type = "aportacion_tercero";
          var reasonParts = [];
          if (aportacionMatch.amountClose) reasonParts.push("importe parecido");
          if (aportacionMatch.descClose) reasonParts.push("descripción parecida");
          autodetected = { kind: "aportacion_tercero", reasonParts: reasonParts };
        } else if (!accountIsIncomeSource(csvAccountId)) {
          type = "transferencia";
          autodetected = { kind: "transferencia", reasonParts: ["esta cuenta no genera ingresos propios (configurado en ⚙ Cuentas)"] };
        }
      }
      var category = idx.category >= 0 ? ((r[idx.category] || "").trim() || "Sin categoría") : "Sin categoría";
      var subcategory = idx.subcategory >= 0 ? ((r[idx.subcategory] || "").trim() || null) : null;
      // Regla de categorización que coincida con la descripción -- preselecciona (y pisa lo que
      // trajera el propio CSV/banco) porque sigue siendo solo una preselección editable en la
      // vista previa de abajo, nunca se guarda sin confirmar. Un empate entre dos reglas
      // igual de específicas no se autoasigna: se deja lo que traía el CSV y se avisa con badge.
      var categoryRuleMatch = findCategoryRuleMatch(notes, CATEGORY_RULES);
      if (categoryRuleMatch && categoryRuleMatch.rule) {
        category = categoryRuleMatch.rule.category;
        subcategory = categoryRuleMatch.rule.subcategory || null;
      }
      return {
        include: !!normDate && amount != null,
        type: type,
        autodetected: autodetected,
        categoryRuleMatch: categoryRuleMatch,
        category: category,
        subcategory: subcategory,
        amount: amount != null ? Math.abs(amount) : null,
        date: normDate,
        recurring: 0,
        notes: notes,
        account_id: csvAccountId
      };
    });

    renderHouseholdCsvPreview(parsed);
  });

  var pendingHouseholdImportRows = [];
  var householdCsvPreviewPage = 0;

  function renderHouseholdCsvPreview(parsed) {
    pendingHouseholdImportRows = parsed;
    householdCsvPreviewPage = 0;
    renderHouseholdCsvPreviewPage();
    document.getElementById("household-csv-preview-wrap").style.display = "block";
  }

  function renderHouseholdCsvPreviewPage() {
    var body = document.getElementById("household-csv-preview-body");
    var total = pendingHouseholdImportRows.length;
    var totalPages = Math.max(1, Math.ceil(total / CSV_PAGE_SIZE));
    if (householdCsvPreviewPage >= totalPages) householdCsvPreviewPage = totalPages - 1;
    if (householdCsvPreviewPage < 0) householdCsvPreviewPage = 0;
    var start = householdCsvPreviewPage * CSV_PAGE_SIZE;
    var end = Math.min(total, start + CSV_PAGE_SIZE);

    var accountNote = total ? " · cuenta: " + accountNameFor(pendingHouseholdImportRows[0].account_id) : "";
    document.getElementById("household-csv-preview-count").textContent =
      total + " filas detectadas · mostrando " + (total ? (start + 1) : 0) + "–" + end + " de " + total + accountNote +
      ". Revisa el tipo de cada fila (ingreso/gasto) y desmarca las que no quieras importar.";

    body.innerHTML = pendingHouseholdImportRows.slice(start, end).map(function (row, iRel) {
      var i = start + iRel;
      var m = row.autodetected;
      var badgeHtml = "";
      if (m) {
        var label = m.kind === "transferencia" ? "Transferencia interna" : "Aportación de tercero";
        badgeHtml = '<span class="csv-autodetect-badge" title="' + escapeHtml(label) + ' autodetectada: ' +
          escapeHtml(m.reasonParts.join(" y ")) + '.">◆ autodetectado</span>';
      }
      var catMatch = row.categoryRuleMatch;
      var catBadgeHtml = "";
      if (catMatch && catMatch.rule) {
        var matchLabel = CATEGORY_RULE_MATCH_LABELS[catMatch.rule.match_type || "contains"] || "contiene";
        catBadgeHtml = '<span class="csv-autodetect-badge" title="Regla: ' + escapeHtml(matchLabel) + ' &quot;' + escapeHtml(catMatch.rule.keyword) +
          '&quot; → ' + escapeHtml(catMatch.rule.category) + (catMatch.rule.subcategory ? " / " + escapeHtml(catMatch.rule.subcategory) : "") +
          '.">◆ por regla</span>';
      } else if (catMatch && catMatch.ambiguous) {
        var candidateLabels = catMatch.ambiguous.map(function (r) { return r.category + (r.subcategory ? " / " + r.subcategory : ""); });
        catBadgeHtml = '<span class="csv-autodetect-badge" title="' + catMatch.ambiguous.length + ' reglas coinciden a la vez, elige tú: ' +
          escapeHtml(candidateLabels.join(" · ")) + '.">⚠ revisar</span>';
      }
      return "<tr data-hrow-index=\"" + i + "\"" + (m ? ' class="csv-row-autodetected"' : "") + ">" +
        '<td><input type="checkbox" data-hrow-include ' + (row.include ? "checked" : "") + "></td>" +
        '<td class="mono">' + (row.date || '<span class="no-price">fecha inválida</span>') + "</td>" +
        '<td><select class="type-select" data-hrow-type>' +
          '<option value="gasto"' + (row.type === "gasto" ? " selected" : "") + '>Gasto</option>' +
          '<option value="ingreso"' + (row.type === "ingreso" ? " selected" : "") + '>Ingreso</option>' +
          '<option value="transferencia"' + (row.type === "transferencia" ? " selected" : "") + '>Transferencia interna</option>' +
          '<option value="aportacion_tercero"' + (row.type === "aportacion_tercero" ? " selected" : "") + '>Aportación de tercero</option>' +
        "</select>" + badgeHtml + "</td>" +
        '<td><input type="text" class="recat-input" list="household-category-suggestions" value="' + escapeHtml(row.category || "") + '" data-hrow-category>' + catBadgeHtml + "</td>" +
        '<td><input type="text" class="recat-input" list="household-subcategory-suggestions" value="' + escapeHtml(row.subcategory || "") + '" data-hrow-subcategory></td>' +
        '<td class="right mono">' + (row.amount != null ? fmtEUR.format(row.amount) : "—") + "</td>" +
        "<td>" + escapeHtml(row.notes || "—") + "</td>" +
        "</tr>";
    }).join("");

    body.querySelectorAll("tr").forEach(function (tr) {
      var i = parseInt(tr.getAttribute("data-hrow-index"), 10);
      tr.querySelector("[data-hrow-include]").addEventListener("change", function () { pendingHouseholdImportRows[i].include = this.checked; });
      tr.querySelector("[data-hrow-type]").addEventListener("change", function () { pendingHouseholdImportRows[i].type = this.value; });
      tr.querySelector("[data-hrow-category]").addEventListener("change", function () { pendingHouseholdImportRows[i].category = this.value.trim() || "Sin categoría"; });
      tr.querySelector("[data-hrow-subcategory]").addEventListener("change", function () { pendingHouseholdImportRows[i].subcategory = this.value.trim() || null; });
    });

    renderHouseholdCsvPreviewPagination(totalPages);
  }

  function renderHouseholdCsvPreviewPagination(totalPages) {
    var el = document.getElementById("household-csv-preview-pagination");
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    el.innerHTML =
      '<button type="button" class="btn" id="household-csv-preview-prev"' + (householdCsvPreviewPage === 0 ? " disabled" : "") + '>‹ Anterior</button>' +
      '<span class="csv-preview-page-info">Página ' + (householdCsvPreviewPage + 1) + " de " + totalPages + "</span>" +
      '<button type="button" class="btn" id="household-csv-preview-next"' + (householdCsvPreviewPage >= totalPages - 1 ? " disabled" : "") + ">Siguiente ›</button>";
    var prevBtn = document.getElementById("household-csv-preview-prev");
    var nextBtn = document.getElementById("household-csv-preview-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { householdCsvPreviewPage--; renderHouseholdCsvPreviewPage(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { householdCsvPreviewPage++; renderHouseholdCsvPreviewPage(); });
  }

  document.getElementById("household-btn-confirm-import").addEventListener("click", function () {
    var toImport = pendingHouseholdImportRows.filter(function (r) { return r.include && r.date && r.amount != null; }).map(function (r) {
      var copy = Object.assign({}, r);
      delete copy.include;
      delete copy.autodetected;
      delete copy.categoryRuleMatch;
      return copy;
    });
    if (toImport.length === 0) { alert("No hay filas seleccionadas para importar."); return; }
    api("/api/household/bulk", { method: "POST", body: JSON.stringify(toImport) })
      .then(function (res) {
        alert("Importados " + res.inserted + " movimientos" + (res.skipped ? " (" + res.skipped + " con errores)" : "") + ".");
        pendingHouseholdImportRows = [];
        document.getElementById("household-csv-preview-wrap").style.display = "none";
        document.getElementById("household-csv-mapping").style.display = "none";
        document.getElementById("household-csv-format-row").style.display = "none";
        document.getElementById("household-csv-file").value = "";
        closeAllFlyouts();
        return loadAll();
      })
      .then(function () { activateTab("household-operations"); })
      .catch(function (err) { alert("Error al importar: " + err.message); });
  });

  /* ---------------- 38. Menús modales de Economía (Importar CSV, Cuentas, Detectar traspasos) ---------------- */
  // El panel vive siempre en el DOM (los <input>/<select> internos guardan su wiring de siempre)
  // -- solo se muestra u oculta con la clase .open, ahora como un modal de ancho completo con
  // fondo atenuado (.modal-backdrop) en vez de un desplegable anclado al botón: clic en el botón
  // lo abre (y cierra cualquier otro modal abierto, mutuamente excluyentes), clic en el fondo /
  // botón "✕" / Escape lo cierran, clic dentro no hace nada. Genérico porque hay tres instancias
  // con el mismo comportamiento. Mientras hay un modal abierto, header/main quedan "inert"
  // (fuera del foco de teclado y sin recibir clics -- no basta con taparlos visualmente, un Tab
  // seguiría llevando el foco a los botones de detrás si no se marcan inert) y desenfocados
  // (body.modal-open, ver styles.css), y el foco pasa al propio modal.
  function closeAllFlyouts() {
    document.querySelectorAll(".flyout-panel.open").forEach(function (p) { p.classList.remove("open"); });
    closeAllMonthPickers();
    var backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
    document.body.classList.remove("modal-open");
    var header = document.querySelector("body > header"), main = document.querySelector("body > main");
    if (header) header.inert = false;
    if (main) main.inert = false;
  }

  function wireFlyout(toggleId, panelId) {
    var toggleBtn = document.getElementById(toggleId);
    var panel = document.getElementById(panelId);
    if (!toggleBtn || !panel) return;
    panel.setAttribute("tabindex", "-1");
    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !panel.classList.contains("open");
      closeAllFlyouts();
      if (willOpen) {
        panel.classList.add("open");
        var backdrop = document.getElementById("modal-backdrop");
        if (backdrop) backdrop.classList.add("open");
        document.body.classList.add("modal-open");
        var header = document.querySelector("body > header"), main = document.querySelector("body > main");
        if (header) header.inert = true;
        if (main) main.inert = true;
        panel.focus();
      }
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    var closeBtn = panel.querySelector("[data-close-modal]");
    if (closeBtn) closeBtn.addEventListener("click", closeAllFlyouts);
  }

  var modalBackdropEl = document.getElementById("modal-backdrop");
  if (modalBackdropEl) modalBackdropEl.addEventListener("click", closeAllFlyouts);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAllFlyouts(); });

  wireFlyout("cartera-import-toggle", "cartera-import-panel");
  wireFlyout("household-import-toggle", "household-import-panel");
  wireFlyout("household-accounts-toggle", "household-accounts-panel");
  wireFlyout("household-rules-toggle", "household-rules-panel");
  wireFlyout("household-transfers-toggle", "household-transfers-panel");

  // Menú lateral de acciones secundarias en móvil (ver #mobile-menu-toggle/#mobile-menu-panel
  // en index.html, y por qué es un flyout-panel aparte -- fuera de <header> -- en vez de
  // reposicionar los botones reales del header con CSS). Los 3 primeros botones llaman a las
  // mismas funciones que sus equivalentes de escritorio; "Restaurar" simplemente abre el mismo
  // <input type="file"> real (su "change" ya está cableado una sola vez, arriba). Los cuatro
  // cierran el panel tras la acción -- en escritorio el usuario ve el resultado sin más porque
  // el botón está siempre a la vista; en el menú lateral, sin cerrarlo, el cambio de tema o de
  // modo privacidad quedaría oculto detrás del propio panel.
  wireFlyout("mobile-menu-toggle", "mobile-menu-panel");
  document.getElementById("btn-theme-toggle-mobile").addEventListener("click", function () { toggleTheme(); closeAllFlyouts(); });
  document.getElementById("btn-privacy-toggle-mobile").addEventListener("click", function () { togglePrivacyMode(); closeAllFlyouts(); });
  document.getElementById("btn-export-mobile").addEventListener("click", function () { exportBackup(); closeAllFlyouts(); });
  document.getElementById("btn-restore-mobile").addEventListener("click", function () {
    closeAllFlyouts();
    document.getElementById("import-json-file").click();
  });

  /* ---------------- 39. Init ---------------- */
  loadAll();
})();
