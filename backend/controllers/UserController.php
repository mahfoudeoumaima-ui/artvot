<?php
/**
 * User Controller
 * Handles user profile and reward operations
 */

class UserController {
    /**
     * Get user profile by username
     * GET /api/users/{username}
     */
    public static function getByUsername($username) {
        $user = new User();
        $user_data = $user->getByUsername($username);
        
        if (!$user_data) {
            Response::error('User not found', 404);
        }
        
        $profile = $user->getProfile($user_data['id']);
        
        Response::success($profile, 'User profile fetched successfully');
    }
    
    /**
     * Get user profile by ID
     * GET /api/users/id/{id}
     */
    public static function getById($id) {
        $user = new User();
        $user_data = $user->getById($id);
        
        if (!$user_data) {
            Response::error('User not found', 404);
        }
        
        $profile = $user->getProfile($id);
        
        Response::success($profile, 'User profile fetched successfully');
    }
    
    /**
     * Update user profile
     * PUT /api/user/profile
     */
    public static function updateProfile() {
        $user = AuthMiddleware::verify();
        User::ensureProfileSchema();
        
        // Handle both JSON payload (PUT/POST) and Form Data (POST)
        $is_json = strpos($_SERVER["CONTENT_TYPE"] ?? '', 'application/json') !== false;
        if ($is_json) {
            $data = json_decode(file_get_contents('php://input'), true) ?: [];
        } else {
            $data = $_POST;
        }
        
        $db = new Database();
        
        if (isset($data['username'])) {
            $data['username'] = trim($data['username']);
            if ($data['username'] === '' || !preg_match('/^[A-Za-z0-9_\\.]{3,50}$/', $data['username'])) {
                $db->close();
                Response::error('Username must be 3-50 characters and use only letters, numbers, dots, or underscores.', 400);
            }
            $db->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
            $db->bind('si', $data['username'], $user['user_id']);
            $db->execute();
            if ($db->getResult()->num_rows > 0) {
                $db->close();
                Response::error('Username is already taken.', 409);
            }
            $db->prepare("UPDATE users SET username = ? WHERE id = ?");
            $db->bind('si', $data['username'], $user['user_id']);
            $db->execute();
        }
        
        if (isset($data['email'])) {
            $data['email'] = trim($data['email']);
            if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
                $db->close();
                Response::error('Please enter a valid email address.', 400);
            }
            $db->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $db->bind('si', $data['email'], $user['user_id']);
            $db->execute();
            if ($db->getResult()->num_rows > 0) {
                $db->close();
                Response::error('Email address is already in use.', 409);
            }
            $db->prepare("UPDATE users SET email = ? WHERE id = ?");
            $db->bind('si', $data['email'], $user['user_id']);
            $db->execute();
        }

        if (isset($data['password']) && !empty($data['password'])) {
            if (strlen($data['password']) < 6) {
                $db->close();
                Response::error('Password must be at least 6 characters.', 400);
            }
            $hashed = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
            $db->prepare("UPDATE users SET password = ? WHERE id = ?");
            $db->bind('si', $hashed, $user['user_id']);
            $db->execute();
        }
        
        if (isset($data['full_name'])) {
            $db->prepare("UPDATE users SET full_name = ? WHERE id = ?");
            $db->bind('si', $data['full_name'], $user['user_id']);
            $db->execute();
        }
        
