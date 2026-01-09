"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    collection,
    query,
    where,
    getDocs,
    limit,
    doc,
    getDoc
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
    FiSearch,
    FiArrowRight,
    FiLoader,
    FiBox,
    FiCalendar,
    FiCheckCircle,
    FiAlertCircle,
    FiX,
    FiChevronLeft,
    FiInfo
} from 'react-icons/fi';
import debounce from 'lodash.debounce';
import { UserAuth } from '../../context/AuthContext';
import {
    format,
    addDays,
    startOfDay,
    isAfter,
    isBefore,
    eachDayOfInterval,
    isSameDay,
    parseISO,
    isValid,
    startOfMonth
} from 'date-fns';
import { useToast } from "../../components/ToastProvider";
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// --- Interfaces ---
interface Outfit {
    id: string;
    name: string;
    code: string;
    imageUrl?: string;
    sizes: string[];
    sizeQuantities: { [key: string]: number };
}

interface CalendarEvent {
    start: Date;
    end: Date;
    title?: string;
    status?: 'booked' | 'maintenance' | 'pending';
    bookedSizes?: string[];
    pickupSlot?: string;
    returnSlot?: string;
}

const DEFAULT_BUFFER_DAYS = 2; // Should match system logic
const BOOKING_STATUSES = {
    CANCELLED: ['cancelled', 'returned_early_cancelled'],
};

