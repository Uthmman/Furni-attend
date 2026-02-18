'use server';

import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';

export async function sendPayrollSummaryToTelegram(chatId: string, message: string) {
    try {
        const result = await sendTelegramMessage({ chatId, message });
        return { success: result.success };
    } catch (error) {
        console.error("Failed to send Telegram message from server action:", error);
        return { success: false, error: (error as Error).message };
    }
}