        // Handle Avatar Upload
        $avatar_url = null;
        if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
            try {
                $uploadedAvatar = MediaStorage::saveUploadedFile($_FILES['avatar'], 'profiles');
                if ($uploadedAvatar['media_type'] !== 'image') {
                    $db->close();
                    Response::error('Avatar must be an image.', 400);
                }
                $avatar_url = $uploadedAvatar['url'];
            } catch (Exception $e) {
                $db->close();
                Response::error($e->getMessage(), 400);
            }
        }
        
        if (isset($data['bio']) || isset($data['payout_method']) || isset($data['wallet_address']) || $avatar_url || isset($data['theme']) || isset($data['language']) || isset($data['ui_preferences'])) {
            // Ensure profile exists
            $db->prepare("SELECT id FROM user_profiles WHERE user_id = ?");
            $db->bind('i', $user['user_id']);
            $db->execute();
            $exists = $db->getRow();
            
            if (!$exists) {
                $db->prepare("INSERT INTO user_profiles (user_id) VALUES (?)");
                $db->bind('i', $user['user_id']);
                $db->execute();
            }
            
            if (isset($data['bio'])) {
                $db->prepare("UPDATE user_profiles SET bio = ? WHERE user_id = ?");
                $db->bind('si', $data['bio'], $user['user_id']);
                $db->execute();
            }
            if (isset($data['payout_method'])) {
                if (!in_array($data['payout_method'], ['crypto', 'paypal', 'stripe'], true)) {
                    $db->close();
                    Response::error('Invalid payout method.', 400);
                }
                $db->prepare("UPDATE user_profiles SET payout_method = ? WHERE user_id = ?");
                $db->bind('si', $data['payout_method'], $user['user_id']);
                $db->execute();
            }
            if (isset($data['wallet_address'])) {
                $db->prepare("UPDATE user_profiles SET wallet_address = ? WHERE user_id = ?");
                $db->bind('si', $data['wallet_address'], $user['user_id']);
                $db->execute();
            }
            if (isset($data['theme'])) {
                if (!in_array($data['theme'], ['dark', 'light'], true)) {
                    $db->close();
                    Response::error('Invalid theme preference.', 400);
                }
                $db->prepare("UPDATE user_profiles SET theme = ? WHERE user_id = ?");
                $db->bind('si', $data['theme'], $user['user_id']);
                $db->execute();
            }
            if (isset($data['language'])) {
                if (!in_array($data['language'], ['en', 'fr', 'ar'], true)) {
                    $db->close();
                    Response::error('Invalid language preference.', 400);
                }
                $db->prepare("UPDATE user_profiles SET language = ? WHERE user_id = ?");
                $db->bind('si', $data['language'], $user['user_id']);
                $db->execute();
            }
            if (isset($data['ui_preferences'])) {
                $prefs = is_string($data['ui_preferences'])
                    ? json_decode($data['ui_preferences'], true)
                    : $data['ui_preferences'];
                if (!is_array($prefs)) {
                    $db->close();
                    Response::error('Invalid UI preferences.', 400);
                }
                $data['ui_preferences'] = json_encode([
                    'compactMode' => !empty($prefs['compactMode']),
                    'enableAnimations' => array_key_exists('enableAnimations', $prefs) ? (bool)$prefs['enableAnimations'] : true,
                ]);
                $db->prepare("UPDATE user_profiles SET ui_preferences = ? WHERE user_id = ?");
                $db->bind('si', $data['ui_preferences'], $user['user_id']);
                $db->execute();
            }
            
            if ($avatar_url) {
                $db->prepare("UPDATE user_profiles SET avatar_url = ? WHERE user_id = ?");
                $db->bind('si', $avatar_url, $user['user_id']);
                $db->execute();
            }
        }
        
        $db->close();
        
        // Fetch updated profile to return
        $user_model = new User();
        $updated_profile = $user_model->getProfile($user['user_id']);
        
        Response::success($updated_profile, 'Profile updated successfully');
    }
    
    /**
     * Get user's rewards
     * GET /api/user/rewards
     */
    public static function getRewards() {
        $user = AuthMiddleware::verify();
        
        $reward = new Reward();
        // FIX: was getUserRewards() — method doesn't exist, correct name is getUserRewardsSummary()
        $rewards = $reward->getUserRewardsSummary($user['user_id']);
        
        Response::success($rewards, 'User rewards fetched successfully');
    }
    
    /**
     * Get user wallet balance
     * GET /api/user/wallet
     */
    public static function getWallet() {
        $user = AuthMiddleware::verify();
        
        $user_model = new User();
        $balance = $user_model->getBalance($user['user_id']);
        $user_data = $user_model->getById($user['user_id']);

        if (!$user_data) {
            Response::error('User not found', 404);
        }
        
        Response::success([
            'balance' => $balance,
            'total_earned' => $user_data['total_earned'] ?? 0,
            'currency' => 'DH'
        ], 'Wallet fetched successfully');
    }
    
    /**
     * Get wallet transaction history
     * GET /api/user/wallet/transactions?limit=20&offset=0
     */
    public static function getWalletTransactions() {
        $user = AuthMiddleware::verify();
        
        $limit = $_GET['limit'] ?? 20;
        $offset = $_GET['offset'] ?? 0;
        
        $user_model = new User();
        $transactions = $user_model->getTransactions($user['user_id'], $limit, $offset);
        
        Response::success($transactions, 'Wallet transactions fetched successfully');
    }
    
    /**
     * Get user's reward history
     * GET /api/user/rewards/history?limit=20
     */
    public static function getRewardHistory() {
        $user = AuthMiddleware::verify();
        
        $limit = $_GET['limit'] ?? 20;
        
        $reward = new Reward();
        // FIX: was getRewardHistory() — correct name is getUserRewardHistory()
        $history = $reward->getUserRewardHistory($user['user_id'], $limit);
        
        Response::success($history, 'Reward history fetched successfully');
    }
    
    /**
     * Get user's offers
     * GET /api/users/{user_id}/offers?page=1&limit=20
     */
    public static function getUserDesigns($user_id_or_username) {
        $page = $_GET['page'] ?? 1;
        $limit = $_GET['limit'] ?? 20;
        
        $user_id = $user_id_or_username;
        if (!is_numeric($user_id)) {
            $user_model = new User();
            $u = $user_model->getByUsername($user_id_or_username);
            if ($u) {
                $user_id = $u['id'];
            } else {
                Response::paginate([], $page, $limit, 0);
                return;
            }
        }
        
        $offer = new Offer();
        $offers = $offer->getByUserId($user_id, $page, $limit);
        
        Response::paginate($offers, $page, $limit, count($offers));
    }
    
    /**
     * Get leaderboard
     * GET /api/users/leaderboard?metric=votes&limit=20
     */
    public static function getLeaderboard() {
        $metric = $_GET['metric'] ?? 'votes'; // votes, earnings, designs
        $limit = $_GET['limit'] ?? 20;
        
        $db = new Database();
        
        switch ($metric) {
            case 'earnings':
                $db->prepare("
                    SELECT u.id, u.username, u.full_name, up.avatar_url,
                           COALESCE(SUM(r.amount), 0) as total_earnings
                    FROM users u
                    LEFT JOIN user_profiles up ON u.id = up.user_id
                    LEFT JOIN rewards r ON u.id = r.user_id
                    GROUP BY u.id
                    ORDER BY total_earnings DESC
                    LIMIT ?
                ");
                break;
            
            case 'designs':
                $db->prepare("
                    SELECT u.id, u.username, u.full_name, up.avatar_url,
                           COUNT(o.id) as total_designs,
                           COALESCE(AVG(o.vote_average), 0) as avg_rating
                    FROM users u
                    LEFT JOIN user_profiles up ON u.id = up.user_id
                    LEFT JOIN offers o ON u.id = o.user_id
                    GROUP BY u.id
                    ORDER BY total_designs DESC, avg_rating DESC
                    LIMIT ?
                ");
                break;
            
            case 'votes':
            default:
                $db->prepare("
                    SELECT u.id, u.username, u.full_name, up.avatar_url,
                           COUNT(v.id) as total_votes
                    FROM users u
                    LEFT JOIN user_profiles up ON u.id = up.user_id
                    LEFT JOIN votes v ON u.id = v.user_id
                    GROUP BY u.id
                    ORDER BY total_votes DESC
                    LIMIT ?
                ");
        }
        
        $db->bind('i', $limit);
        $db->execute();
        $leaderboard = $db->getRows();
        $db->close();
        
        Response::success($leaderboard, 'Leaderboard fetched successfully');
    }
}

?>
