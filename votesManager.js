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
            departmentId: 'float', 
            nickname: 'superadmin', 
            type: this.userTypes.SUPERUSER 
        });

        // Assign superuser as the owner of the 'float' department
        this.addUserToDepartment(this.defaultDepartmentId, superUser.userId);
        const floatDepartment = this.departments.get(this.defaultDepartmentId);
        floatDepartment.owner = superUser.userId;
        console.log(`Superuser ${superUser.userId} assigned as owner of department '${this.defaultDepartmentId}'.`);
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
     * Adds a new user to the users Map.
     * Sign-up users cannot be anonymous.
     * 
     * @param {string} name - The user's full name.
     * @param {string} phone - The user's phone number.
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
     * Adds a new user through sign-up (non-anonymous).
     * 
     * @param {string} name - The user's full name.
     * @param {string} phone - The user's phone number.
     * @param {string} passkey - The user's passkey.
     * @returns {Object} - The newly created user object.
     * @throws {Error} - If required fields are missing or phone is already taken.
     */
    async addSignUpUser(name, phone, passkey) {
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
        this.addUserToDepartment(this.defaultDepartmentId, userId); // Default department; can be modified as needed
        console.log(`New user ${userId} added as 'onymous' to department '${this.defaultDepartmentId}'.`);
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
     * Check if a phone number is already taken.
     * 
     * @param {string} phone - The phone number to check.
     * @returns {boolean} - True if taken, else false.
     */
    isPhoneTaken(phone) {
        for (let user of this.users.values()) {
            if (user.phone === phone) {
                return true;
            }
        }
        return false;
    }

    /**
     * Authenticate and log in a user.
     * 
     * @param {string} clientId - The client ID.
     * @param {string} phone - The user's phone number.
     * @param {string} passkey - The user's passkey.
     * @returns {Object} - The authenticated user data.
     * @throws {Error} - If authentication fails.
     */
    async loginUser(clientId, phone, passkey) {
        for (let user of this.users.values()) {
            if (user.phone === phone) {
                const isMatch = await bcrypt.compare(passkey, user.passkey);
                if (isMatch) {
                    // Associate clientId with user
                    this.addUser(clientId, user.userId, this.getUserDepartment(user.userId), user.name, user.userType);
                    console.log(`User ${user.userId} logged in with clientId ${clientId}.`);
                    return {
                        userId: user.userId,
                        name: user.name,
                        phone: user.phone,
                        departmentId: this.getUserDepartment(user.userId),
                        userType: user.userType
                    };
                } else {
                    throw new Error('Invalid passkey.');
                }
            }
        }
        throw new Error('User with the provided phone number does not exist.');
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
                        } else {
                            // Ensure 'float' department always has an owner
                            const superUser = Array.from(this.users.values()).find(u => u.userType === this.userTypes.SUPERUSER);
                            if (superUser) {
                                department.owner = superUser.userId;
                                department.members.add(superUser.userId);
                                console.log(`Superuser ${superUser.userId} re-assigned as owner of department '${departmentId}'.`);
                            }
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