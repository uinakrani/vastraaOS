"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays,
    eachDayOfInterval,
    isAfter,
    isBefore,
    startOfDay
} from 'date-fns';
import { FiChevronLeft, FiChevronRight, FiInfo } from 'react-icons/fi';

interface CalendarEvent {
    start: Date;
    end: Date;
    title?: string;
    status?: 'booked' | 'maintenance' | 'pending'; // Custom status for colors
    bookedSizes?: string[];
    pickupSlot?: string;
    returnSlot?: string;
}

interface AvailabilityCalendarProps {
    events: CalendarEvent[];
    totalSizes?: string[];
    sizeQuantities?: { [key: string]: number };
    orientation?: 'horizontal' | 'vertical';
    referenceDate?: Date;
}

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
    events,
    totalSizes = [],
    sizeQuantities = {},
    orientation = 'horizontal',
    referenceDate
}) => {
    const [tooltipData, setTooltipData] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
    const startDate = useMemo(() => startOfMonth(referenceDate || new Date()), [referenceDate]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [activeMonthIndex, setActiveMonthIndex] = useState(0);
    const [selectedSizeFilter, setSelectedSizeFilter] = useState<string | null>(null);

    // Optimized for Mobile: Tapping a day toggles the tooltip
    const handleDayInteraction = (e: React.MouseEvent, content: React.ReactNode) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const topY = rect.top;

        // If clicking the same day, close it
        if (tooltipData && Math.abs(tooltipData.x - centerX) < 5) {
            setTooltipData(null);
            return;
        }

        setTooltipData({
            x: centerX,
            y: topY,
            content: content
        });
    };

    // Smart Positioning Effect
    useEffect(() => {
        if (tooltipData && tooltipRef.current) {
            const tooltip = tooltipRef.current;

            // 1. Initial Position: Center it above the anchor
            const initialTransform = 'translate(-50%, -100%) translateY(-12px)';
            tooltip.style.transform = initialTransform;
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'visible';

            // 2. Measure & Adjust (Wait one frame to ensure DOM is ready)
            requestAnimationFrame(() => {
                if (!tooltipRef.current) return;

                const rect = tooltip.getBoundingClientRect();
                const padding = 16;
                let xOffset = 0;
                let translateY = '-100%';
                let yGap = '-12px';

                // Horizontal Adjustment
                if (rect.left < padding) {
                    xOffset = padding - rect.left;
                } else if (rect.right > window.innerWidth - padding) {
                    xOffset = (window.innerWidth - padding) - rect.right;
                }

                // Vertical Adjustment (Flip IF off top)
                if (rect.top < padding) {
                    translateY = '0%';
                    yGap = '12px';
                    // Re-measure after vertical flip to see if we now overflow bottom
                    // (But usually calendars are higher up on screen, so this is safe)
                }

                tooltip.style.transform = `translate(calc(-50% + ${xOffset}px), ${translateY}) translateY(${yGap})`;
                tooltip.style.opacity = '1';
                tooltip.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
            });
        }
    }, [tooltipData]);

    // Close tooltip on scroll or click away
    useEffect(() => {
        const handleInteraction = () => setTooltipData(null);
        window.addEventListener('scroll', handleInteraction, true);
        const handleGlobalClick = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('[data-day-cell]')) {
                setTooltipData(null);
            }
        };
        window.addEventListener('click', handleGlobalClick);
        return () => {
            window.removeEventListener('scroll', handleInteraction, true);
            window.removeEventListener('click', handleGlobalClick);
        };
    }, []);

    // Reset scroll and index when startDate changes (e.g. via parent date selection)
    useEffect(() => {
        setActiveMonthIndex(0);
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
        }
    }, [startDate]);

    const handleScroll = () => {
        if (scrollRef.current) {
            const index = Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth);
            setActiveMonthIndex(index);
        }
    };

    const renderSizeFilter = () => {
        if (totalSizes.length <= 1) return null;
        return (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-4 mb-6 -mt-2 pb-2">
                <button
                    onClick={() => setSelectedSizeFilter(null)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                        ${!selectedSizeFilter ? 'bg-[#0F172A] text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                >
                    ALL SIZES
                </button>
                {totalSizes.map(size => (
                    <button
                        key={size}
                        onClick={() => setSelectedSizeFilter(size)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all
                            ${selectedSizeFilter === size ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                    >
                        SIZE {size}
                    </button>
                ))}
            </div>
        );
    };

    const renderHeader = (date: Date) => {
        return (
            <div className="flex justify-between items-center mb-6 px-4">
                <span className="text-2xl font-black text-[#0F172A] tracking-tighter">
                    {format(date, "MMMM")} <span className="text-gray-300 ml-1 font-bold">{format(date, "yyyy")}</span>
                </span>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest animate-pulse">Swipe</span>
                    <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-indigo-500"></div>
                        <div className="w-1 h-1 rounded-full bg-indigo-300"></div>
                        <div className="w-1 h-1 rounded-full bg-indigo-100"></div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const dateFormat = "EEEEE";
        const days = [];
        let start = startOfWeek(new Date());

        for (let i = 0; i < 7; i++) {
            days.push(
                <div className="text-center text-[11px] font-black text-gray-300 py-2 uppercase tracking-[0.2em]" key={i}>
                    {format(addDays(start, i), dateFormat)}
                </div>
            );
        }
        return <div className="grid grid-cols-7 mb-4 px-2">{days}</div>;
    };

    const renderMonthGrid = (monthDate: Date) => {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthStart);
        const gridStart = startOfWeek(monthStart);
        const gridEnd = endOfWeek(monthEnd);

        const daysInGrid = eachDayOfInterval({ start: gridStart, end: gridEnd });

        return (
            <div className="grid grid-cols-7 gap-2 px-2 pb-6">
                {daysInGrid.map((dayItem, idx) => {
                    if (!isSameMonth(dayItem, monthDate)) {
                        return <div key={idx} className="aspect-square opacity-0"></div>;
                    }

                    const dayKey = format(dayItem, 'yyyy-MM-dd');

                    // Advanced Availability Tracking
                    const amBookedCounts = new Map<string, number>();
                    const pmBookedCounts = new Map<string, number>();
                    let amOccupied = false;
                    let pmOccupied = false;

                    events.forEach(event => {
                        const eventStartKey = format(event.start, 'yyyy-MM-dd');
                        const eventEndKey = format(event.end, 'yyyy-MM-dd');

                        // Timezone-safe date matching
                        if (dayKey >= eventStartKey && dayKey <= eventEndKey) {
                            let occupiesAM = true;
                            let occupiesPM = true;

                            if (dayKey === eventStartKey && event.pickupSlot === 'Afternoon') occupiesAM = false;
                            if (dayKey === eventEndKey && event.returnSlot === 'Morning') occupiesPM = false;

                            if (occupiesAM) amOccupied = true;
                            if (occupiesPM) pmOccupied = true;

                            if (event.bookedSizes && event.bookedSizes.length > 0) {
                                event.bookedSizes.forEach(s => {
                                    if (occupiesAM) amBookedCounts.set(s, (amBookedCounts.get(s) || 0) + 1);
                                    if (occupiesPM) pmBookedCounts.set(s, (pmBookedCounts.get(s) || 0) + 1);
                                });
                            } else {
                                totalSizes.forEach(s => {
                                    if (occupiesAM) amBookedCounts.set(s, (amBookedCounts.get(s) || 0) + 1);
                                    if (occupiesPM) pmBookedCounts.set(s, (pmBookedCounts.get(s) || 0) + 1);
                                });
                            }
                        }
                    });

                    // Availability Analysis Logic
                    type SlotState = 'free' | 'booked' | 'warning' | 'out';
                    let amState: SlotState = 'free';
                    let pmState: SlotState = 'free';

                    const analyzeSlot = (counts: Map<string, number>, isOccupied: boolean) => {
                        if (counts.size === 0 && !isOccupied) return 'free'; // No bookings at all for this slot

                        const sizesToCheck = selectedSizeFilter ? [selectedSizeFilter] : totalSizes;
                        if (sizesToCheck.length === 0) { // Fallback if no totalSizes and no filter, assume generic booking
                            return isOccupied ? 'booked' : 'free';
                        }

                        let warningCount = 0;
                        let outCount = 0;
                        let hasBookingForAnySize = false;

                        sizesToCheck.forEach(s => {
                            const cap = sizeQuantities[s] || 1;
                            const count = counts.get(s) || 0;
                            if (count > 0) hasBookingForAnySize = true;

                            if (count >= cap) outCount++;
                            else if (count > 0) warningCount++;
                        });

                        if (outCount === sizesToCheck.length) return 'out'; // All checked sizes are fully out
                        if (outCount > 0) return 'warning'; // Some checked sizes are fully out
                        if (warningCount > 0 || hasBookingForAnySize || isOccupied) return 'booked'; // Some checked sizes booked, stock remains for all, or just has a booking
                        return 'free';
                    };

                    amState = analyzeSlot(amBookedCounts, amOccupied);
                    pmState = analyzeSlot(pmBookedCounts, pmOccupied);

                    const isToday = isSameDay(dayItem, new Date());

                    // Native-Aesthetic Color Mapping
                    const stateColors: Record<SlotState, string> = {
                        'free': 'bg-gray-50 text-gray-900',
                        'booked': 'bg-indigo-50 text-indigo-600 font-black',
                        'warning': 'bg-[#FFF7ED] border-orange-200 text-orange-600 font-black',
                        'out': 'bg-[#FEF2F2] border-red-200 text-red-600 font-black'
                    };

                    let cellStyle = stateColors[amState];
                    if (amState !== pmState) {
                        const amHex = amState === 'out' ? '#ef4444' : amState === 'warning' ? '#f97316' : amState === 'booked' ? '#4f46e5' : '#f9fafb';
                        const pmHex = pmState === 'out' ? '#ef4444' : pmState === 'warning' ? '#f97316' : pmState === 'booked' ? '#4f46e5' : '#f9fafb';
                        cellStyle = `bg-gradient-to-r from-[${amHex}] from-50% to-[${pmHex}] to-50%`;
                        // Simplified fallback if gradient hex extraction fails in some browsers
                        if (amState === 'out' && pmState === 'free') cellStyle = 'bg-gradient-to-r from-red-500 from-50% to-gray-50 to-50%';
                        if (amState === 'free' && pmState === 'out') cellStyle = 'bg-gradient-to-r from-gray-50 from-50% to-red-500 to-50%';
                        if (amState === 'warning' && pmState === 'free') cellStyle = 'bg-gradient-to-r from-orange-400 from-50% to-gray-50 to-50%';
                        if (amState === 'free' && pmState === 'warning') cellStyle = 'bg-gradient-to-r from-gray-50 from-50% to-orange-400 to-50%';
                    } else {
                        // If both AM and PM are the same state, apply the full background color
                        cellStyle = stateColors[amState];
                    }


                    let borderClass = "border-transparent";
                    if (isToday) borderClass = "border-indigo-600 ring-2 ring-indigo-600/20";

                    let tooltipContent: React.ReactNode = null;
                    if (amOccupied || pmOccupied) {
                        const dayEvents = events.filter(e => {
                            const start = format(e.start, 'yyyy-MM-dd');
                            const end = format(e.end, 'yyyy-MM-dd');
                            return dayKey >= start && dayKey <= end;
                        });

                        tooltipContent = (
                            <div className="bg-[#0F172A]/90 text-white p-5 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] min-w-[260px] border border-white/10 backdrop-blur-3xl animate-ios-popup pointer-events-auto">
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 pb-4 border-b border-white/5 flex justify-between items-center">
                                    <span>{format(dayItem, 'EEEE, MMM dd')}</span>
                                    <div className="flex gap-1">
                                        {amState === 'out' || pmState === 'out' ? <span className="text-[8px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">SOLD OUT</span> : null}
                                        {amState === 'warning' || pmState === 'warning' ? <span className="text-[8px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">LIMITED</span> : null}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    {dayEvents.map((e, i) => {
                                        const isPickup = format(dayItem, 'yyyy-MM-dd') === format(e.start, 'yyyy-MM-dd');
                                        const isReturn = format(dayItem, 'yyyy-MM-dd') === format(e.end, 'yyyy-MM-dd');

                                        return (
                                            <div key={i} className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[13px] font-black leading-tight line-clamp-1 text-white tracking-tight">{e.title || 'Studio Order'}</div>
                                                    <span className="text-[9px] bg-indigo-600 text-white px-2.5 py-1 rounded-full font-black uppercase shadow-lg shadow-indigo-500/20">S-{e.bookedSizes?.join(', ') || 'ALL'}</span>
                                                </div>

                                                <div className="flex flex-col gap-2 relative">
                                                    <div className="grid grid-cols-2 gap-3 items-center">
                                                        <div className={`p-2 rounded-2xl bg-white/5 border ${isPickup ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/5'}`}>
                                                            <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Pickup</div>
                                                            <div className="text-[10px] font-black text-gray-200">{format(e.start, 'MMM dd')}</div>
                                                            <div className={`text-[8px] font-bold mt-0.5 ${isPickup ? 'text-emerald-400' : 'text-gray-500'}`}>{e.pickupSlot}</div>
                                                        </div>
                                                        <div className={`p-2 rounded-2xl bg-white/5 border ${isReturn ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5'}`}>
                                                            <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Return</div>
                                                            <div className="text-[10px] font-black text-gray-200">{format(e.end, 'MMM dd')}</div>
                                                            <div className={`text-[8px] font-bold mt-0.5 ${isReturn ? 'text-orange-400' : 'text-gray-500'}`}>{e.returnSlot}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={idx}
                            data-day-cell
                            onMouseEnter={(e) => tooltipContent && window.innerWidth > 768 && handleDayInteraction(e, tooltipContent)}
                            onMouseLeave={() => window.innerWidth > 768 && setTooltipData(null)}
                            onClick={(e) => tooltipContent && handleDayInteraction(e, tooltipContent)}
                            className={`aspect-square rounded-[1.2rem] flex items-center justify-center text-xs font-black border transition-all relative overflow-hidden active:scale-90 cursor-pointer ${cellStyle} ${borderClass}`}
                        >
                            <span className="relative z-10">{format(dayItem, "d")}</span>
                            {isToday && <div className="absolute inset-0 bg-indigo-600/10 animate-pulse"></div>}
                        </div>
                    );
                })}
            </div>
        );
    };

    const TooltipPortal = () => {
        if (!tooltipData || typeof document === 'undefined') return null;

        return createPortal(
            <div
                ref={tooltipRef}
                className="fixed z-[9999] pointer-events-none"
                style={{
                    left: tooltipData.x,
                    top: tooltipData.y,
                    visibility: 'hidden',
                    opacity: 0,
                    willChange: 'transform, opacity'
                }}
            >
                {tooltipData.content}
            </div>,
            document.body
        );
    };

    const months = useMemo(() =>
        Array.from({ length: 12 }, (_, i) => addMonths(startDate, i)),
        [startDate]);

    if (orientation === 'vertical') {
        return (
            <div className="space-y-12 relative">
                {renderSizeFilter()}
                {months.slice(0, 6).map((month, i) => (
                    <div key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                        {renderHeader(month)}
                        {renderDays()}
                        {renderMonthGrid(month)}
                    </div>
                ))}
                <TooltipPortal />
            </div>
        );
    }

    return (
        <div className="relative group/cal select-none">
            {renderSizeFilter()}

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide cursor-grab active:cursor-grabbing touch-pan-x"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {months.map((month, i) => (
                    <div key={i} className="min-w-full snap-center animate-fade-in px-1">
                        {renderHeader(month)}
                        {renderDays()}
                        {renderMonthGrid(month)}
                    </div>
                ))}
            </div>

            <div className="flex justify-center gap-2 mt-4">
                {months.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => {
                            if (scrollRef.current) {
                                scrollRef.current.scrollTo({
                                    left: i * scrollRef.current.clientWidth,
                                    behavior: 'smooth'
                                });
                            }
                        }}
                        className={`h-1.5 rounded-full transition-all duration-500 ${activeMonthIndex === i ? 'w-8 bg-[#0F172A]' : 'w-1.5 bg-gray-200'}`}
                    />
                ))}
            </div>

            <TooltipPortal />
        </div>
    );
};

export default AvailabilityCalendar;
