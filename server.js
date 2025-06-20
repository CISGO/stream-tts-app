const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SECRET_KEY = "PASTAR"; // Убедитесь, что этот ключ совпадает с тем, что вы вводите

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log('Сервер для браузерного TTS запущен.');

wss.on('connection', (ws) => {
    console.log('Клиент подключился');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // ИСПРАВЛЕНО: Теперь сервер слушает правильный тип сообщения 'speak'
            if (data.type === 'speak' && data.key === SECRET_KEY) {
                console.log(`Получена команда: голос=${data.voiceName}, текст="${data.text}"`);
                
                // Пересылаем команду всем остальным клиентам (в OBS)
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        // Отправляем тип 'play', который ожидает index.html
                        client.send(JSON.stringify({
                            type: 'play',
                            text: data.text,
                            voiceName: data.voiceName
                        }));
                    }
                });
            }
        } catch (e) { console.error('Ошибка:', e); }
    });
    ws.on('close', () => console.log('Клиент отключился'));
});

server.listen(PORT, () => console.log(`Сервер слушает порт ${PORT}`));