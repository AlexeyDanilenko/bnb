const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment-timezone');

// Берём токен бота из переменной окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN || !CHAT_ID) {
  console.error('Пожалуйста, укажи TELEGRAM_TOKEN и TELEGRAM_CHAT_ID в переменных окружения');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN);

const coins = ['BNB', 'BTC', 'ETH', 'LINK', 'AVAX', 'DOT', 'TON', 'SOL', 'SUI'];
const base = 'USDC';

// Настройки индикаторов
const indicatorConfig = {
  rsi: { min: 0, max: 30 },       // пример для RSI
  bbp: { max: 0.2 }               // BB% <= 0.2
};

async function fetchIndicators(symbol) {
  // Здесь пример с Binance API
  // https://www.binance.com/en/support/faq/360033211192
  try {
    const rsiResp = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=15`);
    const closePrices = rsiResp.data.map(candle => parseFloat(candle[4]));
    
    // RSI
    let gains = 0, losses = 0;
    for (let i = 1; i < closePrices.length; i++) {
      const diff = closePrices[i] - closePrices[i-1];
      if (diff > 0) gains += diff;
      else losses += -diff;
    }
    const rs = gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));

    // BB%
    const sma = closePrices.reduce((a,b)=>a+b,0)/closePrices.length;
    const variance = closePrices.reduce((a,b)=>a+(b-sma)**2,0)/closePrices.length;
    const std = Math.sqrt(variance);
    const upper = sma + 2*std;
    const lower = sma - 2*std;
    const lastPrice = closePrices[closePrices.length-1];
    const bbp = (lastPrice - lower)/(upper - lower);

    return { rsi, bbp, lastPrice };
  } catch(e) {
    console.error(`Ошибка при получении данных для ${symbol}:`, e.message);
    return null;
  }
}

async function checkSignals() {
  for (const coin of coins) {
    const symbol = coin + base;
    const data = await fetchIndicators(symbol);
    if (!data) continue;

    const rsiOk = data.rsi <= indicatorConfig.rsi.max;
    const bbpOk = data.bbp <= indicatorConfig.bbp.max;

    if (rsiOk && bbpOk) {
      const msg = `Монета: ${symbol}\nСигнал сработал: ${moment().tz('Europe/Berlin').format('DD.MM.YYYY HH:mm')}\nКурс: ${data.lastPrice.toFixed(2)}`;
      console.log(msg);
      bot.sendMessage(CHAT_ID, msg);
    }
  }
}

// Запуск сразу и далее каждые 5 минут
checkSignals();
setInterval(checkSignals, 5*60*1000);
