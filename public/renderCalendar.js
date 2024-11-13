// public/renderCalendar2.js


function renderCalendar(containerId, votesData) {
    const calendarContainer = document.getElementById(containerId);
    calendarContainer.innerHTML = ''; // Clear any existing content
    
    const userId = getToken('clientId');

    const key = cookKey(workingYear, workingMonth);
    const today = new Date();
  
    // updateWorkingCalendar 함수에서 결과 객체 반환
    const { mostVotedDay, maxVotes, clientsSet } = updateWorkingCalendar(workingYear, workingMonth, votesData);
    updateVoteStatistics(mostVotedDay, maxVotes, clientsSet);

    const monthData = calendars[key];
    if (!monthData) return;

    // Create month header with navigation
    const monthHeader = document.createElement('div');
    monthHeader.className = 'month';
    const monthNav = document.createElement('ul');
    const prevButton = document.createElement('li');
    prevButton.className = 'prev';
    prevButton.innerHTML = '&#10094;';
    prevButton.addEventListener('click', () => navigateMonth(-1));
    
    const nextButton = document.createElement('li');
    nextButton.className = 'next';
    nextButton.innerHTML = '&#10095;';
    nextButton.addEventListener('click', () => navigateMonth(1));

    const monthName = document.createElement('li');
    monthName.style.fontSize = '24px';
    monthName.innerText = `${monthData.monthName}`;
    
    const yearName = document.createElement('li');
    yearName.style.fontSize = '18px';
    yearName.innerText = `${monthData.year}`;

    monthNav.append(prevButton, nextButton, monthName, yearName);
    monthHeader.appendChild(monthNav);
    calendarContainer.appendChild(monthHeader);

    // Create weekday headers
    const weekdaysRow = document.createElement('ul');
    weekdaysRow.className = 'weekdays';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => {
        const dayElement = document.createElement('li');
        dayElement.textContent = day;
        weekdaysRow.appendChild(dayElement);
    });
    calendarContainer.appendChild(weekdaysRow);

    // Create day cells
    const daysContainer = document.createElement('ul');
    daysContainer.className = 'days';

    // Populate days with votes data
    monthData.weeks.forEach(week => {
        week.forEach(day => {
            const dayCell = document.createElement('li');
            
            if (day === null) {
                dayCell.classList.add('empty-day');
            } else {
                const cellDate = new Date(monthData.year, monthData.month - 1, day.date);
                const num = document.createElement('span');
                num.innerText = day.date;
                
                if (day.disabled) {
                    dayCell.classList.add('disabled-day');
                } else {
                    // Highlight the most voted day 
                    if (day.date === mostVotedDay) { 
                        num.classList.add('highlight');
                    }
                    // Attach event listener for voting
                    if (cellDate >= today) {
                        dayCell.addEventListener('click', () => handleDayClick(day.date));
                    }
                    // Set background color based on votes count
                    const votesCount = day.votes.length || 0;
                    dayCell.style.backgroundColor = `rgba(0, 255, 0, ${Math.min(votesCount / 10, 1)})`;

                    // 현재 사용자가 투표한 날짜인지 확인하여 클래스 추가
                    if (day.votes.includes(userId)) {
                        dayCell.classList.add('user-voted-day');
                    }                    
                }

                dayCell.appendChild(num);
            }

            daysContainer.appendChild(dayCell);
        });
    });

    calendarContainer.appendChild(daysContainer);
}

