
import { addDays, areIntervalsOverlapping, eachDayOfInterval, format, isSameDay, startOfDay } from "date-fns";

// Types
export interface AvailabilityRequest {
    outfitId: string;
    outfitSize: string; // "36", or "Any" (future)
    startDate: Date;
    endDate: Date;
    pickupSlot?: 'Morning' | 'Afternoon'; // Defaults to Morning (start of day)
    returnSlot?: 'Morning' | 'Afternoon'; // Defaults to Evening/Afternoon (end of day) if not specified
    totalStock: number; // Total pieces of this size
    bufferDays?: number; // Days blocked after return (e.g. 2 for cleaning)
}

export interface AvailabilityResponse {
    isAvailable: boolean;
    availableQuantity: number; // Min available quantity across the range
    totalStock: number;
    maxBookedCount: number; // Peak usage
    blockingOrders: any[]; // List of orders that contributed to the peak or overlap
    reason?: string;
}

export const BOOKING_STATUSES = {
    CONFIRMED: ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'],
    COMPLETED: ['completed', 'done'], // Still block if dates overlap (though rare for past)
    CANCELLED: ['cancelled', 'returned', 'rejected', 'failed']
};

export const DEFAULT_BUFFER_DAYS = 0;

export const checkOutfitAvailability = (
    allOrders: any[],
    request: AvailabilityRequest
): AvailabilityResponse => {
    const { outfitId, outfitSize, startDate, endDate, totalStock, bufferDays = 0 } = request;

    const queryStart = startOfDay(startDate);
    const queryEnd = startOfDay(endDate);

    // 1. Filter Orders for this Item + Status 
    // (We only care about orders that *might* overlap, but we iterate all for now as passed in)
    const validStateOrders = allOrders.filter(order => {
        const status = (order.status || '').toLowerCase();
        // Ignore cancelled, returned
        if (BOOKING_STATUSES.CANCELLED.includes(status)) return false;

        // Use default 'pending' if no status
        return true;
    });

    const relevantOrders = validStateOrders.filter(order => {
        if (!order.outfitItems) return false;

        // Check if order contains this specific outfit + size
        return order.outfitItems.some((item: any) =>
            // Match ID or Code (using Code as primary in this app mostly)
            (item.designCode === outfitId || item.id === outfitId || item.designCode === request.outfitId) && // Handle both inputs if caller passes code
            (item.size === outfitSize)
        );
    });

    // 2. Calculate Slot Usage for the Query Range
    // We care about slots: "YYYY-MM-DD_AM" and "YYYY-MM-DD_PM"
    const usageMap: Record<string, number> = {};
    const blockingOrdersSet = new Set<string>();

    const getSlotsForRange = (start: Date, end: Date, pSlot: string = 'Morning', rSlot: string = 'Afternoon', buffers: number = 0) => {
        const slots: string[] = [];
        const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });

        days.forEach((d, idx) => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const isFirst = idx === 0;
            const isLast = idx === days.length - 1;

            if (isFirst && isLast) { // Single Day Rental
                if (pSlot === 'Morning') slots.push(`${dateStr}_AM`);
                // If Pickup Morning, it blocks PM too usually? Yes.
                // If Pickup Afternoon, blocks PM.
                // If Return Morning, blocks AM. 
                // Logic:
                // Start AM -> End AM: AM Only? No, rental usually min 1 day. But if "Morning to Morning", it's 24h.
                // Let's strictly follow the slots:
                // Start determines entry. End determines exit.
                // If Start=AM, occupy AM. If Start=PM, AM is free.
                // If End=AM, occupy AM. If End=PM, occupy PM.
                // Since it's inclusive [Start, End]:
                // If Single Day: Start AM, End PM -> AM, PM.
                // If Single Day: Start PM, End PM -> PM.
                // If Single Day: Start AM, End AM -> AM.

                if (pSlot === 'Morning') slots.push(`${dateStr}_AM`);
                // Check overlap? AM is essentially 00:00-12:00. PM is 12:00-24:00.
                // Logic: 
                // AM slot active if: (isFirst && pSlot=='Morning') || (!isFirst) 
                // AND (isLast && rSlot!='Morning') ?? No.

                // Let's simplify:
                // A day has [AM, PM].
                // Active from PickupSlot (inclusive) to ReturnSlot (inclusive).

                // First Day:
                // If Pickup == Morning: Mark AM, Mark PM (unless isLast and Return==Morning).
                // If Pickup == Afternoon: Mark PM.

                if (pSlot === 'Morning') {
                    slots.push(`${dateStr}_AM`);
                    if (rSlot === 'Afternoon') slots.push(`${dateStr}_PM`);
                } else { // Pickup Afternoon
                    if (rSlot === 'Afternoon') slots.push(`${dateStr}_PM`);
                }
            } else {
                // First Day
                if (isFirst) {
                    if (pSlot === 'Morning') {
                        slots.push(`${dateStr}_AM`);
                        slots.push(`${dateStr}_PM`);
                    } else {
                        slots.push(`${dateStr}_PM`);
                    }
                }
                // Last Day
                else if (isLast) {
                    slots.push(`${dateStr}_AM`);
                    if (rSlot === 'Afternoon') {
                        slots.push(`${dateStr}_PM`);
                    }
                }
                // Middle Days
                else {
                    slots.push(`${dateStr}_AM`);
                    slots.push(`${dateStr}_PM`);
                }
            }
        });

        // Handle Buffer Days (Full Days)
        if (buffers > 0) {
            const bufferStart = addDays(startOfDay(end), 1);
            const bufferEnd = addDays(bufferStart, buffers - 1);
            const bufferDaysArr = eachDayOfInterval({ start: bufferStart, end: bufferEnd });
            bufferDaysArr.forEach(d => {
                const s = format(d, 'yyyy-MM-dd');
                slots.push(`${s}_AM`);
                slots.push(`${s}_PM`);
            });
        }

        return slots;
    };

    // Initialize Query Slots
    // If request doesn't specify P/R slots, assume full coverage (Morning->Afternoon)
    const qPSlot = request.pickupSlot || 'Morning';
    const qRSlot = request.returnSlot || 'Afternoon';
    const querySlots = getSlotsForRange(queryStart, queryEnd, qPSlot, qRSlot, 0); // buffers not applied to query usually, or are they? Usually we check if we fit. If we have our own buffer, we need to fit that too. Let's assume request duration includes what we need space for. But typically buffer is post-return.
    // If *we* need buffer, we should check availability for (End + Buffer). But standard is: "Is it available for my usage?". The system adds buffer to MY order when blocking OTHERS.
    // So query is just the usage duration.

    querySlots.forEach(s => usageMap[s] = 0);

    relevantOrders.forEach(order => {
        let orderStart, orderEnd;
        // Parse dates...
        if (order.startDate && order.endDate) {
            orderStart = order.startDate?.toDate ? order.startDate.toDate() : new Date(order.startDate);
            orderEnd = order.endDate?.toDate ? order.endDate.toDate() : new Date(order.endDate);
        } else if (order.deliveryDate) {
            const d = order.deliveryDate?.toDate ? order.deliveryDate.toDate() : new Date(order.deliveryDate);
            orderStart = d; orderEnd = d;
        } else return;

        // Default slots for existing orders if not present
        const oPSlot = order.pickupSlot || 'Morning';
        // Legacy: if no slot, assume till Afternoon? YES.
        const oRSlot = order.returnSlot || 'Afternoon';

        const occupiedSlots = getSlotsForRange(orderStart, orderEnd, oPSlot, oRSlot, bufferDays); // Use global buffer needed? Or order specific? Used exported constant default or passed one. passing bufferDays from request implies checking blocking. But here we are building the map of "Existing Load". Existing load includes THEIR buffers.
        // We should ideally use the buffer defined by the SYSTEM for that order. For now using passed bufferDays or constant.
        // Let's assume constant 0 or passed.

        // Optimization: Only process overlapping slots
        const overlap = occupiedSlots.filter(s => usageMap.hasOwnProperty(s));
        if (overlap.length > 0) {
            overlap.forEach(s => {
                usageMap[s] = (usageMap[s] || 0) + 1;
            });
            blockingOrdersSet.add(order);
        }
    });

    // 3. Find Peak Usage
    let maxBooked = 0;
    Object.values(usageMap).forEach(count => {
        if (count > maxBooked) maxBooked = count;
    });

    const availableQuantity = totalStock - maxBooked;

    return {
        isAvailable: availableQuantity > 0,
        availableQuantity: Math.max(0, availableQuantity),
        totalStock,
        maxBookedCount: maxBooked,
        blockingOrders: Array.from(blockingOrdersSet),
        reason: availableQuantity <= 0 ? `High demand` : undefined
    };
};
