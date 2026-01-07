"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig"; // Adjust path as needed
import DashboardLayout from "../../components/DashboardLayout";
import { formatINR } from "../../utils/format";
import { isSameDay, addDays, startOfDay, format, differenceInDays } from "date-fns";
import { FiCalendar, FiUser, FiPhone, FiLayers, FiXCircle, FiClock, FiDollarSign, FiSearch, FiAlertTriangle, FiX } from "react-icons/fi";
import { useToast } from "../../components/ToastProvider";
import { logOrderActivity } from "../../lib/activityLogger";
import { motion, AnimatePresence } from "framer-motion";

export default function OrdersList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [todayOrders, setTodayOrders] = useState<any[]>([]);
  const [tomorrowOrders, setTomorrowOrders] = useState<any[]>([]);
  const [otherOrders, setOtherOrders] = useState<any[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow' | 'others' | 'cancelled'>('today');

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);

  // Cancel Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

  // Selected Order for Detail View
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const { showToast } = useToast();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const ordersCollectionRef = collection(db, "orders");
      const q = query(ordersCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const ordersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Filter logic
      const today = new Date();
      const tomorrow = addDays(today, 1);

      const todayList = ordersData.filter((order: any) => {
        if (!order.startDate || (order.status || '').toLowerCase() === 'cancelled' || (order.status || '').toLowerCase() === 'returned') return false;
        const start = order.startDate.toDate ? order.startDate.toDate() : new Date(order.startDate);
        return isSameDay(start, today);
      });

      const tomorrowList = ordersData.filter((order: any) => {
        if (!order.startDate || (order.status || '').toLowerCase() === 'cancelled' || (order.status || '').toLowerCase() === 'returned') return false;
        const start = order.startDate.toDate ? order.startDate.toDate() : new Date(order.startDate);
        return isSameDay(start, tomorrow);
      });

      const otherList = ordersData.filter((order: any) => {
        if (!order.startDate || (order.status || '').toLowerCase() === 'cancelled' || (order.status || '').toLowerCase() === 'returned') return false;
        const start = order.startDate.toDate ? order.startDate.toDate() : new Date(order.startDate);
        return !isSameDay(start, today) && !isSameDay(start, tomorrow);
      });

      const cancelledList = ordersData.filter((order: any) => (order.status || '').toLowerCase() === 'cancelled');

      setOrders(ordersData);
      setTodayOrders(todayList);
      setTomorrowOrders(tomorrowList);
      setOtherOrders(otherList);
      setCancelledOrders(cancelledList);
    } catch (error) {
      console.error("Error fetching orders: ", error);
    } finally {
      setLoading(false);
    }
  };

  // Search Filtering Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredOrders([]);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();

    const results = orders.filter(order => {
      // Customer Info
      if (order.customerName?.toLowerCase().includes(lowerQuery)) return true;
      if (order.customerMobile?.includes(lowerQuery)) return true;

      // Date (basic string check)
      const startStr = order.startDate?.toDate ? order.startDate.toDate().toDateString().toLowerCase() : "";
      if (startStr.includes(lowerQuery)) return true;

      // Outfit Info
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

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelOrder = (orderId: string) => {
    // If inside detail view, we might need to close it first if we want strict flow,
    // but allowing cancel from detail is fine.
    setOrderToCancel(orderId);
    setIsCancelModalOpen(true);
  };

  const confirmCancelOrder = async () => {
    if (!orderToCancel) return;

    try {
      await updateDoc(doc(db, "orders", orderToCancel), {
        status: "cancelled"
      });

      await logOrderActivity(orderToCancel, 'CANCELLED', 'Order cancelled');

      showToast("Order cancelled successfully.", "success");
      fetchOrders(); // Refresh list

      // Close detail view if the cancelled order was selected
      if (selectedId === orderToCancel) {
        setSelectedId(null);
        setSelectedOrder(null);
      }

    } catch (error) {
      console.error("Error cancelling order:", error);
      showToast("Failed to cancel order.", "error");
    } finally {
      setIsCancelModalOpen(false);
      setOrderToCancel(null);
    }
  };

  const calculateTotalAmount = (outfitItems: any[]) => {
    return outfitItems?.reduce((sum, item) => sum + (Number(item.rentalPrice) || 0), 0) || 0;
  };

  const calculateDuration = (start: any, end: any) => {
    if (!start || !end) return "-";
    const startDate = start.toDate ? start.toDate() : new Date(start);
    const endDate = end.toDate ? end.toDate() : new Date(end);
    const days = differenceInDays(endDate, startDate) + 1; // Inclusive
    return `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} (${days}d)`;
  };

  // Simplified List Component using Framer Motion
  const OrdersListContent = ({ data, emptyMessage }: { data: any[], emptyMessage: string }) => {
    if (data.length === 0) {
      return (
        <div className="bg-gray-50 p-8 text-center flex flex-col items-center justify-center min-h-[200px] rounded-xl border border-dashed border-gray-200">
          <FiCalendar className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-gray-400 font-medium text-xs">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((order) => {
          const totalAmount = calculateTotalAmount(order.outfitItems);
          const outfitCount = order.outfitItems?.length || 0;
          const firstOutfitName = order.outfitItems?.[0]?.designName || order.outfitItems?.[0]?.designCode || "Outfit";
          const displayOutfit = outfitCount > 1 ? `${firstOutfitName} +${outfitCount - 1} more` : firstOutfitName;

          return (
            <motion.div
              key={order.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setSelectedId(order.id); setSelectedOrder(order); }}
              className="bg-white rounded-xl border border-gray-200 p-3 cursor-pointer hover:border-indigo-300 transition-colors group relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col">
                  <h3 className="text-sm font-bold text-gray-900 leading-tight">{order.customerName}</h3>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">{order.customerMobile}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide
                      ${order.status === "pending" ? "bg-amber-100 text-amber-800"
                    : order.status === "processing" ? "bg-blue-100 text-blue-800"
                      : order.status === "cancelled" ? "bg-red-100 text-red-800"
                        : "bg-green-100 text-green-800"
                  }`}>
                  {order.status}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2 bg-gray-50 p-1.5 rounded-lg">
                <FiClock className="text-gray-400 w-3 h-3" />
                <span className="text-[10px] font-medium text-gray-600">{calculateDuration(order.startDate, order.endDate)}</span>
              </div>

              <div className="flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Includes</span>
                  <span className="text-xs font-medium text-gray-800 flex items-center gap-1">
                    <FiLayers className="w-3 h-3 text-indigo-500" />
                    {displayOutfit}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase text-gray-400 font-bold tracking-wider mb-0.5">Rent</span>
                  <span className="text-sm font-bold text-gray-900">{formatINR(totalAmount)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout>
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 transition-all">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-tight">Orders</h1>
              <p className="text-xs text-gray-500 font-medium">Daily Rentals</p>
            </div>
          </div>

          <Link href="/orders/add" className="flex items-center justify-center w-9 h-9 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-bold text-xl flex-shrink-0" title="Create Order">
            <span>+</span>
          </Link>
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
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-colors"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-6 max-w-md">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 flex items-center justify-center py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'today'
              ? 'bg-white text-indigo-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
          >
            Today {todayOrders.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[9px]">{todayOrders.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('tomorrow')}
            className={`flex-1 flex items-center justify-center py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'tomorrow'
              ? 'bg-white text-indigo-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
          >
            Tomorrow {tomorrowOrders.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[9px]">{tomorrowOrders.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('others')}
            className={`flex-1 flex items-center justify-center py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'others'
              ? 'bg-white text-indigo-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
          >
            Others
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`flex-1 flex items-center justify-center py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'cancelled'
              ? 'bg-white text-indigo-600'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
          >
            Cancelled {cancelledOrders.length > 0 && <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[9px]">{cancelledOrders.length}</span>}
          </button>
        </div>


        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-3"></div>
            <p className="text-gray-400 text-xs animate-pulse">Loading...</p>
          </div>
        ) : (
          <div className="min-h-[400px]">
            {searchQuery ? (
              <section className="animate-fade-in-up">
                <OrdersListContent data={filteredOrders} emptyMessage={`No orders found matching "${searchQuery}"`} />
              </section>
            ) : (
              <>
                {/* Today's Orders */}
                {activeTab === 'today' && (
                  <section className="animate-fade-in-up">
                    <OrdersListContent data={todayOrders} emptyMessage="No orders starting today." />
                  </section>
                )}

                {/* Tomorrow's Orders */}
                {activeTab === 'tomorrow' && (
                  <section className="animate-fade-in-up">
                    <OrdersListContent data={tomorrowOrders} emptyMessage="No orders starting tomorrow." />
                  </section>
                )}

                {/* All Others Table */}
                {activeTab === 'others' && (
                  <section className="animate-fade-in-up">
                    <OrdersListContent data={otherOrders} emptyMessage="No other active orders." />
                  </section>
                )}

                {/* Cancelled Orders Table */}
                {activeTab === 'cancelled' && (
                  <section className="animate-fade-in-up">
                    <OrdersListContent data={cancelledOrders} emptyMessage="No cancelled orders found." />
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Detail Overlay using Framer Motion */}
      <AnimatePresence>
        {selectedId && selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => { setSelectedId(null); setSelectedOrder(null); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 cursor-grab active:cursor-grabbing">
                <div>
                  <motion.h2 className="text-xl font-bold text-gray-900">{selectedOrder.customerName}</motion.h2>
                  <p className="text-sm text-gray-500 font-medium">{selectedOrder.customerMobile}</p>
                </div>
                <button onClick={() => { setSelectedId(null); setSelectedOrder(null); }} className="p-2 bg-white rounded-full text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
                {/* Status & Date */}
                <div className="flex gap-4 mb-6">
                  <div className="flex-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <span className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider block mb-1">Duration</span>
                    <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
                      <FiClock /> {calculateDuration(selectedOrder.startDate, selectedOrder.endDate)}
                    </div>
                  </div>
                  <div className="flex-1 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                    <span className="text-[10px] uppercase text-emerald-600 font-bold tracking-wider block mb-1">Status</span>
                    <div className={`font-bold text-sm uppercase ${selectedOrder.status === 'cancelled' ? 'text-red-600' : 'text-emerald-700'
                      }`}>
                      {selectedOrder.status}
                    </div>
                  </div>
                </div>

                {/* Outfits List */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FiLayers className="text-gray-400" /> Outfits ({selectedOrder.outfitItems?.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedOrder.outfitItems?.map((item: any, i: number) => (
                      <div key={i} className="flex gap-4 p-3 rounded-xl border border-gray-100 bg-white">
                        {/* Image or Placeholder */}
                        <div className="w-16 h-20 bg-gray-100 rounded-lg flex-shrink-0 relative overflow-hidden">
                          {/* Ideally checking item.imageUrl if saved, else simplistic placeholder */}
                          <div className="absolute inset-0 flex items-center justify-center text-gray-300 font-bold text-xl">
                            {item.designCode?.slice(0, 2)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold text-gray-900 text-sm truncate">{item.designName || "Outfit"}</h4>
                              <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded mt-1">{item.designCode}</span>
                            </div>
                            <span className="font-bold text-gray-900 text-sm">{formatINR(Number(item.rentalPrice) || 0)}</span>
                          </div>
                          {item.size && <p className="text-xs text-gray-500 mt-1">Size: {item.size}</p>}
                          {item.notes && (
                            <div className="mt-2 text-xs bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-100 italic">
                              "{item.notes}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Info */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FiDollarSign className="text-gray-400" /> Payment Details
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Total Rent</span>
                      <span className="font-bold text-gray-900">{formatINR(calculateTotalAmount(selectedOrder.outfitItems))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Advance Paid</span>
                      <span className="font-bold text-emerald-600">
                        {selectedOrder.advanceAmount ? formatINR(Number(selectedOrder.advanceAmount)) : ",10"}
                      </span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-base font-bold">
                      <span className="text-gray-900">Balance Due</span>
                      <span className="text-red-600">
                        {formatINR(calculateTotalAmount(selectedOrder.outfitItems) - (Number(selectedOrder.advanceAmount) || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                <Link href={`/orders/${selectedOrder.id}`} className="flex-1 py-3 text-center bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                  Full Edit
                </Link>
                {selectedOrder.status !== 'cancelled' && (
                  <button onClick={() => handleCancelOrder(selectedOrder.id)} className="flex-1 py-3 text-center bg-white border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors">
                    Cancel Order
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      {
        isCancelModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 animate-scale-up border border-gray-100">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <FiAlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Order?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  Are you sure you want to cancel this order? This action cannot be undone.
                </p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setIsCancelModalOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors text-sm"
                  >
                    No, Keep It
                  </button>
                  <button
                    onClick={confirmCancelOrder}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors text-sm"
                  >
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </DashboardLayout >
  );
}
