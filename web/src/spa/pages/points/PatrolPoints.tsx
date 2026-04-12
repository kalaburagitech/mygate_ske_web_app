import { useState } from "react";
import { Search, MapPin, Printer, X, Trash2, Loader2, Edit2, ExternalLink } from "lucide-react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../../services/convex";
import type { Id } from "../../../../convex/_generated/dataModel";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { SearchableSitePicker } from "../../../components/SearchableSitePicker";
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    TablePagination,
    TableSortLabel,
    Chip,
    Box,
    Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { userHasRole } from "../../../lib/userRoles";

const ITEMS_PER_PAGE = 12;

// Styled components for glass morphism effect
const GlassTableContainer = styled(TableContainer)(({ theme }) => ({
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(10px)",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    overflowX: "auto",
    "& .MuiTableCell-root": {
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        color: "rgba(255, 255, 255, 0.9)",
    },
    "& .MuiTableHead-root .MuiTableCell-root": {
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        fontWeight: 600,
        color: "#fff",
        borderBottom: "2px solid rgba(37, 99, 235, 0.5)",
    },
    "& .MuiTableRow-root:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.08)",
    },
}));

const QRCodeCell = styled(Box)({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "8px",
    background: "white",
    borderRadius: "12px",
    width: "60px",
    height: "60px",
    "& svg": {
        width: "50px !important",
        height: "50px !important",
    },
});

const CoordinatesButton = styled(Box)({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    cursor: "pointer",
    textDecoration: "none",
    color: "rgba(255, 255, 255, 0.7)",
    transition: "all 0.2s ease",
    "&:hover": {
        color: "#3b82f6",
        textDecoration: "none",
    },
});

// Update interface to make fields optional to match actual data from Convex
interface PatrolPoint {
    _id: Id<"patrolPoints">;
    _creationTime: number;
    createdAt?: number; // Make optional
    latitude?: number; // Make optional
    longitude?: number; // Make optional
    name: string;
    organizationId: Id<"organizations">;
    siteId: Id<"sites">;
    siteName: string;
    qrCode: string;
    imageId?: string;
    /** Per-point geofence (m); default 200 when unset */
    pointRadiusMeters?: number;
}

type Order = "asc" | "desc";

