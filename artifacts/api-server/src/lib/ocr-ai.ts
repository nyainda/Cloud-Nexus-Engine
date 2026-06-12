// ── OCR AI calling layer ───────────────────────────────────────────────────
// Isolated from route handlers so prompts and parsing logic can be tested
// and iterated independently of the Hono request/response cycle.

export interface GeminiItem {
  text?: string;
  productName?: string;
  qty?: number;
  totalPrice?: number;
  unitPrice?: number;
  packSize?: string | null;
}

export interface InvoiceMeta {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
  subTotal?: number | null;
  vatRate?: number | null;
  vatAmount?: number | null;
  hasVat?: boolean;
}

// ── Shared prompt builder ──────────────────────────────────────────────────
// Keeps invoice and notebook prompts consistent across Groq and Gemini.

function buildInvoicePrompt(tesseractText?: string, catalogHint?: string): string {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text — use it as a cross-reference hint:\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  const catalogSection = catalogHint
    ? `\nThis shop's product catalog (match product names to the closest entry — use the catalog name exactly when there is a clear match):\n${catalogHint}\n`
    : "";

  return `You are analyzing a document from a Kenyan agrochemical and farm supply shop. Products include pesticides, herbicides, fungicides, fertilizers, seeds, and agrivet supplies. Chemical names often contain concentration codes like "40% EC", "480 SL", "25 WP", "1.9% EC", "500 SC".
${catalogSection}
Analyze this supplier invoice carefully. Extract ALL information with high precision.
Return ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this exact structure:
{
  "meta": {
    "supplierName": "supplier or company name, or null",
    "invoiceNumber": "invoice/receipt/LPO/DN number, or null",
    "invoiceDate": "YYYY-MM-DD, or null",
    "subTotal": subtotal BEFORE VAT as plain number or null,
    "vatRate": VAT percentage as plain number (e.g. 16 for 16%) or null if no VAT shown,
    "vatAmount": total VAT amount as plain number or null,
    "grandTotal": FINAL total after VAT as plain number or null
  },
  "items": [
    {
      "text": "exact raw line from invoice",
      "productName": "clean chemical/product name — keep active ingredient % and formulation type if part of name (e.g. Dimethoate 40% EC, Roundup 480SL, Emamectin 1.9% EC). Strip pack volume/weight from name. If a catalog name matches closely, use the exact catalog name.",
      "packSize": "pack size/volume extracted from the line, e.g. 1L, 500ml, 50kg, or null",
      "qty": quantity ordered as plain number or null,
      "unitPrice": unit price per item EXCLUDING VAT as plain number or null,
      "totalPrice": line total EXCLUDING VAT as plain number or null
    }
  ]
}

Rules:
- Strip all currency symbols (KES, Ksh, Sh, K, /=, sh) from all numbers
- Remove commas from numbers: 1,200 → 1200
- Extract EVERY product line, even with partial data
- Product name parsing examples:
    "DIMETHOATE 40% EC 1L x12" → productName:"Dimethoate 40% EC" packSize:"1L" qty:12
    "ROUNDUP 480SL 5LTR 6PCS" → productName:"Roundup 480SL" packSize:"5L" qty:6
    "NPK 17:17:17 50KG BAG" → productName:"NPK 17:17:17" packSize:"50kg" qty:1
    "EMAMECTIN 1.9%EC 100ML X24" → productName:"Emamectin 1.9% EC" packSize:"100ml" qty:24
- VAT in Kenya is typically 16% — extract if shown as V.A.T, VAT, Tax, or T line
- If only totalPrice and qty are visible: unitPrice = totalPrice / qty
- DO NOT include header rows, subtotal rows, VAT rows, or delivery charges in items
- Preserve concentration % in product names (40%, 480SL, 25WP, 1.9%, etc.)${ocrHint}`;
}

function buildNotebookPrompt(tesseractText?: string, catalogHint?: string): string {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text — use it as a cross-reference hint:\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  const catalogSection = catalogHint
    ? `\nThis shop's product catalog (match product names to the closest entry — use the catalog name exactly when there is a clear match):\n${catalogHint}\n`
    : "";

  return `You are analyzing a document from a Kenyan agrochemical and farm supply shop. Products include pesticides, herbicides, fungicides, fertilizers, seeds, and agrivet supplies. Chemical names often contain concentration codes like "40% EC", "480 SL", "25 WP", "1.9% EC".
${catalogSection}
This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this structure:
{
  "items": [
    {
      "text": "raw handwritten line",
      "productName": "clean product/chemical name — keep concentration % and formulation type if present. If a catalog name matches closely, use the exact catalog name.",
      "packSize": "pack size/volume if visible, e.g. 1L, 50kg, or null",
      "qty": quantity as a plain number or null,
      "unitPrice": unit price as a plain number (no currency symbols) or null,
      "totalPrice": total price as a plain number (no currency symbols) or null
    }
  ]
}

Rules:
- Strip currency symbols (KES, Ksh, Sh) and commas from numbers
- Keep concentration codes in product names (40%, 480SL, 25WP, 1.9% EC, etc.)
- Extract ALL entries, even partially legible ones${ocrHint}`;
}

// ── Groq Vision call ───────────────────────────────────────────────────────

export async function callGroqOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
  catalogHint?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const prompt = scanType === "invoice"
    ? buildInvoicePrompt(tesseractText, catalogHint)
    : buildNotebookPrompt(tesseractText, catalogHint);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.05,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const json: any = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return { items: parsed, meta: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        meta: parsed.meta ?? null,
      };
    }
    return { items: [], meta: null };
  } catch {
    return { items: [], meta: null };
  }
}

// ── Gemini Vision call ─────────────────────────────────────────────────────

export async function callGeminiOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
  aiBaseUrl?: string,
  catalogHint?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const prompt = scanType === "invoice"
    ? buildInvoicePrompt(tesseractText, catalogHint)
    : buildNotebookPrompt(tesseractText, catalogHint);

  const base = aiBaseUrl
    ? aiBaseUrl.replace(/\/$/, "")
    : "https://generativelanguage.googleapis.com";

  // gemini-2.5-flash has significantly better OCR/vision than 2.0-flash
  const url = `${base}/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.05,
      },
    }),
  });

  if (!res.ok) {
    // Fallback to gemini-2.0-flash if 2.5-flash is unavailable
    const errText = await res.text().catch(() => res.statusText);
    if (res.status === 404 || res.status === 400) {
      const fallbackUrl = `${base}/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.05 },
        }),
      });
      if (!fallbackRes.ok) {
        const fallbackErr = await fallbackRes.text().catch(() => fallbackRes.statusText);
        throw new Error(`Gemini API error ${fallbackRes.status}: ${fallbackErr}`);
      }
      const fallbackJson: any = await fallbackRes.json();
      const fallbackText: string = fallbackJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      return parseGeminiResponse(fallbackText);
    }
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const json: any = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return parseGeminiResponse(text);
}

function parseGeminiResponse(text: string): { items: GeminiItem[]; meta: InvoiceMeta | null } {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return { items: parsed, meta: null };
    } else if (parsed && typeof parsed === "object") {
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        meta: parsed.meta ?? null,
      };
    }
    return { items: [], meta: null };
  } catch {
    return { items: [], meta: null };
  }
}
