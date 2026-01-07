"use client";

import Link from "next/link";
import DashboardLayout from "../../components/DashboardLayout";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { format, addDays, startOfDay, endOfDay } from "date-fns";

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
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const fetchTomorrowsOrders = async () => {
      setLoading(true);
      try {
        const tomorrow = addDays(new Date(), 1);
        const startOfTomorrow = startOfDay(tomorrow);
        const endOfTomorrow = endOfDay(tomorrow);

        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("deliveryDate", ">=", startOfTomorrow),
          where("deliveryDate", "<=", endOfTomorrow)
          // Add more conditions if necessary, e.g., status is not 'completed' or 'cancelled'
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
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading tomorrow's orders...</p>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl p-4">
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Tomorrow's Preparation View</h1>

          {loading ? (
            <p className="text-center text-gray-600">Loading tomorrow's orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-center text-lg text-gray-700">No orders scheduled for tomorrow.</p>
          ) : (
            <div className="space-y-6">
              {orders.map((order) => (
                <div key={order.id} className="p-6 rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
                  <h2 className="text-2xl font-bold text-gray-700 mb-3">Order for {order.customerName}</h2>
                  <p className="text-gray-600 mb-2"><span className="font-semibold">Mobile:</span> {order.customerMobile}</p>
                  <p className="text-gray-600 mb-4"><span className="font-semibold">Status:</span> <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium leading-5 text-blue-800 capitalize">{order.status}</span></p>
                  <h3 className="text-xl font-semibold text-gray-700 mb-3">Outfits to Prepare:</h3>
                  <ul className="list-disc space-y-2 pl-6">
                    {order.outfitItems.map((item, index) => (
                      <li key={index} className="text-gray-700">
                        <span className="font-medium">{item.designName}</span> (<span className="text-gray-600">{item.designCode}</span>) - Size: <span className="font-medium">{item.size}</span> (Rent: ₹{item.rentalPrice.toFixed(2)})
                        {item.note && <span className="ml-2 text-sm italic text-gray-500"> (Note: {item.note})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

