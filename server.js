#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const votesManager = require('./votesManager'); 

// 서버 생성 및 WebSocket 설정
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 클라이언트 관리: clientId를 키로 하는 Map
const clients = new Map();

// 현재 연도 및 월 설정
let year = new Date().getFullYear();
let month = new Date().getMonth() + 1; // 1-12 범위로 수정
let logSeq = 0;

/**
 * Sends a structured message to a specific WebSocket client.
 * @param {WebSocket} ws - The WebSocket connection to send the message through.
 * @param {string} type - The type/category of the message.
 * @param {Object} data - The payload of the message.
 */
function sendMessage(ws, type, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error(`Cannot send message, WebSocket is not open. Type: '${type}'`);
        return;
    }

    const message = { type, data };
    ws.send(JSON.stringify(message), (err) => {
        if (err) {
            console.error(`Error sending message of type '${type}':`, err);
        } else {
            console.log(`Sent message of type '${type}':`, data);
        }
    });
}

/**
 * Broadcasts a structured message to all connected WebSocket clients.
 * @param {string} type - The type/category of the message.
 * @param {Object} data - The payload of the message.
 * @param {Array<string>} excludeClientIds - (Optional) Array of clientIds to exclude from broadcasting.
 */
function broadcastMessage(type, data, excludeClientIds = []) {
    const message = { type, data };
    const messageString = JSON.stringify(message);
    clients.forEach((clientObj, clientId) => {
        if (
            clientObj.ws.readyState === WebSocket.OPEN &&
            !excludeClientIds.includes(clientId)
        ) {
            clientObj.ws.send(messageString, (err) => {
                if (err) {
                    console.error(`Error broadcasting message of type '${type}' to client '${clientId}':`, err);
                }
            });
        }
    });
    console.log(`Broadcasted message of type '${type}' to all clients:`, data);
}

// 헬퍼 함수: 사용자 로그인 상태 확인
function isUserSignedIn(clientId) {
    const user = votesManager.getUserData(clientId);
    return user && !user.isAnonymous;
}

// 사용자 목록을 특정 클라이언트에게 전송하는 함수
function sendUserList(ws, clientId) {
    const userData = votesManager.getUserData(clientId);
    if (!userData) {
        sendMessage(ws, 'error', { message: '사용자 데이터가 없습니다.' });
        return;
    }

    const targetDepartments = [userData.department, 'float']; // 자신의 부서와 기본 부서
    const userList = votesManager.getAllUsers()
        .filter(user => targetDepartments.includes(user.department))
        .map(user => ({
            userId: user.userId,
            nickname: user.nickname,
            department: user.department,
            isManager: user.isManager,
            isSelf: user.clientId === clientId // 클라이언트 자신인지 확인
        }));

    sendMessage(ws, 'userList', userList);
}

// 사용자 목록을 모든 클라이언트에게 전송하는 함수
function broadcastUserList(departmentId = 'all') {
    const allUsers = votesManager.getAllUsers();

    if (departmentId === 'all') {
        broadcastMessage('userList', allUsers);
    } else {
        broadcastMessage('userList', allUsers.filter(user => user.department === departmentId));
    }
}

// WebSocket 연결 핸들링
wss.on('connection', (ws, req) => {

    let registeredClientId = null;

    console.log(`New client connected. Awaiting initialization.`);

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            if (parsedMessage.type === 'init') {
                const { clientId: initClientId } = parsedMessage.data;
                if (!initClientId) {
                    sendMessage(ws, 'error', { message: 'Invalid clientId.' });
                    return;
                }

                if (clients.has(initClientId)) {
                    sendMessage(ws, 'error', { message: 'clientId already in use.' });
                    ws.close();
                    return;
                }
                // Register as Anonymous User 
                // Assuming 'float' is a fallback department
                const newUser = await votesManager.addUser(initClientId, 'float', null, null, true);                 

                registeredClientId = initClientId;
                clients.set(registeredClientId, { ws, clientId: registeredClientId });
                console.log(`Client initialized with clientId: ${registeredClientId}`);

                sendMessage(ws, 'initSuccess', { clientId: registeredClientId });

                // Broadcast updated user list to all clients
                broadcastUserList('float');
                return;
            }

            // Ensure the client has been initialized
            if (!registeredClientId) {
                sendMessage(ws, 'error', { message: 'Client not initialized. Please send init message first.' });
                return;
            }

            // Handle other message types...
            if (parsedMessage.type === 'signIn') {
                const { department, nickname, passkey, isAnonymous } = parsedMessage.data;
                try {
                    const newUser = await votesManager.addUser(registeredClientId, department, nickname, passkey, isAnonymous);
                    if (clients.has(registeredClientId)) {
                        clients.get(registeredClientId).userId = newUser.userId;
                        clients.get(registeredClientId).department = newUser.department;
                    }

                    sendMessage(ws, 'signInSuccess', newUser);

                    // Broadcast new user to the specific department, excluding the sender
                    broadcastMessage('newUser', { userId: newUser.userId, nickname: newUser.nickname, department }, [registeredClientId]);

                    // Broadcast updated user list to all clients
                    broadcastUserList();
                } catch (error) {
                    sendMessage(ws, 'signInFailed', { message: error.message });
                }
            }

            // Handle 'updateStats' message
            else if (parsedMessage.type === 'updateStats') {
                // Example: Update user statistics or similar
                // Implement necessary logic here

                // After updating stats, broadcast the updated user list
                broadcastUserList();
            } 
            else if (parsedMessage.type === 'ping') {
                sendMessage(ws, 'pong', { message: 'OK' });
            }
            else {
                sendMessage(ws, 'error', { message: `Unknown message type: ${parsedMessage.type}` });
            }

        } catch (error) {
            console.error('Error processing message:', error);
            sendMessage(ws, 'error', { message: error.message });
        }
    });

    ws.on('close', () => {
        if (registeredClientId) {
            console.log(`Client disconnected: ${registeredClientId}`);
            const userData = votesManager.getUserData(registeredClientId);
            if (userData) {
                const { department, userId } = userData;
                votesManager.removeUserFromDepartment(department, userId);
                votesManager.removeUser(registeredClientId);

                // Remove department if empty
                if (!votesManager.hasMembers(department)) {
                    votesManager.removeDepartment(department);
                }

                // Broadcast user logout
                broadcastMessage('userLoggedOut', { userId, department }, [registeredClientId]);
            }
            clients.delete(registeredClientId);
            broadcastUserList();
        } else {
            console.log('A client disconnected before initialization.');
        }
    });
});

// 정적 파일 제공 (예: 프론트엔드 HTML 및 JS 파일)
app.use(express.static('public'));

// 서버 시작
server.listen(3000, () => {
    console.log('서버가 포트 3000에서 실행 중입니다.');
});
