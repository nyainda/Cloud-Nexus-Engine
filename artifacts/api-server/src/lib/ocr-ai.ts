// ── OCR AI calling layer ───────────────────────────────────────────────────
// Isolated from route handlers so prompts and parsing logic can be tested
// and iterated independently of the Hono request/response cycle.

export interface GeminiItem {
  text?: string;
  productName?: string;
  qty?: number;
  totalPrice?: number;
  unitPrice?: number;
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

// ── Groq Vision call ───────────────────────────────────────────────────────

export async function callGroqOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text. Use it as an additional hint:\n\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  let prompt: string;
  if (scanType === "invoice") {
    prompt = `Analyze this Kenyan supplier invoice carefully. Extract ALL information with high precision.
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
      "productName": "clean chemical/product name — keep active ingredient % if part of name (e.g. Dimethoate 40% EC, Roundup 480SL, Emamectin 1.9% EC). Strip pack size/volume from name.",
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
- Product name examples: "DIMETHOATE 40% EC 1L x12" → name:"Dimethoate 40% EC" qty:12 | "ROUNDUP 480SL 5LTR 6PCS" → name:"Roundup 480SL" qty:6 | "NPK 17:17:17 50KG" → name:"NPK 17:17:17" qty:1
- VAT in Kenya is typically 16% — extract if shown as V.A.T, VAT, or Tax line
- If only totalPrice and qty are visible: unitPrice = totalPrice / qty
- DO NOT include header rows, subtotal rows, VAT rows, or delivery charges in items${ocrHint}`;
  } else {
    prompt = `This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON array (no markdown, no code blocks, no extra text):
[
  {
    "text": "raw handwritten line",
    "productName": "clean product/chemical name — keep concentration % if present",
    "qty": quantity as a plain number or null,
    "unitPrice": unit price as a plain number (no currency symbols) or null,
    "totalPrice": total price as a plain number (no currency symbols) or null
  }
]
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.${ocrHint}`;
  }

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
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const json: any = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "[]";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { items: parsed, meta: null };
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
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text. Use it as an additional hint to improve accuracy — cross-reference it with what you see in the image:\n\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  let prompt: string;

  if (scanType === "invoice") {
    prompt = `Analyze this Kenyan supplier invoice carefully. Extract ALL information with high precision.
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
      "productName": "clean chemical/product name — keep active ingredient % if part of name (e.g. Dimethoate 40% EC, Roundup 480SL, Emamectin 1.9% EC). Strip pack volume/weight from name.",
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
- Product name examples: "DIMETHOATE 40% EC 1L x12" → name:"Dimethoate 40% EC" qty:12 | "ROUNDUP 480SL 5LTR 6PCS" → name:"Roundup 480SL" qty:6 | "NPK 17:17:17 50KG BAG" → name:"NPK 17:17:17" qty:1
- VAT in Kenya is typically 16% — extract if shown as V.A.T, VAT, or Tax line
- If only totalPrice and qty are visible: unitPrice = totalPrice / qty
- DO NOT include header rows, subtotal rows, VAT rows, or delivery charges in items${ocrHint}`;
  } else {
    prompt = `This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON array (no markdown, no code blocks, no extra text):
[
  {
    "text": "raw handwritten line",
    "productName": "clean product/chemical name — keep concentration % if present (e.g. Dimethoate 40% EC)",
    "qty": quantity as a plain number or null,
    "unitPrice": unit price as a plain number (no currency symbols) or null,
    "totalPrice": total price as a plain number (no currency symbols) or null
  }
]
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.${ocrHint}`;
  }

  const base = aiBaseUrl
    ? aiBaseUrl.replace(/\/$/, "")
    : "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const json: any = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

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
