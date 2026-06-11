<?php

class Analytics {

    private $db;

    public function __construct() {
        $this->db = new Database();
    }

    /**
     * PLATFORM STATS
     */
    public function getPlatformStats() {
        $this->db->prepare("
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,

                (SELECT COUNT(*) 
                 FROM offers 
                 WHERE status = 'active') as active_offers,

                (SELECT COUNT(*) 
                 FROM offer_applications) as total_artworks,

                (SELECT COUNT(*) 
                 FROM votes) as total_votes,

                (SELECT COALESCE(SUM(amount),0)
                 FROM wallet_transactions 
                 WHERE type LIKE 'reward_%') as total_distributed,

                (SELECT COUNT(*) 
                 FROM reports 
                 WHERE status IN ('open', 'investigating')) as pending_reports
        ");

        $this->db->execute();

        return $this->db->getRow();
    }

    /**
     * USER DASHBOARD STATS
     */
    public function getUserStats($user_id) {
        $this->db->prepare("
            SELECT 
                u.wallet_balance,
                u.total_earned,

                (
                    SELECT COUNT(*)
                    FROM offer_applications
                    WHERE user_id = ?
                ) as artworks_submitted,

                (
                    SELECT COUNT(*)
                    FROM votes
                    WHERE user_id = ?
                ) as votes_cast,

                (
                    SELECT COUNT(*)
                    FROM offers
                    WHERE user_id = ?
                    AND status = 'active'
                ) as active_offers,

                (
                    SELECT COALESCE(AVG(o.vote_average), 0)
                    FROM offer_applications oa
                    JOIN offers o ON oa.offer_id = o.id
                    WHERE oa.user_id = ?
                ) as avg_artwork_rating,

                (
                    SELECT COUNT(*)
                    FROM wallet_transactions
                    WHERE user_id = ?
                    AND type = 'reward_designer'
                ) as designer_rewards_count,

                (
                    SELECT COUNT(*)
                    FROM wallet_transactions
                    WHERE user_id = ?
                    AND type = 'reward_voter'
                ) as voter_rewards_count

            FROM users u
            WHERE u.id = ?
        ");

        $this->db->bind('iiiiiii', $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id);

        $this->db->execute();

        return $this->db->getRow();
    }

    /**
     * OFFER ANALYTICS
     */
    public function getOfferAnalytics($offer_id) {
        $this->db->prepare("
            SELECT 
                o.id,
                o.title,
                o.budget,
                o.created_at,
                o.status,
                (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count,
                o.total_votes,
                o.vote_average as avg_rating,
                o.vote_average as highest_rating,
                o.vote_average as lowest_rating
            FROM offers o
            WHERE o.id = ?
        ");

        $this->db->bind('i', $offer_id);
        $this->db->execute();

        return $this->db->getRow();
    }

    /**
     * USER ACTIVITY
     */
    public function getUserActivity($user_id, $limit = 20) {
        $this->db->prepare("
            SELECT 
                action_type,
                entity_type,
                entity_id,
                metadata,
                created_at
            FROM activity_log
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        ");

        $this->db->bind('ii', $user_id, (int)$limit);
        $this->db->execute();

        return $this->db->getRows();
    }



    /**
     * TRENDING OFFERS
     */
    public function getTrendingOffers($limit = 20) {
        $this->db->prepare("
            SELECT 
                o.*,
                u.username,
                u.full_name,
                up.avatar_url,
                (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count,
                o.total_votes
            FROM offers o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE o.status = 'active'
            AND o.is_approved = 1
            ORDER BY o.total_votes DESC, o.vote_average DESC
            LIMIT ?
        ");

        $this->db->bind('i', (int)$limit);
        $this->db->execute();

        return $this->db->getRows();
    }

    /**
     * TOP DESIGNERS
     */
    public function getTopDesigners($limit = 20) {
        $this->db->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                up.avatar_url,
                (SELECT COUNT(*) FROM offer_applications WHERE user_id = u.id) as artworks,
                COALESCE((SELECT SUM(o.total_votes) FROM offer_applications oa JOIN offers o ON oa.offer_id = o.id WHERE oa.user_id = u.id), 0) as total_votes,
                COALESCE(
                    SUM(
                        CASE 
                            WHEN wt.type = 'reward_designer'
                            THEN wt.amount
                            ELSE 0
                        END
                    ),
                0) as earnings
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN wallet_transactions wt ON u.id = wt.user_id AND wt.type = 'reward_designer'
            WHERE JSON_CONTAINS(u.roles, '\"designer\"')
            GROUP BY u.id
            ORDER BY earnings DESC
            LIMIT ?
        ");

        $this->db->bind('i', (int)$limit);
        $this->db->execute();

        return $this->db->getRows();
    }

    /**
     * TOP VOTERS
     */
    public function getTopVoters($limit = 20) {
        $this->db->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                up.avatar_url,
                COUNT(v.id) as votes_cast,
                COALESCE(
                    SUM(
                        CASE 
                            WHEN wt.type = 'reward_voter'
                            THEN wt.amount
                            ELSE 0
                        END
                    ),
                0) as earnings
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN votes v ON u.id = v.user_id AND v.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
            LEFT JOIN wallet_transactions wt ON u.id = wt.user_id AND wt.type = 'reward_voter'
            WHERE JSON_CONTAINS(u.roles, '\"voter\"')
            GROUP BY u.id
            ORDER BY earnings DESC
            LIMIT ?
        ");

        $this->db->bind('i', (int)$limit);
        $this->db->execute();

        return $this->db->getRows();
    }

    /**
     * ACTIVITY BREAKDOWN
     */
    public function getActivityBreakdown($days = 30) {
        $this->db->prepare("
            SELECT 
                DATE(created_at) as date,
                SUM(
                    CASE 
                        WHEN action_type = 'offer_created'
                        THEN 1
                        ELSE 0
                    END
                ) as offers,
                SUM(
                    CASE 
                        WHEN action_type = 'application_submitted' OR action_type = 'artwork_submitted'
                        THEN 1
                        ELSE 0
                    END
                ) as artworks,
                SUM(
                    CASE 
                        WHEN action_type = 'offer_voted' OR action_type = 'artwork_voted'
                        THEN 1
                        ELSE 0
                    END
                ) as votes,
                COUNT(DISTINCT user_id) as active_users
            FROM activity_log
            WHERE created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        ");

        $this->db->bind('i', (int)$days);
        $this->db->execute();

        return $this->db->getRows();
    }

    public function __destruct() {
        if ($this->db) {
            $this->db->close();
        }
    }
}
?>
