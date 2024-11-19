// public/app.js

let socket        = new WebSocket('wss://piljoong.kr/ws/');


// UI 요소들
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

// 기타 변수들
let isConnected     = false;

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
    
    // 초기화 메시지 전송은 사용자의 선택 후에
};

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

// 메시지 핸들러 함수들 ...

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

/**
 * 클라이언트 ID 생성 함수
 * @returns {string} - 생성된 클라이언트 ID
 */
function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
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

// 초기화 메시지 및 UI 핸들링 함수들...

/**
 * setUserId 메시지 처리
 * @param {string} userId - 할당된 사용자 ID
 */
function handleSetUserId(userId) {
    console.log('setUserId 메시지 수신:', userId);
    storeUserId(userId);
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

/**
 * newClient 메시지 처리
 * @param {Object} newClientData - 새 클라이언트 정보
 */
function handleNewClient(newClientData) {
    console.log('newClient 메시지 수신:', newClientData);
    addMemberToList(newClientData);
}

/**
 * userInitialized 메시지 처리
 * @param {string} userId - 초기화된 사용자 ID
 */
function handleUserInitialized(userId) {
    console.log('userInitialized 메시지 수신:', userId);
    logoutBtn.style.display = 'block';
}

/**
 * userLoggedOut 메시지 처리
 * @param {string} userId - 로그아웃한 사용자 ID
 */
function handleUserLoggedOut(userId) {
    console.log(`사용자 ${userId}가 로그아웃했습니다.`);
    removeMemberFromList(userId);
}