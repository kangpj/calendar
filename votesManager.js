// votesManager.js

// Using a Map to store departments for efficient key-based management
//const departments = new Map();
const bcrypt = require('bcrypt');
// 사용자 데이터가 서버에서 관리되므로, 서버에서 관리하는 usersData와 연동 필요
//const users = new Map();
//const usersData = new Map(); // 서버에서 클라이언트와 연동되는 사용자 데이터를 관리

class VotesManager {
    constructor() {
        // Initialize a Map to store department data
        this.userIdCounter = 1;
        this.users = new Map();
        this.usersData = new Map();
        this.departments = new Map();
        this.defaultDepartmentId = "float";
        this.initializeDepartment(this.defaultDepartmentId);
        this.userTypes = {
            SUPERUSER: 'superuser',
            MANAGER: 'manager',
            NONONYMOUS: 'nononymous',
            ANONYMOUS: 'anonymous'
        };
        this.initializeSuperUser();
    }
    
    initializeSuperUser() {
        const superUser = {
            userId: 'superuser_1',
            department: 'All',
            nickname: 'superadmin',
            passkey: null,
            votes: [],
            userType: this.userTypes.SUPERUSER
        };
        this.users.set(superUser.userId, superUser);
        this.usersData.set(superUser.userId, { userId: superUser.userId, department: superUser.department, isAnonymous: false });
    }
    
