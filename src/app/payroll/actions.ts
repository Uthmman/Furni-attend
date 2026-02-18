
'use server';

import 'dotenv/config';
import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';

export async function sendAdminPayrollSummary(message: string) {
    const adminChatIds = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!adminChatIds) {
        console.error('TELEGRAM_ADMIN_CHAT_ID is not set in environment variables.');
        return { success: false, error: 'Admin Telegram Chat ID(s) are not configured in .env.local.' };
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
            // Log all errors for debugging
            failedSends.forEach(failure => {
                const reason = (failure as PromiseRejectedResult).reason as Error;
                console.error("Failed to send Telegram message to a user:", reason.message);
            });
            
            // Check if one of the errors is 'chat not found' to provide a specific hint
            const hasChatNotFound = failedSends.some(f => ((f as PromiseRejectedResult).reason as Error).message.includes('chat not found'));
            
            let errorMessage = `Failed to send to ${failedSends.length} of ${chatIds.length} admins.`;
            if (hasChatNotFound) {
                errorMessage += ' One or more chat IDs were not found. Please ensure all IDs are correct and that each admin has started a conversation with the bot.';
            }

            return { success: false, error: errorMessage };
        }

        return { success: true };

    } catch (error) { // This is a catch-all, but the Promise.allSettled should handle individual failures.
        const errorMessage = (error as Error).message;
        console.error("An unexpected error occurred when sending Telegram messages:", errorMessage);
        return { success: false, error: errorMessage };
    }
}
