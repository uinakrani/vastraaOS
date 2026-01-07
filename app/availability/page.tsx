"use client";

import React, { useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { FiCalendar, FiSearch, FiCheckCircle, FiXCircle } from 'react-icons/fi';

export default function AvailabilityPage() {
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

    return (
        <DashboardLayout>
            <div className="max-w-md mx-auto pb-20">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">Check Availability</h1>
                    <p className="text-gray-500 text-sm">Find out if an outfit is available for your dates.</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-col space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>

                        <button className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl shadow-md hover:bg-indigo-700 transition-colors flex items-center justify-center">
                            <FiSearch className="mr-2" />
                            Check Now
                        </button>
                    </div>
                </div>

                <div className="text-center py-10">
                    <div className="bg-indigo-50 inline-flex p-4 rounded-full mb-4">
                        <FiCalendar className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-gray-500">Enter a date and search to see what's available.</p>
                </div>
            </div>
        </DashboardLayout>
    );
}
