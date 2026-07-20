"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  rentabilidadPorCuenta,
  rentabilidadTotalPortfolio,
  cashLedgerBalance,
  cashBalanceFormula,
  validarConsistenciaCash,
  calcularRentabilidadSobreCapital,
} = require("../public/brokerAccounting");

// Caso guía del enunciado: depósito 1.000 € -> compra acciones 1.000 € -> venta acciones
// 1.500 € -> compra cripto 1.500 €.
function escenarioBase() {
  return [
    { date: "2026-01-01", account: "CASH", type: "DEPOSIT", symbol: null, shares: 0, amount: 1000 },
    { date: "2026-01-02", account: "SECURITIES", type: "BUY", symbol: "AAPL", shares: 10, amount: 1000 },
    { date: "2026-02-01", account: "SECURITIES", type: "SELL", symbol: "AAPL", shares: 10, amount: 1500 },
    { date: "2026-02-02", account: "CRYPTO", type: "BUY", symbol: "BTC", shares: 0.03, amount: 1500 },
  ];
}

test("rentabilidadPorCuenta(CRYPTO) usa solo el capital invertido en cripto, no el capital externo real", () => {
  const tx = escenarioBase();
  const precios = { BTC: 60000 }; // 0.03 BTC * 60000 = 1800
  const r = rentabilidadPorCuenta(tx, "CRYPTO", precios);

  assert.equal(r.capitalInvertido, 1500);
  assert.equal(r.recuperadoPorVentas, 0);
  assert.equal(r.valorPosicionesAbiertas, 1800);
  assert.equal(r.valorSiVendieraTodo, 1800);
  assert.equal(r.rentabilidadPct, round2((1800 - 1500) / 1500 * 100)); // 20%
});

test("rentabilidadTotalPortfolio usa el capital externo neto (solo el depósito), no lo reinvertido", () => {
  const tx = escenarioBase();
  const precios = { BTC: 60000 };
  const r = rentabilidadTotalPortfolio(tx, precios);

  // Solo entró 1.000 € reales del banco -- el resto es la misma plusvalía reinvertida.
  assert.equal(r.capitalExternoNeto, 1000);
  assert.equal(r.cashActual, 0); // 1000 dep - 1000 buy + 1500 sell - 1500 buy = 0
  assert.equal(r.valorSecurities, 0);
  assert.equal(r.valorCrypto, 1800);
  assert.equal(r.valorTotalActual, 1800);
  assert.equal(r.rentabilidadPct, round2((1800 - 1000) / 1000 * 100)); // 80%
});

test("rentabilidadPorCuenta(CRYPTO) y rentabilidadTotalPortfolio dan resultados distintos en el escenario con reinversión entre bloques", () => {
  const tx = escenarioBase();
  const precios = { BTC: 60000 };
  const porCuenta = rentabilidadPorCuenta(tx, "CRYPTO", precios);
  const total = rentabilidadTotalPortfolio(tx, precios);

  assert.notEqual(porCuenta.rentabilidadPct, total.rentabilidadPct);
  assert.equal(porCuenta.rentabilidadPct, 20);
  assert.equal(total.rentabilidadPct, 80);
});

test("consistencia de CASH: ledger movimiento a movimiento cuadra con la fórmula Σ DEPOSIT − Σ WITHDRAWAL − Σ BUY + Σ SELL", () => {
  const tx = [
    { date: "2026-01-01", account: "CASH", type: "DEPOSIT", symbol: null, shares: 0, amount: 5000 },
    { date: "2026-01-05", account: "SECURITIES", type: "BUY", symbol: "MSFT", shares: 5, amount: 2000 },
    { date: "2026-01-10", account: "CRYPTO", type: "BUY", symbol: "ETH", shares: 1, amount: 1000 },
    { date: "2026-02-01", account: "SECURITIES", type: "SELL", symbol: "MSFT", shares: 2, amount: 900 },
    { date: "2026-03-01", account: "CASH", type: "WITHDRAWAL", symbol: null, shares: 0, amount: 500 },
  ];

  const check = validarConsistenciaCash(tx);
  assert.equal(check.ok, true);
  assert.equal(check.ledger, check.formula);

  // Cálculo manual: 5000 dep - 2000 buy - 1000 buy + 900 sell - 500 wd = 2400
  assert.equal(check.ledger, 2400);
  assert.equal(cashLedgerBalance(tx), 2400);
  assert.equal(cashBalanceFormula(tx), 2400);
});

test("rentabilidadPorCuenta lanza si se pide para CASH (no es una cuenta de trading)", () => {
  assert.throws(() => rentabilidadPorCuenta(escenarioBase(), "CASH", {}), /no CASH/);
});

test("rentabilidadPorCuenta acepta cuentas de sub-broker con nombre libre (integración con Ábaco)", () => {
  // Ábaco real no usa literalmente "SECURITIES"/"CRYPTO" como nombre de cuenta -- usa el
  // texto libre de prices.sub_account (p.ej. "Cuenta de valores", "Wallet Cripto"). El motor
  // debe funcionar igual con esos nombres, solo CASH está prohibido como "cuenta" de trading.
  const tx = [
    { date: "2026-01-01", account: "Wallet Cripto", type: "BUY", symbol: "BTC", shares: 0.01, amount: 500 },
    { date: "2026-02-01", account: "Wallet Cripto", type: "SELL", symbol: "BTC", shares: 0.005, amount: 300 },
  ];
  const r = rentabilidadPorCuenta(tx, "Wallet Cripto", { BTC: 60000 });
  assert.equal(r.capitalInvertido, 500);
  assert.equal(r.recuperadoPorVentas, 300);
  assert.equal(r.valorPosicionesAbiertas, 300); // 0.005 BTC * 60000
  assert.equal(r.valorSiVendieraTodo, 600);
});

test("calcularRentabilidadSobreCapital es el math compartido que reutiliza la integración real (cash/holdings ya calculados por la propia app)", () => {
  // Esta es la fórmula que Ábaco llama directamente desde computeMetrics() con SU PROPIO
  // valor de caja/posiciones (que ya incluye dividendos, comisiones y traspasos que el modelo
  // reducido de 4 tipos no conoce) -- ver public/app.js computeCapitalExternoNeto().
  assert.equal(calcularRentabilidadSobreCapital(1800, 1000), 80);
  assert.equal(calcularRentabilidadSobreCapital(900, 1000), -10);
  assert.equal(calcularRentabilidadSobreCapital(500, 0), null);
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
