import axios from 'axios';

export const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0";

/**
 * Generates a wa.me deep link for manual sending
 */
export const getWhatsAppDeepLink = (mobile: string, message: string) => {
    // Ensure mobile has 91 prefix if not present
    let formattedMobile = mobile.replace(/\D/g, '');
    if (formattedMobile.length === 10) formattedMobile = '91' + formattedMobile;

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedMobile}?text=${encodedMessage}`;
};

/**
 * Sends a text message using the WhatsApp Cloud API
 */
export const sendWhatsAppMessage = async (mobile: string, message: string) => {
    const token = process.env.NEXT_PUBLIC_WHATSAPP_TOKEN || "EAAaekbFq6NoBPz32Ppwr7ozpGP9xHu86ZCzzLyPNgnezSYcTg6I9ZBNdm8p0grriwywap8nNV9Fr51U070dkTdal4ddhF6vlqZAT1bXiY2KMbZBdoh3Kbo8ZCZCCGxOXs7n0PgfEQISABhhvqbGTLkYCXZAjh9xFPRUfP4r2cZB8UYrMJfGqMA8bYLzxu0vCUbMRz7ickJfbiJiDKhifsYZCWnuXDPDjiEfRfhIDXEU2xNn6UeO6fjevogTPQhGWfj0Dlt5AK09bD5YzVZBqnFZAMAYhXge4QZDZD";
    const phoneId = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_ID;

    if (!phoneId) {
        console.warn("Missing WhatsApp Phone ID - API Send might fail. Please set NEXT_PUBLIC_WHATSAPP_PHONE_ID.");
    }

    // Format mobile: remove + and ensure country code
    let formattedMobile = mobile.replace(/\D/g, '');
    if (formattedMobile.length === 10) formattedMobile = '91' + formattedMobile;

    try {
        const response = await axios.post(
            `${WHATSAPP_API_URL}/${phoneId}/messages`,
            {
                messaging_product: "whatsapp",
                to: formattedMobile,
                type: "text",
                text: { body: message }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return response.data;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        // Detailed error logging
        if (error.response) {
            console.error("WhatsApp API Error Status:", error.response.status);
            console.error("WhatsApp API Error Data:", JSON.stringify(error.response.data, null, 2));
            throw new Error(error.response.data?.error?.message || `WhatsApp API Failed: ${error.response.status}`);
        } else {
            console.error("WhatsApp Network/Client Error:", error.message);
            throw new Error(error.message || "Failed to send WhatsApp message (Network Error)");
        }
    }
};

/**
 * Generates the standard Invoice Message content
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const generateInvoiceMessage = (order: any): string => {
    const startDate = order.startDate?.toLocaleDateString ? order.startDate.toLocaleDateString('en-IN') : new Date(order.startDate).toLocaleDateString('en-IN');
    const endDate = order.endDate?.toLocaleDateString ? order.endDate.toLocaleDateString('en-IN') : new Date(order.endDate).toLocaleDateString('en-IN');

    let itemsList = "";
    if (order.outfitItems && Array.isArray(order.outfitItems)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itemsList = order.outfitItems.map((item: any, idx: number) =>
            `${idx + 1}. *${item.name || item.designName}* (${item.size}) - ₹${item.rentalPrice}`
        ).join('\n');
    }

    return `*Order Confirmation - VastraaOS* 🛍️
    
Hello *${order.customerName}*,
Your rental order is confirmed! ✅

*Items:*
${itemsList}

📅 *Rental Period:* 
${startDate} to ${endDate} (${order.rentalDays} days)

💰 *Payment Details:*
Total: ₹${order.totalAmount}
Advance: ₹${order.advancePayment}
*Balance Due: ₹${order.totalAmount - order.advancePayment}*

Thank you for choosing us! 🙏`;
};
