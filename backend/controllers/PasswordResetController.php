<?php
/**
 * Password Reset Controller
 * Handles forgot-password and reset-password flows
 */

class PasswordResetController {
    /**
     * Request password reset
     * POST /api/auth/forgot-password
     */
    public static function requestReset() {
        $data = json_decode(file_get_contents('php://input'), true);
        $email = trim($data['email'] ?? '');
        
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Please enter a valid email address', 400);
        }
        
        // Always return same message to prevent email enumeration
        $successMsg = 'If this email is registered, a reset link has been sent.';
        
        // Rate limit: max 3 requests per email per 15 minutes
        $db = new Database();
        $db->prepare("
            SELECT COUNT(*) as cnt FROM password_resets 
            WHERE user_id IN (SELECT id FROM users WHERE email = ?)
            AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            AND used = 0
        ");
        $db->bind('s', $email);
        $db->execute();
        $rate = $db->getRow();
        $db->close();
        
        if ($rate && intval($rate['cnt']) >= 3) {
            Response::success(null, $successMsg);
        }
        
        // Look up user
        $user = new User();
        $user_data = $user->getByEmail($email);
        
        if (!$user_data) {
            Response::success(null, $successMsg);
        }
        
        // Generate secure token
        $token = bin2hex(random_bytes(64));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + 1800);
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
        
        // Store hashed token
        $db2 = new Database();
        $db2->prepare("
            INSERT INTO password_resets (user_id, token_hash, expires_at, ip_address)
            VALUES (?, ?, ?, ?)
        ");
        $db2->bind('isss', $user_data['id'], $tokenHash, $expiresAt, $ipAddress);
        $db2->execute();
        $db2->close();
        
        // Build reset URL
        $resetUrl = APP_URL . '/reset-password.html?token=' . $token;
        
        // Build email body
        $userName = htmlspecialchars($user_data['full_name'] ?? $user_data['username']);
        $subject = APP_NAME . ' - Password Reset Request';
        $body = '
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#D4AF37;">' . APP_NAME . ' Password Reset</h2>
            <p>Hello ' . $userName . ',</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <p style="text-align:center;margin:30px 0;">
                <a href="' . $resetUrl . '" style="background:linear-gradient(135deg,#D4AF37,#A37F1A);color:#000;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:bold;display:inline-block;">Reset Password</a>
            </p>
            <p style="color:#888;font-size:0.85rem;">This link expires in 30 minutes. If you did not request this, please ignore this email.</p>
            <hr style="border:none;border-top:1px solid #333;margin:20px 0;">
            <p style="color:#666;font-size:0.8rem;">&mdash; ' . APP_NAME . ' Team</p>
        </div>';
        
        // Log reset URL clearly for localhost testing (XAMPP has no SMTP)
        error_log("=======================================================");
        error_log("[PASSWORD RESET LINK] " . $resetUrl);
        error_log("=======================================================");
        
        // Send email (logs to error.log on localhost)
        Mailer::send($email, $subject, $body);
        
        // Log to activity_log
        $db3 = new Database();
        $db3->prepare("
            INSERT INTO activity_log (user_id, action_type, entity_type, entity_id, ip_address, user_agent)
            VALUES (?, 'password_reset_requested', 'user', ?, ?, ?)
        ");
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $db3->bind('iiss', $user_data['id'], $user_data['id'], $ipAddress, $userAgent);
        $db3->execute();
        $db3->close();
        
        Response::success(null, $successMsg);
    }
    
    /**
     * Reset password with token
     * POST /api/auth/reset-password
     */
    public static function resetPassword() {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $token = $data['token'] ?? '';
        $password = $data['password'] ?? '';
        $passwordConfirm = $data['password_confirm'] ?? '';
        
        if (!$token) {
            Response::error('Invalid or missing reset token', 400);
        }
        
        if (!$password || !$passwordConfirm) {
            Response::error('Password and confirmation are required', 400);
        }
        
        if ($password !== $passwordConfirm) {
            Response::error('Passwords do not match', 400);
        }
        
        // Password rules: min 8 chars, uppercase, lowercase, number, symbol
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
        }
        if (!preg_match('/[A-Z]/', $password)) {
            Response::error('Password must contain at least one uppercase letter', 400);
        }
        if (!preg_match('/[a-z]/', $password)) {
            Response::error('Password must contain at least one lowercase letter', 400);
        }
        if (!preg_match('/[0-9]/', $password)) {
            Response::error('Password must contain at least one number', 400);
        }
        if (!preg_match('/[^A-Za-z0-9]/', $password)) {
            Response::error('Password must contain at least one special character', 400);
        }
        
        // Hash the incoming token and look up
        $tokenHash = hash('sha256', $token);
        
        $db = new Database();
        $db->prepare("
            SELECT pr.id, pr.user_id, pr.expires_at, pr.used
            FROM password_resets pr
            WHERE pr.token_hash = ? AND pr.used = 0 AND pr.expires_at > NOW()
            ORDER BY pr.created_at DESC
            LIMIT 1
        ");
        $db->bind('s', $tokenHash);
        $db->execute();
        $reset = $db->getRow();
        
        if (!$reset) {
            $db->close();
            Response::error('Invalid or expired reset link. Please request a new one.', 400);
        }
        
        // Hash new password
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
        
        // Update user password
        $db->prepare("UPDATE users SET password = ? WHERE id = ?");
        $db->bind('si', $hashedPassword, $reset['user_id']);
        $db->execute();
        
        // Mark this token as used
        $db->prepare("UPDATE password_resets SET used = 1 WHERE id = ?");
        $db->bind('i', $reset['id']);
        $db->execute();
        
        // Delete all other tokens for this user (invalidate)
        $db->prepare("DELETE FROM password_resets WHERE user_id = ? AND id != ?");
        $db->bind('ii', $reset['user_id'], $reset['id']);
        $db->execute();
        
        // Log to activity_log
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $db->prepare("
            INSERT INTO activity_log (user_id, action_type, entity_type, entity_id, ip_address, user_agent)
            VALUES (?, 'password_reset_completed', 'user', ?, ?, ?)
        ");
        $db->bind('iiss', $reset['user_id'], $reset['user_id'], $ipAddress, $userAgent);
        $db->execute();
        
        $db->close();
        
        Response::success(null, 'Password has been reset successfully. You can now sign in.');
    }
}
?>
