/**
 * ExtractorAgent — extrai dados brutos de arquivos enviados. Suporta, no
 * MVP: CSV, XLSX, JSON, TXT, OFX (extrato bancário) e XML de NF-e. PDFs
 * recebem extração simples de texto (sem OCR).
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { BaseAgent, type AgentRunResult } from "@/agents/base-agent";

export type ExtractorInput = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type ExtractorOutput = {
  documentType: string;
  rows: Record<string, unknown>[];
  rawTextSample?: string;
};

function detectFormat(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || mimeType.includes("csv")) return "CSV";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || mimeType.includes("spreadsheet")) return "XLSX";
  if (lower.endsWith(".json") || mimeType.includes("json")) return "JSON";
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx")) return "OFX";
  if (lower.endsWith(".xml") || mimeType.includes("xml")) return "XML_NFE";
  if (lower.endsWith(".pdf") || mimeType.includes("pdf")) return "PDF";
  return "TXT";
}

function parseCsv(content: Buffer): Record<string, unknown>[] {
  const text = content.toString("utf-8");
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function parseXlsx(content: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(content, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

function parseJson(content: Buffer): Record<string, unknown>[] {
  const parsed = JSON.parse(content.toString("utf-8"));
  return Array.isArray(parsed) ? parsed : [parsed];
}

// OFX é SGML: extrai blocos <STMTTRN>...</STMTTRN> com regex tolerante.
function parseOfx(content: Buffer): Record<string, unknown>[] {
  const text = content.toString("utf-8");
  const transactions: Record<string, unknown>[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const field = (tag: string) => {
      const match = body.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
      return match ? match[1].trim() : null;
    };
    transactions.push({
      type: field("TRNTYPE"),
      date: field("DTPOSTED"),
      amount: field("TRNAMT"),
      fitid: field("FITID"),
      memo: field("MEMO") ?? field("NAME"),
    });
  }
  return transactions;
}

function parseXmlNfe(content: Buffer): Record<string, unknown>[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(content.toString("utf-8"));
  const nfe = parsed?.nfeProc?.NFe?.infNFe ?? parsed?.NFe?.infNFe ?? parsed;
  return [nfe as Record<string, unknown>];
}

function parseTxt(content: Buffer): Record<string, unknown>[] {
  const lines = content.toString("utf-8").split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => ({ lineNumber: index + 1, raw: line }));
}

export class ExtractorAgent extends BaseAgent<ExtractorInput, ExtractorOutput> {
  readonly name = "ExtractorAgent";
  readonly version = "1.0.0";
  readonly description = "Extrai dados brutos de arquivos financeiros e operacionais.";

  protected async execute(input: ExtractorInput): Promise<AgentRunResult<ExtractorOutput>> {
    const documentType = detectFormat(input.fileName, input.mimeType);
    const warnings: AgentRunResult<ExtractorOutput>["warnings"] = [];
    let rows: Record<string, unknown>[] = [];
    let confidence = 0.8;

    try {
      switch (documentType) {
        case "CSV":
          rows = parseCsv(input.content);
          break;
        case "XLSX":
          rows = parseXlsx(input.content);
          break;
        case "JSON":
          rows = parseJson(input.content);
          break;
        case "OFX":
          rows = parseOfx(input.content);
          break;
        case "XML_NFE":
          rows = parseXmlNfe(input.content);
          break;
        case "PDF":
          // Extração simples: sem parser de texto de PDF embarcado no MVP,
          // o arquivo é marcado para revisão manual do consultor/analista.
          rows = [];
          confidence = 0.2;
          warnings.push({
            code: "PDF_MANUAL_REVIEW",
            message: "Extração de PDF não é totalmente automática neste MVP — revisar manualmente.",
          });
          break;
        default:
          rows = parseTxt(input.content);
          confidence = 0.5;
      }
    } catch (error) {
      return {
        output: { documentType, rows: [] },
        confidence: 0,
        warnings,
        errors: [{ code: "PARSE_ERROR", message: (error as Error).message }],
        ruleBasedMode: true,
      };
    }

    if (rows.length === 0 && documentType !== "PDF") {
      warnings.push({ code: "EMPTY_FILE", message: "Nenhum registro extraído do arquivo." });
      confidence = Math.min(confidence, 0.3);
    }

    return {
      output: { documentType, rows },
      confidence,
      warnings,
      errors: [],
      ruleBasedMode: true,
    };
  }
}
