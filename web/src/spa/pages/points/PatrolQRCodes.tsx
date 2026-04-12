import { useCallback, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";

type QrItem = { id: string; code: string; title: string };

/** Short unique payload (~12 chars + prefix) — easier to read on labels than a full UUID. */
function newKlbCode(): string {
    const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
    let s = "k";
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const buf = new Uint8Array(10);
        crypto.getRandomValues(buf);
        for (let i = 0; i < 10; i++) s += alphabet[buf[i]! % alphabet.length];
        return s;
    }
    for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
}

function initialCodes(): QrItem[] {
    const code = newKlbCode();
    return [{ id: code, code, title: "Checkpoint 1" }];
}

function printPrintableArea(elementId: string) {
    const el = document.getElementById(elementId);
    if (!el) {
        toast.error("Nothing to print");
        return;
    }
    const w = window.open("", "_blank");
    if (!w) {
        toast.error("Pop-up blocked — allow pop-ups to print");
        return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Patrol QR labels</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 16px; color: #0f172a; }
      .grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: flex-start; }
      .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; max-width: 280px; page-break-inside: avoid; }
      .card svg { display: block; }
      .code { font-family: ui-monospace, monospace; font-size: 11px; margin-top: 8px; word-break: break-all; }
      .title { font-size: 16px; font-weight: 700; margin-top: 8px; }
      .hint { font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.4; }
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.onload = () => {
        w.print();
        w.close();
    };
}

/**
 * Generate printable QR payloads (short `k` + 10 chars) for physical labels. Register each code to a site
 * from the mobile app or directly using the "Save to Site" button here.
 */
export default function PatrolQRCodes({ selectedSiteId }: { selectedSiteId?: string }) {
    const { user } = useUser();
    const [codes, setCodes] = useState<QrItem[]>(initialCodes);
    const [title, setTitle] = useState("");
    const [count, setCount] = useState(1);
    const [showTitle, setShowTitle] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;

    const site = useQuery(api.sites.getSite, 
        selectedSiteId && selectedSiteId !== "all" 
            ? { id: selectedSiteId as Id<"sites"> } 
            : "skip"
    );

    const saveMutation = useMutation(api.patrolPoints.createPointsFromList);

    const handleSaveToSite = async () => {
        if (!organizationId || !selectedSiteId || selectedSiteId === "all" || codes.length === 0) return;
        
        setIsSaving(true);
        try {
            await saveMutation({
                organizationId,
                siteId: selectedSiteId as Id<"sites">,
                points: codes.map(c => ({ name: c.title, qrCode: c.code }))
            });
            toast.success(`Successfully saved ${codes.length} points to ${site?.name || "site"}`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save points to site");
        } finally {
            setIsSaving(false);
        }
    };

    const generateQRCodes = useCallback(() => {
        const n = Math.min(50, Math.max(1, Math.floor(count) || 1));
        const next: QrItem[] = [];
        for (let i = 0; i < n; i++) {
            const code = newKlbCode();
            next.push({
                id: code,
                code,
                title: title.trim() || `Checkpoint ${i + 1}`,
            });
        }
        setCodes(next);
        toast.success(`Generated ${n} QR code${n === 1 ? "" : "s"}`);
    }, [count, title]);

    const printableId = "patrol-qr-print-area";

    const emptyHint = useMemo(
        () =>
            "Generate printable QR payloads for physical labels. Once generated, you can save them directly to a site or register them individually using the mobile app.",
        []
    );

    const isSiteSelected = selectedSiteId && selectedSiteId !== "all";

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{emptyHint}</p>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
                <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
                    <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">
                            Number of QR codes
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={50}
                            value={count}
                            onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
                            className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">
                            Label prefix (optional)
                        </label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. North gate"
                            className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Each code still gets a unique ID; this only sets the display title.
                        </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                        <input
                            type="checkbox"
                            checked={showTitle}
                            onChange={(e) => setShowTitle(e.target.checked)}
                            className="rounded border-white/20 bg-neutral-900"
                        />
                        Show title on sheet
                    </label>
                    
                    <div className="pt-2 space-y-3">
                        <button
                            type="button"
                            onClick={generateQRCodes}
                            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                            Generate QR codes
                        </button>

                        {isSiteSelected && (
                            <button
                                type="button"
                                onClick={handleSaveToSite}
                                disabled={isSaving || codes.length === 0}
                                className="w-full py-3 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all disabled:opacity-40 shadow-lg shadow-emerald-900/20"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save to {site?.name || "Site"}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => printPrintableArea(printableId)}
                            disabled={codes.length === 0}
                            className="w-full py-3 flex items-center justify-center gap-2 bg-white/10 border border-white/15 text-white rounded-xl font-semibold hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Printer className="w-4 h-4" />
                            Print QR codes
                        </button>
                    </div>
                </div>

                <div
                    id={printableId}
                    className="glass rounded-2xl border border-white/10 p-5 min-h-[200px]"
                >
                    {codes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <QRCodeSVG value="placeholder" size={48} className="opacity-20 mb-4" />
                            <p className="text-sm">No codes in the list. Use Generate to add labels.</p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-4">
                            {codes.map((qr) => (
                                <div
                                    key={qr.id}
                                    className="rounded-xl border border-white/10 bg-white p-4 shadow-sm max-w-[260px]"
                                >
                                    <div className="bg-white rounded-lg inline-block">
                                        <QRCodeSVG value={qr.code} size={200} level="H" />
                                    </div>
                                    {showTitle ? (
                                        <p className="text-slate-900 font-bold text-base mt-2">{qr.title}</p>
                                    ) : null}
                                    <p className="text-slate-700 font-mono text-[11px] mt-1 leading-snug break-all">
                                        {qr.code}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
