<?php
/**
 * Notification Controller
 * Handles in-app notifications
 */

class NotificationController {
    
    /**
     * Get user's unread notification count
     * GET /api/user/notifications/unread-count
     */
    public static function getUnreadCount() {
        $user = AuthMiddleware::verify();
        
        $notification = new Notification();
        $count = $notification->getUnreadCount($user['user_id']);
        
        Response::success(['unread_count' => $count], 'Unread count retrieved');
    }
    
    /**
     * Get user's notifications
     * GET /api/user/notifications?page=1&limit=20&unread_only=false
     */
    public static function getNotifications() {
        $user = AuthMiddleware::verify();
        
        $page = $_GET['page'] ?? 1;
        $limit = $_GET['limit'] ?? 20;
        $unread_only = isset($_GET['unread_only']) && $_GET['unread_only'] === 'true';
        
        $notification = new Notification();
        $notifications = $notification->getNotifications($user['user_id'], $page, $limit, $unread_only);
        
        Response::success($notifications, 'Notifications retrieved');
    }
    
    /**
     * Mark single notification as read
     * PUT /api/user/notifications/{id}/read
     */
    public static function markAsRead($notification_id) {
        $user = AuthMiddleware::verify();
        
        $notification = new Notification();
        $result = $notification->markAsRead($notification_id, $user['user_id']);
        
        if ($result['success']) {
            Response::success(null, 'Notification marked as read');
        } else {
            Response::error('Failed to mark notification as read', 400);
        }
    }
    
    /**
     * Mark all notifications as read
     * PUT /api/user/notifications/read-all
     */
    public static function markAllAsRead() {
        $user = AuthMiddleware::verify();
        
        $notification = new Notification();
        $result = $notification->markAllAsRead($user['user_id']);
        
        if ($result['success']) {
            Response::success(null, 'All notifications marked as read');
        } else {
            Response::error('Failed to mark notifications as read', 400);
        }
    }
    
    /**
     * Delete notification
     * DELETE /api/user/notifications/{id}
     */
    public static function deleteNotification($notification_id) {
        $user = AuthMiddleware::verify();
        
        $notification = new Notification();
        $result = $notification->delete($notification_id, $user['user_id']);
        
        if ($result['success']) {
            Response::success(null, 'Notification deleted');
        } else {
            Response::error('Failed to delete notification', 400);
        }
    }
}

?>
