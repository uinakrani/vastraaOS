"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
// import { Calendar, dateFnsLocalizer } from "react-big-calendar";
// import { format, parse, startOfWeek, getDay } from "date-fns";
// import { enUS } from "date-fns/locale/en-US";
import { db } from "../../../firebaseConfig";
import DashboardLayout from "../../../components/DashboardLayout";
import AvailabilityCalendar from "../../../components/AvailabilityCalendar";
import { formatINR } from "../../../utils/format";
import { useToast } from "../../../components/ToastProvider";

import { FiX, FiArchive, FiTrash2, FiAlertCircle } from "react-icons/fi";
import { BOOKING_STATUSES, DEFAULT_BUFFER_DAYS } from "../../../lib/availabilityService";
import { addDays } from "date-fns";

const availableSizes = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];

// const locales = {
//   'en-US': enUS,
// };

// const localizer = dateFnsLocalizer({
//   format,
//   parse,
//   startOfWeek,
//   getDay,
//   locales,
// });

interface Outfit {
  id: string;
  name: string;
  code: string;
  price: number;
  imageUrl?: string;
  sizes: string[];
  sizeQuantities?: { [key: string]: number };
  createdAt: any; // Firebase Timestamp
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
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [outfitName, setOutfitName] = useState("");
  const [outfitCode, setOutfitCode] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: number }>({});
  const [customSizeInput, setCustomSizeInput] = useState("");

  const [password, setPassword] = useState("");
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState("Available");

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

          // Fetch orders that include this outfit
          // We fetch all orders and filter client-side because querying array of objects for partial match is limited in Firestore
          // without a specific structure.
          const ordersRef = collection(db, "orders");
          const querySnapshot = await getDocs(ordersRef);
          const bookedEvents: CalendarEvent[] = [];

          querySnapshot.forEach((orderDoc) => {
            const orderData = orderDoc.data();

            // Skip cancelled orders using shared logic
            const status = (orderData.status || '').toLowerCase();
            if (BOOKING_STATUSES.CANCELLED.includes(status)) return;

            // Check if this outfit is in the order
            if (orderData.outfitItems && Array.isArray(orderData.outfitItems)) {
              const hasOutfit = orderData.outfitItems.some((item: any) =>
                item.id === outfitData.id || item.designCode === outfitData.code
              );

              if (hasOutfit) {
                // Extract the specific items for this outfit to get their sizes
                const outfitItems = orderData.outfitItems.filter((item: any) =>
                  item.id === outfitData.id || item.designCode === outfitData.code
                );
                const bookedSizes = outfitItems.map((item: any) => item.size).filter((s: any) => s);

                // Handle new range-based orders
                if (orderData.startDate && orderData.endDate) {
                  // Ensure they are Firestore Timestamps or Dates
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
                // Fallback for legacy orders (single delivery date)
                else if (orderData.deliveryDate) {
                  const deliveryDate = orderData.deliveryDate.toDate ? orderData.deliveryDate.toDate() : new Date(orderData.deliveryDate);
                  bookedEvents.push({
                    title: `Booked by ${orderData.customerName}`,
                    start: deliveryDate,
                    end: addDays(deliveryDate, DEFAULT_BUFFER_DAYS),
                    allDay: true,
                    status: 'booked',
                    bookedSizes: bookedSizes,
                    pickupSlot: 'Morning',
                    returnSlot: 'Afternoon'
                  });
                }
              }
            }
          });
          setEvents(bookedEvents);
        } else {
          console.log("No such outfit!");
        }
      } catch (error) {
        console.error("Error fetching outfit or bookings: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOutfitAndBookings();
  }, [outfitId]);

  const handleUpdateOutfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outfitId) return;

    try {
      const outfitRef = doc(db, "outfits", outfitId as string);
      await updateDoc(outfitRef, {
        name: outfitName,
        code: outfitCode,
        price: parseFloat(rentalPrice),
        imageUrl: imageUrl,
        sizes: selectedSizes,
        sizeQuantities: sizeQuantities,
        status: status
      });
      showToast("Outfit updated successfully!", "success");
      router.push("/outfits"); // Redirect back to outfits list
    } catch (error) {
      console.error("Error updating outfit: ", error);
      showToast("Error updating outfit.", "error");
    }
  };

  const handleArchiveOutfit = async () => {
    // 1. Check for future bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureBookings = events.filter(event => event.end >= today);

    if (futureBookings.length > 0) {
      showToast(`Cannot archive: This outfit has ${futureBookings.length} pending or future booking(s).`, "error");
      return;
    }

    if (!confirm("Are you sure you want to archive this outfit? It will be hidden from the main list.")) {
      return;
    }

    try {
      const outfitRef = doc(db, "outfits", outfitId as string);
      await updateDoc(outfitRef, { status: "Archived" });
      setStatus("Archived");
      await updateDoc(outfitRef, { status: "Archived" });
      setStatus("Archived");
      showToast("Outfit archived successfully.", "success");
      router.push("/outfits");
    } catch (e) {
      console.error("Error archiving:", e);
      showToast("Failed to archive outfit.", "error");
    }
  };

  const handleSizeChange = (size: string) => {
    setSelectedSizes((prevSizes) => {
      const isSelected = prevSizes.includes(size);
      if (isSelected) {
        // Removing size
        const newSizes = prevSizes.filter((s) => s !== size);
        const newQuantities = { ...sizeQuantities };
        delete newQuantities[size];
        setSizeQuantities(newQuantities);
        return newSizes;
      } else {
        // Adding size
        setSizeQuantities(prev => ({ ...prev, [size]: 1 }));
        return [...prevSizes, size];
      }
    });
  };

  const handleQuantityChange = (size: string, delta: number) => {
    setSizeQuantities(prev => {
      const currentQty = prev[size] || 1;
      const newQty = Math.max(1, currentQty + delta);
      return { ...prev, [size]: newQty };
    });
  };

  const handleAddCustomSize = () => {
    if (customSizeInput.trim()) {
      const newSize = customSizeInput.trim().toUpperCase();
      if (!selectedSizes.includes(newSize)) {
        setSelectedSizes([...selectedSizes, newSize]);
        setSizeQuantities(prev => ({ ...prev, [newSize]: 1 }));
      }
      setCustomSizeInput("");
    }
  };

  const handleAdjustRentClick = () => {
    setShowPasswordPrompt(true);
    setIsPasswordCorrect(false); // Reset password state
    setPassword("");
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123") { // Placeholder password
      setIsPasswordCorrect(true);
      setShowPasswordPrompt(false);
    } else {
      showToast("Incorrect password", "error");
      setPassword("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading outfit details...</p>
      </div>
    );
  }

  if (!outfit) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Outfit not found.</p>
        <Link href="/outfits" className="mt-4 text-blue-500 hover:underline">
          Back to Outfits
        </Link>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl p-4">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">{outfit.name}</h1>

            <div className="mb-8">
              <AvailabilityCalendar events={events} totalSizes={selectedSizes} sizeQuantities={sizeQuantities} />
            </div>

            <form onSubmit={handleUpdateOutfit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="outfitName" className="form-label">Outfit Name</label>
                  <input
                    type="text"
                    id="outfitName"
                    value={outfitName}
                    onChange={(e) => setOutfitName(e.target.value.toUpperCase())}
                    className="form-input"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="outfitCode" className="form-label">Outfit Code</label>
                  <input
                    type="text"
                    id="outfitCode"
                    value={outfitCode}
                    onChange={(e) => setOutfitCode(e.target.value.toUpperCase())}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="imageUrl" className="form-label">Image URL</label>
                <input
                  type="url"
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Available Sizes</label>
                <div className="mt-1 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2 mb-3">
                  {availableSizes.map((size) => {
                    const isSelected = selectedSizes.includes(size);
                    return (
                      <div
                        key={size}
                        onClick={() => handleSizeChange(size)}
                        className={`relative flex flex-col items-center p-2 rounded-xl border transition-all duration-200 cursor-pointer ${isSelected
                          ? "border-indigo-600 bg-indigo-50 shadow-sm"
                          : "border-gray-200 bg-white hover:bg-white hover:border-gray-300"
                          }`}
                      >
                        <button
                          type="button"
                          className={`w-full text-center text-sm font-bold mb-2 pointer-events-none ${isSelected ? "text-indigo-700" : "text-gray-600"}`}
                        >
                          {size}
                        </button>

                        {isSelected && (
                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, -1); }}
                              className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="text-sm font-semibold text-gray-800 w-6 text-center">
                              {sizeQuantities[size] || 1}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, 1); }}
                              className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        )}
                        {!isSelected && (
                          <div className="h-6 w-full"></div> // Spacer
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Custom Sizes Display */}
                {selectedSizes.some(s => !availableSizes.includes(s)) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedSizes.filter(s => !availableSizes.includes(s)).map((size) => (
                      <div key={size} className="rounded-xl border border-indigo-600 bg-indigo-600 text-white shadow-md p-2 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{size}</span>
                          <button type="button" onClick={() => handleSizeChange(size)} className="hover:text-red-200"><FiX className="w-3 h-3" /></button>
                        </div>
                        <div className="flex items-center space-x-1 bg-indigo-700 rounded-lg px-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, -1); }}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-white hover:bg-indigo-500 text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="text-sm font-semibold text-white w-5 text-center">
                            {sizeQuantities[size] || 1}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, 1); }}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-white hover:bg-indigo-500 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Custom Size Input */}
                <div className="flex items-center gap-2 max-w-xs">
                  <input
                    type="text"
                    value={customSizeInput}
                    onChange={(e) => setCustomSizeInput(e.target.value)}
                    placeholder="Add Custom Size"
                    className="form-input py-2 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSize();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSize}
                    disabled={!customSizeInput.trim()}
                    className="bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </div>

              <h3 className="mt-6 mb-3 text-xl font-semibold text-gray-700">Rental Price</h3>
              {!isPasswordCorrect && showPasswordPrompt ? (
                <div className="space-y-3">
                  <p className="text-gray-600">Enter password to adjust rental price:</p>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                    required
                  />
                  <button
                    onClick={handlePasswordSubmit}
                    type="button"
                    className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Unlock Price Adjustment
                  </button>
                </div>
              ) : !isPasswordCorrect && !showPasswordPrompt ? (
                <button
                  type="button"
                  onClick={handleAdjustRentClick}
                  className="rounded-md bg-yellow-500 px-4 py-2 text-white shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                >
                  Adjust Rent (Password Protected)
                </button>
              ) : (
                <div>
                  <label htmlFor="rentalPrice" className="form-label">Rental Price (INR)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-gray-400 font-medium">₹</span>
                    <input
                      type="number"
                      id="rentalPrice"
                      value={rentalPrice}
                      onChange={(e) => setRentalPrice(e.target.value)}
                      className="form-input pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-green-600 py-3 text-lg font-semibold text-white shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Update Outfit
              </button>
            </form>
          </div>

          {/* Archive/Delete Section */}
          <div className="bg-red-50 p-6 rounded-xl border border-red-100 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                  <FiAlertCircle className="w-5 h-5" />
                  Danger Zone
                </h3>
                <p className="text-sm text-red-600 mt-1 max-w-xl">
                  Archiving this outfit will hide it from the main list. You can only archive outfits that have no future active bookings.
                </p>
              </div>
              {status !== 'Archived' ? (
                <button
                  type="button"
                  onClick={handleArchiveOutfit}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 font-semibold rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
                >
                  <FiArchive className="w-4 h-4" />
                  Archive Outfit
                </button>
              ) : (
                <span className="px-4 py-2 bg-gray-200 text-gray-600 font-bold rounded-lg border border-gray-300">
                  This Outfit is Archived
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
