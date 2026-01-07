"use client";

import React, { useState } from 'react';
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
    isBefore
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
}

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({ events, totalSizes = [], sizeQuantities = {}, orientation = 'horizontal' }) => {
    const [tooltipData, setTooltipData] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const handleMouseEnterNode = (e: React.MouseEvent, content: React.ReactNode) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipData({
            x: rect.left + rect.width / 2,
            y: rect.top,
            content: content
        });
    };

    const handleMouseLeaveNode = () => {
        setTooltipData(null);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
        scrollContainerRef.current.style.cursor = 'grabbing';
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.style.cursor = 'grab';
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.style.cursor = 'grab';
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast
        scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    };

    const nextMonth = addMonths(currentMonth, 1);
    const nextNextMonth = addMonths(currentMonth, 2);

    const onNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const onPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

    const renderHeader = (date: Date) => {
        return (
            <div className="flex justify-center mb-2">
                <span className="text-sm font-bold text-gray-800">
                    {format(date, "MMMM")}
                </span>
            </div>
        );
    };

    const renderDays = () => {
        const dateFormat = "EEEEE"; // M, T, W, T, F, S, S (Single letter)
        const days = [];
        let startDate = startOfWeek(currentMonth); // Default starts on Sunday, generally fine or adjust to Monday

        for (let i = 0; i < 7; i++) {
            // Adjust labels if you want Monday start styling
            days.push(
                <div className="text-center text-[10px] font-medium text-gray-500 py-0.5" key={i}>
                    {format(addDays(startDate, i), dateFormat)}
                </div>
            );
        }
        return <div className="grid grid-cols-7 mb-1">{days}</div>;
    };

    // Reuse nice logic for rendering a month's grid
    const renderMonthGrid = (monthDate: Date) => {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const dateFormat = "d";
        // Gather all days
        const daysInGrid = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className="grid grid-cols-7 gap-y-1 gap-x-1">
                {daysInGrid.map((dayItem, idx) => {
                    if (!isSameMonth(dayItem, monthDate)) {
                        return <div key={idx}></div>; // Empty slot for days outside month to match screenshot clean look
                    }

                    // Check status
                    let containerClass = "bg-white border-gray-100 text-gray-700 hover:border-gray-300"; // Default available
                    let hasBooking = false;
                    let isFullConfig = false;

                    let isAmFull = false;
                    let isPmFull = false;

                    const bookedSizesMapAM = new Map<string, number>();
                    const bookedSizesMapPM = new Map<string, number>();

                    events.forEach(event => {
                        if ((isSameDay(dayItem, event.start) || dayItem > event.start) &&
                            (isSameDay(dayItem, event.end) || dayItem < event.end)) {

                            hasBooking = true;

                            // Determine which slots this event occupies
                            let occupiesAM = true;
                            let occupiesPM = true;

                            if (isSameDay(dayItem, event.start)) {
                                if (event.pickupSlot === 'Afternoon') occupiesAM = false;
                            }
                            if (isSameDay(dayItem, event.end)) {
                                if (event.returnSlot === 'Morning') occupiesPM = false;
                            }

                            // Register usage
                            if (event.bookedSizes && event.bookedSizes.length > 0) {
                                event.bookedSizes.forEach(s => {
                                    if (occupiesAM) bookedSizesMapAM.set(s, (bookedSizesMapAM.get(s) || 0) + 1);
                                    if (occupiesPM) bookedSizesMapPM.set(s, (bookedSizesMapPM.get(s) || 0) + 1);
                                });
                            } else if (event.status === 'booked') {
                                // Assume all monitored sizes occupied
                                totalSizes.forEach(s => {
                                    if (occupiesAM) bookedSizesMapAM.set(s, (bookedSizesMapAM.get(s) || 0) + 1);
                                    if (occupiesPM) bookedSizesMapPM.set(s, (bookedSizesMapPM.get(s) || 0) + 1);
                                });
                                // Block plain booking
                                if (totalSizes.length === 0) {
                                    if (occupiesAM) isAmFull = true;
                                    if (occupiesPM) isPmFull = true;
                                }
                            }
                        }
                    });

                    if (hasBooking) {
                        if (totalSizes.length > 0) {
                            // Check capacity for AM and PM
                            let amAllFull = true;
                            let pmAllFull = true;

                            for (const size of totalSizes) {
                                const cap = sizeQuantities[size] || 1;
                                if ((bookedSizesMapAM.get(size) || 0) < cap) amAllFull = false;
                                if ((bookedSizesMapPM.get(size) || 0) < cap) pmAllFull = false;
                            }
                            isAmFull = amAllFull;
                            isPmFull = pmAllFull;

                            if (isAmFull && isPmFull) {
                                containerClass = "bg-red-50 border-red-200 text-red-800";
                                isFullConfig = true;
                            } else if (isAmFull) {
                                containerClass = "bg-gradient-to-r from-red-50 to-white from-50% to-50% border-gray-200";
                            } else if (isPmFull) {
                                containerClass = "bg-gradient-to-r from-white to-red-50 from-50% to-50% border-gray-200";
                            } else {
                                const amCount = Array.from(bookedSizesMapAM.values()).reduce((a, b) => a + b, 0);
                                if (amCount > 0 || Array.from(bookedSizesMapPM.values()).reduce((a, b) => a + b, 0) > 0) {
                                    containerClass = "bg-orange-50 border-orange-200 text-orange-800";
                                }
                            }

                        } else {
                            // No sizes, using isAmFull direct
                            if (isAmFull && isPmFull) {
                                containerClass = "bg-red-50 border-red-200 text-red-800";
                                isFullConfig = true;
                            } else if (isAmFull) {
                                containerClass = "bg-gradient-to-r from-red-50 to-white from-50% to-50% border-gray-200";
                            } else if (isPmFull) {
                                containerClass = "bg-gradient-to-r from-white to-red-50 from-50% to-50% border-gray-200";
                            }
                        }
                    }

                    // Tooltip Construction
                    let tooltipContent: React.ReactNode = null;
                    let hasTooltip = false;

                    if (hasBooking && !isFullConfig) {
                        const activeEvents = events.filter(e =>
                            (isSameDay(dayItem, e.start) || isAfter(dayItem, e.start)) &&
                            (isSameDay(dayItem, e.end) || isBefore(dayItem, e.end))
                        );

                        if (activeEvents.length > 0) {
                            hasTooltip = true;
                            tooltipContent = (
                                <div className="w-max max-w-[200px] bg-gray-900 text-white text-[10px] p-2.5 rounded-lg shadow-xl border border-gray-800 animate-scale-in">
                                    <div className="font-bold text-gray-300 mb-1.5 pb-1.5 border-b border-gray-700 uppercase tracking-wider flex justify-between items-center">
                                        <span>{format(dayItem, 'MMM dd')}</span>
                                        <span className="text-[9px] text-gray-500 font-mono">{format(dayItem, 'EEE')}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {activeEvents.map((e, i) => {
                                            const isPickup = isSameDay(dayItem, e.start);
                                            const isReturn = isSameDay(dayItem, e.end);
                                            const sizes = e.bookedSizes?.join(', ') || 'All';

                                            let statusText = "Booked";
                                            let statusColor = "text-indigo-300";

                                            if (isPickup) {
                                                statusText = `Pickup (${e.pickupSlot === 'Morning' ? 'AM' : 'PM'})`;
                                                statusColor = "text-emerald-300";
                                            } else if (isReturn) {
                                                statusText = `Return (${e.returnSlot === 'Morning' ? 'AM' : 'PM'})`;
                                                statusColor = "text-amber-300";
                                            }

                                            return (
                                                <div key={i} className="flex flex-col">
                                                    <div className="flex justify-between items-center gap-3">
                                                        <span className="font-bold text-white bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
                                                            Size {sizes}
                                                        </span>
                                                        <span className={`text-[9px] font-medium ${statusColor}`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 -mb-2"></div>
                                </div>
                            );
                        } else {
                            hasTooltip = true;
                            tooltipContent = <div className="bg-gray-900 text-gray-300 italic p-2 rounded text-[10px] shadow-xl">Fully allocated</div>;
                        }
                    } else if (isFullConfig) {
                        hasTooltip = true;
                        tooltipContent = (
                            <div className="bg-red-900/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-xl border border-red-800">
                                Out of Stock
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-red-900/90 -mb-2"></div>
                            </div>
                        );
                    }

                    return (
                        <div
                            key={idx}
                            className={`
                            relative group w-full aspect-square min-h-[40px] flex flex-col items-center justify-start py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-all border
                            ${containerClass}
                        `}
                            onMouseEnter={(e) => hasTooltip && handleMouseEnterNode(e, tooltipContent)}
                            onMouseLeave={handleMouseLeaveNode}
                        >
                            <span className="mb-0.5 text-gray-800">{format(dayItem, dateFormat)}</span>

                            {/* Render Size Chips if Partial/Full but not visually blocked completely */}
                            {hasBooking && !isFullConfig && (
                                <div className="flex flex-wrap justify-center gap-0.5 w-full px-0.5">
                                    <div className={`w-1 h-1 rounded-full ${isAmFull ? 'bg-red-500' : (bookedSizesMapAM.size > 0 ? 'bg-orange-400' : 'bg-green-200')}`}></div>
                                    <div className={`w-1 h-1 rounded-full ${isPmFull ? 'bg-red-500' : (bookedSizesMapPM.size > 0 ? 'bg-orange-400' : 'bg-green-200')}`}></div>
                                </div>
                            )}
                        </div>
                    );


                })
                }
            </div >
        )
    };

    // Generate 6 months
    const months = [];
    for (let i = 0; i < 6; i++) {
        months.push(addMonths(currentMonth, i));
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative">
            {/* Scrollable Container */}
            <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto pb-4 gap-6 scrollbar-hide cursor-grab select-none"
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
            >
                {months.map((month, index) => (
                    <div key={index} className="min-w-[300px] md:min-w-[45%] flex-shrink-0 border border-gray-100 rounded-lg p-4">
                        {renderHeader(month)}
                        {renderDays()}
                        {renderMonthGrid(month)}
                    </div>
                ))}
            </div>

            <div className="flex justify-between items-center mt-2 text-sm text-gray-500 px-2">
                <span>&larr; Drag or Scroll to see more dates &rarr;</span>
            </div>

            {/* Fixed Tooltip Portal */}
            {tooltipData && (
                <div
                    className="fixed z-[9999] transform -translate-x-1/2 -translate-y-full pb-2 pointer-events-none"
                    style={{ left: tooltipData.x, top: tooltipData.y }}
                >
                    {tooltipData.content}
                </div>
            )}
        </div>
    );
};

export default AvailabilityCalendar;
