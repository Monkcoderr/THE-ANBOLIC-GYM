import { formatDisplayDate } from "@/lib/dateUtils";

/**
 * Generate the exact WhatsApp-ready receipt text for a payment.
 * Uses markdown-style *bold* and emojis so it renders nicely in WhatsApp.
 */
export function generateReceiptText(member, payment, gymName) {
  return `🏋️‍♂️ *${gymName} - PAYMENT RECEIPT* 🏋️‍♂️
----------------------------------
👤 *Member Name:* ${member.name}
📱 *Phone:* ${member.phone}
📅 *Date:* ${formatDisplayDate(payment.paymentDate)}
💰 *Amount Paid:* ₹${payment.amount}
💳 *Payment Mode:* ${payment.paymentMethod}
⏱️ *Valid Until:* ${formatDisplayDate(payment.newExpiry)}
----------------------------------
Thank you for your payment! Let's crush those goals! 💪🔥`;
}

export default generateReceiptText;
