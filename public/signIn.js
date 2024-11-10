document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('authModal');
    const signInBtn = document.getElementById('signInBtn');
    const departmentInput = document.getElementById('departmentInput');
    const nicknameInput = document.getElementById('nicknameInput');
    const keyIcon = document.getElementById('key');
    const lockIcon = document.getElementById('lock');

    // Show the authentication modal when the page loads if the user is not signed in
    if (!isUserSignedIn()) {
        authModal.style.display = 'block';
    }

    // Event listener for the Sign-In button
    signInBtn.addEventListener('click', () => {
        const department = departmentInput.value.trim();
        const nickname = nicknameInput.value.trim();

        if (department === '' || nickname === '') {
            alert('Please enter both Department and Nickname.');
            return;
        }

        const userId = getToken('userId'); // Ensure 'userId' is generated in app.js

        // Send the sign-in message to the server
        const signInData = {
            type: 'signIn',
            data: {
                userId: userId,
                department: department,
                nickname: nickname
            }
        };

        socket.send(JSON.stringify(signInData));
        console.log(`Sent signIn message: ${JSON.stringify(signInData)}`);

        // Optionally, disable the sign-in button to prevent multiple clicks
        signInBtn.disabled = true;
    });

    // Function to check if the user is already signed in
    function isUserSignedIn() {
        const userId = getToken('userId');
        // Implement additional checks if necessary (e.g., check if user data exists)
        return userId !== null;
    }

    // Listen for server messages related to sign-in
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'managerAuthenticated') {
            // The user is a department manager
            authModal.style.display = 'none';
            keyIcon.style.display = 'none';
            lockIcon.style.display = 'block';
            document.getElementById('resetVotesBtn').style.display = 'block';
            alert('Signed in as Department Manager.');
        } else if (message.type === 'userInitialized') {
            // The user has been successfully initialized
            authModal.style.display = 'none';
            alert('Successfully signed in.');
        }
    });

    // Helper function to retrieve tokens from localStorage
    function getToken(tokenName) {
        return localStorage.getItem(tokenName);
    }
});
