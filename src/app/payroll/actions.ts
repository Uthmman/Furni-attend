
'use server';

import 'dotenv/config';
import { sendTelegramMessage } from '@/ai/flows/send-telegram-message-flow';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

/**
 * Checks if a notification for a specific period has already been sent.
 * If not, sends it and marks it as sent.
 */
export async function autoSendPayrollNotification(type: 'weekly' | 'monthly', periodId: string, summaryText: string) {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Firestore not available' };

    const docId = `${type}_${periodId}`;
    const metadataRef = doc(firestore, 'metadata', 'payroll_notifications');

    try {
        const docSnap = await getDoc(metadataRef);
        const data = docSnap.exists() ? docSnap.data() : {};

        // Check if this specific period was already notified
        if (data[docId]) {
            return { success: true, alreadySent: true };
        }

        // Send the notification
        const result = await sendAdminNotification(summaryText);
        
        if (result.success) {
            // Mark as sent in Firestore
            await setDoc(metadataRef, {
                [docId]: {
                    sentAt: new Date().toISOString(),
                    type,
                    periodId
                }
            }, { merge: true });
        }

        return result;
    } catch (error) {
        console.error('Error in autoSendPayrollNotification:', error);
        return { success: false, error: (error as Error).message };
    }
}

export async function notifyLowStock(itemName: string, currentStock: number, threshold: number, unit: string) {
    const message = `⚠️ *Low Stock Alert*\n\nItem: *${itemName}*\nCurrent Stock: *${currentStock} ${unit}*\nThreshold: *${threshold} ${unit}*\n\nPlease consider restocking soon.`;
    return sendAdminNotification(message);
}
