"use client";
import React, { useState } from "react";
import { collection, getDocs, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { FiTrash2, FiAlertTriangle, FiCheckCircle, FiLoader, FiArrowLeft } from "react-icons/fi";
import { useRouter } from "next/navigation";

export default function AdminResetPage() {
    const router = useRouter();
    const [confirmText, setConfirmText] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>("");
    const [logs, setLogs] = useState<string[]>([]);

    const EXPECTED_TEXT = "DELETE ALL DATA";

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const handleReset = async () => {
        if (confirmText !== EXPECTED_TEXT) return;
        setLoading(true);
        setStatus("starting");
        setLogs([]);
        addLog("Starting system reset...");

        try {
            // 1. Delete Outfits
            addLog("Fetching outfits...");
            const outfitsRef = collection(db, "outfits");
            const outfitsSnap = await getDocs(outfitsRef);
            addLog(`Found ${outfitsSnap.size} outfits to delete.`);

            const batchSize = 400; // Batch limit is 500
            let batch = writeBatch(db);
            let count = 0;
            let totalDeleted = 0;

            for (const docSnap of outfitsSnap.docs) {
                batch.delete(doc(db, "outfits", docSnap.id));
                count++;
                if (count >= batchSize) {
                    await batch.commit();
                    totalDeleted += count;
                    addLog(`Deleted batch of ${count} outfits...`);
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if (count > 0) {
                await batch.commit();
                totalDeleted += count;
                addLog(`Deleted final batch of ${count} outfits.`);
            }
            addLog("✅ All outfits deleted.");


            // 2. Delete Orders
            addLog("Fetching orders...");
            const ordersRef = collection(db, "orders");
            const ordersSnap = await getDocs(ordersRef);
            addLog(`Found ${ordersSnap.size} orders to delete.`);

            batch = writeBatch(db);
            count = 0;
            totalDeleted = 0;

            for (const docSnap of ordersSnap.docs) {
                batch.delete(doc(db, "orders", docSnap.id));
                count++;
                if (count >= batchSize) {
                    await batch.commit();
                    totalDeleted += count;
                    addLog(`Deleted batch of ${count} orders...`);
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if (count > 0) {
                await batch.commit();
                totalDeleted += count;
                addLog(`Deleted final batch of ${count} orders.`);
            }
            addLog("✅ All orders deleted.");

            // 3. Clear Local Storage (Cache)
            if (typeof window !== 'undefined') {
                localStorage.clear();
                addLog("✅ Local storage cache cleared.");
            }

            setStatus("success");
            setConfirmText("");

        } catch (error: any) {
            console.error(error);
            setStatus("error");
            addLog(`❌ ERROR: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="w-full px-5 md:px-8 lg:px-12 py-12">
                <div className="bg-white rounded-xl shadow-lg border border-red-100 overflow-hidden">
                    <div className="bg-red-50 p-6 border-b border-red-100 flex items-center gap-4">
                        <div className="p-3 bg-red-100 rounded-full text-red-600">
                            <FiAlertTriangle className="w-8 h-8" />
                        </div>
                        <button onClick={() => router.back()} className="p-2 -ml-2 text-red-400 hover:text-red-900 rounded-full hover:bg-red-100 transition-colors">
                            <FiArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-red-900">Danger Zone: System Reset</h1>
                            <p className="text-red-700 text-sm font-bold">Permanently delete all business data.</p>
                        </div>
                    </div>

                    <div className="p-8 space-y-6">
                        <p className="text-gray-600 leading-relaxed">
                            This action will <strong>permanently delete</strong>:
                            <ul className="list-disc pl-5 mt-2 space-y-1 font-medium text-gray-800">
                                <li>All Outfits (Inventory)</li>
                                <li>All Orders (Bookings, Histories)</li>
                                <li>All associated Images and Metadata</li>
                            </ul>
                        </p>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-medium text-gray-500">
                            <strong>Note:</strong> Firebase Authentication users (logins) are NOT deleted. You will remain logged in.
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">
                                Type <span className="font-mono text-red-600 bg-red-50 px-1 rounded">{EXPECTED_TEXT}</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={EXPECTED_TEXT}
                                disabled={loading || status === 'success'}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none font-bold text-gray-900 placeholder-gray-300"
                            />
                        </div>

                        {status === 'success' ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800 animate-in fade-in">
                                <FiCheckCircle className="w-6 h-6" />
                                <div>
                                    <p className="font-bold">System successfully reset!</p>
                                    <p className="text-sm">You can now start fresh.</p>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleReset}
                                disabled={loading || confirmText !== EXPECTED_TEXT}
                                className={`w-full py-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all
                                    ${confirmText === EXPECTED_TEXT
                                        ? "bg-red-600 hover:bg-red-700 shadow-lg hover:shadow-red-500/30 cursor-pointer"
                                        : "bg-gray-300 cursor-not-allowed"}`}
                            >
                                {loading ? (
                                    <>
                                        <FiLoader className="animate-spin" /> Deleting Data...
                                    </>
                                ) : (
                                    <>
                                        <FiTrash2 /> Confirm System Wipe
                                    </>
                                )}
                            </button>
                        )}

                        {/* Logs Console */}
                        {logs.length > 0 && (
                            <div className="mt-4 bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto">
                                {logs.map((log, i) => (
                                    <div key={i} className="mb-1 border-b border-gray-800 pb-1 last:border-0">{log}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
