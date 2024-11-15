// public/app.js


let socket        = new WebSocket('wss://piljoong.kr/ws/');

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

    if (message.type === 'setUserId') {
        localStorage.setItem('userId', message.data); 
    } else if (message.type === 'defaultMembers') {
        updateMemberList(message.data);
    } else if (message.type === 'updateVotes') {
        const userId = getToken('userId');
        renderCalendar('calendar', message.data, userId);
    } else if (message.type === 'managerAuthenticated' || message.type === 'userInitialized') {
        // 로그인 성공 시 authModal 숨기기
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('key').style.display = 'none';
        document.getElementById('lock').style.display = 'block';
        document.getElementById('resetVotesBtn').style.display = 'block';
        alert(`성공적으로 로그인되었습니다.\n패스키: ${message.passkey}`);
        localStorage.setItem('passkey', message.passkey); // 패스키 저장

        // 부서 이름으로 채팅 제목 변경
        const department = usersData[getToken('clientId')].department;
        document.getElementById('chat-section').querySelector('h3')?.remove(); // 기존 제목 제거
        const chatTitle = document.createElement('h3');
        chatTitle.textContent = `${department} 부서 채팅`;
        document.getElementById('chat-section').insertBefore(chatTitle, document.getElementById('chat-container'));
    } else if (message.type === 'signInFailed') {
        // 로그인 실패 시 authModal 표시
        document.getElementById('authModal').style.display = 'block';
        alert(`로그인 실패: ${message.message}`);
    } else if (message.type === 'newClient') {
        console.log(`New anonymous user connected: ${message.data.userId}`);
        addUserToUI(message.data);
    } else if (message.type === 'newUser') {
        console.log(`New user signed in: ${message.data.nickname} (${message.data.userId}) in department ${message.data.department}`);
        addUserToUI(message.data);
        const department = message.data.department;
        document.getElementById('chat-section').querySelector('h3')?.remove(); // 기존 제목 제거
        const chatTitle = document.createElement('h3');
        chatTitle.textContent = `${department} 부서 채팅`;
        document.getElementById('chat-section').insertBefore(chatTitle, document.getElementById('chat-container'));
    } else if (message.type === 'userLoggedOut') {
        console.log(`User logged out: ${message.data.userId} from department ${message.data.department}`);
        removeUserFromUI(message.data.userId);
    } else if (message.type === 'pong') {
        console.log(`#${appSeq++} Received pong from server`);
    }
};

// Update the member list UI
function updateMemberList(members) {
    const userList = document.getElementById('userList');
    userList.innerHTML = ''; // Clear existing list
    members.forEach(member => {
        const userItem = document.createElement('li');
        userItem.id = `${member.userId}`;
        userItem.textContent = `${member.nickname}`;
        userList.appendChild(userItem);
    });
}

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

// 'key' div를 클릭했을 때 authModal을 표시도록 이벤트 리스너 추가
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