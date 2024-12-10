// votesManager.js

const bcrypt = require('bcrypt');
const crypto = require('crypto');

class VotesManager {
    constructor() {
        // Initialize Maps to store users and departments
        this.userIdCounter = 1;
        this.users = new Map();        // Stores user details
        this.usersData = new Map();    // Associates clientId with user data
        this.departments = new Map();  // Stores department details

        this.defaultDepartmentId = "float";
        this.initializeDepartment(this.defaultDepartmentId);
        this.userTypes = {
            SUPERUSER: 'superuser',
            MANAGER: 'manager',
            ONYMOUS: 'onymous',
            ANONYMOUS: 'anonymous'
        };
        this.initializeSuperUser();
    }
    
    initializeSuperUser() {
        const superUser = {
            userId: 'superuser_1',
            name: 'Super Admin',
            phone: '000-0000',
            passkey: null,
            token: null,
            expiration: null,
            userType: this.userTypes.SUPERUSER
        };
        this.users.set(superUser.userId, superUser);
        this.usersData.set('superclient', { 
            clientId: 'superclient',
            userId: superUser.userId, 
            departmentId: 'All', 
            nickname: 'superadmin', 
            type: this.userTypes.SUPERUSER 
        });
    }
    
    // Helper method to generate unique user IDs
    generateUserId() {
        return `user_${this.userIdCounter++}`;
    }