export default function AvailabilityCheckPage() {
    const { currentStudio } = UserAuth();
    const { showToast } = useToast();
    const router = useRouter();

    // --- State: Search ---
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Outfit[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // --- State: Selection ---
    const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
    const [selectedSize, setSelectedSize] = useState<string | null>(null);
    const [pickupDate, setPickupDate] = useState<string>("");
    const [returnDate, setReturnDate] = useState<string>("");

    // --- State: Data ---
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    // --- Search Logic ---
    const performSearch = useCallback(
        debounce(async (term: string) => {
            if (!term.trim() || !currentStudio?.studioId) {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            try {
                const outfitsRef = collection(db, "outfits");
                const qTerm = term.toLowerCase();

                // Simple fallback approach: fetch all for studio and filter locally for best UX with small datasets
                const fallbackQ = query(
                    outfitsRef,
                    where("studioId", "==", currentStudio.studioId)
                );
                const snapshot = await getDocs(fallbackQ);
                const allOutfits = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Outfit))
                    .filter(o =>
                        o.code?.toLowerCase().includes(qTerm) ||
                        o.name?.toLowerCase().includes(qTerm)
                    )
                    .slice(0, 10);

                setSearchResults(allOutfits);
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setIsSearching(false);
            }
        }, 300),
        [currentStudio]
    );

    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        performSearch(e.target.value);
    };

    // --- Select Outfit Logic ---
    const selectOutfit = async (outfit: Outfit) => {
        setSelectedOutfit(outfit);
        setSearchQuery("");
        setSearchResults([]);
        setSelectedSize(null);

        // Fetch bookings for this outfit
        setIsLoadingEvents(true);
        try {
            const ordersRef = collection(db, "orders");
            const q = query(
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
                        item.id === outfit.id || item.designCode === outfit.code
                    );

                    if (hasOutfit) {
                        const outfitItems = orderData.outfitItems.filter((item: any) =>
                            item.id === outfit.id || item.designCode === outfit.code
                        );
                        const bookedSizes = outfitItems.map((item: any) => item.size).filter((s: any) => s);

                        if (orderData.startDate && orderData.endDate) {
                            const start = orderData.startDate.toDate ? orderData.startDate.toDate() : new Date(orderData.startDate);
                            const end = orderData.endDate.toDate ? orderData.endDate.toDate() : new Date(orderData.endDate);

                            bookedEvents.push({
                                title: `Order for ${orderData.customerName}`,
                                start: start,
                                end: addDays(end, DEFAULT_BUFFER_DAYS),
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
        } catch (err) {
            console.error("Fetch events error:", err);
            showToast("Failed to load booking calendar", "error");
        } finally {
            setIsLoadingEvents(false);
        }
    };

    // --- Availability Check Logic (Smart & Slot-Aware) ---
    const availabilityResult = useMemo(() => {
        if (!selectedOutfit || !pickupDate || !returnDate) return null;

        const start = parseISO(pickupDate);
        const end = parseISO(returnDate);

        if (!isValid(start) || !isValid(end)) return null;
        if (!isAfter(end, start) && !isSameDay(start, end)) {
            return { status: 'invalid', message: 'Return must be after pickup' };
        }

        const days = eachDayOfInterval({ start, end });
        const sizesToTrack = selectedSize ? [selectedSize] : (selectedOutfit.sizes || []);

        if (sizesToTrack.length === 0) return { status: 'error', message: 'No sizes defined' };

        let blockingIssue: { day: string, reason: string } | null = null;

        for (const day of days) {
            const dayKey = format(day, 'yyyy-MM-dd');
            const isPickupDay = isSameDay(day, start);
            const isReturnDay = isSameDay(day, end);

            // Per-size occupancy for this specific day
            const amOccupiedCounts = new Map<string, number>();
            const pmOccupiedCounts = new Map<string, number>();

            events.forEach(event => {
                const eventStartKey = format(event.start, 'yyyy-MM-dd');
                const eventEndKey = format(event.end, 'yyyy-MM-dd');

                if (dayKey >= eventStartKey && dayKey <= eventEndKey) {
                    let occupiesAM = true;
                    let occupiesPM = true;

                    // Support slot-level precision if available in the event
                    if (dayKey === eventStartKey && event.pickupSlot === 'Afternoon') occupiesAM = false;
                    if (dayKey === eventEndKey && event.returnSlot === 'Morning') occupiesPM = false;

                    const sizesBooked = event.bookedSizes?.length ? event.bookedSizes : (selectedOutfit.sizes || []);
                    sizesBooked.forEach(s => {
                        if (occupiesAM) amOccupiedCounts.set(s, (amOccupiedCounts.get(s) || 0) + 1);
                        if (occupiesPM) pmOccupiedCounts.set(s, (pmOccupiedCounts.get(s) || 0) + 1);
                    });
                }
            });

            // Diagnosis: Check if ANY of the tracked sizes have enough stock for the required slots
            let hasAtLeastOneSizeAvailable = false;

            for (const s of sizesToTrack) {
                const capacity = selectedOutfit.sizeQuantities?.[s] || 1;

                // Slots we need for THIS specific day of requested range:
                // If Pickup Day: only need PM (as rental starts after handover)
                // If Return Day: only need AM (as rental ends before handover)
                // If Same Day: need both AM and PM
                const needAM = !isPickupDay || isReturnDay;
                const needPM = !isReturnDay || isPickupDay;

                const amBooked = amOccupiedCounts.get(s) || 0;
                const pmBooked = pmOccupiedCounts.get(s) || 0;

                const amFree = !needAM || (amBooked < capacity);
                const pmFree = !needPM || (pmBooked < capacity);

                if (amFree && pmFree) {
                    hasAtLeastOneSizeAvailable = true;
                    break;
                }
            }

            if (!hasAtLeastOneSizeAvailable) {
                blockingIssue = {
                    day: format(day, 'MMM dd'),
                    reason: (isPickupDay && !isReturnDay) ? 'Afternoon slot occupied' : (isReturnDay && !isPickupDay) ? 'Morning slot occupied' : 'Fully booked'
                };
                break;
            }
        }

        if (!blockingIssue) {
            return {
                status: 'available',
                message: selectedSize ? `Size ${selectedSize} is 100% Available` : 'Available in stock'
            };
        } else {
            return {
                status: 'unavailable',
                message: `${blockingIssue.day}: ${blockingIssue.reason}`
            };
        }
    }, [selectedOutfit, selectedSize, pickupDate, returnDate, events]);

    const calendarStartDate = useMemo(() => {
        if (pickupDate && isValid(parseISO(pickupDate))) return startOfMonth(parseISO(pickupDate));
        return startOfMonth(new Date());
    }, [pickupDate]);

    return (
        <div className="w-full px-4 md:px-8 py-6 pb-32">
            {/* Compact Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="p-2.5 bg-white border border-gray-100 rounded-xl active:scale-90 transition-all shadow-sm"
                    >
                        <FiChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-[#0F172A] tracking-tight leading-none mb-0.5">Availability</h1>
                        <p className="text-[#94A3B8] text-[9px] font-bold uppercase tracking-widest">Diagnostic Tool</p>
                    </div>
                </div>
            </div>

            {/* Step 1: Outfit Selection */}
            <div className="space-y-6">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        {isSearching ? <FiLoader className="h-4 w-4 text-indigo-600 animate-spin" /> : <FiSearch className="h-4 w-4 text-gray-400 group-focus-within:text-indigo-600" />}
                    </div>
                    <input
                        type="text"
                        placeholder="Outfit Name or Code..."
                        value={searchQuery}
                        onChange={handleSearchInput}
                        className="form-input pl-11 py-3.5 text-sm md:text-base focus:ring-0 focus:border-indigo-200 transition-all bg-white rounded-2xl border-gray-100"
                    />

                    {/* Search Dropdown */}
                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-gray-100 rounded-[2rem] shadow-2xl p-2 z-50 animate-ios-popup overflow-hidden">
                            {searchResults.map(outfit => (
                                <button
                                    key={outfit.id}
                                    onClick={() => selectOutfit(outfit)}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-indigo-50/50 transition-colors text-left rounded-2xl group"
                                >
                                    <div className="h-14 w-14 rounded-xl bg-gray-50 flex-shrink-0 border border-gray-100 overflow-hidden">
                                        {outfit.imageUrl ? (
                                            <img src={outfit.imageUrl} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-[10px] font-black">{outfit.code}</div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-black text-gray-900 truncate tracking-tight">{outfit.name}</div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{outfit.code}</div>
                                    </div>
                                    <FiArrowRight className="text-gray-200 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Outfit Card */}
                {selectedOutfit && (
                    <div className="animate-fade-in-up">
                        <div className="bg-indigo-600 p-6 rounded-[2.5rem] shadow-xl shadow-indigo-200 flex items-center justify-between text-white relative overflow-hidden group">
                            {/* Abstract Decor */}
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>

                            <div className="flex items-center gap-5 relative z-10">
                                <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 overflow-hidden flex-shrink-0">
                                    {selectedOutfit.imageUrl && <img src={selectedOutfit.imageUrl} className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-1">Active Selection</div>
                                    <h2 className="text-xl font-black truncate tracking-tighter">{selectedOutfit.name}</h2>
                                    <div className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em]">{selectedOutfit.code}</div>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedOutfit(null)}
                                className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all relative z-10"
                            >
                                <FiX className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Diagnosis Inputs */}
                {selectedOutfit && (
                    <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                        {/* Size Selection */}
                        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <FiInfo className="text-indigo-500" /> Specify Size (Optional)
                            </h3>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                <button
                                    onClick={() => setSelectedSize(null)}
                                    className={`px-6 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all border-2
                                        ${!selectedSize ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-lg' : 'bg-white border-gray-100 text-gray-400'}`}
                                >
                                    AUTO (ALL)
                                </button>
                                {selectedOutfit.sizes.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSelectedSize(s)}
                                        className={`px-6 py-2 rounded-full text-[10px] font-black uppercase whitespace-nowrap transition-all border-2
                                            ${selectedSize === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-gray-100 text-gray-400'}`}
                                    >
                                        SIZE {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Pickers */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                                <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1.5 block">Pickup Date</label>
                                <div className="relative group/field min-h-[44px] flex items-center">
                                    <FiCalendar className="absolute left-0 text-indigo-500 z-10" />
                                    <DatePicker
                                        selected={pickupDate ? parseISO(pickupDate) : null}
                                        onChange={(date: Date | null) => setPickupDate(date ? format(date, 'yyyy-MM-dd') : "")}
                                        dateFormat="dd MMM yyyy"
                                        placeholderText="Select Date"
                                        showMonthDropdown
                                        showYearDropdown
                                        dropdownMode="select"
                                        yearDropdownItemNumber={10}
                                        scrollableYearDropdown
                                        todayButton="Today"
                                        withPortal
                                        className="w-full bg-transparent border-none text-[13px] font-black text-gray-900 pl-7 focus:ring-0 cursor-pointer outline-none"
                                    />
                                </div>
                            </div>
                            <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                                <label className="text-[9px] font-black text-[#94A3B8] uppercase tracking-widest mb-1.5 block">Return Date</label>
                                <div className="relative group/field min-h-[44px] flex items-center">
                                    <FiCalendar className="absolute left-0 text-indigo-500 z-10" />
                                    <DatePicker
                                        selected={returnDate ? parseISO(returnDate) : null}
                                        onChange={(date: Date | null) => setReturnDate(date ? format(date, 'yyyy-MM-dd') : "")}
                                        dateFormat="dd MMM yyyy"
                                        placeholderText="Select Date"
                                        showMonthDropdown
                                        showYearDropdown
                                        dropdownMode="select"
                                        yearDropdownItemNumber={10}
                                        scrollableYearDropdown
                                        todayButton="Today"
                                        withPortal
                                        className="w-full bg-transparent border-none text-[13px] font-black text-gray-900 pl-7 focus:ring-0 cursor-pointer outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Status Result Area */}
                        {availabilityResult && (
                            <div className={`p-6 rounded-[2.5rem] border-4 flex items-center gap-6 animate-ios-popup
                                ${availabilityResult.status === 'available' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' :
                                    availabilityResult.status === 'invalid' ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-red-50 border-red-100 text-red-900'}`}>

                                <div className={`h-14 w-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-2xl
                                    ${availabilityResult.status === 'available' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                    {availabilityResult.status === 'available' ? <FiCheckCircle /> : <FiAlertCircle />}
                                </div>

                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-1">Current Status</div>
                                    <h4 className="text-xl font-black tracking-tighter leading-tight">{availabilityResult.message}</h4>
                                </div>
                            </div>
                        )}

                        {/* Full Availability Calendar */}
                        <div className="pt-4 space-y-3">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Master Schedule</h3>
                                <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">Swipe Horizontal</span>
                            </div>
                            <div className="bg-white p-1 rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                                {isLoadingEvents ? (
                                    <div className="h-[300px] flex flex-col items-center justify-center gap-3 text-gray-400 bg-gray-50/50">
                                        <FiLoader className="h-6 w-6 animate-spin text-indigo-600" />
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Syncing database...</span>
                                    </div>
                                ) : (
                                    <AvailabilityCalendar
                                        events={events}
                                        orientation="horizontal"
                                        referenceDate={calendarStartDate}
                                        totalSizes={selectedOutfit.sizes}
                                        sizeQuantities={selectedOutfit.sizeQuantities}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Initial State / Prompt */}
                {!selectedOutfit && !isSearching && searchQuery === "" && (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6 text-gray-300">
                            <FiBox className="h-10 w-10" />
                        </div>
                        <p className="text-gray-500 font-black uppercase tracking-widest text-xs">Search to verify stock</p>
                    </div>
                )}
            </div>
        </div>
    );
}
