<?php
/**
 * Report Model
 * Handles user/offer reporting and moderation (decoupled from artworks)
 */

class Report {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Create a new report
     */
    public function create($report_type, $user_id, $reason, $description = '', $reported_user_id = null, $artwork_id = null, $offer_id = null) {
        // Validate report type (artwork type removed)
        $valid_types = ['user', 'offer', 'comment'];
        if (!in_array($report_type, $valid_types)) {
            // Treat 'artwork' as 'offer' or reject
            if ($report_type === 'artwork') {
                $report_type = 'offer';
            } else {
                return ['success' => false, 'message' => 'Invalid report type'];
            }
        }
        
        // Prevent self-reporting
        if ($report_type === 'user' && $reported_user_id === $user_id) {
            return ['success' => false, 'message' => 'Cannot report yourself'];
        }
        
        // Check if already reported (prevent spam)
        $this->db->prepare("
            SELECT id FROM reports 
            WHERE user_id = ? 
            AND (reported_user_id = ? OR offer_id = ?)
            AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ");
        $this->db->bind('iii', $user_id, $reported_user_id, $offer_id);
        $this->db->execute();
        $existing = $this->db->getRow();
        
        if ($existing) {
            return ['success' => false, 'message' => 'You already reported this recently'];
        }
        
        // Create report
        $this->db->prepare("
            INSERT INTO reports 
            (user_id, reported_user_id, offer_id, reason, description, status)
            VALUES (?, ?, ?, ?, ?, 'open')
        ");
        $this->db->bind('iiiss', $user_id, $reported_user_id, $offer_id, $reason, $description);
        
        if ($this->db->execute()) {
            return ['success' => true, 'report_id' => $this->db->lastInsertId()];
        }
        
        return ['success' => false, 'message' => 'Failed to create report'];
    }
    
    /**
     * Get open reports (admin only)
     */
    public function getOpenReports($limit = 50, $offset = 0) {
        $this->db->prepare("
            SELECT r.*, 
                   u_reporter.username as reporter_username,
                   u_reported.username as reported_username,
                   o.title as offer_title,
                   IF(r.offer_id IS NOT NULL, 'offer', 'user') as report_type
            FROM reports r
            LEFT JOIN users u_reporter ON r.user_id = u_reporter.id
            LEFT JOIN users u_reported ON r.reported_user_id = u_reported.id
            LEFT JOIN offers o ON r.offer_id = o.id
            WHERE r.status IN ('open', 'under_review')
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('ii', $limit, $offset);
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    /**
     * Get single report
     */
    public function getById($report_id) {
        $this->db->prepare("
            SELECT r.*, 
                   u_reporter.username as reporter_username,
                   u_reported.username as reported_username,
                   o.title as offer_title,
                   IF(r.offer_id IS NOT NULL, 'offer', 'user') as report_type
            FROM reports r
            LEFT JOIN users u_reporter ON r.user_id = u_reporter.id
            LEFT JOIN users u_reported ON r.reported_user_id = u_reported.id
            LEFT JOIN offers o ON r.offer_id = o.id
            WHERE r.id = ?
        ");
        $this->db->bind('i', $report_id);
        $this->db->execute();
        
        return $this->db->getRow();
    }
    
    /**
     * Update report status and add notes
     */
    public function updateStatus($report_id, $admin_id, $status, $notes = '') {
        $valid_statuses = ['open', 'under_review', 'resolved', 'dismissed'];
        if (!in_array($status, $valid_statuses)) {
            return ['success' => false, 'message' => 'Invalid status'];
        }
        
        $this->db->prepare("
            UPDATE reports 
            SET status = ?
            WHERE id = ?
        ");
        $this->db->bind('si', $status, $report_id);
        
        if ($this->db->execute()) {
            return ['success' => true];
        }
        
        return ['success' => false, 'message' => 'Failed to update report'];
    }
    
    /**
     * Get report statistics
     */
    public function getStats() {
        $this->db->prepare("
            SELECT 
                status,
                COUNT(*) as count
            FROM reports
            GROUP BY status
        ");
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    public function __destruct() {
        $this->db->close();
    }
}
?>
