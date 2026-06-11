<?php
/**
 * Vote Controller
 * Handles voting operations
 */

class VoteController {
    /**
     * Vote on offer
     * POST /api/votes
     */
    public static function vote() {
        $user = AuthMiddleware::verify();
        
        $dbUser = new Database();
        $dbUser->prepare("SELECT id FROM users WHERE id = ?");
        $dbUser->bind('i', $user['user_id']);
        $dbUser->execute();
        $user_exists = $dbUser->getRow();
        $dbUser->close();
        if (!$user_exists) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid user session. Please log in again.']);
            exit;
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $offer_id = $data['offer_id'] ?? null;
        $score = $data['score'] ?? null;
        
        if (!$offer_id || !$score) {
            Response::error('Missing offer_id or score', 400);
        }
        
        $vote = new Vote();
        $result = $vote->vote($user['user_id'], $offer_id, $score);
        
        if ($result['success']) {
            $db = new Database();
            $db->prepare("SELECT vote_average, total_votes FROM offers WHERE id = ?");
            $db->bind('i', $offer_id);
            $db->execute();
            $offerStats = $db->getRow();
            $db->close();
            Response::success($offerStats, 'Vote recorded successfully');
        } else {
            Response::error($result['message'] ?? 'Failed to record vote', 400);
        }
    }
    
    /**
     * Get user's vote for an offer
     * GET /api/offers/{offer_id}/vote
     */
    public static function getUserVote($offer_id) {
        $user = AuthMiddleware::verify();
        
        $vote = new Vote();
        $user_vote = $vote->getUserVote($user['user_id'], $offer_id);
        
        if ($user_vote) {
            Response::success($user_vote, 'User vote fetched successfully');
        } else {
            Response::success(null, 'No vote found');
        }
    }
    
    /**
     * Get all votes for offer
     * GET /api/offers/{offer_id}/votes
     */
    public static function getOfferVotes($offer_id) {
        $vote = new Vote();
        $votes = $vote->getOfferVotes($offer_id);
        
        Response::success($votes, 'Offer votes fetched successfully');
    }
    
    /**
     * Get vote distribution for offer
     * GET /api/offers/{offer_id}/votes/distribution
     */
    public static function getVoteDistribution($offer_id) {
        $vote = new Vote();
        $distribution = $vote->getVoteDistribution($offer_id);
        
        Response::success($distribution, 'Vote distribution fetched successfully');
    }
    
    /**
     * Get vote statistics for offer
     * GET /api/offers/{offer_id}/votes/stats
     */
    public static function getVoteStats($offer_id) {
        $vote = new Vote();
        $stats = $vote->getVoteStats($offer_id);
        
        Response::success($stats, 'Vote statistics fetched successfully');
    }
    
    /**
     * Get user's votes
     * GET /api/user/votes
     */
    public static function getUserVotes() {
        $user = AuthMiddleware::verify();
        
        $vote = new Vote();
        $votes = $vote->getUserVotes($user['user_id']);
        
        Response::success($votes, 'User votes fetched successfully');
    }
    
    /**
     * Delete vote
     * DELETE /api/votes/{offer_id}
     */
    public static function deleteVote($offer_id) {
        $user = AuthMiddleware::verify();
        
        $vote = new Vote();
        $result = $vote->deleteVote($user['user_id'], $offer_id);
        
        if ($result['success']) {
            Response::success(null, 'Vote deleted successfully');
        } else {
            Response::error('Failed to delete vote', 400);
        }
    }
}
?>
