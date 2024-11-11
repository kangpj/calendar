#! /usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const app = express();
// votesManager is a separate module
const votesManager = require('./votesManager'); 


let usersData = {}; 
// Stores { clientId: { token, userId, nickname, department, role } }

const clients = [];
// key: websocket
// data: { IPaddress, secretNumber, clientId }

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let year = new Date().getFullYear();
let month = new Date().getMonth();
// votesManager.toggleVote(year, month);
let logSeq = 0;

wss.on('connection', (ws, req) => {

    // indivisual clients' properties
    const client = {};
    const currentClientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let currentClientId = null;
    let currentUserDept = null;
    let currentUserNcik = null;

    let currentDepartment = 'default'; // Initialize with default department

    console.log(`#${logSeq++} New client connected: ${currentClientId} from ${currentClientIP}` );
    
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'init') {

                currentClientId = parsedMessage.data;
                client[currentClientId] = {
                    ws:             ws,
                    ip:             currentClientIP,
                    secretNumber:   generateClientSecret(currentClientId)
                    };
                clients.push(client);
                // The very first message with vote status to the newly connected client
                ws.send(JSON.stringify({
                    type: 'updateVotes',
                    data: votesManager.getDefaultDepartment() 
                }));
            } else if (parsedMessage.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong'
                }));
            } else if (parsedMessage.type === 'vote') {
                const { year, month, day, userId } = parsedMessage.data;
                console.log('Logging for debug:(vote) ', userId);

                // Register vote in votesManager for the specific department
                votesManager.toggleVote(currentDepartment, year, month, day, userId);
                
                // Get filtered votes data for the specific year and month
                const votesData = votesManager.getAllVotes(currentDepartment, year, month);

                // Broadcast updated votes to all clients in the same department
                if (day === 0) {
                    // unicast
                    ws.send(JSON.stringify({
                        type: 'updateVotes',
                        data: votesData
                    }));
                } else {
                    broadcastDepartmentMessage(currentDepartment, {
                        type: 'updateVotes',
                        data: votesData
                    });
                }
            } else if (parsedMessage.type === 'getStatistics') {
                const { year, month } = parsedMessage.data;
                const { theDay, theNumber } = votesManager.getMostVotedDayInMonth(year, month);
                // unicast
                ws.send(JSON.stringify({
                    type: 'updateVoteStatistic',
                    data: {votersTotal: votesManager.getUniqueVoters(),
                           availableTotal: theNumber, 
                           theDay: theDay}
                }));

            } else if (parsedMessage.type === 'signIn') {
                const { userId, department, nickname } = parsedMessage.data;
                usersData[userId] = { department, nickname, isManager: false };
                currentUserId = userId;
                currentDepartment = department; // Set current department

                // Assign manager if first user in department
                if (votesManager.isFirstUserInDepartment(department)) {
                    usersData[userId].isManager = true;
                    votesManager.assignDepartmentManager(department, userId);
                    ws.send(JSON.stringify({ type: 'managerAuthenticated' }));
                }

                console.log('User signed in:', usersData[userId]);

            } else if (parsedMessage.type === 'logout') {
                if (currentUserId) {
                    console.log('Logging for debug:(logout) ', currentUserId);
                    delete usersData[currentUserId];
                    currentUserId = null;
                }
            } else if (parsedMessage.type === 'resetVotes' && usersData[currentUserId]?.isManager) {
                votesManager.clearAllVotes(currentDepartment);
                broadcastDepartmentMessage(currentDepartment, {
                    type: 'updateVotes',
                    data: votesManager.getAllVotes(currentDepartment)
                });
            } else if (parsedMessage.type === 'chat') {
                const { senderId, message: chatMessage, recipientIds } = parsedMessage.data;
                console.log(`Chat message from ${senderId}: ${chatMessage}`);
                
                // Prepare chat data to send
                const chatData = {
                    type: 'chat',
                    data: {
                        senderId,
                        message: chatMessage,
                        timestamp: new Date().toISOString(),
                    }
                };
                
                if (recipientIds && recipientIds.length > 0) {
                    // Private message to specific users
                    const recipients = votesManager.sendMessage(currentDepartment, senderId, recipientIds, chatMessage);
                    recipients.forEach(recipient => {
                        const recipientClient = clients.find(client => client.clientId === recipient.userId);
                        if (recipientClient && recipientClient.ws.readyState === WebSocket.OPEN) {
                            recipientClient.ws.send(JSON.stringify(chatData));
                        }
                    });
                } else {
                    // Broadcast to all members in the department
                    broadcastDepartmentMessage(currentDepartment, chatData);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => closeClient(ws, currentClientIP, currentClientId, client, currentDepartment));
});

// Heartbeat function to keep connections alive
function heartbeat() {
    this.isAlive = true;
}

function closeClient(ws, ip, clientId, client, department) {

    const idx = clients.findIndex(item => item.clientId === clientId && item.department === department);
    if (idx > -1) clients.splice(idx, 1);
    ws.terminate();
    console.log(`Client from ${ip} disconnected from department ${department}`);

}

// Generate a unique hidden number for client verification
function generateClientSecret(clientId) {
    const secretNumber = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
    //clientSecretNumbers.set(clientId, secretNumber);
    return secretNumber; // Provide this to the user to save for verification
}

// Verify the client secret number to confirm decoupling
function verifyAndDecouple(clientId, providedSecret) {
    const storedSecret = clientSecretNumbers.get(clientId);

    if (storedSecret && storedSecret === providedSecret) {
        usersData.delete(clientId); // Decouple the clientId and userId
        clientSecretNumbers.delete(clientId); // Clear the secret
        return true;
    } else {
        throw new Error('Invalid secret number. Cannot decouple.');
    }
}

function broadcastDepartmentMessage(department, message) {
    const messageString = JSON.stringify(message);
    clients.forEach(client => {
        if (client.department === department && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageString);
        }
    });
}

// Serve static files (e.g., the frontend HTML and JS files)
app.use(express.static('public'));

// Start the server
server.listen(3000, () => {
    console.log('Server running on port 3000');
});


/*
let usersData = {}; // Stores { clientId: { token, userId, nickname, department, role } }

// Helper functions
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Step 1: Generate a clientId and token, send it to the client
    const clientId = generateId();
    const token = generateToken();
    usersData[clientId] = { token, role: 'guest' }; // Default role for new users

    ws.clientId = clientId; // Attach clientId to the WebSocket session
    ws.send(JSON.stringify({ type: 'init', clientId, token }));

    // Listen for messages from the client
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Step 2: Initialize userId, nickname, etc., based on client response
        if (data.type === 'initializeUser' && data.clientId === ws.clientId) {
            const { uniqueUserId, nickname, department } = data;
            usersData[clientId] = {
                ...usersData[clientId],
                userId: uniqueUserId,
                nickname,
                department,
                role: department ? 'departmentUser' : 'guest',
            };
            console.log(`User initialized: ${JSON.stringify(usersData[clientId])}`);

            // Acknowledge successful initialization
            ws.send(JSON.stringify({ type: 'userInitialized', status: 'success' }));
        }
    });

    ws.on('close', () => {
        console.log(`Client with clientId ${ws.clientId} disconnected`);
        delete usersData[ws.clientId];
    });
});
*/