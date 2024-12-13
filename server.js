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
    return user && user.type !== votesManager.userTypes.ANONYMOUS;
}



/**
 * Sends the updated user list to all clients.
 * Optionally filters by department.
 * @param {string} [departmentId='all'] - Department to filter users by.
 */
function broadcastUserList(departmentId = 'all') {
    let filteredUsers;
    if (departmentId === 'all') {
        filteredUsers = votesManager.getAllUsers();
    } else {
        filteredUsers = votesManager.getAllUsers().filter(user => user.department === departmentId);
    }
    broadcastMessage('userList', filteredUsers);
}

// WebSocket 연결 시 처리 로직
wss.on('connection', (ws) => {
    let registeredClientId = null;

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            // Handle 'init' message for client initialization
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

                // Check if clientId already exists in usersData
                const existingUserData = votesManager.getUserData(initClientId);
                if (!existingUserData) {
                    // If not, create an anonymous user and associate with clientId
                    const anonymousUser = await votesManager.addAnonymousUser();
                    votesManager.addUser(initClientId, anonymousUser.userId, votesManager.defaultDepartmentId, anonymousUser.name, anonymousUser.userType);
                }

                registeredClientId = initClientId;
                clients.set(registeredClientId, { ws, clientId: registeredClientId });
                console.log(`Client initialized with clientId: ${registeredClientId}`);

                const userData = votesManager.getUserData(registeredClientId);
                sendMessage(ws, 'initSuccess', userData);

                // Broadcast updated user list to all clients
                broadcastUserList();
                return;
            }

            // Ensure the client is initialized before handling other messages
            if (!registeredClientId) {
                sendMessage(ws, 'error', { message: 'Client not initialized. Please send an init message first.' });
                return;
            }

            // Handle 'signUp' message
            if (parsedMessage.type === 'signUp') {
                const { name, phone, passkey } = parsedMessage.data;
                try {
                    // Prevent anonymous sign-up
                    if (!name || !phone || !passkey) {
                        sendMessage(ws, 'signUpFailed', { message: 'Name, phone, and passkey are required for sign-up.' });
                        return;
                    }

                    // Attempt to sign up the user
                    const newUser = await votesManager.addSignUpUser(name, phone, passkey);
                    votesManager.addUser(registeredClientId, newUser.userId, 'float', newUser.name, newUser.userType);

                    sendMessage(ws, 'signUpSuccess', newUser);

                    // Broadcast new user to all clients in the 'float' department, excluding the sender
                    broadcastMessage('newUser', { userId: newUser.userId, name: newUser.name, department: 'float' }, [registeredClientId]);

                    // Broadcast updated user list to all clients
                    broadcastUserList();
                } catch (error) {
                    sendMessage(ws, 'signUpFailed', { message: error.message });
                }
            }
            // Handle 'signIn' message
            else if (parsedMessage.type === 'signIn') {
                const { phone, passkey } = parsedMessage.data;
                try {
                    // If client is already signed in, prevent re-signing
                    if (isUserSignedIn(registeredClientId)) {
                        sendMessage(ws, 'signInFailed', { message: '이미 로그인 상태입니다.' });
                        return;
                    }

                    // Perform authentication for non-anonymous users
                    const userData = await votesManager.loginUser(registeredClientId, phone, passkey);
                    sendMessage(ws, 'signInSuccess', userData);

                    // Broadcast updated user list to all clients
                    broadcastUserList();
                } catch (error) {
                    sendMessage(ws, 'signInFailed', { message: error.message });
                }
            }
            // Handle 'updateVote' message
            else if (parsedMessage.type === 'updateVote') {
                const { departmentId, date } = parsedMessage.data;
                const userData = votesManager.getUserData(registeredClientId);
                if (!userData) {
                    sendMessage(ws, 'error', { message: '사용자 데이터가 없습니다.' });
                    return;
                }

                try {
                    votesManager.updateVote(departmentId, date, userData.userId);
                    sendMessage(ws, 'voteUpdated', { departmentId, date });

                    // Optionally, broadcast updated vote stats
                    // For example:
                    const allVotes = votesManager.getDepartmentVotes(departmentId);
                    broadcastMessage('votesUpdated', { departmentId, votes: allVotes }, [registeredClientId]);
                } catch (error) {
                    sendMessage(ws, 'error', { message: error.message });
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
                const { departmentId, userId } = userData;
                votesManager.removeUser(userId);

                // Broadcast user logout
                broadcastMessage('userLoggedOut', { userId, departmentId }, [registeredClientId]);
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
