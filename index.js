const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Твой Telegram токен и chat_id через переменные окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Монеты для отслеживания
const coins = ["BNBUSDC","BTCUSDC","ETHUSDC","LINKUSDC","AVAXUSDC","DOTUSDC","TONUSDC","SOLUSDC","SUIUSDC"];

// Пороговые значения индикаторов
const thresholds = {
  RSI: { min: 0, max: 30 },
  BB: { max: 0.2 }
};

// Функция проверки индикаторов (пример)
async function checkIndicators() {
  const now = new Date();
  const timeStr = now.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }); // UTC+2
  for (const coin of coins) {
    try {
      // Здесь вставляешь свой код для получения данных с Binance
      // Пример запроса к Binance API
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${coin}`);
      const price = parseFloat(response.data.price);

      // Здесь твоя логика по индикаторам, пример:
      const rsi = Math.random() * 100;   // заглушка
      const bbPercent = Math.random();    // заглушка

      const signal =
        rsi >= thresholds.RSI.min && rsi <= thresholds.RSI.max &&
        bbPercent <= thresholds.BB.max;

      if (signal) {
        const msg = `Монета: ${coin}\nСигнал сработал: ${timeStr}\nКурс: ${price.toFixed(2)}`;
        console.log(msg);
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
