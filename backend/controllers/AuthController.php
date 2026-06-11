<?php
/**
 * Authentication Controller
 * Handles login, register, and user authentication
 */

class AuthController {
    /**
     * Register new user
     * POST /api/auth/register
     */
    public static function register() {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $username = $data['username'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $password_confirm = $data['password_confirm'] ?? null;
        $full_name = $data['full_name'] ?? '';
        
        // Validate input
        if (!$username || !$email || !$password || !$password_confirm) {
            Response::error('Missing required fields', 400);
        }
        
        if ($password !== $password_confirm) {
            Response::error('Passwords do not match', 400);
        }
        
        if (strlen($password) < 6) {
            Response::error('Password must be at least 6 characters', 400);
        }
        
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email format', 400);
        }
        
        if (strlen($username) < 3) {
            Response::error('Username must be at least 3 characters', 400);
        }
        
        $user = new User();
        $result = $user->create($username, $email, $password, $full_name);
        
        if ($result['success']) {
            Response::success(['user_id' => $result['user_id']], 'Registration successful', 201);
        } else {
            Response::error($result['message'], 400);
        }
    }
    
    /**
     * Login user
     * POST /api/auth/login
     */
    public static function login() {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        
        if (!$email || !$password) {
            Response::error('Missing email or password', 400);
        }
        
        $user = new User();
        $user_data = $user->getByEmail($email);
        
        if (!$user_data) {
            Response::error('Invalid credentials', 401);
        }
        
        if ($user_data['is_blocked']) {
            Response::error('Your account has been blocked', 403);
        }
        
        if (!$user->verifyPassword($password, $user_data['password'])) {
            Response::error('Invalid credentials', 401);
        }
        
        // Generate JWT token
        $payload = [
            'user_id' => $user_data['id'],
            'username' => $user_data['username'],
            'email' => $user_data['email'],
            'roles' => json_decode($user_data['roles'], true)
        ];
        
        $token = JWT::generate($payload);
        
        // Fetch full profile info so client has avatar, bio, theme etc. immediately
        $profile = $user->getProfile($user_data['id']);
        
        Response::success([
            'token' => $token,
            'user' => $profile
        ], 'Login successful');
    }
    
    /**
     * Get current user profile
     * GET /api/auth/me
     */
    public static function getMe() {
        $user = AuthMiddleware::verify();
        
        $user_model = new User();
        $profile = $user_model->getProfile($user['user_id']);
        
        Response::success($profile, 'Profile fetched successfully');
    }
    
    /**
     * Update user profile
     * PUT /api/auth/profile
     */
    public static function updateProfile() {
        $user = AuthMiddleware::verify();
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $bio = $data['bio'] ?? '';
        $location = $data['location'] ?? '';
        $website = $data['website'] ?? '';
        
        $user_model = new User();
        $result = $user_model->updateProfile($user['user_id'], $bio, $location, $website);
        
        if ($result) {
            Response::success(null, 'Profile updated successfully');
        } else {
            Response::error('Failed to update profile', 500);
        }
    }
    
    /**
     * Change password
     * POST /api/auth/change-password
     */
    public static function changePassword() {
        $user = AuthMiddleware::verify();
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $current_password = $data['current_password'] ?? null;
        $new_password = $data['new_password'] ?? null;
        $new_password_confirm = $data['new_password_confirm'] ?? null;
        
        if (!$current_password || !$new_password || !$new_password_confirm) {
            Response::error('Missing required fields', 400);
        }
        
        if ($new_password !== $new_password_confirm) {
            Response::error('Passwords do not match', 400);
        }
        
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        
        if (!$user_model->verifyPassword($current_password, $user_data['password'])) {
            Response::error('Current password is incorrect', 401);
        }
        
        $hashed_password = password_hash($new_password, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
        
        $db = new Database();
        $db->prepare("UPDATE users SET password = ? WHERE id = ?");
        $db->bind('si', $hashed_password, $user['user_id']);
        
        if ($db->execute()) {
            Response::success(null, 'Password changed successfully');
        } else {
            Response::error('Failed to change password', 500);
        }
        
        $db->close();
    }
    
    /**
     * Logout user
     * POST /api/auth/logout
     */
    public static function logout() {
        // JWT is stateless, so we just return success
        // Token becomes invalid after expiration
        Response::success(null, 'Logout successful');
    }
}

?>
