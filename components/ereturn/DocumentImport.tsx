"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ScanText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAction } from "@/lib/run-action";
import { toast } from "@/components/Toaster";
import { useFormatter } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { FINANCIAL_ASSET_KINDS, INVESTMENT_KINDS, LINE_SECTIONS, TAX_PAYMENT_KINDS } from "@/lib/ereturn/lines";
import { itemsToLines, type TextItem } from "@/lib/ereturn/import/text";
import { parseDocument } from "@/lib/ereturn/import/parsers";
import { mergeDocuments, type ExistingReturn, type ReviewItem } from "@/lib/ereturn/import/merge";
import { DOCUMENT_KIND_LABELS, PROFILE_FIELDS, type ParsedDocument, type Proposal } from "@/lib/ereturn/import/types";
import { importProposals } from "@/app/(app)/ereturn/import-actions";

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

interface FileState {
  id: string;
  name: string;
  status: "waiting" | "reading" | "done" | "error";
  progress: string;
  parsed?: ParsedDocument;
  error?: string;
}

/** Pages with less text than this are scans: they go to OCR. */
const MIN_TEXT = 30;
/** Scans are rendered this wide before OCR; small print needs the pixels. */
const OCR_WIDTH = 2500;

const LINE_LABELS = new Map<string, string>(Object.values(LINE_SECTIONS).flatMap((defs) => defs.map((d) => [d.code, d.label] as [string, string])));

const GROUPS: { type: Proposal["type"][]; title: string }[] = [
  { type: ["profile"], title: "Your details" },
  { type: ["previousNetWealth"], title: "Opening net wealth" },
  { type: ["asset"], title: "Bank accounts and Sanchayapatra" },
  { type: ["payment"], title: "Tax challans" },
  { type: ["line"], title: "Salary, expenses, assets and liabilities" },
  { type: ["investment"], title: "Rebatable investments" },
];

/**
 * Upload the year's documents; they're read here, in the browser, and never sent
 * anywhere. Text PDFs are read directly; scanned pages go through Tesseract OCR with the
 * Bangla model. Every document is then parsed, merged, and shown for review — nothing is
 * saved until the taxpayer imports the rows they keep.
 */
