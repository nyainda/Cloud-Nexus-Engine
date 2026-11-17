import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import {
  Sprout, Plus, RefreshCw, Archive, Pencil, Save, Trash2, Search, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Variety } from "./nursery-utils";

export function NurseryCatalogueTab({
  catalogueExpanded,
  onToggleExpanded,
  catalogueTotal,
  catalogueStatus,
  onCatalogueStatusChange,
  catalogueCategory,
  onCatalogueCategoryChange,
  catalogueSearch,
  onCatalogueSearchChange,
  cataloguePage,
  cataloguePageCount,
  onCataloguePageChange,
  catalogueStart,
  catalogueEnd,
  catalogueCategories,
  catalogueRows,
  catalogueLoading,
  catalogueError,
  catalogueSuccess,
  catalogueFetching,
  onRetryCatalogue,
  newName,
  onNewNameChange,
  newCategory,
  onNewCategoryChange,
  newPrice,
  onNewPriceChange,
  addingVariety,
  onCreateVariety,
  editingVarietyId,
  editingName,
  onEditingNameChange,
  editingCategory,
  onEditingCategoryChange,
  editingPrice,
  onEditingPriceChange,
  busyVarietyId,
  onCancelVarietyEdit,
  onBeginEditVariety,
  onSaveVarietyEdit,
  onToggleVariety,
  onDeleteVariety,
}: {
  catalogueExpanded: boolean;
  onToggleExpanded: () => void;
  catalogueTotal: number;
  catalogueStatus: "active" | "archived" | "all";
  onCatalogueStatusChange: (status: "active" | "archived" | "all") => void;
  catalogueCategory: string;
  onCatalogueCategoryChange: (cat: string) => void;
  catalogueSearch: string;
  onCatalogueSearchChange: (search: string) => void;
  cataloguePage: number;
  cataloguePageCount: number;
  onCataloguePageChange: (nextPage: number | ((prev: number) => number)) => void;
  catalogueStart: number;
  catalogueEnd: number;
  catalogueCategories: string[];
  catalogueRows: Variety[];
  catalogueLoading: boolean;
  catalogueError: boolean;
  catalogueSuccess: boolean;
  catalogueFetching: boolean;
  onRetryCatalogue: () => void;
  newName: string;
  onNewNameChange: (val: string) => void;
  newCategory: string;
  onNewCategoryChange: (val: string) => void;
  newPrice: string;
  onNewPriceChange: (val: string) => void;
  addingVariety: boolean;
  onCreateVariety: (event: FormEvent) => void;
  editingVarietyId: string | null;
  editingName: string;
  onEditingNameChange: (val: string) => void;
  editingCategory: string;
  onEditingCategoryChange: (val: string) => void;
  editingPrice: string;
  onEditingPriceChange: (val: string) => void;
  busyVarietyId: string | null;
  onCancelVarietyEdit: () => void;
  onBeginEditVariety: (v: Variety) => void;
  onSaveVarietyEdit: (v: Variety) => void;
  onToggleVariety: (v: Variety) => void;
  onDeleteVariety: (v: Variety) => void;
}) {
  return (
    <TabsContent value="catalogue" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-500/15 border border-sky-500/25 p-2.5 text-sky-400">
                <Sprout className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Seedling Catalogue</CardTitle>
                <p className="text-xs text-muted-foreground">Set up seedling varieties, categories, and default prices.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs font-bold font-mono text-sky-400">
                {catalogueTotal.toLocaleString()} {catalogueStatus === "active" ? "active" : catalogueStatus === "archived" ? "archived" : "total"}
              </span>
              <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 cursor-pointer" onClick={onToggleExpanded}>
                {catalogueExpanded ? "Collapse" : "Expand"}
                <ChevronDown className={`h-4 w-4 transition-transform ${catalogueExpanded ? "rotate-180" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-5">
          {catalogueExpanded && (
            <>
              {/* Add Variety Form */}
              <form onSubmit={onCreateVariety} className="rounded-2xl border border-dashed border-primary/35 bg-primary/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  <Plus className="h-4 w-4" />
                  Add New Variety
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_140px_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="new-name" className="text-xs">Variety Name</Label>
                    <Input id="new-name" placeholder="e.g. Cabbage Copenhagen" value={newName} onChange={e => onNewNameChange(e.target.value)} maxLength={80} required className="h-10 rounded-xl bg-background" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-category" className="text-xs">Category</Label>
                    <Input id="new-category" placeholder="e.g. Vegetables" value={newCategory} onChange={e => onNewCategoryChange(e.target.value)} maxLength={60} className="h-10 rounded-xl bg-background" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-price" className="text-xs">Default Price (KES)</Label>
                    <Input id="new-price" type="number" min="0" step="0.01" value={newPrice} onChange={e => onNewPriceChange(e.target.value)} required className="h-10 rounded-xl bg-background font-mono" />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={addingVariety} className="w-full h-10 rounded-xl gap-1.5 font-bold cursor-pointer">
                      <Plus className="h-4 w-4" />
                      Add Variety
                    </Button>
                  </div>
                </div>
              </form>

              {/* Search & Filters */}
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={catalogueSearch} onChange={e => { onCatalogueSearchChange(e.target.value); onCataloguePageChange(1); }} placeholder="Find a seedling variety…" aria-label="Search seedling catalogue" className="h-10 rounded-xl bg-background pl-10" />
                  </div>
                  <div className="relative sm:w-44">
                    <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select aria-label="Filter seedling varieties" value={catalogueStatus} onChange={e => { onCatalogueStatusChange(e.target.value as typeof catalogueStatus); onCataloguePageChange(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                      <option value="active">Active varieties</option>
                      <option value="archived">Archived varieties</option>
                      <option value="all">All varieties</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <div className="relative sm:w-44">
                    <select aria-label="Filter varieties by category" value={catalogueCategory} onChange={e => { onCatalogueCategoryChange(e.target.value); onCataloguePageChange(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                      <option value="">All categories</option>
                      {catalogueCategories.map(category => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>Showing <span className="font-semibold text-foreground">{catalogueStart}–{catalogueEnd}</span> of <span className="font-semibold text-foreground">{catalogueTotal}</span></p>
                  {(catalogueSearch || catalogueCategory || catalogueStatus !== "active") && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => { onCatalogueSearchChange(""); onCatalogueCategoryChange(""); onCatalogueStatusChange("active"); onCataloguePageChange(1); }}>
                      Reset filters
                    </Button>
                  )}
                </div>
              </div>

              {catalogueLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading seedling varieties…</p>}
              {catalogueError && (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-sm">
                  <p className="font-medium text-destructive">Could not load seedling varieties.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetryCatalogue}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
                </div>
              )}
              {catalogueSuccess && catalogueTotal === 0 && !catalogueSearch && catalogueStatus === "active" && (
                <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add cabbage, spinach or any seedling varieties sold by this shop.</p>
              )}
              {catalogueSuccess && catalogueTotal === 0 && (catalogueSearch || catalogueStatus !== "active") && (
                <div className="rounded-2xl border border-dashed p-6 text-center">
                  <Sprout className="mx-auto h-6 w-6 text-muted-foreground/60" />
                  <p className="mt-2 text-sm font-medium">No varieties match this view</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try another search or switch the status filter.</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalogueRows.map(v => (
                  <div key={v.id} className="rounded-2xl border border-border bg-muted/15 p-4 transition-colors hover:border-primary/35">
                    {editingVarietyId === v.id ? (
                      <div className="space-y-3">
                        <div className="space-y-1"><Label htmlFor={`edit-name-${v.id}`} className="text-xs">Variety name</Label><Input id={`edit-name-${v.id}`} value={editingName} onChange={e => onEditingNameChange(e.target.value)} maxLength={80} autoFocus className="h-9 rounded-xl" /></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label htmlFor={`edit-category-${v.id}`} className="text-xs">Category</Label><Input id={`edit-category-${v.id}`} value={editingCategory} onChange={e => onEditingCategoryChange(e.target.value)} maxLength={60} className="h-9 rounded-xl" /></div>
                          <div className="space-y-1"><Label htmlFor={`edit-price-${v.id}`} className="text-xs">Price (KES)</Label><Input id={`edit-price-${v.id}`} type="number" min="0" step="0.01" value={editingPrice} onChange={e => onEditingPriceChange(e.target.value)} className="h-9 rounded-xl font-mono" /></div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button type="button" size="sm" disabled={busyVarietyId === v.id} onClick={() => onSaveVarietyEdit(v)} className="flex-1 gap-1 rounded-xl"><Save className="h-3.5 w-3.5" /> Save</Button>
                          <Button type="button" size="sm" variant="outline" onClick={onCancelVarietyEdit} className="rounded-xl">Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col h-full justify-between gap-3">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {v.category || "Uncategorized"}
                            </span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", Boolean(v.isActive) ? "bg-emerald-500/12 text-emerald-400" : "bg-muted text-muted-foreground")}>
                              {Boolean(v.isActive) ? "Active" : "Archived"}
                            </span>
                          </div>
                          <p className="font-bold text-sm text-foreground">{v.name}</p>
                          <p className="text-base font-bold font-mono text-primary mt-1">{formatKES(v.defaultPrice)} <span className="text-[11px] font-sans font-normal text-muted-foreground">each</span></p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                          <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => onBeginEditVariety(v)} className="gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3 w-3" /> Edit</Button>
                          <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => onToggleVariety(v)} className="gap-1 rounded-xl h-8 text-xs"><Archive className="h-3 w-3" />{Boolean(v.isActive) ? "Archive" : "Restore"}</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => { if (window.confirm(`Delete ${v.name}? Varieties with sales history will be archived instead.`)) onDeleteVariety(v); }} className="ml-auto gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {cataloguePageCount > 1 && (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={cataloguePage <= 1 || catalogueFetching} onClick={() => onCataloguePageChange(page => Math.max(1, page - 1))}>Previous</Button>
                  <span className="text-xs text-muted-foreground">Page {cataloguePage} of {cataloguePageCount}</span>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={cataloguePage >= cataloguePageCount || catalogueFetching} onClick={() => onCataloguePageChange(page => Math.min(cataloguePageCount, page + 1))}>Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
