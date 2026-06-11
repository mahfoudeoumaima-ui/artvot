<?php
/**
 * Vote Model
 * Handles voting database operations (offer-based)
 */

class Vote {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Create or update vote
     */
    public function vote($user_id, $offer_id, $score) {
        // Validate score (1-10)
        if ($score < 1 || $score > 10) {
            return ['success' => false, 'message' => 'Score must be between 1 and 10'];
        }
        
        // Check if user already voted
        $this->db->prepare("SELECT id FROM votes WHERE user_id = ? AND offer_id = ?");
        $this->db->bind('ii', $user_id, $offer_id);
        $this->db->execute();
        $existing_vote = $this->db->getRow();
        
        if ($existing_vote) {
            // Update existing vote
            $this->db->prepare("UPDATE votes SET score = ? WHERE user_id = ? AND offer_id = ?");
            $this->db->bind('iii', $score, $user_id, $offer_id);
            $success = $this->db->execute();
        } else {
            // Create new vote
            $created_at = date('Y-m-d H:i:s');
            $this->db->prepare("
                INSERT INTO votes (user_id, offer_id, score, created_at)
                VALUES (?, ?, ?, ?)
            ");
            $this->db->bind('iiis', $user_id, $offer_id, $score, $created_at);
            $success = $this->db->execute();
        }
        
        if ($success) {
            // Update offer vote statistics
            $this->updateOfferVoteStats($offer_id);
            return ['success' => true];
        }
        
        return ['success' => false];
    }
    
    /**
     * Update vote stats directly on the offers table
     */
    private function updateOfferVoteStats($offer_id) {
        $this->db->prepare("
            SELECT AVG(score) as avg_score, COUNT(*) as total
            FROM votes
            WHERE offer_id = ?
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $result = $this->db->getRow();
        
        $avg_score = round($result['avg_score'] ?? 0, 1);
        $total = $result['total'] ?? 0;
        
        $this->db->prepare("
            UPDATE offers
            SET vote_average = ?, total_votes = ?
            WHERE id = ?
        ");
        $this->db->bind('dii', $avg_score, $total, $offer_id);
        $this->db->execute();
    }
    
    /**
     * Get user's vote for an offer
     */
    public function getUserVote($user_id, $offer_id) {
        $this->db->prepare("SELECT * FROM votes WHERE user_id = ? AND offer_id = ?");
        $this->db->bind('ii', $user_id, $offer_id);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Get all votes for an offer
     */
    public function getOfferVotes($offer_id) {
        $this->db->prepare("
            SELECT v.*, u.username, u.full_name, up.avatar_url
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE v.offer_id = ?
            ORDER BY v.created_at DESC
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Get vote distribution for an offer
     */
    public function getVoteDistribution($offer_id) {
        $this->db->prepare("
            SELECT score, COUNT(*) as count
            FROM votes
            WHERE offer_id = ?
            GROUP BY score
            ORDER BY score
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        
        $distribution = [];
        foreach ($this->db->getRows() as $row) {
            $distribution[$row['score']] = $row['count'];
        }
        
        return $distribution;
    }
    
    /**
     * Get vote statistics for offer
     */
    public function getVoteStats($offer_id) {
        $this->db->prepare("
            SELECT 
                COUNT(*) as total_votes,
                AVG(score) as average_score,
                MIN(score) as min_score,
                MAX(score) as max_score,
                STDDEV(score) as std_dev
            FROM votes
            WHERE offer_id = ?
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Get votes by user
     */
    public function getUserVotes($user_id) {
        $this->db->prepare("
            SELECT v.*, o.title, o.reference_images
            FROM votes v
            JOIN offers o ON v.offer_id = o.id
            WHERE v.user_id = ?
            ORDER BY v.created_at DESC
        ");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Delete vote
     */
    public function deleteVote($user_id, $offer_id) {
        $this->db->prepare("DELETE FROM votes WHERE user_id = ? AND offer_id = ?");
        $this->db->bind('ii', $user_id, $offer_id);
        
        if ($this->db->execute()) {
            // Update offer stats
            $this->updateOfferVoteStats($offer_id);
            return ['success' => true];
        }
        
        return ['success' => false];
    }
    
    public function __destruct() {
        $this->db->close();
    }
}

?>
