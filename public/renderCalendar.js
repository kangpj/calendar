// public/renderCalendar2.js


function renderCalendar(containerId, votesData) {
    const calendarContainer = document.getElementById(containerId);
    calendarContainer.innerHTML = ''; // Clear any existing content
    
    const userId = getToken('clientId');
    let maxVotes = 0;
    let mostVotedDay = null;
    let marks = [];
    const key = cookKey(workingYear, workingMonth);
    const today = new Date();

    updateWorkingCalendar(workingYear, workingMonth, votesData);

    // Find the day with the most votes
    if (calendars[key]) {
        calendars[key].weeks.forEach(week => {
            week.forEach(day => {
                if (day && day.votes.indexOf(userId) > -1) {
                    marks.push(day.date);
                }
                if (day && day.votes.length > maxVotes) {
                    maxVotes = day.votes.length;
                    mostVotedDay = day.date;
                }
            });
        });
    }
    
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
            
            //dayCell.className = 'day';

            if (day === null) {
                dayCell.classList.add('empty-day');
            } else {

                thisDate = new Date(monthData.year, monthData.month, day.date);
                const num = document.createElement('span');
                if (marks.indexOf(day.date) > -1) {
                    num.innerText = `[${day.date}]`;
                } else {
                    num.innerText = day.date;
                }
                // Highlight the most voted day 
                if (day.date === mostVotedDay) { 
                    num.classList.add('highlight');
                }
                dayCell.appendChild(num);
                
                // Attach event listener for voting
                if (thisDate > today) {
                    dayCell.addEventListener('click', () => handleDayClick(day.date));
                    // Server side filtering is needed to escalate input value validation.
                }
                // Set background color based on votes count
                const votesCount = day.votes.length || 0;
                dayCell.style.backgroundColor = `rgba(0, 255, 0, ${Math.min(votesCount / 10, 1)})`;
            }

            daysContainer.appendChild(dayCell);
        });
    });

    calendarContainer.appendChild(daysContainer);
}

// Helper function to navigate months
function navigateMonth(offset) {
    workingMonth += offset;
    hMonth += offset;
    if (workingMonth < 0) {
        workingMonth = 11;
        hMonth = 12;
        workingYear--;
    } else if (workingMonth > 11) {
        workingMonth = 0;
        hMonth = 1;
        workingYear++;
    }
    loadMonth(workingYear, workingMonth);
}
// Send vote to WebSocket without toggling previous selections
function handleDayClick(day) {
    socket.send(JSON.stringify({ 
    type: 'vote',
    data: { year: workingYear, month: workingMonth, day: parseInt(day), clientId: getToken('clientId') }
    }));
}

function cookKey(year, month, date) {
    if (typeof date == 'undefined')
            return `${year}-${month}`;
    else    return `${year}-${month}-${date}`;
}

function createMonthCalendar(year, month) {
    const calendar = [];
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    let week = new Array(7).fill(null);
    let day = 1;

    for (let i = firstDay; i < 7 && day <= lastDay; i++) {
        week[i] = { date: day++, votes: [] };
    }
    calendar.push(week);

    while (day <= lastDay) {
        week = new Array(7).fill(null);
        for (let i = 0; i < 7 && day <= lastDay; i++) {
            week[i] = { date: day++, votes: [] };
        }
        calendar.push(week);
    }

    return {
        year,
        month,
        monthName: new Date(year, month).toLocaleString('default', { month: 'long' }),
        weeks: calendar
    };
}

function updateWorkingCalendar(year, month, votesData) {
    
    const key = cookKey(year, month);
    if (!calendars[key]) calendars[key] = createMonthCalendar(year, month);
    
    clients.clear()
    const calendar = calendars[key];
    calendar.weeks.forEach(week => {
        week.forEach(cell => {
            if (cell) {
                let key = cookKey(year, month, cell.date);
                if (votesData[key]) {
                    clients.union(votesData[key]);
                    cell.votes = Array.from(votesData[key]);
                    if (cell.votes.length > maxVotes) {
                        mostVotedDay    = cell.date;
                        maxVotes        = cell.votes.length;        
                    } 
                }
            }        
        });
    });
}