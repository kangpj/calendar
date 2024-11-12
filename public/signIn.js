document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const signInBtn = document.getElementById('signInBtn');
    const departmentInput = document.getElementById('departmentInput');
    const nicknameInput = document.getElementById('nicknameInput');
    const keyIcon = document.getElementById('key');
    const lockIcon = document.getElementById('lock');

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

        if (isUserSignedIn()) {
            // 부서 또는 닉네임 변경 시 패스키 입력
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
            // 로그인 성공 시 패스키를 사용자에게 전달
            // 이미 app.js에서 처리하므로 이 부분은 생략 가능
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
});