    // 간단한 userId 생성 함수
    generateUserId() {
       return `user_${this.userIdCounter++}`;
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
        console.log(`User ${userId} added to department ${departmentId}.`, this.departments);
    }
   /**
    * 사용자 추가 함수
    * @param {string} clientId - 클라이언트 ID
    * @param {string} department - 부서 이름
    * @param {string} [nickname] - 닉네임 (익명 사용 시 생략)
    * @param {string} [passkey] - 패스키 (익명 사용 시 생략)
    * @param {boolean} [isAnonymous=true] - 익명 여부, default to true
    * @returns {Object} - 새로 추가된 사용자 객체
    */
   async addUser(clientId, department, nickname = null, passkey = null, isAnonymous = true) {
        if (!isAnonymous) {
            if (!nickname || !passkey) {
                throw new Error('닉네임과 패스키는 필수 입력 사항입니다.');
            }

            const isTaken = this.isNicknameTaken(department, nickname);
        
            if (isTaken) {
                throw new Error('닉네임이 이미 사용 중입니다.');
            }
            
            const hashedPasskey = await bcrypt.hash(passkey, 10);
            const userId = this.generateUserId();
            const newUser = {
                userId,
                department,
                nickname,
                passkey: hashedPasskey,
                votes: [],
                userType: this.userTypes.NONONYMOUS
            };
            this.users.set(userId, newUser);
            this.usersData.set(clientId, { userId, department, isAnonymous: false });
            this.addUserToDepartment(department, userId);
            return newUser;
        } else {
            // Handle anonymous user
            const userId = this.generateUserId();
            const anonymousNickname = `Guest_${Math.floor(Math.random() * 10000)}`; // Generate a random nickname for display
            
            const newUser = {
                userId,
                department,
                nickname: anonymousNickname,
                passkey: null, // No passkey for anonymous users
                votes: [],
                userType: this.userTypes.ANONYMOUS
            };
            this.users.set(userId, newUser);
            this.usersData.set(clientId, { userId, department, isAnonymous: true });
            this.addUserToDepartment(department, userId);
            return newUser;
        }
    }
    /**
     * 특정 부서에 사용자를 제거하는 함수
     * @param {string} department - 부서 이름
     * @param {string} userId - 제거할 사용자 ID
     */
    removeUserFromUsers(department, userId) {
        const user = this.users.get(userId);
        if (user && user.department === department) {
            this.users.delete(userId);
            // Remove from usersData
            for (let [clientId, userData] of this.usersData.entries()) {
                if (userData.userId === userId && userData.department === department) {
                    this.usersData.delete(clientId);
                    break;
                }
            }
        }
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


       /**
    * 특정 부서 내에서 닉네임이 이미 사용 중인지 확인하고, 알파벳 문자만 포함하는지 검증
    * @param {string} department - 현재 부서 이름
    * @param {string} nickname - 입력된 닉네임
    * @returns {boolean} - true if taken, false otherwise
    */
    isNicknameTaken(department, nickname) {
        const lowerNickname = nickname.toLowerCase();
        for (let user of this.users.values()) {
            if (user.department === department && user.nickname.toLowerCase() === lowerNickname) {
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

    /**
     * 특정 클라이언트 ID로 사용자 정보를 조회하는 함수
     * @param {string} clientId - 조회할 클라이언트 ID
     * @returns {Object|null} - 사용자 정보 객체 또는 존재하지 않을 경우 null
     */
    getUserData(clientId) {
        if (!clientId) {
            console.warn('getUser 호출 시 clientId가 제공되지 않았습니다.');
            return null;
        }

        const userData = this.usersData.get(clientId);

        if (!userData) {
            console.warn(`클라이언트 ID '${clientId}'에 해당하는 사용자를 찾을 수 없습니다.`);
            return null;
        }
   
        return userData;
    }

    /**
     * 특정 사용자 ID로 사용자 정보를 조회하는 함수
     * @param {string} userId - 조회할 사용자 ID
     * @returns {Object|null} - 사용자 정보 객체 또는 존재하지 않을 경우 null
     */
    getUser(userId) {
        if (!userId) {
            console.warn('getUser 호출 시 userId가 제공되지 않았습니다.');
            return null;
        }

        const user = this.users.get(userId);

        if (!user) {
            console.warn(`사용자 ID '${userId}'에 해당하는 사용자를 찾을 수 없습니다.`);
            return null;
        }

        // 필요한 경우 사용자 정보에서 민감한 데이터를 제외하고 반환
        const { passkey, ...safeUserData } = user;
        return safeUserData;
    }

    /**
     * 특정 클라이언트 ID로 사용자 정보를 조회하는 함수
     * @param {string} clientId - 조회할 클라이언트 ID
     * @returns {Object|null} - 사용자 정보 객체 또는 존재하지 않을 경우 null
     */
    getUserByClientId(clientId) {
        if (!clientId) {
            console.warn('getUserByClientId 호출 시 clientId가 제공되지 않았습니다.');
            return null;
        }

        const userData = this.usersData.get(clientId);

        if (!userData) {
            console.warn(`클라이언트 ID '${clientId}'에 해당하는 사용자를 찾을 수 없습니다.`);
            return null;
        }

        const user = this.users.get(userData.userId);

        if (!user) {
            console.warn(`사용자 ID '${userData.userId}'에 해당하는 사용자를 찾을 수 없습니다.`);
            return null;
        }

        // 민감한 정보 제외
        const { passkey, ...safeUserData } = user;
        return {
            ...safeUserData,
            clientId: clientId,
            isAnonymous: userData.isAnonymous
        };
    }

    /**
     * 매니저로 승격시키는 함수
     * @param {string} userId - 매니저로 승격할 사용자 ID
     * @param {string} passkey - 매니저 인증을 위한 패스키
     * @returns {boolean} - 성공 여부
     */
    async promoteToManager(userId, passkey) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        if (user.userType !== this.userTypes.NONONYMOUS) {
            throw new Error('매니저로 승격할 수 없는 사용자 유형입니다.');
        }

        const isPasskeyValid = await bcrypt.compare(passkey, user.passkey);
        if (!isPasskeyValid) {
            throw new Error('패스키가 올바르지 않습니다.');
        }

        user.userType = this.userTypes.MANAGER;
        this.users.set(userId, user);
        console.log(`User ${userId} has been promoted to manager.`);
        return true;
    }

    /**
     * 사용자 로그인 함수
     * @param {string} clientId - 클라이언트 ID
     * @param {string} department - 부서 이름
     * @param {string} nickname - 닉네임
     * @returns {Object} - 로그인된 사용자 객체
     */
    loginUser(clientId, department, nickname) {
        // Find user by department and nickname
        for (let user of this.users.values()) {
            if (user.department === department && user.nickname === nickname && user.userType !== this.userTypes.ANONYMOUS) {
                // Update usersData to reflect non-anonymous status
                this.usersData.set(clientId, { userId: user.userId, department, isAnonymous: false });
                console.log(`User ${user.userId} has logged in successfully.`);
                return user;
            }
        }
        throw new Error('Invalid department or nickname.');
    }

    /**
     * 사용자 삭제 함수
     * @param {string} userId - 삭제할 사용자 ID
     */
    removeUser(userId) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // Remove the user from their department's members
        const department = this.departments.get(user.department);
        if (department) {
            department.members.delete(userId);
            console.log(`User ${userId} removed from department ${user.department}.`);

            // If the user was the owner, reassign owner or null
            if (department.owner === userId) {
                if (department.members.size > 0) {
                    // Assign a new owner, e.g., first member
                    const newOwnerId = department.members.values().next().value;
                    department.owner = newOwnerId;
                    const newOwner = this.users.get(newOwnerId);
                    if (newOwner) {
                        // Assuming passkey exists for non-anonymous users
                        if (newOwner.passkey) {
                            this.promoteToManager(newOwnerId, newOwner.passkey).catch(err => {
                                console.error(`Failed to promote new owner ${newOwnerId}:`, err);
                            });
                        }
                        console.log(`New owner of department ${user.department} is ${newOwnerId}.`);
                    }
                } else {
                    department.owner = null;
                    console.log(`Department ${user.department} has no more owners.`);
                }
            }

            // If department has no more members, remove it (except default)
            if (department.members.size === 0 && user.department !== this.defaultDepartmentId) {
                this.departments.delete(user.department);
                console.log(`Department ${user.department} removed as it has no more members.`);
            }
        }

        // Remove the user from usersData
        for (let [clientId, data] of this.usersData.entries()) {
            if (data.userId === userId) {
                this.usersData.delete(clientId);
                console.log(`Client ${clientId} removed from usersData.`);
                break;
            }
        }

        // Finally, remove the user
        this.users.delete(userId);
        console.log(`User ${userId} deleted from users.`);
    }

    /**
     * 패스키 검증 함수
     * @param {string} userId - 사용자 ID
     * @param {string} passkey - 제공된 패스키
     * @returns {boolean} - 패스키 검증 결과
     */
    async verifyPasskey(userId, passkey) {
        const user = this.users.get(userId);
        if (!user || !user.passkey) {
            return false;
        }
        return await bcrypt.compare(passkey, user.passkey);
    }

    /**
     * 사용자 부서 및 닉네임 업데이트 함수
     * @param {string} userId - 사용자 ID
     * @param {string} newDepartment - 새로운 부서
     * @param {string} newNickname - 새로운 닉네임
     */
    async updateUserDepartment(userId, newDepartment, newNickname) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        // Check if nickname is taken in the new department
        if (this.isNicknameTaken(newDepartment, newNickname)) {
            throw new Error('닉네임이 이미 사용 중입니다.');
        }

        // Remove user from current department
        const currentDepartment = this.departments.get(user.department);
        if (currentDepartment) {
            currentDepartment.members.delete(userId);
            console.log(`User ${userId} removed from department ${user.department}.`);

            // If the user was the owner, reassign owner or null
            if (currentDepartment.owner === userId) {
                if (currentDepartment.members.size > 0) {
                    const newOwnerId = currentDepartment.members.values().next().value;
                    currentDepartment.owner = newOwnerId;
                    const newOwner = this.users.get(newOwnerId);
                    if (newOwner) {
                        if (newOwner.passkey) {
                            await this.promoteToManager(newOwnerId, newOwner.passkey).catch(err => {
                                console.error(`Failed to promote new owner ${newOwnerId}:`, err);
                            });
                        }
                        console.log(`New owner of department ${currentDepartment.department} is ${newOwnerId}.`);
                    }
                } else {
                    currentDepartment.owner = null;
                    console.log(`Department ${user.department} has no more owners.`);
                }
            }

            // If department has no more members, remove it (except default)
            if (currentDepartment.members.size === 0 && user.department !== this.defaultDepartmentId) {
                this.departments.delete(user.department);
                console.log(`Department ${user.department} removed as it has no more members.`);
            }
        }

        // Update user's department and nickname
        user.department = newDepartment;
        user.nickname = newNickname;
        this.users.set(userId, user);
        console.log(`User ${userId} updated to department ${newDepartment} with nickname ${newNickname}.`);

        // Add user to new department
        this.addUserToDepartment(newDepartment, userId);
    }

    /**
     * 부서 내 첫 번째 사용자 확인 함수
     * @param {string} departmentId - 부서 ID
     * @returns {boolean} - 첫 번째 사용자 여부
     */
    isFirstUserInDepartment(departmentId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            return false;
        }
        return department.members.size === 1;
    }

