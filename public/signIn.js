document.addEventListener('DOMContentLoaded', () => {
    const authModal         = document.getElementById('authModal');
    const signInBtn         = document.getElementById('signInBtn');
    const departmentInput   = document.getElementById('departmentInput');
    const nicknameInput     = document.getElementById('nicknameInput');
    const keyIcon           = document.getElementById('key');
    const lockIcon          = document.getElementById('lock');

    // Load stored department and nickname
    const storedDepartment  = getStoredDepartment();
    const storedNickname    = getStoredNickname();

    if (storedDepartment) {
        departmentInput.value = storedDepartment;
    }

    if (storedNickname) {
        nicknameInput.value = storedNickname;
    }


    // Listen for sign-in messages from the server
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'signInFailed') {
            alert(`로그인 실패: ${message.message}`);
            signInBtn.disabled = false;
            authModal.style.display = 'block'; // Show the modal again on failure
        }

        if (message.type === 'signInSuccess') {
            // Store department, nickname, and passkey in localStorage
            localStorage.setItem('department', departmentInput.value.trim());
            localStorage.setItem('nickname', nicknameInput.value.trim());
            localStorage.setItem('passkey', message.passkey);

            // Hide authModal and update UI
            alert(`성공적으로 로그인되었습니다.\n패스키: ${message.passkey}`);
            authModal.style.display = 'none';
            keyIcon.style.display = 'none';
            lockIcon.style.display = 'block';
            document.getElementById('resetVotesBtn').style.display = 'block';

            const department = getToken('department');
            document.getElementById('chat-section').querySelector('h3')?.remove(); // 기존 제목 제거
            const chatTitle = document.createElement('h3');
            chatTitle.textContent = `${department} 부서 채팅`;
            document.getElementById('chat-section').insertBefore(chatTitle, document.getElementById('chat-container'));
        }
    });

    // Function to check if the user is already signed in
    function getStoredDepartment() {
        return localStorage.getItem('department');
    }

    function getStoredNickname() {
        return localStorage.getItem('nickname');
    }
});
