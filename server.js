const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
// Получаем секретные пути из переменных окружения Render.com
const OBS_SECRET_PATH = process.env.OBS_SECRET_PATH || '/obs-widget-default';
const ADMIN_SECRET_PATH = process.env.ADMIN_SECRET_PATH || '/admin-panel-default';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// --- Маршрутизация страниц ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));
app.get(OBS_SECRET_PATH, (req, res) => res.sendFile(path.join(__dirname, 'public', 'obs.html')));
app.get(ADMIN_SECRET_PATH, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Состояние сервера ---
let queue = [];
let history = [];
let nowPlaying = null;
let isSpeaking = false;

const obsClients = new Set();
const controlClients = new Set();
const adminClients = new Set();

console.log('Сервер запущен с админ-панелью.');
console.log(`Админка доступна по адресу: ${ADMIN_SECRET_PATH}`);
console.log(`Виджет для OBS доступен по адресу: ${OBS_SECRET_PATH}`);

// Функция для рассылки обновлений состояния всем админам
function broadcastState() {
    const state = JSON.stringify({
        queue,
        history: history.slice(-20), // Отправляем последние 20 для экономии трафика
        nowPlaying
    });
    adminClients.forEach(client => client.send(state));
}

// Главная функция обработки очереди
function processQueue() {
    if (isSpeaking || queue.length === 0) {
        return;
    }
    isSpeaking = true;
    nowPlaying = queue.shift();

    // Отправляем команду на озвучку только клиентам OBS
    obsClients.forEach(client => client.send(JSON.stringify({
        type: 'play',
        ...nowPlaying
    })));

    broadcastState(); // Обновляем состояние для админки
}

wss.on('connection', (ws, req) => {
    // Разделяем клиентов по URL при подключении
    if (req.url.startsWith(OBS_SECRET_PATH)) {
        obsClients.add(ws);
        console.log('Клиент OBS подключился');
    } else if (req.url.startsWith(ADMIN_SECRET_PATH)) {
        adminClients.add(ws);
        console.log('Клиент админ-панели подключился');
        ws.send(JSON.stringify({ queue, history: history.slice(-20), nowPlaying }));
    } else {
        controlClients.add(ws);
        console.log('Клиент пульта управления подключился');
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                // Сообщение от пульта
                case 'speak':
                    if (controlClients.has(ws)) {
                        const newMessage = {
                            id: Date.now(),
                            sender: data.sender,
                            text: data.text,
                            voiceName: data.voiceName,
                            timestamp: new Date().toLocaleTimeString('ru-RU')
                        };
                        queue.push(newMessage);
                        processQueue();
                        broadcastState();
                    }
                    break;

                // Сообщение от OBS, что озвучка закончена
                case 'speech_finished':
                    if (obsClients.has(ws) && nowPlaying) {
                        history.push(nowPlaying);
                        nowPlaying = null;
                        isSpeaking = false;
                        processQueue();
                        broadcastState();
                    }
                    break;
                
                // Сообщение от админки на пропуск
                case 'skip_current':
                    if (adminClients.has(ws) && nowPlaying) {
                        nowPlaying.status = 'пропущено';
                        history.push(nowPlaying);
                        nowPlaying = null;
                        isSpeaking = false;
                        obsClients.forEach(client => client.send(JSON.stringify({ type: 'stop' })));
                        processQueue();
                        broadcastState();
                    }
                    break;
            }
        } catch (e) { console.error('Ошибка:', e); }
    });

    ws.on('close', () => {
        obsClients.delete(ws);
        adminClients.delete(ws);
        controlClients.delete(ws);
        console.log('Клиент отключился');
    });
});

server.listen(PORT, () => console.log(`Сервер слушает порт ${PORT}`));