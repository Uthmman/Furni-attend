'use server';

import 'dotenv/config';

export async function sendTelegramMessage(chatId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set in environment variables.');
    throw new Error('Telegram bot token is not configured.');
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });

    const result = await response.json();
    
    if (!result.ok) {
      console.error('Telegram API Error:', result.description);
      throw new Error(`Failed to send message to Telegram: ${result.description}`);
    }
    
    return { success: true, result };
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
}