    // Helper method to generate tokens
    generateToken() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Helper method to calculate token expiration
    calculateExpiration(hours = 1) {
        const now = new Date();
        now.setHours(now.getHours() + hours);
        return now.toISOString();
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

    // Add a user to a department
    addUserToDepartment(departmentId, userId) {
        this.initializeDepartment(departmentId);
        const department = this.departments.get(departmentId);
        department.members.add(userId);
        console.log(`User ${userId} added to department ${departmentId}.`);
        // Assign owner if none exists
        if (!department.owner) {
            department.owner = userId;
            console.log(`User ${userId} assigned as owner of department ${departmentId}.`);
        }
    }

    /**
     * Revised addUser function to set only the usersData Map.
     * Ensures that anonymous users are always assigned to the 'float' department.
     * 
     * @param {string} clientId - The client ID.
     * @param {string} userId - The user ID to associate with the clientId.
     * @param {string} departmentId - The department ID the user belongs to.
     * @param {string} nickname - The user's nickname.
     * @param {string} type - The type of user (e.g., 'superuser', 'manager', 'onymous', 'anonymous').
     * @returns {Object} - The user data associated with the clientId.
     * @throws {Error} - If department assignment for anonymous user is incorrect.
     */
    addUser(clientId, userId, departmentId, nickname, type) {
        if (!clientId || !userId || !departmentId || !nickname || !type) {
            throw new Error('All parameters must be provided to add a user.');
        }

        const user = this.users.get(userId);
        if (!user) {
            throw new Error(`User ID '${userId}' does not exist.`);
        }

        // Enforce 'float' department for anonymous users
        if (type === this.userTypes.ANONYMOUS && departmentId !== this.defaultDepartmentId) {
            throw new Error('Anonymous users must be assigned to the "float" department.');
        }

        this.usersData.set(clientId, { clientId, userId, departmentId, nickname, type });
        console.log(`Client ${clientId} associated with user ${userId} in department ${departmentId}.`);
        return this.getUserData(clientId);
    }

    /**
     * Adds a new user to the users Map.
     * Sign-up users cannot be anonymous.
     * 
     * @param {string} name - The user's full name.
     * @param {string} phone - The user's phone number.
     * @param {string} [passkey=null] - The user's passkey (required for non-anonymous users).
     * @returns {Object} - The newly added user object.
     * @throws {Error} - If required fields are missing or phone is taken.
     */
    async addSignUpUser(name, phone, passkey = null) {
        // Sign-up users must be non-anonymous
        if (!name || !phone || !passkey) {
            throw new Error('Name, phone, and passkey are required for sign-up.');
        }

        const isTaken = this.isPhoneTaken(phone);

        if (isTaken) {
            throw new Error('Phone number is already in use.');
        }
        
        const hashedPasskey = await bcrypt.hash(passkey, 10);
        const userId = this.generateUserId();
        const token = this.generateToken();
        const expiration = this.calculateExpiration();

        const newUser = {
            userId,
            name,
            phone,
            passkey: hashedPasskey,
            token,
            expiration,
            userType: this.userTypes.ONYMOUS
        };
        this.users.set(userId, newUser);
        this.addUserToDepartment('float', userId); // Default department; can be modified as needed
        console.log(`New user ${userId} added as 'onymous' to department 'float'.`);
        return newUser;
    }

    /**
     * Creates an anonymous user and associates with a clientId.
     * Anonymous users are always part of the 'float' department.
     * 
     * @returns {Object} - The newly added anonymous user object.
     */
    async addAnonymousUser() {
        const userId = this.generateUserId();
        const anonymousName = `Guest_${Math.floor(Math.random() * 10000)}`; // Generate a random name for display
        const token = this.generateToken();
        const expiration = this.calculateExpiration();

        const newUser = {
            userId,
            name: anonymousName,
            phone: null, // No phone for anonymous users
            passkey: null, // No passkey for anonymous users
            token,
            expiration,
            userType: this.userTypes.ANONYMOUS
        };
        this.users.set(userId, newUser);
        this.addUserToDepartment(this.defaultDepartmentId, userId);
        console.log(`Anonymous user ${userId} added to department '${this.defaultDepartmentId}'.`);
        return newUser;
    }

    // Helper method to check if a phone number is already taken
    isPhoneTaken(phone) {
        for (let user of this.users.values()) {
            if (user.phone === phone) {
                return true;
            }
        }
        return false;
    }

    /**
     * Promote a user to manager.
     * 
     * @param {string} userId - The user ID to promote.
     * @param {string} passkey - The user's passkey for verification.
     * @returns {boolean} - Returns true if promotion is successful.
     * @throws {Error} - If user does not exist, is already a manager/superuser, or passkey is invalid.
     */
    async promoteToManager(userId, passkey) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        if (user.userType === this.userTypes.SUPERUSER) {
            throw new Error('User is already a superuser.');
        }

        if (user.userType === this.userTypes.MANAGER) {
            throw new Error('User is already a manager.');
        }

        if (user.userType === this.userTypes.ANONYMOUS) {
            throw new Error('Anonymous users cannot be promoted.');
        }

        if (user.userType !== this.userTypes.ONYMOUS) {
            throw new Error('Only onymous users can be promoted to manager.');
        }

        if (!user.passkey) {
            throw new Error('User does not have a passkey set.');
        }

        const isPasskeyValid = await bcrypt.compare(passkey, user.passkey);
        if (!isPasskeyValid) {
            throw new Error('Invalid passkey.');
        }

        user.userType = this.userTypes.MANAGER;
        this.users.set(userId, user);
        console.log(`User ${userId} has been promoted to manager.`);
        return true;
    }

    /**
     * Demote a manager to onymous.
     * 
     * @param {string} userId - The user ID to demote.
     * @returns {boolean} - Returns true if demotion is successful.
     * @throws {Error} - If user does not exist or is not a manager.
     */
    demoteManager(userId) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        if (user.userType !== this.userTypes.MANAGER) {
            throw new Error('User is not a manager.');
        }