function updateWorkingCalendar(year, month, votesData) {
    if (!votesData) return;
    
    const key = cookKey(year, month);
    if (!calendars[key]) calendars[key] = createMonthCalendar(year, month);
    
    // 지역 변수로 선언하여 함수 내에서만 접근 가능하게 함
    let maxVotes = 0;
    let mostVotedDay = null;
    const clientsSet = new Set(); // 기존의 clients는 전역 Set을 사용하지 않고 함수 내에서 관리

    const calendar = calendars[key];
    calendar.weeks.forEach(week => {
        week.forEach(cell => {
            if (cell) {
                let dateKey = `${year}-${month}-${cell.date}`;
                cell.votes = [];
                
                if (votesData[dateKey]) {
                    try {
                        // votesData[dateKey]가 배열인지 확인 후 처리
                        if (Array.isArray(votesData[dateKey])) {
                            votesData[dateKey].forEach(userId => clientsSet.add(userId));
                            cell.votes = votesData[dateKey];
                        } else {
                            console.warn(`votesData[${dateKey}]가 배열이 아닙니다. 자료형: ${typeof votesData[dateKey]}`);
                            cell.votes = [];
                        }

                        // 가장 많은 투표를 받은 날짜와 투표 수 업데이트
                        if (cell.votes.length > maxVotes) {
                            maxVotes = cell.votes.length;
                            mostVotedDay = cell.date;
                        }
                    } catch (error) {
                        console.error('Error processing votes for date:', dateKey, error);
                    }
                }
            }        
        });
    });

    // 최종적으로 계산된 mostVotedDay와 maxVotes 반환 또는 필요한 곳에 사용
    // 예를 들어, 반환 값을 renderCalendar 함수에서 사용할 수 있음
    return { mostVotedDay, maxVotes, clientsSet };
}

function updateVoteStatistics(mostVotedDay, maxVotes, clientsSet) {
    if (mostVotedDay === null) {
        eMostVotedDay.textContent = '선택된 날짜가 없습니다.';
        voteCount.textContent = '참석자가 없습니다.';
    } else {
        eMostVotedDay.textContent = `최대인원 날짜: ${mostVotedDay}일`;
        voteCount.textContent = `참석 인원: ${clientsSet.size}명 중 ${maxVotes}명`;
    }
}
// Helper function to navigate months
function navigateMonth(offset) {
    workingMonth += offset;
    if (workingMonth < 1) {
        workingMonth = 12;
        workingYear--;
    } else if (workingMonth > 12) {
        workingMonth = 1;
        workingYear++;
    }
    loadMonth(workingYear, workingMonth);
}

// Request votes for a specific month
function loadMonth(year, month) {
    socket.send(JSON.stringify({
        type: 'vote',
        data: { year, month, day: 0, userId: getToken('userId') }
    }));
    console.log(`#${appSeq++} send a <vote> message`);
}

// Send vote to WebSocket without toggling previous selections
function handleDayClick(day) {
    const selectedDate = new Date(workingYear, workingMonth - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 오늘 날짜의 시간을 00:00:00으로 설정

    if (selectedDate < today) {
        alert('과거 날짜에는 투표할 수 없습니다.');
        return;
    }

    socket.send(JSON.stringify({ 
        type: 'vote',
        data: { year: workingYear, month: workingMonth, day: parseInt(day), userId: getToken('userId') }
    }));
}

function cookKey(year, month, date) {
    if (typeof date === 'undefined') {
        return `${year}-${month}`;
    }
    return `${year}-${month}-${date}`;
}

function createMonthCalendar(year, month) {
    const calendar = [];
    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDay = new Date(year, month, 0).getDate();
    let week = new Array(7).fill(null);
    let day = 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // 오늘 날짜의 시간을 00:00:00으로 설정

    for (let i = firstDay; i < 7 && day <= lastDay; i++) {
        const cellDate = new Date(year, month - 1, day);
        if (cellDate < today) {
            week[i] = { date: day++, votes: [], disabled: true }; // 과거 날짜 표시
        } else {
            week[i] = { date: day++, votes: [], disabled: false };
        }
    }
    calendar.push(week);

    while (day <= lastDay) {
        week = new Array(7).fill(null);
        for (let i = 0; i < 7 && day <= lastDay; i++) {
            const cellDate = new Date(year, month - 1, day);
            if (cellDate < today) {
                week[i] = { date: day++, votes: [], disabled: true }; // 과거 날짜 표시
            } else {
                week[i] = { date: day++, votes: [], disabled: false };
            }
        }
        calendar.push(week);
    }

    return {
        year,
        month,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
        weeks: calendar
    };
}
function unionSets(setA, setB) {
    return new Set([...setA, ...setB]);
}



// 추가: 새로운 사용자가 부서에 추가되었음을 처리하는 함수
// 이미 public/app.js에서 처리하고 있으므로 이 부분은 생략 가능