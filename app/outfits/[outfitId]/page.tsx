"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import AvailabilityCalendar from "../../../components/AvailabilityCalendar";
import { formatINR } from "../../../utils/format";
import { useToast } from "../../../components/ToastProvider";

import {
  FiX, FiArchive, FiTrash2, FiAlertCircle, FiChevronLeft,
  FiCamera, FiEdit3, FiPackage, FiCalendar, FiDollarSign,
  FiShare2, FiShoppingCart, FiPlus, FiMinus, FiCheck, FiArrowRight, FiArrowLeft
} from "react-icons/fi";
import { UserAuth } from "../../../context/AuthContext";
import { BOOKING_STATUSES, DEFAULT_BUFFER_DAYS } from "../../../lib/availabilityService";
import { addDays, isAfter, startOfToday } from "date-fns";

const availableSizes = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];

interface Outfit {
  id: string;
  name: string;
  code: string;
  price: number;
  imageUrl?: string;
  sizes: string[];
  sizeQuantities?: { [key: string]: number };
  createdAt: any;
  status?: string;
}

interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  status?: 'booked' | 'maintenance' | 'pending';
  bookedSizes?: string[];
  pickupSlot?: string;
  returnSlot?: string;
}

export default function EditOutfitPage() {
  const { outfitId } = useParams();
  const router = useRouter();
  const [customSizeInput, setCustomSizeInput] = useState("");

  const handleAddCustomSize = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (customSizeInput.trim()) {
      const newSize = customSizeInput.trim().toUpperCase();
      if (!selectedSizes.includes(newSize)) {
        setSelectedSizes(prev => [...prev, newSize]);
        setSizeQuantities(prev => ({ ...prev, [newSize]: 1 }));
        setCustomSizeInput("");
        showToast(`Added size ${newSize}`, "success");
      } else {
        showToast("Size already added", "error");
      }
    }
  };

  const { currentStudio } = UserAuth();
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Form State
  const [outfitName, setOutfitName] = useState("");
  const [outfitCode, setOutfitCode] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: number }>({});

  const [password, setPassword] = useState("");
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState("Available");

  const [activeTab, setActiveTab] = useState<'info' | 'inventory' | 'availability'>('info');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchOutfitAndBookings = async () => {
      if (!outfitId) return;
      setLoading(true);
      try {
        const docRef = doc(db, "outfits", outfitId as string);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const outfitData = { id: docSnap.id, ...docSnap.data() } as Outfit;
          setOutfit(outfitData);
          setOutfitName(outfitData.name);
          setOutfitCode(outfitData.code);
          setRentalPrice(outfitData.price.toString());
          setImageUrl(outfitData.imageUrl || "");
          setSelectedSizes(outfitData.sizes || []);
          setSizeQuantities(outfitData.sizeQuantities || {});
          setStatus(outfitData.status || "Available");

          // Fetch all relevant orders for this studio that contain this outfit
          const ordersRef = collection(db, "orders");
          let q = query(
            ordersRef,
            where("studioId", "==", currentStudio?.studioId || "")
          );
          const querySnapshot = await getDocs(q);
          const bookedEvents: CalendarEvent[] = [];

          querySnapshot.forEach((orderDoc) => {
            const orderData = orderDoc.data();
            const status = (orderData.status || '').toLowerCase();
            if (BOOKING_STATUSES.CANCELLED.includes(status)) return;

            if (orderData.outfitItems && Array.isArray(orderData.outfitItems)) {
              const hasOutfit = orderData.outfitItems.some((item: any) =>
                item.id === outfitData.id || item.designCode === outfitData.code
              );

              if (hasOutfit) {
                const outfitItems = orderData.outfitItems.filter((item: any) =>
                  item.id === outfitData.id || item.designCode === outfitData.code
                );
                const bookedSizes = outfitItems.map((item: any) => item.size).filter((s: any) => s);

                if (orderData.startDate && orderData.endDate) {
                  const start = orderData.startDate.toDate ? orderData.startDate.toDate() : new Date(orderData.startDate);
                  const end = orderData.endDate.toDate ? orderData.endDate.toDate() : new Date(orderData.endDate);

                  bookedEvents.push({
                    title: `Booked by ${orderData.customerName}`,
                    start: start,
                    end: addDays(end, DEFAULT_BUFFER_DAYS),
                    allDay: true,
                    status: 'booked',
                    bookedSizes: bookedSizes,
                    pickupSlot: orderData.pickupSlot || 'Morning',
                    returnSlot: orderData.returnSlot || 'Afternoon'
                  });
                }
              }
            }
          });
          setEvents(bookedEvents);
        }
      } catch (error) {
        console.error("Error: ", error);
        showToast("Failed to load outfit", 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchOutfitAndBookings();
  }, [outfitId, showToast]);

  const handleUpdateOutfit = async () => {
    if (!outfitId) return;
    setIsUpdating(true);
    try {
      const outfitRef = doc(db, "outfits", outfitId as string);
      await updateDoc(outfitRef, {
        name: outfitName.trim(),
        searchName: outfitName.trim().toLowerCase(),
        code: outfitCode.trim().toUpperCase(),
        price: parseFloat(rentalPrice),
        imageUrl: imageUrl,
        sizes: selectedSizes,
        sizeQuantities: sizeQuantities,
        status: status,
        updatedAt: serverTimestamp()
      });
      showToast("Outfit updated successfully!", "success");
      router.push("/outfits");
    } catch (error) {
      console.error("Error: ", error);
      showToast("Error updating outfit.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShare = () => {
    const shareText = `Check out this outfit: ${outfitName} (${outfitCode})\nPrice: ${formatINR(parseFloat(rentalPrice))}\nAvailable Sizes: ${selectedSizes.join(', ')}`;
    if (navigator.share) {
      navigator.share({
        title: outfitName,
        text: shareText,
        url: window.location.href,
      }).catch(console.error);
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(shareText + "\n" + window.location.href);
      showToast("Link and details copied to clipboard!", "success");
    }
  };

  const handleCreateOrder = () => {
    // Redirect to orders/add with this outfit pre-selected
    // Using simple query param for now, the add order page will need to handle it
    router.push(`/orders/add?outfitId=${outfitId}&code=${outfitCode}`);
  };

  const handleArchiveOutfit = async () => {
    const today = startOfToday();
    const futureBookings = events.filter(event => isAfter(event.end, today));

    if (futureBookings.length > 0) {
      showToast(`Cannot archive: ${futureBookings.length} future booking(s) detected.`, "error");
      return;
    }

    if (!confirm("Are you sure you want to archive this outfit? It will be hidden from inventory searches.")) return;

    try {
      const outfitRef = doc(db, "outfits", outfitId as string);
      await updateDoc(outfitRef, { status: "Archived" });
      setStatus("Archived");
      showToast("Outfit archived", "success");
      router.push("/outfits");
    } catch (e) {
      showToast("Failed to archive outfit", "error");
    }
  };

  const handleSizeToggle = (size: string) => {
    setSelectedSizes((prev) => {
      const isSelected = prev.includes(size);
      if (isSelected) {
        const newSizes = prev.filter((s) => s !== size);
        const newQuantities = { ...sizeQuantities };
        delete newQuantities[size];
        setSizeQuantities(newQuantities);
        return newSizes;
      } else {
        setSizeQuantities(q => ({ ...q, [size]: 1 }));
        return [...prev, size];
      }
    });
  };

  const handleQuantityAdjust = (size: string, delta: number) => {
    setSizeQuantities(prev => {
      const current = prev[size] || 1;
      const newVal = Math.max(1, current + delta);
      return { ...prev, [size]: newVal };
    });
  };

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-extrabold text-indigo-600 tracking-tight">Immersive Experience Loading...</p>
      </div>
    </div>
  );

  if (!outfit) return (
    <div className="flex flex-col items-center justify-center h-[80vh] p-6 text-center">
      <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
        <FiAlertCircle className="w-10 h-10" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Outfit Not Found</h2>
      <p className="text-gray-500 font-bold mb-8 italic text-sm">Maybe it moved to the archive or doesn't exist.</p>
      <Link href="/outfits" className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-extrabold shadow-lg">Back to Inventory</Link>
    </div>
  );

  return (
    <div className="min-h-full bg-gray-50 pb-32">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-1 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
        >
          <FiArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Edit Outfit</h1>
        <div className="flex gap-1">
          <button onClick={handleShare} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
            <FiShare2 className="w-5 h-5" />
          </button>
          <button onClick={handleCreateOrder} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
            <FiShoppingCart className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="w-full px-5 md:px-8 lg:px-12 py-6 space-y-8 max-w-2xl mx-auto">

        {/* Image Preview - Matching Add Page */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40 rounded-3xl shadow-sm border-2 border-dashed border-gray-200 overflow-hidden flex flex-col items-center justify-center bg-white group hover:border-indigo-400 transition-all">
            {imageUrl ? (
              <>
                <img src={imageUrl} alt={outfitName} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <FiCamera className="text-white w-8 h-8" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center">
                <FiPackage className="w-8 h-8 text-gray-300 mb-1" />
                <span className="text-[10px] font-bold text-gray-400">NO IMAGE</span>
              </div>
            )}
          </div>
        </div>

        {/* Details Card - iOS Style Matching Add Page */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Name Input */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100">
            <label className="text-sm font-medium text-gray-500 w-24">Name</label>
            <input
              type="text"
              value={outfitName}
              onChange={(e) => setOutfitName(e.target.value.toUpperCase())}
              className="flex-1 text-right font-medium text-gray-900 border-none focus:ring-0 p-0"
              placeholder="NAME"
            />
          </div>

          {/* Code Input */}
          <div className="flex items-center px-4 py-3 border-b border-gray-100">
            <label className="text-sm font-medium text-gray-500 w-24">Code</label>
            <input
              type="text"
              value={outfitCode}
              onChange={(e) => setOutfitCode(e.target.value.toUpperCase())}
              className="flex-1 text-right font-medium text-indigo-600 border-none focus:ring-0 p-0"
              placeholder="CODE"
            />
          </div>

          {/* Price Input - Interactive */}
          <div className="flex items-center px-4 py-3 group cursor-pointer" onClick={() => { setShowPasswordPrompt(true); setPassword(""); }}>
            <label className="text-sm font-medium text-gray-500 w-24">Rent (₹)</label>
            <div className="flex-1 flex items-center justify-end gap-2">
              <span className="font-bold text-gray-900">{formatINR(parseFloat(rentalPrice))}</span>
              <FiEdit3 className="w-3 h-3 text-gray-300 group-hover:text-indigo-500 transition-colors" />
            </div>
          </div>
        </div>

        {/* Size Selector - Matching Add Page */}
        <div>
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="text-sm font-bold text-gray-900">Available Sizes</h3>
          </div>

          <div className="grid grid-cols-5 gap-3 mb-4">
            {availableSizes.map(size => {
              const active = selectedSizes.includes(size);
              return (
                <button
                  key={size}
                  onClick={() => handleSizeToggle(size)}
                  className={`h-12 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-200
                    ${active ? 'bg-gray-900 text-white shadow-md transform scale-105' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                >
                  {size}
                </button>
              )
            })}
          </div>

          {/* Custom Size Input - Added back for consistency */}
          <form onSubmit={handleAddCustomSize} className="flex gap-2 mb-6">
            <input
              type="text"
              value={customSizeInput}
              onChange={(e) => setCustomSizeInput(e.target.value.toUpperCase())}
              placeholder="Add custom size (e.g. XL)"
              className="flex-1 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!customSizeInput}
              className="bg-white border border-gray-100 text-gray-900 px-4 py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <FiPlus className="w-5 h-5" />
            </button>
          </form>

          {/* Stock Quantities - Matching Add Page */}
          {selectedSizes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Inventory Control</span>
              </div>
              <div className="divide-y divide-gray-100">
                {selectedSizes.map(size => (
                  <div key={size} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">
                        {size}
                      </div>
                      <span className="text-sm font-bold text-gray-700">Stock Count</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleQuantityAdjust(size, -1)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors"
                      >
                        <FiMinus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-4 text-center text-sm font-black text-gray-900">{sizeQuantities[size] || 1}</span>
                      <button
                        onClick={() => handleQuantityAdjust(size, 1)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors"
                      >
                        <FiPlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Booking Calendar - Keeping Premium Visuals but refined spacing */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-sm font-bold text-gray-900">Deployment Log</h3>
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">{events.length} ACTIVE BOOKINGS</span>
          </div>
          {/* Removed overflow-hidden to fix tooltip clipping */}
          <div className="bg-white rounded-2xl p-4 pt-8 shadow-sm border border-gray-100">
            <AvailabilityCalendar events={events} totalSizes={selectedSizes} sizeQuantities={sizeQuantities} />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="pt-8">
          <div className="bg-red-50/50 rounded-2xl p-8 border border-red-100 text-center">
            <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3">Zone Delta</h4>
            <p className="text-[11px] text-red-900/60 font-bold mb-8 italic">Archiving this asset will remove it from all active search indices.</p>

            {status !== 'Archived' ? (
              <button
                onClick={handleArchiveOutfit}
                className="w-full py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <FiArchive className="w-5 h-5" />
                Archive Asset
              </button>
            ) : (
              <div className="py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2">
                SYSTEM STATUS: ARCHIVED
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary Sticky Action Bar */}
      <div className="fixed bottom-safe left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100 z-30 lg:pl-72 transition-all">
        <button
          onClick={handleUpdateOutfit}
          disabled={isUpdating}
          className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 text-white font-black text-base active:scale-[0.98] transition-all shadow-xl shadow-indigo-500/20
                ${isUpdating ? 'bg-indigo-400 cursor-wait' : 'bg-[#0F172A]'}`}
        >
          {isUpdating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="tracking-widest uppercase text-[10px]">Syncing...</span>
            </>
          ) : (
            <>
              <FiCheck className="w-5 h-5 text-emerald-400" />
              <span className="tracking-widest uppercase text-xs">Deploy Changes</span>
            </>
          )}
        </button>
      </div>

      {/* Auth Modals */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-10 shadow-2xl animate-ios-popup border border-gray-100 text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <FiDollarSign className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-3 tracking-tight">Security Clearance</h3>
            <p className="text-gray-400 font-bold text-xs leading-relaxed mb-8 px-4">Modify commercial values requires authorized access.</p>

            <div className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white p-4 rounded-2xl font-black text-gray-900 outline-none transition-all text-center tracking-[1em] text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (password === "admin123") {
                      setIsPasswordCorrect(true);
                      setShowPasswordPrompt(false);
                    } else {
                      showToast("Denied", "error");
                      setPassword("");
                    }
                  }
                }}
              />
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowPasswordPrompt(false)} className="flex-1 py-4 font-black text-gray-400 uppercase tracking-widest text-[9px]">Abort</button>
                <button
                  onClick={() => {
                    if (password === "admin123") {
                      setIsPasswordCorrect(true);
                      setShowPasswordPrompt(false);
                    } else {
                      showToast("Denied", "error");
                      setPassword("");
                    }
                  }}
                  className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPasswordCorrect && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-10 shadow-2xl animate-ios-popup border border-gray-100 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 block">Set New Rent</p>
            <div className="relative mb-8">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-gray-200">₹</span>
              <input
                type="number"
                value={rentalPrice}
                onChange={(e) => setRentalPrice(e.target.value)}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white p-6 pl-14 rounded-2xl font-black text-4xl text-gray-900 outline-none transition-all tracking-tighter"
                autoFocus
              />
            </div>
            <button
              onClick={() => setIsPasswordCorrect(false)}
              className="w-full bg-[#0F172A] text-white font-black py-4 rounded-xl shadow-xl active:scale-95 transition-all tracking-widest uppercase text-[10px]"
            >
              Update Value
            </button>
          </div>
        </div>
      )}
    </div>
  );

}