        user.userType = this.userTypes.ONYMOUS;
        this.users.set(userId, user);
        console.log(`User ${userId} has been demoted to onymous.`);
        return true;
    }

    /**
     * Promote a user to superuser.
     * 
     * @param {string} userId - The user ID to promote.
     * @param {string} passkey - The user's passkey for verification.
     * @returns {boolean} - Returns true if promotion is successful.
     * @throws {Error} - If user does not exist, is already a superuser, or passkey is invalid.
     */
    async promoteToSuperUser(userId, passkey) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        if (user.userType === this.userTypes.SUPERUSER) {
            throw new Error('User is already a superuser.');
        }

        if (user.userType !== this.userTypes.MANAGER) {
            throw new Error('Only managers can be promoted to superusers.');
        }

        if (!user.passkey) {
            throw new Error('User does not have a passkey set.');
        }

        const isPasskeyValid = await bcrypt.compare(passkey, user.passkey);
        if (!isPasskeyValid) {
            throw new Error('Invalid passkey.');
        }

        user.userType = this.userTypes.SUPERUSER;
        this.users.set(userId, user);
        console.log(`User ${userId} has been promoted to superuser.`);
        return true;
    }

    /**
     * Get user data associated with a clientId.
     * 
     * @param {string} clientId - The client ID.
     * @returns {Object|null} - The user data or null if not found.
     */
    getUserData(clientId) {
        return this.usersData.get(clientId) || null;
    }

    /**
     * Retrieve votes data for a specific department.
     * 
     * @param {string} departmentId - The department ID.
     * @returns {Object} - Votes data for the department.
     */
    getAllVotes(departmentId, requestingUserId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            throw new Error(`Department '${departmentId}' does not exist.`);
        }
        // Implement role-based access if needed
        return department.votesData;
    }

    /**
     * Update vote for a specific date in a department.
     * 
     * @param {string} departmentId - The department ID.
     * @param {string} date - The date for which the vote is cast.
     * @param {string} userId - The user ID casting the vote.
     */
    updateVote(departmentId, date, userId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            throw new Error(`Department '${departmentId}' does not exist.`);
        }

        if (!department.votesData[date]) {
            department.votesData[date] = new Set();
        }

        department.votesData[date].add(userId);
        console.log(`User ${userId} cast a vote for ${date} in department ${departmentId}.`);
    }

    /**
     * Get all users in the system.
     * 
     * @returns {Array<Object>} - List of all user objects.
     */
    getAllUsers() {
        return Array.from(this.users.values()).map(user => ({
            userId: user.userId,
            name: user.name,
            phone: user.phone,
            department: this.getUserDepartment(user.userId),
            userType: user.userType
        }));
    }

    /**
     * Get the department ID of a user.
     * 
     * @param {string} userId - The user ID.
     * @returns {string|null} - The department ID or null if not found.
     */
    getUserDepartment(userId) {
        for (let [deptId, dept] of this.departments.entries()) {
            if (dept.members.has(userId)) {
                return deptId;
            }
        }
        return null;
    }

    /**
     * Remove a user from the system.
     * 
     * @param {string} userId - The user ID to remove.
     * @throws {Error} - If user does not exist.
     */
    removeUser(userId) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('User not found.');
        }

        // Remove from departments
        const departmentId = this.getUserDepartment(userId);
        if (departmentId) {
            const department = this.departments.get(departmentId);
            if (department) {
                department.members.delete(userId);
                console.log(`User ${userId} removed from department ${departmentId}.`);

                // Reassign owner if necessary
                if (department.owner === userId) {
                    if (department.members.size > 0) {
                        department.owner = department.members.values().next().value;
                        console.log(`User ${department.owner} is now the owner of department ${departmentId}.`);
                    } else {
                        department.owner = null;
                        console.log(`Department ${departmentId} now has no owner.`);
                        if (departmentId !== this.defaultDepartmentId) {
                            this.departments.delete(departmentId);
                            console.log(`Department ${departmentId} has been removed due to no members.`);
                        }
                    }
                }
            }
        }

        // Remove from usersData
        for (let [clientId, data] of this.usersData.entries()) {
            if (data.userId === userId) {
                this.usersData.delete(clientId);
                console.log(`Client ${clientId} association removed.`);
                break;
            }
        }

        // Finally, remove the user
        this.users.delete(userId);
        console.log(`User ${userId} has been removed from the system.`);
    }

    // ... Additional methods as needed
}

module.exports = new VotesManager();