    /**
     * 부서의 모든 투표 데이터를 초기화하는 함수
     * @param {string} departmentId - 부서 ID
     */
    clearAllVotes(departmentId) {
        const department = this.departments.get(departmentId);
        if (department) {
            department.votesData = {};
            console.log(`All votes cleared for department ${departmentId}.`);
        } else {
            throw new Error('부서를 찾을 수 없습니다.');
        }
    }

    /**
     * 부서의 모든 투표 데이터를 가져오는 함수
     * @param {string} departmentId - 부서 ID
     * @param {number} [year] - 연도
     * @param {number} [month] - 월
     * @returns {Object} - 특정 부서의 투표 데이터
     */
    getAllVotes(departmentId, year, month) {
        const department = this.departments.get(departmentId);
        if (!department) {
            throw new Error('부서를 찾을 수 없습니다.');
        }

        if (year && month) {
            return department.votesData[`${year}-${month}`] || {};
        }
        return department.votesData;
    }

    /**
     * 부서의 모든 구성원을 가져오는 함수
     * @param {string} departmentId - 부서 ID
     * @returns {Array} - 사용자 리스트
     */
    getDepartmentMembers(departmentId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            return [];
        }
        return Array.from(department.members).map(userId => this.users.get(userId));
    }

    /**
     * 특정 날짜에 대한 투표를 토글하는 함수
     * @param {string} departmentId - 부서 ID
     * @param {number} year - 연도
     * @param {number} month - 월
     * @param {number} day - 일
     * @param {string} userId - 사용자 ID
     */
    toggleVote(departmentId, year, month, day, userId) {
        const department = this.departments.get(departmentId);
        if (!department) {
            throw new Error('부서를 찾을 수 없습니다.');
        }

        const dateKey = `${year}-${month}-${day}`;
        if (!department.votesData[dateKey]) {
            department.votesData[dateKey] = new Set();
        }

        if (department.votesData[dateKey].has(userId)) {
            department.votesData[dateKey].delete(userId);
            console.log(`User ${userId} removed vote on ${dateKey} in department ${departmentId}.`);
        } else {
            department.votesData[dateKey].add(userId);
            console.log(`User ${userId} added vote on ${dateKey} in department ${departmentId}.`);
        }

        // Convert Set to Array for storage
        department.votesData[dateKey] = Array.from(department.votesData[dateKey]);
    }

    /**
     * 특정 부서와 기간에 해당하는 투표 데이터를 가져오는 함수
     * @param {string} departmentId - 부서 ID
     * @param {number} year - 연도
     * @param {number} month - 월
     * @returns {Object} - 투표 데이터
     */
    getVotes(departmentId, year, month) {
        const department = this.departments.get(departmentId);
        if (!department) {
            throw new Error('부서를 찾을 수 없습니다.');
        }

        const result = {};
        for (let [dateKey, voters] of Object.entries(department.votesData)) {
            const [entryYear, entryMonth, entryDay] = dateKey.split('-').map(Number);
            if (entryYear === year && entryMonth === month) {
                result[entryDay] = voters;
            }
        }

        return result;
    }
}

module.exports = new VotesManager();