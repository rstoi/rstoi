#!/usr/bin/env tsx
/**
 * Treasury Demo Runner
 * Seeds realistic Brazilian company data and executes the full treasury routine.
 * If ANTHROPIC_API_KEY is set → runs AI agents.
 * If not → runs rule-based analysis on all data layers.
 */

import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { initTreasurySchema } from "../src/treasury/db.js";
import {
  upsertBankAccount, upsertSupplier, upsertPayable, upsertReceivable,
  getBankAccounts, getPendingPayables, getOpenReceivables,
  getCashFlowProjections, getPendingApprovals, getUnreconciledTransactions,
  insertTransaction, updateAccountBalance, upsertCashFlow,
} from "../src/treasury/db.js";
import type { BankAccount, Supplier, Payable, Receivable, BankTransaction } from "../src/treasury/types.js";

const DB_PATH = "./data/treasury-demo.db";
mkdirSync("./data", { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
initTreasurySchema(db);

const now = Date.now();
const day = 86_400_000;
const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("pt-BR");
const line = (ch = "─", n = 60) => ch.repeat(n);

// ─── 1. SEED ─────────────────────────────────────────────────────────────────

console.log("\n" + line("═") + "\n  TESOURARIA COM IA — DEMO DE EXECUÇÃO\n" + line("═"));
console.log("📅 Data base:", new Date(now).toLocaleString("pt-BR"));
console.log("🗃️  Banco de dados:", DB_PATH);

// Clear existing demo data
db.exec(`
  DELETE FROM treasury_collection_attempts;
  DELETE FROM treasury_anticipations;
  DELETE FROM treasury_cash_flow;
  DELETE FROM treasury_agent_logs;
  DELETE FROM treasury_bank_transactions;
  DELETE FROM treasury_payables;
  DELETE FROM treasury_receivables;
  DELETE FROM treasury_suppliers;
  DELETE FROM treasury_bank_accounts;
`);

// ── Contas Bancárias ──────────────────────────────────────────────────────────
const accounts: BankAccount[] = [
  { id: "acc-itau",    name: "Itaú Corrente",          bankCode: "341", agency: "0001", accountNumber: "12345-6", balance: 87_430.00, minBalance: 20_000, currency: "BRL", isActive: true, updatedAt: now },
  { id: "acc-brad",    name: "Bradesco Empresarial",    bankCode: "237", agency: "0023", accountNumber: "78901-2", balance: 34_210.50, minBalance: 10_000, currency: "BRL", isActive: true, updatedAt: now },
  { id: "acc-sicoob",  name: "Sicoob Aplicação",        bankCode: "756", agency: "0100", accountNumber: "99999-1", balance: 150_000.00, minBalance: 5_000, currency: "BRL", isActive: true, updatedAt: now },
];
accounts.forEach(a => upsertBankAccount(db, a));

// ── Fornecedores ──────────────────────────────────────────────────────────────
const suppliers: Supplier[] = [
  { id: "sup-001", name: "TechSuprimentos Ltda",    cnpj: "12.345.678/0001-99", paymentTerms: 30, criticality: "critical", contactEmail: "financeiro@techsup.com.br", isActive: true, createdAt: now },
  { id: "sup-002", name: "Serviços Cloud AWS BR",   cnpj: "23.456.789/0001-11", paymentTerms: 30, criticality: "high",     contactEmail: "billing@aws.amazon.com",    isActive: true, createdAt: now },
  { id: "sup-003", name: "Folha de Pagamento RH",   cnpj: "34.567.890/0001-22", paymentTerms: 0,  criticality: "critical", contactEmail: "rh@empresa.com.br",         isActive: true, createdAt: now },
  { id: "sup-004", name: "Aluguel Sede Comercial",  cnpj: "45.678.901/0001-33", paymentTerms: 5,  criticality: "high",     contactEmail: "adm@imobiliaria.com.br",    isActive: true, createdAt: now },
  { id: "sup-005", name: "Marketing Digital Agência",cnpj: "56.789.012/0001-44", paymentTerms: 30, criticality: "medium",   contactEmail: "fatura@agencia.com.br",     isActive: true, createdAt: now },
  { id: "sup-006", name: "Limpeza e Conservação",   cnpj: "67.890.123/0001-55", paymentTerms: 30, criticality: "low",      contactEmail: "cob@limpeza.com.br",        isActive: true, createdAt: now },
];
suppliers.forEach(s => upsertSupplier(db, s));

// ── Contas a Pagar ────────────────────────────────────────────────────────────
const payables: Payable[] = [
  // Vencidos
  { id: "pay-001", supplierId: "sup-003", description: "Folha de Pagamento — Maio/2026",       amount: 48_500.00, dueDate: now - 3*day,  status: "pending", autoApprove: false, createdAt: now - 35*day, invoiceNumber: "FP-2026-05" },
  { id: "pay-002", supplierId: "sup-004", description: "Aluguel Sede — Junho/2026",            amount: 12_800.00, dueDate: now - 1*day,  status: "pending", autoApprove: false, createdAt: now - 10*day, invoiceNumber: "ALU-202606" },
  // Vencendo hoje / amanhã
  { id: "pay-003", supplierId: "sup-002", description: "AWS — Fatura Maio/2026",               amount: 8_347.20,  dueDate: now,          status: "pending", autoApprove: true,  createdAt: now - 5*day,  invoiceNumber: "AWS-0526" },
  { id: "pay-004", supplierId: "sup-001", description: "NF 4523 — Suprimentos TI",             amount: 6_200.00,  dueDate: now + 1*day,  status: "pending", autoApprove: true,  createdAt: now - 2*day,  invoiceNumber: "NF-4523" },
  // Próximos 7 dias
  { id: "pay-005", supplierId: "sup-005", description: "Marketing Digital — Junho/2026",       amount: 15_000.00, dueDate: now + 5*day,  status: "pending", autoApprove: false, createdAt: now - 5*day,  invoiceNumber: "MKT-0626" },
  { id: "pay-006", supplierId: "sup-006", description: "Limpeza — Junho/2026",                 amount: 2_340.00,  dueDate: now + 7*day,  status: "pending", autoApprove: true,  createdAt: now - 3*day,  invoiceNumber: "LIMP-0626" },
  // Futuro
  { id: "pay-007", supplierId: "sup-001", description: "NF 4580 — Equipamentos",               amount: 23_500.00, dueDate: now + 15*day, status: "pending", autoApprove: false, createdAt: now - 1*day,  invoiceNumber: "NF-4580" },
  { id: "pay-008", supplierId: "sup-002", description: "AWS — Reserva Anual",                  amount: 89_000.00, dueDate: now + 22*day, status: "pending", autoApprove: false, createdAt: now,          invoiceNumber: "AWS-ANNUAL" },
];
payables.forEach(p => upsertPayable(db, p));

// ── Contas a Receber ──────────────────────────────────────────────────────────
const receivables: Receivable[] = [
  // Vencidos — em cobrança
  { id: "rec-001", customerName: "Construtora Alfa Ltda",    customerCnpj: "11.111.111/0001-11", customerEmail: "fin@alfa.com.br",    customerPhone: "11999991111", description: "Contrato Manutenção — Abril",  amount: 35_000.00, dueDate: now - 15*day, status: "overdue",  receivedAmount: 0,         collectionStage: "dunning",      canAnticipate: true,  createdAt: now - 45*day, invoiceNumber: "NF-0412" },
  { id: "rec-002", customerName: "Supermercados Beta S.A.",  customerCnpj: "22.222.222/0001-22", customerEmail: "ap@beta.com.br",     customerPhone: "11988882222", description: "Serviços TI — Maio",           amount: 18_500.00, dueDate: now - 5*day,  status: "overdue",  receivedAmount: 0,         collectionStage: "reminder",     canAnticipate: true,  createdAt: now - 35*day, invoiceNumber: "NF-0523" },
  { id: "rec-003", customerName: "Indústria Gama ME",        customerCnpj: "33.333.333/0001-33", customerEmail: "fin@gama.com.br",    customerPhone: "11977773333", description: "Consultoria — Abril",          amount: 8_200.00,  dueDate: now - 32*day, status: "overdue",  receivedAmount: 3_000.00,  collectionStage: "negotiation",  canAnticipate: false, createdAt: now - 60*day, invoiceNumber: "NF-0404" },
  // Vencendo em breve
  { id: "rec-004", customerName: "Farmácias Delta Rede",     customerCnpj: "44.444.444/0001-44", customerEmail: "cp@delta.com.br",    customerPhone: "11966664444", description: "Software Licença — Junho",     amount: 42_000.00, dueDate: now + 3*day,  status: "open",     receivedAmount: 0,         collectionStage: "none",         canAnticipate: true,  createdAt: now - 30*day, invoiceNumber: "NF-0601" },
  { id: "rec-005", customerName: "Posto Epsilon Combustíveis",customerCnpj:"55.555.555/0001-55", customerEmail: "fin@epsilon.com.br", customerPhone: "11955555555", description: "Serviços TI — Junho",          amount: 9_800.00,  dueDate: now + 5*day,  status: "open",     receivedAmount: 0,         collectionStage: "none",         canAnticipate: true,  createdAt: now - 25*day, invoiceNumber: "NF-0602" },
  // Futuros antecipáveis
  { id: "rec-006", customerName: "Grupo Zeta Holdings",      customerCnpj: "66.666.666/0001-66", customerEmail: "ap@zeta.com.br",     customerPhone: "11944446666", description: "Contrato Anual Q2",            amount: 120_000.00,dueDate: now + 20*day, status: "open",     receivedAmount: 0,         collectionStage: "none",         canAnticipate: true,  createdAt: now - 10*day, invoiceNumber: "NF-0605" },
  { id: "rec-007", customerName: "Clínica Eta Saúde",        customerCnpj: "77.777.777/0001-77", customerEmail: "fin@eta.com.br",     customerPhone: "11933337777", description: "Sistema Gestão — Junho",       amount: 7_500.00,  dueDate: now + 12*day, status: "open",     receivedAmount: 0,         collectionStage: "none",         canAnticipate: true,  createdAt: now - 20*day, invoiceNumber: "NF-0607" },
  { id: "rec-008", customerName: "Escola Theta Educação",    customerCnpj: "88.888.888/0001-88", customerEmail: "teso@theta.com.br",  customerPhone: "11922228888", description: "Plataforma EAD — Julho",       amount: 28_000.00, dueDate: now + 35*day, status: "open",     receivedAmount: 0,         collectionStage: "none",         canAnticipate: true,  createdAt: now - 5*day,  invoiceNumber: "NF-0701" },
];
receivables.forEach(r => upsertReceivable(db, r));

// ── Extrato Bancário não conciliado ───────────────────────────────────────────
const bankTxs: BankTransaction[] = [
  { id: randomUUID(), accountId: "acc-itau", date: now - 2*day, amount: 18_500.00, description: "PIX RECEBIDO SUPERMERCADOS BETA",    type: "credit", reconciled: false, createdAt: now },
  { id: randomUUID(), accountId: "acc-itau", date: now - 1*day, amount: 2_340.00,  description: "BOLETO LIMPEZA E CONSERVAÇÃO",        type: "debit",  reconciled: false, createdAt: now },
  { id: randomUUID(), accountId: "acc-brad", date: now - 3*day, amount: 8_200.00,  description: "TED RECEBIDA INDUSTRIA GAMA",         type: "credit", reconciled: false, createdAt: now },
  { id: randomUUID(), accountId: "acc-brad", date: now,         amount: 350.00,    description: "TARIFA MANUTENCAO CONTA JUN/26",      type: "debit",  reconciled: false, createdAt: now },
];
bankTxs.forEach(tx => insertTransaction(db, tx));

console.log(`\n✅ Dados carregados:`);
console.log(`   ${accounts.length} contas bancárias`);
console.log(`   ${suppliers.length} fornecedores`);
console.log(`   ${payables.length} contas a pagar`);
console.log(`   ${receivables.length} contas a receber`);
console.log(`   ${bankTxs.length} lançamentos bancários pendentes de conciliação`);

// ─── 2. POSIÇÃO DE CAIXA ──────────────────────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 1 — POSIÇÃO DE CAIXA\n" + line());

const accs = getBankAccounts(db);
const pays = getPendingPayables(db);
const recs = getOpenReceivables(db);

const totalBalance   = accs.reduce((s,a) => s + a.balance, 0);
const totalMin       = accs.reduce((s,a) => s + a.minBalance, 0);
const totalAvailable = accs.reduce((s,a) => s + Math.max(0, a.balance - a.minBalance), 0);
const totalPayables  = pays.reduce((s,p) => s + p.amount, 0);
const totalReceivables = recs.reduce((s,r) => s + (r.amount - r.receivedAmount), 0);
const overduePayables  = pays.filter(p => p.dueDate < now);
const overdueRecs      = recs.filter(r => r.dueDate < now);
const totalOverdueOut  = overduePayables.reduce((s,p) => s + p.amount, 0);
const totalOverdueIn   = overdueRecs.reduce((s,r) => s + (r.amount - r.receivedAmount), 0);

console.log("\n  Contas Bancárias:");
accs.forEach(a => {
  const avail = a.balance - a.minBalance;
  const flag = avail < 0 ? " ⚠️ ABAIXO DO MÍNIMO" : "";
  console.log(`  • ${a.name.padEnd(28)} Saldo: ${fmt(a.balance).padStart(14)}  Disponível: ${fmt(avail).padStart(14)}${flag}`);
});
console.log(`  ${"Total".padEnd(28)} Saldo: ${fmt(totalBalance).padStart(14)}  Disponível: ${fmt(totalAvailable).padStart(14)}`);

console.log("\n  Resumo Financeiro:");
console.log(`  • A Pagar (pendente):      ${fmt(totalPayables).padStart(14)}  (${pays.length} títulos)`);
console.log(`    ↳ Vencidos/Urgentes:     ${fmt(totalOverdueOut).padStart(14)}  (${overduePayables.length} títulos) ⚠️`);
console.log(`  • A Receber (aberto):      ${fmt(totalReceivables).padStart(14)}  (${recs.length} títulos)`);
console.log(`    ↳ Inadimplentes:         ${fmt(totalOverdueIn).padStart(14)}  (${overdueRecs.length} títulos) ⚠️`);
console.log(`  • Posição Líquida:         ${fmt(totalBalance - totalPayables + totalReceivables).padStart(14)}`);

// ─── 3. AGENTE DE CONCILIAÇÃO BANCÁRIA ───────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 2 — CONCILIAÇÃO BANCÁRIA\n" + line());

const unrec = getUnreconciledTransactions(db);
console.log(`\n  ${unrec.length} lançamentos pendentes de conciliação:\n`);

const reconciledResults: string[] = [];

for (const tx of unrec) {
  const sign = tx.type === "credit" ? "+" : "-";
  console.log(`  ${sign}${fmt(tx.amount).padStart(14)}  ${tx.description}`);

  // Rule-based reconciliation (sem IA)
  if (tx.type === "credit") {
    // Tenta casar com contas a receber por valor ±5%
    const match = recs.find(r =>
      Math.abs(r.amount - r.receivedAmount - tx.amount) / tx.amount < 0.05 &&
      r.status !== "paid"
    );
    if (match) {
      reconciledResults.push(`  ✅ CONCILIADO: ${tx.description} → ${match.customerName} (${match.invoiceNumber})`);
    } else if (tx.amount < 500 && tx.description.toLowerCase().includes("tarifa")) {
      reconciledResults.push(`  🏦 TARIFA BANCÁRIA: ${tx.description} ${fmt(tx.amount)} — registrar como despesa`);
    } else {
      reconciledResults.push(`  ❓ SEM MATCH: ${tx.description} ${fmt(tx.amount)} — requer revisão manual`);
    }
  } else {
    // Débito — casa com contas a pagar
    const match = pays.find(p =>
      Math.abs(p.amount - tx.amount) / tx.amount < 0.03 &&
      p.status !== "paid"
    );
    if (match) {
      reconciledResults.push(`  ✅ CONCILIADO: ${tx.description} → ${match.description} (${match.invoiceNumber})`);
    } else {
      reconciledResults.push(`  ❓ SEM MATCH: ${tx.description} ${fmt(tx.amount)} — requer revisão`);
    }
  }
}

console.log("\n  Resultado da Conciliação:");
reconciledResults.forEach(r => console.log(r));

// ─── 4. AGENTE DE PAGAMENTOS ──────────────────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 3 — FILA DE PAGAMENTOS (AGENTE)\n" + line());

const AUTONOMOUS_LIMIT = 50_000;
const CDI_ANNUAL = 0.105;

interface PaymentDecision {
  payable: Payable;
  daysOverdue: number;
  action: string;
  autoExecute: boolean;
  reason: string;
}

const paymentQueue: PaymentDecision[] = pays.map(p => {
  const daysOverdue = Math.round((now - p.dueDate) / day);
  const overdue = daysOverdue > 0;
  const dueSoon = daysOverdue > -3;
  const autoExecute = p.amount <= AUTONOMOUS_LIMIT;

  let action: string;
  let reason: string;

  if (overdue) {
    if (p.amount <= AUTONOMOUS_LIMIT && totalAvailable >= p.amount) {
      action = "PAGAR AGORA";
      reason = `Vencido há ${daysOverdue}d — execução autônoma`;
    } else if (p.amount > AUTONOMOUS_LIMIT) {
      action = "SOLICITAR APROVAÇÃO";
      reason = `Vencido — valor R$${(p.amount/1000).toFixed(0)}k acima do limite autônomo`;
    } else {
      action = "AGUARDAR CAIXA";
      reason = `Vencido — saldo insuficiente (disponível: ${fmt(totalAvailable)})`;
    }
  } else if (dueSoon) {
    action = "PAGAR NO VENCIMENTO";
    reason = `Vence em ${Math.abs(daysOverdue)}d`;
  } else {
    action = "AGUARDAR";
    reason = `Vence em ${Math.abs(daysOverdue)}d — sem urgência`;
  }

  return { payable: p, daysOverdue, action, autoExecute, reason };
});

// Sort: vencidos primeiro, depois por urgência
paymentQueue.sort((a,b) => a.payable.dueDate - b.payable.dueDate);

console.log(`\n  ${"Fornecedor".padEnd(30)} ${"Valor".padStart(12)}  ${"Venc.".padStart(10)}  ${"Situação".padEnd(12)}  Decisão`);
console.log("  " + line("─", 110));

let autoTotal = 0, approvalTotal = 0;
for (const d of paymentQueue) {
  const sup = suppliers.find(s => s.id === d.payable.supplierId);
  const supName = (sup?.name ?? "—").substring(0, 28);
  const dueDateStr = fmtDate(d.payable.dueDate);
  const overdueTag = d.daysOverdue > 0 ? `VENCIDO+${d.daysOverdue}d` : d.daysOverdue === 0 ? "HOJE" : `${Math.abs(d.daysOverdue)}d`;
  const icon = d.action.includes("AGORA") ? "🟢" : d.action.includes("APROVAÇÃO") ? "🔴" : d.action.includes("VENCIMENTO") ? "🟡" : "⚪";
  console.log(`  ${supName.padEnd(30)} ${fmt(d.payable.amount).padStart(12)}  ${dueDateStr.padStart(10)}  ${overdueTag.padEnd(12)}  ${icon} ${d.action} — ${d.reason}`);

  if (d.action === "PAGAR AGORA") autoTotal += d.payable.amount;
  if (d.action === "SOLICITAR APROVAÇÃO") approvalTotal += d.payable.amount;
}

console.log("\n  Sumário de Decisões:");
console.log(`  🟢 Execução autônoma:    ${fmt(autoTotal)} (dentro do limite de ${fmt(AUTONOMOUS_LIMIT)})`);
console.log(`  🔴 Aguardando aprovação: ${fmt(approvalTotal)}`);

// ─── 5. AGENTE DE RECEBÍVEIS ──────────────────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 4 — COBRANÇA E RECEBÍVEIS\n" + line());

interface CollectionDecision { rec: Receivable; daysOverdue: number; stage: string; action: string; message: string }
const collectionQueue: CollectionDecision[] = recs.map(r => {
  const daysOverdue = Math.round((now - r.dueDate) / day);
  let stage: string, action: string, message: string;

  if (daysOverdue >= 30) {
    stage = "JURÍDICO";
    action = "Encaminhar para equipe jurídica";
    message = `${r.customerName}: ${Math.round((r.amount - r.receivedAmount)/1000)}k em atraso há ${daysOverdue}d — protocolo jurídico`;
  } else if (daysOverdue >= 10) {
    stage = "NEGOCIAÇÃO";
    action = "Proposta de acordo + parcelamento";
    message = `${r.customerName}: oferecer parcelamento em 3x (${fmt((r.amount - r.receivedAmount)/3)}/mês)`;
  } else if (daysOverdue >= 3) {
    stage = "DUNNING";
    action = "WhatsApp + oferta de parcelamento";
    message = `${r.customerName}: ${fmt(r.amount - r.receivedAmount)} vencido há ${daysOverdue}d — link de pagamento PIX`;
  } else if (daysOverdue >= -2) {
    stage = "LEMBRETE";
    action = "E-mail com link de pagamento";
    message = `${r.customerName}: lembrete amigável — vence em breve`;
  } else {
    stage = "MONITORAR";
    action = "Sem ação — dentro do prazo";
    message = `${r.customerName}: vence em ${Math.abs(daysOverdue)}d`;
  }

  return { rec: r, daysOverdue, stage, action, message };
}).sort((a,b) => a.daysOverdue - b.daysOverdue).reverse();

console.log(`\n  ${"Cliente".padEnd(30)} ${"Valor".padStart(12)}  ${"Venc.".padStart(10)}  ${"Estágio".padEnd(12)}  Ação`);
console.log("  " + line("─", 110));

for (const d of collectionQueue) {
  const icon = d.stage === "JURÍDICO" ? "🔴" : d.stage === "NEGOCIAÇÃO" ? "🟠" : d.stage === "DUNNING" ? "🟡" : d.stage === "LEMBRETE" ? "🔵" : "⚪";
  const overdueTag = d.daysOverdue > 0 ? `+${d.daysOverdue}d` : d.daysOverdue === 0 ? "HOJE" : `${Math.abs(d.daysOverdue)}d`;
  const remaining = d.rec.amount - d.rec.receivedAmount;
  console.log(`  ${d.rec.customerName.substring(0,28).padEnd(30)} ${fmt(remaining).padStart(12)}  ${fmtDate(d.rec.dueDate).padStart(10)}  ${icon} ${d.stage.padEnd(10)}  ${d.action}`);
}

// ─── 6. AGENTE DE ANTECIPAÇÃO ─────────────────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 5 — ANTECIPAÇÃO DE RECEBÍVEIS\n" + line());

const PROVIDERS = [
  { name: "Itaú — Desconto Duplicata", rate: 0.012, days: 2 },
  { name: "BMP — FIDC",                rate: 0.014, days: 3 },
  { name: "Creditas Empresas",          rate: 0.015, days: 1 },
];
const MAX_RATE = 0.018;

const anticipatable = recs.filter(r => r.canAnticipate && r.status === "open" && r.dueDate > now);
const cashNeed = Math.max(0, totalPayables - totalAvailable);

console.log(`\n  Necessidade de caixa estimada: ${fmt(cashNeed)}`);
console.log(`  Saldo disponível: ${fmt(totalAvailable)}`);

if (cashNeed > 0) {
  console.log(`\n  ⚠️  Caixa abaixo do necessário — analisando antecipações:\n`);

  let accumulated = 0;
  for (const r of anticipatable.sort((a,b) => b.amount - a.amount)) {
    if (accumulated >= cashNeed) break;
    const daysToMat = Math.round((r.dueDate - now) / day);
    const best = PROVIDERS.sort((a,b) => a.rate - b.rate)[0];
    const discount = r.amount * (best.rate * (daysToMat / 30));
    const net = r.amount - discount;
    const effAnnual = (discount / r.amount) / (daysToMat / 365) * 100;
    const viable = best.rate <= MAX_RATE;

    console.log(`  ${viable ? "✅" : "❌"} ${r.customerName.substring(0,25).padEnd(25)} | Valor: ${fmt(r.amount)} | ${daysToMat}d | ${best.name} @ ${(best.rate*100).toFixed(1)}%/mês`);
    console.log(`     Líquido: ${fmt(net)} (desconto: ${fmt(discount)}) | Taxa efetiva anual: ${effAnnual.toFixed(1)}% | ${viable ? "VANTAJOSO vs CDI" : "ACIMA DO LIMITE"}`);

    if (viable) accumulated += net;
  }
  console.log(`\n  Volume a antecipar para cobrir necessidade: ${fmt(Math.min(accumulated, cashNeed))}`);
} else {
  console.log(`\n  ✅ Caixa suficiente — antecipação não necessária no momento`);
}

// ─── 7. FLUXO DE CAIXA (30 DIAS) ─────────────────────────────────────────────

console.log("\n" + line() + "\n  MÓDULO 6 — PROJEÇÃO DE FLUXO DE CAIXA (30 DIAS)\n" + line());

// Build day-by-day projection
let runningBalance = totalBalance;
const projections: Array<{ date: number; inflow: number; outflow: number; closing: number; alerts: string[] }> = [];

for (let d = 0; d < 30; d++) {
  const dayStart = now + d * day;
  const dayEnd   = dayStart + day;

  const dayPays = pays.filter(p => p.dueDate >= dayStart && p.dueDate < dayEnd);
  const dayRecs = recs.filter(r => r.dueDate >= dayStart && r.dueDate < dayEnd);

  const outflow = dayPays.reduce((s,p) => s + p.amount, 0);
  const inflowBase = dayRecs.reduce((s,r) => s + (r.amount - r.receivedAmount), 0);
  const inflow = inflowBase * 0.90; // 90% conversion (base scenario)

  runningBalance = runningBalance + inflow - outflow;

  const alerts: string[] = [];
  if (runningBalance < 0) alerts.push("🔴 SALDO NEGATIVO");
  else if (runningBalance < totalMin) alerts.push("🟡 ABAIXO DO MÍNIMO");

  projections.push({ date: dayStart, inflow, outflow, closing: runningBalance, alerts });

  // Save to DB
  upsertCashFlow(db, {
    id: randomUUID(),
    projectionDate: dayStart,
    openingBalance: runningBalance - inflow + outflow,
    inflows: inflow,
    outflows: outflow,
    closingBalance: runningBalance,
    confidence: "base",
    generatedAt: now,
  });
}

// Print key dates only (non-zero movement + alerts)
console.log(`\n  ${"Data".padStart(12)}  ${"Entradas".padStart(12)}  ${"Saídas".padStart(12)}  ${"Saldo".padStart(14)}  Status`);
console.log("  " + line("─", 80));

let alertCount = 0;
for (const p of projections) {
  if (p.inflow === 0 && p.outflow === 0 && p.alerts.length === 0) continue;
  const status = p.alerts.length > 0 ? p.alerts.join(" ") : "✅";
  if (p.alerts.length > 0) alertCount++;
  console.log(`  ${fmtDate(p.date).padStart(12)}  ${fmt(p.inflow).padStart(12)}  ${fmt(p.outflow).padStart(12)}  ${fmt(p.closing).padStart(14)}  ${status}`);
}

const proj7  = projections[6];
const proj15 = projections[14];
const proj30 = projections[29];
console.log(`\n  Saldo projetado em:  7d → ${fmt(proj7.closing)}  |  15d → ${fmt(proj15.closing)}  |  30d → ${fmt(proj30.closing)}`);
if (alertCount > 0) {
  console.log(`\n  ⚠️  ${alertCount} dia(s) com alerta de caixa nos próximos 30 dias`);
}

// ─── 8. RELATÓRIO EXECUTIVO ───────────────────────────────────────────────────

console.log("\n" + line("═") + "\n  RELATÓRIO EXECUTIVO — TESOURARIA\n" + line("═"));
console.log(`  Gerado em: ${new Date(now).toLocaleString("pt-BR")}\n`);

const urgentPayables   = paymentQueue.filter(d => d.daysOverdue >= 0);
const autoPayments     = paymentQueue.filter(d => d.action === "PAGAR AGORA");
const needsApproval    = paymentQueue.filter(d => d.action === "SOLICITAR APROVAÇÃO");
const legalCases       = collectionQueue.filter(d => d.stage === "JURÍDICO");
const negotiationCases = collectionQueue.filter(d => d.stage === "NEGOCIAÇÃO" || d.stage === "DUNNING");

console.log("  SITUAÇÃO DE CAIXA");
console.log(`  ├─ Saldo total:          ${fmt(totalBalance)}`);
console.log(`  ├─ Disponível:           ${fmt(totalAvailable)}`);
console.log(`  ├─ Compromissos 30d:     ${fmt(totalPayables)}`);
console.log(`  └─ Recebimentos 30d:     ${fmt(totalReceivables)} (base 90%)`);

console.log("\n  AÇÕES IMEDIATAS NECESSÁRIAS");
if (autoPayments.length > 0) console.log(`  🟢 ${autoPayments.length} pagamento(s) prontos para execução autônoma: ${fmt(autoTotal)}`);
if (needsApproval.length > 0) console.log(`  🔴 ${needsApproval.length} pagamento(s) aguardando aprovação: ${fmt(approvalTotal)}`);
if (legalCases.length > 0) console.log(`  ⚖️  ${legalCases.length} recebível(eis) para encaminhamento jurídico: ${fmt(legalCases.reduce((s,d)=>s+(d.rec.amount-d.rec.receivedAmount),0))}`);
if (negotiationCases.length > 0) console.log(`  📞 ${negotiationCases.length} cliente(s) em cobrança ativa: ${fmt(negotiationCases.reduce((s,d)=>s+(d.rec.amount-d.rec.receivedAmount),0))}`);
if (alertCount > 0) console.log(`  📉 ${alertCount} dia(s) com gap de caixa projetado nos próximos 30 dias`);

console.log("\n  INDICADORES");
console.log(`  • Inadimplência: ${((totalOverdueIn/totalReceivables)*100).toFixed(1)}% da carteira`);
console.log(`  • Dias de caixa: ${Math.round(totalAvailable / (totalPayables/30))} dias`);
console.log(`  • Cobertura pagamentos: ${((totalAvailable/totalPayables)*100).toFixed(0)}% do total a pagar`);

console.log("\n" + line("═"));

// ─── 9. STATUS AGENTES IA ────────────────────────────────────────────────────

const hasKey = !!process.env.ANTHROPIC_API_KEY;
console.log("\n  STATUS DOS AGENTES DE IA");
console.log(`  ANTHROPIC_API_KEY: ${hasKey ? "✅ configurada" : "❌ não configurada"}`);
if (!hasKey) {
  console.log(`\n  Para ativar os agentes de IA com decisões autônomas via Claude:`);
  console.log(`  1. Configure: export ANTHROPIC_API_KEY=sk-ant-...`);
  console.log(`  2. Execute:   npm run treasury:run`);
  console.log(`  3. Ou use as ferramentas MCP no Claude Code:\n`);
  console.log(`     treasury_run_daily_routine`);
  console.log(`     treasury_run_daily_routine dry_run=true`);
} else {
  console.log(`\n  Execute a rotina completa com IA:`);
  console.log(`     npm run treasury:run`);
}

console.log("\n" + line("═") + "\n");
