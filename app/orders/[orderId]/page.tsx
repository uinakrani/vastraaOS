"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, limit, where, documentId } from "firebase/firestore";
import debounce from "lodash.debounce";
import { db } from "../../../firebaseConfig";
import { addDays, differenceInDays, startOfDay, isAfter, isSameDay } from "date-fns";
import { formatINR } from "../../../utils/format";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiArrowLeft, FiSearch, FiCalendar, FiUser, FiPhone, FiMapPin, FiClock, FiPlus, FiTrash2, FiCheckCircle, FiAlertCircle, FiShare2, FiSave, FiCheckSquare, FiX, FiFileText, FiChevronDown, FiChevronUp, FiActivity, FiChevronRight } from "react-icons/fi";
import { generateInvoiceMessage, getWhatsAppDeepLink } from "../../../utils/whatsapp";
import { checkOutfitAvailability, DEFAULT_BUFFER_DAYS, AvailabilityResponse } from "../../../lib/availabilityService";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface OutfitRow {
  id: number;
  outfitData: Outfit | null;
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
  const { user, currentStudio } = UserAuth();
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
  const [editingRowId, setEditingRowId] = useState<number | null>(null);

  // --- General State ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Activity Logs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  // Original Order Data (for reference & status)
  const [originalOrder, setOriginalOrder] = useState<OrderData | null>(null);
  const [status, setStatus] = useState("");

  // Payments
  const [advancePayment, setAdvancePayment] = useState<number>(0);
  const [finalPayment, setFinalPayment] = useState<number>(0);

  // Availability Context
  const [allOrders, setAllOrders] = useState<OrderData[]>([]);
  const [searchResultsMap, setSearchResultsMap] = useState<{ [key: number]: Outfit[] }>({});

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

        const data = docSnap.data();
        // Security Check: Ensure client belongs to the correct studio
        if (currentStudio?.studioId && data.studioId !== currentStudio.studioId) {
          showToast("Access Denied: This order belongs to another studio.", "error");
          router.push("/orders");
          return;
        }

        const orderData = { id: docSnap.id, ...data } as OrderData;
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
        const fetchedOrders = snapOrders.docs.map(d => ({ id: d.id, ...d.data() } as OrderData));
        const otherOrders = fetchedOrders.filter(o => o.id !== orderId);
        setAllOrders(otherOrders);

        // 3. Reconstruct Outfit Rows
        if (orderData.outfitItems && orderData.outfitItems.length > 0) {
          const outfitIds = orderData.outfitItems.map((item: any) => item.id).filter(Boolean); // eslint-disable-line @typescript-eslint/no-explicit-any

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fullOutfitsMap: { [key: string]: any } = {};

          if (outfitIds.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunks: any[] = [];
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

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const runAvailabilityCheck = useCallback((outfit: Outfit, size: string, pDate: Date, rDate: Date, pSlot: string, rSlot: string): AvailabilityResponse | null => {
    if (!size || size === "") return null;
    const qty = (outfit.sizeQuantities && outfit.sizeQuantities[size]) ? outfit.sizeQuantities[size] : 1;

    const res = checkOutfitAvailability(allOrders, {
      outfitId: outfit.id,
      outfitSize: size,
      startDate: pDate,
      endDate: rDate,
      pickupSlot: pSlot as 'Morning' | 'Afternoon',
      returnSlot: rSlot as 'Morning' | 'Afternoon',
      totalStock: qty,
      bufferDays: DEFAULT_BUFFER_DAYS
    });
    return res;
  }, [allOrders]);

  const checkAllRowsAvailability = useCallback(() => {
    if (outfitRows.length > 0 && pickupDate && returnDate) {
      setOutfitRows(prev => prev.map(row => {
        if (row.outfitData && row.size) {
          // Only run if dates are valid
          const avail = runAvailabilityCheck(row.outfitData, row.size, pickupDate, returnDate, pickupSlot, returnSlot);
          return { ...row, availability: avail };
        }
        return row;
      }));
    }
  }, [pickupDate, returnDate, pickupSlot, returnSlot, runAvailabilityCheck]);

  useEffect(() => {
    if (pickupDate && returnDate) {
      if (isAfter(pickupDate, returnDate)) {
        setDateError("Pickup date cannot be after Return date");
      } else {
        setDateError("");
        setRentalDays(calculateRentalDays(pickupDate, returnDate));
        // We trigger checkAllRowsAvailability via dependency on dates but to avoid loop we use the effect directly
        if (outfitRows.length > 0) {
          setOutfitRows(prev => prev.map(row => {
            if (row.outfitData && row.size) {
              const avail = runAvailabilityCheck(row.outfitData, row.size, pickupDate, returnDate, pickupSlot, returnSlot);
              return { ...row, availability: avail };
            }
            return row;
          }));
        }
      }
    }
  }, [pickupDate, returnDate, pickupSlot, returnSlot]); // Removed checkAllRowsAvailability to break cycle


  // --- Logic: Outfit Search & Updates (Modernized) ---
  const searchOutfits = async (queryText: string): Promise<Outfit[]> => {
    if (!queryText.trim() || !currentStudio?.studioId) return [];
    const normalizedQuery = queryText.trim().toLowerCase();
    const q = query(
      collection(db, "outfits"),
      where("studioId", "==", currentStudio.studioId),
      where("searchName", ">=", normalizedQuery),
      where("searchName", "<=", normalizedQuery + "\uf8ff"),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Outfit));
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
          id: r.outfitData!.id,
          name: r.outfitData!.name,
          designCode: r.outfitData!.code || "N/A",
          size: r.size,
          price: r.basePrice || 0,
          rentalPrice: r.agreedPrice || 0,
          imageUrl: r.outfitData!.imageUrl || "",
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

    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error("Error updating order:", error);
      showToast(error.message || "Failed to update order.", "error");
    } finally {
      setSaving(false);
    }
  };

  // 2. MARK AS RETURNED
  const handleReturnOrder = async () => {
    if (!originalOrder) return;
    if (!confirm(`Mark order as RETURNED and record total payment collected?`)) return;

    setSaving(true);
    try {
      const orderRef = doc(db, "orders", originalOrder.id);
      await updateDoc(orderRef, {
        status: 'returned',
        finalPayment: finalPayment, // Saves the input from the UI
        returnedAt: new Date(),
        totalAmount: totalAmount,
        advancePayment: advancePayment
      });

      await logOrderActivity(originalOrder.id, 'RETURNED', 'Marked as returned', { finalPayment });

      setStatus('returned');
      showToast("Order marked as Returned!", "success");

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

  const getStatusColor = (s: string) => {
    switch (s?.toLowerCase()) {
      case 'completed': case 'returned': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  if (!originalOrder) return <div className="p-8">Order not found.</div>;

  return (
    <>
      <div className="min-h-full bg-gray-50 pb-32">

        {/* Top Header */}
        <div className="bg-white/80 backdrop-blur-md px-4 py-4 border-b border-gray-100 flex flex-col gap-4 sticky top-0 z-40 transition-all shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Link href="/orders" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                <FiArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Order #{(orderId as string)?.slice(-4).toUpperCase()}
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${getStatusColor(status)}`}>{status}</span>
                </h1>
                <p className="text-xs text-gray-400">Created: {originalOrder.createdAt?.toDate ? originalOrder.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsActivityModalOpen(true)}
                className="p-2 bg-gray-50 text-gray-600 rounded-full hover:bg-gray-100"
              >
                <FiActivity className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const msg = generateInvoiceMessage({ ...originalOrder, customerName, totalAmount, advancePayment, finalPayment, outfitItems: outfitRows.map(r => r.outfitData ? ({ ...r.outfitData, designName: r.outfitData.name }) : null) } as any);
                  const link = getWhatsAppDeepLink(customerMobile, msg);
                  window.open(link, '_blank');
                }}
                className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
              >
                <FiShare2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Activity Modal */}
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden animate-ios-popup border border-gray-200">
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <FiActivity className="text-indigo-500" /> History
                </h3>
                <button onClick={() => setIsActivityModalOpen(false)} className="p-2 text-gray-400 hover:text-red-500 rounded-full">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {activityLogs.length > 0 ? (
                  <div className="space-y-4">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="flex gap-3">
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.action === 'CREATED' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{log.description}</p>
                          <p className="text-xs text-gray-400">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-center">No logs found.</p>}
              </div>
            </div>
          </div>
        )}

        <div className="w-full px-5 md:px-8 lg:px-12 py-6 space-y-6">

          {/* Customer Details */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 space-y-4">
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
                placeholder="Mobile Number"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl font-medium text-lg text-gray-900 placeholder:text-gray-400 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
              />
              {mobileError && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 text-xs font-bold">{mobileError}</span>}
            </div>

            {/* Name */}
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer Name"
                className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl font-medium text-lg text-gray-900 placeholder:text-gray-400 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none"
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
                className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl font-medium text-base text-gray-900 placeholder:text-gray-400 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all outline-none resize-none"
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
                    className="w-full py-4 px-4 bg-gray-50 rounded-2xl font-medium text-gray-900 text-center cursor-pointer border-2 border-transparent focus:border-indigo-500 outline-none"
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
                    className="w-full py-4 px-4 bg-gray-50 rounded-2xl font-medium text-gray-900 text-center cursor-pointer border-2 border-transparent focus:border-indigo-500 outline-none"
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

            <div className="space-y-3">
              {outfitRows.map((row) => (
                <div
                  key={row.id}
                  onClick={() => setEditingRowId(row.id)}
                  className="bg-white p-4 rounded-2xl border border-gray-200 flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer hover:bg-gray-50"
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
                        {row.notes && (
                          <p className="text-xs text-gray-400 mt-1 truncate">
                            <FiFileText className="inline mr-1" /> {row.notes}
                          </p>
                        )}
                        {row.availability?.isAvailable === false && (
                          <p className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1">
                            <FiAlertCircle /> Unavailable
                          </p>
                        )}
                      </>
                    ) : ( // Fallback
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
                  className="w-full pl-6 pr-3 py-2 bg-gray-50 rounded-lg font-bold text-right outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 border border-gray-100"
                />
              </div>
            </div>

            {/* Settlement */}
            <div className={`flex justify-between items-center p-3 rounded-lg ${status === 'returned' ? 'bg-green-50' : 'bg-gray-50'}`}>
              <span className="font-bold text-gray-700">Settlement (Final)</span>
              <div className="w-32 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  value={finalPayment || ''}
                  onChange={(e) => setFinalPayment(parseFloat(e.target.value) || 0)}
                  className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg font-bold text-right outline-none focus:ring-2 focus:ring-green-500 text-green-700"
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

        {/* Sticky Footer Actions */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 pb-safe z-30 lg:pl-72 transition-all flex gap-3">
          <button
            onClick={handleUpdate}
            disabled={saving}
            className="flex-1 py-4 rounded-xl bg-[#0F172A] text-white font-bold text-lg active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FiSave /> {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {status !== 'returned' && searchParams.get('source') === 'returns' && (
            <button
              onClick={handleReturnOrder}
              disabled={saving}
              className="flex-1 py-4 rounded-xl bg-green-600 text-white font-bold text-lg active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              <FiCheckSquare /> Return
            </button>
          )}
        </div>


        {/* --- Update Modal (Same as Add Page) --- */}
        {editingRowId !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
              onClick={handleCloseModal}
            />
            <div
              className="relative z-10 bg-white w-full max-w-lg max-h-[85vh] rounded-3xl overflow-hidden animate-ios-popup border border-gray-200"
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
                          className="w-full pl-12 pr-4 py-4 bg-gray-100 rounded-2xl font-bold text-lg text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
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
                          className="w-full pl-10 pr-4 py-4 bg-white border border-gray-200 rounded-xl font-bold text-2xl text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2 ml-1 font-bold">Base Price: {formatINR(outfitRows.find(r => r.id === editingRowId)?.basePrice || 0)}</p>
                    </div>

                    {/* Notes Input */}
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-2">Notes</h4>
                      <textarea
                        value={outfitRows.find(r => r.id === editingRowId)?.notes || ''}
                        onChange={(e) => updateRow(editingRowId, { notes: e.target.value })}
                        className="w-full p-4 bg-white border border-gray-200 rounded-xl font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Add notes about alterations or damage..."
                        rows={3}
                      />
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
