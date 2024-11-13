document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const signInBtn = document.getElementById('signInBtn');
    const departmentInput = document.getElementById('departmentInput');
    const nicknameInput = document.getElementById('nicknameInput');
    const keyIcon = document.getElementById('key');
    const lockIcon = document.getElementById('lock');

    // 로컬 스토리지에서 저장된 부서와 닉네임을 가져와 입력 필드에 채우기
    const storedDepartment = getStoredDepartment();
    const storedNickname = getStoredNickname();

    if (storedDepartment) {
        departmentInput.value = storedDepartment;
    }

    if (storedNickname) {
        nicknameInput.value = storedNickname;
    }

    // Show the authentication modal only when 'key' is clicked
    // 초기 로그인 시 모달을 자동으로 표시하지 않음

    // Event listener for the Sign-In button
    signInBtn.addEventListener('click', () => {
        const department = departmentInput.value.trim();
        const nickname = nicknameInput.value.trim();

        if (department === '' || nickname === '') {
            alert('부서와 닉네임을 모두 입력해주세요.');
            return;
        }
        const isSignedIn = isUserSignedIn();
        const currentDepartment = getStoredDepartment();
        const currentNickname = getStoredNickname();
        if (isSignedIn && (department !== currentDepartment || nickname !== currentNickname)) {
            // 부서 또는 닉네임이 변경된 경우 패스키 입력
            const passkey = prompt('기존 패스키를 입력해주세요:');
            if (!passkey) {
                alert('패스키를 입력하지 않으면 변경할 수 없습니다.');
                return;
            }

            const signInData = {
                type: 'signIn',
                data: {
                    department: department,
                    nickname: nickname,
                    passkey: passkey
                }
            };

            socket.send(JSON.stringify(signInData));
            console.log(`Sent signIn (change) message: ${JSON.stringify(signInData)}`);

        } else {
            // 최초 로그인 시 패스키는 서버에서 생성
            const signInData = {
                type: 'signIn',
                data: {
                    
                    department: department,
                    nickname: nickname
                    // passkey는 서버에서 생성되므로 클라이언트는 전송하지 않음
                }
            };

            socket.send(JSON.stringify(signInData));
            console.log(`Sent signIn (initial) message: ${JSON.stringify(signInData)}`);

            // Optionally, disable the sign-in button to prevent multiple clicks
            signInBtn.disabled = true;
        }
    });

    // Listen for sign-in failure messages from the server
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'signInFailed') {
            alert(`로그인 실패: ${message.message}`);
            signInBtn.disabled = false;
        }

        if (message.type === 'managerAuthenticated' || message.type === 'userInitialized') {

            // 부서와 닉네임을 localStorage에 저장
            storeDepartment(nicknameInput.value.trim(), departmentInput.value.trim());

            // 로그인 성공 시 패스키를 사용자에게 전달
            // 로그인 성공 알림 및 UI 업데이트
            alert(`성공적으로 로그인되었습니다.\n패스키: ${message.passkey}`);
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('key').style.display = 'none';
            document.getElementById('lock').style.display = 'block';
            document.getElementById('resetVotesBtn').style.display = 'block';
            localStorage.setItem('userId', getToken('clientId')); // userId 저장
            localStorage.setItem('passkey', message.passkey); // 패스키 저장
        }
    });

    // Function to check if the user is already signed in
    function isUserSignedIn() {
        const userId = getToken('userId');
        // Implement additional checks if necessary (e.g., check if user data exists)
        return userId !== null;
    }

    // Helper function to retrieve tokens from localStorage
    function getToken(tokenName) {
        return localStorage.getItem(tokenName);
    }

    // Helper functions to store and retrieve department and nickname
    function storeDepartment(nickname, department) {
        localStorage.setItem('nickname', nickname);
        localStorage.setItem('department', department);
    }

    function getStoredDepartment() {
        return localStorage.getItem('department');
    }

    function getStoredNickname() {
        return localStorage.getItem('nickname');
    }    
});
