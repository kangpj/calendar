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
const currentMonth  = new Date().getMonth();
const currentDate   = new Date().getDate();
let workingYear     = currentYear;
let workingMonth    = currentMonth;
let hMonth          = workingMonth + 1;
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
        updateVoteStatistics();
    } else if (message.type === 'managerAuthenticated') {
        document.getElementById('key').style.display = 'none';
        document.getElementById('lock').style.display = 'block';
        document.getElementById('resetVotesBtn').style.display = 'block';
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

function updateVoteStatistics() {
    if (mostVotedDay === null) {
        eMostVotedDay.textContent = '선택된 날짜가 없습니다.';
        voteCount.textContent = '참석자가 없습니다.';
    } else {
        eMostVotedDay.textContent = `최대인원 날짜: ${mostVotedDay}일`;
        voteCount.textContent = `참석 인원: ${clients.size}명 중 ${maxVotes}명`;
    }
}

// Handle voting on a day
/*
calendar.addEventListener('click', (e) => {
    const day = e.target.dataset.day;
    if (day) {
        socket.send(JSON.stringify({
            type: 'vote',
            data: { year: workingYear, month: workingMonth, day: parseInt(day), userId: getUserId() }
        }));
    }
});
*/

// Generate a user ID if it doesn’t exist in localStorage
function getToken(tokenName) {
    if (!localStorage.getItem(tokenName)) {
        localStorage.setItem(tokenName, 'user' + Math.random().toString(36).substr(2, 9));
    }
    return localStorage.getItem(tokenName);
}


// Request votes for a specific month
function loadMonth(year, month) {
    socket.send(JSON.stringify({
        type: 'vote',
        data: { year, month, day: 0, userId: getToken('userId') }
    }));
    console.log(`#${appSeq++} send a <vote> message`);
}

// Render calendar based on data received
/*
function renderCalendar(containerId, calendarData) {
    const calendarContainer = document.getElementById(containerId);
    calendarContainer.innerHTML = '';

    const key = `${workingYear}-${workingMonth}`;

    // Find the day with the most votes
    if (calendarData[key]) {
        calendarData[key].weeks.forEach(week => {
            week.forEach(day => {
                if (day && day.votes.length > maxVotes) {
                    maxVotes = day.votes.length;
                    mostVotedDay = day.date;
                }
            });
        });
    }

    const weekDayRow = document.createElement('div');
    weekDayRow.className = 'week';
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    weekDays.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerText = day;
        weekDayRow.appendChild(dayHeader);
    }); 
    calendarContainer.appendChild(weekDayRow);

    // Render the calendar as a grid of weeks
    calendarData[key]?.weeks.forEach(week => {
        const weekRow = document.createElement('div');
        weekRow.className = 'week';

        week.forEach(day => {
            const dayCell = document.createElement('div');
            dayCell.className = 'day';

            if (day === null) {
                dayCell.classList.add('empty-day');
            } else {
                dayCell.innerText = day.date;
                dayCell.dataset.day = day.date;

                // Set background color based on votes count
                const votesCount = day.votes.length;
                dayCell.style.backgroundColor = `rgba(0, 255, 0, ${Math.min(votesCount / 10, 1)})`;

                // Highlight the most voted day
                if (day.date === mostVotedDay) {
                    dayCell.classList.add('highlight');
                }
            }
            weekRow.appendChild(dayCell);
        });
        calendarContainer.appendChild(weekRow);
    });
}
*/

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