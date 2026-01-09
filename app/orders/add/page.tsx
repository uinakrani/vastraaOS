"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import debounce from "lodash.debounce";
import { db } from "../../../firebaseConfig";
import { addDays, startOfDay, format } from "date-fns";
import { formatINR } from "../../../utils/format";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiSearch, FiCalendar, FiUser, FiPhone, FiMapPin, FiClock, FiPlus, FiTrash2, FiCheckCircle, FiAlertCircle, FiShare2, FiX, FiChevronRight, FiArrowLeft } from "react-icons/fi";
import { generateInvoiceMessage, getWhatsAppDeepLink } from "../../../utils/whatsapp";
import { checkOutfitAvailability, AvailabilityResponse } from "../../../lib/availabilityService";
import { useToast } from "../../../components/ToastProvider";
import { logOrderActivity } from "../../../lib/activityLogger";
import { UserAuth } from "../../../context/AuthContext";

// --- Types ---
interface Outfit {
    id: string;
    name: string;
    code?: string;
    designCode?: string; // fallback
    imageUrl?: string;
    price: number;
    sizes?: string[];
    sizeQuantities?: Record<string, number>;
}

interface OrderData {
    id: string;
    status?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startDate?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    endDate?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deliveryDate?: any;
    pickupSlot?: string;
    returnSlot?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outfitItems?: any[];
    studioId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface OutfitRow {
    id: number;
    outfitData: Outfit | null; // Typed
    size: string;
    basePrice: number;
    agreedPrice: number;
    availability?: AvailabilityResponse | null;
    searchQuery: string;
    isSearchOpen: boolean;
    notes?: string;
}

export default function CreateOrderPage() {
    const { user, currentStudio } = UserAuth();
    const router = useRouter();
    // --- Customer Details ---
    const [customerName, setCustomerName] = useState("");
    const [customerMobile, setCustomerMobile] = useState("");
    const [customerAddress, setCustomerAddress] = useState("");
    const [mobileError, setMobileError] = useState("");

    // --- Date Selection ---
    const [pickupDate, setPickupDate] = useState<Date | null>(startOfDay(new Date()));
    const [returnDate, setReturnDate] = useState<Date | null>(addDays(startOfDay(new Date()), 1));
    const [pickupSlot, setPickupSlot] = useState<string>('Morning');
    const [returnSlot, setReturnSlot] = useState<string>('Afternoon');
    const [rentalDays, setRentalDays] = useState(1);
    const [dateError, setDateError] = useState("");

    // --- Outfit Table State ---
    const [outfitRows, setOutfitRows] = useState<OutfitRow[]>([]);

    // --- General State ---
    const [loading, setLoading] = useState(false);
    const [allOrders, setAllOrders] = useState<OrderData[]>([]); // Typed
    const { showToast } = useToast();
    const [lastOrderData, setLastOrderData] = useState<OrderData | null>(null);
    const [advancePayment, setAdvancePayment] = useState<number>(0);
    const [searchResultsMap, setSearchResultsMap] = useState<{ [key: number]: Outfit[] }>({}); // Typed
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // --- Initial Load ---
    useEffect(() => {
        const fetchOrders = async () => {
            try {
                // Fetch recent orders (last few months + future) or simplified: fetch active/pending/confirmed
                const today = startOfDay(new Date());
                // Firestore inequality filter req: endDate >= today
                const qSafe = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(300));

                const snapshot = await getDocs(qSafe);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                setAllOrders(fetchedOrders);
            } catch (e) {
                console.error("Failed to fetch orders for availability", e);
            }
        };

        fetchOrders();
    }, []);

    // --- Logic: Customer ---
    const validateMobile = (mobile: string) => {
        const re = /^\+91[0-9]{10}$/;
        return re.test(mobile) || /^[0-9]{10}$/.test(mobile);
    };

