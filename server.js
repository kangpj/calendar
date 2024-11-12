#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const app = express();
// votesManager is a separate module
const votesManager = require('./votesManager'); 


let usersData = {}; 
// Stores { clientId: { token, userId, nickname, department, role } }

const clients = [];
// key: websocket
// data: { IPaddress, secretNumber, clientId }

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let year = new Date().getFullYear();
let month = new Date().getMonth();
// votesManager.toggleVote(year, month);
let logSeq = 0;

wss.on('connection', (ws, req) => {

    // indivisual clients' properties
    const client = {};
    const currentClientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let currentClientId = null;
    let currentUserId = null;

    let currentDepartment = 'default'; // Initialize with default department

    console.log(`#${logSeq++} New client connected: from ${currentClientIP}` );
    
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'init') {

                currentClientId = parsedMessage.clientId;
                console.log(`#${logSeq++} New client initialized with clientId: ${currentClientId}` );
                
                // Check if userId exists for clientId
                if (!usersData[currentClientId]) {
                    // Generate a new userId for anonymous user
                    const newUserId = generateUserId();
                    usersData[currentClientId] = { 
                        userId: newUserId, 
                        isAnonymous: true,
                        passkey: null // Passkey 초기화
                    };
                    console.log(`Assigned new anonymous userId: ${newUserId} to clientId: ${currentClientId}`);
                    
                    // Broadcast to default department about the new anonymous user without clientId
                    broadcastDepartmentMessage('default', {
                        type: 'newClient',
                        data: { userId: newUserId, department: 'default' }
                    });
                }

                client[currentClientId] = {
                    ws:             ws,
                    ip:             currentClientIP,
                    secretNumber:   generateClientSecret(currentClientId),
                    department:     'default' // 부서 필드 추가
                };
                clients.push(client);
                // The very first message with vote status to the newly connected client
                ws.send(JSON.stringify({
                    type: 'updateVotes',
                    data: votesManager.getDefaultDepartment() 
                }));

                // default 부서의 모든 클라이언트에게 새로운 클라이언트 접속 방송 (clientId 제거)
                broadcastDepartmentMessage('default', {
                    type: 'newClient',
                    data: { userId: usersData[currentClientId].userId, department: 'default' }
                });
            } else if (parsedMessage.type === 'signIn') {
                const { department, nickname } = parsedMessage.data;
                const passkey = generatePasskey(); // 서버에서 패스키 생성

                if (!isUserSignedIn(currentClientId)) {
                    // 최초 로그인 시 패스키 저장
                    handleInitialSignIn(ws, department, nickname, passkey);
                } else {
                    // 부서 또는 닉네임 변경 시 패스키 인증
                    const providedPasskey = parsedMessage.data.passkey;
                    handleChangeSignIn(ws, department, nickname, providedPasskey);
                }

            } else if (parsedMessage.type === 'logout') {
                if (currentUserId) {
                    console.log('Logging for debug:(logout) ', currentUserId);
                    // 클라이언트의 userId와 부서를 가져옴
                    const user = usersData[currentClientId];
                    if (user) {
                        const { department } = user;
                        delete usersData[currentClientId];
                        votesManager.removeUserFromDepartment(department, currentUserId);
                        currentUserId = null;

                        // 부서에 사용자가 더 이상 없으면 부서 데이터 제거
                        if (!votesManager.hasMembers(department)) {
                            votesManager.removeDepartment(department);
                        }

                        // 부서에 사용자가 로그아웃했음을 방송 (clientId 제거)
                        broadcastDepartmentMessage(department, {
                            type: 'userLoggedOut',
                            data: { userId: user.userId, department }
                        });
                    }
                }
            } else if (parsedMessage.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong'
                }));
            } else if (parsedMessage.type === 'vote') {
                const { year, month, day, userId } = parsedMessage.data;
                console.log(`#${logSeq++} Debug:(vote) clientId>${currentClientId} userId>${userId}` );

                // Register vote in votesManager for the specific department
                votesManager.toggleVote(currentDepartment, year, month, day, userId);
                
                // Get filtered votes data for the specific year and month
                const votesData = votesManager.getAllVotes(currentDepartment, year, month);

                // Broadcast updated votes to all clients in the same department
                if (day === 0) {
                    // unicast
                    ws.send(JSON.stringify({
                        type: 'updateVotes',
                        data: votesData
                    }));
                } else {
                    broadcastDepartmentMessage(currentDepartment, {
                        type: 'updateVotes',
                        data: votesData
                    });
                }
            } else if (parsedMessage.type === 'getStatistics') {
                const { year, month } = parsedMessage.data;
                const { theDay, theNumber } = votesManager.getMostVotedDayInMonth(year, month);
                // unicast
                ws.send(JSON.stringify({
                    type: 'updateVoteStatistic',
                    data: {votersTotal: votesManager.getUniqueVoters(),
                           availableTotal: theNumber, 
                           theDay: theDay}
                }));

            } else if (parsedMessage.type === 'resetVotes' && usersData[currentClientId]?.isManager) {
                votesManager.clearAllVotes(currentDepartment);
                broadcastDepartmentMessage(currentDepartment, {
                    type: 'updateVotes',
                    data: votesManager.getAllVotes(currentDepartment)
                });
            } else if (parsedMessage.type === 'chat') {
                const { senderId, message: chatMessage, recipientIds } = parsedMessage.data;
                console.log(`Chat message from ${senderId}: ${chatMessage}`);
                
                // Prepare chat data to send
                const chatData = {
                    type: 'chat',
                    data: {
                        senderId,
                        message: chatMessage,
                        timestamp: new Date().toISOString(),
                    }
                };
                
                if (recipientIds && recipientIds.length > 0) {
                    // Private message to specific users
                    const recipients = votesManager.sendMessage(currentDepartment, senderId, recipientIds, chatMessage);
                    recipients.forEach(recipient => {
                        const recipientClient = clients.find(client => client[recipient.userId]);
                        if (recipientClient && recipientClient.ws.readyState === WebSocket.OPEN) {
                            recipientClient.ws.send(JSON.stringify(chatData));
                        }
                    });
                } else {
                    // Broadcast to all members in the department
                    broadcastDepartmentMessage(currentDepartment, chatData);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => closeClient(ws, currentClientIP, currentClientId, client, currentDepartment));
});

