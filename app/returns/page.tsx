"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { isSameDay, subDays, isAfter, startOfDay, format } from "date-fns";
import { FiCheckCircle, FiClock, FiAlertCircle, FiRotateCcw, FiPhone, FiArrowLeft, FiSearch } from "react-icons/fi";
import Link from "next/link";
import { useToast } from "../../components/ToastProvider";

export default function ReturnsPage() {
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [orders, setOrders] = useState<any[]>([]);

    // Categorized Data
    const [todayReturns, setTodayReturns] = useState<any[]>([]);
    const [yesterdayReturns, setYesterdayReturns] = useState<any[]>([]);
    const [olderReturns, setOlderReturns] = useState<any[]>([]);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [filteredOrders, setFilteredOrders] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<'today' | 'yesterday' | 'previously'>('today');

    useEffect(() => {
        const fetchReturns = async () => {
            setLoading(true);
            try {
                const ordersRef = collection(db, "orders");
                const q = query(ordersRef, orderBy("createdAt", "desc"));
                const snapshot = await getDocs(q);
                const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setOrders(allOrders);

                const today = startOfDay(new Date());
                const yesterday = subDays(today, 1);

                const todayList = [] as any[];
                const yesterdayList = [] as any[];
                // previouslyList will hold all others (History or very old overdue)
                const previouslyList = [] as any[];

                allOrders.forEach((o: any) => {
                    const status = (o.status || '').toLowerCase();
                    if (status === 'cancelled') return; // Ignore cancelled entirely for returns view? Or maybe keep them in history? 
                    // Usually cancelled orders don't involve returns unless partially processed. Assuming ignore for now based on previous code.

                    const returnDate = o.returnDate ? (o.returnDate.toDate ? o.returnDate.toDate() : new Date(o.returnDate)) : null;
                    const returnedAt = o.returnedAt ? (o.returnedAt.toDate ? o.returnedAt.toDate() : new Date(o.returnedAt)) : null;

                    const isReturned = (status === 'returned' || status === 'completed') && returnedAt;
                    const isPending = !isReturned && returnDate;

                    // Bucketing Logic
                    if (isReturned) {
                        // Based on Actual Return Date
                        if (isSameDay(returnedAt, today)) {
                            todayList.push(o);
                        } else if (isSameDay(returnedAt, yesterday)) {
                            yesterdayList.push(o);
                        } else {
                            previouslyList.push(o);
                        }
                    } else if (isPending) {
                        // Based on Scheduled Return Date (Due Date)
                        if (isSameDay(returnDate, today)) {
                            todayList.push(o);
                        } else if (isSameDay(returnDate, yesterday)) {
                            yesterdayList.push(o);
                        } else {
                            // If due tomorrow or future, where does it go? 
                            // User asked for "Returns Previously". 
                            // If it's OLDER than yesterday (Overdue), it goes to Previously.
                            // If it's Future, we might exclude or put in 'Previously' (as in 'Others'). 
                            // Let's put overdue in Previously. Future we can hide or put in a separate list, 
                            // but based on "Previously" label, it implies Past. 
                            // Let's assume 'Previously' handles the "Long Tail". 
                            // If it is FUTURE, it doesn't belong in 'Previously'. 
                            // We will add it to 'Currently Active' list if we had one, but strict to user request:
                            // "Returns Previously" usually means history. 
                            // I will simply dump everything else in "Previously" but sort safely.
                            previouslyList.push(o);
                        }
                    }
                });

                setTodayReturns(todayList);
                setYesterdayReturns(yesterdayList);
                setOlderReturns(previouslyList);

            } catch (err) {
                console.error("Error fetching returns:", err);
                showToast("Failed to load returns.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchReturns();
    }, []);

    // Search Filtering
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredOrders([]);
            return;
        }

        const lowerQuery = searchQuery.toLowerCase();
        const results = orders.filter(order => {
            if (order.customerName?.toLowerCase().includes(lowerQuery)) return true;
            if (order.customerMobile?.includes(lowerQuery)) return true;

            // Allow searching by outfit design/name
            if (order.outfitItems && Array.isArray(order.outfitItems)) {
                const hasOutfit = order.outfitItems.some((item: any) =>
                    item.designName?.toLowerCase().includes(lowerQuery) ||
                    item.designCode?.toLowerCase().includes(lowerQuery)
                );
                if (hasOutfit) return true;
            }
            return false;
        });
        setFilteredOrders(results);
    }, [searchQuery, orders]);


    const ReturnsTable = ({ data, emptyMsg }: any) => {
        // Sort: "Due" items first, then "Returned" items.
        const sortedData = [...data].sort((a, b) => {
            const statusA = (a.status || '').toLowerCase();
            const statusB = (b.status || '').toLowerCase();
            const isReturnedA = statusA === 'returned' || statusA === 'completed';
            const isReturnedB = statusB === 'returned' || statusB === 'completed';

            if (isReturnedA === isReturnedB) return 0;
            return isReturnedA ? 1 : -1; // Non-returned (Due) first
        });

        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {sortedData.length === 0 ? (
                    <div className="p-10 text-center flex flex-col items-center justify-center text-gray-500">
                        <FiRotateCcw className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">{emptyMsg}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-48">Customer</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-40">Dates</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Outfits</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notes</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {sortedData.map((order: any) => {
                                    const total = order.totalAmount || 0;
                                    const advance = order.advancePayment || 0;
                                    const final = order.finalPayment || 0;
                                    const balance = total - advance - final;

                                    const pickup = order.pickupDate ? (order.pickupDate.toDate ? order.pickupDate.toDate() : new Date(order.pickupDate)) : null;
                                    const retDate = order.returnDate ? (order.returnDate.toDate ? order.returnDate.toDate() : new Date(order.returnDate)) : null;
                                    const returnedAt = order.returnedAt ? (order.returnedAt.toDate ? order.returnedAt.toDate() : new Date(order.returnedAt)) : null;
                                    const status = (order.status || '').toLowerCase();
                                    const isReturned = status === 'returned' || status === 'completed';

                                    // Check if overdue (if not returned)
                                    const isLate = !isReturned && retDate && isAfter(startOfDay(new Date()), startOfDay(retDate));

                                    return (
                                        <tr key={order.id} className={`hover:bg-gray-50 transition-colors ${!isReturned ? 'bg-indigo-50/10' : ''}`}>
                                            <td className="px-4 py-4 align-top">
                                                <div className="text-sm font-bold text-gray-900">{order.customerName}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><FiPhone className="w-3 h-3" /> {order.customerMobile}</div>
                                            </td>

                                            <td className="px-4 py-4 align-top">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-xs text-gray-800 font-medium">
                                                        <span className="text-[10px] text-gray-400 uppercase mr-1">Out:</span>
                                                        {pickup ? pickup.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'}
                                                    </div>
                                                    <div className={`text-xs font-medium ${returnedAt ? 'text-gray-500' : (isLate ? 'text-red-600' : 'text-indigo-600')}`}>
                                                        <span className="text-[10px] text-gray-400 uppercase mr-1">Due:</span>
                                                        {retDate ? retDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'}
                                                        {isLate && !returnedAt && <span className="ml-1 text-[9px] bg-red-100 text-red-700 px-1 rounded">Late</span>}
                                                    </div>
                                                    {returnedAt && (
                                                        <div className="text-[10px] text-green-600 mt-1 flex items-center gap-1 font-bold">
                                                            <FiCheckCircle className="w-3 h-3" />
                                                            Returned: {returnedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 align-top">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {order.outfitItems?.map((item: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-lg">
                                                            {item.imageUrl && (
                                                                <img src={item.imageUrl} alt="" className="w-6 h-6 rounded object-cover border border-gray-200 bg-white" />
                                                            )}
                                                            <div>
                                                                <div className="text-[10px] font-bold text-gray-700">{item.designCode}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 align-top">
                                                <div className="flex flex-col gap-1">
                                                    {order.outfitItems?.map((item: any, i: number) => (
                                                        item.notes ? (
                                                            <div key={i} className="text-[10px] text-gray-500 flex items-start gap-1">
                                                                <span className="font-bold text-gray-700 whitespace-nowrap">{item.designCode}:</span>
                                                                <span className="italic">{item.notes}</span>
                                                            </div>
                                                        ) : null
                                                    ))}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 align-top">
                                                <div className="flex flex-col gap-1">
                                                    {isReturned ? (
                                                        <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-800 border border-green-200">
                                                            Returned
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200">
                                                            To Return
                                                        </span>
                                                    )}

                                                    {balance > 0 ? (
                                                        <span className="text-[10px] font-bold text-red-600 mt-1">
                                                            Due: ₹{balance}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-green-600 mt-1">
                                                            Paid
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 whitespace-nowrap text-right align-top">
                                                <Link href={`/orders/${order.id}?source=returns`} className="text-indigo-600 hover:text-indigo-900 flex items-center justify-end gap-1">
                                                    <span className="text-xs font-bold uppercase tracking-wide">View</span>
                                                    <FiArrowLeft className="rotate-180 w-3 h-3" />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    return (
        <DashboardLayout>
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 bg-white border-b border-gray-200 transition-all">
                <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-tight">Returns</h1>
                        <p className="text-xs text-gray-500 font-medium">Daily & History</p>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
                {/* Search Bar */}
                <div className="mb-6 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FiSearch className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search returns..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-colors"
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 min-h-[300px]">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-3"></div>
                        <p className="text-gray-400 text-xs animate-pulse">Loading returns...</p>
                    </div>
                ) : (
                    <div className="min-h-[400px]">
                        {searchQuery ? (
                            <section className="animate-fade-in-up">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                                    Search Results ({filteredOrders.length})
                                </h3>
                                <ReturnsTable data={filteredOrders} emptyMsg={`No returns found matching "${searchQuery}"`} />
                            </section>
                        ) : (
                            <>
                                {/* Tabs */}
                                <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-6 max-w-md">
                                    <button
                                        onClick={() => setActiveTab('today')}
                                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'today'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        Today {todayReturns.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[9px]">{todayReturns.length}</span>}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('yesterday')}
                                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'yesterday'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        Yesterday {yesterdayReturns.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[9px]">{yesterdayReturns.length}</span>}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('previously')}
                                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'previously'
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        Previously
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="animate-fade-in-up">
                                    {activeTab === 'today' && (
                                        <ReturnsTable data={todayReturns} emptyMsg="No returns scheduled or completed for today." />
                                    )}

                                    {activeTab === 'yesterday' && (
                                        <ReturnsTable data={yesterdayReturns} emptyMsg="No returns found for yesterday." />
                                    )}

                                    {activeTab === 'previously' && (
                                        <ReturnsTable data={olderReturns} emptyMsg="No previous return history found." />
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
