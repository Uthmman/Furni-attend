'use server';
/**
 * @fileOverview A flow to send messages via a Telegram bot.
 *
 * - sendTelegramMessageFlow - The Genkit flow that sends the message.
 * - sendTelegramMessage - A wrapper function to invoke the flow.
 * - SendTelegramMessageInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { sendTelegramMessage as sendTelegramMessageService } from '@/services/telegram';
import { z } from 'genkit';

const SendTelegramMessageInputSchema = z.object({
  chatId: z.string().describe('The Telegram chat ID to send the message to.'),
  message: z.string().describe('The content of the message to send.'),
});

export type SendTelegramMessageInput = z.infer<typeof SendTelegramMessageInputSchema>;

export async function sendTelegramMessage(input: SendTelegramMessageInput): Promise<{ success: boolean }> {
  return sendTelegramMessageFlow(input);
}

const sendTelegramMessageFlow = ai.defineFlow(
  {
    name: 'sendTelegramMessageFlow',
    inputSchema: SendTelegramMessageInputSchema,
    outputSchema: z.object({ success: z.boolean() }),
  },
  async (input) => {
    await sendTelegramMessageService(input.chatId, input.message);
    return { success: true };
  }
);
