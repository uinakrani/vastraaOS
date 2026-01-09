"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { UserAuth } from "../../context/AuthContext";

interface OutfitItem {
  designCode: string;
  designName: string;
  size: string;
  rentalPrice: number;
  note?: string;
}

interface Order {
  id: string;
  customerName: string;
  customerMobile: string;
  outfitItems: OutfitItem[];
  status: string;
  deliveryDate?: any; // Firebase Timestamp or Date object
}

export default function TomorrowPreparation() {
  const { currentStudio } = UserAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const fetchTomorrowsOrders = async () => {
      setLoading(true);
      try {
        const tomorrow = addDays(new Date(), 1);
        const startOfTomorrow = startOfDay(tomorrow);
        const endOfTomorrow = endOfDay(tomorrow);

        if (!currentStudio?.studioId) return;

        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("studioId", "==", currentStudio.studioId),
          where("deliveryDate", ">=", startOfTomorrow),
          where("deliveryDate", "<=", endOfTomorrow)
        );
        const querySnapshot = await getDocs(q);
        const ordersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[];
        setOrders(ordersData);
      } catch (error) {
        console.error("Error fetching tomorrow's orders: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTomorrowsOrders();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-10 w-10 bg-gray-200 rounded-full mb-4"></div>
          <p className="text-gray-400 font-bold text-sm">Preparing tomorrow's view...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full px-5 md:px-8 lg:px-12 py-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Tomorrow's Preparation</h1>

          {orders.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-lg font-bold text-gray-400">No orders scheduled for tomorrow.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => (
                <div key={order.id} className="p-6 rounded-3xl border border-gray-100 bg-gray-50/50 shadow-sm">
                  <h2 className="text-xl font-extrabold text-gray-900 mb-2">{order.customerName}</h2>
                  <p className="text-sm font-bold text-gray-500 mb-4">{order.customerMobile}</p>

                  <div className="mb-4">
                    <span className="inline-flex rounded-lg bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-600 uppercase tracking-wider">{order.status}</span>
                  </div>

                  <h3 className="text-sm font-extrabold text-gray-400 uppercase tracking-widest mb-3">Outfits to Prepare</h3>
                  <ul className="space-y-3">
                    {order.outfitItems.map((item, index) => (
                      <li key={index} className="flex flex-col p-3 bg-white rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-start">
                          <span className="font-extrabold text-gray-900">{item.designName}</span>
                          <span className="text-[10px] font-extrabold bg-gray-100 px-2 py-0.5 rounded text-gray-500 uppercase tracking-tighter">{item.designCode}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-indigo-600">Size: {item.size}</span>
                          {item.note && <span className="text-xs font-medium text-gray-400 italic">• {item.note}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