export default function PatrolPoints({ selectedSiteId }: { selectedSiteId: string }) {
    const { user } = useUser();
    const [searchQuery, setSearchQuery] = useState("");
    const [editingPoint, setEditingPoint] = useState<any | null>(null);
    const [isDeletingId, setIsDeletingId] = useState<Id<"patrolPoints"> | null>(null);

    // Table state
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [order, setOrder] = useState<Order>("asc");
    const [orderBy, setOrderBy] = useState<keyof PatrolPoint>("name");

    // Fetch user details to get organizationId
    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;
    const selectedOrgId = localStorage.getItem('selectedOrgId') as Id<"organizations">;

    const orgIdToUse = organizationId || selectedOrgId;

    const isOwner = userHasRole(currentUser, "Owner");

    const { results: points, status, loadMore } = usePaginatedQuery(
        api.patrolPoints.searchPoints,
        (isOwner || orgIdToUse) ? {
            organizationId: isOwner ? undefined : (orgIdToUse as Id<"organizations">),
            siteId: (selectedSiteId === "all" || !selectedSiteId) ? undefined : selectedSiteId as Id<"sites">,
            searchQuery: searchQuery,
            requestingUserId: currentUser?._id
        } : "skip",
        { initialNumItems: ITEMS_PER_PAGE }
    );

    const updatePoint = useMutation(api.patrolPoints.updatePoint);
    const deletePoint = useMutation(api.patrolPoints.removePoint);

    // Helper function to open location in Google Maps
    const openInGoogleMaps = (latitude: number, longitude: number, name: string) => {
        if (!latitude || !longitude) return;
        const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${encodeURIComponent(name)}`;
        window.open(url, '_blank');
    };

    const handleUpdatePoint = async () => {
        if (!editingPoint) return;

        const lat = parseFloat(editingPoint.latitude);
        const lng = parseFloat(editingPoint.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            toast.error("Valid Latitude and Longitude are required");
            return;
        }

        try {
            await updatePoint({
                id: editingPoint._id,
                name: editingPoint.name,
                siteId: editingPoint.siteId as Id<"sites">,
                latitude: lat,
                longitude: lng,
                qrCode: editingPoint.qrCode,
                pointRadiusMeters:
                    typeof editingPoint.pointRadiusMeters === "number" && !isNaN(editingPoint.pointRadiusMeters)
                        ? editingPoint.pointRadiusMeters
                        : 200,
            });
            setEditingPoint(null);
            toast.success("Patrol point updated successfully");
        } catch (error: any) {
            console.error("Update error:", error);
            toast.error(error.message || "Failed to update patrol point");
        }
    };

    const handleDeletePoint = async (id: Id<"patrolPoints">) => {
        try {
            await deletePoint({ id });
            setIsDeletingId(null);
            toast.success("Point deleted successfully");
        } catch (error) {
            toast.error("Failed to delete point");
        }
    };

    const handlePrintAll = () => {
        if (!points || points.length === 0) {
            toast.error("No points to print");
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const pointsHtml = points.map((point: any) => {
            const qrSvg = document.getElementById(`qr-${point._id}`)?.querySelector('svg')?.outerHTML;
            const lat = point.latitude?.toFixed(6) || 'N/A';
            const lng = point.longitude?.toFixed(6) || 'N/A';
            return `
        <div class="qr-page">
          <div class="container">
            ${qrSvg}
            <h1>${point.siteName}_${point.name}</h1>
            <p>ID: ${point.qrCode}</p>
            <p>Location: ${lat}, ${lng}</p>
          </div>
        </div>
      `;
        }).join('');

        printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Batch</title>
          <style>
            body { margin: 0; padding: 0; }
            .qr-page { 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              width: 100vw;
              font-family: sans-serif; 
              page-break-after: always;
            }
            .container { 
              border: 2px solid #000; 
              padding: 40px; 
              border-radius: 20px; 
              text-align: center;
              width: 80%;
              max-width: 500px;
            }
            h1 { margin-top: 20px; font-size: 28px; word-break: break-all; }
            p { color: #666; margin-bottom: 10px; font-size: 14px; word-break: break-all; }
            svg { width: 350px !important; height: 350px !important; }
            @media print {
              .qr-page { height: 100vh; width: 100vw; }
            }
          </style>
        </head>
        <body>
          ${pointsHtml}
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
        printWindow.document.close();
    };

    const handleRequestSort = (property: keyof PatrolPoint) => {
        const isAsc = orderBy === property && order === "asc";
        setOrder(isAsc ? "desc" : "asc");
        setOrderBy(property);
    };

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Sort and paginate data
    const sortedPoints = points ? [...(points as PatrolPoint[])].sort((a, b) => {
        if (orderBy === "name") {
            return order === "asc"
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name);
        }
        if (orderBy === "siteName") {
            return order === "asc"
                ? a.siteName.localeCompare(b.siteName)
                : b.siteName.localeCompare(a.siteName);
        }
        if (orderBy === "qrCode") {
            return order === "asc"
                ? a.qrCode.localeCompare(b.qrCode)
                : b.qrCode.localeCompare(a.qrCode);
        }
        return 0;
    }) : [];

    const paginatedPoints = sortedPoints.slice(
        page * rowsPerPage,
        page * rowsPerPage + rowsPerPage
    );

    const printSingleQR = (point: PatrolPoint) => {
        const qrSvg = document.getElementById(`qr-${point._id}`)?.querySelector('svg')?.outerHTML;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const lat = point.latitude?.toFixed(6) || 'N/A';
        const lng = point.longitude?.toFixed(6) || 'N/A';
        printWindow.document.write(`
    <html>
      <head>
        <title>Print QR - ${point.name}</title>
        <style>
          body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; margin: 0; }
          .container { border: 2px solid #000; padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; width: 80%; }
          h1 { margin-top: 20px; font-size: 28px; word-break: break-all; }
          p { color: #666; margin-bottom: 10px; font-size: 14px; word-break: break-all; }
          svg { width: 350px !important; height: 350px !important; }
        </style>
      </head>
      <body>
        <div class="container">
          ${qrSvg}
          <h1>${point.siteName}_${point.name}</h1>
          <p>ID: ${point.qrCode}</p>
          <p>Location: ${lat}, ${lng}</p>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
    </html>
  `);
        printWindow.document.close();
    };

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by name or QR..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {points && points.length > 0 && (
                            <button
                                onClick={handlePrintAll}
                                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-all text-white/70"
                                title="Print all filtered QR codes"
                            >
                                <Printer className="w-4 h-4" />
                                Print All
                            </button>
                        )}
                    </div>
                </div>

                {/* Material-UI Table */}
                <GlassTableContainer>
                    <Table sx={{ minWidth: 650 }} aria-label="patrol points table">
                        <TableHead>
                            <TableRow>
                                <TableCell align="center">QR Code</TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === "name"}
                                        direction={orderBy === "name" ? order : "asc"}
                                        onClick={() => handleRequestSort("name")}
                                        sx={{ color: "#fff", fontWeight: 600 }}
                                    >
                                        Point Name
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === "siteName"}
                                        direction={orderBy === "siteName" ? order : "asc"}
                                        onClick={() => handleRequestSort("siteName")}
                                        sx={{ color: "#fff", fontWeight: 600 }}
                                    >
                                        Site
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === "qrCode"}
                                        direction={orderBy === "qrCode" ? order : "asc"}
                                        onClick={() => handleRequestSort("qrCode")}
                                        sx={{ color: "#fff", fontWeight: 600 }}
                                    >
                                        QR ID
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="center">Radius (m)</TableCell>
                                <TableCell align="center">Coordinates</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {status === "LoadingFirstPage" ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedPoints.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                                        <Typography variant="body2" color="textSecondary">
                                            No patrol points yet. Use the QR codes tab to print labels, then register each
                                            code from the mobile app (Patrol → site → Add QR code), or ask an admin to add
                                            points.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedPoints.map((point) => (
                                    <TableRow key={point._id} hover>
                                        <TableCell align="center">
                                            <div id={`qr-${point._id}`} style={{ display: "inline-block" }}>
                                                <QRCodeCell>
                                                    <QRCodeSVG value={point.qrCode} size={50} level="H" />
                                                </QRCodeCell>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500, color: "#fff" }}>
                                                {point.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                icon={<MapPin className="w-3.5 h-3.5" />}
                                                label={point.siteName}
                                                size="small"
                                                sx={{
                                                    backgroundColor: "rgba(37, 99, 235, 0.2)",
                                                    color: "#fff",
                                                    borderRadius: "8px",
                                                    "& .MuiChip-icon": { color: "rgba(37, 99, 235, 0.8)" },
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontFamily: "monospace",
                                                    fontSize: "10px",
                                                    color: "rgba(255, 255, 255, 0.6)",
                                                    letterSpacing: "0.5px",
                                                }}
                                            >
                                                {point.qrCode}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="caption" sx={{ fontSize: "12px", color: "#cbd5e1" }}>
                                                {point.pointRadiusMeters ?? 200}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            {point.latitude && point.longitude ? (
                                                <Tooltip title="Click to open in Google Maps">
                                                    <CoordinatesButton
                                                        onClick={() => openInGoogleMaps(point.latitude!, point.longitude!, point.name)}
                                                    >
                                                        <MapPin className="w-3.5 h-3.5" />
                                                        <Typography variant="caption" sx={{ fontSize: "11px" }}>
                                                            {point.latitude.toFixed(6)}°, {point.longitude.toFixed(6)}°
                                                        </Typography>
                                                        <ExternalLink className="w-3 h-3" />
                                                    </CoordinatesButton>
                                                </Tooltip>
                                            ) : (
                                                <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.4)" }}>
                                                    No coordinates
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
                                                <Tooltip title="Edit Point">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setEditingPoint({ ...point })}
                                                        sx={{ color: "rgba(255, 255, 255, 0.6)", "&:hover": { color: "#3b82f6" } }}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Print QR Code">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => printSingleQR(point)}
                                                        sx={{ color: "rgba(255, 255, 255, 0.6)", "&:hover": { color: "#fff" } }}
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete Point">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setIsDeletingId(point._id)}
                                                        sx={{ color: "rgba(255, 255, 255, 0.6)", "&:hover": { color: "#ef4444" } }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {points && points.length > 0 && (
                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25, 50]}
                            component="div"
                            count={points.length}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={handleChangePage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            sx={{
                                color: "rgba(255, 255, 255, 0.7)",
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                "& .MuiTablePagination-selectIcon": {
                                    color: "rgba(255, 255, 255, 0.7)",
                                },
                                "& .MuiIconButton-root": {
                                    color: "rgba(255, 255, 255, 0.7)",
                                },
                            }}
                        />
                    )}
                </GlassTableContainer>

                {/* Load More Button */}
                {status === "CanLoadMore" && (
                    <div className="flex justify-center py-8">
                        <button
                            onClick={() => loadMore(ITEMS_PER_PAGE)}
                            className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors text-white/70"
                        >
                            Load More Points
                        </button>
                    </div>
                )}
                {status === "LoadingMore" && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingPoint && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4 custom-scrollbar">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Edit Patrol Point</h3>
                            <button onClick={() => setEditingPoint(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Assigned Site</label>
                                {orgIdToUse && (
                                    <SearchableSitePicker
                                        organizationId={orgIdToUse}
                                        selectedSiteId={editingPoint.siteId}
                                        onSelect={sId => setEditingPoint({ ...editingPoint, siteId: sId })}
                                        requestingUserId={currentUser?._id}
                                    />
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">Point Name</label>
                                <input
                                    value={editingPoint.name ?? ''}
                                    onChange={e => setEditingPoint({ ...editingPoint, name: e.target.value })}
                                    placeholder="e.g. Main Transformer"
                                    className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">
                                    QR code (unique in org — changing it removes duplicates elsewhere)
                                </label>
                                <input
                                    value={editingPoint.qrCode ?? ''}
                                    onChange={e => setEditingPoint({ ...editingPoint, qrCode: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-white font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">
                                    Point radius (m)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={editingPoint.pointRadiusMeters ?? 200}
                                    onChange={e =>
                                        setEditingPoint({
                                            ...editingPoint,
                                            pointRadiusMeters: parseInt(e.target.value, 10) || 200,
                                        })
                                    }
                                    className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block flex justify-between">
                                    GPS Coordinates
                                    <button
                                        onClick={() => {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => setEditingPoint({ ...editingPoint, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                                                (err) => toast.error("Failed: " + err.message)
                                            );
                                        }}
                                        className="text-primary hover:text-primary/80 transition-colors lowercase"
                                    >
                                        Use Current
                                    </button>
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="number"
                                        step="any"
                                        value={
                                            editingPoint.latitude == null ||
                                            (typeof editingPoint.latitude === 'number' && Number.isNaN(editingPoint.latitude))
                                                ? ''
                                                : editingPoint.latitude
                                        }
                                        onChange={e => {
                                            const v = e.target.value;
                                            setEditingPoint({
                                                ...editingPoint,
                                                latitude: v === '' ? undefined : parseFloat(v),
                                            });
                                        }}
                                        className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                    />
                                    <input
                                        type="number"
                                        step="any"
                                        value={
                                            editingPoint.longitude == null ||
                                            (typeof editingPoint.longitude === 'number' && Number.isNaN(editingPoint.longitude))
                                                ? ''
                                                : editingPoint.longitude
                                        }
                                        onChange={e => {
                                            const v = e.target.value;
                                            setEditingPoint({
                                                ...editingPoint,
                                                longitude: v === '' ? undefined : parseFloat(v),
                                            });
                                        }}
                                        className="w-full px-4 py-2.5 bg-neutral-900 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleUpdatePoint}
                            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4 text-center">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">Delete QR Point?</h3>
                            <p className="text-sm text-muted-foreground">All patrol logs associated with this point will remain, but the point will be removed.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeletingId(null)} className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10">Cancel</button>
                            <button onClick={() => handleDeletePoint(isDeletingId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}