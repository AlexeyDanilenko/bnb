const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ Токен бота хранится в переменных окружения Render
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Прямо прописанный chat ID (как договаривались)
const CHAT_ID = 235189880;

// Создаём бота БЕЗ polling — работаем через webhook
const bot = new TelegramBot(TELEGRAM_TOKEN);

// --- Webhook/Express ---
const BASE_URL = 'https://monitoring-bnb-i-pr.onrender.com'; // твой Render URL
app.use(express.json());
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Простой healthcheck (для UptimeRobot и для проверки)
app.get('/', (req, res) => {
  res.send('Crypto Signal Bot is running!');
});

// --- Параметры торговой логики ---
const coins = [
  'BNBUSDC', 'BTCUSDC', 'ETHUSDC', 'LINKUSDC',
  'AVAXUSDC', 'DOTUSDC', 'TONUSDC', 'SOLUSDC', 'SUIUSDC'
];

const thresholds = {
  RSI: 32,   // RSI14 ≤ 32
  BB: 0.20   // BB%B(20,2) ≤ 0.20
};

// Цена последнего сработавшего сигнала для правила «−1% перед повтором»
const lastSignalPrice = {};

// --- Вспомогательные функции ---
function formatPriceRu(n) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateBBPercent(closes) {
  if (!closes || closes.length < 2) return null;
  const len = closes.length;
  const mean = closes.reduce((a, b) => a + b, 0) / len;
  const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / len;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const last = closes[len - 1];
  return (last - lower) / (upper - lower);
}

// --- Основная проверка индикаторов ---
async function checkIndicators() {
  const now = new Date();
  // Время в зоне UTC+2 (Etc/GMT-2 — правильный идентификатор для UTC+2)
  const timeStr = now.toLocaleString('ru-RU', { timeZone: 'Etc/GMT-2' });

  for (const coin of coins) {
    try {
      const { data } = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${coin}&interval=5m&limit=20`,
        { timeout: 15000 }
      );
      const closes = data.map(c => parseFloat(c[4]));
      if (!closes || closes.length < 15) {
        console.warn(`Недостаточно данных для ${coin}, пропускаем`);
        continue;
      }

      const rsi = calculateRSI(closes, 14);
      const bbPercent = calculateBBPercent(closes);
      const price = closes[closes.length - 1];

      if (rsi == null || bbPercent == null || !Number.isFinite(price)) {
        console.warn(`Ошибка расчёта индикаторов для ${coin}, пропускаем`);
        continue;
      }

      const signal = (rsi <= thresholds.RSI) && (bbPercent <= thresholds.BB);

      // Правило «следующий сигнал — только после падения ещё на 1%»
      if (signal && lastSignalPrice[coin]) {
        const minPrice = lastSignalPrice[coin] * 0.99; // 1% ниже цены последнего сигнала
        if (price > minPrice) {
          console.log(`${coin} | блок: правило -1% (текущая=${formatPriceRu(price)}, предыдущая=${formatPriceRu(lastSignalPrice[coin])})`);
          continue;
        }
      }

      console.log(`${coin} | Цена: ${formatPriceRu(price)}, RSI: ${rsi.toFixed(2)}, BB%: ${bbPercent.toFixed(2)}, Signal: ${signal}`);

      if (signal) {
        const msg =
          `Монета: ${coin}\n` +
          `Сигнал сработал: ${timeStr}\n` +
          `Курс: ${formatPriceRu(price)}`;
        await bot.sendMessage(CHAT_ID, msg);
        lastSignalPrice[coin] = price; // фиксируем цену сигнала для правила -1%
      }
    } catch (err) {
      console.error(`Ошибка при проверке ${coin}:`, err.message);
    }
  }
}

// --- Инициализация (webhook + стартовое сообщение + цикл) ---
async function init() {
  try {
    // Перестраховка: очищаем старый webhook и ставим нужный
    await bot.deleteWebHook().catch(() => {});
    const url = `${BASE_URL}/bot${TELEGRAM_TOKEN}`;
    await bot.setWebHook(url);
    console.log(`Webhook set to ${url}`);
  } catch (e) {
    console.error('Ошибка установки webhook:', e.message);
  }

  try {
    await bot.sendMessage(CHAT_ID, 'Начинаем работу! 🚀');
  } catch (e) {
    console.error('Не удалось отправить стартовое сообщение:', e.message);
  }

  // Первая проверка сразу
  await checkIndicators();
  // Дальше каждые 5 минут
  setInterval(checkIndicators, 5 * 60 * 1000);
}

// Запуск сервера + инициализация
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  init().catch(err => console.error('Init error:', err));
});

// Логирование необработанных ошибок Promises, чтобы ничего не терялось в логах
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