export function DocumentImport({
  returnId,
  incomeYear,
  employerName,
  existing,
}: {
  returnId: string;
  incomeYear: string;
  employerName: string | null;
  existing: ExistingReturn;
}) {
  const fmt = useFormatter();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<Promise<OcrWorker> | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Keys the taxpayer has toggled away from their default (selected unless already there). */
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<FileState>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const ocrWorker = () => {
    ocrRef.current ??= (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker(["ben", "eng"]);
      // Sparse text finds the small print (dates, amounts) that sits beside barcodes.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })();
    return ocrRef.current;
  };

  async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
    const worker = await ocrWorker();
    const { data } = await worker.recognize(canvas);
    return data.text.split("\n");
  }

  async function readPdf(file: File, onProgress: (s: string) => void): Promise<{ pages: string[][]; ocr: boolean }> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[][] = [];
    let ocr = false;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const lines = itemsToLines(content.items.filter((i): i is (typeof content.items)[number] & TextItem => "str" in i));
      if (lines.join("").replace(/\s/g, "").length >= MIN_TEXT) {
        onProgress(`Reading page ${n} of ${doc.numPages}`);
        pages.push(lines);
        continue;
      }
      ocr = true;
      onProgress(`Scanning page ${n} of ${doc.numPages} (OCR)…`);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: OCR_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      pages.push(await ocrCanvas(canvas));
    }
    await doc.destroy();
    return { pages, ocr };
  }

  async function readImage(file: File, onProgress: (s: string) => void): Promise<{ pages: string[][]; ocr: boolean }> {
    onProgress("Scanning the image (OCR)…");
    const bitmap = await createImageBitmap(file);
    const scale = Math.max(1, OCR_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { pages: [await ocrCanvas(canvas)], ocr: true };
  }

  async function addFiles(list: FileList | File[]) {
    const accepted = [...list].filter((f) => f.type === "application/pdf" || f.type.startsWith("image/") || /\.pdf$/i.test(f.name));
    if (accepted.length === 0) return;
    const queued = accepted.map((f) => ({ file: f, state: { id: crypto.randomUUID(), name: f.name, status: "waiting" as const, progress: "Waiting" } }));
    setFiles((fs) => [...fs, ...queued.map((q) => q.state)]);
    setBusy(true);
    // One at a time: OCR is heavy, and a single worker keeps memory in check.
    for (const { file, state } of queued) {
      update(state.id, { status: "reading", progress: "Opening…" });
      try {
        const onProgress = (progress: string) => update(state.id, { progress });
        const { pages, ocr } = file.type.startsWith("image/") ? await readImage(file, onProgress) : await readPdf(file, onProgress);
        const parsed = parseDocument(pages, { incomeYear, employerName }, ocr);
        update(state.id, { status: "done", progress: "", parsed });
      } catch (error) {
        console.error(error);
        update(state.id, { status: "error", progress: "", error: "This file couldn't be read. Is it a PDF or an image?" });
      }
    }
    setBusy(false);
    if (ocrRef.current) {
      (await ocrRef.current).terminate();
      ocrRef.current = null;
    }
  }

  const done = files.filter((f) => f.status === "done" && f.parsed);
  const items = useMemo(
    () => mergeDocuments(done.map((f) => ({ fileName: f.name, parsed: f.parsed! })), existing),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, existing],
  );
  const isSelected = (item: ReviewItem) => (item.status !== "same") !== toggled.has(item.key);
  const selected = items.filter(isSelected);

  const toggle = (key: string) =>
    setToggled((t) => {
      const next = new Set(t);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function runImport() {
    setImporting(true);
    let outcome: { created: number; updated: number } | undefined;
    const ok = await runAction(async () => {
      outcome = await importProposals(returnId, selected.map((i) => i.proposal));
    });
    setImporting(false);
    if (!ok || !outcome) return;
    toast(`Imported — ${outcome.created} added, ${outcome.updated} updated`);
    router.push(`/ereturn/${incomeYear}`);
  }

  const m = (n: number | undefined) => (n == null ? "—" : fmt.moneyExact(n));
  const describe = (p: Proposal): { title: string; detail: string } => {
    switch (p.type) {
      case "profile":
        return { title: PROFILE_FIELDS[p.field], detail: p.value };
      case "previousNetWealth":
        return { title: "Net wealth on 30 June last year", detail: m(p.amount) };
      case "asset":
        return {
          title: `${p.institution}${p.reference ? ` · ${p.reference}` : ""}`,
          detail: [
            FINANCIAL_ASSET_KINDS[p.kind].label,
            p.openedDate ? `issued ${fmt.day(new Date(`${p.openedDate}T00:00:00Z`))}` : null,
            p.value != null ? `${FINANCIAL_ASSET_KINDS[p.kind].valueLabel.toLowerCase()} ${m(p.value)}` : null,
            p.income != null ? `${FINANCIAL_ASSET_KINDS[p.kind].incomeLabel.toLowerCase()} ${m(p.income)}` : null,
            p.taxDeducted != null ? `tax ${m(p.taxDeducted)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      case "payment":
        return {
          title: `Challan ${p.reference}`,
          detail: [TAX_PAYMENT_KINDS[p.kind].label, m(p.amount), p.date ? fmt.day(new Date(`${p.date}T00:00:00Z`)) : null, p.note].filter(Boolean).join(" · "),
        };
      case "line":
        return { title: LINE_LABELS.get(p.code) ?? p.code, detail: m(p.amount) };
      case "investment":
        return { title: INVESTMENT_KINDS[p.kind].label, detail: m(p.amount) };
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-link">
          <Upload size={20} aria-hidden />
        </span>
        <div>
          <p className="font-semibold">Drop the year&apos;s documents here</p>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Your filed or last year&apos;s return, bank tax certificates, bank statements, salary TDS challans and Sanchayapatra
            certificates — PDFs or photos.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {busy ? "Reading…" : "Choose files"}
        </Button>
        <p className="max-w-lg text-xs text-muted-foreground">
          Files are read in this browser and never uploaded. Scanned pages are read with on-device OCR; the OCR engine and its
          Bangla language data are downloaded once from a public CDN.
        </p>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Documents">
          {files.map((f) => (
            <li key={f.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {f.status === "done" ? (
                    f.parsed?.kind === "UNKNOWN" ? (
                      <AlertTriangle size={16} className="text-warning" aria-label="Not recognised" />
                    ) : (
                      <CheckCircle2 size={16} className="text-success" aria-label="Read" />
                    )
                  ) : f.status === "error" ? (
                    <AlertTriangle size={16} className="text-danger" aria-label="Failed" />
                  ) : (
                    <Loader2 size={16} className="animate-spin text-muted-foreground" aria-label="Reading" />
                  )}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{f.name}</span>
                    {f.parsed && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                        {DOCUMENT_KIND_LABELS[f.parsed.kind]}
                      </span>
                    )}
                    {f.parsed?.ocr && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-medium text-warning">
                        <ScanText size={11} aria-hidden />
                        Read by OCR
                      </span>
                    )}
                  </p>
                  {f.progress && <p className="text-muted-foreground">{f.progress}</p>}
                  {f.error && <p className="text-danger">{f.error}</p>}
                  {f.parsed && <p className="text-muted-foreground">{f.parsed.summary}</p>}
                  {f.parsed?.warnings.map((w, i) => (
                    <p key={`w${i}`} className="mt-1 text-warning">
                      {w}
                    </p>
                  ))}
                  {f.parsed?.notes.map((n, i) => (
                    <p key={`n${i}`} className="mt-1 text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </div>
                {f.status !== "reading" && f.status !== "waiting" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <section aria-labelledby="review-title" className="flex flex-col gap-4 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="review-title" className="text-base font-semibold">
                Review what will be imported
              </h2>
              <p className="text-sm text-muted-foreground">
                Ticked rows are saved into this return. Rows marked OCR came from a scan — check them against the paper.
              </p>
            </div>
            <Button type="button" onClick={runImport} disabled={importing || busy || selected.length === 0}>
              {importing && <Loader2 size={15} className="animate-spin" />}
              Import {selected.length} {selected.length === 1 ? "item" : "items"}
            </Button>
          </div>

          {GROUPS.map((group) => {
            const rows = items.filter((i) => group.type.includes(i.proposal.type));
            if (rows.length === 0) return null;
            return (
              <div key={group.title}>
                <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{group.title}</h3>
                <ul className="flex flex-col divide-y">
                  {rows.map((item) => {
                    const { title, detail } = describe(item.proposal);
                    return (
                      <li key={item.key}>
                        <label className="flex cursor-pointer items-start gap-3 py-2 text-sm">
                          <input type="checkbox" className="mt-0.5 size-4" checked={isSelected(item)} onChange={() => toggle(item.key)} />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{title}</span>
                            <span className="block text-muted-foreground">{detail}</span>
                            <span className="block text-xs text-muted-foreground/80" title={item.sources.join("\n")}>
                              From {item.sources.length === 1 ? item.sources[0] : `${item.sources.length} documents`}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
                                item.status === "new" && "bg-success-soft text-success",
                                item.status === "update" && "bg-primary/10 text-link",
                                item.status === "same" && "bg-muted text-muted-foreground",
                              )}
                            >
                              {item.status === "new" ? "New" : item.status === "update" ? "Changes" : "Already there"}
                            </span>
                            {item.ocr && (
                              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-medium text-warning">OCR — check</span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
