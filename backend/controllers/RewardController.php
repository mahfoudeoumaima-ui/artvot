<?php
/**
 * Reward Controller
 * Handles reward calculation, distribution, and queries
 */

class RewardController {
    
    /**
     * Get user's reward summary
     * GET /api/user/rewards
     */
    public static function getRewards() {
        $user = AuthMiddleware::verify();
        
        $reward = new Reward();
        $summary = $reward->getUserRewardsSummary($user['user_id']);
        
        Response::success($summary, 'Reward summary fetched successfully');
    }
    
    /**
     * Get user's reward history (paginated)
     * GET /api/user/rewards/history?page=1&limit=20
     */
    public static function getRewardHistory() {
        $user = AuthMiddleware::verify();
        
        $page = $_GET['page'] ?? 1;
        $limit = $_GET['limit'] ?? 20;
        
        $reward = new Reward();
        $history = $reward->getUserRewardHistory($user['user_id'], $page, $limit);
        
        Response::success($history, 'Reward history fetched successfully');
    }
    
    /**
     * Get offer result (winners and distribution)
     * GET /api/offers/{offer_id}/result
     */
    public static function getOfferResult($offer_id) {
        $reward = new Reward();
        $result = $reward->getOfferResult($offer_id);
        
        if (!$result) {
            Response::error('Offer result not found', 404);
        }
        
        Response::success($result, 'Offer result fetched successfully');
    }
    
    /**
     * Close offer and distribute rewards (admin only)
     * POST /api/admin/offers/{offer_id}/close-and-distribute
     */
    public static function closeAndDistribute($offer_id) {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        // Verify offer exists
        $offer_model = new Offer();
        $offer = $offer_model->getById($offer_id);
        
        if (!$offer) {
            Response::error('Offer not found', 404);
        }
        
        if ($offer['status'] === 'closed') {
            Response::error('Offer is already closed', 400);
        }
        
        // Close offer and distribute rewards
        $result = $offer_model->closeAndDistribute($offer_id);
        
        if ($result['success']) {
            http_response_code(200);
            echo json_encode($result);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $result['message'] ?? 'Failed to close and distribute']);
        }
    }
    
    /**
     * Get designer leaderboard
     * GET /api/leaderboard/designers?limit=20&offset=0
     */
    public static function getDesignerLeaderboard() {
        $limit = $_GET['limit'] ?? 20;
        $offset = $_GET['offset'] ?? 0;
        
        // Validate pagination
        if ($limit > 100) $limit = 100;
        if ($offset < 0) $offset = 0;
        
        $reward = new Reward();
        $leaderboard = $reward->getDesignerLeaderboard($limit, $offset);
        
        Response::success($leaderboard, 'Designer leaderboard fetched successfully');
    }
    
    /**
     * Get voter leaderboard
     * GET /api/leaderboard/voters?limit=20&offset=0
     */
    public static function getVoterLeaderboard() {
        $limit = $_GET['limit'] ?? 20;
        $offset = $_GET['offset'] ?? 0;
        
        // Validate pagination
        if ($limit > 100) $limit = 100;
        if ($offset < 0) $offset = 0;
        
        $reward = new Reward();
        $leaderboard = $reward->getVoterLeaderboard($limit, $offset);
        
        Response::success($leaderboard, 'Voter leaderboard fetched successfully');
    }
    
    /**
     * Manually distribute rewards for an offer (admin only)
     * POST /api/admin/offers/{offer_id}/distribute-rewards
     */
    public static function distributeRewardsManual($offer_id) {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        // Distribute rewards
        $reward = new Reward();
        $result = $reward->distributeRewards($offer_id);
        
        if ($result['success']) {
            http_response_code(200);
            echo json_encode($result);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $result['message'] ?? 'Failed to distribute rewards']);
        }
    }
}

?>
