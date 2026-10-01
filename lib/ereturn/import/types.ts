import type { FinancialAssetKind, InvestmentKind, LineCode, TaxPaymentKind } from "../lines";

// What a document says a return should contain. Parsers produce these; the review
// screen shows them; the import action applies the ones the taxpayer keeps.

export const PROFILE_FIELDS = {
  name: "Name",
  nid: "NID",
  tin: "TIN",
  circle: "Circle",
  taxZone: "Taxes zone",
  dateOfBirth: "Date of birth",
  fatherName: "Father's / husband's name",
  address: "Address",
  phone: "Mobile",
  email: "Email",
  employerName: "Employer",
  serialNo: "Return register serial no.",
  filedAt: "Date submitted",
} as const;
export type ProfileField = keyof typeof PROFILE_FIELDS;

export interface AssetProposal {
  type: "asset";
  kind: FinancialAssetKind;
  institution: string;
  branch?: string;
  /** Account or registration number — how the same account is recognised across documents. */
  reference?: string;
  description?: string;
  /** YYYY-MM-DD */
  openedDate?: string;
  value?: number;
  income?: number;
  taxDeducted?: number;
}

export interface PaymentProposal {
  type: "payment";
  kind: TaxPaymentKind;
  /** Challan number. */
  reference: string;
  /** YYYY-MM-DD */
  date?: string;
  amount: number;
  depositedBy?: string;
  bank?: string;
  branch?: string;
  note?: string;
}

export type Proposal =
  | { type: "profile"; field: ProfileField; value: string }
  | AssetProposal
  | PaymentProposal
  | { type: "line"; code: LineCode; amount: number; note?: string }
  | { type: "investment"; kind: InvestmentKind; amount: number; description?: string }
  | { type: "previousNetWealth"; amount: number };

export type DocumentKind =
  | "NBR_RETURN"
  | "SALARY_CHALLAN"
  | "SALARY_CERTIFICATE"
  | "BANK_TAX_CERTIFICATE"
  | "BANK_STATEMENT"
  | "SANCHAYAPATRA"
  | "UNKNOWN";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  NBR_RETURN: "Income tax return",
  SALARY_CHALLAN: "Salary TDS challan",
  SALARY_CERTIFICATE: "Employer's salary certificate",
  BANK_TAX_CERTIFICATE: "Bank tax certificate",
  BANK_STATEMENT: "Bank statement",
  SANCHAYAPATRA: "Sanchayapatra certificate",
  UNKNOWN: "Not recognised",
};

/**
 * How much to trust a document's figure when two documents disagree about the same
 * account: a bank's tax certificate is the authority on interest and source tax, a
 * statement only implies them.
 */
export const SOURCE_RANK: Record<DocumentKind, number> = {
  BANK_TAX_CERTIFICATE: 5,
  SALARY_CERTIFICATE: 5,
  SANCHAYAPATRA: 4,
  NBR_RETURN: 3,
  SALARY_CHALLAN: 3,
  BANK_STATEMENT: 2,
  UNKNOWN: 0,
};

export interface ParsedDocument {
  kind: DocumentKind;
  /** One line about what was found, e.g. "Sonali Bank PLC — account 1234567890123". */
  summary: string;
  proposals: Proposal[];
  /** Useful facts that aren't imported, e.g. the Sanchayapatra profit a statement shows. */
  notes: string[];
  /** Why something may be wrong: another income year, an unfamiliar layout. */
  warnings: string[];
  /** Pages that had to be read by OCR, so their figures deserve a second look. */
  ocr: boolean;
  /** Lower-trust source (e.g. last year's return carrying balances forward). */
  rankOverride?: number;
}

export interface ParseContext {
  /** The return being filled, e.g. "2025-26". */
  incomeYear: string;
  /** The employer on the return, to recognise salary credits in statements. */
  employerName?: string | null;
}
