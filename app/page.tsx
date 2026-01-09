"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, Timestamp, orderBy, limit } from "firebase/firestore";
import { UserAuth } from "../context/AuthContext";
import { db } from "../firebaseConfig";
import {
  FiClock,
  FiShoppingBag,
  FiArrowRight,
  FiCalendar,
  FiTruck,
  FiBox,
  FiCheckCircle,
  FiPlus
} from "react-icons/fi";

// Helper to format currency
const formatINR = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function Dashboard() {
  const { user, userProfile, currentStudio, loading: authLoading } = UserAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    revenue: 0,
    activeRentals: 0,
    todayDeliveries: 0,
    todayReturns: 0
  });
  const [todayTasks, setTodayTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!user && !authLoading) {
      router.push("/login");
      return;
    }

    if (user && currentStudio) {
      fetchDashboardData();
    } else if (user && !currentStudio && !authLoading) {
      // Fallback if no studio selected yet
      setLoading(false);
    }
  }, [user, currentStudio, authLoading, router]);

  const fetchDashboardData = async () => {
    try {
      if (!currentStudio?.studioId) return;

      const studioId = currentStudio.studioId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // 1. Fetch Orders Query
      // Ideally usage of 'active' status or checking dates
      const ordersRef = collection(db, "orders");
      const q = query(
        ordersRef,
        where("studioId", "==", studioId)
      );

      const querySnapshot = await getDocs(q);
      const orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // Calculate Stats
      let revenue = 0;
      let active = 0;
      let deliveries = 0;
      let returns = 0;
      const tasks: any[] = [];

      orders.forEach(order => {
        const startDate = order.startDate?.toDate ? order.startDate.toDate() : new Date(order.startDate);
        const endDate = order.endDate?.toDate ? order.endDate.toDate() : new Date(order.endDate);

        // Revenue (Simple calculation: sum of all active/completed orders for now, or this month)
        // For "Total Revenue", we typically sum everything. For "Monthly", we check date.
        // Let's do Monthly Revenue for better relevance
        if (startDate.getMonth() === today.getMonth() && startDate.getFullYear() === today.getFullYear()) {
          // Calculate Order Total
          const orderTotal = order.outfitItems?.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0) || 0;
          revenue += orderTotal;
        }

        // Active Rentals (Current date is between start and end)
        const now = new Date();
        if (now >= startDate && now <= endDate && order.status !== 'returned' && order.status !== 'cancelled') {
          active++;
        }

        // Today's Deliveries (Start Date is Today)
        if (startDate >= today && startDate < tomorrow) {
          deliveries++;
          tasks.push({
            type: 'delivery',
            customer: order.customerName,
            time: "All Day", // Placeholder as we don't have exact time yet
            id: order.id
          });
        }

        // Today's Returns (End Date is Today)
        if (endDate >= today && endDate < tomorrow) {
          returns++;
          tasks.push({
            type: 'return',
            customer: order.customerName,
            time: "All Day",
            id: order.id
          });
        }
      });

      setStats({
        revenue,
        activeRentals: active,
        todayDeliveries: deliveries,
        todayReturns: returns
      });
      setTodayTasks(tasks);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  if (authLoading || loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
        <div className="h-4 w-32 bg-gray-200 rounded"></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-8 animate-fade-in px-5 md:px-8 lg:px-12">

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {/* Revenue Card */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 transition-all duration-300 group">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform duration-300">
              <FiShoppingBag className="text-xl" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monthly Revenue</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-medium text-gray-900">{formatINR(stats.revenue)}</h3>
          </div>
        </div>

        {/* Active Rentals */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 transition-all duration-300 group">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform duration-300">
              <FiClock className="text-xl" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Rentals</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-medium text-gray-900">{stats.activeRentals}</h3>
            <span className="text-xs text-gray-400 font-medium">Orders</span>
          </div>
        </div>

        {/* Today's Deliveries */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 transition-all duration-300 group">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform duration-300">
              <FiTruck className="text-xl" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">To Deliver</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-medium text-gray-900">{stats.todayDeliveries}</h3>
            <span className="text-xs text-gray-400 font-medium">Today</span>
          </div>
        </div>

        {/* Today's Returns */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 transition-all duration-300 group">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 group-hover:scale-110 transition-transform duration-300">
              <FiCheckCircle className="text-xl" />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Returns Due</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-medium text-gray-900">{stats.todayReturns}</h3>
            <span className="text-xs text-gray-400 font-medium">Today</span>
          </div>
        </div>
      </div>

      {/* Action Center & Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">

        {/* Quick Actions */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 px-1">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <button onClick={() => router.push('/availability')} className="flex flex-col items-center justify-center p-6 bg-white border border-gray-100 rounded-2xl transition-all active:scale-95 group">
                <div className="h-12 w-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-3 group-hover:-translate-y-1 transition-transform">
                  <FiCalendar className="text-2xl" />
                </div>
                <span className="text-sm font-medium text-gray-700">Check Dates</span>
              </button>

              <button onClick={() => router.push('/outfits/add')} className="flex flex-col items-center justify-center p-6 bg-white border border-gray-100 rounded-2xl transition-all active:scale-95 group">
                <div className="h-12 w-12 bg-pink-50 rounded-2xl flex items-center justify-center text-pink-600 mb-3 group-hover:-translate-y-1 transition-transform">
                  <FiPlus className="text-2xl" />
                </div>
                <span className="text-sm font-medium text-gray-700">Add Outfit</span>
              </button>

              <button onClick={() => router.push('/outfits')} className="flex flex-col items-center justify-center p-6 bg-white border border-gray-100 rounded-2xl transition-all active:scale-95 group">
                <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-3 group-hover:-translate-y-1 transition-transform">
                  <FiBox className="text-2xl" />
                </div>
                <span className="text-sm font-medium text-gray-700">Inventory</span>
              </button>
            </div>
          </div>

          {/* Banner / Tip Idea - Keeping it clean for now */}
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 h-fit">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Today's Schedule</h3>
            <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
              {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            </span>
          </div>

          <div className="space-y-0 relative">
            {/* Timeline Line */}
            <div className="absolute left-[19px] top-2 bottom-4 w-0.5 bg-gray-100"></div>

            {todayTasks.length > 0 ? (
              todayTasks.map((task, idx) => (
                <div key={idx} className="relative pl-10 py-3 group cursor-pointer hover:bg-gray-50 rounded-lg transition-colors" onClick={() => router.push(`/orders/${task.id}`)}>
                  {/* Dot */}
                  <div className={`absolute left-3 top-5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${task.type === 'delivery' ? 'bg-emerald-500' : 'bg-orange-500'}`}></div>

                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{task.customer}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${task.type === 'delivery' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {task.type === 'delivery' ? 'Delivery' : 'Return'}
                      </span>
                      <span className="text-xs text-gray-400">{task.time}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400 font-medium">No deliveries or returns today.</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
