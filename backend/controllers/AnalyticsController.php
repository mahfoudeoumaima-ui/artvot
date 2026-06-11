<?php
/**
 * Analytics Controller
 * Handles dashboard data and analytics
 */

class AnalyticsController {
    
    /**
     * Get platform overview stats
     * GET /api/analytics/platform
     */
    public static function getPlatformStats() {
        $analytics = new Analytics();
        $stats = $analytics->getPlatformStats();
        
        Response::success($stats, 'Platform statistics retrieved');
    }
    
    /**
     * Get user's personal dashboard stats
     * GET /api/user/dashboard
     */
    public static function getUserDashboard() {
        $user = AuthMiddleware::verify();
        
        $analytics = new Analytics();
        $stats = $analytics->getUserStats($user['user_id']);
        
        Response::success($stats, 'User dashboard data retrieved');
    }
    
    /**
     * Get user's activity log
     * GET /api/user/activity?limit=20
     */
    public static function getUserActivity() {
        $user = AuthMiddleware::verify();
        
        $limit = $_GET['limit'] ?? 20;
        if ($limit > 100) $limit = 100;
        
        $analytics = new Analytics();
        $activity = $analytics->getUserActivity($user['user_id'], $limit);
        
        Response::success($activity, 'User activity retrieved');
    }
    
    /**
     * Get offer analytics
     * GET /api/offers/{id}/analytics
     */
    public static function getOfferAnalytics($offer_id) {
        $analytics = new Analytics();
        $stats = $analytics->getOfferAnalytics($offer_id);
        
        if (!$stats) {
            Response::error('Offer not found', 404);
        }
        
        Response::success($stats, 'Offer analytics retrieved');
    }
    

    
    /**
     * Get trending offers
     * GET /api/analytics/trending-offers?limit=20
     */
    public static function getTrendingOffers() {
        $limit = $_GET['limit'] ?? 20;
        
        if ($limit > 100) $limit = 100;
        
        $analytics = new Analytics();
        $trending = $analytics->getTrendingOffers($limit);
        
        Response::success($trending, 'Trending offers retrieved');
    }
    
    /**
     * Get top designers (this month)
     * GET /api/analytics/top-designers?limit=20
     */
    public static function getTopDesigners() {
        $limit = $_GET['limit'] ?? 20;
        
        if ($limit > 100) $limit = 100;
        
        $analytics = new Analytics();
        $top = $analytics->getTopDesigners($limit);
        
        Response::success($top, 'Top designers retrieved');
    }
    
    /**
     * Get top voters (this month)
     * GET /api/analytics/top-voters?limit=20
     */
    public static function getTopVoters() {
        $limit = $_GET['limit'] ?? 20;
        
        if ($limit > 100) $limit = 100;
        
        $analytics = new Analytics();
        $top = $analytics->getTopVoters($limit);
        
        Response::success($top, 'Top voters retrieved');
    }
    
    /**
     * Get activity breakdown (for charts)
     * GET /api/analytics/activity-breakdown?days=30
     */
    public static function getActivityBreakdown() {
        $days = $_GET['days'] ?? 30;
        
        if ($days > 365) $days = 365;
        
        $analytics = new Analytics();
        $breakdown = $analytics->getActivityBreakdown($days);
        
        Response::success($breakdown, 'Activity breakdown retrieved');
    }
}

?>
