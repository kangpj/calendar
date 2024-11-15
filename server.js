#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const app = express();

// votesManager는 별도의 모듈
const votesManager = require('./votesManager'); 

// 사용자 데이터 저장소
let usersData = {}; 
// 형식: { clientId: { userId, nickname, department, isManager, isAnonymous, passkey } }

// 클라이언트 관리: clientId를 키로 하는 Map
const clients = new Map();

// 서버 생성 및 WebSocket 설정
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

// 초기 로그인 처리 함수 (Case 1.1, 2.1)
function handleInitialSignIn(ws, clientId, department, nickname) {
    // department-nickname 쌍의 유일성 확인, Case 2.1 Denial
    if (votesManager.isNicknameTaken(department, nickname)) {
        ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
        return;
    } else {
        console.log(`clientId: ${clientId}, department: ${department}, nickname: ${nickname}`);
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
    ws.send(JSON.stringify({ type: 'setUserId', data: newUserId }));
    // 부서에 사용자 추가
    votesManager.addUserToDepartment(department, newUserId);

    // 부서에 첫 번째 사용자라면 매니저로 지정
    if (votesManager.isFirstUserInDepartment(department)) {
        usersData[clientId].isManager = true;
        votesManager.assignDepartmentManager(department, newUserId);
        ws.send(JSON.stringify({ type: 'signinSuccess', message: '성공적으로 로그인되었습니다.', passkey }));
    } else {
        ws.send(JSON.stringify({ type: 'signinSuccess', message: '성공적으로 로그인되었습니다.', passkey }));
    }

    // 부서에 새로운 사용자 방송
    broadcastDepartmentMessage(department, {
        type: 'newUser',
        data: { userId: newUserId, nickname, department }
    ,});
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

    // 이전 부서에서 사용자 제거
    const oldDepartment = user.department;
    const userId = user.userId;
    votesManager.removeUserFromDepartment(oldDepartment, userId);

    // 부서에 사용자가 더 이상 없으면 부서 데이터 제거
    if (!votesManager.hasMembers(oldDepartment)) {
        votesManager.removeDepartment(oldDepartment);
    }

    // 사용자 데이터 업데이트
    user.department = department;
    user.nickname = nickname;
    // 새로운 패스키 생성하여 업데이트 (선택 사항)
    user.passkey = generatePasskey();

    // 새로운 부서에 사용자 추가
    votesManager.addUserToDepartment(department, userId);

    // 부서에 첫 번째 사용자라면 매니저로 지정
    if (votesManager.isFirstUserInDepartment(department)) {
        user.isManager = true;
        votesManager.assignDepartmentManager(department, userId);
        ws.send(JSON.stringify({ type: 'signinSuccess', message: '패스키 인증 후 성공적으로 로그인되었습니다.', passkey: user.passkey }));
    } else {
        ws.send(JSON.stringify({ type: 'signinSuccess', message: '패스키 인증 후 성공적으로 로그인되었습니다.', passkey: user.passkey }));
    }

    // 새로운 부서에 사용자 방송
    broadcastDepartmentMessage(department, {
        type: 'newUser',
        data: { userId, nickname, department }
    }, userId);

    console.log('User changed department/nickname:', usersData[clientId]);
}
// Cleanly close a client connection and clear interval
function closeClient(id) {    
    clients.get(id).terminate(); // Close the WebSocket connection
    clients.delete(id); // Remove client from the clients Map

    console.log(`Client ${id} || 'unknown'} disconnected.`);
}
// WebSocket 연결 시 메시지 핸들러 설정
wss.on('connection', (ws, req) => {

    const   currentClientIP     = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let     currentClientId     = null;
    let     currentUserId       = null;
    let     currentDepartment   = 'default'; // 초기 부서를 default로 설정

    console.log(`#${logSeq++} New client connected: from ${currentClientIP}`);

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.type === 'init') {
                currentClientId = parsedMessage.clientId;
                console.log(`#${logSeq++} New client initialized with clientId: ${currentClientId}`);

                // 클라이언트로부터 유저 데이터를 아직 받지 않은 경우 자동으로 익명 사용자 등록
                if (!usersData[currentClientId]) {
                    const newUserId = generateUserId();
                    usersData[currentClientId] = { 
                        userId: newUserId, 
                        isAnonymous: true,
                        passkey: null // 패스키 초기화
                    };
                    console.log(`Assigned new anonymous userId: ${newUserId} to clientId: ${currentClientId}`);
                    
                    // Respond currentUserId to the client so that he can write down it on its localStorage
                    // The userId is needed to figure out which data is its own.
                    // Because every json votesData regarding a client is identified by its userId.
                    ws.send(JSON.stringify({
                        type: 'setUserId',
                        data: newUserId
                    }));

                }
                // Step 3. Now that usersData was set, we can access usersData
                currentUserId = usersData[currentClientId].userId;

                // 클라이언트 객체 생성 및 Map에 추가
                clients.set(currentClientId, {
                    ws:             ws,
                    ip:             currentClientIP,
                    secretNumber:   generateClientSecret(currentClientId),
                    department:     'default' // 부서 필드 추가
                });

                // 기본 부서의 현재 멤버 목록 조회
                const defaultMembers = votesManager.getDepartmentMembers('default');

                // 클라이언트에게 기본 부서 멤버 목록 전송
                ws.send(JSON.stringify({
                    type: 'defaultMembers',
                    data: defaultMembers
                }));

                // 최초 메시지로 투표 상태 전송
                ws.send(JSON.stringify({
                    type: 'updateVotes',
                    data: votesManager.getAllVotes('default', year, month)
                }));

                // 전체 전달
                broadcastDepartmentMessage('default', {
                    type: 'newUser',
                    data: { 
                        userId: usersData[currentClientId].userId, 
                        department: 'default',
                        nickname: usersData[currentClientId].nickname || '익명'
                    }
                }, currentUserId);


            // signIn message can bump into four cases
            // Case 1. Sign In with unknown department/nickname from a client pc 
            //  Case 1-1. There isn't user data with regard to current client: Register user department, nickname and passkey
            //  Case 1-2. There is user data with regard to current client: Authenticate passkey then replace user data with new one 
            // Case 2. Sign In with known department/nickname from a client pc
            //  Case 2-1. There isn't user data with regard to current client: denial due to singularity violation
            //  Case 2-2. There is user data with regard to current client
            //      Case 2-2-1. User datas are the same each other: signIn success
            //      Case 2-2-1. User datas are different each other: signIn failure                  
            } else if (parsedMessage.type === 'signIn') {
                const { department, nickname } = parsedMessage.data;

                const user = usersData[currentClientId];

                if (!user.passkey) {
                    // **Case 1.1, (2.1):** There isn't user data with regard to current client
                    handleInitialSignIn(ws, currentClientId, department, nickname);
                } else {
                    if (user.isAnonymous) {
                        // **Case 1.2:** There is user data and user is anonymous
                        const providedPasskey = parsedMessage.data.passkey;
                        if (providedPasskey) {
                            handleChangeSignIn(ws, currentClientId, department, nickname, providedPasskey);
                        } else {
                            // 사용자가 패스키를 제공하지 않은 경우 추가 요청
                            ws.send(JSON.stringify({ type: 'authenticatePasskey', message: '패스키를 입력해주세요.' }));
                        }
                    } else {
                        // **Case 2:** Sign In with known department-nickname pair
                        const { department: newDepartment, nickname: newNickname } = parsedMessage.data;
                        
                        // **Case 2.1:** There isn't user data with regard to current client
                        // (이미 `user` 데이터가 존재하므로 이 케이스는 해당되지 않음)
                        
                        // **Case 2.2:** There is user data with regard to current client
                        if (user.department === newDepartment && user.nickname === newNickname) {
                            // **Case 2.2.1:** User datas are the same each other
                            ws.send(JSON.stringify({ type: 'signinSuccess', message: '성공적으로 로그인되었습니다.' }));
                        } else {
                            // **Case 2.2.2:** User datas are different each other
                            ws.send(JSON.stringify({ type: 'signInFailure', message: '부서 또는 닉네임이 변경되었습니다. 패스키를 입력해주세요.' }));
                        }                         
                    }
                }

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
                console.log(`#${logSeq++} Debug:(vote) clientId>${currentClientId} userId>${userId}`);

                // 특정 부서에 투표 등록
                votesManager.toggleVote(currentDepartment, year, month, day, userId);
                
                // 특정 연도와 월에 필터링된 투표 데이터 가져오기
                const votesData = votesManager.getAllVotes(currentDepartment, year, month);

                // 업데이트된 투표 데이터 방송
                if (day === 0) {
                    // 유니캐스트: 특정 클라이언트에게만 전송
                    ws.send(JSON.stringify({
                        type: 'updateVotes',
                        data: votesData
                    }));
                } else {
                    // 브로드캐스트: 동일 부서의 모든 클라이언트에게 전송
                    broadcastDepartmentMessage(currentDepartment, {
                        type: 'updateVotes',
                        data: votesData
                    });
                }
            } else if (parsedMessage.type === 'getStatistics') {
                const { year, month } = parsedMessage.data;
                const { theDay, theNumber } = votesManager.getMostVotedDayInMonth(year, month);
                // 유니캐스트: 특정 클라이언트에게만 전송
                ws.send(JSON.stringify({
                    type: 'updateVoteStatistic',
                    data: {
                        votersTotal: votesManager.getUniqueVoters(),
                        availableTotal: theNumber, 
                        theDay: theDay
                    }
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
        }
    });

    ws.on('close', () => closeClient(ws, currentClientIP, currentClientId, currentDepartment));


});


// 정적 파일 제공 (예: 프론트엔드 HTML 및 JS 파일)
app.use(express.static('public'));

// 서버 시작
server.listen(3000, () => {
    console.log('서버가 포트 3000에서 실행 중입니다.');
});
