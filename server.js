const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OBS_SECRET_PATH = process.env.OBS_SECRET_PATH || '/obs-widget-default';
const ADMIN_SECRET_PATH = process.env.ADMIN_SECRET_PATH || '/admin-panel-default';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'control.html')));
app.get(OBS_SECRET_PATH, (req, res) => res.sendFile(path.join(__dirname, 'public', 'obs.html')));
app.get(ADMIN_SECRET_PATH, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let queue = [];
let history = [];
let nowPlaying = null;
let isSpeaking = false;

const obsClients = new Set();
const controlClients = new Set();
const adminClients = new Set();

console.log('Сервер запущен с исправленной логикой.');

function broadcastState() {
    const combinedList = [];
    if (nowPlaying) {
        combinedList.push({ ...nowPlaying, status: 'playing' });
    }
    queue.forEach(msg => combinedList.push({ ...msg, status: 'queued' }));
    history.slice(-20).reverse().forEach(msg => combinedList.push({ ...msg, status: msg.status || 'played' }));
    
    const state = JSON.stringify({ messages: combinedList });
    adminClients.forEach(client => client.send(state));
}

function processQueue() {
    if (isSpeaking || queue.length === 0) {
        return;
    }
    isSpeaking = true;
    nowPlaying = queue.shift();

    obsClients.forEach(client => client.send(JSON.stringify({ type: 'play', ...nowPlaying })));
    broadcastState();
}

wss.on('connection', (ws, req) => {
    if (req.url.startsWith(OBS_SECRET_PATH)) obsClients.add(ws);
    else if (req.url.startsWith(ADMIN_SECRET_PATH)) {
        adminClients.add(ws);
        broadcastState();
    }
    else controlClients.add(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'speak':
                    if (controlClients.has(ws)) {
                        queue.push({ id: Date.now(), sender: data.sender, text: data.text, voiceName: data.voiceName, timestamp: new Date().toLocaleTimeString('ru-RU') });
                        processQueue();
                        broadcastState();
                    }
                    break;
                case 'speech_finished':
                    if (obsClients.has(ws) && nowPlaying) {
                        history.push(nowPlaying);
                        nowPlaying = null;
                        isSpeaking = false;
                        processQueue();
                        broadcastState();
                    }
                    break;
                case 'skip_message':
                    if (adminClients.has(ws) && data.id) {
                        const messageId = data.id;
                        let skippedMessage = null;
                        if (nowPlaying && nowPlaying.id === messageId) {
                            skippedMessage = nowPlaying;
                            nowPlaying = null; isSpeaking = false;
                            obsClients.forEach(client => client.send(JSON.stringify({ type: 'stop' })));
                            processQueue();
                        } else {
                            const index = queue.findIndex(msg => msg.id === messageId);
                            if (index > -1) {
                                skippedMessage = queue.splice(index, 1)[0];
                            }
                        }
                        if (skippedMessage) {
                            skippedMessage.status = 'skipped';
                            history.push(skippedMessage);
                            broadcastState();
                        }
                    }
                    break;
            }
        } catch (e) { console.error('Ошибка:', e); }
    });

    ws.on('close', () => {
        obsClients.delete(ws);
        adminClients.delete(ws);
        controlClients.delete(ws);
    });
});

server.listen(PORT, () => console.log(`Сервер слушает порт ${PORT}`));