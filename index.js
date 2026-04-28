require('dotenv').config();

const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Daily Deals Bot is alive!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const client = new Client();

let lastSentDate = null;

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
    const channel = client.channels.cache.get(process.env.SOURCE_CHANNEL_ID);

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

let lastMessageId = null;

async function sendDailyDeals(items, messageId) {

    const today = new Date().toDateString();

    if (lastSentDate === today) {
        console.log("Уже отправляли сегодня");
        return;
    }

    lastSentDate = today;
    lastMessageId = messageId;

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

    await axios.post(process.env.WEBHOOK_URL, {
        embeds: [embed]
    });

    console.log("Daily Deals отправлены!");
}

async function checkDailyDeals() {
    const now = new Date();

    const hours = now.getHours();
    const minutes = now.getMinutes();

    const isWindow = (hours === 2 && minutes >= 58) || (hours === 3 && minutes <= 2);

    const today = now.toDateString();

    // если уже отправляли сегодня — выходим
    if (lastSentDate === today) {
        console.log("Уже отправляли сегодня");
        return;
    }

    // если не окно — но ещё не отправляли → fallback
    if (!isWindow) {
        console.log("Не окно, но проверяем (fallback)");
    } else {
        console.log("Окно Daily Deals");
    }

    const data = await fetchDailyDeals();

    if (!data || !data.items.length) {
        console.log("Нет данных");
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

client.on('ready', () => {
    console.log(`Залогинен как ${client.user.tag}`);
    console.log("Daily Deals scheduler запущен");

    startScheduler();
});

client.login(process.env.USER_TOKEN);
