"use client";

import Link from "next/link";
import DashboardLayout from "../../components/DashboardLayout";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export default function WeeklyOverview() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [designsOnRentCount, setDesignsOnRentCount] = useState(0);

  const fetchDesignsOnRent = async () => {
    try {
      const ordersRef = collection(db, "orders");
      // Query for orders that are not 'DONE' or 'Completed'
      const q = query(ordersRef, where("status", "not-in", ["DONE", "Completed"]));
      const querySnapshot = await getDocs(q);
      let count = 0;
      querySnapshot.forEach((doc) => {
        const orderData = doc.data();
        if (orderData.outfits && Array.isArray(orderData.outfits)) {
          count += orderData.outfits.length;
        }
      });
      setDesignsOnRentCount(count);
    } catch (error) {
      console.error("Error fetching designs on rent: ", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDesignsOnRent();
    }
  }, [isAuthenticated]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, you would compare this to a securely stored hash
    if (password === "admin123") { // Placeholder password
      setIsAuthenticated(true);
    } else {
      alert("Incorrect password");
      setPassword("");
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-8 text-4xl font-extrabold text-gray-800">Weekly Overview</h1>

        {!isAuthenticated ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <p className="text-lg text-gray-700">Enter password to access the weekly overview:</p>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-indigo-600 py-3 text-lg font-semibold text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Unlock Overview
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <p className="text-lg text-gray-700">This section provides a summary of key metrics for the current week.</p>
            
            <div className="rounded-md border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <h3 className="mb-3 text-2xl font-bold text-gray-700">Current Week's Rentals</h3>
              <p className="text-xl text-gray-800">Number of designs currently on rent: <span className="font-semibold text-indigo-600">{designsOnRentCount}</span></p>
              {/* More detailed weekly overview content can be added here, e.g., charts, specific orders, etc. */}
            </div>

            <p className="text-gray-600">Further detailed analytics and trends for the week can be displayed here.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

