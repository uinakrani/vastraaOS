"use client";

import DashboardLayout from "../../../components/DashboardLayout";

export default function OrderReturn() {
    return (
        <DashboardLayout>
            <div className="mx-auto max-w-4xl p-4">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Return Order</h1>
                <p className="text-gray-600">Search for customers to process returns.</p>

                {/* Search Placeholder */}
                <div className="mt-4">
                    <input
                        type="text"
                        placeholder="Search by customer mobile..."
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}
