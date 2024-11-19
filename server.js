#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const votesManager = require('./votesManager'); 

// 서버 생성 및 WebSocket 설정
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 사용자 데이터 저장소
// let usersData = {}; 
// 형식: { clientId: { userId, nickname, department, isManager, isAnonymous, passkey } }

// 클라이언트 관리: clientId를 키로 하는 Map
// const clients = new Map();



// 현재 연도 및 월 설정
let year = new Date().getFullYear();
let month = new Date().getMonth() + 1; // 1-12 범위로 수정
let logSeq = 0;

// 헬퍼 함수: 사용자 로그인 상태 확인
function isUserSignedIn(clientId) {
    const user = usersData[clientId];
    return user && !user.isAnonymous;
}

// 유저 ID 생성 함수
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// 패스키 생성 함수
function generatePasskey() {
    return Math.random().toString(36).substr(2, 12); // 12자리 랜덤 문자열
}

// 클라이언트 숨겨진 번호 생성 함수
function generateClientSecret(clientId) {
    return Math.floor(100000 + Math.random() * 900000); // 6-digit random number
}

// 부서에 메시지 방송 함수 (clientId 제거)
function broadcastDepartmentMessage(department, message, clientIdCur = null) {
    const messageString = JSON.stringify(message);
    clients.forEach((clientObj, clientId) => {
        if (clientObj.department === department && clientObj.ws.readyState === WebSocket.OPEN && clientId != clientIdCur) {
            clientObj.ws.send(messageString);
        }
    });
}

// 사용자 목록을 특정 클라이언트에게 전송하는 함수
function sendUserList(ws, clientId) {
    const currentUser = usersData[clientId];
    if (!currentUser) {
        ws.send(JSON.stringify({ type: 'error', message: '사용자 데이터가 없습니다.' }));
        return;
    }

    const targetDepartments = [currentUser.department]; // Only the client's own department
    const userList = Object.entries(usersData)
        .filter(([id, user]) => targetDepartments.includes(user.department))
        .map(([id, user]) => ({
            userId: user.userId,
            nickname: user.nickname,
            department: user.department,
            isManager: user.isManager,
            isSelf: id === clientId // 클라이언트 자신인지 확인
        }));

    ws.send(JSON.stringify({ type: 'userList', data: userList }));
}

// 초기 로그인 처리 함수 (Case 1.1, 2.1)
function handleInitialSignIn(ws, clientId, department, nickname) {
    // department-nickname 쌍의 유일성 확인, Case 2.1 Denial
    if (votesManager.isNicknameTaken(department, nickname)) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
        return;
    } else {
        console.log(`#${department} members: `, votesManager.getDepartmentMembers(department));
    }

    // 새로운 userId 및 패스키 생성
    const newUserId = generateUserId();
    const passkey = generatePasskey();

    // 사용자 데이터 등록
    usersData[clientId] = { 
        userId: newUserId, 
        department, 
        nickname, 
        isManager: false, 
        isAnonymous: false,
        passkey 
    };
    console.log(`User registered: ${newUserId} in department ${department}`);
    ws.send(JSON.stringify({ type: 'setUserId', data: usersData[clientId] }));
    // 부서에 사용자 추가
    votesManager.addUserToDepartment(department, newUserId);

    // 부서에 첫 번째 사용자라면 매니저로 지정
    if (votesManager.isFirstUserInDepartment(department)) {
        usersData[clientId].isManager = true;
        votesManager.assignDepartmentManager(department, newUserId);
        ws.send(JSON.stringify({ type: 'signInSuccess', message: '성공적으로 로그인되었습니다.', department }));
    } else {
        ws.send(JSON.stringify({ type: 'signInSuccess', message: '성공적으로 로그인되었습니다.', department }));
    }

    // 부서에 새로운 사용자 방송
    broadcastDepartmentMessage(department, {
        type: 'newUser',
        data: { userId: newUserId, nickname, department }
    ,});

    // 사용자 목록 업데이트를 모든 클라이언트에게 전송
    broadcastUserList();
}

