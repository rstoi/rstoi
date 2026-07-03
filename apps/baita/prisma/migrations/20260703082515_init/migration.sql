-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CONSULTANT', 'ANALYST', 'COMPANY_OWNER', 'COMPANY_FINANCE', 'COMPANY_DIRECTOR', 'ACCOUNTANT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "CareerStage" AS ENUM ('BEGINNER', 'GROWING', 'SENIOR', 'PHASEOUT');

-- CreateEnum
CREATE TYPE "AdizesLifecycleStage" AS ENUM ('COURTSHIP', 'INFANCY', 'GO_GO', 'ADOLESCENCE', 'PRIME', 'STABILITY', 'ARISTOCRACY', 'EARLY_BUREAUCRACY', 'BUREAUCRACY', 'DEATH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('BANK_STATEMENT', 'ISSUED_INVOICE', 'RECEIVED_INVOICE', 'ACCOUNTING_BOOK', 'GOVERNMENT_DECLARATION', 'ERP', 'CLOUD_FILE', 'EMAIL', 'MESSAGING', 'CONTRACT', 'SPREADSHEET', 'CREDIT_BUREAU', 'TAX', 'LEGAL', 'BENCHMARK', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'PROCESSED_WITH_WARNINGS', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FinancialEventKind" AS ENUM ('CASH_IN', 'CASH_OUT', 'REVENUE', 'COST', 'EXPENSE', 'INVESTMENT', 'DEBT_PRINCIPAL', 'DEBT_INTEREST', 'TAX', 'TRANSFER', 'ADJUSTMENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DreLine" AS ENUM ('GROSS_REVENUE', 'SALES_DEDUCTIONS', 'NET_REVENUE', 'VARIABLE_COSTS', 'CONTRIBUTION_MARGIN', 'FIXED_EXPENSES', 'EBITDA', 'FINANCIAL_EXPENSES', 'NON_RECURRING', 'MANAGEMENT_RESULT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ReliabilityRating" AS ENUM ('A', 'B', 'C', 'D', 'E', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ForecastScenario" AS ENUM ('CONSERVATIVE', 'BASE', 'OPTIMISTIC');

-- CreateEnum
CREATE TYPE "RecommendationArea" AS ENUM ('TREASURY', 'CREDIT', 'INVESTMENT', 'COST_REDUCTION', 'COLLECTION', 'PRICING', 'GOVERNANCE', 'PEOPLE', 'OPERATIONS', 'SALES', 'STRATEGY');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISCARDED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PLANNED', 'EXECUTED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PDCAStatus" AS ENUM ('PLAN', 'DO', 'CHECK', 'ACT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ImprovementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('INITIAL_DIAGNOSIS', 'WEEKLY_TREASURY', 'MONTHLY_FINANCIAL', 'GOVERNANCE', 'BACKTESTING', 'EXECUTIVE_SUMMARY', 'AUDIT');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('ONE_OFF', 'RECURRING_MONTHLY', 'RECURRING_WEEKLY', 'RECURRING_ANNUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'RENEGOTIATED');

-- CreateEnum
CREATE TYPE "TaxStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'INSTALLMENT');

-- CreateEnum
CREATE TYPE "ReconciliationType" AS ENUM ('BANK_VS_DOCUMENT', 'ERP_VS_BANK', 'CONTRACT_VS_OBLIGATION', 'EMAIL_VS_BOLETO', 'OTHER');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'DIVERGENT', 'IGNORED');

-- CreateEnum
CREATE TYPE "GovernanceRitualType" AS ENUM ('TREASURY_WEEKLY', 'MONTHLY_CLOSING', 'QUARTERLY_STRATEGIC', 'BOARD_MEETING', 'COMMITTEE', 'OTHER');

-- CreateEnum
CREATE TYPE "CycleStage" AS ENUM ('CYCLE_0_SCOPE', 'CYCLE_1_CASH', 'CYCLE_2_DRE', 'CYCLE_3_FINANCIAL_POSITION', 'CYCLE_4_FORECAST', 'CYCLE_5_RECONCILIATION', 'CYCLE_6_BACKTESTING', 'RECURRING');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUserAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "cnpj" TEXT,
    "industry" TEXT,
    "revenueRange" TEXT,
    "employeeRange" TEXT,
    "lifecycleStageAdizes" "AdizesLifecycleStage" NOT NULL DEFAULT 'UNKNOWN',
    "lifecycleStageConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maturityScore" DOUBLE PRECISION,
    "managementSystemLevel" INTEGER NOT NULL DEFAULT 0,
    "mainPains" TEXT,
    "perceivedStage" TEXT,
    "existingSystems" TEXT,
    "banksUsed" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImplementationCycle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stage" "CycleStage" NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "formalRole" TEXT,
    "realRole" TEXT,
    "careerStage" "CareerStage" NOT NULL DEFAULT 'GROWING',
    "communicationPreference" TEXT,
    "preferredChannel" TEXT,
    "preferredFormat" TEXT,
    "averageResponseTimeHours" DOUBLE PRECISION,
    "reliabilityNotes" TEXT,
    "overloadRisk" TEXT,
    "bestInteractionWindow" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonTopicReliability" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "rating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonTopicReliability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerPersonId" TEXT,
    "availabilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "accessStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "confidenceInitial" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "format" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "uploadedById" TEXT,
    "uploadedByPersonId" TEXT,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractionConfidence" DOUBLE PRECISION,
    "processingNotes" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "extractedJson" JSONB NOT NULL,
    "extractionNotes" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "dreLine" "DreLine" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "cashFlowGroup" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ruleHints" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceType" "DataSourceType" NOT NULL,
    "sourceId" TEXT,
    "extractedDocumentId" TEXT,
    "eventKind" "FinancialEventKind" NOT NULL DEFAULT 'UNKNOWN',
    "documentDate" TIMESTAMP(3),
    "competenceDate" TIMESTAMP(3),
    "financialDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "counterpartyName" TEXT,
    "counterpartyDocument" TEXT,
    "originalDescription" TEXT,
    "normalizedDescription" TEXT,
    "managementCategoryId" TEXT,
    "costCenter" TEXT,
    "businessUnit" TEXT,
    "project" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'UNKNOWN',
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "qualityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "auditabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "materialityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerDocument" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "expectedPaymentDate" TIMESTAMP(3),
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sourceEventId" TEXT,
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierDocument" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "renegotiable" BOOLEAN NOT NULL DEFAULT false,
    "sourceEventId" TEXT,
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "debtType" TEXT NOT NULL,
    "principalBalance" DECIMAL(18,2) NOT NULL,
    "interestRateMonthly" DOUBLE PRECISION,
    "interestRateAnnual" DOUBLE PRECISION,
    "installmentAmount" DECIMAL(18,2),
    "nextDueDate" TIMESTAMP(3),
    "maturityDate" TIMESTAMP(3),
    "guarantees" TEXT,
    "renegotiationPossibility" TEXT,
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxObligation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaxStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT,
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DRE" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossRevenue" DECIMAL(18,2) NOT NULL,
    "salesDeductions" DECIMAL(18,2) NOT NULL,
    "netRevenue" DECIMAL(18,2) NOT NULL,
    "variableCosts" DECIMAL(18,2) NOT NULL,
    "contributionMargin" DECIMAL(18,2) NOT NULL,
    "fixedExpenses" DECIMAL(18,2) NOT NULL,
    "ebitda" DECIMAL(18,2) NOT NULL,
    "financialExpenses" DECIMAL(18,2) NOT NULL,
    "nonRecurring" DECIMAL(18,2) NOT NULL,
    "managementResult" DECIMAL(18,2) NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DRE_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DRELineItem" (
    "id" TEXT NOT NULL,
    "dreId" TEXT NOT NULL,
    "categoryId" TEXT,
    "label" TEXT NOT NULL,
    "dreLine" "DreLine" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "DRELineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "primaryEventId" TEXT NOT NULL,
    "relatedEventId" TEXT,
    "reconciliationType" "ReconciliationType" NOT NULL,
    "divergenceAmount" DECIMAL(18,2),
    "divergenceDescription" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "reliabilityRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forecast" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonStart" TIMESTAMP(3) NOT NULL,
    "horizonEnd" TIMESTAMP(3) NOT NULL,
    "scenario" "ForecastScenario" NOT NULL,
    "assumptionsJson" JSONB,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastLine" (
    "id" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "confirmedInflows" DECIMAL(18,2) NOT NULL,
    "probableInflows" DECIMAL(18,2) NOT NULL,
    "possibleInflows" DECIMAL(18,2) NOT NULL,
    "mandatoryOutflows" DECIMAL(18,2) NOT NULL,
    "renegotiableOutflows" DECIMAL(18,2) NOT NULL,
    "deferrableOutflows" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ForecastLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" "RecommendationArea" NOT NULL,
    "urgency" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "impact" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "evidenceJson" JSONB,
    "expectedFinancialImpact" DECIMAL(18,2),
    "deadline" TIMESTAMP(3),
    "ownerPersonId" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "title" TEXT NOT NULL,
    "decisionText" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedByPersonId" TEXT,
    "decisionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scenarioConsidered" "ForecastScenario",
    "informationRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "expectedImpact" TEXT,
    "actualImpact" TEXT,
    "responsiblePerson" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "DecisionStatus" NOT NULL DEFAULT 'PLANNED',
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestingRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalAbsoluteError" DECIMAL(18,2) NOT NULL,
    "totalPercentageError" DOUBLE PRECISION NOT NULL,
    "bias" TEXT NOT NULL,
    "accuracyScore" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestingLine" (
    "id" TEXT NOT NULL,
    "backtestingRunId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "predictedAmount" DECIMAL(18,2) NOT NULL,
    "actualAmount" DECIMAL(18,2) NOT NULL,
    "absoluteError" DECIMAL(18,2) NOT NULL,
    "percentageError" DOUBLE PRECISION NOT NULL,
    "cause" TEXT,
    "adjustmentRecommendation" TEXT,

    CONSTRAINT "BacktestingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDCARecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleName" TEXT NOT NULL,
    "planText" TEXT NOT NULL,
    "doText" TEXT,
    "checkText" TEXT,
    "actText" TEXT,
    "status" "PDCAStatus" NOT NULL DEFAULT 'PLAN',
    "ownerPersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDCARecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "ownerPersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "ImprovementStatus" NOT NULL DEFAULT 'OPEN',
    "expectedImpact" TEXT,
    "observedResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImprovementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceRitual" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GovernanceRitualType" NOT NULL,
    "frequency" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "agendaTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceRitual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ritualId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "notes" TEXT,
    "decisionsJson" JSONB,
    "actionItemsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorEvaluation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "strategicLeadershipScore" DOUBLE PRECISION NOT NULL,
    "executionDisciplineScore" DOUBLE PRECISION NOT NULL,
    "governanceScore" DOUBLE PRECISION NOT NULL,
    "financialManagementScore" DOUBLE PRECISION NOT NULL,
    "cooperationScore" DOUBLE PRECISION NOT NULL,
    "commercialGrowthScore" DOUBLE PRECISION NOT NULL,
    "systemsProcessesScore" DOUBLE PRECISION NOT NULL,
    "learningDevelopmentScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorEvaluationItem" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "description" TEXT,
    "expectedEvidence" TEXT,
    "score" INTEGER NOT NULL,
    "evidenceNotes" TEXT,
    "recommendation" TEXT,

    CONSTRAINT "DirectorEvaluationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanInteraction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "responseText" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "responseQuality" INTEGER,
    "responseCompleteness" INTEGER,
    "responseReliability" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "resultingEvidenceRating" "ReliabilityRating" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "agentName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "htmlContent" TEXT NOT NULL,
    "pdfPath" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUserAccess_companyId_userId_key" ON "CompanyUserAccess"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImplementationCycle_companyId_stage_key" ON "ImplementationCycle"("companyId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "PersonTopicReliability_personId_topic_key" ON "PersonTopicReliability"("personId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementCategory_companyId_name_parentId_key" ON "ManagementCategory"("companyId", "name", "parentId");

-- CreateIndex
CREATE INDEX "FinancialEvent_companyId_financialDate_idx" ON "FinancialEvent"("companyId", "financialDate");

-- CreateIndex
CREATE INDEX "FinancialEvent_companyId_eventKind_idx" ON "FinancialEvent"("companyId", "eventKind");

-- CreateIndex
CREATE UNIQUE INDEX "DRE_companyId_periodStart_periodEnd_key" ON "DRE"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ForecastLine_forecastId_date_idx" ON "ForecastLine"("forecastId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserAccess" ADD CONSTRAINT "CompanyUserAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUserAccess" ADD CONSTRAINT "CompanyUserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationCycle" ADD CONSTRAINT "ImplementationCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonTopicReliability" ADD CONSTRAINT "PersonTopicReliability_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedByPersonId_fkey" FOREIGN KEY ("uploadedByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedDocument" ADD CONSTRAINT "ExtractedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedDocument" ADD CONSTRAINT "ExtractedDocument_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCategory" ADD CONSTRAINT "ManagementCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementCategory" ADD CONSTRAINT "ManagementCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ManagementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_extractedDocumentId_fkey" FOREIGN KEY ("extractedDocumentId") REFERENCES "ExtractedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_managementCategoryId_fkey" FOREIGN KEY ("managementCategoryId") REFERENCES "ManagementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "FinancialEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "FinancialEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRE" ADD CONSTRAINT "DRE_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRELineItem" ADD CONSTRAINT "DRELineItem_dreId_fkey" FOREIGN KEY ("dreId") REFERENCES "DRE"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRELineItem" ADD CONSTRAINT "DRELineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ManagementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_primaryEventId_fkey" FOREIGN KEY ("primaryEventId") REFERENCES "FinancialEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "FinancialEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastLine" ADD CONSTRAINT "ForecastLine_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "Forecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedByPersonId_fkey" FOREIGN KEY ("decidedByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestingRun" ADD CONSTRAINT "BacktestingRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestingRun" ADD CONSTRAINT "BacktestingRun_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "Forecast"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestingLine" ADD CONSTRAINT "BacktestingLine_backtestingRunId_fkey" FOREIGN KEY ("backtestingRunId") REFERENCES "BacktestingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDCARecord" ADD CONSTRAINT "PDCARecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDCARecord" ADD CONSTRAINT "PDCARecord_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementAction" ADD CONSTRAINT "ImprovementAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementAction" ADD CONSTRAINT "ImprovementAction_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceRitual" ADD CONSTRAINT "GovernanceRitual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceRitual" ADD CONSTRAINT "GovernanceRitual_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecord" ADD CONSTRAINT "MeetingRecord_ritualId_fkey" FOREIGN KEY ("ritualId") REFERENCES "GovernanceRitual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorEvaluation" ADD CONSTRAINT "DirectorEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorEvaluationItem" ADD CONSTRAINT "DirectorEvaluationItem_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "DirectorEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanInteraction" ADD CONSTRAINT "HumanInteraction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanInteraction" ADD CONSTRAINT "HumanInteraction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
