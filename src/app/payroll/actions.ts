
'use server';

import 'dotenv/config';
import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';

export async function sendAdminPayrollSummary(message: string) {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!adminChatId) {
        console.error('TELEGRAM_ADMIN_CHAT_ID is not set in environment variables.');
        return { success: false, error: 'Admin Telegram Chat ID is not configured in .env.local.' };
    }

    try {
        const result = await sendTelegramMessage({ chatId: adminChatId, message });
        return { success: result.success };
    } catch (error) {
        const errorMessage = (error as Error).message;
        console.error("Failed to send Telegram message from server action:", errorMessage);
        
        if (errorMessage.includes('chat not found')) {
            return { 
                success: false, 
                error: 'Chat not found. Please ensure TELEGRAM_ADMIN_CHAT_ID is correct and the admin has started a conversation with the bot.' 
            };
        }

        return { success: false, error: errorMessage };
    }
}
