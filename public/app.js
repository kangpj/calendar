// public/app.js


let socket        = new WebSocket('wss://piljoong.kr/ws/');


const voteCount     = document.getElementById('participant');
const eMostVotedDay = document.getElementById('mostVotedDay');
const wsStatus      = document.getElementById('wsStatus');
const caption       = document.getElementById('caption');
const logoutBtn     = document.getElementById('logoutBtn');
const membersList   = document.getElementById('membersList');
const calendar      = document.getElementById('calendar');

// 로그인/익명 모달 요소
const authModal         = document.getElementById('authModal');
const signInSection     = document.getElementById('signInSection');
const anonymousSection  = document.getElementById('anonymousSection');
const signInBtn         = document.getElementById('signInBtn');
const anonymousBtn      = document.getElementById('anonymousBtn');
const departmentInput   = document.getElementById('departmentInput');
const nicknameInput     = document.getElementById('nicknameInput');
const passkeyInput      = document.getElementById('passkeyInput');
const departmentAnonInput = document.getElementById('departmentAnonInput');


//const users         = new Set();
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
let appSeq          = 1;

// WebSocket 연결 상태 표시
wsStatus.textContent = "연결상태: ";
const wsSpan = document.createElement('span');
wsStatus.appendChild(wsSpan);

socket.onopen = () => {
    console.log(`서버에 연결되었습니다.`);
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

    switch(message.type) {
        case 'setUserId':
            handleSetUserId(message.data);
            break;
        case 'defaultMembers':
            handleDefaultMembers(message.data);
            break;
        case 'updateVotes':
            handleUpdateVotes(message.data);
            break;
        case 'newClient':
            handleNewClient(message.data);
            break;
        case 'userInitialized':
            handleUserInitialized(message.data);
            break;
        case 'voteSuccess':
            alert(`성공적으로 ${message.data.day}에 투표하였습니다.`);
            break;
        case 'voteFailed':
            alert(`투표 실패: ${message.data.message}`);
            break;
        case 'logoutSuccess':
            alert('성공적으로 로그아웃되었습니다.');
            clearUserData();
            resetUI();
            break;
        case 'logoutFailed':
            alert(`로그아웃 실패: ${message.data.message}`);
            break;
        case 'userLoggedOut':
            handleUserLoggedOut(message.data.userId);
            break;
        case 'error':
            alert(`오류: ${message.message}`);
            break;
         
        default:
            console.warn('알 수 없는 메시지 타입:', message.type);
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

/**
 * 사용자 초기화 함수
 * @param {boolean} isAnonymous - 사용자가 익명인지 여부
 */
function initializeUser(isAnonymous) {
    const clientId = generateClientId(); // 클라이언트 고유 ID 생성
    localStorage.setItem('clientId', clientId);
    const initMessage = { type: 'init', clientId: clientId };
    
    if (isAnonymous) {
        const department = departmentAnonInput.value.trim() || 'default';
        initMessage.department = department;
        initMessage.isAnonymous = true;
    } else {
        const department = departmentInput.value.trim() || 'default';
        const nickname = nicknameInput.value.trim();
        const passkey = passkeyInput.value.trim();

        initMessage.department = department;
        initMessage.nickname = nickname;
        initMessage.passkey = passkey;
    }

    socket.send(JSON.stringify(initMessage));
    authModal.style.display = 'none';
}
// Generate any token if it doesn’t exist in localStorage
function getToken(tokenName) {
    if (!localStorage.getItem(tokenName)) {
        localStorage.setItem(tokenName, `${tokenName}_` + Math.random().toString(36).substr(2, 9));
    }
    return localStorage.getItem(tokenName);
}

function attemptReconnect() {
    setTimeout(() => {
        console.log(`#${appSeq++} Attempting to reconnect...`);
        socket = new WebSocket('wss://piljoong.kr/ws/');
    }, 5000);
}
/**
 * 클라이언트 ID 생성 함수
 * @returns {string} - 생성된 클라이언트 ID
 */
function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
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

// 로그인 버튼 클릭 시
signInBtn.addEventListener('click', () => {
    initializeUser(false);
});

// 익명 사용 버튼 클릭 시
anonymousBtn.addEventListener('click', () => {
    initializeUser(true);
});

// 로그아웃 버튼 클릭 시
logoutBtn.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'logout' }));
});

// Listen for incoming chat messages
socket.addEventListener('message', (event) => {
    const parsedMessage = JSON.parse(event.data);
    if (parsedMessage.type === 'chat') {
        const { senderId, message, timestamp } = parsedMessage.data;
        displayChatMessage(senderId, message, timestamp);
    }
});
// 초기화 메시지 및 UI 핸들링 함수들...

/**
 * setUserId 메시지 처리
 * @param {string} userId - 할당된 사용자 ID
 */
function handleSetUserId(userId) {
    console.log('setUserId 메시지 수신:', userId);
    storeUserId(userId);
}
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
/**
 * defaultMembers 메시지 처리
 * @param {Array} members - 기본 부서의 멤버 목록
 */
function handleDefaultMembers(members) {
    console.log('defaultMembers 메시지 수신:', members);
    updateMembersList(members);
}

/**
 * updateVotes 메시지 처리
 * @param {Object} votesData - 투표 데이터 JSON
 */
function handleUpdateVotes(votesData) {
    const userId = getToken('userId'); // 사용자 ID 가져오기
    console.log('updateVotes 메시지 수신:', votesData);
    renderCalendar(votesData, userId); // userId 전달
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
/**
 * newClient 메시지 처리
 * @param {Object} newClientData - 새 클라이언트 정보
 */
function handleNewClient(newClientData) {
    console.log('newClient 메시지 수신:', newClientData);
    addMemberToList(newClientData);
}

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
/**
 * userInitialized 메시지 처리
 * @param {string} userId - 초기화된 사용자 ID
 */
function handleUserInitialized(userId) {
    console.log('userInitialized 메시지 수신:', userId);
    logoutBtn.style.display = 'block';
}

function removeUserFromUI(userId) {
    const userItem = document.getElementById(`${userId}`);
    if (userItem) {
        userItem.remove();
    }
}
/**
 * userLoggedOut 메시지 처리
 * @param {string} userId - 로그아웃한 사용자 ID
 */
function handleUserLoggedOut(userId) {
    console.log(`사용자 ${userId}가 로그아웃했습니다.`);
    removeMemberFromList(userId);
}

function updateUserList(userList) {
    const userListContainer = document.getElementById('userList');
    userListContainer.innerHTML = ''; // 기존 목록 초기화

    userList.forEach(user => {
        const userElement = document.createElement('div');
        userElement.textContent = `${user.nickname} (${user.department})`;

        if (user.isSelf) {
            userElement.classList.add('self-user'); // CSS 클래스 추가
            userElement.textContent += ' - You';
        }

        userListContainer.appendChild(userElement);
    });
}