"use strict";

/**
 * Modelo de cuentas de un bróker tipo Trade Republic: tres bloques (CASH, SECURITIES,
 * CRYPTO) que comparten un único pool de efectivo.
 *
 * Transacción: { date, account: "CASH"|"SECURITIES"|"CRYPTO", type: "BUY"|"SELL"|"DEPOSIT"|"WITHDRAWAL",
 *                symbol: string|null, shares: number, amount: number }
 *
 * - BUY/SELL se registran contra la cuenta del activo (SECURITIES o CRYPTO); el lado CASH
 *   es implícito (no hay una transacción CASH separada para cada compra/venta).
 * - DEPOSIT/WITHDRAWAL se registran contra CASH; representan dinero que entra o sale del
 *   sistema desde/hacia el banco.
 *
 * ---------------------------------------------------------------------------------------
 * DOS MÉTRICAS DE RENTABILIDAD -- NO SON INTERCAMBIABLES, NO MEZCLAR EN LA UI
 * ---------------------------------------------------------------------------------------
 *
 * 1) rentabilidadPorCuenta(tx, cuenta, precios) -- rentabilidad de TRADING de un bloque
 *    concreto (solo SECURITIES o solo CRYPTO). Compara compras vs. (ventas + valor actual
 *    de lo que queda) DENTRO de ese bloque. Es una métrica de "cómo de bien he comprado y
 *    vendido este activo", pero NO representa el dinero real que el usuario ha puesto o
 *    sacado del sistema: si vendes acciones y usas ese mismo dinero para comprar cripto, esa
 *    plusvalía de SECURITIES pasa a "financiar" compras de CRYPTO sin que haya entrado ni un
 *    euro nuevo del banco -- capitalInvertido en CRYPTO puede ser alto sin que el usuario
 *    haya aportado nada externo.
 *
 * 2) rentabilidadTotalPortfolio(tx, precios) -- rentabilidad REAL sobre el dinero externo
 *    aportado por el usuario (banco -> sistema), tratando CASH + SECURITIES + CRYPTO como
 *    un único sistema. Es la métrica que responde "¿cuánto he ganado con el dinero que he
 *    puesto de mi bolsillo?" y la única que debería mostrarse como "tu rentabilidad" al
 *    usuario sin cualificar de qué bloque se trata.
 *
 * Mostrar rentabilidadPorCuenta('CRYPTO', ...) como si fuera la rentabilidad real del
 * usuario es engañoso en cuanto hay trasvases entre bloques (venta en SECURITIES que
 * financia una compra en CRYPTO, o viceversa): la UI debe etiquetar SIEMPRE
 * rentabilidadPorCuenta como "rentabilidad de trading de [cuenta]" y reservar el término
 * "rentabilidad" a secas (o "rentabilidad total") para rentabilidadTotalPortfolio.
 * ---------------------------------------------------------------------------------------
 *
 * Cargado tanto en Node (tests, vía require) como directamente en el navegador con un
 * <script> plano (esta app no tiene paso de build/bundler) -- ver el bloque de export al
 * final del archivo. Ábaco en producción tiene brokers/sub-cuentas con nombres libres
 * (p.ej. "Cuenta de valores", "Wallet Cripto", pero también cualquier texto que el usuario
 * haya escrito a mano), no solo los dos nombres del modelo idealizado -- por eso
 * rentabilidadPorCuenta acepta cualquier nombre de cuenta que no sea CASH, en vez de limitarse
 * a ACCOUNTS/TRADE_ACCOUNTS (que se conservan como el vocabulario del modelo de referencia y
 * para los tests del enunciado).
 */

const ACCOUNTS = ["CASH", "SECURITIES", "CRYPTO"];
const TRADE_ACCOUNTS = ["SECURITIES", "CRYPTO"];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Math compartido por rentabilidadPorCuenta y rentabilidadTotalPortfolio -- también se expone
// para que integraciones que ya calculan su propio "valorActual"/"capitalAportado" con más
// detalle (p.ej. Ábaco, que ya tiene en cuenta comisiones/dividendos/traspasos en su
// propio cálculo de caja) puedan reutilizar la misma fórmula de % en vez de reimplementarla.
function calcularRentabilidadSobreCapital(valorActual, capitalAportado) {
  if (!(capitalAportado > 0)) return null;
  return round2(((valorActual - capitalAportado) / capitalAportado) * 100);
}

// Posiciones abiertas (shares por symbol) de una cuenta de activos, a partir de sus BUY/SELL.
function openPositions(transacciones, cuenta) {
  const shares = {};
  transacciones.forEach((t) => {
    if (t.account !== cuenta) return;
    if (t.type === "BUY") shares[t.symbol] = (shares[t.symbol] || 0) + Number(t.shares || 0);
    else if (t.type === "SELL") shares[t.symbol] = (shares[t.symbol] || 0) - Number(t.shares || 0);
  });
  return shares;
}

function marketValue(shares, preciosActuales) {
  let total = 0;
  Object.keys(shares).forEach((symbol) => {
    const qty = shares[symbol];
    if (qty <= 0) return;
    const price = Number(preciosActuales[symbol] || 0);
    total += qty * price;
  });
  return total;
}

/**
 * Rentabilidad de trading de un bloque concreto (SECURITIES o CRYPTO), usando solo sus
 * propios BUY/SELL. Ver comentario de cabecera: NO es la rentabilidad real del usuario.
 */
