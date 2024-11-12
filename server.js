#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const app = express();
// votesManager는 별도의 모듈
const votesManager = require('./votesManager'); 

let usersData = {}; 
// { clientId: { userId, isAnonymous, passkey, department, nickname, isManager } }

const clients = new Map();
// key: clientId
// value: { ws, ip, secretNumber, department }

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let year = new Date().getFullYear();
let month = new Date().getMonth() + 1; // 1-12 범위로 수정
// votesManager.toggleVote(year, month);
let logSeq = 0;

// isUserSignedIn 함수 추가
function isUserSignedIn(clientId) {
    const user = usersData[clientId];
    return user && !user.isAnonymous;
}

wss.on('connection', (ws, req) => {

    const currentClientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let currentClientId = null;
    let currentUserId = null;

    let currentDepartment = 'default'; // 초기 부서를 default로 설정

    console.log(`#${logSeq++} 새로운 클라이언트 연결됨: ${currentClientIP}`);
    
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'init') {

                currentClientId = parsedMessage.clientId;
                console.log(`#${logSeq++} 클라이언트 초기화됨: ${currentClientId}`);
                
                // clientId에 대한 userId 존재 여부 확인
                if (!usersData[currentClientId]) {
                    // 익명 사용자용 새로운 userId 생성
                    const newUserId = generateUserId();
                    usersData[currentClientId] = { 
                        userId: newUserId, 
                        isAnonymous: true,
                        passkey: null // Passkey 초기화
                    };
                    console.log(`새로운 익명 userId 할당됨: ${newUserId} (clientId: ${currentClientId})`);
                    
                    // 기본 부서에 새로운 익명 사용자 방송
                    broadcastDepartmentMessage('default', {
                        type: 'newClient',
                        data: { userId: newUserId, department: 'default' }
                    });
                }

                // 클라이언트 객체 생성 및 clients Map에 추가
                const clientObj = {
                    ws:             ws,
                    ip:             currentClientIP,
                    secretNumber:   generateClientSecret(currentClientId),
                    department:     'default' // 부서 필드 추가
                };
                clients.set(currentClientId, clientObj);
                
                // 최초 메시지로 투표 상태 전송
                ws.send(JSON.stringify({
                    type: 'updateVotes',
                    data: votesManager.getDefaultDepartment() 
                }));

                // 기본 부서에 새로운 클라이언트 방송
                broadcastDepartmentMessage('default', {
                    type: 'newClient',
                    data: { userId: usersData[currentClientId].userId, department: 'default' }
                });
            } else if (parsedMessage.type === 'signIn') {
                const { department, nickname } = parsedMessage.data;
                const passkey = generatePasskey(); // 서버에서 패스키 생성

                if (!isUserSignedIn(currentClientId)) {
                    // 최초 로그인 시 패스키 저장
                    handleInitialSignIn(ws, currentClientId, department, nickname, passkey);
                } else {
                    // 부서 또는 닉네임 변경 시 패스키 인증
                    const providedPasskey = parsedMessage.data.passkey;
                    handleChangeSignIn(ws, currentClientId, department, nickname, providedPasskey);
                }

            } else if (parsedMessage.type === 'logout') {
                if (currentUserId) {
                    console.log(`#${logSeq++} 로그아웃: clientId>${currentClientId} userId>${currentUserId}`);
                    // 클라이언트의 userId와 부서 가져오기
                    const user = usersData[currentClientId];
                    if (user) {
                        const { department, userId } = user;
                        delete usersData[currentClientId];
                        votesManager.removeUserFromDepartment(department, userId);
                        currentUserId = null;

                        // 부서에 사용자가 없으면 부서 데이터 제거
                        if (!votesManager.hasMembers(department)) {
                            votesManager.removeDepartment(department);
                        }

                        // 부서에 사용자 로그아웃 방송
                        broadcastDepartmentMessage(department, {
                            type: 'userLoggedOut',
                            data: { userId: userId, department }
                        });

                        // clients Map에서 제거
                        clients.delete(currentClientId);
                    }
                }
            } else if (parsedMessage.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong'
                }));
            } else if (parsedMessage.type === 'vote') {
                const { year, month, day, userId } = parsedMessage.data;
                console.log(`#${logSeq++} 투표: clientId>${currentClientId} userId>${userId}`);
                
                // 특정 부서에 대한 투표 등록
                votesManager.toggleVote(currentDepartment, year, month, day, userId);
                
                // 특정 연도와 월에 대한 투표 데이터 가져오기
                const votesData = votesManager.getAllVotes(currentDepartment, year, month);

                // 동일 부서의 모든 클라이언트에 업데이트된 투표 방송
                if (day === 0) {
                    // 유니캐스트
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
                // 유니캐스트
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
                console.log(`채팅 메시지 from ${senderId}: ${chatMessage}`);
                
                // 전송할 채팅 데이터 준비
                const chatData = {
                    type: 'chat',
                    data: {
                        senderId,
                        message: chatMessage,
                        timestamp: new Date().toISOString(),
                    }
                };
                
                if (recipientIds && recipientIds.length > 0) {
                    // 특정 사용자에게 프라이빗 메시지
                    const recipients = votesManager.sendMessage(currentDepartment, senderId, recipientIds, chatMessage);
                    recipients.forEach(recipient => {
                        const recipientClientObj = Array.from(clients.values()).find(clientObj => clientObj.userId === recipient.userId);
                        if (recipientClientObj && recipientClientObj.ws.readyState === WebSocket.OPEN) {
                            recipientClientObj.ws.send(JSON.stringify(chatData));
                        }
                    });
                } else {
                    // 동일 부서의 모든 멤버에게 방송
                    broadcastDepartmentMessage(currentDepartment, chatData);
                }
            }
        } catch (error) {
            console.error('메시지 처리 중 오류 발생:', error);
        }
    });

    ws.on('close', () => closeClient(ws, currentClientIP, currentClientId, currentDepartment));
    
    // Heartbeat 함수: 연결 유지
    function heartbeat() {
        this.isAlive = true;
    }

    function closeClient(ws, ip, clientId, department) {

        if (clients.has(clientId)) {
            clients.delete(clientId);
        }
        ws.terminate();
        console.log(`클라이언트 (${ip})가 부서 ${department}에서 연결 종료됨`);
    }

    // 클라이언트 검증을 위한 고유 숨겨진 번호 생성
    function generateClientSecret(clientId) {
        const secretNumber = Math.floor(100000 + Math.random() * 900000); // 6자리 랜덤 번호
        return secretNumber; // 검증을 위해 사용자에게 제공
    }

    // 클라이언트 검증 및 분리
    function verifyAndDecouple(clientId, providedSecret) {
        const storedSecret = clientSecretNumbers.get(clientId);

        if (storedSecret && storedSecret === providedSecret) {
            usersData[clientId].userId = null; // clientId와 userId 분리
            clientSecretNumbers.delete(clientId); // 비밀번호 삭제
            return true;
        } else {
            throw new Error('잘못된 비밀 번호입니다. 분리가 불가능합니다.');
        }
    }

    // broadcastDepartmentMessage 함수 수정: clientId 제거
    function broadcastDepartmentMessage(department, message) {
        const messageString = JSON.stringify(message);
        clients.forEach((clientObj, clientId) => {
            // 클라이언트의 부서 확인
            if (clientObj.department === department && clientObj.ws.readyState === WebSocket.OPEN) {
                clientObj.ws.send(messageString);
            }
        });
    }


    // 유저 ID 생성 함수
    function generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    // 패스키 유효성 검사 함수 (예시)
    function isValidPasskey(passkey) {
        const validPasskeys = ['secret123', 'adminPass', 'passkey456']; // 실제로는 더 안전한 방법을 사용하세요
        return validPasskeys.includes(passkey); 
    }

    // 패스키 생성 함수
    function generatePasskey() {
        const passkey = Math.random().toString(36).substr(2, 12); // 12자리 랜덤 문자열
        return passkey;
    }

    // 초기 로그인 처리 함수
    function handleInitialSignIn(ws, clientId, department, nickname, passkey) {
        // department-nickname 쌍의 유일성 확인
        if (votesManager.isNicknameTaken(department, nickname)) {
            ws.send(JSON.stringify({ type: 'signInFailed', message: '이미 사용 중인 부서-닉네임 조합입니다.' }));
            return;
        }

        // 기존 익명 사용자의 userId 업데이트
        const existingUser = usersData[clientId];
        if (existingUser && existingUser.isAnonymous) {
            existingUser.userId = generateUserId();
            existingUser.isAnonymous = false;
            existingUser.department = department;
            existingUser.nickname = nickname;
            existingUser.passkey = passkey; // 패스키 저장
        } else {
            // 새로운 사용자 등록
            usersData[clientId] = { 
                userId: generateUserId(), 
                department, 
                nickname, 
                isManager: false,
                passkey: passkey // 패스키 저장
            };
        }

        currentUserId = usersData[clientId].userId;
        currentDepartment = department;

        // 클라이언트 객체에 부서 정보 업데이트
        const clientObj = clients.get(clientId);
        if (clientObj) {
            clientObj.department = department;
        }

        // 부서에 사용자 추가 및 매니저 할당
        votesManager.addUserToDepartment(department, currentUserId);
        if (votesManager.isFirstUserInDepartment(department)) {
            usersData[clientId].isManager = true;
            votesManager.assignDepartmentManager(department, currentUserId);
            ws.send(JSON.stringify({ type: 'managerAuthenticated', passkey })); // 패스키 전달
        } else {
            ws.send(JSON.stringify({ type: 'userInitialized', passkey })); // 패스키 전달
        }

        // 부서에 새로운 사용자가 추가되었음을 방송
        broadcastDepartmentMessage(department, {
            type: 'newUser',
            data: { userId: currentUserId, nickname, department }
        });

        console.log('사용자 로그인 완료:', usersData[clientId]);
    }

    // 부서/닉네임 변경 시 패스키 인증 및 이전 데이터 제거 함수
    function handleChangeSignIn(ws, clientId, newDepartment, newNickname, providedPasskey) {
        const user = usersData[clientId];
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

            // 부서 변경을 방송
            broadcastDepartmentMessage(newDepartment, {
                type: 'newUser',
                data: { userId: userId, nickname: newNickname, department: newDepartment }
            });

            console.log('부서/닉네임 변경 완료:', usersData[clientId]);
        }
    }
});

// 기타 함수들 변경 없음...

// WebSocket 연결을 유지하기 위한 Heartbeat 함수
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
});

// 주기적으로 연결 상태 확인
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();

        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// 정적 파일 제공 (예: 프론트엔드 HTML 및 JS 파일)
app.use(express.static('public'));

// 서버 시작
server.listen(3000, () => {
    console.log('서버가 포트 3000에서 실행 중입니다.');
});