// 부서 변경 시 패스키 인증 및 사용자 데이터 교체 함수 (Case 1.2)
function handleChangeSignIn(ws, clientId, department, nickname, providedPasskey) {
    const user = usersData[clientId];
    if (!user) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '사용자 데이터가 존재하지 않습니다.' }));
        return;
    }

    // 패스키 검증
    if (user.passkey !== providedPasskey) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '패스키 인증에 실패했습니다.' }));
        return;
    }

    // department-nickname 쌍의 유일성 확인
    if (votesManager.isNicknameTaken(department, nickname)) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
        return;
    }

    updateUserDepartment(clientId, department, nickname, generatePasskey())

    ws.send(JSON.stringify({ type: 'signInSuccess', message: '패스키 인증 후 성공적으로 로그인되었습니다.', passkey: user.passkey }));

    // 새로운 부서에 사용자 방송
    broadcastDepartmentMessage(department, {
        type: 'newUser',
        data: { userId, nickname, department }
    }, userId);

    console.log('User changed department/nickname:', usersData[clientId]);

    // 사용자 목록 업데이트를 모든 클라이언트에게 전송
    broadcastUserList();
}

// Function to update user department, nickname, and passkey
function updateUserDepartment(clientId, department, nickname, passkey) {
    const user = usersData[clientId];
    if (user) {
        // Remove user from old department
        const oldDepartment = user.department;
        votesManager.removeUserFromDepartment(oldDepartment, user.userId);
        // 부서에 사용자가 더 이상 없으면 부서 데이터 제거
        if (!votesManager.hasMembers(oldDepartment)) {
            votesManager.removeDepartment(oldDepartment);
        }
        // 부서에 첫 번째 사용자라면 매니저로 지정
        if (votesManager.isFirstUserInDepartment(department)) {
            user.isManager = true;
            votesManager.assignDepartmentManager(department, user.userId);     
        }        
        // Update user data
        user.department = department;
        user.nickname = nickname;
        user.passkey = passkey;
        user.isAnonymous = false;

        // Add user to new department
        votesManager.addUserToDepartment(department, user.userId);

        // Update client's department in the clients map
        const clientObj = clients.get(clientId);
        if (clientObj) {
            clientObj.department = department;
        }

        console.log(`User ${user.userId} updated to department ${department}.`);
    }
}


// Function to cleanly close a client connection
function closeClient(ws, clientId) {
    if (clientId && clients.has(clientId)) {
        const clientObj = clients.get(clientId);
        if (clientObj && clientObj.ws === ws) {
            // Close the WebSocket connection
            clientObj.ws.terminate();
            // Remove client from the clients Map
            clients.delete(clientId);
            console.log(`Client ${clientId} disconnected.`);
        }
    } else {
        ws.terminate();
        console.log(`Unknown client disconnected.`);
    }
}

// Function to handle sign-in and update user department
function handleSignIn(ws, clientId, department, nickname, passkey = null) {
    const user = usersData[clientId];
    if (!user.passkey) {
        // Case 1-1, 2-1
        handleInitialSignIn(ws, clientId, department, nickname);
    } else {
        if (user.department === department && user.nickname === nickname && user.passkey === passkey) {
            ws.send(JSON.stringify({ type: 'signInSuccess', message: 'Successfully signed in.', department, passkey: user.passkey }));
        } else {
            // Case 1-2
            handleChangeSignIn(ws, clientId, department,nickname, passkey);
        }        
    }
}