// Heartbeat function to keep connections alive
function heartbeat() {
    this.isAlive = true;
}

function closeClient(ws, ip, clientId, client, department) {

    const idx = clients.findIndex(item => item.clientId === clientId && item.department === department);
    if (idx > -1) clients.splice(idx, 1);
    ws.terminate();
    console.log(`Client from ${ip} disconnected from department ${department}`);

}

// Generate a unique hidden number for client verification
function generateClientSecret(clientId) {
    const secretNumber = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
    //clientSecretNumbers.set(clientId, secretNumber);
    return secretNumber; // Provide this to the user to save for verification
}

// Verify the client secret number to confirm decoupling
function verifyAndDecouple(clientId, providedSecret) {
    const storedSecret = clientSecretNumbers.get(clientId);

    if (storedSecret && storedSecret === providedSecret) {
        usersData.delete(clientId); // Decouple the clientId and userId
        clientSecretNumbers.delete(clientId); // Clear the secret
        return true;
    } else {
        throw new Error('Invalid secret number. Cannot decouple.');
    }
}

// BroadcastDepartmentMessage 함수 수정: clientId 제거
function broadcastDepartmentMessage(department, message) {
    const messageString = JSON.stringify(message);
    clients.forEach(clientObj => {
        // 각 클라이언트 객체의 부서를 확인
        for (const [clientId, client] of Object.entries(clientObj)) {
            if (client.department === department && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString);
            }
        }
    });
}

// Serve static files (e.g., the frontend HTML and JS files)
app.use(express.static('public'));

// Start the server
server.listen(3000, () => {
    console.log('Server running on port 3000');
});

// 유저 ID 생성 함수 추가
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// 패스키 유효성 검사 함수 추가 (예시)
function isValidPasskey(passkey) {
    const validPasskeys = ['secret123', 'adminPass', 'passkey456']; // 실제로는 더 안전한 방법을 사용하세요
    return validPasskeys.includes(passkey); 
}

