// votesManager.js

// Using a Map to store departments for efficient key-based management
const departments = new Map();

class VotesManager {
    constructor() {
        // Default "floating" department for users not assigned to any department
        this.defaultDepartmentId = "floating";
        this.getDepartmentVotes(this.defaultDepartmentId);
    }

    // Create or retrieve votes data for a department
    getDepartmentVotes(departmentId) {
        if (!departments.has(departmentId)) {
            departments.set(departmentId, {
                owner: null,           // userId of the department owner
                votesData: {},         // Stores votes data for each date
                members: new Set(),    // Stores userIds of department members
            });
        }
        return departments.get(departmentId).votesData;
    }

    // Assign the first member as the owner of the department
    assignOwner(departmentId, userId) {
        const department = departments.get(departmentId);
        if (!department.owner) {
            department.owner = userId;
        }
    }

    // Check if a user is the department owner
    isOwner(departmentId, userId) {
        const department = departments.get(departmentId);
        return department && department.owner === userId;
    }

    // Add a user to a department
    addUserToDepartment(departmentId, userId) {
        this.getDepartmentVotes(departmentId); // Ensure department exists
        const department = departments.get(departmentId);
        department.members.add(userId);
    }

    // Remove a user from a department
    removeUserFromDepartment(departmentId, userId) {
        const department = departments.get(departmentId);
        if (department) {
            department.members.delete(userId);
            // If the owner leaves, reset the department owner
            if (department.owner === userId) {
                department.owner = null;
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
    }

    // Remove a vote for a specific date by a specific user
    removeVote(departmentId, date, userId) {
        const votesData = this.getDepartmentVotes(departmentId);
        if (votesData[date]) {
            votesData[date].delete(userId);
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
            departments.get(departmentId).votesData = {};
            return true;
        }
        return false;
    }

    // Retrieve a list of all members in a department
    getDepartmentMembers(departmentId) {
        const department = departments.get(departmentId);
        return department ? Array.from(department.members) : [];
    }

    // Handle messaging between members of a department
    sendMessage(departmentId, senderId, recipientIds, message) {
        const department = departments.get(departmentId);
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
        const department = departments.get(departmentId);
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
        const department = departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return false;
        }
        return department.members.size === 0;
    }

    // Assign a manager to the department
    assignDepartmentManager(departmentId, userId) {
        const department = departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return;
        }
        department.owner = userId;
        console.log(`User ${userId} has been assigned as manager of department ${departmentId}.`);
    }

    // Clear all votes in a department (only by manager)
    clearAllVotes(departmentId) {
        const department = departments.get(departmentId);
        if (!department) {
            console.error(`Department ${departmentId} does not exist.`);
            return false;
        }
        department.votesData = {};
        console.log(`All votes cleared in department ${departmentId}.`);
        return true;
    }
}

module.exports = new VotesManager();