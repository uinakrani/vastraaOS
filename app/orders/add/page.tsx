"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import debounce from "lodash.debounce";
import { db } from "../../../firebaseConfig";
import { addDays, differenceInDays, startOfDay, isAfter, isSameDay } from "date-fns";
import DashboardLayout from "../../../components/DashboardLayout";
import { formatINR } from "../../../utils/format";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiSearch, FiCalendar, FiUser, FiPhone, FiMapPin, FiClock, FiPlus, FiTrash2, FiCheckCircle, FiAlertCircle, FiShare2, FiX } from "react-icons/fi";
import { generateInvoiceMessage, getWhatsAppDeepLink } from "../../../utils/whatsapp";
import { checkOutfitAvailability, DEFAULT_BUFFER_DAYS, AvailabilityResponse } from "../../../lib/availabilityService";
import { useToast } from "../../../components/ToastProvider";
import { logOrderActivity } from "../../../lib/activityLogger";

interface OutfitRow {
    id: number;
    outfitData: any | null;
    size: string;
    basePrice: number;
    agreedPrice: number;
    availability?: AvailabilityResponse | null;
    searchQuery: string;
    isSearchOpen: boolean;
    notes?: string;
}

const INITIAL_ROWS = 3;

export default function CreateOrderPage() {
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
    const { showToast } = useToast();
    const [lastOrderData, setLastOrderData] = useState<any>(null);
    const [advancePayment, setAdvancePayment] = useState<number>(0);
    const [allOrders, setAllOrders] = useState<any[]>([]);
    const [searchResultsMap, setSearchResultsMap] = useState<{ [key: number]: any[] }>({});
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // --- Initial Load ---
    useEffect(() => {
        // Initialize Empty Rows
        const rows = Array.from({ length: 0 }).map((_, i) => ({
            id: i,
            outfitData: null,
            size: "",
            basePrice: 0,
            agreedPrice: 0,
            searchQuery: "",
            isSearchOpen: false,
            notes: ""
        }));
        setOutfitRows(rows);

        if (rows.length === 0) {
            // Optional: Start with 0 rows or 1 empty row?
            // User requested "plus button at the end", so starting empty is fine, or starting with 1.
            // Let's start with 1 empty row and open it? No, just list.
        }

        // Fetch Orders for Availability
        const fetchOrders = async () => {
            const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200));
            const snap = await getDocs(q);
            const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllOrders(orders);
        };
        fetchOrders();
    }, []);

    // --- Logic: Customer ---
    const validateMobile = (mobile: string) => {
        const re = /^\+91[0-9]{10}$/;
        return re.test(mobile) || /^[0-9]{10}$/.test(mobile);
    };

    const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        setCustomerMobile(val);
        if (val && !validateMobile(val.startsWith("+91") ? val : "+91" + val)) {
            setMobileError("Invalid Mobile Number");
        } else {
            setMobileError("");
        }
    };

    // --- Logic: Dates ---
    const calculateRentalDays = (start: Date, end: Date) => {
        const diff = differenceInDays(startOfDay(end), startOfDay(start));
        return diff >= 0 ? diff : 0;
    };

    const runAvailabilityCheck = (outfit: any, size: string, pDate: Date, rDate: Date, pSlot: string, rSlot: string): AvailabilityResponse | null => {
        if (!size || size === "") return null;
        const qty = (outfit.sizeQuantities && outfit.sizeQuantities[size]) ? outfit.sizeQuantities[size] : 1;

        const res = checkOutfitAvailability(allOrders, {
            outfitId: outfit.id,
            outfitSize: size,
            startDate: pDate,
            endDate: rDate,
            pickupSlot: pSlot as any,
            returnSlot: rSlot as any,
            totalStock: qty,
            bufferDays: DEFAULT_BUFFER_DAYS
        });
        return res;
    };

    const checkAllRowsAvailability = useCallback(() => {
        setOutfitRows(prev => prev.map(row => {
            if (row.outfitData && pickupDate && returnDate) {
                const avail = runAvailabilityCheck(row.outfitData, row.size, pickupDate, returnDate, pickupSlot, returnSlot);
                return { ...row, availability: avail };
            }
            return row;
        }));
    }, [pickupDate, returnDate, pickupSlot, returnSlot, allOrders]);

    useEffect(() => {
        if (pickupDate && returnDate) {
            if (isAfter(pickupDate, returnDate)) {
                setDateError("Pickup date cannot be after Return date");
            } else {
                setDateError("");
                setRentalDays(calculateRentalDays(pickupDate, returnDate));
                checkAllRowsAvailability();
            }
        }
    }, [pickupDate, returnDate, pickupSlot, returnSlot, checkAllRowsAvailability]);

    // --- Logic: Outfit Table ---
    const searchOutfits = async (queryText: string): Promise<any[]> => {
        if (!queryText.trim()) return [];
        const q = query(
            collection(db, "outfits"),
            where("name", ">=", queryText.toUpperCase()),
            where("name", "<=", queryText.toUpperCase() + "\uf8ff"),
            limit(5)
        );
        const snapshot = await getDocs(q);
        const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return results;
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
        outfitRows.forEach(row => {
            if (row.isSearchOpen) {
                debouncedSearch(row.id, row.searchQuery);
            }
        });
    }, [outfitRows, debouncedSearch]);

    const updateRow = (id: number, updates: Partial<OutfitRow>) => {
        setOutfitRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const selectOutfitForRow = (id: number, outfit: any) => {
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
        const row = outfitRows.find(r => r.id === id);
        if (!row || !row.outfitData || !pickupDate || !returnDate) {
            updateRow(id, { size });
            return;
        }

        const avail = runAvailabilityCheck(row.outfitData, size, pickupDate, returnDate, pickupSlot, returnSlot);
        updateRow(id, { size, availability: avail });
    };

    const addRow = () => {
        const newId = outfitRows.length > 0 ? Math.max(...outfitRows.map(r => r.id)) + 1 : 0;
        setOutfitRows([...outfitRows, { id: newId, outfitData: null, size: "", basePrice: 0, agreedPrice: 0, searchQuery: "", isSearchOpen: false, notes: "" }]);
        setEditingRowId(newId);
    };

    const removeRow = (id: number) => {
        setOutfitRows(outfitRows.filter(r => r.id !== id));
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

    const totalAmount = outfitRows.reduce((sum, row) => sum + (row.agreedPrice || 0), 0);
    const balanceAmount = totalAmount - advancePayment;

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
            showToast("Please select at least one outfit with a size.", "error");
            return;
        }

        const blocking = validRows.filter(r => r.availability && !r.availability.isAvailable);
        if (blocking.length > 0) {
            if (!confirm(`Some outfits are unavailable/booked. Proceed anyway?`)) {
                return;
            }
        }

        setLoading(true);
        try {
            const orderData = {
                customerName,
                customerMobile: customerMobile.startsWith("+91") ? customerMobile : "+91" + customerMobile,
                customerAddress,
                startDate: pickupDate,
                endDate: returnDate,
                pickupDate,
                returnDate,
                pickupSlot,
                returnSlot,
                rentalDays,
                outfitItems: validRows.map(r => ({
                    id: r.outfitData.id,
                    name: r.outfitData.name,
                    designCode: r.outfitData.code || "N/A",
                    size: r.size,
                    price: r.basePrice,
                    rentalPrice: r.agreedPrice,
                    imageUrl: r.outfitData.imageUrl || "",
                    notes: r.notes || ""
                })),
                totalAmount: totalAmount,
                advancePayment: advancePayment,
                finalPayment: 0,
                status: "pending",
                createdAt: new Date()
            };

            const docRef = await addDoc(collection(db, "orders"), orderData);

            await logOrderActivity(docRef.id, 'CREATED', `Order created for ${customerName}`);

            showToast("Order Created Successfully!", "success");
            setLastOrderData({ ...orderData, id: docRef.id });

            setCustomerName("");
            setCustomerMobile("");
            setCustomerAddress("");
            setPickupDate(startOfDay(new Date()));
            setReturnDate(addDays(startOfDay(new Date()), 1));
            setAdvancePayment(0);
            const rows = Array.from({ length: 3 }).map((_, i) => ({
                id: i,
                outfitData: null,
                size: "",
                basePrice: 0,
                agreedPrice: 0,
                searchQuery: "",
                isSearchOpen: false,
                notes: ""
            }));
            setOutfitRows(rows);

        } catch (e: any) {
            console.error(e);
            showToast("Failed to create order.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleShareWhatsApp = async () => {
        if (!lastOrderData) return;
        try {
            // Generate message
            const msg = generateInvoiceMessage(lastOrderData);
            // Get link (not async, but okay)
            const deepLink = getWhatsAppDeepLink(lastOrderData.customerMobile, msg);
            window.open(deepLink, '_blank');
        } catch (e) {
            console.error(e);
            alert("Error sharing");
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto px-4 py-6 text-gray-800">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create New Order</h1>
                        <p className="text-sm text-gray-500">Enter customer details, dates, and select outfits.</p>
                    </div>
                    <div>
                        {lastOrderData && (
                            <button
                                onClick={handleShareWhatsApp}
                                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-green-600 transition-all animate-bounce"
                            >
                                <FiShare2 /> Share Confirmation
                            </button>
                        )}
                    </div>
                </div>

                {/* Toasts replace inline messages */}

                <div className="grid grid-cols-1 gap-6">

                    {/* --- Unified Row: Customer & Dates --- */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                        {/* Column 1: Customer Details (Mobile, Name, Address) */}
                        <div className="lg:col-span-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-5 h-full">
                            <h2 className="text-sm font-bold uppercase text-gray-400 mb-6 tracking-wider flex items-center gap-2">
                                <FiUser className="text-indigo-500" /> Customer Details
                            </h2>
                            <div className="flex flex-col gap-5">
                                {/* Mobile (First) */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Mobile Number</label>
                                    <div className="relative">
                                        <FiPhone className="absolute left-3 top-2.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={customerMobile}
                                            onChange={handleMobileChange}
                                            className={`w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 max-h-10 text-sm font-bold text-gray-900 ${mobileError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                                            placeholder="+91 9876543210"
                                            maxLength={14}
                                        />
                                    </div>
                                    {mobileError && <p className="text-[10px] text-red-500 mt-1 font-bold">{mobileError}</p>}
                                </div>

                                {/* Name (Second) */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                                    <div className="relative">
                                        <FiUser className="absolute left-3 top-2.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 max-h-10 text-sm font-bold text-gray-900"
                                            placeholder="Enter customer name"
                                        />
                                    </div>
                                </div>

                                {/* Address (Third) */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Address (Optional)</label>
                                    <div className="relative">
                                        <FiMapPin className="absolute left-3 top-2.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={customerAddress}
                                            onChange={(e) => setCustomerAddress(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 max-h-10 text-sm font-medium text-gray-900"
                                            placeholder="City, Area"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Dates (Pickup & Return Calendars) */}
                        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 h-full">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full items-center">
                                {/* Pickup Card */}
                                <div className="flex flex-col gap-4 border-r border-transparent md:border-gray-100 md:pr-6">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-indigo-900 uppercase flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                                            Pickup Date
                                        </label>
                                        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden text-xs">
                                            <button
                                                onClick={() => setPickupSlot('Morning')}
                                                className={`px-3 py-1.5 font-bold uppercase transition-colors ${pickupSlot === 'Morning' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >Morning</button>
                                            <button
                                                onClick={() => setPickupSlot('Afternoon')}
                                                className={`px-3 py-1.5 font-bold uppercase transition-colors ${pickupSlot === 'Afternoon' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >Afternoon</button>
                                        </div>
                                    </div>
                                    <div className="flex justify-center mt-4">
                                        <DatePicker
                                            selected={pickupDate}
                                            onChange={(d: Date | null) => setPickupDate(d)}
                                            inline
                                            calendarClassName="!border-0 !font-sans !rounded-xl !bg-transparent"
                                            dayClassName={(date) =>
                                                isSameDay(date, pickupDate || new Date()) ? "!bg-indigo-600 !text-white !font-bold !rounded-full" : "hover:!bg-indigo-50 !rounded-full"
                                            }
                                        />
                                    </div>
                                </div>

                                {/* Return Card */}
                                <div className="flex flex-col gap-4 md:pl-6">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-amber-900 uppercase flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-amber-600"></div>
                                            Return Date
                                        </label>
                                        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden text-xs">
                                            <button
                                                onClick={() => setReturnSlot('Morning')}
                                                className={`px-3 py-1.5 font-bold uppercase transition-colors ${returnSlot === 'Morning' ? 'bg-amber-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >Morning</button>
                                            <button
                                                onClick={() => setReturnSlot('Afternoon')}
                                                className={`px-3 py-1.5 font-bold uppercase transition-colors ${returnSlot === 'Afternoon' ? 'bg-amber-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                                            >Afternoon</button>
                                        </div>
                                    </div>
                                    <div className="flex justify-center mt-4">
                                        <DatePicker
                                            selected={returnDate}
                                            onChange={(d: Date | null) => setReturnDate(d)}
                                            inline
                                            minDate={pickupDate || new Date()}
                                            calendarClassName="!border-0 !font-sans !rounded-lg !bg-transparent"
                                            dayClassName={(date) =>
                                                isSameDay(date, returnDate || new Date()) ? "!bg-amber-600 !text-white !font-bold !rounded-full" : "hover:!bg-amber-50 !rounded-full"
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                            {dateError && <p className="text-center text-xs text-red-500 font-bold mt-8 bg-red-50 p-2 rounded-lg border border-red-100">{dateError}</p>}
                        </div>
                    </div>

                    {/* --- Row 3: Outfit Selection List (Cards) --- */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                            {outfitRows.map((row) => (
                                <div
                                    key={row.id}
                                    onClick={() => setEditingRowId(row.id)}
                                    className={`relative bg-white rounded-2xl border transition-all cursor-pointer group hover:shadow-md ${!row.outfitData ? 'border-dashed border-gray-300 flex items-center justify-center p-8' : 'border-gray-200 p-4'}`}
                                >
                                    {!row.outfitData ? (
                                        <div className="text-center">
                                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                <FiPlus className="w-6 h-6" />
                                            </div>
                                            <p className="text-sm font-bold text-gray-500 group-hover:text-indigo-600">Tap to Select Outfit</p>
                                        </div>
                                    ) : (
                                        <div className="flex gap-4 items-start">
                                            <div className="w-20 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden relative border border-gray-100">
                                                {row.outfitData.imageUrl ? (
                                                    <img src={row.outfitData.imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-xs font-bold text-gray-300">NO IMG</div>
                                                )}
                                                {row.availability?.isAvailable === false && (
                                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full border border-red-200">Booked</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-gray-900 text-sm truncate leading-tight mb-1">{row.outfitData.name}</h3>
                                                <p className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded w-fit font-bold mb-2">{row.outfitData.code || row.outfitData.designCode || "No Code"}</p>

                                                <div className="flex flex-wrap gap-2 text-xs">
                                                    {row.size && (
                                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-100">
                                                            Size: {row.size}
                                                        </span>
                                                    )}
                                                    <span className="bg-gray-50 text-gray-900 px-2 py-1 rounded font-bold border border-gray-100">
                                                        {formatINR(row.agreedPrice || 0)}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeRow(row.id); }}
                                                className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all z-10"
                                            >
                                                <FiTrash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Add Button Card */}
                            <button
                                onClick={addRow}
                                className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center p-8 group min-h-[140px]"
                            >
                                <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-2 text-indigo-600 group-hover:scale-110 transition-transform">
                                    <FiPlus className="w-6 h-6 stroke-2" />
                                </div>
                                <span className="text-sm font-bold text-gray-600 group-hover:text-indigo-700">Add Another Outfit</span>
                            </button>
                        </div>

                        {/* Payment Summary */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <div className="flex flex-col md:flex-row justify-end items-end gap-12">
                                <div className="w-full md:w-1/3 space-y-4">
                                    <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                        <span className="text-sm font-medium text-gray-600">Total Rent</span>
                                        <span className="text-lg font-bold text-gray-900">{formatINR(totalAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-700">Advance</label>
                                        <div className="w-32">
                                            <input
                                                type="number"
                                                value={advancePayment || ''}
                                                onChange={(e) => setAdvancePayment(parseFloat(e.target.value) || 0)}
                                                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-right text-gray-900"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                        <span className="text-sm font-bold text-gray-800">Balance Due</span>
                                        <span className={`text-xl font-bold ${balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatINR(balanceAmount)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- Edit Popup Modal --- */}
                    {editingRowId !== null && (
                        <div onClick={handleCloseModal} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-0 sm:p-6">
                            <div onClick={(e) => e.stopPropagation()} className="bg-white w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scale-up flex flex-col">
                                {/* Header */}
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 z-30">
                                    <h3 className="text-lg font-bold text-gray-900">
                                        {outfitRows.find(r => r.id === editingRowId)?.outfitData ? 'Edit Details' : 'Select Outfit'}
                                    </h3>
                                    <button onClick={handleCloseModal} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">
                                        <FiX className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Content Body */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 flex flex-col relative text-left">

                                    {/* Sticky Search Bar (Visible if Not Selected or if we want to change) */}
                                    {!outfitRows.find(r => r.id === editingRowId)?.outfitData && (
                                        <div className="sticky top-0 z-20 bg-white p-4 border-b border-gray-100 shadow-sm">
                                            <div className="relative">
                                                <FiSearch className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                                                <input
                                                    type="text"
                                                    value={outfitRows.find(r => r.id === editingRowId)?.searchQuery || ''}
                                                    onChange={(e) => handleRowSearchChange(editingRowId, e.target.value)}
                                                    onFocus={() => updateRow(editingRowId, { isSearchOpen: true })}
                                                    className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent rounded-xl font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-base"
                                                    placeholder="Search by name or code..."
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* State 1: Search Results List */}
                                    {!outfitRows.find(r => r.id === editingRowId)?.outfitData && (
                                        <div className="p-4 space-y-3">
                                            {searchResultsMap[editingRowId] && searchResultsMap[editingRowId].length > 0 ? (
                                                searchResultsMap[editingRowId].map(res => (
                                                    <div
                                                        key={res.id}
                                                        onClick={() => selectOutfitForRow(editingRowId, res)}
                                                        className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 cursor-pointer hover:border-indigo-300 transition-all active:scale-98"
                                                    >
                                                        <div className="w-16 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                                            {res.imageUrl ? (
                                                                <img src={res.imageUrl} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 font-bold">NO IMG</div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="font-bold text-gray-900 text-base mb-0.5">{res.name}</h4>
                                                            <p className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded w-fit">{res.code || res.designCode}</p>
                                                            <div className="mt-2 text-sm font-medium text-gray-600">
                                                                Base Rent: <span className="text-gray-900 font-bold">{formatINR(res.price)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                                                            <FiPlus className="stroke-2" />
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-12 text-gray-400">
                                                    <FiSearch className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                                    <p className="text-sm font-medium">Type to search for outfits...</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* State 2: Selected Details Form */}
                                    {outfitRows.find(r => r.id === editingRowId)?.outfitData && (
                                        <div className="p-4 sm:p-6 space-y-6">

                                            {/* Selected Item Summary Card */}
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
                                                <div className="w-20 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                                    <img src={outfitRows.find(r => r.id === editingRowId)?.outfitData.imageUrl} className="w-full h-full object-cover" alt="" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-gray-900 text-lg leading-tight">{outfitRows.find(r => r.id === editingRowId)?.outfitData.name}</h4>
                                                    <p className="text-sm text-gray-500 font-medium">{outfitRows.find(r => r.id === editingRowId)?.outfitData.code}</p>
                                                    <button
                                                        onClick={() => updateRow(editingRowId, { outfitData: null, size: '', availability: null })}
                                                        className="mt-3 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                                    >
                                                        Change Outfit
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Sizes */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Select Size</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {outfitRows.find(r => r.id === editingRowId)?.outfitData.sizes?.map((s: string) => {
                                                        const isSelected = outfitRows.find(r => r.id === editingRowId)?.size === s;
                                                        return (
                                                            <button
                                                                key={s}
                                                                onClick={() => handleSizeSelect(editingRowId, s)}
                                                                className={`px-4 py-2 rounded-lg font-bold text-sm border-2 transition-all ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'}`}
                                                            >
                                                                {s}
                                                            </button>
                                                        );
                                                    })}
                                                    {(!outfitRows.find(r => r.id === editingRowId)?.outfitData.sizes || outfitRows.find(r => r.id === editingRowId)?.outfitData.sizes.length === 0) && (
                                                        <p className="text-sm text-gray-400 italic">No sizes defined for this outfit.</p>
                                                    )}
                                                </div>
                                                {/* Availability Status */}
                                                {outfitRows.find(r => r.id === editingRowId)?.availability && (
                                                    <div className={`mt-3 p-3 rounded-xl flex items-center gap-2 text-sm font-bold ${outfitRows.find(r => r.id === editingRowId)?.availability?.isAvailable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                        {outfitRows.find(r => r.id === editingRowId)?.availability?.isAvailable ? (
                                                            <><FiCheckCircle className="text-lg" /> This outfit is available!</>
                                                        ) : (
                                                            <><FiAlertCircle className="text-lg" /> Not available for these dates.</>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Rent */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Agreed Rent</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">₹</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={outfitRows.find(r => r.id === editingRowId)?.agreedPrice?.toLocaleString('en-IN') || ''}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/,/g, '');
                                                            const val = parseFloat(raw);
                                                            updateRow(editingRowId, { agreedPrice: isNaN(val) ? 0 : val });
                                                        }}
                                                        className="w-full pl-10 pr-4 py-4 bg-white border border-gray-200 rounded-xl font-bold text-2xl text-gray-900 focus:ring-2 focus:ring-indigo-500 transition-colors"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-400 mt-2 font-bold">Base Price: {formatINR(outfitRows.find(r => r.id === editingRowId)?.basePrice || 0)}</p>
                                            </div>

                                            {/* Notes */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Notes</label>
                                                <textarea
                                                    value={outfitRows.find(r => r.id === editingRowId)?.notes || ''}
                                                    onChange={(e) => updateRow(editingRowId, { notes: e.target.value })}
                                                    className="w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-colors"
                                                    rows={3}
                                                    placeholder="Fitting instructions, defects, etc."
                                                ></textarea>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer (Only visible if Outfit Selected) */}
                                {outfitRows.find(r => r.id === editingRowId)?.outfitData && (
                                    <div className="p-4 border-t border-gray-100 bg-white shrink-0 flex gap-3">
                                        <button
                                            onClick={() => { removeRow(editingRowId); setEditingRowId(null); }}
                                            className="px-6 py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                        >
                                            Remove
                                        </button>
                                        <button
                                            onClick={() => setEditingRowId(null)}
                                            className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform active:scale-95"
                                        >
                                            Done
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- Create Action --- */}
                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`px-8 py-4 rounded-xl text-lg font-bold text-white shadow-lg transition-all transform hover:-translate-y-1 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl'}`}
                        >
                            {loading ? 'Creating Order...' : 'Create Order'}
                        </button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
