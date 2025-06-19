// Импортируем необходимые библиотеки
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Установим порт. Render.com предоставит свой, для локального теста будет 3000
const PORT = process.env.PORT || 3000;

// ВАЖНО: Придумайте и впишите сюда свой секретный ключ для защиты.
// Этот же ключ нужно будет вводить на странице управления.
const SECRET_KEY = "PASTAR-SBOR"; // <-- ИЗМЕНИТЕ ЭТО! Например: "super-streamer-123"

// Создаем Express приложение
const app = express();
// Обслуживаем статические файлы из папки 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Создаем HTTP сервер
const server = http.createServer(app);

// Создаем WebSocket сервер
const wss = new WebSocket.Server({ server });

console.log('Сервер запущен. Ожидание подключений...');

// Обрабатываем новые подключения
wss.on('connection', (ws) => {
    console.log('Клиент подключился');

    // Обрабатываем сообщения от клиента
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Проверяем тип сообщения
            if (data.type === 'speak' && data.key === SECRET_KEY) {
                console.log(`Получен текст для озвучки: "${data.text}"`);
                
                // Рассылаем сообщение всем клиентам, кроме отправителя (пульта)
                wss.clients.forEach((client) => {
                    // Отправляем только тем, кто не является отправителем, и кто готов к приему
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        // Отправляем только текст и голос, БЕЗ ключа
                        client.send(JSON.stringify({
                            type: 'play',
                            text: data.text,
                            voiceName: data.voiceName
                        }));
                    }
                });
            } else if (data.key !== SECRET_KEY) {
                console.warn('Получена попытка отправки с неверным ключом!');
            }

        } catch (e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });

    ws.on('close', () => {
        console.log('Клиент отключился');
    });
});

// Запускаем сервер на прослушивание порта
server.listen(PORT, () => {
    console.log(`Сервер слушает порт ${PORT}`);
});