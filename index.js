const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Монеты для отслеживания
const coins = ["BNBUSDC","BTCUSDC","ETHUSDC","LINKUSDC","AVAXUSDC","DOTUSDC","TONUSDC","SOLUSDC","SUIUSDC"];

// Пороговые значения индикаторов
const thresholds = {
  RSI: 30,
  BB: 0.2
};

// Функция вычисления RSI
function calculateRSI(closes, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff; // отрицательное число
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss || 0;
  return 100 - (100 / (1 + rs));
}

// Функция вычисления BB%
function calculateBBPercent(closes) {
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
      const closes = response.data.map(c => parseFloat(c[4])); // Закрытие свечи

      const rsi = calculateRSI(closes);
      const bbPercent = calculateBBPercent(closes);

      const signal = rsi <= thresholds.RSI && bbPercent <= thresholds.BB;

      console.log(`${coin} | RSI: ${rsi.toFixed(2)}, BB%: ${bbPercent.toFixed(2)}, Signal: ${signal}`);

      if (signal) {
        const price = closes[closes.length - 1];
        const msg = `Монета: ${coin}\nСигнал сработал: ${timeStr}\nКурс: ${price.toFixed(2)}`;
        await bot.sendMessage(CHAT_ID, msg);
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
