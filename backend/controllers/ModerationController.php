<?php
/**
 * Moderation Controller
 * Handles reporting, moderation actions, and content management
 */

class ModerationController {
    
    /**
     * Report content (user/artwork/offer)
     * POST /api/reports
     */
    public static function createReport() {
        $user = AuthMiddleware::verify();
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $report_type = $data['report_type'] ?? null;
        $reason = $data['reason'] ?? null;
        $description = $data['description'] ?? null;
        $reported_user_id = $data['reported_user_id'] ?? null;
        $artwork_id = $data['artwork_id'] ?? null;
        $offer_id = $data['offer_id'] ?? null;
        
        if (!$report_type || !$reason) {
            Response::error('Missing required fields', 400);
        }
        
        $report = new Report();
        $result = $report->create($report_type, $user['user_id'], $reason, $description, $reported_user_id, $artwork_id, $offer_id);
        
        if ($result['success']) {
            Response::success(['report_id' => $result['report_id']], 'Report submitted successfully', 201);
        } else {
            Response::error($result['message'] ?? 'Failed to create report', 400);
        }
    }
    
    /**
     * Get open reports (admin only)
     * GET /api/admin/reports?limit=50&offset=0
     */
    public static function getOpenReports() {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $limit = $_GET['limit'] ?? 50;
        $offset = $_GET['offset'] ?? 0;
        
        if ($limit > 100) $limit = 100;
        
        $report = new Report();
        $reports = $report->getOpenReports($limit, $offset);
        
        Response::success($reports, 'Open reports retrieved');
    }
    
    /**
     * Get single report (admin only)
     * GET /api/admin/reports/{id}
     */
    public static function getReport($report_id) {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $report = new Report();
        $report_data = $report->getById($report_id);
        
        if (!$report_data) {
            Response::error('Report not found', 404);
        }
        
        Response::success($report_data, 'Report retrieved');
    }
    
    /**
     * Update report status (admin only)
     * PUT /api/admin/reports/{id}
     */
    public static function updateReportStatus($report_id) {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $status = $data['status'] ?? null;
        $notes = $data['notes'] ?? '';
        
        if (!$status) {
            Response::error('Missing status field', 400);
        }
        
        $report = new Report();
        $result = $report->updateStatus($report_id, $user['user_id'], $status, $notes);
        
        if ($result['success']) {
            Response::success(null, 'Report status updated');
        } else {
            Response::error($result['message'] ?? 'Failed to update report', 400);
        }
    }
    
    /**
     * Get report statistics (admin only)
     * GET /api/admin/reports/stats
     */
    public static function getReportStats() {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $report = new Report();
        $stats = $report->getStats();
        
        Response::success($stats, 'Report statistics retrieved');
    }
}

?>
