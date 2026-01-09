"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { FiArrowLeft } from "react-icons/fi";
import { UserAuth } from "../../context/AuthContext";

interface OutfitItem {
  designCode: string;
  designName: string;
  size: string;
  rentalPrice: number;
  note?: string;
  // Add fields for damage assessment if needed
  damage?: string;
  damageCharge?: number;
}

interface Order {
  id: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string;
  advancePayment: number;
  outfitItems: OutfitItem[];
  status: string;
  // Add other fields as necessary
}

export default function OutfitReturnProcess() {
  const { currentStudio } = UserAuth();
  const router = useRouter();
  const [mobileNumber, setMobileNumber] = useState("");
  const [foundOrders, setFoundOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [damageDetails, setDamageDetails] = useState<{ [key: number]: { damage: string; charge: number } }>({});

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFoundOrders([]);
    setSelectedOrder(null);
    setDamageDetails({});

    try {
      if (!currentStudio?.studioId) return;
      const ordersRef = collection(db, "orders");
      const normalizedMobile = mobileNumber.startsWith("+91") ? mobileNumber : "+91" + mobileNumber;
      const q = query(
        ordersRef,
        where("studioId", "==", currentStudio.studioId),
        where("customerMobile", "==", normalizedMobile)
      );
      const querySnapshot = await getDocs(q);

      const ordersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[];
      setFoundOrders(ordersData);

      if (ordersData.length === 0) {
        alert("No orders found for this mobile number.");
      }
    } catch (error) {
      console.error("Error searching orders: ", error);
      alert("Error searching orders.");
    }
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    // Initialize damage details for each outfit item
    const initialDamageDetails: { [key: number]: { damage: string; charge: number } } = {};
    order.outfitItems.forEach((_, index) => {
      initialDamageDetails[index] = { damage: "", charge: 0 };
    });
    setDamageDetails(initialDamageDetails);
  };

  const handleDamageChange = (itemIndex: number, field: "damage" | "charge", value: string | number) => {
    setDamageDetails((prev) => ({
      ...prev,
      [itemIndex]: {
        ...prev[itemIndex],
        [field]: value,
      },
    }));
  };

  const handleMarkAsDone = async () => {
    if (!selectedOrder) return;

    try {
      const orderRef = doc(db, "orders", selectedOrder.id);
      const updatedOutfitItems = selectedOrder.outfitItems.map((item, index) => ({
        ...item,
        damage: damageDetails[index]?.damage || "",
        damageCharge: damageDetails[index]?.charge || 0,
      }));

      await updateDoc(orderRef, {
        status: "DONE", // Or 'Completed' as per spec
        outfitItems: updatedOutfitItems,
        // Potentially add a 'returnedAt' timestamp
      });
      alert("Order marked as DONE and updated with return details!");
      router.push("/orders"); // Redirect back to orders list or another appropriate page
    } catch (error) {
      console.error("Error marking order as DONE: ", error);
      alert("Error marking order as DONE.");
    }
  };

  return (
    <>
      <div className="w-full px-5 md:px-8 lg:px-12 py-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm mb-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
              <FiArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-800">Outfit Return Process</h1>
          </div>

          <div className="mb-8 p-6 rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-700 mb-5">Search Order by Customer Mobile</h2>
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row space-y-3 sm:space-x-3 sm:space-y-0">
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="Enter customer mobile number"
                className="flex-grow rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                disabled={loading}
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </form>
          </div>

          {foundOrders.length > 0 && !selectedOrder && (
            <div className="mb-8 p-6 rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-700 mb-5">Select Order</h2>
              <div className="space-y-4">
                {foundOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className="p-4 rounded-md border border-gray-300 bg-white shadow-sm cursor-pointer transition-all duration-200 hover:bg-gray-100 hover:shadow-md"
                  >
                    <p className="text-lg font-medium text-gray-800">Customer: {order.customerName}</p>
                    <p className="text-base text-gray-600">Mobile: {order.customerMobile}</p>
                    <p className="text-sm text-gray-500">Status: <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium leading-5 text-blue-800 capitalize">{order.status}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedOrder && (
            <div className="p-6 rounded-lg bg-white shadow-md">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Order Details for Return</h2>
              <div className="mb-6 space-y-2 text-gray-700">
                <p><strong className="font-semibold">Customer Name:</strong> {selectedOrder.customerName}</p>
                <p><strong className="font-semibold">Mobile:</strong> {selectedOrder.customerMobile}</p>
                <p><strong className="font-semibold">Address:</strong> {selectedOrder.customerAddress}</p>
                <p><strong className="font-semibold">Status:</strong> <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium leading-5 text-green-800 capitalize">{selectedOrder.status}</span></p>
              </div>

              <h3 className="text-xl font-semibold text-gray-700 mb-5">Returned Outfits:</h3>
              <div className="space-y-6">
                {selectedOrder.outfitItems.map((item, index) => (
                  <div key={index} className="p-4 rounded-md border border-gray-200 bg-gray-50 shadow-sm">
                    <p className="text-lg font-medium text-gray-800 mb-3">{item.designName} <span className="text-gray-600">({item.designCode})</span> - Size: {item.size}</p>
                    <p className="text-base text-gray-700 mb-4">Rental Price: ₹{item.rentalPrice.toFixed(2)}</p>
                    {item.note && <p className="text-sm italic text-gray-500 mb-4">Note: {item.note}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`damage-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Damage Description</label>
                        <input
                          type="text"
                          id={`damage-${index}`}
                          value={damageDetails[index]?.damage || ""}
                          onChange={(e) => handleDamageChange(index, "damage", e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                          placeholder="e.g., Small tear on sleeve"
                        />
                      </div>
                      <div>
                        <label htmlFor={`charge-${index}`} className="block text-sm font-medium text-gray-700 mb-1">Additional Charge (INR)</label>
                        <input
                          type="number"
                          id={`charge-${index}`}
                          value={damageDetails[index]?.charge || 0}
                          onChange={(e) => handleDamageChange(index, "charge", parseFloat(e.target.value) || 0)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleMarkAsDone}
                className="mt-8 w-full rounded-md bg-green-600 py-3 text-lg font-semibold text-white shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Mark Order as DONE
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
