export const CATEGORIES = [
  "Herbicides",
  "Fungicides",
  "Insecticides",
  "Fertilizers",
  "Seeds",
  "Acaricides",
  "Animal Health",
  "Equipment",
  "Agrochemicals",
];

export const WEIGHT_UNITS = new Set([
  "kg",
  "g",
  "gram",
  "grams",
  "litre",
  "liter",
  "l",
  "ml",
  "ton",
  "tonne",
]);

export function isWeighedUnit(unit: string | null | undefined): boolean {
  return WEIGHT_UNITS.has((unit || "").trim().toLowerCase());
}

export function generateSku(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 4).map((w) => w[0].toUpperCase()).join("");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${initials}-${suffix}`;
}

export function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/herbicide|weed killer|weedkiller|glyphosate|roundup|atrazine|pendimethalin|metolachlor|acetochlor|2,4-d|paraquat|dicamba/.test(n)) return "Herbicides";
  if (/fungicide|mancozeb|metalaxyl|carbendazim|propiconazole|thiophanate|copper oxychloride|ridomil|dithane|mancozeb/.test(n)) return "Fungicides";
  if (/insecticide|lambda|cypermethrin|imidacloprid|dimethoate|chlorpyrifos|acetamiprid|emamectin|abamectin|karate|actellic|decis/.test(n)) return "Insecticides";
  if (/fertilizer|fertiliser|\bdap\b|\bcan\b|\bnpk\b|\burea\b|triple super|\btsp\b|muriate|potash|sulphate of ammonia|\bcrf\b|micronutrient|foliar|top dress|calcium ammonium/.test(n)) return "Fertilizers";
  if (/\bseed\b|maize|bean|sorghum|sunflower|wheat|barley|kale|spinach|tomato seed|onion|cabbage|carrot seed/.test(n)) return "Seeds";
  if (/acaricide|cattle dip|tick|mange|ectoparasit|coopers dip/.test(n)) return "Acaricides";
  if (/animal health|veterinary|livestock|poultry|vaccine|dewormer|antibiotic|injection|bolus|vet |ivermectin|oxytetracycline/.test(n)) return "Animal Health";
  if (/pump|sprayer|knapsack|hose|nozzle|equipment|spade|hoe|fork|wheelbarrow|watering/.test(n)) return "Equipment";
  if (/agrochemical|pesticide/.test(n)) return "Agrochemicals";
  return "";
}

export function getCategoryStyle(category: string | null | undefined) {
  const c = (category || "").toLowerCase();
  if (c.includes("herbicide")) return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/25", abbr: "HB" };
  if (c.includes("fungicide")) return { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25", abbr: "FG" };
  if (c.includes("insecticide")) return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25", abbr: "IN" };
  if (c.includes("fertilizer")) return { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/25", abbr: "FE" };
  if (c.includes("seed")) return { bg: "bg-lime-500/15", text: "text-lime-400", border: "border-lime-500/25", abbr: "SD" };
  if (c.includes("equipment")) return { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25", abbr: "EQ" };
  if (c.includes("acaricide")) return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25", abbr: "AC" };
  if (c.includes("animal")) return { bg: "bg-teal-500/15", text: "text-teal-400", border: "border-teal-500/25", abbr: "AH" };
  if (c.includes("agrochemical")) return { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/25", abbr: "AG" };
  const abbr = category ? category.slice(0, 2).toUpperCase() : "—";
  return { bg: "bg-muted/60", text: "text-muted-foreground", border: "border-border", abbr };
}

export function getCategoryTone(category: string | undefined | null) {
  const c = (category || "").toLowerCase();
  if (c.includes("herb")) return { dot: "bg-amber-400", badge: "bg-amber-500/12 text-amber-400 border-amber-500/25" };
  if (c.includes("fung")) return { dot: "bg-violet-400", badge: "bg-violet-500/12 text-violet-400 border-violet-500/25" };
  if (c.includes("insect")) return { dot: "bg-rose-400", badge: "bg-rose-500/12 text-rose-400 border-rose-500/25" };
  if (c.includes("fert")) return { dot: "bg-emerald-400", badge: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25" };
  if (c.includes("seed")) return { dot: "bg-lime-400", badge: "bg-lime-500/12 text-lime-400 border-lime-500/25" };
  if (c.includes("animal") || c.includes("vet")) return { dot: "bg-sky-400", badge: "bg-sky-500/12 text-sky-400 border-sky-500/25" };
  return { dot: "bg-muted-foreground/50", badge: "bg-muted/70 text-muted-foreground border-border/60" };
}
