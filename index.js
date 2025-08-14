const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Токен бота должен быть в переменных окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Прямо прописанный chat ID
const CHAT_ID = 235189880;

// Бот без polling
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Настраиваем webhook
const BASE_URL = 'https://monitoring-bnb-i-pr.onrender.com'; // Замени на свой URL
bot.setWebHook(`${BASE_URL}/bot${TELEGRAM_TOKEN}`);

// Парсим входящие POST-запросы от Telegram
app.use(express.json());
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Монеты для отслеживания
const coins = ["BNBUSDC","BTCUSDC","ETHUSDC","LINKUSDC","AVAXUSDC","DOTUSDC","TONUSDC","SOLUSDC","SUIUSDC"];

// Пороговые значения индикаторов
const thresholds = {
  RSI: 32,
  BB: 0.2
};

// Хранилище цен для проверки 1% падения
const lastSignalPrice = {};

// Функция вычисления RSI
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Функция вычисления BB%
function calculateBBPercent(closes) {
  if (closes.length === 0) return null;

  const len = closes.length;
  const mean = closes.reduce((a,b)=>a+b,0)/len;
  const variance = closes.reduce((a,b)=>a + Math.pow(b - mean,2),0)/len;
  const std = Math.sqrt(variance);
  const upper = mean + 2*std;
  const lower = mean - 2*std;
  const last = closes[closes.length -1];
  return (last - lower)/(upper - lower);
}

// Основная проверка
async function checkIndicators() {
  const now = new Date();
  const timeStr = now.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  for (const coin of coins) {
    try {
      const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${coin}&interval=5m&limit=20`);
      const closes = response.data.map(c => parseFloat(c[4])); 

      if (!closes || closes.length < 2) {
        console.warn(`Недостаточно данных для ${coin}, пропускаем`);
        continue;
      }

      const rsi = calculateRSI(closes);
      const bbPercent = calculateBBPercent(closes);

      if (rsi === null || bbPercent === null) {
        console.warn(`Ошибка расчёта индикаторов для ${coin}, пропускаем`);
        continue;
      }

      const price = closes[closes.length - 1];
      const signal = rsi <= thresholds.RSI && bbPercent <= thresholds.BB;

      // Проверка 1% от последнего сигнала
      if (signal && lastSignalPrice[coin]) {
        const minPrice = lastSignalPrice[coin] * 0.99;
        if (price > minPrice) {
          console.log(`${coin} | Сигнал заблокирован из-за 1% правила, текущая цена: ${price.toFixed(2)}`);
          continue;
        }
      }

      console.log(`${coin} | Цена: ${price.toFixed(2)}, RSI: ${rsi.toFixed(2)}, BB%: ${bbPercent.toFixed(2)}, Signal: ${signal}`);

      if (signal) {
        const msg = `Монета: ${coin}\nСигнал сработал: ${timeStr}\nКурс: ${price.toFixed(2)}`;
        await bot.sendMessage(CHAT_ID, msg);
        lastSignalPrice[coin] = price; // сохраняем цену сигнала
      }

    } catch (err) {
      console.error("Ошибка при проверке", coin, err.message);
    }
  }
}

// Проверка сразу при старте
checkIndicators();

// Проверка каждые 5 минут
setInterval(checkIndicators, 5 * 60 * 1000);

// Минимальный HTTP маршрут
app.get('/', (req, res) => {
  res.send('Crypto Signal Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
