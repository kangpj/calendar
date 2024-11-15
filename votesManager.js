// votesManager.js

// Using a Map to store departments for efficient key-based management
//const departments = new Map();

// 사용자 데이터가 서버에서 관리되므로, 서버에서 관리하는 usersData와 연동 필요
const usersData = {}; // 서버에서 클라이언트와 연동되는 사용자 데이터를 관리

class VotesManager {
    constructor() {
        // Initialize a Map to store department data
        this.departments = new Map();
        this.defaultDepartmentId = "default";
        this.initializeDepartment(this.defaultDepartmentId);
    }

    // Initialize a department with default structure
    initializeDepartment(departmentId) {
        if (!this.departments.has(departmentId)) {
            this.departments.set(departmentId, {
                owner: null,           // userId of the department owner
                votesData: {},         // Stores votes data for each date
                members: new Set(),    // Stores userIds of department members
            });
            console.log(`Department ${departmentId} initialized.`);
        }
    }

    // Create or retrieve votes data for a department
    getDepartmentVotes(departmentId) {
        this.initializeDepartment(departmentId);
        return this.departments.get(departmentId).votesData;
    }

    // Assign the first member as the owner of the department
    assignOwner(departmentId, userId) {
        const department = this.departments.get(departmentId);
        if (!department.owner) {
            department.owner = userId;
            console.log(`User ${userId} assigned as owner of department ${departmentId}.`);
        }
    }

    // Check if a user is the department owner
    isOwner(departmentId, userId) {
        const department = this.departments.get(departmentId);
        return department && department.owner === userId;
    }

    // Add a user to a department
    addUserToDepartment(departmentId, userId) {
        this.initializeDepartment(departmentId);
        const department = this.departments.get(departmentId);
        department.members.add(userId);
        console.log(`User ${userId} added to department ${departmentId}.`);
    }

    // Remove a user from a department
    removeUserFromDepartment(departmentId, userId) {
        const department = this.departments.get(departmentId);
        if (department) {
            department.members.delete(userId);
            console.log(`User ${userId} removed from department ${departmentId}.`);
            // If the owner leaves, reset the department owner
            if (department.owner === userId) {
                department.owner = null;
                // Optionally, assign a new owner if members exist
                if (department.members.size > 0) {
                    department.owner = department.members.values().next().value;
                    console.log(`User ${department.owner} is now the owner of department ${departmentId}.`);
                }
            }
        }
    }

    // Update a vote for a specific date (or cell) in the department
    updateVote(departmentId, date, userId) {
        const votesData = this.getDepartmentVotes(departmentId);
        if (!votesData[date]) {
            votesData[date] = new Set();
        }
        votesData[date].add(userId);
        console.log(`User ${userId} voted on ${date} in department ${departmentId}.`);
    }

    // Remove a vote for a specific date by a specific user
    removeVote(departmentId, date, userId) {
        const votesData = this.getDepartmentVotes(departmentId);
        if (votesData[date]) {
            votesData[date].delete(userId);
            console.log(`User ${userId} removed vote on ${date} in department ${departmentId}.`);
            // Remove date entry if no votes left
            if (votesData[date].size === 0) {
                delete votesData[date];
            }
        }
    }

    // Get all votes in a department (convert Set to array for JSON compatibility)
    getAllVotes(departmentId, year, month) {
        const votesData = this.getDepartmentVotes(departmentId);
        const filteredData = {};
        
        // year와 month가 제공된 경우에만 필터링
        if (year !== undefined && month !== undefined) {
            const prefix = `${year}-${month}`;
            for (const [date, votes] of Object.entries(votesData)) {
                if (date.startsWith(prefix)) {
                    filteredData[date] = Array.from(votes);
                }
            }
            return filteredData;
        }
        
        // year와 month가 없으면 전체 데이터 반환
        return Object.fromEntries(
            Object.entries(votesData).map(([date, votes]) => [date, Array.from(votes)])
        );
    }

    // Reset votes data for a department (only by owner)
    resetVotes(departmentId, userId) {
        if (this.isOwner(departmentId, userId)) {
            this.departments.get(departmentId).votesData = {};
            return true;
        }
        return false;
    }

    // Retrieve a list of all members in a department
    getDepartmentMembers(departmentId) {
        const department = this.departments.get(departmentId);
        return department ? Array.from(department.members) : [];
    }

    // Handle messaging between members of a department
    sendMessage(departmentId, senderId, recipientIds, message) {
        const department = this.departments.get(departmentId);
        if (!department) return [];

        // Filter members based on recipients, exclude the sender
        const members = Array.from(department.members);
        return members
            .filter((userId) => recipientIds.includes(userId) && userId !== senderId)
            .map((userId) => ({ userId, message }));
    }

    // Function to create or retrieve the default department (for unassigned users)
    getDefaultDepartment() {
        return this.getDepartmentVotes(this.defaultDepartmentId);
    }

    // Toggle a vote for a specific date by a user in a department
    toggleVote(departmentId, year, month, day, userId) {
        const dateKey = `${year}-${month}-${day}`;
        const department = this.departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return;
        }

        if (!department.votesData[dateKey]) {
            department.votesData[dateKey] = new Set();
        }

        if (department.votesData[dateKey].has(userId)) {
            department.votesData[dateKey].delete(userId);
            console.log(`User ${userId} removed vote on ${dateKey} in department ${departmentId}.`);
            // Optionally, remove the date key if no votes remain
            if (department.votesData[dateKey].size === 0) {
                delete department.votesData[dateKey];
            }
        } else {
            department.votesData[dateKey].add(userId);
            console.log(`User ${userId} added vote on ${dateKey} in department ${departmentId}.`);
        }
    }

    // Check if the user is the first member in the department
    isFirstUserInDepartment(departmentId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return false;
        }
        return department.members.size === 0;
    }

    // Assign a manager to the department
    assignDepartmentManager(departmentId, userId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return;
        }
        department.owner = userId;
        console.log(`User ${userId} has been assigned as manager of department ${departmentId}.`);
    }

    // Clear all votes in a department (only by manager)
    clearAllVotes(departmentId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return false;
        }
        department.votesData = {};
        console.log(`All votes cleared in department ${departmentId}.`);
        return true;
    }

    // Check if a nickname() is taken in a department
    isNicknameTaken(departmentId, nickname) {
        const lowerNickname = nickname.toLowerCase();
        const department = this.departments.get(departmentId);
        if (!department) return false;
        for (let userId of department.members) {
            const user = usersData[userId];
            if (user && user.nickname.toLowerCase() === lowerNickname) {
                return true;
            }
        }
        return false;
    }

    // Check if a department has members
    hasMembers(departmentId) {
        const department = this.departments.get(departmentId);
        return department && department.members.size > 0;
    }

    // Remove a department
    removeDepartment(departmentId) {
        if (this.departments.has(departmentId)) {
            this.departments.delete(departmentId);
            console.log(`Department ${departmentId} has been removed as it has no members.`);
        }
    }

    // Get all members of a department
    getDepartmentMembers(departmentId) {
        const department = this.departments.get(departmentId);
        return department ? Array.from(department.members) : [];
    }
}

module.exports = new VotesManager();