function rentabilidadPorCuenta(transacciones, cuenta, preciosActuales) {
  if (!cuenta || cuenta === "CASH") {
    throw new Error('rentabilidadPorCuenta: "cuenta" debe ser una cuenta de activos (no CASH), recibido ' + cuenta);
  }
  let capitalInvertido = 0;
  let recuperadoPorVentas = 0;
  transacciones.forEach((t) => {
    if (t.account !== cuenta) return;
    if (t.type === "BUY") capitalInvertido += Number(t.amount || 0);
    else if (t.type === "SELL") recuperadoPorVentas += Number(t.amount || 0);
  });

  const shares = openPositions(transacciones, cuenta);
  const valorPosicionesAbiertas = marketValue(shares, preciosActuales);
  const valorSiVendieraTodo = recuperadoPorVentas + valorPosicionesAbiertas;
  const rentabilidadPct = calcularRentabilidadSobreCapital(valorSiVendieraTodo, capitalInvertido);

  return {
    cuenta,
    capitalInvertido: round2(capitalInvertido),
    recuperadoPorVentas: round2(recuperadoPorVentas),
    valorPosicionesAbiertas: round2(valorPosicionesAbiertas),
    valorSiVendieraTodo: round2(valorSiVendieraTodo),
    rentabilidadAbs: capitalInvertido > 0 ? round2(valorSiVendieraTodo - capitalInvertido) : null,
    rentabilidadPct,
    posiciones: shares,
  };
}

// Saldo de CASH simulando movimiento a movimiento (DEPOSIT/WITHDRAWAL directos sobre CASH,
// BUY/SELL de SECURITIES o CRYPTO con efecto implícito sobre CASH). Es el método "A" de la
// validación de consistencia -- independiente de la fórmula agregada de más abajo.
function cashLedgerBalance(transacciones) {
  let balance = 0;
  transacciones
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach((t) => {
      const amount = Number(t.amount || 0);
      if (t.type === "DEPOSIT") balance += amount;
      else if (t.type === "WITHDRAWAL") balance -= amount;
      else if (t.type === "BUY") balance -= amount;
      else if (t.type === "SELL") balance += amount;
    });
  return balance;
}

// Método "B": fórmula agregada Σ DEPOSIT − Σ WITHDRAWAL − Σ BUY(amount) + Σ SELL(amount).
function cashBalanceFormula(transacciones) {
  let deposits = 0, withdrawals = 0, buys = 0, sells = 0;
  transacciones.forEach((t) => {
    const amount = Number(t.amount || 0);
    if (t.type === "DEPOSIT") deposits += amount;
    else if (t.type === "WITHDRAWAL") withdrawals += amount;
    else if (t.type === "BUY") buys += amount;
    else if (t.type === "SELL") sells += amount;
  });
  return deposits - withdrawals - buys + sells;
}

// Valida que ambos métodos de cálculo del saldo de CASH cuadran (deben ser exactamente
// iguales por construcción; si no cuadran hay una transacción mal formada -- p.ej. un BUY/SELL
// con account distinto de SECURITIES/CRYPTO, o un DEPOSIT/WITHDRAWAL con account distinto de
// CASH -- o algún tipo de transacción fuera de los cuatro soportados).
function validarConsistenciaCash(transacciones) {
  const ledger = round2(cashLedgerBalance(transacciones));
  const formula = round2(cashBalanceFormula(transacciones));
  return { ok: ledger === formula, ledger, formula, diff: round2(ledger - formula) };
}

/**
 * Rentabilidad real sobre el dinero externo aportado por el usuario, tratando CASH +
 * SECURITIES + CRYPTO como un único sistema. Ver comentario de cabecera: esta es la métrica
 * que debe mostrarse como "tu rentabilidad" en la UI.
 */
function rentabilidadTotalPortfolio(transacciones, preciosActuales) {
  let deposits = 0, withdrawals = 0;
  transacciones.forEach((t) => {
    if (t.type === "DEPOSIT") deposits += Number(t.amount || 0);
    else if (t.type === "WITHDRAWAL") withdrawals += Number(t.amount || 0);
  });
  const capitalExternoNeto = deposits - withdrawals;

  const cashActual = cashLedgerBalance(transacciones);
  const securitiesShares = openPositions(transacciones, "SECURITIES");
  const cryptoShares = openPositions(transacciones, "CRYPTO");
  const valorSecurities = marketValue(securitiesShares, preciosActuales);
  const valorCrypto = marketValue(cryptoShares, preciosActuales);
  const valorTotalActual = cashActual + valorSecurities + valorCrypto;
  const rentabilidadPct = calcularRentabilidadSobreCapital(valorTotalActual, capitalExternoNeto);

  return {
    capitalExternoNeto: round2(capitalExternoNeto),
    cashActual: round2(cashActual),
    valorSecurities: round2(valorSecurities),
    valorCrypto: round2(valorCrypto),
    valorTotalActual: round2(valorTotalActual),
    rentabilidadAbs: capitalExternoNeto > 0 ? round2(valorTotalActual - capitalExternoNeto) : null,
    rentabilidadPct,
  };
}

const BrokerAccounting = {
  ACCOUNTS,
  TRADE_ACCOUNTS,
  rentabilidadPorCuenta,
  rentabilidadTotalPortfolio,
  calcularRentabilidadSobreCapital,
  cashLedgerBalance,
  cashBalanceFormula,
  validarConsistenciaCash,
  openPositions,
  marketValue,
};

// Sin bundler: en el navegador este archivo se carga con un <script> plano antes de app.js
// (ver index.html) y se expone como window.BrokerAccounting; en Node (tests, y cualquier uso
// futuro desde server.js) se exporta como módulo CommonJS normal.
if (typeof module !== "undefined" && module.exports) {
  module.exports = BrokerAccounting;
} else {
  window.BrokerAccounting = BrokerAccounting;
}
