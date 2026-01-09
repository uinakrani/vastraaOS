"use client";

import { useRouter } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";

export default function OrderReturn() {
    const router = useRouter();

    return (
        <>
            <div className="w-full px-5 md:px-8 lg:px-12 py-6">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors">
                        <FiArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-3xl font-bold text-gray-800">Return Order</h1>
                </div>
                <p className="text-gray-600 font-medium ml-11">Search for customers to process returns.</p>

                {/* Search Placeholder */}
                <div className="mt-8 ml-11">
                    <input
                        type="text"
                        placeholder="Search by customer mobile..."
                        className="block w-full max-w-md rounded-xl border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-4 border font-medium bg-white"
                    />
                </div>
            </div>
        </>
    );
}

