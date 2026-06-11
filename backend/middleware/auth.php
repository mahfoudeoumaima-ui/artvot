<?php
/**
 * Authentication Middleware
 * Verify JWT token and user authorization
 */

class AuthMiddleware {
    /**
     * Verify JWT token from request headers
     */
    public static function verify() {
        $headers = getallheaders();
        
        if (!isset($headers['Authorization'])) {
            Response::error('Missing authorization header', 401);
        }
        
        $auth_header = $headers['Authorization'];
        
        if (strpos($auth_header, 'Bearer ') !== 0) {
            Response::error('Invalid authorization header format', 401);
        }
        
        $token = substr($auth_header, 7);
        
        $payload = JWT::verify($token);
        
        if (!$payload) {
            Response::error('Invalid or expired token', 401);
        }
        
        return $payload;
    }
    
    /**
     * Verify user has specific role
     */
    public static function requireRole($user_id, $required_role) {
        $db = new Database();
        
        $db->prepare("SELECT roles FROM users WHERE id = ?");
        $db->bind('i', $user_id);
        $db->execute();
        $result = $db->getRow();
        $db->close();
        
        if (!$result) {
            Response::error('User not found', 404);
        }
        
        $roles = json_decode($result['roles'], true) ?? [];
        
        if (!in_array($required_role, $roles)) {
            Response::error('You do not have permission for this action', 403);
        }
        
        return true;
    }
    
    /**
     * Verify user is admin
     */
    public static function requireAdmin($user_id) {
        return self::requireRole($user_id, 'admin');
    }
}

?>
