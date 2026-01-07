"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import debounce from "lodash.debounce";
import DashboardLayout from "../../../components/DashboardLayout";
import { collection, addDoc, query, where, getDocs, getDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../../firebaseConfig";
import { FiUploadCloud, FiX, FiGitMerge, FiAlertCircle, FiCheckCircle, FiWifi, FiWifiOff } from "react-icons/fi";
import { UserAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";

const availableSizes = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];

export default function AddOutfit() {
    const { user, loading: authLoading, googleSignIn } = UserAuth();
    const [outfitName, setOutfitName] = useState("");
    const [outfitCode, setOutfitCode] = useState("");
    const [rentalPrice, setRentalPrice] = useState("");
    const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
    const [sizeQuantities, setSizeQuantities] = useState<{ [key: string]: number }>({});
    const [customSizeInput, setCustomSizeInput] = useState("");
    const [activeTab, setActiveTab] = useState("single");
    const { showToast } = useToast();

    // Validation State
    const [codeError, setCodeError] = useState("");
    const [isCheckingCode, setIsCheckingCode] = useState(false);

    // Image Upload State
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<string>(""); // "Uploading Image...", "Saving..."
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Firebase Connection State
    const [browserOnline, setBrowserOnline] = useState<boolean>(true);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Monitor browser online/offline status
    useEffect(() => {
        const handleOnline = () => setBrowserOnline(true);
        const handleOffline = () => setBrowserOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Set initial state
        setBrowserOnline(navigator.onLine);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Debounced Code Check - DISABLED TEMPORARILY
    const checkCodeExistence = useCallback(
        debounce(async (code: string) => {
            // if (!code) return;
            // setIsCheckingCode(true);
            // try {
            //     const q = query(collection(db, "outfits"), where("code", "==", code));
            //     const querySnapshot = await getDocs(q);
            //     if (!querySnapshot.empty) {
            //         setCodeError("This product code already exists.");
            //     } else {
            //         setCodeError("");
            //     }
            // } catch (error) {
            //     console.error("Error checking code:", error);
            // } finally {
            //     setIsCheckingCode(false);
            // }
        }, 500),
        []
    );

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase().trim();
        setOutfitCode(value);
        if (value) {
            setCodeError(""); // Clear error while typing before check
            // checkCodeExistence(value); // DISABLED
        } else {
            setCodeError("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Basic Validation
        if (!outfitName || !outfitCode || !rentalPrice) {
            showToast("Please fill in all required fields.", "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        if (selectedSizes.length === 0) {
            showToast("Please select at least one size.", "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        if (!user) {
            showToast("You must be logged in to add an outfit.", "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        if (!browserOnline) {
            showToast("Cannot save outfit: Your browser is offline.", "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        if (codeError) {
            showToast("Please resolve errors before submitting.", "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus("Checking code...");

        console.log("Starting outfit submission...", { outfitName, outfitCode, rentalPrice });

        try {
            // 2. Final Code Uniqueness Check (prevent race conditions) - DISABLED
            // const q = query(collection(db, "outfits"), where("code", "==", outfitCode));
            // const querySnapshot = await getDocs(q);
            // if (!querySnapshot.empty) {
            //     throw new Error("This product code already exists. Please use a different one.");
            // }

            // 3. Upload Image (Sync)
            let finalImageUrl = "";
            if (imageFile) {
                setSubmitStatus("Uploading Image...");
                try {
                    console.log("Uploading image:", imageFile.name);
                    const storageRef = ref(storage, `outfits/${Date.now()}_${imageFile.name}`);
                    const snapshot = await uploadBytes(storageRef, imageFile);
                    finalImageUrl = await getDownloadURL(snapshot.ref);
                    console.log("Image upload successful:", finalImageUrl);
                } catch (uploadError: any) {
                    console.error("Image upload failed:", uploadError);
                    throw new Error("Failed to upload image. Please try again or use a smaller image.");
                }
            } else {
                console.log("No image selected, skipping upload.");
            }

            // 4. Save to Firestore
            setSubmitStatus("Saving Data...");
            const cleanPrice = parseFloat(rentalPrice.replace(/,/g, ""));
            const finalPrice = isNaN(cleanPrice) ? 0 : cleanPrice;

            // Prepare size quantities for selected sizes only
            const finalSizeQuantities: { [key: string]: number } = {};
            selectedSizes.forEach(size => {
                finalSizeQuantities[size] = sizeQuantities[size] || 1;
            });

            const outfitData = {
                name: outfitName.trim(),
                code: outfitCode,
                price: finalPrice,
                imageUrl: finalImageUrl,
                sizes: selectedSizes, // Keep for search/filter
                sizeQuantities: finalSizeQuantities, // New field for stock
                createdAt: new Date(),
                category: "Uncategorized",
                status: "Available"
            };

            console.log("Saving to Firestore:", outfitData);

            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out. Please check your internet connection.")), 15000)
            );

            // Race the addDoc against the timeout
            const docRef = await Promise.race([
                addDoc(collection(db, "outfits"), outfitData),
                timeoutPromise
            ]) as any; // Cast to avoid TS issues with race types if needed, or rely on inference

            console.log("Document written with ID: ", docRef.id);

            // 5. Success State
            showToast(`✨ Outfit "${outfitCode}" added successfully!`, "success");
            window.scrollTo({ top: 0, behavior: "smooth" });

            // Reset form
            setOutfitName("");
            setOutfitCode("");
            setRentalPrice("");
            setSelectedSizes([]);
            setSizeQuantities({});
            removeImage();

        } catch (error: any) {
            console.error("Error adding document DETAIL: ", error);

            // Show detailed Firebase error messages
            let errorMessage = "An unexpected error occurred.";

            if (error.code) {
                switch (error.code) {
                    case 'permission-denied':
                        errorMessage = "Firebase Error: Permission denied. Please check that you are logged in and Firebase security rules are configured correctly.";
                        break;
                    case 'unavailable':
                        errorMessage = "Firebase Error: Service unavailable. Check your internet connection and try again.";
                        break;
                    case 'cancelled':
                        errorMessage = "Firebase Error: Operation was cancelled.";
                        break;
                    case 'unknown':
                        errorMessage = "Firebase Error: Unknown error occurred. Please try again.";
                        break;
                    case 'invalid-argument':
                        errorMessage = "Firebase Error: Invalid data provided. Please check your input.";
                        break;
                    case 'deadline-exceeded':
                        errorMessage = "Firebase Error: Operation timed out. Check your internet connection.";
                        break;
                    case 'not-found':
                        errorMessage = "Firebase Error: The requested resource was not found.";
                        break;
                    case 'already-exists':
                        errorMessage = "Firebase Error: This outfit already exists.";
                        break;
                    case 'resource-exhausted':
                        errorMessage = "Firebase Error: Resource quota exceeded. Please try again later.";
                        break;
                    case 'failed-precondition':
                        errorMessage = "Firebase Error: Operation failed due to current state. Please check your Firebase configuration.";
                        break;
                    case 'aborted':
                        errorMessage = "Firebase Error: Operation was aborted.";
                        break;
                    case 'out-of-range':
                        errorMessage = "Firebase Error: Parameter value is out of range.";
                        break;
                    case 'unauthenticated':
                        errorMessage = "Firebase Error: User is not authenticated. Please log in again.";
                        break;
                    default:
                        errorMessage = `Firebase Error (${error.code}): ${error.message}`;
                }
            } else if (error.message) {
                errorMessage = `Error: ${error.message}`;
            }

            showToast(errorMessage, "error");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } finally {
            setIsSubmitting(false);
            setSubmitStatus("");
        }
    };

    const handleSizeChange = (size: string) => {
        setSelectedSizes((prevSizes) => {
            const isSelected = prevSizes.includes(size);
            if (isSelected) {
                // Removing size
                const newSizes = prevSizes.filter((s) => s !== size);
                const newQuantities = { ...sizeQuantities };
                delete newQuantities[size];
                setSizeQuantities(newQuantities);
                return newSizes;
            } else {
                // Adding size
                setSizeQuantities(prev => ({ ...prev, [size]: 1 }));
                return [...prevSizes, size];
            }
        });
    };

    const handleQuantityChange = (size: string, delta: number) => {
        setSizeQuantities(prev => {
            const currentQty = prev[size] || 1;
            const newQty = Math.max(1, currentQty + delta);
            return { ...prev, [size]: newQty };
        });
    };

    const handleAddCustomSize = () => {
        if (customSizeInput.trim()) {
            const newSize = customSizeInput.trim().toUpperCase();
            if (!selectedSizes.includes(newSize)) {
                setSelectedSizes([...selectedSizes, newSize]);
                setSizeQuantities(prev => ({ ...prev, [newSize]: 1 }));
            }
            setCustomSizeInput("");
        }
    };

    if (authLoading) {
        return (
            <DashboardLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
                </div>
            </DashboardLayout>
        );
    }

    if (!user) {
        return (
            <DashboardLayout>
                <div className="flex h-[80vh] flex-col items-center justify-center text-center">
                    <div className="bg-red-50 p-6 rounded-2xl max-w-md border border-red-100 shadow-sm">
                        <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
                        <p className="text-gray-600 mb-6">You must be logged in to add a new outfit. Your session may have expired.</p>
                        <button
                            onClick={async () => {
                                try {
                                    await googleSignIn();
                                } catch (e) {
                                    console.error(e);
                                }
                            }}
                            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
                        >
                            Log In with Google
                        </button>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="mx-auto max-w-4xl">
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Add New Outfit</h1>

                {/* Tab Selection */}
                <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab("single")}
                            className={`${activeTab === "single"
                                ? "border-indigo-500 text-indigo-600"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Single Entry
                        </button>
                        <button
                            onClick={() => setActiveTab("bulk")}
                            className={`${activeTab === "bulk"
                                ? "border-indigo-500 text-indigo-600"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            Bulk Entry
                        </button>
                    </nav>
                </div>

                {activeTab === "single" ? (
                    <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">

                        {/* Connection Status */}
                        <div className="mb-6 space-y-3">
                            {/* Browser Online Status */}
                            <div className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-medium ${browserOnline
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                                }`}>
                                {browserOnline ? (
                                    <>
                                        <div className="h-2 w-2 bg-green-500 rounded-full mr-2"></div>
                                        Browser Online
                                    </>
                                ) : (
                                    <>
                                        <div className="h-2 w-2 bg-red-500 rounded-full mr-2"></div>
                                        Browser Offline
                                    </>
                                )}
                            </div>
                        </div>



                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="outfitName" className="form-label">Outfit Name</label>
                                    <input
                                        type="text"
                                        id="outfitName"
                                        value={outfitName}
                                        onChange={(e) => setOutfitName(e.target.value.toUpperCase())}
                                        className="form-input"
                                        placeholder="E.G. ROYAL BLUE LEHENGA"
                                        required
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="outfitCode" className="form-label">Outfit Code (Unique)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="outfitCode"
                                            value={outfitCode}
                                            onChange={handleCodeChange}
                                            className={`form-input ${codeError ? "border-red-500 focus:border-red-500" : ""}`}
                                            placeholder="E.G. LBL001"
                                            required
                                            disabled={isSubmitting}
                                        />
                                        {(isCheckingCode || (isSubmitting && submitStatus === "Checking code...")) && (
                                            <div className="absolute right-3 top-3">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                                            </div>
                                        )}
                                    </div>
                                    {codeError && <p className="mt-1 text-xs text-red-500 font-medium">{codeError}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="rentalPrice" className="form-label">Rental Price (INR)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="rentalPrice"
                                            value={rentalPrice}
                                            onChange={(e) => {
                                                const value = e.target.value.replace(/[^0-9]/g, "");
                                                if (value) {
                                                    setRentalPrice(new Intl.NumberFormat('en-IN').format(parseInt(value)));
                                                } else {
                                                    setRentalPrice("");
                                                }
                                            }}
                                            className="form-input"
                                            placeholder="0"
                                            required
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700">Outfit Image</label>
                                    {!imagePreview ? (
                                        <div
                                            onClick={() => !isSubmitting && fileInputRef.current?.click()}
                                            className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50'} transition-colors`}
                                        >
                                            <div className="space-y-1 text-center">
                                                <FiUploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                                                <div className="text-sm text-gray-600">
                                                    <span className="font-medium text-indigo-600 hover:text-indigo-500">Upload a file</span>
                                                    <span className="pl-1">or drag and drop</span>
                                                </div>
                                                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative mt-1 w-full h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group">
                                            <img src={imagePreview} alt="Preview" className="h-full w-full object-contain" />

                                            {isSubmitting && submitStatus === "Uploading Image..." && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                                                </div>
                                            )}

                                            {!isSubmitting && (
                                                <button
                                                    type="button"
                                                    onClick={removeImage}
                                                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <FiX className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="form-label mb-2">Available Sizes & Quantities</label>
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 mb-3">
                                    {availableSizes.map((size) => {
                                        const isSelected = selectedSizes.includes(size);
                                        return (
                                            <div
                                                key={size}
                                                onClick={() => !isSubmitting && handleSizeChange(size)}
                                                className={`relative flex flex-col items-center p-2 rounded-xl border transition-all duration-200 cursor-pointer ${isSelected
                                                    ? "border-indigo-600 bg-indigo-50 shadow-sm"
                                                    : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
                                                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >

                                                <button
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    className={`w-full text-center text-sm font-bold mb-2 pointer-events-none ${isSelected ? "text-indigo-700" : "text-gray-600"}`}
                                                >
                                                    {size}
                                                </button>

                                                {isSelected && (
                                                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, -1); }}
                                                            className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-bold"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="text-sm font-semibold text-gray-800 w-6 text-center">
                                                            {sizeQuantities[size] || 1}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, 1); }}
                                                            className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-bold"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                )}
                                                {!isSelected && (
                                                    <div className="h-6 w-full"></div> // Spacer
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Custom Sizes Display */}
                                {selectedSizes.some(s => !availableSizes.includes(s)) && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {selectedSizes.filter(s => !availableSizes.includes(s)).map((size) => (
                                            <div key={size} className="rounded-xl border border-indigo-600 bg-indigo-600 text-white shadow-md p-2 flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold">{size}</span>
                                                    <button type="button" onClick={() => handleSizeChange(size)} className="hover:text-red-200"><FiX className="w-3 h-3" /></button>
                                                </div>
                                                <div className="flex items-center space-x-1 bg-indigo-700 rounded-lg px-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, -1); }}
                                                        className="w-5 h-5 flex items-center justify-center rounded-full text-white hover:bg-indigo-500 text-xs font-bold"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="text-sm font-semibold text-white w-5 text-center">
                                                        {sizeQuantities[size] || 1}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleQuantityChange(size, 1); }}
                                                        className="w-5 h-5 flex items-center justify-center rounded-full text-white hover:bg-indigo-500 text-xs font-bold"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add Custom Size Input */}
                                <div className="flex items-center gap-2 max-w-xs">
                                    <input
                                        type="text"
                                        value={customSizeInput}
                                        onChange={(e) => setCustomSizeInput(e.target.value)}
                                        placeholder="Add Custom Size"
                                        className="form-input py-2 text-sm"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddCustomSize();
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddCustomSize}
                                        disabled={!customSizeInput.trim() || isSubmitting}
                                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || !!codeError || isCheckingCode || !browserOnline}
                                className={`w-full rounded-xl py-3 text-lg font-semibold text-white shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all
                                    ${isSubmitting || !!codeError || isCheckingCode || !browserOnline
                                        ? "bg-indigo-400 cursor-not-allowed"
                                        : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg"}`}
                            >
                                {!browserOnline
                                    ? "Browser Offline - Check Connection"
                                    : isSubmitting
                                        ? (submitStatus || "Saving...")
                                        : "Add Outfit"
                                }
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="bg-white p-12 rounded-xl text-center border border-gray-200 shadow-sm">
                        <div className="text-gray-400 mb-4">
                            <FiGitMerge className="mx-auto h-12 w-12" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Bulk Entry</h3>
                        <p className="mt-1 text-gray-500">This feature is currently under development.</p>
                    </div>
                )}
            </div>
        </DashboardLayout >
    );
}
