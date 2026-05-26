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

let state = {
    dailyDealsMessageId: null,
    gamepassMessageId: null
};

async function loadState() {
    try {
        const data = await fs.readFile('state.json', 'utf8');
        const parsed = JSON.parse(data);

        state.dailyDealsMessageId =
            parsed.dailyDealsMessageId || null;

        state.gamepassMessageId =
            parsed.gamepassMessageId || null;

        console.log("📂 Состояние загружено");
    } catch {
        console.log("🆕 Новый state");
    }
}

async function saveState() {
    await fs.writeFile(
        'state.json',
        JSON.stringify(state, null, 2)
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

function parseGamepassStock(embed) {

    const text =
        embed.description ||
        embed.fields?.map(f => f.value).join('\n') ||
        '';

    const items = [];

    for (const line of text.split('\n')) {

        const cleanLine =
            line.replace(/^•\s*/, '').trim();

        const match = cleanLine.match(
            /^(\S+)\s+(.+?)\s+x(\d+)$/i
        );

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

async function fetchGamepassStock() {

    const channel = await client.channels.fetch(
        process.env.GAMEPASS_CHANNEL_ID
    );

    if (!channel) {
        console.log("Gamepass канал не найден");
        return null;
    }

    const messages = await channel.messages.fetch({
        limit: 5
    });

    const msg = messages.find(m =>
        m.embeds?.length > 0 &&
        m.embeds[0].title
            ?.toLowerCase()
            .includes('game pass')
    );

    if (!msg) {
        console.log("Gamepass embed не найден");
        return null;
    }

    return {
        items: parseGamepassStock(msg.embeds[0]),
        messageId: msg.id
    };
}

async function sendDailyDeals(items, messageId) {

    if (messageId === state.dailyDealsMessageId) {
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
    state.dailyDealsMessageId = messageId;
    await saveState();

    console.log("Daily Deals отправлены!");
}

async function sendGamepassStock(items, messageId) {

    if (messageId === state.gamepassMessageId) {
        console.log("Уже отправляли Gamepass");
        return;
    }

    const now = new Date();

    const embed = {
        title: "🎟️ GROW A GARDEN | GAMEPASS STOCK",
        color: 0xff9900,
        description: items
            .map(i =>
                `- ${i.emoji} ${i.name} — ${i.count}`
            )
            .join('\n'),
        footer: {
            text:
                `Last update: ` +
                now.toLocaleTimeString('en-GB') +
                ' UTC'
        },
        timestamp: now.toISOString()
    };

    await axios.post(
        process.env.GAMEPASS_WEBHOOK_URL,
        {
            embeds: [embed]
        }
    );

    state.gamepassMessageId = messageId;

    await saveState();

    console.log("Gamepass отправлен!");
}

async function checkDailyDeals() {
    const now = new Date();

    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();

    const isWindow = (hours === 0 && minutes <= 2);

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
    if (data.messageId === state.dailyDealsMessageId) {
        console.log("Этот сток уже отправляли");
        return;
    }

    await sendDailyDeals(data.items, data.messageId);
}

async function checkGamepassStock() {

    console.log("Проверяем Gamepass Stock...");

    const data = await fetchGamepassStock();

    if (!data) {
        console.log("Нет данных Gamepass");
        return;
    }

    if (!data.items.length) {
        console.log("Gamepass пустой");
        return;
    }

    // защита от дубля
    if (data.messageId === state.gamepassMessageId) {
        console.log("Этот Gamepass уже отправляли");
        return;
    }

    await sendGamepassStock(
        data.items,
        data.messageId
    );
}

function startScheduler() {

    const scheduleNext = () => {
        const now = new Date();
        const seconds = now.getSeconds();

        const targets = [5, 20, 35, 50];

        let targetSecond =
            targets.find(t => t > seconds);

        if (!targetSecond) {
            targetSecond = 65;
        }

        const delay =
            ((targetSecond - seconds + 60) % 60)
            * 1000;

        console.log(`Следующая проверка через ${delay / 1000}s`);

        setTimeout(async () => {
            try {

            const currentSeconds =
                new Date().getSeconds();

            // 🎟️ Gamepass
            if (
                (currentSeconds >= 20 && currentSeconds < 25) ||
                (currentSeconds >= 50 && currentSeconds < 55)
            ) {
                await checkGamepassStock();
            }

            // 🌱 Daily Deals
            if (
                (currentSeconds >= 5 && currentSeconds < 10) ||
                (currentSeconds >= 35 && currentSeconds < 40)
            ) {
                await checkDailyDeals();
            }

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