// 패스키 생성 함수 추가
function generatePasskey() {
    const passkey = Math.random().toString(36).substr(2, 12); // 12자리 랜덤 문자열
    return passkey;
}

// 함수 추가: 초기 로그인 처리
function handleInitialSignIn(ws, department, nickname, passkey) {
    // department-nickname 쌍의 유일성 확인
    if (votesManager.isNicknameTaken(department, nickname)) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
        return;
    }

    // 기존 익명 사용자의 userId 업데이트
    const existingUser = usersData[currentClientId];
    if (existingUser && existingUser.isAnonymous) {
        existingUser.userId = generateUserId();
        existingUser.isAnonymous = false;
        existingUser.department = department;
        existingUser.nickname = nickname;
        existingUser.passkey = passkey; // passkey 저장
    } else {
        // 새로운 사용자 등록
        usersData[currentClientId] = { 
            userId: generateUserId(), 
            department, 
            nickname, 
            isManager: false,
            passkey: passkey // passkey 저장
        };
    }

    currentUserId = usersData[currentClientId].userId;
    currentDepartment = department;

    // 클라이언트 객체에 부서 정보 업데이트
    if (client[currentClientId]) {
        client[currentClientId].department = department;
    }

    // 부서에 사용자 추가 및 매니저 할당
    votesManager.addUserToDepartment(department, currentUserId);
    if (votesManager.isFirstUserInDepartment(department)) {
        usersData[currentClientId].isManager = true;
        votesManager.assignDepartmentManager(department, currentUserId);
        ws.send(JSON.stringify({ type: 'managerAuthenticated', passkey })); // passkey 전달
    } else {
        ws.send(JSON.stringify({ type: 'userInitialized', passkey })); // passkey 전달
    }

    // 부서에 새로운 사용자가 추가되었음을 방송 (clientId 제거)
    broadcastDepartmentMessage(department, {
        type: 'newUser',
        data: { userId: currentUserId, nickname, department }
    });

    console.log('User signed in:', usersData[currentClientId]);
}

// 함수 추가: 부서/닉네임 변경 시 패스키 인증 및 이전 데이터 제거
function handleChangeSignIn(ws, newDepartment, newNickname, providedPasskey) {
    const user = usersData[currentClientId];
    if (!user) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '사용자 데이터가 존재하지 않습니다.' }));
        return;
    }

    // 현재 부서와 닉네임과 다를 경우
    if (user.department !== newDepartment || user.nickname !== newNickname) {
        // 패스키 검증
        if (user.passkey !== providedPasskey) {
            ws.send(JSON.stringify({ type: 'signInFailed', message: '패스키 인증에 실패했습니다.' }));
            return;
        }

        // 부서-닉네임 쌍의 유일성 확인
        if (votesManager.isNicknameTaken(newDepartment, newNickname)) {
            ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
            return;
        }

        // 이전 부서에서 사용자 제거
        const oldDepartment = user.department;
        const userId = user.userId;
        votesManager.removeUserFromDepartment(oldDepartment, userId);

        // 부서에 사용자가 더 이상 없으면 부서 데이터 제거
        if (!votesManager.hasMembers(oldDepartment)) {
            votesManager.removeDepartment(oldDepartment);
        }

        // 새 부서에 사용자 추가
        user.department = newDepartment;
        user.nickname = newNickname;
        votesManager.addUserToDepartment(newDepartment, userId);

        // 매니저 할당
        if (votesManager.isFirstUserInDepartment(newDepartment)) {
            user.isManager = true;
            votesManager.assignDepartmentManager(newDepartment, userId);
            ws.send(JSON.stringify({ type: 'managerAuthenticated', passkey: user.passkey }));
        }

        // 부서 변경을 방송 (clientId 제거)
        broadcastDepartmentMessage(newDepartment, {
            type: 'newUser',
            data: { userId: userId, nickname: newNickname, department: newDepartment }
        });

        console.log('User changed department/nickname:', usersData[currentClientId]);
    }
}