// WebSocket 연결 시 메시지 핸들러 설정
wss.on('connection', (ws, req) => {

    const   currentClientIP     = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let     currentClientId     = null;
    let     currentUserId       = null;
    let     currentDepartment   = 'float'; // 초기 부서를 float으로 설정

    console.log(`#${logSeq++} New client connected: from ${currentClientIP}`);

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.type === 'init') {
                currentClientId = parsedMessage.clientId;
                const department = parsedMessage.department || 'float'; // Allow dynamic department
                const isAnonymous = parsedMessage.isAnonymous || true;
                let nickname = null;
                let passkey = null;

                if (!isAnonymous) {
                    nickname = parsedMessage.nickname;
                    passkey = parsedMessage.passkey;
                    if (!nickname || !passkey) {
                        throw new Error('닉네임과 패스키는 필수 입력 사항입니다.');
                    }
                }

                console.log(`#${logSeq++} New client initialized with clientId: ${currentClientId}, Anonymous: ${isAnonymous}`);

                // 사용자 추가
                const user = await votesManager.addUser(currentClientId, department, nickname, passkey, isAnonymous);
                currentUserId = user.userId;

                // setUserId 메시지 전송 (only for authenticated users)
                if (!isAnonymous) {
                    ws.send(JSON.stringify({ type: 'setUserId', data: user.userId }));
                }

                // members 목록 전송
                const members = votesManager.getMembersByDepartment(department);
                ws.send(JSON.stringify({ type: 'members', data: members }));

                // 전체 votes 전송
                const date = new Date();
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const votes = votesManager.getAllVotes(department, year, month);
                ws.send(JSON.stringify({ type: 'updateVotes', data: votes }));

                // 새로운 클라이언트가 추가되었음을 다른 클라이언트들에게 알림
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && client !== ws) {
                        const clientData = votesManager.getUserByClientId(currentClientId);
                        if (clientData && clientData.department === department) {
                            client.send(JSON.stringify({ 
                                type: 'newClient', 
                                data: { 
                                    userId: user.userId, 
                                    nickname: user.nickname, 
                                    department: user.department,
                                    isAnonymous: clientData.isAnonymous
                                } 
                            }));
                        }
                    }
                });
            } else if (parsedMessage.type === 'signIn') {
                const { department, nickname, passkey } = parsedMessage.data;
                handleSignIn(ws, currentClientId, department, nickname, passkey);
            } else if (parsedMessage.type === 'logout') {
                if (currentUserId) {
                    console.log(`#${logSeq++} Debug:(logout) clientId>${currentClientId} userId>${currentUserId}`);
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
                        // 부서에 사용자가 로그아웃했음을 방송
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
                const user = usersData[currentClientId];
                if (user) {
                    const userDepartment = user.department;
                    votesManager.toggleVote(userDepartment, year, month, day, userId);
                    const votesData = votesManager.getAllVotes(userDepartment, year, month);
                    ws.send(JSON.stringify({ type: 'updateVotes', data: votesData }));
                }
            } else if (parsedMessage.type === 'resetVotes' && usersData[currentClientId]?.isManager) {
                votesManager.clearAllVotes(currentDepartment);
                broadcastDepartmentMessage(currentDepartment, {
                    type: 'updateVotes',
                    data: votesManager.getAllVotes(currentDepartment)
                });
            } else if (parsedMessage.type === 'chat') {
                const { senderId, message: chatMessage, recipientIds } = parsedMessage.data;
                console.log(`Chat message from ${senderId}: ${chatMessage}`);
                
                // 채팅 데이터 준비
                const chatData = {
                    type: 'chat',
                    data: {
                        senderId,
                        message: chatMessage,
                        timestamp: new Date().toISOString(),
                    }
                };
                
                if (recipientIds && recipientIds.length > 0) {
                    // 특정 사용자에게 프라이빗 메시지 전송
                    const recipients = votesManager.sendMessage(currentDepartment, senderId, recipientIds, chatMessage);
                    recipients.forEach(recipient => {
                        // recipient.userId를 가진 클라이언트 찾기
                        for (let [clientId, clientObj] of clients.entries()) {
                            if (clientObj.userId === recipient.userId) {
                                if (clientObj.ws.readyState === WebSocket.OPEN) {
                                    clientObj.ws.send(JSON.stringify(chatData));
                                }
                                break;
                            }
                        }
                    });
                } else {
                    // 동일 부서의 모든 클라이언트에게 방송
                    broadcastDepartmentMessage(currentDepartment, chatData);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });
    ws.on('close', () => {
        console.log(`#${logSeq++} Client disconnected: ${currentClientId}`);
        if (currentUserId) {
            const userData = votesManager.getUserByClientId(currentClientId);
            if (userData) {
                votesManager.removeUserFromDepartment(userData.department, currentUserId);
                // usersData에서 해당 clientId 제거
                votesManager.usersData.delete(currentClientId);

                // 다른 클라이언트에게 로그아웃 알림
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            type: 'userLoggedOut', 
                            data: { userId: currentUserId } 
                        }));
                    }
                });
            }
        }
    });
});


// 정적 파일 제공 (예: 프론트엔드 HTML 및 JS 파일)
app.use(express.static('public'));

// 서버 시작
server.listen(3000, () => {
    console.log('서버가 포트 3000에서 실행 중입니다.');
});

// 사용자 목록을 모든 클라이언트에게 전송하는 함수
function broadcastUserList() {
    Object.keys(usersData).forEach((clientId) => {
        const clientObj = clients.get(clientId);
        if (clientObj && clientObj.ws.readyState === WebSocket.OPEN) {
            sendUserList(clientObj.ws, clientId);
        }
    });
}
