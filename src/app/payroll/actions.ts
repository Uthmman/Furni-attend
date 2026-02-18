
'use server';

import 'dotenv/config';
import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';

export async function sendAdminPayrollSummary(message: string) {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!adminChatId) {
        console.error('TELEGRAM_ADMIN_CHAT_ID is not set in environment variables.');
        return { success: false, error: 'Admin Telegram Chat ID is not configured.' };
    }

    try {
        const result = await sendTelegramMessage({ chatId: adminChatId, message });
        return { success: result.success };
    } catch (error) {
        console.error("Failed to send Telegram message from server action:", error);
        return { success: false, error: (error as Error).message };
    }
}
