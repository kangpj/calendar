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

// 헬퍼 함수: 사용자 로그인 상태 확인
function isUserSignedIn(clientId) {
    const user = votesManager.getUserData(clientId);
    return user && !user.isAnonymous;
}

// 부서에 메시지 방송 함수 (clientIdCur 제외)
function broadcastDepartmentMessage(department, message, clientIdCur = null) {
    const messageString = JSON.stringify(message);
    clients.forEach((clientObj, clientId) => {
        const user = votesManager.getUserData(clientId);
        if (
            user &&
            user.department === department &&
            clientObj.ws.readyState === WebSocket.OPEN &&
            clientId !== clientIdCur
        ) {
            clientObj.ws.send(messageString);
        }
    });
}

// 사용자 목록을 특정 클라이언트에게 전송하는 함수
function sendUserList(ws, clientId) {
    const userData = votesManager.getUserData(clientId);
    if (!userData) {
        ws.send(JSON.stringify({ type: 'error', message: '사용자 데이터가 없습니다.' }));
        return;
    }

    const targetDepartments = [userData.department, 'default']; // 자신의 부서와 기본 부서
    const userList = votesManager.getAllUsers()
        .filter(user => targetDepartments.includes(user.department))
        .map(user => ({
            userId: user.userId,
            nickname: user.nickname,
            department: user.department,
            isManager: user.isManager,
            isSelf: user.clientId === clientId // 클라이언트 자신인지 확인
        }));

    ws.send(JSON.stringify({ type: 'userList', data: userList }));
}

// 사용자 목록을 모든 클라이언트에게 전송하는 함수
function broadcastUserList() {
    clients.forEach((clientObj, clientId) => {
        if (clientObj.ws.readyState === WebSocket.OPEN) {
            sendUserList(clientObj.ws, clientId);
        }
    });
}

// WebSocket 연결 핸들링
wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    clients.set(clientId, { ws, clientId });
    console.log(`#${logSeq++} 클라이언트 연결: ${clientId}`);

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            if (parsedMessage.type === 'signIn') {
                const { department, nickname, passkey, isAnonymous } = parsedMessage.data;
                try {
                    const newUser = await votesManager.addUser(clientId, department, nickname, passkey, isAnonymous);
                    clients.get(clientId).userId = newUser.userId;
                    clients.get(clientId).department = newUser.department;

                    ws.send(JSON.stringify({ type: 'signInSuccess', data: newUser }));

                    // 부서에 새로운 사용자 방송
                    broadcastDepartmentMessage(department, {
                        type: 'newUser',
                        data: { userId: newUser.userId, nickname: newUser.nickname, department }
                    }, clientId);

                    // 모든 클라이언트에게 사용자 목록 업데이트 전송
                    broadcastUserList();
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'signInFailed', message: error.message }));
                }
            }
            // ... 다른 메시지 타입 처리 ...

            else if (parsedMessage.type === 'updateStats') {
                // 예시: 사용자의 통계를 업데이트해야 할 경우
                // 서버에서 필요한 로직을 추가하세요.
                broadcastUserList(); // 사용자 목록 업데이트 전송
            }

            // ... 추가적인 메시지 타입 처리 ...

        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    ws.on('close', () => {
        console.log(`#${logSeq++} 클라이언트 연결 종료: ${clientId}`);
        const userData = votesManager.getUserData(clientId);
        if (userData) {
            const { department, userId } = userData;
            votesManager.removeUserFromDepartment(department, userId);
            votesManager.removeUser(clientId);

            // 부서에 사용자가 더 이상 없으면 부서 데이터 제거
            if (!votesManager.hasMembers(department)) {
                votesManager.removeDepartment(department);
            }

            // 부서에 사용자가 로그아웃했음을 방송
            broadcastDepartmentMessage(department, {
                type: 'userLoggedOut',
                data: { userId, department }
            }, clientId);
        }
        clients.delete(clientId);

        // 모든 클라이언트에게 사용자 목록 업데이트 전송
        broadcastUserList();
    });
});

// 정적 파일 제공 (예: 프론트엔드 HTML 및 JS 파일)
app.use(express.static('public'));

// 서버 시작
server.listen(3000, () => {
    console.log('서버가 포트 3000에서 실행 중입니다.');
});

/**
 * 클라이언트 ID 생성 함수
 * @returns {string} - 생성된 클라이언트 ID
 */
function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
}
