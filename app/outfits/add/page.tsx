"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { FiUploadCloud, FiX, FiCheck, FiCamera, FiChevronLeft, FiPlus, FiMinus, FiImage, FiGitMerge, FiArrowLeft } from "react-icons/fi";
import { UserAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";
import imageCompression from 'browser-image-compression';

const availableSizes = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];

export default function AddOutfit() {
    const { user, loading: authLoading, currentStudio } = UserAuth();
    const router = useRouter();
    const { showToast } = useToast();

    // Form State
    const [outfitName, setOutfitName] = useState("");
    const [outfitCode, setOutfitCode] = useState("");
    const [rentalPrice, setRentalPrice] = useState("");
    const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
    const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: number }>({});
    const [customSizeInput, setCustomSizeInput] = useState("");

    // UI State
    const [activeTab, setActiveTab] = useState("single");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<string>("");
    const [browserOnline, setBrowserOnline] = useState<boolean>(true);

    // Image Upload State
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Validation State
    const [codeError, setCodeError] = useState("");

    // Monitor browser online/offline status
    useEffect(() => {
        const handleOnline = () => setBrowserOnline(true);
        const handleOffline = () => setBrowserOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setBrowserOnline(navigator.onLine);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showToast("Image size should be less than 5MB", "error");
                return;
            }
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase().trim();
        setOutfitCode(value);
        if (value) setCodeError("");
    };

    const handleSizeToggle = (size: string) => {
        setSelectedSizes((prev) => {
            if (prev.includes(size)) {
                // Remove size
                const newSizes = prev.filter(s => s !== size);
                const newQuantities = { ...sizeQuantities };
                delete newQuantities[size];
                setSizeQuantities(newQuantities);
                return newSizes;
            } else {
                // Add size
                setSizeQuantities(q => ({ ...q, [size]: 1 }));
                return [...prev, size];
            }
        });
    };

    const handleQuantityChange = (size: string, delta: number) => {
        setSizeQuantities(prev => {
            const current = prev[size] || 1;
            const newVal = Math.max(1, current + delta);
            return { ...prev, [size]: newVal };
        });
    };

    const handleAddCustomSize = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (customSizeInput.trim()) {
            const newSize = customSizeInput.trim().toUpperCase();
            if (!selectedSizes.includes(newSize)) {
                setSelectedSizes(prev => [...prev, newSize]);
                setSizeQuantities(prev => ({ ...prev, [newSize]: 1 }));
                setCustomSizeInput("");
                showToast(`Added size ${newSize}`, "success");
            } else {
                showToast("Size already added", "error");
            }
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!outfitName || !outfitCode || !rentalPrice || selectedSizes.length === 0) {
            showToast("Please fill all fields and select a size", "error");
            return;
        }

        if (!browserOnline) {
            showToast("You are offline", "error");
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus("Saving...");

        try {
            // Upload Strategy: Convert to Base64 to bypass Storage CORS issues
            let finalImageUrl = "";
            if (imageFile) {
                setSubmitStatus("Compressing Image...");

                // Very aggressive compression for Firestore 1MB document limit
                const options = {
                    maxSizeMB: 0.2, // Aim for ~200kb
                    maxWidthOrHeight: 800,
                    useWebWorker: true,
                    initialQuality: 0.6
                };

                try {
                    const compressedFile = await imageCompression(imageFile, options);
                    setSubmitStatus("Processing...");

                    // Convert compressed blob to Base64 string
                    finalImageUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(compressedFile);
                    });
                } catch (err) {
                    console.error("Image processing failed:", err);
                    showToast("Image compression failed. Use a smaller photo.", "error");
                    setIsSubmitting(false);
                    return;
                }
            }

            // Save Data
            setSubmitStatus("Finalizing...");
            const finalPrice = parseFloat(rentalPrice.replace(/,/g, "")) || 0;

            const outfitData = {
                studioId: currentStudio?.studioId,
                name: outfitName.trim(),
                searchName: outfitName.trim().toLowerCase(), // For case-insensitive search
                code: outfitCode.trim().toUpperCase(),
                price: finalPrice,
                imageUrl: finalImageUrl,
                sizes: selectedSizes,
                sizeQuantities: sizeQuantities,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                category: "Uncategorized",
                status: "Available",
                createdBy: user?.uid
            };

            if (!outfitData.studioId) {
                throw new Error("Missing Studio workspace. Please refresh and try again.");
            }

            await addDoc(collection(db, "outfits"), outfitData);

            showToast("Outfit added successfully!", "success");
            router.back();

        } catch (error: any) {
            console.error("Save Error:", error);
            showToast(`Save failed: ${error.message || "Unknown error"}`, "error");
        } finally {
            setIsSubmitting(false);
            setSubmitStatus("");
        }
    };

    if (authLoading || !currentStudio) return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Initializing workspace...</p>
            </div>
        </div>
    );

    return (
        <>
            <div className="min-h-full bg-gray-50 pb-32">
                {/* Sticky Header */}
                <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-4 flex items-center justify-between shadow-sm">
                    <button
                        onClick={() => router.back()}
                        className="p-2 -ml-1 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <FiArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900">Add New Outfit</h1>
                    <div className="w-10"></div> {/* Spacer for alignment */}
                </div>

                <div className="w-full px-5 md:px-8 lg:px-12 py-6 space-y-6">

                    {/* Image Upload - Center Stage */}
                    <div className="flex flex-col items-center justify-center">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative w-40 h-40 rounded-3xl shadow-sm border-2 border-dashed overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 group
                                ${imagePreview ? 'border-transparent bg-white' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'}`}
                        >
                            {imagePreview ? (
                                <>
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <FiCamera className="text-white w-8 h-8 drop-shadow-md" />
                                    </div>
                                    <button
                                        onClick={removeImage}
                                        className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full text-red-500 shadow-sm"
                                    >
                                        <FiX className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-2">
                                        <FiImage className="w-7 h-7 stroke-1.5" />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-400">Add Photo</span>
                                </>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleImageChange}
                        />
                    </div>

                    {/* Details Card - iOS Style */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                        {/* Name Input */}
                        <div className="flex items-center px-4 py-3 border-b border-gray-100">
                            <label className="text-sm font-medium text-gray-500 w-24">Name</label>
                            <input
                                type="text"
                                value={outfitName}
                                onChange={(e) => setOutfitName(e.target.value.toUpperCase())}
                                placeholder="Royal Blue Lehenga"
                                className="flex-1 text-right font-medium text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 p-0"
                            />
                        </div>

                        {/* Code Input */}
                        <div className="flex items-center px-4 py-3 border-b border-gray-100">
                            <label className="text-sm font-medium text-gray-500 w-24">Code</label>
                            <input
                                type="text"
                                value={outfitCode}
                                onChange={handleCodeChange}
                                placeholder="LBL001"
                                className={`flex-1 text-right font-medium text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 p-0 uppercase ${codeError ? 'text-red-500' : ''}`}
                            />
                        </div>

                        {/* Price Input */}
                        <div className="flex items-center px-4 py-3">
                            <label className="text-sm font-medium text-gray-500 w-24">Rent (₹)</label>
                            <input
                                type="number"
                                pattern="[0-9]*" inputMode="numeric"
                                value={rentalPrice}
                                onChange={(e) => setRentalPrice(e.target.value)}
                                placeholder="0"
                                className="flex-1 text-right font-medium text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 p-0"
                            />
                        </div>
                    </div>

                    {/* Size Selector */}
                    <div>
                        <div className="flex justify-between items-center mb-3 px-2">
                            <h3 className="text-sm font-bold text-gray-900">Available Sizes</h3>
                        </div>

                        {/* Chips Grid */}
                        <div className="grid grid-cols-5 gap-3 mb-4">
                            {availableSizes.map(size => {
                                const active = selectedSizes.includes(size);
                                return (
                                    <button
                                        key={size}
                                        onClick={() => handleSizeToggle(size)}
                                        className={`h-12 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-200
                                            ${active
                                                ? 'bg-gray-900 text-white shadow-md transform scale-105'
                                                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                                    >
                                        {size}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Custom Size Input */}
                        <form onSubmit={handleAddCustomSize} className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={customSizeInput}
                                onChange={(e) => setCustomSizeInput(e.target.value.toUpperCase())}
                                placeholder="Add custom size (e.g. XL)"
                                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={!customSizeInput}
                                className="bg-white border border-gray-200 text-gray-900 px-4 py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                <FiPlus className="w-5 h-5" />
                            </button>
                        </form>

                        {/* Stock Quantity List */}
                        {selectedSizes.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Stock Quantity</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {selectedSizes.map(size => (
                                        <div key={size} className="flex items-center justify-between p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                                                    {size}
                                                </div>
                                                <span className="text-sm font-medium text-gray-700">Stock Count</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleQuantityChange(size, -1)}
                                                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100"
                                                >
                                                    <FiMinus className="w-3.5 h-3.5" />
                                                </button>
                                                <span className="w-4 text-center text-sm font-bold text-gray-900">{sizeQuantities[size] || 1}</span>
                                                <button
                                                    onClick={() => handleQuantityChange(size, 1)}
                                                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100"
                                                >
                                                    <FiPlus className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sticky Bottom Action Bar */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 pb-safe z-30 lg:pl-72 transition-all">
                    <button
                        onClick={() => handleSubmit()}
                        disabled={isSubmitting}
                        className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-white font-bold text-base shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all
                            ${isSubmitting ? 'bg-indigo-400 cursor-wait' : 'bg-[#0F172A]'}`}
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>{submitStatus}</span>
                            </>
                        ) : (
                            <>
                                <FiCheck className="w-5 h-5" />
                                <span>Save Outfit</span>
                            </>
                        )}
                    </button>
                </div>

            </div>
        </>
    );
}