    const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCustomerMobile(val);
        if (val && !validateMobile(val.startsWith("+91") ? val : "+91" + val)) {
            // No error while typing
        } else {
            setMobileError("");
        }
    };

    const handleMobileBlur = () => {
        if (customerMobile && !validateMobile(customerMobile.startsWith("+91") ? customerMobile : "+91" + customerMobile)) {
            setMobileError("Please enter valid 10-digit number");
        } else {
            setMobileError("");
        }
    }

    // --- Logic: Dates ---
    useEffect(() => {
        if (pickupDate && returnDate) {
            if (returnDate < pickupDate) {
                setDateError("Return date cannot be before pickup date");
                setRentalDays(0);
            } else {
                setDateError("");
                const diffTime = Math.abs(returnDate.getTime() - pickupDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                setRentalDays(diffDays === 0 ? 1 : diffDays);
            }
        }
    }, [pickupDate, returnDate]);

    // --- Logic: Availability Check ---
    const runAvailabilityCheck = useCallback((outfit: Outfit, size: string, pDate: Date, rDate: Date, pSlot: string, rSlot: string) => {
        if (!outfit || !size || !pDate || !rDate) return null;
        try {
            const stock = outfit.sizeQuantities?.[size] || 1;

            const result = checkOutfitAvailability(allOrders, {
                outfitId: outfit.id,
                outfitSize: size,
                startDate: pDate,
                endDate: rDate,
                pickupSlot: pSlot as 'Morning' | 'Afternoon',
                returnSlot: rSlot as 'Morning' | 'Afternoon',
                totalStock: stock,
                bufferDays: 2
            });
            return result;
        } catch (e) {
            console.error(e);
            return null;
        }
    }, [allOrders]);

    // Re-check all rows when dates change
    useEffect(() => {
        if (outfitRows.length > 0 && pickupDate && returnDate) {
            setOutfitRows(prev => prev.map(row => {
                if (row.outfitData && row.size) {
                    const avail = runAvailabilityCheck(row.outfitData, row.size, pickupDate, returnDate, pickupSlot, returnSlot);
                    return { ...row, availability: avail };
                }
                return row;
            }));
        }
    }, [pickupDate, returnDate, pickupSlot, returnSlot, runAvailabilityCheck]);


    // --- Logic: Outfit Search & Updates ---
    const searchOutfits = async (queryText: string): Promise<Outfit[]> => {
        if (!queryText.trim() || !currentStudio?.studioId) return [];
        const normalizedQuery = queryText.trim().toLowerCase();
        const outfitsRef = collection(db, "outfits");

        try {
            const q = query(
                outfitsRef,
                where("studioId", "==", currentStudio.studioId),
                where("searchName", ">=", normalizedQuery),
                where("searchName", "<=", normalizedQuery + "\uf8ff"),
                limit(10)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Outfit));
        } catch (error: any) {
            if (error.message?.includes("index") || error.code === "failed-precondition") {
                console.warn("Index missing for order search, falling back to local filter.");
                const fallbackQ = query(
                    outfitsRef,
                    where("studioId", "==", currentStudio.studioId)
                );
                const snapshot = await getDocs(fallbackQ);
                const allOutfits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

                return allOutfits.filter((o: any) =>
                    o.code?.toUpperCase().includes(queryText.toUpperCase()) ||
                    o.searchName?.toLowerCase().includes(normalizedQuery) ||
                    o.name?.toLowerCase().includes(normalizedQuery)
                ).slice(0, 15) as Outfit[];
            }
            throw error;
        }
    };

    const handleRowSearchChange = async (id: number, val: string) => {
        updateRow(id, { searchQuery: val, isSearchOpen: true });
    };

    const debouncedSearch = useCallback(debounce(async (id: number, val: string) => {
        if (val) {
            const res = await searchOutfits(val);
            setSearchResultsMap(prev => ({ ...prev, [id]: res }));
        } else {
            setSearchResultsMap(prev => ({ ...prev, [id]: [] }));
        }
    }, 300), []);

    useEffect(() => {
        const row = outfitRows.find(r => r.id === editingRowId);
        if (row && row.isSearchOpen) {
            debouncedSearch(row.id, row.searchQuery);
        }
    }, [editingRowId, outfitRows, debouncedSearch]);

    const updateRow = (id: number, updates: Partial<OutfitRow>) => {
        setOutfitRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const selectOutfitForRow = (id: number, outfit: Outfit) => {
        updateRow(id, {
            outfitData: outfit,
            searchQuery: outfit.name,
            basePrice: outfit.price,
            agreedPrice: outfit.price,
            size: "",
            isSearchOpen: false,
            availability: null
        });
        setSearchResultsMap(prev => ({ ...prev, [id]: [] }));
    };

    const handleSizeSelect = (id: number, size: string) => {
        updateRow(id, { size });
        const row = outfitRows.find(r => r.id === id);
        if (row && row.outfitData && pickupDate && returnDate) {
            const avail = runAvailabilityCheck(row.outfitData, size, pickupDate, returnDate, pickupSlot, returnSlot);
            updateRow(id, { size, availability: avail });
        }
    };

    const addNewRowAndEdit = () => {
        const newId = outfitRows.length > 0 ? Math.max(...outfitRows.map(r => r.id)) + 1 : 0;
        const newRow: OutfitRow = {
            id: newId,
            outfitData: null,
            size: "",
            basePrice: 0,
            agreedPrice: 0,
            searchQuery: "",
            isSearchOpen: false,
            notes: ""
        };
        setOutfitRows([...outfitRows, newRow]);
        setEditingRowId(newId);
    };

    const removeRow = (id: number) => {
        setOutfitRows(prev => prev.filter(r => r.id !== id));
    };

    const handleCloseModal = () => {
        if (editingRowId !== null) {
            const row = outfitRows.find(r => r.id === editingRowId);
            if (row && !row.outfitData) {
                setOutfitRows(prev => prev.filter(r => r.id !== editingRowId));
            }
            setEditingRowId(null);
        }
    };

    // --- Calculations ---
    const totalAmount = outfitRows.reduce((sum, row) => sum + (row.agreedPrice || 0), 0);
    const balanceAmount = totalAmount - advancePayment;

    // --- Submit ---
    const handleSubmit = async () => {
        if (!customerName || !customerMobile) {
            showToast("Please fill customer details.", "error");
            return;
        }
        if (!pickupDate || !returnDate || dateError) {
            showToast("Invalid dates.", "error");
            return;
        }
        if (mobileError) {
            showToast(mobileError, "error");
            return;
        }

        const validRows = outfitRows.filter(r => r.outfitData && r.size);
        if (validRows.length === 0) {
            showToast("Please add at least one outfit.", "error");
            return;
        }

        const blocking = validRows.filter(r => r.availability && !r.availability.isAvailable);
        if (blocking.length > 0) {
            if (!confirm(`Some outfits are unavailable. Proceed?`)) return;
        }

        setLoading(true);
        try {
            const orderData = {
                studioId: currentStudio?.studioId,
                customerName,
                customerMobile: customerMobile.startsWith("+91") ? customerMobile : "+91" + customerMobile,
                customerAddress,
                startDate: pickupDate,
                endDate: returnDate,
                pickupDate,
                returnDate,
                pickupSlot,
                returnSlot,
                outfitItems: validRows.map(r => ({
                    outfitId: r.outfitData!.id,
                    designCode: r.outfitData!.code || r.outfitData!.designCode || "",
                    designName: r.outfitData!.name,
                    size: r.size,
                    price: r.basePrice,
                    rentalPrice: r.agreedPrice,
                    imageUrl: r.outfitData!.imageUrl || "",
                    notes: r.notes || ""
                })),
                totalAmount,
                advancePayment,
                finalPayment: 0,
                status: "pending",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: user?.uid
            };

            if (!orderData.studioId) {
                showToast("Studio workspace not found. Please refresh.", "error");
                return;
            }

            const docRef = await addDoc(collection(db, "orders"), orderData);
            await logOrderActivity(docRef.id, 'CREATED', `Order created for ${customerName}`);

            showToast("Order Created Successfully!", "success");
            setLastOrderData({ ...orderData, id: docRef.id });

            setCustomerName("");
            setCustomerMobile("");
            setCustomerAddress("");
            setAdvancePayment(0);
            setOutfitRows([]);

        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error(e);
            showToast("Failed to create order.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleShareWhatsApp = () => {
        if (!lastOrderData) return;
        const msg = generateInvoiceMessage(lastOrderData);
        const deepLink = getWhatsAppDeepLink(lastOrderData.customerMobile, msg);
        window.open(deepLink, '_blank');
    };

    return (
        <>
            <div className="min-h-full bg-gray-50 pb-32">

                {/* Header */}
                <div className="bg-white/80 backdrop-blur-md px-4 py-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-40 shadow-sm">
                    <button onClick={() => router.back()} className="p-2 -ml-1 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
                        <FiArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900 flex-1">Create Order</h1>
                    {lastOrderData && (
                        <button onClick={handleShareWhatsApp} className="p-2 bg-green-500 text-white rounded-full shadow-lg active:scale-90 transition-transform">
                            <FiShare2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <div className="w-full px-5 md:px-8 lg:px-12 py-6 space-y-6">

                    {/* Customer Details Section */}
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3 text-indigo-600 mb-2">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <FiUser className="w-5 h-5 stroke-2" />
                            </div>
                            <span className="font-bold text-lg text-gray-900">Customer</span>
                        </div>

                        {/* Mobile - Big Input */}
                        <div className="relative">
                            <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="tel"
                                value={customerMobile}
                                onChange={handleMobileChange}
                                onBlur={handleMobileBlur}
                                placeholder="Mobile Number"
                                className={`form-input pl-12 ${mobileError ? 'border-red-100 focus:border-red-500 bg-red-50/10' : ''}`}
                                inputMode="numeric"
                            />
                            {mobileError && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 text-xs font-bold">{mobileError}</span>}
                        </div>

                        {/* Name - Big Input */}
                        <div className="relative">
                            <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Customer Name"
                                className="form-input pl-12"
                            />
                        </div>

                        {/* Address */}
                        <div className="relative">
                            <FiMapPin className="absolute left-4 top-4 text-gray-400 w-5 h-5" />
                            <textarea
                                value={customerAddress}
                                onChange={(e) => setCustomerAddress(e.target.value)}
                                placeholder="Full Address (Optional)"
                                rows={2}
                                className="form-textarea pl-12 resize-none"
                            />
                        </div>
                    </div>

                    {/* Date Section */}
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3 text-indigo-600 mb-2">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <FiCalendar className="w-5 h-5 stroke-2" />
                            </div>
                            <span className="font-bold text-lg text-gray-900">Dates</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Pickup */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <DatePicker
                                        selected={pickupDate}
                                        onChange={(date: Date | null) => setPickupDate(date)}
                                        dateFormat="dd MMM yyyy"
                                        className="form-input text-center cursor-pointer"
                                        wrapperClassName="w-full"
                                        onFocus={(e) => e.target.blur()}
                                        withPortal
                                        portalId="root-portal"
                                    />
                                </div>
                                <select
                                    value={pickupSlot}
                                    onChange={(e) => setPickupSlot(e.target.value)}
                                    className="w-full p-3 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 border-none focus:ring-0 text-center"
                                >
                                    <option>Morning</option>
                                    <option>Evening</option>
                                </select>
                            </div>

                            {/* Return */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <DatePicker
                                        selected={returnDate}
                                        onChange={(date: Date | null) => setReturnDate(date)}
                                        dateFormat="dd MMM yyyy"
                                        minDate={pickupDate || new Date()}
                                        className="form-input text-center cursor-pointer"
                                        wrapperClassName="w-full"
                                        onFocus={(e) => e.target.blur()}
                                        withPortal
                                        portalId="root-portal"
                                    />
                                </div>
                                <select
                                    value={returnSlot}
                                    onChange={(e) => setReturnSlot(e.target.value)}
                                    className="w-full p-3 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 border-none focus:ring-0 text-center"
                                >
                                    <option>Morning</option>
                                    <option>Evening</option>
                                </select>
                            </div>
                        </div>
                        {dateError && <p className="text-red-500 font-bold text-sm text-center">{dateError}</p>}
                    </div>

                    {/* Outfit List Section */}
                    <div className="space-y-4">
                        <h2 className="font-bold text-lg text-gray-900 px-2 flex justify-between items-center">
                            Order Items
                            <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">{outfitRows.length} items</span>
                        </h2>

                        {outfitRows.length === 0 ? (
                            <div
                                onClick={addNewRowAndEdit}
                                className="border-2 border-dashed border-gray-300 rounded-3xl p-8 flex flex-col items-center justify-center text-gray-400 gap-3 cursor-pointer hover:bg-gray-50 hover:border-indigo-400 transition-all active:scale-98"
                            >
                                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-indigo-500">
                                    <FiPlus className="w-8 h-8" />
                                </div>
                                <span className="font-bold">Add First Outfit</span>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {outfitRows.map((row) => (
                                    <div
                                        key={row.id}
                                        onClick={() => setEditingRowId(row.id)}
                                        className="bg-white p-4 rounded-2xl border border-gray-200 flex items-center gap-4 active:scale-[0.98] transition-all active:bg-gray-50"
                                    >
                                        <div className="w-20 h-24 bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                                            {row.outfitData?.imageUrl ? (
                                                <img src={row.outfitData.imageUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-300">No Img</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {row.outfitData ? (
                                                <>
                                                    <h3 className="font-bold text-gray-900 truncate text-lg">{row.outfitData.name}</h3>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-lg text-gray-600">{row.size || 'No Size'}</span>
                                                        <span className="text-base font-bold text-indigo-600 font-mono">{formatINR(row.agreedPrice)}</span>
                                                    </div>
                                                    {row.availability?.isAvailable === false && (
                                                        <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
                                                            <FiAlertCircle /> Unavailable
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-gray-400 font-bold italic">Select Outfit...</span>
                                            )}
                                        </div>
                                        <FiChevronRight className="text-gray-300 w-6 h-6" />
                                    </div>
                                ))}

                                <button
                                    onClick={addNewRowAndEdit}
                                    className="w-full py-4 rounded-xl border-2 border-gray-100 border-dashed text-gray-500 font-bold hover:bg-gray-50 hover:border-gray-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <FiPlus /> Add Another Outfit
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Payment Summary */}
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 space-y-4">
                        <div className="flex justify-between items-center text-gray-900">
                            <span className="font-medium text-gray-500">Total Amount</span>
                            <span className="text-xl font-bold">{formatINR(totalAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-900">
                            <span className="font-medium text-gray-500">Advance Paid</span>
                            <div className="w-32 relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">₹</span>
                                <input
                                    type="number"
                                    value={advancePayment || ''}
                                    onChange={(e) => setAdvancePayment(parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="form-input pl-8 text-right font-bold"
                                />
                            </div>
                        </div>
                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                            <span className="font-bold text-gray-900">Balance Due</span>
                            <span className={`text-xl font-bold ${balanceAmount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {formatINR(balanceAmount)}
                            </span>
                        </div>
                    </div>

                </div>

                {/* Sticky Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 pb-safe z-30 lg:pl-72 transition-all">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-white font-bold text-lg active:scale-[0.98] transition-all
                            ${loading ? 'bg-indigo-400 cursor-wait' : 'bg-[#0F172A]'}`}
                    >
                        {loading ? <span className="animate-pulse">Creating...</span> : 'Create Order'}
                    </button>
                </div>

                {/* --- Modal for Outfit Selection --- */}
                {editingRowId !== null && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        {/* Backdrop - animated separately so it doesn't hide the popup's zoom */}
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
                            onClick={handleCloseModal}
                        />
                        {/* Popup Content - z-10 to stay above backdrop */}
                        <div
                            className="relative z-10 bg-white w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl flex flex-col animate-ios-popup overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >

                            {/* Modal Header */}
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                                <h3 className="text-lg font-bold text-gray-900">
                                    {outfitRows.find(r => r.id === editingRowId)?.outfitData ? 'Edit Details' : 'Select Outfit'}
                                </h3>
                                <button onClick={handleCloseModal} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                    <FiX className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>

                            {/* Modal Check: Search vs Form */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50">

                                {!outfitRows.find(r => r.id === editingRowId)?.outfitData ? (
                                    // SEARCH MODE
                                    <div className="flex flex-col h-full">
                                        <div className="p-4 bg-white sticky top-0 z-10 border-b border-gray-100">
                                            <div className="relative">
                                                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                                <input
                                                    type="text"
                                                    value={outfitRows.find(r => r.id === editingRowId)?.searchQuery || ''}
                                                    onChange={(e) => handleRowSearchChange(editingRowId, e.target.value)}
                                                    autoFocus
                                                    placeholder="Search outfit name or code..."
                                                    className="form-input pl-12 font-bold"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-1 p-4 space-y-3">
                                            {searchResultsMap[editingRowId]?.length > 0 ? (
                                                searchResultsMap[editingRowId].map(res => (
                                                    <div
                                                        key={res.id}
                                                        onClick={() => selectOutfitForRow(editingRowId, res)}
                                                        className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all"
                                                    >
                                                        <div className="w-16 h-20 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                                                            {res.imageUrl && <img src={res.imageUrl} className="w-full h-full object-cover" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <h4 className="font-bold text-gray-900">{res.name}</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-500">{res.code}</span>
                                                                <span className="text-sm font-bold text-indigo-600">{formatINR(res.price)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                                            <FiPlus className="stroke-2" />
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-10 text-gray-400 font-medium">Type to search...</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // EDIT MODE
                                    <div className="p-5 space-y-6">
                                        {/* Outfit Card */}
                                        <div className="bg-white p-4 rounded-2xl border border-gray-200 flex items-start gap-4">
                                            <div className="w-20 h-24 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                                                <img src={outfitRows.find(r => r.id === editingRowId)?.outfitData!.imageUrl} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-gray-900 text-lg leading-tight">{outfitRows.find(r => r.id === editingRowId)?.outfitData!.name}</h4>
                                                <p className="text-sm text-gray-500 font-bold mt-1">{outfitRows.find(r => r.id === editingRowId)?.outfitData!.code}</p>
                                                <button
                                                    onClick={() => updateRow(editingRowId, { outfitData: null, size: '', availability: null })}
                                                    className="mt-3 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>

                                        {/* Sizes */}
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 mb-3">Select Size</h4>
                                            <div className="flex flex-wrap gap-3">
                                                {outfitRows.find(r => r.id === editingRowId)?.outfitData!.sizes?.map((s: string) => (
                                                    <button
                                                        key={s}
                                                        onClick={() => handleSizeSelect(editingRowId, s)}
                                                        className={`min-w-[3.5rem] h-12 rounded-xl font-bold flex items-center justify-center text-sm transition-all
                                                                ${outfitRows.find(r => r.id === editingRowId)?.size === s
                                                                ? 'bg-gray-900 text-white shadow-lg transform scale-105'
                                                                : 'bg-white border border-gray-200 text-gray-600'}`
                                                        }
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Availability Alert */}
                                            {outfitRows.find(r => r.id === editingRowId)?.availability && (
                                                <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 text-sm font-bold ${outfitRows.find(r => r.id === editingRowId)?.availability?.isAvailable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                    {outfitRows.find(r => r.id === editingRowId)?.availability?.isAvailable ? (
                                                        <><FiCheckCircle className="text-xl shrink-0" /> Available!</>
                                                    ) : (
                                                        <><FiAlertCircle className="text-xl shrink-0" /> Unavailable!</>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Rent Input */}
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 mb-2">Rental Price</h4>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                                <input
                                                    type="number"
                                                    value={outfitRows.find(r => r.id === editingRowId)?.agreedPrice || ''}
                                                    onChange={(e) => updateRow(editingRowId, { agreedPrice: parseFloat(e.target.value) || 0 })}
                                                    className="form-input pl-10 font-bold text-2xl"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-2 ml-1 font-bold">Base Price: {formatINR(outfitRows.find(r => r.id === editingRowId)?.basePrice || 0)}</p>
                                        </div>

                                    </div>
                                )}
                            </div>

                            {/* Modal Actions */}
                            {outfitRows.find(r => r.id === editingRowId)?.outfitData && (
                                <div className="p-4 bg-white border-t border-gray-100 flex gap-4 shrink-0 pb-safe">
                                    <button
                                        onClick={() => { removeRow(editingRowId); setEditingRowId(null); }}
                                        className="px-6 py-4 rounded-xl bg-red-50 text-red-600 font-bold"
                                    >
                                        Remove
                                    </button>
                                    <button
                                        onClick={() => setEditingRowId(null)}
                                        className="flex-1 px-6 py-4 rounded-xl bg-gray-900 text-white font-bold shadow-lg"
                                    >
                                        Confirm Item
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
