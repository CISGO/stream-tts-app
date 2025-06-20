const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
// Получаем секретный путь из переменных окружения Render.com.
// Если его там нет, используем путь по умолчанию, который легко угадать.
const OBS_SECRET_PATH = process.env.OBS_SECRET_PATH || '/obs-widget-default-path';

const app = express();

// Обслуживаем статические файлы (CSS, и т.д.)
app.use(express.static(path.join(__dirname, 'public')));

// --- НОВАЯ МАРШРУТИЗАЦИЯ ---
// 1. Главная страница '/' теперь отдает пульт управления
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

// 2. Секретный адрес отдает страницу для OBS
app.get(OBS_SECRET_PATH, (req, res) => {
    // Важно, чтобы файл назывался obs.html
    res.sendFile(path.join(__dirname, 'public', 'obs.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- НОВАЯ ЛОГИКА WebSocket ---
// Будем хранить клиентов OBS и пульты управления в разных списках
const obsClients = new Set();
const controlPanelClients = new Set();

console.log('Сервер запущен.');
console.log(`Пульт управления доступен по адресу: /`);
console.log(`Виджет для OBS доступен по секретному адресу: ${OBS_SECRET_PATH}`);

// `req` - это входящий запрос на подключение, в нем есть URL, по которому пришел клиент
wss.on('connection', (ws, req) => {
    const connectedUrl = req.url;
    
    // Разделяем клиентов при подключении
    if (connectedUrl.startsWith(OBS_SECRET_PATH)) {
        console.log('Клиент OBS подключился!');
        obsClients.add(ws);
    } else {
        console.log('Клиент пульта управления подключился!');
        controlPanelClients.add(ws);
    }
    
    // Обрабатываем сообщения, только если они пришли от пульта
    ws.on('message', (message) => {
        if (!controlPanelClients.has(ws)) {
            // Игнорируем сообщения от клиентов OBS
            return;
        }

        try {
            const data = JSON.parse(message);
            // Проверка ключа БОЛЬШЕ НЕ НУЖНА
            if (data.type === 'speak') {
                console.log(`Получена команда: голос=${data.voiceName}, текст="${data.text}"`);
                
                // Рассылаем команду ТОЛЬКО клиентам OBS
                obsClients.forEach((obsClient) => {
                    if (obsClient.readyState === WebSocket.OPEN) {
                        obsClient.send(JSON.stringify({
                            type: 'play',
                            text: data.text,
                            voiceName: data.voiceName
                        }));
                    }
                });
            }
        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });

    ws.on('close', () => {
        // Удаляем клиента из соответствующего списка при отключении
        if (obsClients.has(ws)) {
            obsClients.delete(ws);
            console.log('Клиент OBS отключился');
        } else if (controlPanelClients.has(ws)) {
            controlPanelClients.delete(ws);
            console.log('Клиент пульта управления отключился');
        }
    });
});

server.listen(PORT, () => console.log(`Сервер слушает порт ${PORT}`));
