"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, limit, where, documentId } from "firebase/firestore";
import debounce from "lodash.debounce";
import { db } from "../../../firebaseConfig";
import { addDays, differenceInDays, startOfDay, isAfter, isSameDay } from "date-fns";
import DashboardLayout from "../../../components/DashboardLayout";
import { formatINR } from "../../../utils/format";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiArrowLeft, FiSearch, FiCalendar, FiUser, FiPhone, FiMapPin, FiClock, FiPlus, FiTrash2, FiCheckCircle, FiAlertCircle, FiShare2, FiSave, FiCheckSquare, FiX, FiFileText, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { generateInvoiceMessage, getWhatsAppDeepLink } from "../../../utils/whatsapp";
import { checkOutfitAvailability, DEFAULT_BUFFER_DAYS, AvailabilityResponse } from "../../../lib/availabilityService";
import { useToast } from "../../../components/ToastProvider";
import { logOrderActivity } from "../../../lib/activityLogger";
import { FiActivity } from "react-icons/fi";

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
  isExpanded?: boolean; // For accordion
}

export default function EditOrderPage() {
  const { orderId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Customer Details ---
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [mobileError, setMobileError] = useState("");

  // --- Date Selection ---
  const [pickupDate, setPickupDate] = useState<Date | null>(null);
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [pickupSlot, setPickupSlot] = useState<string>('Morning');
  const [returnSlot, setReturnSlot] = useState<string>('Afternoon');
  const [rentalDays, setRentalDays] = useState(1);
  const [dateError, setDateError] = useState("");

  // --- Outfit Table State ---
  const [outfitRows, setOutfitRows] = useState<OutfitRow[]>([]);

  // --- General State ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);


  // Original Order Data (for reference & status)
  const [originalOrder, setOriginalOrder] = useState<any>(null);
  const [status, setStatus] = useState("");

  // Payments
  const [advancePayment, setAdvancePayment] = useState<number>(0);
  const [finalPayment, setFinalPayment] = useState<number>(0);

  // Availability Context
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [searchResultsMap, setSearchResultsMap] = useState<{ [key: number]: any[] }>({});

  // --- Fetch Order & Context ---
  useEffect(() => {
    const init = async () => {
      if (!orderId) return;
      try {
        // 1. Fetch This Order
        const docRef = doc(db, "orders", orderId as string);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          router.push("/orders");
          return;
        }

        const orderData = { id: docSnap.id, ...docSnap.data() } as any;
        setOriginalOrder(orderData);

        // Populate Form
        setCustomerName(orderData.customerName || "");

        // Strip +91 for UI input
        let mobile = orderData.customerMobile || "";
        if (mobile.startsWith("+91")) mobile = mobile.replace("+91", "");
        setCustomerMobile(mobile);

        setCustomerAddress(orderData.customerAddress || "");

        const pDate = orderData.pickupDate ? (orderData.pickupDate.toDate ? orderData.pickupDate.toDate() : new Date(orderData.pickupDate)) : null;
        const rDate = orderData.returnDate ? (orderData.returnDate.toDate ? orderData.returnDate.toDate() : new Date(orderData.returnDate)) : null;

        setPickupDate(pDate);
        setReturnDate(rDate);
        setPickupSlot(orderData.pickupSlot || 'Morning');
        setReturnSlot(orderData.returnSlot || 'Afternoon');
        setRentalDays(orderData.rentalDays || 1);

        setAdvancePayment(orderData.advancePayment || 0);
        setFinalPayment(orderData.finalPayment || 0);
        setStatus(orderData.status || "pending");

        // 2. Fetch All Orders (for availability check)
        const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200));
        const snapOrders = await getDocs(qOrders);
        const fetchedOrders = snapOrders.docs.map(d => ({ id: d.id, ...d.data() }));
        const otherOrders = fetchedOrders.filter(o => o.id !== orderId);
        setAllOrders(otherOrders);

        // 3. Reconstruct Outfit Rows
        if (orderData.outfitItems && orderData.outfitItems.length > 0) {
          const outfitIds = orderData.outfitItems.map((item: any) => item.id).filter(Boolean);

          let fullOutfitsMap: { [key: string]: any } = {};

          if (outfitIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < outfitIds.length; i += 10) {
              chunks.push(outfitIds.slice(i, i + 10));
            }

            for (const chunk of chunks) {
              const qOutfits = query(collection(db, "outfits"), where(documentId(), "in", chunk));
              const snapOutfits = await getDocs(qOutfits);
              snapOutfits.forEach(d => {
                fullOutfitsMap[d.id] = { id: d.id, ...d.data() };
              });
            }
          }

          const loadedRows: OutfitRow[] = orderData.outfitItems.map((item: any, index: number) => ({
            id: index,
            outfitData: fullOutfitsMap[item.id] || {
              id: item.id,
              name: item.name,
              code: item.designCode,
              imageUrl: item.imageUrl,
              sizes: [item.size]
            },
            size: item.size,
            basePrice: item.price,
            agreedPrice: item.rentalPrice,
            searchQuery: item.designCode || item.name,
            isSearchOpen: false,
            notes: item.notes || "",
            isExpanded: false,
            availability: null
          }));
          setOutfitRows(loadedRows);
        } else {
          setOutfitRows([]);
        }

        setLoading(false);

        // 4. Fetch Activity Logs
        const logsQ = query(collection(db, "orders", orderId as string, "activity_logs"), orderBy("timestamp", "desc"));
        const logsSnap = await getDocs(logsQ);
        setActivityLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        setLoading(false);

      } catch (error) {
        console.error("Error loading order:", error);
        showToast("Failed to load order details.", "error");
        setLoading(false);
      }
    };

    if (orderId) init();
  }, [orderId, router]);

  // --- Logic: Customer ---
  const validateMobile = (mobile: string) => {
    return /^[0-9]{10}$/.test(mobile);
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    setCustomerMobile(val);

    if (val.length > 0 && val.length < 10) {
      setMobileError("Must be 10 digits");
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

  const toggleRowExpansion = (id: number) => {
    setOutfitRows(prev => prev.map(r => r.id === id ? { ...r, isExpanded: !r.isExpanded } : r));
  };

  const addRow = () => {
    const newId = outfitRows.length > 0 ? Math.max(...outfitRows.map(r => r.id)) + 1 : 0;
    setOutfitRows([...outfitRows, { id: newId, outfitData: null, size: "", basePrice: 0, agreedPrice: 0, searchQuery: "", isSearchOpen: false, notes: "", isExpanded: false }]);
  };

  const removeRow = (id: number) => {
    setOutfitRows(outfitRows.filter(r => r.id !== id));
  };

  const totalAmount = outfitRows.reduce((sum, row) => sum + (row.agreedPrice || 0), 0);
  const balanceAmount = totalAmount - advancePayment - finalPayment;

  // --- Actions ---

  // 1. SAVE CHANGES
  const handleUpdate = async () => {
    if (!originalOrder) return;
    setSaving(true);

    try {
      if (!customerName || !customerMobile) throw new Error("Please fill customer details.");
      if (customerMobile.length !== 10) throw new Error("Mobile number must be 10 digits.");
      if (!pickupDate || !returnDate || dateError) throw new Error("Invalid dates.");
      if (mobileError) throw new Error(mobileError);
      const validRows = outfitRows.filter(r => r.outfitData && r.size);
      if (validRows.length === 0) throw new Error("Please select at least one outfit with a size.");

      const blocking = validRows.filter(r => r.availability && !r.availability.isAvailable);
      if (blocking.length > 0) {
        if (!confirm(`Warning: Some outfits appear unavailable for the new dates. Save anyway?`)) {
          setSaving(false);
          return;
        }
      }

      const mobileToSave = customerMobile.startsWith("+91") ? customerMobile : "+91" + customerMobile;

      const orderRef = doc(db, "orders", originalOrder.id);
      await updateDoc(orderRef, {
        customerName,
        customerMobile: mobileToSave,
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
          price: r.basePrice || 0,
          rentalPrice: r.agreedPrice || 0,
          imageUrl: r.outfitData.imageUrl || "",
          notes: r.notes || ""
        })),
        totalAmount: totalAmount,
        advancePayment: advancePayment,
        finalPayment: finalPayment,
      });

      await logOrderActivity(originalOrder.id, 'UPDATED', 'Order details updated');

      showToast("Order updated successfully!", "success");
      // Refresh logs
      const logsQ = query(collection(db, "orders", originalOrder.id, "activity_logs"), orderBy("timestamp", "desc"));
      const logsSnap = await getDocs(logsQ);
      setActivityLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (error: any) {
      console.error("Error updating order:", error);
      showToast(error.message || "Failed to update order.", "error");
    } finally {
      setSaving(false);
    }
  };

  // 2. MARK AS RETURNED
  const handleReturnOrder = async () => {
    if (!originalOrder) return;
    if (!confirm(`Mark order as RETURNED and record payment of ₹${finalPayment}?`)) return;

    setSaving(true);
    try {
      const orderRef = doc(db, "orders", originalOrder.id);
      await updateDoc(orderRef, {
        status: 'returned',
        finalPayment: finalPayment,
        returnedAt: new Date(),
        totalAmount: totalAmount,
        advancePayment: advancePayment
      });

      await logOrderActivity(originalOrder.id, 'RETURNED', 'Marked as returned', { finalPayment });

      setStatus('returned');
      showToast("Order marked as Returned!", "success");

      // Refresh logs
      const logsQ = query(collection(db, "orders", originalOrder.id, "activity_logs"), orderBy("timestamp", "desc"));
      const logsSnap = await getDocs(logsQ);
      setActivityLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error returning order:", error);
      showToast("Failed to mark as returned.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Helper
  const getStatusColor = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'completed': case 'returned': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading order...</div>;
  if (!originalOrder) return null;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 text-gray-800">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/orders" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <FiArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                Edit Order #{originalOrder.id.slice(-6).toUpperCase()}
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${getStatusColor(status)}`}>{status}</span>
              </h1>
              <p className="text-sm text-gray-500">Created on {originalOrder.createdAt?.toDate ? originalOrder.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <div>
            <button
              onClick={() => {
                const msg = generateInvoiceMessage({ ...originalOrder, customerName, totalAmount, advancePayment, finalPayment, outfitItems: outfitRows.map(r => r.outfitData ? ({ ...r.outfitData, designName: r.outfitData.name }) : null) });
                const link = getWhatsAppDeepLink(customerMobile, msg);
                window.open(link, '_blank');
              }}
              className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-green-600 transition-all"
            >
              <FiShare2 /> WhatsApp
            </button>
            <button
              onClick={() => setIsActivityModalOpen(true)}
              className="ml-3 p-2 bg-white text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg shadow-sm transition-all"
              title="View Activity Log"
            >
              <FiActivity className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Activity Logs Modal */}
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <FiActivity className="text-indigo-500" /> Activity History
                </h3>
                <button
                  onClick={() => setIsActivityModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {activityLogs.length > 0 ? (
                  <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="relative pl-6">
                        {/* Dot */}
                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${log.action === 'CREATED' ? 'bg-green-500' :
                            log.action === 'CANCELLED' ? 'bg-red-500' :
                              log.action === 'RETURNED' ? 'bg-purple-500' :
                                'bg-indigo-500'
                          }`}></div>

                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-bold text-gray-800 leading-tight">{log.description}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm">{log.action}</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date().toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    <FiActivity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>No activity recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Activity Logs Timeline REMOVED */}

        <div className="grid grid-cols-1 gap-6">

          {/* --- Unified Row: Customer & Dates --- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Column 1: Customer Details */}
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
                    <span className="absolute left-9 top-2 text-sm font-bold text-gray-500">+91</span>
                    <input
                      type="text"
                      value={customerMobile}
                      onChange={handleMobileChange}
                      className={`w-full pl-16 pr-3 py-2 border rounded-lg focus:ring-2 max-h-10 text-sm font-bold text-gray-900 ${mobileError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                      placeholder="9876543210"
                      maxLength={10}
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

          {/* --- Row 3: Outfit Selection Table --- */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-1">
              <table className="w-full min-w-[600px] border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[35%]">Outfit</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[10%]">Rent (Base)</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[15%]">Size</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[15%]">Final Price</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[10%]">Notes</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {outfitRows.map((row) => (
                    <>
                      {/* Main Row */}
                      <tr key={row.id} className="hover:bg-gray-50 transition-all group border-b border-gray-100">
                        {/* Outfit Search */}
                        <td className="px-4 py-3 align-top relative">
                          <div className="relative">
                            <FiSearch className="absolute left-2.5 top-2.5 text-gray-400 w-4 h-4" />
                            <input
                              type="text"
                              value={row.searchQuery}
                              onChange={(e) => handleRowSearchChange(row.id, e.target.value)}
                              onFocus={() => updateRow(row.id, { isSearchOpen: true })}
                              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              placeholder="Search Outfit..."
                            />
                            {/* Suggestions Dropdown */}
                            {row.isSearchOpen && searchResultsMap[row.id] && searchResultsMap[row.id].length > 0 && (
                              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto w-full">
                                {searchResultsMap[row.id].map(res => (
                                  <div
                                    key={res.id}
                                    onClick={() => selectOutfitForRow(row.id, res)}
                                    className="px-4 py-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
                                  >
                                    {res.imageUrl && <img src={res.imageUrl} className="w-8 h-8 rounded object-cover" />}
                                    <div>
                                      <p className="text-sm font-bold text-gray-800">{res.name}</p>
                                      <p className="text-[10px] text-gray-500">{res.code}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {row.outfitData && (
                            <div className="mt-2 flex gap-2">
                              {row.outfitData.imageUrl && <img src={row.outfitData.imageUrl} className="w-12 h-12 rounded-lg border border-gray-200 object-cover" />}
                              <div>
                                <div className="text-sm font-bold text-gray-800 leading-tight">{row.outfitData.name}</div>
                                <div className="text-[10px] text-gray-500">{row.outfitData.code || row.outfitData.designCode}</div>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Base Rent */}
                        <td className="px-4 py-3 align-top pt-4">
                          <span className="text-sm font-medium text-gray-500">
                            {row.outfitData ? formatINR(row.basePrice) : '-'}
                          </span>
                        </td>

                        {/* Size Select */}
                        <td className="px-4 py-3 align-top pt-2">
                          <select
                            value={row.size}
                            onChange={(e) => handleSizeSelect(row.id, e.target.value)}
                            disabled={!row.outfitData}
                            className={`w-full border rounded-lg py-2 px-2 text-sm ${!row.size ? 'font-medium text-gray-500' : 'font-bold text-gray-800'} ${row.availability?.isAvailable === false ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200'}`}
                          >
                            <option value="">Select Size</option>
                            {row.outfitData?.sizes?.map((s: string) => {
                              return <option key={s} value={s}>{s}</option>;
                            })}
                          </select>
                          {row.size && row.availability && (
                            <div className="mt-1">
                              {row.availability.isAvailable ? (
                                <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                                  <FiCheckCircle /> Available
                                </span>
                              ) : (
                                <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                                  <FiAlertCircle /> Booked
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Agreed Price */}
                        <td className="px-4 py-3 align-top pt-2">
                          <div>
                            <input
                              type="text"
                              value={row.agreedPrice ? row.agreedPrice.toLocaleString('en-IN') : ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/,/g, '');
                                const val = parseFloat(raw);
                                updateRow(row.id, { agreedPrice: isNaN(val) ? 0 : val });
                              }}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500"
                              placeholder="0"
                            />
                          </div>
                        </td>

                        {/* Accordion Toggle - Notes */}
                        <td className="px-4 py-3 align-middle text-center">
                          <button
                            onClick={() => toggleRowExpansion(row.id)}
                            className={`flex items-center justify-center gap-2 w-full py-1.5 rounded transition-colors ${row.notes ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-gray-400 hover:bg-gray-100'}`}
                          >
                            {row.notes && <FiFileText className="w-4 h-4" />}
                            <span className="text-xs">{row.notes ? 'Edit' : 'Add Note'}</span>
                            {row.isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                          </button>
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 align-middle text-center">
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-red-50"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Note Row */}
                      {row.isExpanded && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={6} className="px-4 py-3 border-b border-gray-100">
                            <div className="flex gap-4">
                              <div className="w-12 flex-shrink-0 flex justify-center pt-2">
                                <FiFileText className="text-gray-300 w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                                  Notes for {row.outfitData?.name || 'Outfit'}
                                </label>
                                <textarea
                                  value={row.notes || ''}
                                  onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                  placeholder="Add specific instructions, alterations, or comments here..."
                                  rows={2}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              <div className="p-3 border-t border-gray-200 flex justify-center">
                <button onClick={addRow} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wide">
                  <FiPlus /> Add Outfit Row
                </button>
              </div>
            </div>

            {/* Payment & Action Section */}
            <div className="bg-gray-50 border-t border-gray-200 p-6">
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

                  {/* Settlement / Final Payment */}
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-700">Payment Collected</label>
                    <div className="w-32">
                      <input
                        type="number"
                        value={finalPayment || ''}
                        onChange={(e) => setFinalPayment(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 border border-green-300 bg-green-50 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-right text-green-900"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-sm font-bold text-gray-800">Balance Due</span>
                    <span className={`text-xl font-bold ${balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatINR(balanceAmount)}</span>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleUpdate}
                      disabled={saving}
                      className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <FiSave /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>

                    {status !== 'returned' && searchParams.get('source') === 'returns' && (
                      <button
                        onClick={handleReturnOrder}
                        disabled={saving}
                        className="flex-1 px-4 py-3 bg-gray-900 text-white font-bold rounded-lg shadow hover:bg-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        title="Mark as Returned & Capture Payment"
                      >
                        <FiCheckSquare /> Return
                      </button>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
