"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { UserAuth } from "../../context/AuthContext";

export default function WeeklyOverview() {
  const { currentStudio } = UserAuth();
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [designsOnRentCount, setDesignsOnRentCount] = useState(0);

  const fetchDesignsOnRent = async () => {
    try {
      if (!currentStudio?.studioId) return;
      const ordersRef = collection(db, "orders");
      // Query for orders that are not 'DONE' or 'Completed' for THIS studio
      const q = query(
        ordersRef,
        where("studioId", "==", currentStudio.studioId),
        where("status", "not-in", ["DONE", "Completed"])
      );
      const querySnapshot = await getDocs(q);
      let count = 0;
      querySnapshot.forEach((doc) => {
        const orderData = doc.data();
        if (orderData.outfitItems && Array.isArray(orderData.outfitItems)) {
          count += orderData.outfitItems.length;
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
    if (password === "admin123") {
      setIsAuthenticated(true);
    } else {
      alert("Incorrect password");
      setPassword("");
    }
  };

  return (
    <>
      <div className="w-full px-5 md:px-8 lg:px-12 py-6">
        <div className="rounded-[2.5rem] bg-white p-10 border border-gray-100 shadow-sm">
          <h1 className="mb-8 text-3xl font-extrabold text-gray-900">Weekly Overview</h1>

          {!isAuthenticated ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <p className="text-lg font-medium text-gray-700">Enter password to access the weekly overview:</p>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="Enter password"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full btn-slate py-3 text-lg font-bold"
              >
                Unlock Overview
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <p className="text-lg font-medium text-gray-700">This section provides a summary of key metrics for the current week.</p>

              <div className="rounded-3xl border border-gray-100 bg-gray-50/50 p-6">
                <h3 className="mb-3 text-xl font-bold text-gray-900">Current Week's Rentals</h3>
                <p className="text-lg font-medium text-gray-800">Number of designs currently on rent: <span className="font-extrabold text-indigo-600">{designsOnRentCount}</span></p>
              </div>

              <p className="text-gray-500 font-medium italic">Further detailed analytics and trends for the week can be displayed here.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
