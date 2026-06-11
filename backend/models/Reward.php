<?php
/**
 * Reward Model
 * Handles reward calculation and distribution (consolidated to Offer-only architecture)
 * 
 * Business Logic:
 * - 5% Admin fee
 * - 70% Designers (split among accepted applicants for the offer)
 * - 25% Voters (split among voters who voted on the offer)
 */

class Reward {
    private $db;
    
    // Distribution percentages
    const ADMIN_PERCENTAGE = 5;
    const DESIGNER_PERCENTAGE = 70;
    const VOTER_PERCENTAGE = 25;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Calculate and distribute rewards for a closed offer
     * Idempotent: Can be called multiple times safely
     */
    public function distributeRewards($offer_id) {
        // Check if offer exists
        $this->db->prepare("SELECT id, status, budget, is_approved, user_id FROM offers WHERE id = ?");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $offer = $this->db->getRow();
        
        if (!$offer) {
            return ['success' => false, 'message' => 'Offer not found'];
        }
        
        // Check if rewards already distributed (idempotent check)
        $this->db->prepare("SELECT id FROM offer_results WHERE offer_id = ?");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $existing_result = $this->db->getRow();
        
        if ($existing_result) {
            return ['success' => false, 'message' => 'Rewards already distributed for this offer'];
        }
        
        // Offer must be closed and approved
        if ($offer['status'] !== 'closed') {
            return ['success' => false, 'message' => 'Offer must be closed to distribute rewards'];
        }
        
        if (!$offer['is_approved']) {
            return ['success' => false, 'message' => 'Offer must be approved before distribution'];
        }
        
        $budget = floatval($offer['budget']);
        
        // Calculate pools
        $admin_fee = round($budget * (self::ADMIN_PERCENTAGE / 100), 2);
        $designer_pool = round($budget * (self::DESIGNER_PERCENTAGE / 100), 2);
        $voter_pool = round($budget * (self::VOTER_PERCENTAGE / 100), 2);
        
        // Get accepted designers from offer_applications
        $this->db->prepare("
            SELECT user_id 
            FROM offer_applications 
            WHERE offer_id = ? AND status IN ('accepted', 'completed')
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $designers = $this->db->getRows();
        
        // Fallback: get any applicant if none are explicitly accepted yet
        if (empty($designers)) {
            $this->db->prepare("
                SELECT user_id 
                FROM offer_applications 
                WHERE offer_id = ?
            ");
            $this->db->bind('i', $offer_id);
            $this->db->execute();
            $designers = $this->db->getRows();
        }
        
        if (empty($designers)) {
            return ['success' => false, 'message' => 'No applicants found for this offer'];
        }
        
        // Get total votes directly from votes table for this offer
        $this->db->prepare("
            SELECT COUNT(*) as total
            FROM votes
            WHERE offer_id = ?
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $vote_res = $this->db->getRow();
        $total_votes = intval($vote_res['total'] ?? 0);
        
        // Determine primary winning user (first designer applicant)
        $winning_user_id = intval($designers[0]['user_id']);
        
        $rewards_log = [];
        
        // Begin transaction — all-or-nothing distribution
        $this->db->connection->begin_transaction();
        
        try {
            // 1. Distribute designer rewards (split equally among all active designers on this offer)
            $designer_count = count($designers);
            $reward_per_designer = round($designer_pool / $designer_count, 2);
            
            $user = new User();
            foreach ($designers as $designer) {
                $user_id = intval($designer['user_id']);
                
                if ($reward_per_designer > 0) {
                    // Update wallet balance
                    $user->addBalance($user_id, $reward_per_designer, 'reward_designer', "Reward for offer: " . $offer_id);
                    
                    // Insert reward record (artwork_id is NULL)
                    $this->db->prepare("INSERT INTO rewards (artwork_id, offer_id, user_id, amount, type, status) VALUES (NULL, ?, ?, ?, 'designer', 'processed')");
                    $this->db->bind('iid', $offer_id, $user_id, $reward_per_designer);
                    $this->db->execute();
                    
                    $rewards_log[] = [
                        'user_id' => $user_id,
                        'artwork_id' => null,
                        'amount' => $reward_per_designer,
                        'type' => 'designer',
                        'role' => 'designer'
                    ];
                }
            }
            
            // 2. Distribute voter rewards (split equally among all voters on this offer)
            if ($total_votes > 0 && $voter_pool > 0) {
                $voter_rewards = $this->distributeVoterRewards($offer_id, $voter_pool);
                $rewards_log = array_merge($rewards_log, $voter_rewards);
            }
            
            // 3. Record admin fee
            $rewards_log[] = [
                'user_id' => null,
                'artwork_id' => null,
                'amount' => $admin_fee,
                'type' => 'admin',
                'role' => 'admin'
            ];
            
            $this->db->prepare("INSERT INTO rewards (artwork_id, offer_id, user_id, amount, type, status) VALUES (NULL, ?, NULL, ?, 'admin', 'processed')");
            $this->db->bind('id', $offer_id, $admin_fee);
            $this->db->execute();
            
            // Create offer result record (audit trail)
            $this->db->prepare("
                INSERT INTO offer_results 
                (offer_id, winning_artwork_id, winning_user_id, total_budget, 
                 admin_fee, designer_pool_distributed, voter_pool_distributed, 
                 total_votes, completed_at)
                VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NOW())
            ");
            
            $this->db->bind('iiddddi', 
                $offer_id, 
                $winning_user_id, 
                $budget,
                $admin_fee, 
                $designer_pool, 
                $voter_pool, 
                $total_votes
            );
            
            if (!$this->db->execute()) {
                throw new Exception('Failed to create result record');
            }
            
            // All operations succeeded — commit
            $this->db->connection->commit();
            
            return [
                'success' => true,
                'message' => 'Rewards distributed successfully',
                'data' => [
                    'offer_id' => $offer_id,
                    'winning_artwork_id' => null,
                    'winning_designer_id' => $winning_user_id,
                    'admin_fee' => $admin_fee,
                    'designer_pool' => $designer_pool,
                    'voter_pool' => $voter_pool,
                    'total_votes' => $total_votes,
                    'rewards_count' => count($rewards_log),
                    'rewards_log' => $rewards_log
                ]
            ];
            
        } catch (Exception $e) {
            $this->db->connection->rollback();
            return [
                'success' => false,
                'message' => 'Reward distribution failed: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Distribute voter rewards for offer
     * All voters receive an equal share of the voter pool
     * 
     * @return array Rewards log entries
     */
    private function distributeVoterRewards($offer_id, $voter_pool) {
        $rewards_log = [];
        
        // Get all voters for this offer
        $this->db->prepare("SELECT DISTINCT user_id FROM votes WHERE offer_id = ?");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        $voters = $this->db->getRows();
        
        if (empty($voters)) {
            return $rewards_log;
        }
        
        $voter_count = count($voters);
        $reward_per_voter = round($voter_pool / $voter_count, 2);
        
        $user = new User();
        foreach ($voters as $voter) {
            $user_id = intval($voter['user_id']);
            
            if ($reward_per_voter > 0) {
                // Update wallet balance
                $user->addBalance($user_id, $reward_per_voter, 'reward_voter', "Voting reward for offer: " . $offer_id);
                
                // Record reward (artwork_id is NULL)
                $this->db->prepare("INSERT INTO rewards (artwork_id, offer_id, user_id, amount, type, status) VALUES (NULL, ?, ?, ?, 'voter', 'processed')");
                $this->db->bind('iid', $offer_id, $user_id, $reward_per_voter);
                $this->db->execute();
                
                $rewards_log[] = [
                    'user_id' => $user_id,
                    'artwork_id' => null,
                    'amount' => $reward_per_voter,
                    'type' => 'voter',
                    'role' => 'voter'
                ];
            }
        }
        
        return $rewards_log;
    }
    
    /**
     * Get user's reward summary
     */
    public function getUserRewardsSummary($user_id) {
        // Get total rewards by type
        $this->db->prepare("
            SELECT 
                type,
                COUNT(*) as count,
                SUM(amount) as total
            FROM wallet_transactions
            WHERE user_id = ? AND type LIKE 'reward_%'
            GROUP BY type
        ");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        $rewards = $this->db->getRows();
        
        $summary = [
            'designer_earnings' => 0,
            'voter_earnings' => 0,
            'total_earnings' => 0
        ];
        
        foreach ($rewards as $reward) {
            if ($reward['type'] === 'reward_designer') {
                $summary['designer_earnings'] = floatval($reward['total']);
            } elseif ($reward['type'] === 'reward_voter') {
                $summary['voter_earnings'] = floatval($reward['total']);
            }
            $summary['total_earnings'] += floatval($reward['total']);
        }
        
        return $summary;
    }
    
    /**
     * Get user's reward history
     */
    public function getUserRewardHistory($user_id, $page = 1, $limit = 20) {
        $offset = ($page - 1) * $limit;
        
        $this->db->prepare("
            SELECT 
                wt.id,
                wt.type,
                wt.amount,
                wt.description,
                wt.created_at,
                o.title as offer_title
            FROM wallet_transactions wt
            LEFT JOIN offers o ON wt.offer_id = o.id
            WHERE wt.user_id = ? AND wt.type LIKE 'reward_%'
            ORDER BY wt.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('iii', $user_id, $limit, $offset);
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    /**
     * Get offer result (winners and distribution info)
     */
    public function getOfferResult($offer_id) {
        $this->db->prepare("
            SELECT 
                ofr.*,
                o.title as offer_title,
                o.budget,
                u.username as winning_designer_username,
                u.full_name as winning_designer_name
            FROM offer_results ofr
            LEFT JOIN offers o ON ofr.offer_id = o.id
            LEFT JOIN users u ON ofr.winning_user_id = u.id
            WHERE ofr.offer_id = ?
        ");
        $this->db->bind('i', $offer_id);
        $this->db->execute();
        
        return $this->db->getRow();
    }
    
    /**
     * Get leaderboard by designer earnings
     */
    public function getDesignerLeaderboard($limit = 20, $offset = 0) {
        $this->db->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                up.avatar_url,
                SUM(CASE WHEN wt.type = 'reward_designer' THEN wt.amount ELSE 0 END) as designer_earnings,
                COUNT(DISTINCT CASE WHEN wt.type = 'reward_designer' THEN wt.id END) as designs_rewarded
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN wallet_transactions wt ON u.id = wt.user_id
            GROUP BY u.id
            HAVING designer_earnings > 0
            ORDER BY designer_earnings DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('ii', $limit, $offset);
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    /**
     * Get leaderboard by voter earnings
     */
    public function getVoterLeaderboard($limit = 20, $offset = 0) {
        $this->db->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                up.avatar_url,
                SUM(CASE WHEN wt.type = 'reward_voter' THEN wt.amount ELSE 0 END) as voter_earnings,
                COUNT(DISTINCT CASE WHEN wt.type = 'reward_voter' THEN wt.id END) as votes_rewarded
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN wallet_transactions wt ON u.id = wt.user_id
            GROUP BY u.id
            HAVING voter_earnings > 0
            ORDER BY voter_earnings DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('ii', $limit, $offset);
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    public function __destruct() {
        $this->db->close();
    }
}
?>
