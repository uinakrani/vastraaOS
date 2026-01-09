export default function Loading() {
    return (
        <div className="flex items-center justify-center min-h-[100dvh] bg-gray-50">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        </div>
    );
}
