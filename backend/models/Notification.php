<?php
/**
 * Notification Model
 * Handles in-app notifications
 */

class Notification {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Create notification
     */
    public function create($user_id, $type, $title, $message, $action_url = null, $related_offer_id = null, $related_artwork_id = null, $related_user_id = null) {
        $valid_types = ['reward', 'offer_approved', 'artwork_voted', 'offer_update', 'report_action', 'new_offer', 'comment', 'follow', 'system'];
        
        if (!in_array($type, $valid_types)) {
            return ['success' => false, 'message' => 'Invalid notification type'];
        }
        
        $this->db->prepare("
            INSERT INTO notifications 
            (user_id, type, title, message, action_url, related_offer_id, related_artwork_id, related_user_id, is_read)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        ");
        $this->db->bind('isssiiii', $user_id, $type, $title, $message, $action_url, $related_offer_id, $related_artwork_id, $related_user_id);
        
        if ($this->db->execute()) {
            return ['success' => true, 'notification_id' => $this->db->lastInsertId()];
        }
        
        return ['success' => false, 'message' => 'Failed to create notification'];
    }
    
    /**
     * Get unread count for user
     */
    public function getUnreadCount($user_id) {
        $this->db->prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        
        $result = $this->db->getRow();
        return $result['count'] ?? 0;
    }
    
    /**
     * Get user's notifications (paginated)
     */
    public function getNotifications($user_id, $page = 1, $limit = 20, $unread_only = false) {
        $offset = ($page - 1) * $limit;
        
        $query = "
            SELECT * FROM notifications
            WHERE user_id = ?
        ";
        
        if ($unread_only) {
            $query .= " AND is_read = 0";
        }
        
        $query .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        
        $this->db->prepare($query);
        
        if ($unread_only) {
            $this->db->bind('iii', $user_id, $limit, $offset);
        } else {
            $this->db->bind('iii', $user_id, $limit, $offset);
        }
        
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Mark notification as read
     */
    public function markAsRead($notification_id, $user_id) {
        $this->db->prepare("
            UPDATE notifications 
            SET is_read = 1, read_at = NOW()
            WHERE id = ? AND user_id = ?
        ");
        $this->db->bind('ii', $notification_id, $user_id);
        
        return ['success' => $this->db->execute()];
    }
    
    /**
     * Mark all as read
     */
    public function markAllAsRead($user_id) {
        $this->db->prepare("
            UPDATE notifications 
            SET is_read = 1, read_at = NOW()
            WHERE user_id = ? AND is_read = 0
        ");
        $this->db->bind('i', $user_id);
        
        return ['success' => $this->db->execute()];
    }
    
    /**
     * Delete notification
     */
    public function delete($notification_id, $user_id) {
        $this->db->prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?");
        $this->db->bind('ii', $notification_id, $user_id);
        
        return ['success' => $this->db->execute()];
    }
    
    /**
     * Bulk create notifications for multiple users
     */
    public function createBulk($user_ids, $type, $title, $message, $action_url = null) {
        $success_count = 0;
        
        foreach ($user_ids as $user_id) {
            $result = $this->create($user_id, $type, $title, $message, $action_url);
            if ($result['success']) {
                $success_count++;
            }
        }
        
        return [
            'success' => true,
            'count' => $success_count,
            'total' => count($user_ids)
        ];
    }
    
    public function __destruct() {
        $this->db->close();
    }
}

?>
