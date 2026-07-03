import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { recordAudit } from "../src/lib/audit";
import { DREAgent } from "../src/agents/dre-agent";
import { TreasuryAgent } from "../src/agents/treasury-agent";
import { ForecastAgent } from "../src/agents/forecast-agent";
import { BacktestingAgent } from "../src/agents/backtesting-agent";
import { DirectorEvaluationAgent } from "../src/agents/director-evaluation-agent";
import { OrganizationalDevelopmentAgent } from "../src/agents/organizational-development-agent";
import { ContinuousImprovementAgent } from "../src/agents/continuous-improvement-agent";
import { ActionableMessageAgent } from "../src/agents/actionable-message-agent";
import { ReportAgent } from "../src/agents/report-agent";
import { QualityAuditorAgent } from "../src/agents/quality-auditor-agent";
import type { DreLine } from "@prisma/client";

const COMPANY_NAME = "Setup Automação Demo";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function dateAt(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

async function main() {
  console.log("Iniciando seed do Baita Financial Intelligence OS...");

  const existing = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
  if (existing) {
    console.log("Removendo dados demo anteriores...");
    await prisma.company.delete({ where: { id: existing.id } });
  }

  // ---------------------------------------------------------------
  // Usuários
  // ---------------------------------------------------------------
  const adminPasswordHash = await hashPassword("baita123");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@baita.ai" },
    update: {},
    create: { email: "admin@baita.ai", passwordHash: adminPasswordHash, name: "Administrador Baita", role: "ADMIN" },
  });

  const consultantUser = await prisma.user.upsert({
    where: { email: "consultor@baita.ai" },
    update: {},
    create: { email: "consultor@baita.ai", passwordHash: adminPasswordHash, name: "Consultor Baita", role: "CONSULTANT" },
  });

  const directorUser = await prisma.user.upsert({
    where: { email: "enrique@setupautomacao.com.br" },
    update: {},
    create: {
      email: "enrique@setupautomacao.com.br",
      passwordHash: adminPasswordHash,
      name: "Enrique Salazar",
      role: "COMPANY_DIRECTOR",
    },
  });

  // ---------------------------------------------------------------
  // Empresa
  // ---------------------------------------------------------------
  const company = await prisma.company.create({
    data: {
      name: COMPANY_NAME,
      legalName: "Setup Automação Industrial Ltda.",
      cnpj: "12.345.678/0001-90",
      industry: "Engenharia e Automação Industrial",
      revenueRange: "R$ 2 milhões a R$ 5 milhões/ano",
      employeeRange: "20 a 40 funcionários",
      lifecycleStageAdizes: "GO_GO",
      lifecycleStageConfidence: 0.65,
      managementSystemLevel: 1,
      mainPains:
        "Dor de caixa recorrente, dificuldade em prever fluxo de 30 dias, dívida de capital de giro, ausência de plano de contas gerencial consolidado.",
      perceivedStage: "Crescimento acelerado com desorganização financeira",
      existingSystems: "Planilhas de controle + ERP básico de projetos",
      banksUsed: "Banco do Brasil, Itaú",
      notes: "Empresa demo sintética para validação do MVP Baita Financial Intelligence OS.",
    },
  });

  await prisma.companyUserAccess.createMany({
    data: [
      { companyId: company.id, userId: consultantUser.id, role: "CONSULTANT" },
      { companyId: company.id, userId: directorUser.id, role: "COMPANY_DIRECTOR" },
    ],
  });

  await prisma.implementationCycle.createMany({
    data: [
      { companyId: company.id, stage: "CYCLE_0_SCOPE", status: "DONE", startedAt: daysAgo(120), completedAt: daysAgo(110) },
      { companyId: company.id, stage: "CYCLE_1_CASH", status: "DONE", startedAt: daysAgo(110), completedAt: daysAgo(95) },
      { companyId: company.id, stage: "CYCLE_2_DRE", status: "DONE", startedAt: daysAgo(95), completedAt: daysAgo(80) },
      { companyId: company.id, stage: "CYCLE_3_FINANCIAL_POSITION", status: "DONE", startedAt: daysAgo(80), completedAt: daysAgo(70) },
      { companyId: company.id, stage: "CYCLE_4_FORECAST", status: "IN_PROGRESS", startedAt: daysAgo(30) },
      { companyId: company.id, stage: "CYCLE_5_RECONCILIATION", status: "NOT_STARTED" },
      { companyId: company.id, stage: "CYCLE_6_BACKTESTING", status: "NOT_STARTED" },
      { companyId: company.id, stage: "RECURRING", status: "IN_PROGRESS", startedAt: daysAgo(60) },
    ],
  });

  await recordAudit({
    companyId: company.id,
    actorUserId: adminUser.id,
    action: "CREATE",
    entityType: "Company",
    entityId: company.id,
    after: { name: company.name },
    rationale: "Onboarding da empresa demo.",
  });

  // ---------------------------------------------------------------
  // Pessoas
  // ---------------------------------------------------------------
  const [enrique, william, gerson, tania, contador, consultorPessoa] = await Promise.all([
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "Enrique Salazar",
        email: "enrique@setupautomacao.com.br",
        formalRole: "CEO / Diretor",
        realRole: "Decide praticamente tudo sozinho, pouco tempo para detalhes financeiros",
        careerStage: "SENIOR",
        communicationPreference: "Direto e objetivo, sem rodeios",
        preferredChannel: "WhatsApp",
        preferredFormat: "Mensagem curta com decisão clara a tomar",
        averageResponseTimeHours: 4,
        overloadRisk: "HIGH",
        bestInteractionWindow: "Início da manhã, antes das 9h",
      },
    }),
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "William Torres",
        email: "william@setupautomacao.com.br",
        formalRole: "Gerente de Operações",
        realRole: "Resolve tudo tecnicamente, evita se envolver com números financeiros",
        careerStage: "GROWING",
        preferredChannel: "WhatsApp",
        preferredFormat: "Checklist objetivo",
        averageResponseTimeHours: 6,
        bestInteractionWindow: "Fim de tarde, entre visitas técnicas",
      },
    }),
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "Gerson Aparecido",
        email: "gerson@setupautomacao.com.br",
        formalRole: "Gerente Comercial",
        realRole: "Fecha vendas mas não acompanha margem por cliente",
        careerStage: "GROWING",
        preferredChannel: "Reunião",
        preferredFormat: "Apresentação com números e gráficos",
        averageResponseTimeHours: 12,
      },
    }),
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "Tânia Ferreira",
        email: "tania@setupautomacao.com.br",
        formalRole: "Analista Financeiro / Tesouraria",
        realRole: "Executa tudo operacionalmente sozinha, sobrecarregada",
        careerStage: "BEGINNER",
        preferredChannel: "WhatsApp",
        preferredFormat: "Pergunta objetiva de múltipla escolha",
        averageResponseTimeHours: 2,
        overloadRisk: "HIGH",
        bestInteractionWindow: "Qualquer horário, exceto fechamento de mês",
      },
    }),
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "Contabilidade Externa (BF Contábil)",
        email: "contato@bfcontabil.com.br",
        formalRole: "Contador terceirizado",
        realRole: "Entrega com atraso recorrente, pouco proativo",
        careerStage: "SENIOR",
        preferredChannel: "E-mail",
        preferredFormat: "Lista de documentos por competência",
        averageResponseTimeHours: 48,
      },
    }),
    prisma.person.create({
      data: {
        companyId: company.id,
        name: "Consultor Baita",
        email: "consultor@baita.ai",
        formalRole: "Consultor financeiro Baita",
        realRole: "Estrutura diagnóstico, acompanha ciclos e governança",
        careerStage: "SENIOR",
        preferredChannel: "Reunião semanal",
        preferredFormat: "Relatório executivo",
        averageResponseTimeHours: 3,
      },
    }),
  ]);

  await prisma.personTopicReliability.createMany({
    data: [
      { personId: tania.id, topic: "Fluxo de caixa diário", rating: "B" },
      { personId: tania.id, topic: "Classificação contábil de despesas", rating: "C" },
      { personId: william.id, topic: "Prazo de entrega de projetos", rating: "B" },
      { personId: gerson.id, topic: "Previsão de fechamento comercial", rating: "D" },
      { personId: contador.id, topic: "Prazo de entrega de documentos", rating: "C" },
    ],
  });

  // ---------------------------------------------------------------
  // Fontes de dados
  // ---------------------------------------------------------------
  await Promise.all([
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "BANK_STATEMENT",
          name: "Extrato Banco do Brasil",
          ownerPersonId: tania.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "A",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "BANK_STATEMENT",
          name: "Extrato Itaú",
          ownerPersonId: tania.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "A",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "ISSUED_INVOICE",
          name: "Notas fiscais emitidas",
          ownerPersonId: tania.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "B",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "RECEIVED_INVOICE",
          name: "Notas fiscais de fornecedores",
          ownerPersonId: william.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "B",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "SPREADSHEET",
          name: "Planilha de controle interno",
          ownerPersonId: tania.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "C",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "CREDIT_BUREAU",
          name: "Relatório de dívidas (Serasa)",
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "B",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "TAX",
          name: "Guias fiscais (Simples Nacional/ISS)",
          ownerPersonId: contador.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "A",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "ACCOUNTING_BOOK",
          name: "Balancete contábil",
          ownerPersonId: contador.id,
          accessStatus: "PENDING",
          availabilityStatus: "PARTIAL",
          confidenceInitial: "UNKNOWN",
        },
      }),
      prisma.dataSource.create({
        data: {
          companyId: company.id,
          type: "CONTRACT",
          name: "Contratos de clientes recorrentes",
          ownerPersonId: william.id,
          accessStatus: "GRANTED",
          availabilityStatus: "AVAILABLE",
          confidenceInitial: "B",
        },
      }),
    ]);

  // ---------------------------------------------------------------
  // Plano de contas gerencial
  // ---------------------------------------------------------------
  async function category(name: string, dreLine: DreLine, ruleHints: string, cashFlowGroup?: string) {
    return prisma.managementCategory.create({
      data: { companyId: company.id, name, dreLine, ruleHints, cashFlowGroup },
    });
  }

  const catRevenue = await category("Receita de Serviços de Automação", "GROSS_REVENUE", "CLIENTE, PROJETO, SERVICO", "OPERATING");
  const catDeductions = await category("Impostos sobre Vendas", "SALES_DEDUCTIONS", "ISS, SIMPLES, PIS, COFINS", "OPERATING");
  const catMaterials = await category("Custo de Materiais e Componentes", "VARIABLE_COSTS", "FORNECEDOR, COMPONENTE, MATERIAL, PECAS", "OPERATING");
  const catMod = await category("Mão de obra direta de projeto (terceiros)", "VARIABLE_COSTS", "TECNICO TERCEIRO, MOD, INSTALACAO", "OPERATING");
  const catPayroll = await category("Folha de Pagamento", "FIXED_EXPENSES", "FOLHA, SALARIO, PRO-LABORE, FGTS, INSS", "OPERATING");
  const catRent = await category("Aluguel e Ocupação", "FIXED_EXPENSES", "ALUGUEL, CONDOMINIO, IPTU", "OPERATING");
  const catSoftware = await category("Software e Assinaturas", "FIXED_EXPENSES", "SOFTWARE, SAAS, ASSINATURA", "OPERATING");
  const catAdmin = await category("Despesas Administrativas", "FIXED_EXPENSES", "ADMINISTRATIVO, ESCRITORIO, CONTABILIDADE", "OPERATING");
  const catFinancial = await category("Juros e Encargos Financeiros", "FINANCIAL_EXPENSES", "JUROS, IOF, TARIFA BANCARIA", "FINANCING");
  const catNonRecurring = await category("Itens Não Recorrentes", "NON_RECURRING", "INDENIZACAO, SINISTRO, EXTRAORDINARIO", "OPERATING");
  const catDebtPrincipal = await category("Amortização de Dívida", "NOT_APPLICABLE", "AMORTIZACAO, PRINCIPAL EMPRESTIMO", "FINANCING");
  const catInvestment = await category("Investimento em Equipamentos", "NOT_APPLICABLE", "EQUIPAMENTO, MAQUINA, INVESTIMENTO", "INVESTING");
  const catTransfer = await category("Transferência entre contas", "NOT_APPLICABLE", "TRANSFERENCIA, TED PROPRIA", "TRANSFER");

  // ---------------------------------------------------------------
  // Eventos financeiros — competência (para o DRE)
  // ---------------------------------------------------------------
  const CLIENTS = [
    { name: "Metalúrgica Vetta Ltda.", amount: 72000, rating: "A" as const },
    { name: "Agroindustrial Bomtempo S.A.", amount: 54000, rating: "B" as const },
    { name: "Log-Tech Transportes Ltda.", amount: 38000, rating: "C" as const },
  ];

  const months = [
    { year: 2026, month: 3 },
    { year: 2026, month: 4 },
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
  ];

  for (const { year, month } of months) {
    const monthlyRevenue = CLIENTS.reduce((s, c) => s + c.amount, 0);

    for (const client of CLIENTS) {
      await prisma.financialEvent.create({
        data: {
          companyId: company.id,
          sourceType: "ISSUED_INVOICE",
          eventKind: "REVENUE",
          documentDate: dateAt(year, month, 5),
          competenceDate: dateAt(year, month, 5),
          financialDate: dateAt(year, month, 5),
          grossAmount: client.amount,
          netAmount: client.amount,
          counterpartyName: client.name,
          originalDescription: `NF-e serviços de automação — ${client.name}`,
          normalizedDescription: `CLIENTE ${client.name.toUpperCase()} PROJETO SERVICO`,
          managementCategoryId: catRevenue.id,
          reliabilityRating: client.rating,
          qualityRating: client.rating,
          recurrenceType: "RECURRING_MONTHLY",
        },
      });
    }

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "TAX",
        eventKind: "TAX",
        competenceDate: dateAt(year, month, 20),
        financialDate: dateAt(year, month, 20),
        grossAmount: monthlyRevenue * 0.06,
        netAmount: monthlyRevenue * 0.06,
        counterpartyName: "Receita Federal / Prefeitura",
        originalDescription: "Guia Simples Nacional + ISS",
        normalizedDescription: "ISS SIMPLES GUIA FISCAL",
        managementCategoryId: catDeductions.id,
        reliabilityRating: "A",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "RECEIVED_INVOICE",
        eventKind: "COST",
        competenceDate: dateAt(year, month, 10),
        financialDate: dateAt(year, month, 10),
        grossAmount: monthlyRevenue * 0.28,
        netAmount: monthlyRevenue * 0.28,
        counterpartyName: "Fornecedor Componentes Industriais SP",
        originalDescription: "NF-e componentes e materiais de projeto",
        normalizedDescription: "FORNECEDOR COMPONENTE MATERIAL PECAS",
        managementCategoryId: catMaterials.id,
        reliabilityRating: "B",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "RECEIVED_INVOICE",
        eventKind: "COST",
        competenceDate: dateAt(year, month, 12),
        financialDate: dateAt(year, month, 12),
        grossAmount: monthlyRevenue * 0.1,
        netAmount: monthlyRevenue * 0.1,
        counterpartyName: "Técnicos terceirizados de instalação",
        originalDescription: "MOD terceiro — instalação em campo",
        normalizedDescription: "TECNICO TERCEIRO MOD INSTALACAO",
        managementCategoryId: catMod.id,
        reliabilityRating: "C",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "SPREADSHEET",
        eventKind: "EXPENSE",
        competenceDate: dateAt(year, month, 5),
        financialDate: dateAt(year, month, 5),
        grossAmount: 45000,
        netAmount: 45000,
        counterpartyName: "Folha de pagamento",
        originalDescription: "Folha de pagamento + encargos",
        normalizedDescription: "FOLHA SALARIO PRO-LABORE FGTS INSS",
        managementCategoryId: catPayroll.id,
        reliabilityRating: "A",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "SPREADSHEET",
        eventKind: "EXPENSE",
        competenceDate: dateAt(year, month, 8),
        financialDate: dateAt(year, month, 8),
        grossAmount: 8000,
        netAmount: 8000,
        counterpartyName: "Imobiliária Central",
        originalDescription: "Aluguel do galpão + condomínio",
        normalizedDescription: "ALUGUEL CONDOMINIO IPTU",
        managementCategoryId: catRent.id,
        reliabilityRating: "A",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "SPREADSHEET",
        eventKind: "EXPENSE",
        competenceDate: dateAt(year, month, 3),
        financialDate: dateAt(year, month, 3),
        grossAmount: 3200,
        netAmount: 3200,
        counterpartyName: "Assinaturas de software",
        originalDescription: "ERP + planilhas + assinaturas SaaS",
        normalizedDescription: "SOFTWARE SAAS ASSINATURA",
        managementCategoryId: catSoftware.id,
        reliabilityRating: "B",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "SPREADSHEET",
        eventKind: "EXPENSE",
        competenceDate: dateAt(year, month, 15),
        financialDate: dateAt(year, month, 15),
        grossAmount: 6000,
        netAmount: 6000,
        counterpartyName: "Despesas administrativas diversas",
        originalDescription: "Material de escritório, contabilidade, diversos",
        normalizedDescription: "ADMINISTRATIVO ESCRITORIO CONTABILIDADE",
        managementCategoryId: catAdmin.id,
        reliabilityRating: "C",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "DEBT_INTEREST",
        competenceDate: dateAt(year, month, 18),
        financialDate: dateAt(year, month, 18),
        grossAmount: 4200,
        netAmount: 4200,
        counterpartyName: "Banco do Brasil — Capital de Giro",
        originalDescription: "Juros de empréstimo capital de giro",
        normalizedDescription: "JUROS EMPRESTIMO CAPITAL DE GIRO",
        managementCategoryId: catFinancial.id,
        reliabilityRating: "A",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });

    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "DEBT_PRINCIPAL",
        competenceDate: dateAt(year, month, 18),
        financialDate: dateAt(year, month, 18),
        grossAmount: 12000,
        netAmount: 12000,
        counterpartyName: "Banco do Brasil — Capital de Giro",
        originalDescription: "Amortização de principal — capital de giro",
        normalizedDescription: "AMORTIZACAO PRINCIPAL EMPRESTIMO",
        managementCategoryId: catDebtPrincipal.id,
        reliabilityRating: "A",
        recurrenceType: "RECURRING_MONTHLY",
      },
    });
  }

  // Eventos não recorrentes / especiais
  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "RECEIVED_INVOICE",
      eventKind: "INVESTMENT",
      competenceDate: dateAt(2026, 4, 22),
      financialDate: dateAt(2026, 4, 22),
      grossAmount: 25000,
      netAmount: 25000,
      counterpartyName: "Equipamentos Industriais Ltda.",
      originalDescription: "Aquisição de máquina CNC usada",
      normalizedDescription: "EQUIPAMENTO MAQUINA INVESTIMENTO",
      managementCategoryId: catInvestment.id,
      reliabilityRating: "B",
      recurrenceType: "ONE_OFF",
      isTransfer: false,
    },
  });

  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "BANK_STATEMENT",
      eventKind: "TRANSFER",
      competenceDate: dateAt(2026, 5, 10),
      financialDate: dateAt(2026, 5, 10),
      grossAmount: 20000,
      netAmount: 20000,
      counterpartyName: "Conta própria Itaú",
      originalDescription: "TED entre contas próprias",
      normalizedDescription: "TRANSFERENCIA TED PROPRIA",
      managementCategoryId: catTransfer.id,
      reliabilityRating: "A",
      isTransfer: true,
      recurrenceType: "ONE_OFF",
    },
  });

  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "ACCOUNTING_BOOK",
      eventKind: "ADJUSTMENT",
      competenceDate: dateAt(2026, 6, 25),
      financialDate: dateAt(2026, 6, 25),
      grossAmount: 8000,
      netAmount: 8000,
      counterpartyName: "Seguradora Central",
      originalDescription: "Reembolso de sinistro — equipamento danificado",
      normalizedDescription: "INDENIZACAO SINISTRO EXTRAORDINARIO",
      managementCategoryId: catNonRecurring.id,
      reliabilityRating: "B",
      recurrenceType: "ONE_OFF",
    },
  });

  // Eventos pendentes de revisão (ERP sem conciliação, ambíguos)
  const ambiguousEvent1 = await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "ERP",
      eventKind: "UNKNOWN",
      financialDate: dateAt(2026, 6, 12),
      grossAmount: 48000,
      netAmount: 48000,
      counterpartyName: "Fornecedor X",
      originalDescription: "Lançamento ERP não classificado",
      normalizedDescription: "FORNECEDOR X LANCAMENTO",
      reliabilityRating: "UNKNOWN",
      needsReview: true,
    },
  });

  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "MESSAGING",
      eventKind: "UNKNOWN",
      financialDate: dateAt(2026, 6, 14),
      grossAmount: 15000,
      netAmount: 15000,
      counterpartyName: "Cliente informal (WhatsApp)",
      originalDescription: "Promessa de pagamento via WhatsApp, sem comprovante",
      normalizedDescription: "PROMESSA PAGAMENTO WHATSAPP",
      reliabilityRating: "D",
      needsReview: true,
    },
  });

  // Duplicata proposital para demonstrar o DeduplicatorAgent
  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "RECEIVED_INVOICE",
      eventKind: "COST",
      financialDate: dateAt(2026, 6, 10),
      grossAmount: Number(1512.0),
      netAmount: 1512.0,
      counterpartyName: "Fornecedor Componentes Industriais SP",
      originalDescription: "NF-e componentes (lançamento duplicado por engano)",
      normalizedDescription: "FORNECEDOR COMPONENTE MATERIAL PECAS DUPLICADO",
      reliabilityRating: "C",
    },
  });
  await prisma.financialEvent.create({
    data: {
      companyId: company.id,
      sourceType: "RECEIVED_INVOICE",
      eventKind: "COST",
      financialDate: dateAt(2026, 6, 11),
      grossAmount: 1512.0,
      netAmount: 1512.0,
      counterpartyName: "Fornecedor Componentes Industriais SP",
      originalDescription: "NF-e componentes (lançamento duplicado por engano)",
      normalizedDescription: "FORNECEDOR COMPONENTE MATERIAL PECAS DUPLICADO",
      reliabilityRating: "C",
    },
  });

  // ---------------------------------------------------------------
  // Eventos de caixa (extrato bancário — base para Situação Financeira)
  // ---------------------------------------------------------------
  for (const { year, month } of months) {
    for (const client of CLIENTS) {
      await prisma.financialEvent.create({
        data: {
          companyId: company.id,
          sourceType: "BANK_STATEMENT",
          eventKind: "CASH_IN",
          financialDate: dateAt(year, month, 12),
          grossAmount: client.amount,
          netAmount: client.amount,
          counterpartyName: client.name,
          originalDescription: `Recebimento — ${client.name}`,
          normalizedDescription: `RECEBIMENTO ${client.name.toUpperCase()}`,
          reliabilityRating: "A",
        },
      });
    }
    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "CASH_OUT",
        financialDate: dateAt(year, month, 6),
        grossAmount: 45000,
        netAmount: 45000,
        counterpartyName: "Folha de pagamento",
        originalDescription: "Pagamento de folha",
        normalizedDescription: "PAGAMENTO FOLHA",
        reliabilityRating: "A",
      },
    });
    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "CASH_OUT",
        financialDate: dateAt(year, month, 11),
        grossAmount: 33600,
        netAmount: 33600,
        counterpartyName: "Fornecedor Componentes Industriais SP",
        originalDescription: "Pagamento fornecedor de materiais",
        normalizedDescription: "PAGAMENTO FORNECEDOR MATERIAIS",
        reliabilityRating: "A",
      },
    });
    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "CASH_OUT",
        financialDate: dateAt(year, month, 18),
        grossAmount: 16200,
        netAmount: 16200,
        counterpartyName: "Banco do Brasil — Capital de Giro",
        originalDescription: "Parcela do empréstimo (juros + principal)",
        normalizedDescription: "PARCELA EMPRESTIMO",
        reliabilityRating: "A",
      },
    });
    await prisma.financialEvent.create({
      data: {
        companyId: company.id,
        sourceType: "BANK_STATEMENT",
        eventKind: "CASH_OUT",
        financialDate: dateAt(year, month, 20),
        grossAmount: 9800,
        netAmount: 9800,
        counterpartyName: "Receita Federal / Prefeitura",
        originalDescription: "Pagamento de guias fiscais",
        normalizedDescription: "PAGAMENTO GUIAS FISCAIS",
        reliabilityRating: "A",
      },
    });
  }

  console.log("Eventos financeiros criados. Rodando auditoria de qualidade...");
  await new QualityAuditorAgent().run({ companyId: company.id }, { companyId: company.id, actorUserId: adminUser.id });

  // ---------------------------------------------------------------
  // Contas a receber / pagar / dívidas / impostos
  // ---------------------------------------------------------------
  await prisma.receivable.createMany({
    data: [
      {
        companyId: company.id,
        customerName: "Metalúrgica Vetta Ltda.",
        amount: 72000,
        dueDate: daysFromNow(15),
        probability: 0.95,
        reliabilityRating: "A",
      },
      {
        companyId: company.id,
        customerName: "Agroindustrial Bomtempo S.A.",
        amount: 54000,
        dueDate: daysFromNow(25),
        probability: 0.85,
        reliabilityRating: "B",
      },
      {
        companyId: company.id,
        customerName: "Log-Tech Transportes Ltda.",
        amount: 38000,
        dueDate: daysAgo(5),
        status: "OVERDUE",
        probability: 0.6,
        reliabilityRating: "C",
        notes: "Cliente com histórico de atraso recorrente — acompanhar de perto.",
      },
      {
        companyId: company.id,
        customerName: "Novo prospect (pipeline comercial)",
        amount: 22000,
        dueDate: daysFromNow(45),
        probability: 0.3,
        reliabilityRating: "D",
        notes: "Hipótese comercial de Gerson, sem contrato assinado.",
      },
    ],
  });

  await prisma.payable.createMany({
    data: [
      {
        companyId: company.id,
        supplierName: "Fornecedor Componentes Industriais SP",
        amount: 33600,
        dueDate: daysFromNow(10),
        criticality: "HIGH",
        reliabilityRating: "A",
      },
      {
        companyId: company.id,
        supplierName: "Imobiliária Central (aluguel)",
        amount: 8000,
        dueDate: daysAgo(3),
        status: "OVERDUE",
        criticality: "CRITICAL",
        reliabilityRating: "A",
      },
      {
        companyId: company.id,
        supplierName: "Técnicos terceirizados de instalação",
        amount: 12500,
        dueDate: daysFromNow(7),
        criticality: "MEDIUM",
        renegotiable: true,
        reliabilityRating: "B",
      },
      {
        companyId: company.id,
        supplierName: "Fornecedor de equipamentos (parcela)",
        amount: 9000,
        dueDate: daysFromNow(20),
        criticality: "LOW",
        renegotiable: true,
        reliabilityRating: "B",
      },
    ],
  });

  await prisma.debt.create({
    data: {
      companyId: company.id,
      creditorName: "Banco do Brasil",
      debtType: "Capital de giro",
      principalBalance: 180000,
      interestRateMonthly: 0.023,
      interestRateAnnual: 0.313,
      installmentAmount: 16200,
      nextDueDate: daysFromNow(18),
      maturityDate: dateAt(2027, 8, 18),
      guarantees: "Aval dos sócios",
      renegotiationPossibility: "Possível alongar prazo em 12 meses",
      reliabilityRating: "A",
    },
  });

  await prisma.debt.create({
    data: {
      companyId: company.id,
      creditorName: "Financeira Equipamentos Ltda.",
      debtType: "Financiamento de equipamento",
      principalBalance: 42000,
      interestRateMonthly: 0.018,
      installmentAmount: 3800,
      nextDueDate: daysFromNow(12),
      maturityDate: dateAt(2027, 1, 15),
      reliabilityRating: "B",
    },
  });

  await prisma.taxObligation.createMany({
    data: [
      {
        companyId: company.id,
        taxType: "Simples Nacional",
        competence: "06/2026",
        amount: 9800,
        dueDate: daysFromNow(17),
        reliabilityRating: "A",
      },
      {
        companyId: company.id,
        taxType: "ISS retido",
        competence: "05/2026",
        amount: 2100,
        dueDate: daysAgo(8),
        status: "OVERDUE",
        reliabilityRating: "A",
      },
      {
        companyId: company.id,
        taxType: "FGTS",
        competence: "06/2026",
        amount: 4300,
        dueDate: daysFromNow(9),
        reliabilityRating: "A",
      },
    ],
  });

  // ---------------------------------------------------------------
  // DRE dos últimos 4 meses
  // ---------------------------------------------------------------
  console.log("Gerando DRE dos últimos meses...");
  for (const { year, month } of months) {
    const periodStart = dateAt(year, month, 1);
    const periodEnd = new Date(Date.UTC(year, month, 0));
    await new DREAgent().run(
      { companyId: company.id, periodStart, periodEnd },
      { companyId: company.id, actorUserId: adminUser.id, rationale: "Geração de DRE demo." }
    );
  }

  // ---------------------------------------------------------------
  // Forecast (3 cenários x 2 horizontes)
  // ---------------------------------------------------------------
  console.log("Gerando forecasts...");
  const treasury = await new TreasuryAgent().run({ companyId: company.id });
  const startingBalance = treasury.output.currentCash;

  let last30DayForecastId: string | null = null;
  for (const scenario of ["CONSERVATIVE", "BASE", "OPTIMISTIC"] as const) {
    const daily = await new ForecastAgent().run(
      { companyId: company.id, startingBalance, scenario, horizonDays: 30 },
      { companyId: company.id, actorUserId: adminUser.id, rationale: "Forecast diário demo." }
    );
    if (scenario === "CONSERVATIVE") last30DayForecastId = daily.output.forecastId;

    await new ForecastAgent().run(
      { companyId: company.id, startingBalance, scenario, horizonEndOfYear: true },
      { companyId: company.id, actorUserId: adminUser.id, rationale: "Forecast mensal até dezembro (demo)." }
    );
  }

  // ---------------------------------------------------------------
  // Backtesting — cria um forecast "do passado" e compara com o realizado
  // ---------------------------------------------------------------
  console.log("Gerando backtesting...");
  const pastForecast = await prisma.forecast.create({
    data: {
      companyId: company.id,
      name: "Fluxo de caixa 30 dias (histórico — junho/2026)",
      horizonStart: dateAt(2026, 6, 1),
      horizonEnd: dateAt(2026, 6, 30),
      scenario: "BASE",
      confidenceScore: 0.6,
    },
  });

  const junDays = Array.from({ length: 30 }, (_, i) => i + 1);
  let runningBalance = 40000;
  await prisma.forecastLine.createMany({
    data: junDays.map((day) => {
      const opening = runningBalance;
      const inflow = day === 12 ? 164000 * 0.9 : 0;
      const outflow = [6, 11, 18, 20].includes(day) ? [45000, 33600, 16200, 9800][[6, 11, 18, 20].indexOf(day)] : 0;
      const closing = opening + inflow - outflow;
      runningBalance = closing;
      return {
        forecastId: pastForecast.id,
        date: dateAt(2026, 6, day),
        openingBalance: opening,
        confirmedInflows: inflow,
        probableInflows: 0,
        possibleInflows: 0,
        mandatoryOutflows: outflow,
        renegotiableOutflows: 0,
        deferrableOutflows: 0,
        closingBalance: closing,
        confidence: 0.6,
      };
    }),
  });

  await new BacktestingAgent().run(
    { companyId: company.id, forecastId: pastForecast.id },
    { companyId: company.id, actorUserId: adminUser.id, rationale: "Backtesting demo do forecast de junho/2026." }
  );

  // ---------------------------------------------------------------
  // Recomendações e decisões
  // ---------------------------------------------------------------
  console.log("Criando recomendações e decisões...");
  const recCobranca = await prisma.recommendation.create({
    data: {
      companyId: company.id,
      title: "Cobrar Log-Tech Transportes (recebível vencido)",
      description:
        "Cliente com recebível de R$ 38.000 vencido há 5 dias e histórico de atraso. Evidência: contas a receber + extrato bancário sem entrada correspondente.",
      area: "COLLECTION",
      urgency: "HIGH",
      impact: "HIGH",
      confidence: "B",
      expectedFinancialImpact: 38000,
      deadline: daysFromNow(5),
      ownerPersonId: tania.id,
      status: "OPEN",
    },
  });

  const recRenegociar = await prisma.recommendation.create({
    data: {
      companyId: company.id,
      title: "Renegociar prazo com fornecedor de componentes",
      description:
        "Concentração de saídas obrigatórias na mesma semana do pagamento de folha. Renegociar prazo de 10 para 20 dias reduziria pressão de caixa.",
      area: "TREASURY",
      urgency: "MEDIUM",
      impact: "MEDIUM",
      confidence: "C",
      expectedFinancialImpact: 33600,
      deadline: daysFromNow(10),
      ownerPersonId: william.id,
      status: "OPEN",
    },
  });

  await prisma.recommendation.create({
    data: {
      companyId: company.id,
      title: "Revisar precificação de projetos Log-Tech",
      description: "Margem de contribuição do cliente Log-Tech está abaixo da média — revisar tabela de preços do próximo contrato.",
      area: "PRICING",
      urgency: "MEDIUM",
      impact: "MEDIUM",
      confidence: "C",
      ownerPersonId: gerson.id,
      status: "OPEN",
    },
  });

  await prisma.recommendation.create({
    data: {
      companyId: company.id,
      title: "Formalizar alçadas de aprovação de despesas",
      description: "Não há alçada formal para despesas acima de R$ 10.000 — hoje toda decisão passa apenas por Enrique.",
      area: "GOVERNANCE",
      urgency: "MEDIUM",
      impact: "HIGH",
      confidence: "B",
      ownerPersonId: enrique.id,
      status: "OPEN",
    },
  });

  await prisma.recommendation.create({
    data: {
      companyId: company.id,
      title: "Criar reunião semanal de tesouraria",
      description: "Instituir ritual semanal fixo de 30 minutos para revisar caixa, recebíveis e pagáveis críticos.",
      area: "GOVERNANCE",
      urgency: "LOW",
      impact: "MEDIUM",
      confidence: "A",
      ownerPersonId: tania.id,
      status: "IN_PROGRESS",
    },
  });

  await prisma.decision.create({
    data: {
      companyId: company.id,
      recommendationId: recCobranca.id,
      title: "Autorizar cobrança formal de Log-Tech Transportes",
      decisionText: "Enviar notificação formal de cobrança e suspender novos projetos até regularização.",
      decidedByUserId: directorUser.id,
      scenarioConsidered: "CONSERVATIVE",
      informationRating: "B",
      expectedImpact: "Recebimento de R$ 38.000 em até 10 dias",
      responsiblePerson: "Tânia Ferreira",
      deadline: daysFromNow(10),
      status: "PLANNED",
    },
  });

  await prisma.decision.create({
    data: {
      companyId: company.id,
      recommendationId: recRenegociar.id,
      title: "Negociar novo prazo com fornecedor de componentes",
      decisionText: "William negociou prazo de 20 dias a partir do próximo pedido.",
      decidedByUserId: directorUser.id,
      scenarioConsidered: "BASE",
      informationRating: "C",
      expectedImpact: "Redução de pressão de caixa em ~R$ 33.600/mês por 10 dias adicionais",
      actualImpact: "Fornecedor aceitou parcialmente: 15 dias de prazo.",
      responsiblePerson: "William Torres",
      deadline: daysAgo(2),
      status: "EXECUTED",
    },
  });

  // ---------------------------------------------------------------
  // PDCA e melhoria contínua
  // ---------------------------------------------------------------
  console.log("Criando ciclos PDCA...");
  await new ContinuousImprovementAgent().run(
    {
      companyId: company.id,
      problem: "Atraso recorrente no recebimento do cliente Log-Tech Transportes pressiona o caixa mensalmente.",
      rootCauseHint: "Ausência de contrato com multa por atraso e de rotina de cobrança preventiva.",
      ownerPersonId: tania.id,
      dueDate: daysFromNow(20),
    },
    { companyId: company.id, actorUserId: adminUser.id }
  );

  await new ContinuousImprovementAgent().run(
    {
      companyId: company.id,
      problem: "Lançamentos de fornecedores frequentemente chegam ao ERP sem conciliação com o extrato bancário.",
      ownerPersonId: william.id,
      dueDate: daysFromNow(30),
    },
    { companyId: company.id, actorUserId: adminUser.id }
  );

  // ---------------------------------------------------------------
  // Governança: rituais e atas
  // ---------------------------------------------------------------
  console.log("Criando rituais de governança...");
  const treasuryRitual = await prisma.governanceRitual.create({
    data: {
      companyId: company.id,
      name: "Reunião Semanal de Tesouraria",
      type: "TREASURY_WEEKLY",
      frequency: "WEEKLY",
      ownerPersonId: tania.id,
      agendaTemplate: "Caixa atual, recebíveis críticos, pagáveis críticos, decisões pendentes.",
    },
  });

  const monthlyClosingRitual = await prisma.governanceRitual.create({
    data: {
      companyId: company.id,
      name: "Fechamento Mensal",
      type: "MONTHLY_CLOSING",
      frequency: "MONTHLY",
      ownerPersonId: consultorPessoa.id,
      agendaTemplate: "DRE do mês, situação financeira, forecast, backtesting, PDCA.",
    },
  });

  await prisma.governanceRitual.create({
    data: {
      companyId: company.id,
      name: "Comitê Financeiro",
      type: "COMMITTEE",
      frequency: "MONTHLY",
      ownerPersonId: enrique.id,
      agendaTemplate: "Decisões de crédito, investimento e corte de custos.",
    },
  });

  await prisma.meetingRecord.createMany({
    data: [
      {
        companyId: company.id,
        ritualId: treasuryRitual.id,
        date: daysAgo(3),
        title: "Tesouraria semanal — semana 26",
        agenda: "Revisão de caixa e recebíveis críticos.",
        notes: "Confirmada cobrança formal de Log-Tech.",
      },
      {
        companyId: company.id,
        ritualId: treasuryRitual.id,
        date: daysAgo(10),
        title: "Tesouraria semanal — semana 25",
        agenda: "Revisão de pagáveis críticos.",
      },
      {
        companyId: company.id,
        ritualId: monthlyClosingRitual.id,
        date: daysAgo(35),
        title: "Fechamento de maio/2026",
        agenda: "DRE de maio e forecast de junho.",
      },
    ],
  });

  // ---------------------------------------------------------------
  // Avaliação de diretoria
  // ---------------------------------------------------------------
  console.log("Criando avaliação de diretoria...");
  await new DirectorEvaluationAgent().run(
    {
      companyId: company.id,
      periodStart: dateAt(2026, 4, 1),
      periodEnd: dateAt(2026, 6, 30),
      notes: "Primeira avaliação formal de maturidade da diretoria, realizada pelo Consultor Baita.",
      scores: [
        { dimension: "STRATEGIC_LEADERSHIP", criterion: "Clareza de prioridades", score: 3 },
        { dimension: "STRATEGIC_LEADERSHIP", criterion: "Alinhamento de decisões", score: 2 },
        { dimension: "STRATEGIC_LEADERSHIP", criterion: "Comunicação da visão", score: 3 },
        { dimension: "STRATEGIC_LEADERSHIP", criterion: "Previsibilidade decisória", score: 2 },
        { dimension: "EXECUTION_DISCIPLINE", criterion: "OKRs atingidos", score: 2 },
        { dimension: "EXECUTION_DISCIPLINE", criterion: "Iniciativas implementadas", score: 3 },
        { dimension: "EXECUTION_DISCIPLINE", criterion: "Rituais cumpridos", score: 2 },
        { dimension: "EXECUTION_DISCIPLINE", criterion: "Obstáculos removidos", score: 3 },
        { dimension: "GOVERNANCE_ROLES", criterion: "Rituais formais", score: 2 },
        { dimension: "GOVERNANCE_ROLES", criterion: "Atas", score: 2 },
        { dimension: "GOVERNANCE_ROLES", criterion: "Clareza de papéis", score: 1 },
        { dimension: "GOVERNANCE_ROLES", criterion: "Alçadas", score: 1 },
        { dimension: "GOVERNANCE_ROLES", criterion: "Gestão colegiada", score: 2 },
        { dimension: "FINANCIAL_MANAGEMENT", criterion: "DRE confiável", score: 3 },
        { dimension: "FINANCIAL_MANAGEMENT", criterion: "Fluxo de caixa", score: 3 },
        { dimension: "FINANCIAL_MANAGEMENT", criterion: "Forecast", score: 2 },
        { dimension: "FINANCIAL_MANAGEMENT", criterion: "Erro previsto x realizado", score: 2 },
        { dimension: "FINANCIAL_MANAGEMENT", criterion: "Dívida e capital de giro", score: 3 },
        { dimension: "COOPERATION_MATURITY", criterion: "Divergências produtivas", score: 3 },
        { dimension: "COOPERATION_MATURITY", criterion: "Ausência de decisões paralelas", score: 2 },
        { dimension: "COOPERATION_MATURITY", criterion: "Comunicação institucional", score: 2 },
        { dimension: "COOPERATION_MATURITY", criterion: "Conflitos encaminhados", score: 3 },
        { dimension: "COMMERCIAL_GROWTH", criterion: "Pipeline", score: 3 },
        { dimension: "COMMERCIAL_GROWTH", criterion: "Taxa de conversão", score: 3 },
        { dimension: "COMMERCIAL_GROWTH", criterion: "Receita recorrente", score: 4 },
        { dimension: "COMMERCIAL_GROWTH", criterion: "Margem por cliente/projeto", score: 2 },
        { dimension: "COMMERCIAL_GROWTH", criterion: "Posicionamento", score: 3 },
        { dimension: "SYSTEMS_PROCESSES", criterion: "ERP/CRM/PMO", score: 2 },
        { dimension: "SYSTEMS_PROCESSES", criterion: "Documentação", score: 2 },
        { dimension: "SYSTEMS_PROCESSES", criterion: "Repetibilidade", score: 2 },
        { dimension: "SYSTEMS_PROCESSES", criterion: "Redução de improviso", score: 1 },
        { dimension: "LEARNING_DEVELOPMENT", criterion: "PDCA", score: 2 },
        { dimension: "LEARNING_DEVELOPMENT", criterion: "Feedback", score: 2 },
        { dimension: "LEARNING_DEVELOPMENT", criterion: "Desenvolvimento de pessoas", score: 2 },
        { dimension: "LEARNING_DEVELOPMENT", criterion: "Sucessão", score: 1 },
        { dimension: "LEARNING_DEVELOPMENT", criterion: "Melhoria contínua", score: 2 },
      ],
    },
    { companyId: company.id, actorUserId: adminUser.id }
  );

  // ---------------------------------------------------------------
  // Desenvolvimento organizacional
  // ---------------------------------------------------------------
  console.log("Registrando estágio Adizes...");
  await new OrganizationalDevelopmentAgent().run(
    { companyId: company.id, observedStage: "GO_GO", stageConfidence: 0.65 },
    { companyId: company.id, actorUserId: adminUser.id }
  );

  // ---------------------------------------------------------------
  // Mensagens acionáveis / interações humanas
  // ---------------------------------------------------------------
  console.log("Gerando mensagens acionáveis de exemplo...");
  const classifyMessage = await new ActionableMessageAgent().run({
    kind: "CLASSIFY_EVENT",
    personId: tania.id,
    eventId: ambiguousEvent1.id,
  });
  await prisma.humanInteraction.create({
    data: {
      companyId: company.id,
      personId: tania.id,
      channel: classifyMessage.output.channel ?? "WhatsApp",
      purpose: "Classificação de lançamento ambíguo",
      messageText: classifyMessage.output.message,
    },
  });

  const cashRiskMessage = await new ActionableMessageAgent().run({
    kind: "CASH_RISK",
    personId: enrique.id,
    riskDate: daysFromNow(15).toISOString().slice(0, 10),
    riskAmount: 38000,
    recommendationText: "renegociar fornecedor de componentes e confirmar recebimento de Log-Tech Transportes",
  });
  await prisma.humanInteraction.create({
    data: {
      companyId: company.id,
      personId: enrique.id,
      channel: cashRiskMessage.output.channel ?? "WhatsApp",
      purpose: "Alerta de risco de caixa",
      messageText: cashRiskMessage.output.message,
    },
  });

  const accountantMessage = await new ActionableMessageAgent().run({
    kind: "ACCOUNTANT_REQUEST",
    personId: contador.id,
    competence: "junho/2026",
    items: ["balancete", "DRE contábil", "razão de empréstimos", "guias fiscais", "parcelamentos ativos"],
  });
  await prisma.humanInteraction.create({
    data: {
      companyId: company.id,
      personId: contador.id,
      channel: accountantMessage.output.channel ?? "E-mail",
      purpose: "Solicitação de documentos contábeis",
      messageText: accountantMessage.output.message,
    },
  });

  // ---------------------------------------------------------------
  // Relatório executivo inicial
  // ---------------------------------------------------------------
  console.log("Gerando relatório executivo inicial...");
  if (last30DayForecastId) {
    await new ReportAgent().run(
      { companyId: company.id, reportType: "INITIAL_DIAGNOSIS", generatedById: consultantUser.id },
      { companyId: company.id, actorUserId: consultantUser.id }
    );
  }

  console.log("Seed concluído com sucesso.");
  console.log("Login demo: admin@baita.ai / baita123 (ou consultor@baita.ai / enrique@setupautomacao.com.br)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
