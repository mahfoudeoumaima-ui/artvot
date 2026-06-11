<?php
/**
 * Comment Model - Consolidated Architecture
 */

class Comment {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Get all comments for an offer
     */
    public function getOfferComments($offer_id) {
        $this->db->prepare("
            SELECT c.*, u.username, u.full_name, up.avatar_url
            FROM comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE c.offer_id = ?
            ORDER BY c.created_at ASC
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Create a new comment
     */
    public function create($offer_id, $user_id, $comment_text) {
        $created_at = date('Y-m-d H:i:s');
        $this->db->prepare("
            INSERT INTO comments (offer_id, user_id, comment_text, created_at)
            VALUES (?, ?, ?, ?)
        ");
        $this->db->bind('iiss', $offer_id, $user_id, $comment_text, $created_at);
        
        if ($this->db->execute()) {
            return ['success' => true, 'id' => $this->db->lastInsertId()];
        }
        
        return ['success' => false];
    }
    
    /**
     * Delete comment
     */
    public function delete($comment_id, $user_id) {
        // Verify owner or admin
        $this->db->prepare("SELECT user_id FROM comments WHERE id = ?");
        $this->db->bind('i', $comment_id);
        $this->db->execute();
        $comment = $this->db->getRow();
        
        if (!$comment) {
            return ['success' => false, 'message' => 'Comment not found'];
        }
        
        // RBAC check
        $this->db->prepare("SELECT roles FROM users WHERE id = ?");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        $userRow = $this->db->getRow();
        $roles = [];
        if ($userRow && $userRow['roles']) {
            $roles = json_decode($userRow['roles'], true) ?: [];
        }
        $isAdmin = in_array('admin', $roles);
        
        if (intval($comment['user_id']) !== intval($user_id) && !$isAdmin) {
            return ['success' => false, 'message' => 'Unauthorized'];
        }
        
        $this->db->prepare("DELETE FROM comments WHERE id = ?");
        $this->db->bind('i', $comment_id);
        
        if ($this->db->execute()) {
            return ['success' => true];
        }
        
        return ['success' => false];
    }
    
    public function __destruct() {
        if ($this->db) {
            $this->db->close();
        }
    }
}
?>
