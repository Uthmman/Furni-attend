'use server';

import 'dotenv/config';
import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';

async function sendAdminNotification(message: string) {
    const adminChatIds = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!adminChatIds) {
        console.error('TELEGRAM_ADMIN_CHAT_ID is not set in environment variables.');
        return { success: false, error: 'Admin Telegram Chat ID(s) are not configured.' };
    }

    const chatIds = adminChatIds.split(',').map(id => id.trim()).filter(id => id);

    if (chatIds.length === 0) {
        return { success: false, error: 'No valid Admin Telegram Chat IDs found.' };
    }

    try {
        const sendPromises = chatIds.map(chatId => 
            sendTelegramMessage({ chatId, message })
        );

        const results = await Promise.allSettled(sendPromises);
        const failedSends = results.filter(r => r.status === 'rejected');

        if (failedSends.length > 0) {
            return { success: false, error: `Failed to send to ${failedSends.length} admins.` };
        }

        return { success: true };

    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function sendAdminPayrollSummary(message: string) {
    return sendAdminNotification(message);
}

export async function notifyLowStock(itemName: string, currentStock: number, threshold: number, unit: string) {
    const message = `⚠️ *Low Stock Alert*\n\nItem: *${itemName}*\nCurrent Stock: *${currentStock} ${unit}*\nThreshold: *${threshold} ${unit}*\n\nPlease consider restocking soon.`;
    return sendAdminNotification(message);
}
