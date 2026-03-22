const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const express = require('express');
const config = require('./settings.json');
const keep_alive = require('./keep_alive.js');

const app = express();
app.get('/', (req, res) => res.send('Bot is alive'));
app.listen(process.env.PORT || 8000, () => console.log('Web server started'));

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully registered') || message.includes('already registered')) {
          resolve();
        } else {
          reject(`Registration failed: ${message}`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully logged in')) {
          resolve();
        } else {
          reject(`Login failed: ${message}`);
        }
      });
    });
  }

  bot.once('spawn', () => {
    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(console.error);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages'].messages;
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.utils['anti-afk'].enabled) {
      setInterval(() => bot.setControlState('jump', true), 5000);
    }

    const startPos = bot.entity.position.clone();
    const positions = [
      startPos.offset(3, 0, 0),
      startPos.offset(3, 0, 3),
      startPos.offset(0, 0, 3),
      startPos.offset(-3, 0, 3),
      startPos.offset(-3, 0, 0),
      startPos.offset(-3, 0, -3),
      startPos.offset(0, 0, -3),
      startPos.offset(3, 0, -3),
      startPos
    ];
    let index = 0;

    bot.pathfinder.setMovements(defaultMove);
    setInterval(() => {
      const pos = positions[index];
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      index = (index + 1) % positions.length;
    }, 6000);
  });

  bot.on('goal_reached', () => {
    console.log(`[AfkBot] Reached a goal: ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log('[AfkBot] Bot died and respawned');
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => setTimeout(createBot, config.utils['auto-recconect-delay']));
  }

  bot.on('kicked', reason => console.log(`[AfkBot] Kicked: ${reason}`));
  bot.on('error', err => console.log(`[ERROR] ${err.message}`));
}

createBot();
