require('dotenv').config();

const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const express = require('express');
const fs = require('fs').promises;

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Daily Deals Bot is alive!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const client = new Client();

let lastMessageId = null;

async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        const parsed = JSON.parse(data);

        lastMessageId = parsed.lastMessageId || null;

        console.log("📂 Состояние загружено");
    } catch {
        console.log("🆕 Новый state");
    }
}

async function saveState() {
    await fs.writeFile(
        'state.json',
        JSON.stringify({ lastMessageId }, null, 2)
    );
}

function parseDailyDeals(embed) {
    const text =
        embed.description ||
        embed.fields?.map(f => f.value).join('\n') ||
        '';

    const items = [];

    for (const line of text.split('\n')) {

        // убираем "• " если есть
        const cleanLine = line.replace(/^•\s*/, '').trim();

        const match = cleanLine.match(/^(\S+)\s+(.+?)\s+x(\d+)$/i);

        if (!match) continue;

        items.push({
            emoji: match[1],
            name: match[2].trim(),
            count: parseInt(match[3])
        });
    }

    return items;
}

async function fetchDailyDeals() {
    const channel = await client.channels.fetch(process.env.SOURCE_CHANNEL_ID);

    if (!channel) {
        console.log("Канал не найден");
        return null;
    }

    const messages = await channel.messages.fetch({ limit: 5 });

    const msg = messages.find(m =>
        m.embeds?.length > 0 &&
        m.embeds[0].title?.toLowerCase().includes('daily')
    );

    if (!msg) {
        console.log("Daily Deals embed не найден");
        return null;
    }

    return {
        items: parseDailyDeals(msg.embeds[0]),
        messageId: msg.id
    };
}

async function sendDailyDeals(items, messageId) {

    if (messageId === lastMessageId) {
        console.log("Уже отправляли этот сток");
        return;
    }

    const now = new Date();

    const embed = {
        title: "🌱 GROW A GARDEN | DAILY DEALS",
        color: 0x2ecc71,
        description: items
            .map(i => `- ${i.emoji} ${i.name} — ${i.count}`)
            .join('\n'),
        footer: {
            text: `Last update: ${now.toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: now.toISOString()
    };

    // 🚀 сначала отправляем
    await axios.post(process.env.WEBHOOK_URL, {
        embeds: [embed]
    });

    // 💾 потом сохраняем (ВАЖНО)
    lastMessageId = messageId;
    await saveState();

    console.log("Daily Deals отправлены!");
}

async function checkDailyDeals() {
    const now = new Date();

    const hours = now.getHours();
    const minutes = now.getMinutes();

    const isWindow = (hours === 2 && minutes >= 58) || (hours === 3 && minutes <= 2);

    if (!isWindow) {
        console.log("Не время Daily Deals");
        return;
    }

    console.log("Окно Daily Deals — проверяем...");

    const data = await fetchDailyDeals();

    if (!data || !data.items.length) {
        console.log("Нет данных");
        return;
    }

    // 🔒 защита от дубля (самое важное)
    if (data.messageId === lastMessageId) {
        console.log("Этот сток уже отправляли");
        return;
    }

    await sendDailyDeals(data.items, data.messageId);
}

function startScheduler() {

    const scheduleNext = () => {
        const now = new Date();
        const seconds = now.getSeconds();

        let targetSecond;

        if (seconds < 20) targetSecond = 20;
        else if (seconds < 50) targetSecond = 50;
        else targetSecond = 80;

        const delay = (targetSecond - seconds) * 1000;

        console.log(`Следующая проверка через ${delay / 1000}s`);

        setTimeout(async () => {
            try {
                await checkDailyDeals();
            } catch (err) {
                console.error("Ошибка:", err.message);
            }

            scheduleNext();
        }, delay);
    };

    scheduleNext();
}

client.on('ready', async () => {
    console.log(`Залогинен как ${client.user.tag}`);

    await loadState();

    console.log("Daily Deals scheduler запущен");

    startScheduler();
});

client.login(process.env.USER_TOKEN);
