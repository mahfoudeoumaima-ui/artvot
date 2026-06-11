<?php
/**
 * User Model
 * Handles user database operations
 */

class User {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }

    /**
     * Keep older databases compatible with profile preferences added after launch.
     */
    public static function ensureProfileSchema() {
        $db = new Database();
        $columns = [
            'theme' => "ALTER TABLE user_profiles ADD COLUMN theme VARCHAR(20) DEFAULT 'dark' AFTER wallet_address",
            'language' => "ALTER TABLE user_profiles ADD COLUMN language VARCHAR(10) DEFAULT 'en' AFTER theme",
            'ui_preferences' => "ALTER TABLE user_profiles ADD COLUMN ui_preferences JSON DEFAULT NULL AFTER language",
        ];

        foreach ($columns as $column => $alterSql) {
            $escapedColumn = $db->escape($column);
            $db->prepare("
                SELECT COUNT(*) AS column_exists
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'user_profiles'
                  AND COLUMN_NAME = '{$escapedColumn}'
            ");
            $db->execute();
            $row = $db->getRow();
            if (!$row || (int)$row['column_exists'] === 0) {
                $db->prepare($alterSql);
                $db->execute();
            }
        }

        $db->close();
    }
    
    /**
     * Create new user
     */
    public function create($username, $email, $password, $full_name = '') {
        // Validate input
        if (empty($username) || empty($email) || empty($password)) {
            return ['success' => false, 'message' => 'Missing required fields'];
        }
        
        // Check if user already exists
        $this->db->prepare("SELECT id FROM users WHERE email = ? OR username = ?");
        $this->db->bind('ss', $email, $username);
        $this->db->execute();
        
        if ($this->db->getRow() !== null) {
            return ['success' => false, 'message' => 'User already exists'];
        }
        
        // Hash password
        $hashed_password = password_hash($password, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
        
        // Create user with voter role
        $roles = json_encode(['voter']);
        $created_at = date('Y-m-d H:i:s');
        
        $this->db->prepare("
            INSERT INTO users (username, email, password, full_name, roles, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $this->db->bind('ssssss', $username, $email, $hashed_password, $full_name, $roles, $created_at);
        
        if ($this->db->execute()) {
            $user_id = $this->db->lastInsertId();
            
            // Create user profile
            $this->db->prepare("
                INSERT INTO user_profiles (user_id, bio, avatar_url, banner_url)
                VALUES (?, '', '', '')
            ");
            $this->db->bind('i', $user_id);
            $this->db->execute();
            
            return ['success' => true, 'message' => 'User created successfully', 'user_id' => $user_id];
        }
        
        return ['success' => false, 'message' => 'Failed to create user'];
    }
    
    /**
     * Get user by email
     */
    public function getByEmail($email) {
        $this->db->prepare("SELECT * FROM users WHERE email = ?");
        $this->db->bind('s', $email);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Get user by ID
     */
    public function getById($id) {
        $this->db->prepare("SELECT * FROM users WHERE id = ?");
        $this->db->bind('i', $id);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Get user by username
     */
    public function getByUsername($username) {
        $this->db->prepare("SELECT * FROM users WHERE username = ?");
        $this->db->bind('s', $username);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Verify password
     */
    public function verifyPassword($password, $hash) {
        return password_verify($password, $hash);
    }
    
    /**
     * Add role to user
     */
    public function addRole($user_id, $role) {
        $user = $this->getById($user_id);
        
        if (!$user) {
            return false;
        }
        
        $roles = json_decode($user['roles'], true) ?? [];
        
        if (in_array($role, $roles)) {
            return true; // Role already exists
        }
        
        $roles[] = $role;
        $roles_json = json_encode(array_unique($roles));
        
        $this->db->prepare("UPDATE users SET roles = ? WHERE id = ?");
        $this->db->bind('si', $roles_json, $user_id);
        
        return $this->db->execute();
    }
    
    /**
     * Get user profile
     */
    public function getProfile($user_id) {
        self::ensureProfileSchema();
        $this->db->prepare("
            SELECT u.*, up.bio, up.avatar_url, up.banner_url, up.location, up.website, up.payout_method, up.wallet_address,
                   up.theme, up.language, up.ui_preferences,
                   (SELECT COUNT(*) FROM offers WHERE user_id = u.id AND budget = 0 AND description LIKE '%(Submitted for Offer #%') as designs_count,
                   (SELECT COUNT(*) FROM votes WHERE user_id = u.id) as votes_count
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = ?
        ");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Update user profile
     */
    public function updateProfile($user_id, $bio, $location, $website, $avatar_url = null, $banner_url = null) {
        $this->db->prepare("
            UPDATE user_profiles 
            SET bio = ?, location = ?, website = ?
            " . ($avatar_url ? ", avatar_url = ?" : "") . "
            " . ($banner_url ? ", banner_url = ?" : "") . "
            WHERE user_id = ?
        ");
        
        if ($avatar_url && $banner_url) {
            $this->db->bind('sssssi', $bio, $location, $website, $avatar_url, $banner_url, $user_id);
        } elseif ($avatar_url) {
            $this->db->bind('ssssi', $bio, $location, $website, $avatar_url, $user_id);
        } elseif ($banner_url) {
            $this->db->bind('ssssi', $bio, $location, $website, $banner_url, $user_id);
        } else {
            $this->db->bind('sssi', $bio, $location, $website, $user_id);
        }
        
        return $this->db->execute();
    }
    
    /**
     * Get user wallet balance
     */
    public function getBalance($user_id) {
        $this->db->prepare("SELECT wallet_balance FROM users WHERE id = ?");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        $result = $this->db->getRow();
        return $result ? (float)$result['wallet_balance'] : 0.00;
    }
    
    /**
     * Add amount to user wallet
     * Returns true on success, false on failure
     */
    public function addBalance($user_id, $amount, $type = 'reward', $description = '') {
        if ($amount <= 0) {
            return false;
        }
        
        // Update wallet balance
        $this->db->prepare("UPDATE users SET wallet_balance = wallet_balance + ?, total_earned = total_earned + ? WHERE id = ?");
        $this->db->bind('ddi', $amount, $amount, $user_id);
        
        if (!$this->db->execute()) {
            return false;
        }
        
        // Log transaction
        $this->db->prepare("
            INSERT INTO wallet_transactions (user_id, amount, type, description, status)
            VALUES (?, ?, ?, ?, 'completed')
        ");
        $this->db->bind('idss', $user_id, $amount, $type, $description);
        
        return $this->db->execute();
    }
    
    /**
     * Subtract amount from user wallet
     * Returns true on success, false on failure
     */
    public function subtractBalance($user_id, $amount, $type = 'withdrawal', $description = '') {
        if ($amount <= 0) {
            return false;
        }
        
        $current_balance = $this->getBalance($user_id);
        if ($current_balance < $amount) {
            return false; // Insufficient balance
        }
        
        // Update wallet balance
        $this->db->prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?");
        $this->db->bind('di', $amount, $user_id);
        
        if (!$this->db->execute()) {
            return false;
        }
        
        // Log transaction
        $this->db->prepare("
            INSERT INTO wallet_transactions (user_id, amount, type, description, status)
            VALUES (?, ?, ?, ?, 'completed')
        ");
        $this->db->bind('idss', $user_id, $amount, $type, $description);
        
        return $this->db->execute();
    }
    
    /**
     * Get user wallet transactions
     */
    public function getTransactions($user_id, $limit = 50, $offset = 0) {
        $this->db->prepare("
            SELECT * FROM wallet_transactions 
            WHERE user_id = ? 
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('iii', $user_id, $limit, $offset);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Block/unblock user (admin only)
     */
    public function setBlockStatus($user_id, $is_blocked) {
        $this->db->prepare("UPDATE users SET is_blocked = ? WHERE id = ?");
        $this->db->bind('ii', $is_blocked, $user_id);
        return $this->db->execute();
    }
    
    /**
     * Close database connection
     */
    public function __destruct() {
        $this->db->close();
    }
}

?>
