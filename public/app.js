// public/app.js


const socket        = new WebSocket('wss://piljoong.kr/ws/');

// UI elements
//const calendar    = document.getElementById('calendar');
//const previousButton = document.getElementById('previous');
//const nextButton  = document.getElementById('next');
const voteCount     = document.getElementById('participant');
const eMostVotedDay = document.getElementById('mostVotedDay');
const wsStatus      = document.getElementById('wsStatus');
const caption       = document.getElementById('caption');


const calendars     = {};
const users         = new Set();
const clients       = new Set();
const currentYear   = new Date().getFullYear();
const currentMonth  = new Date().getMonth() + 1;
const currentDate   = new Date().getDate();
let workingYear     = currentYear;
let workingMonth    = currentMonth;
//let hMonth          = workingMonth + 1;
let mostVotedDay    = null;
let maxVotes        = 0;
let isConnected     = false;
let appSeq          = 0;

// WebSocket connection status
wsStatus.textContent = "연결상태: ";
wsSpan = document.createElement('span');
wsStatus.appendChild(wsSpan);
socket.onopen = () => {
    console.log(`#${appSeq++} Connected to the server`);
    wsSpan.textContent  = "Active";
    wsSpan.classList.remove('inactive');
    wsSpan.classList.add('active');
    caption.textContent = '날짜를 선택하세요. (복수선택 가능)';
    isConnected         = true;

    // Send the clientId as part of the connection setup when the WebSocket first connects.
    socket.send(JSON.stringify({ type: 'init', clientId: getToken('clientId') }));

    // Start ping-pong mechanism by sending 'ping' to the server
    setInterval(() => {
        if (isConnected) {
            socket.send(JSON.stringify({ type: 'ping' }));
            console.log(`#${appSeq++} send a <ping> message`);
        }
    }, 30000); // Send a ping every 30 seconds    
};

socket.onclose = () => {
    console.log(`#${appSeq++} Connection closed by server.`);
    wsSpan.textContent = "Inactive";
    wsSpan.classList.add('inactive');
    wsSpan.classList.remove('active');
    //caption.textContent = '화면을 새로고침 하세요.';
    isConnected = false; 
    attemptReconnect();
};

// Handle WebSocket messages
socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'updateVotes') {
        renderCalendar('calendar', message.data);
        //updateVoteStatistics();
    } else if (message.type === 'managerAuthenticated' || message.type === 'userInitialized') {
        // 로그인 성공 시 authModal 숨기기
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('key').style.display = 'none';
        document.getElementById('lock').style.display = 'block';
        document.getElementById('resetVotesBtn').style.display = 'block';
        alert(`성공적으로 로그인되었습니다.\n패스키: ${message.passkey}`);
        localStorage.setItem('userId', getToken('clientId')); // userId 저장
        localStorage.setItem('passkey', message.passkey); // 패스키 저장
    } else if (message.type === 'signInFailed') {
        // 로그인 실패 시 처리
        console.log('Sign in failed:', message.message);
    } else if (message.type === 'newClient') {
        // default 부서의 새로운 클라이언트 접속 처리
        console.log(`New anonymous user connected: ${message.data.userId}`);
        // 필요에 따라 UI 업데이트
    } else if (message.type === 'newUser') {
        // 동일 부서의 새로운 사용자 접속 처리
        console.log(`New user signed in: ${message.data.nickname} (${message.data.userId}) in department ${message.data.department}`);
        addUserToUI(message.data);
    } else if (message.type === 'userLoggedOut') {
        // 부서 내 사용자가 로그아웃했을 때 처리
        console.log(`User logged out: ${message.data.userId} from department ${message.data.department}`);
        removeUserFromUI(message.data.userId);
    } else if (message.type === 'pong') {
        console.log(`#${appSeq++} Received pong from server`);
    }
};

// Request statistics from server
function askStatistics() {
    socket.send(JSON.stringify({
        type: 'getStatistics',
        data: { year: workingYear, month: workingMonth }
    }));
    console.log(`#${appSeq++} send a <getStatistics> message`);
}

// Generate a user ID if it doesn’t exist in localStorage
function getToken(tokenName) {
    if (!localStorage.getItem(tokenName)) {
        localStorage.setItem(tokenName, 'client_' + Math.random().toString(36).substr(2, 9));
    }
    return localStorage.getItem(tokenName);
}

function attemptReconnect() {
    setTimeout(() => {
        console.log(`#${appSeq++} Attempting to reconnect...`);
        socket = new WebSocket('wss://piljoong.kr/ws/');
    }, 5000);
}

// Function to send chat message
function sendChatMessage(message, recipientIds = []) {
    const chatData = {
        type: 'chat',
        data: {
            senderId: currentUserId, // Ensure currentUserId is defined
            message: message,
            recipientIds: recipientIds, // Array of userIds for private messages
        }
    };
    socket.send(JSON.stringify(chatData));
}

// Listen for incoming chat messages
socket.addEventListener('message', (event) => {
    const parsedMessage = JSON.parse(event.data);
    if (parsedMessage.type === 'chat') {
        const { senderId, message, timestamp } = parsedMessage.data;
        displayChatMessage(senderId, message, timestamp);
    }

    // ... handle other message types ...
});

// Function to display chat messages in the UI
function displayChatMessage(senderId, message, timestamp) {
    const chatContainer = document.getElementById('chat-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    
    const senderElement = document.createElement('span');
    senderElement.classList.add('chat-sender');
    senderElement.textContent = senderId; // Replace with sender's nickname if available

    const messageContent = document.createElement('span');
    messageContent.classList.add('chat-content');
    messageContent.textContent = message;

    const timeElement = document.createElement('span');
    timeElement.classList.add('chat-timestamp');
    timeElement.textContent = new Date(timestamp).toLocaleTimeString();

    messageElement.appendChild(senderElement);
    messageElement.appendChild(messageContent);
    messageElement.appendChild(timeElement);

    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
}

// Event listener for sending chat messages
document.getElementById('send-chat-btn').addEventListener('click', () => {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (message !== '') {
        sendChatMessage(message);
        chatInput.value = '';
    }
});

// 'key' div를 클릭했을 때 authModal을 표시��도록 이벤트 리스너 추가
document.getElementById('key').addEventListener('click', () => {
    document.getElementById('authModal').style.display = 'block';
    
});

// 사용자 목록 UI 업데이트 함수 추가
function addUserToUI(userData) {
    const userList = document.getElementById('userList');
    if (!userList) return;

    const userItem = document.createElement('li');
    userItem.id = `${userData.userId}`;
    userItem.textContent = `${userData.nickname}`;
    userList.appendChild(userItem);
}

function removeUserFromUI(userId) {
    const userItem = document.getElementById(`${userId}`);
    if (userItem) {
        userItem.remove();
    }
}