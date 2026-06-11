<?php
/**
 * Admin Controller
 * Handles admin operations and dashboard (fully decoupled from artworks)
 */

class AdminController {
    /**
     * Get admin statistics
     * GET /api/admin/stats
     */
    public static function getStats() {
        $user = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($user['user_id']);
        
        $db = new Database();
        
        // Get all stats
        $db->prepare("SELECT COUNT(*) as total FROM users");
        $db->execute();
        $users_count = $db->getRow()['total'];
        
        $db->prepare("SELECT COUNT(*) as total FROM offers");
        $db->execute();
        $offers_count = $db->getRow()['total'];
        
        $db->prepare("SELECT COUNT(*) as total FROM offer_applications");
        $db->execute();
        $artworks_count = $db->getRow()['total'];
        
        $db->prepare("SELECT COUNT(*) as total FROM votes");
        $db->execute();
        $votes_count = $db->getRow()['total'];
        
        $db->prepare("SELECT COALESCE(SUM(amount), 0) as total FROM rewards WHERE type = 'admin'");
        $db->execute();
        $admin_earnings = $db->getRow()['total'];

        $db->prepare("SELECT COUNT(*) as total FROM users WHERE is_blocked = 1");
        $db->execute();
        $blocked_users = $db->getRow()['total'];

        $db->prepare("SELECT COUNT(*) as total FROM offers WHERE status = 'active'");
        $db->execute();
        $active_offers = $db->getRow()['total'];

        $db->prepare("SELECT COALESCE(SUM(amount), 0) as total FROM rewards");
        $db->execute();
        $total_rewards = $db->getRow()['total'];
        
        $db->close();
        
        Response::success([
            // Short aliases (used by admin-panel.js)
            'users'           => $users_count,
            'offers'          => $offers_count,
            'artworks'        => $artworks_count,
            'votes'           => $votes_count,
            'admin_earnings'  => $admin_earnings,
            // Full aliases (used by admin-dashboard.js overview tab)
            'total_users'     => $users_count,
            'total_offers'    => $offers_count,
            'total_artworks'  => $artworks_count,
            'total_votes'     => $votes_count,
            'blocked_users'   => $blocked_users,
            'active_offers'   => $active_offers,
            'total_rewards_distributed' => $total_rewards,
            // Placeholders (computed stats not tracked yet)
            'new_users_this_month' => 0,
            'active_users_30d'     => 0,
            'pending_reports'      => 0,
            'flagged_content'      => 0,
        ], 'Admin statistics fetched successfully');
    }
    
    /**
     * Get all users with pagination
     * GET /api/admin/users?page=1&limit=20&role=&blocked=
     */
    public static function getUsers() {
        $user = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($user['user_id']);
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = min(100, max(1, intval($_GET['limit'] ?? 20)));
        $role = $_GET['role'] ?? null;
        $blocked = $_GET['blocked'] ?? null;
        
        $offset = ($page - 1) * $limit;
        $db = new Database();
        
        $query = "SELECT u.*, COUNT(DISTINCT a.id) as designs_count FROM users u LEFT JOIN offer_applications a ON u.id = a.user_id";
        $conditions = [];
        $bindTypes = '';
        $bindValues = [];
        
        if ($blocked !== null) {
            $conditions[] = "u.is_blocked = ?";
            $bindTypes .= 'i';
            $bindValues[] = ($blocked === 'true' || $blocked === '1') ? 1 : 0;
        }
        
        if (!empty($role)) {
            $conditions[] = "JSON_CONTAINS(u.roles, ?)";
            $bindTypes .= 's';
            $bindValues[] = json_encode($role);
        }
        
        if (!empty($conditions)) {
            $query .= " WHERE " . implode(" AND ", $conditions);
        }
        
        $query .= " GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
        $bindTypes .= 'ii';
        $bindValues[] = $limit;
        $bindValues[] = $offset;
        
        $db->prepare($query);
        if (!empty($bindValues)) {
            $db->bind($bindTypes, ...$bindValues);
        }
        $db->execute();
        $users = $db->getRows();
        
        // Get total count
        $count_query = "SELECT COUNT(*) as total FROM users u";
        $countTypes = rtrim($bindTypes, 'ii'); // remove limit/offset types
        $countValues = array_slice($bindValues, 0, -2);
        if (!empty($conditions)) {
            $count_query .= " WHERE " . implode(" AND ", $conditions);
        }
        $db->prepare($count_query);
        if (!empty($countValues)) {
            $db->bind($countTypes, ...$countValues);
        }
        $db->execute();
        $total = $db->getRow()['total'] ?? 0;
        
        $db->close();
        
        Response::paginate($users, $page, $limit, $total);
    }
    
    /**
     * Block/unblock user
     * PUT /api/admin/users/{user_id}/block
     */
    public static function blockUser($user_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);
        
        $data = json_decode(file_get_contents('php://input'), true);

        $db = new Database();

        // Handle is_verified update
        if (array_key_exists('is_verified', $data)) {
            $db->prepare("UPDATE users SET is_verified = ? WHERE id = ?");
            $db->bind('ii', $data['is_verified'] ? 1 : 0, $user_id);
            if ($db->execute()) {
                $db->close();
                Response::success(null, $data['is_verified'] ? 'User verified' : 'User unverified');
            } else {
                $db->close();
                Response::error('Failed to update user', 500);
            }
        }

        // Handle is_blocked update (toggle behaviour)
        if (isset($data['is_blocked'])) {
            $is_blocked = $data['is_blocked'];
        } else {
            // No value sent — flip the current status
            $db->prepare("SELECT is_blocked FROM users WHERE id = ?");
            $db->bind('i', $user_id);
            $db->execute();
            $current = $db->getRow();
            $is_blocked = $current ? !$current['is_blocked'] : true;
        }
        $db->close();

        $user = new User();
        $result = $user->setBlockStatus($user_id, $is_blocked ? 1 : 0);
        
        if ($result) {
            Response::success(null, $is_blocked ? 'User blocked successfully' : 'User unblocked successfully');
        } else {
            Response::error('Failed to update user status', 500);
        }
    }
    
    /**
     * Give client free publishing access
     * PUT /api/admin/users/{user_id}/free-publish
     */
    public static function giveFrePublishAccess($user_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);
        
        $db = new Database();
        $db->prepare("UPDATE users SET has_free_publish = 1 WHERE id = ?");
        $db->bind('i', $user_id);
        
        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Free publishing access granted');
        } else {
            $db->close();
            Response::error('Failed to update user', 500);
        }
    }
    
    /**
     * Get ALL offers for admin (ignores status/approval filters)
     * GET /api/admin/offers?limit=100
     */
    public static function getAdminOffers() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $limit  = min(200, max(1, intval($_GET['limit'] ?? 100)));
        $offset = max(0, intval($_GET['offset'] ?? 0));

        $db = new Database();
        $db->prepare("
            SELECT o.*, u.username, u.full_name,
                   COUNT(DISTINCT a.id) as applications_count,
                   COUNT(DISTINCT v.id) as votes_count
            FROM offers o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN offer_applications a ON a.offer_id = o.id
            LEFT JOIN votes v ON v.offer_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $db->bind('ii', $limit, $offset);
        $db->execute();
        $offers = $db->getRows();
        $db->close();

        Response::success($offers, 'All offers fetched successfully');
    }

    /**
     * Pause an offer (admin)
     * PUT /api/admin/offers/{offer_id}/pause
     */
    public static function pauseOffer($offer_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("UPDATE offers SET status = 'paused' WHERE id = ?");
        $db->bind('i', $offer_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Offer paused successfully');
        } else {
            $db->close();
            Response::error('Failed to pause offer', 500);
        }
    }

    /**
     * Reopen a paused or closed offer (admin)
     * PUT /api/admin/offers/{offer_id}/reopen
     */
    public static function reopenOffer($offer_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("UPDATE offers SET status = 'active' WHERE id = ? AND status IN ('paused','closed')");
        $db->bind('i', $offer_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Offer reopened successfully');
        } else {
            $db->close();
            Response::error('Failed to reopen offer', 500);
        }
    }

    /**
     * Delete offer (admin)
     * DELETE /api/admin/offers/{offer_id}
     */
    public static function deleteOffer($offer_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);
        
        $db = new Database();
        $db->prepare("DELETE FROM offers WHERE id = ?");
        $db->bind('i', $offer_id);
        
        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Offer deleted successfully');
        } else {
            $db->close();
            Response::error('Failed to delete offer', 500);
        }
    }
    
    /**
     * Delete artwork (admin stub)
     */
    public static function deleteArtwork($artwork_id) {
        Response::error('Artworks system is deprecated', 400);
    }

    /**
     * Toggle platform-wide offer creation (allow/block ALL users from creating offers)
     * PUT /api/admin/platform/offer-creation
     * body: { enabled: bool }
     */
    public static function togglePlatformOfferCreation() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $data = json_decode(file_get_contents('php://input'), true);
        $enabled = isset($data['enabled']) ? (bool)$data['enabled'] : true;

        $db = new Database();
        // Store in a simple platform_settings key-value table (auto-create if missing)
        $db->prepare("
            INSERT INTO platform_settings (`key`, `value`) VALUES ('offer_creation_enabled', ?)
            ON DUPLICATE KEY UPDATE `value` = ?
        ");
        $val = $enabled ? '1' : '0';
        $db->bind('ss', $val, $val);

        if ($db->execute()) {
            $db->close();
            Response::success(['offer_creation_enabled' => $enabled],
                $enabled ? 'Offer creation enabled for all users' : 'Offer creation disabled for all users');
        } else {
            $db->close();
            Response::error('Failed to update platform setting', 500);
        }
    }

    /**
     * Toggle platform-wide submission creation (allow/block ALL users from submitting to offers)
     * PUT /api/admin/platform/submissions
     * body: { enabled: bool }
     */
    public static function togglePlatformSubmissions() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $data = json_decode(file_get_contents('php://input'), true);
        $enabled = isset($data['enabled']) ? (bool)$data['enabled'] : true;

        $db = new Database();
        $db->prepare("
            INSERT INTO platform_settings (`key`, `value`) VALUES ('submissions_enabled', ?)
            ON DUPLICATE KEY UPDATE `value` = ?
        ");
        $val = $enabled ? '1' : '0';
        $db->bind('ss', $val, $val);

        if ($db->execute()) {
            $db->close();
            Response::success(['submissions_enabled' => $enabled],
                $enabled ? 'Submissions enabled platform-wide' : 'Submissions disabled platform-wide');
        } else {
            $db->close();
            Response::error('Failed to update platform setting', 500);
        }
    }

    /**
     * Get platform settings
     * GET /api/admin/platform/settings
     */
    public static function getPlatformSettings() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("SELECT `key`, `value` FROM platform_settings WHERE `key` IN ('offer_creation_enabled','submissions_enabled')");
        $db->execute();
        $rows = $db->getRows();
        $db->close();

        $settings = [
            'offer_creation_enabled' => true,
            'submissions_enabled'    => true,
        ];
        foreach ($rows as $row) {
            $settings[$row['key']] = $row['value'] === '1';
        }

        Response::success($settings, 'Platform settings fetched');
    }
    
    /**
     * Approve artwork (admin stub)
     */
    public static function approveArtwork($artwork_id) {
        Response::error('Artworks system is deprecated', 400);
    }
    
    /**
     * Get recent activity
     * GET /api/admin/activity?limit=50
     */
    public static function getActivity() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);
        
        $limit = $_GET['limit'] ?? 50;
        
        $db = new Database();
        
        // Get recent activities, including applications in place of artworks
        $db->prepare("
            SELECT 'offer' as type, o.id, o.title, u.username, o.created_at
            FROM offers o
            JOIN users u ON o.user_id = u.id
            UNION ALL
            SELECT 'application' as type, a.id, a.message as title, u.username, a.created_at
            FROM offer_applications a
            JOIN users u ON a.user_id = u.id
            UNION ALL
            SELECT 'vote' as type, v.id, NULL, u.username, v.created_at
            FROM votes v
            JOIN users u ON v.user_id = u.id
            ORDER BY created_at DESC
            LIMIT ?
        ");
        $db->bind('i', $limit);
        $db->execute();
        $activity = $db->getRows();
        $db->close();
        
        Response::success($activity, 'Recent activity fetched successfully');
    }

    /**
     * Delete a user (admin)
     * DELETE /api/admin/users/{user_id}
     */
    public static function deleteUser($user_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        // Prevent admin from deleting themselves
        if (intval($admin['user_id']) === intval($user_id)) {
            Response::error('Cannot delete your own admin account', 403);
        }

        // Check if target user is also an admin
        $db = new Database();
        $db->prepare("SELECT roles FROM users WHERE id = ?");
        $db->bind('i', $user_id);
        $db->execute();
        $target = $db->getRow();

        if (!$target) {
            $db->close();
            Response::error('User not found', 404);
        }

        $roles = json_decode($target['roles'], true) ?: [];
        if (in_array('admin', $roles)) {
            $db->close();
            Response::error('Cannot delete an admin user', 403);
        }

        $db->prepare("DELETE FROM users WHERE id = ?");
        $db->bind('i', $user_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'User deleted successfully');
        } else {
            $db->close();
            Response::error('Failed to delete user', 500);
        }
    }

    /**
     * Toggle posting restriction for a user
     * PUT /api/admin/users/{user_id}/posting
     */
    public static function togglePostingRestriction($user_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $data = json_decode(file_get_contents('php://input'), true);
        $posting_restricted = $data['posting_restricted'] ?? false;

        $db = new Database();
        $db->prepare("UPDATE users SET posting_restricted = ? WHERE id = ?");
        $db->bind('ii', $posting_restricted ? 1 : 0, $user_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, $posting_restricted ? 'User posting restricted' : 'User posting restriction removed');
        } else {
            $db->close();
            Response::error('Failed to update posting restriction', 500);
        }
    }

    /**
     * Hide/unhide an offer
     * PUT /api/admin/offers/{offer_id}/hide
     */
    public static function hideOffer($offer_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $data = json_decode(file_get_contents('php://input'), true);
        $is_hidden = $data['is_hidden'] ?? false;

        $db = new Database();
        $db->prepare("UPDATE offers SET is_hidden = ? WHERE id = ?");
        $db->bind('ii', $is_hidden ? 1 : 0, $offer_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, $is_hidden ? 'Offer hidden' : 'Offer unhidden');
        } else {
            $db->close();
            Response::error('Failed to update offer visibility', 500);
        }
    }

    /**
     * Close an offer (admin)
     * PUT /api/admin/offers/{offer_id}/close
     */
    public static function closeOffer($offer_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("UPDATE offers SET status = 'closed' WHERE id = ?");
        $db->bind('i', $offer_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Offer closed successfully');
        } else {
            $db->close();
            Response::error('Failed to close offer', 500);
        }
    }

    /**
     * Get all submissions (offer_applications)
     * GET /api/admin/submissions
     */
    public static function getAllSubmissions() {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("
            SELECT a.*, u.username, u.full_name, o.title as offer_title
            FROM offer_applications a
            JOIN users u ON a.user_id = u.id
            JOIN offers o ON a.offer_id = o.id
            ORDER BY a.created_at DESC
            LIMIT 100
        ");
        $db->execute();
        $submissions = $db->getRows();
        $db->close();

        Response::success($submissions, 'Submissions fetched successfully');
    }

    /**
     * Moderate a submission (change status)
     * PUT /api/admin/submissions/{submission_id}
     */
    public static function moderateSubmission($submission_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $data = json_decode(file_get_contents('php://input'), true);
        $status = $data['status'] ?? '';

        if (!in_array($status, ['applied', 'accepted', 'rejected'])) {
            Response::error('Invalid status. Must be applied, accepted, or rejected', 400);
        }

        $db = new Database();
        $db->prepare("UPDATE offer_applications SET status = ? WHERE id = ?");
        $db->bind('si', $status, $submission_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Submission status updated to ' . $status);
        } else {
            $db->close();
            Response::error('Failed to update submission status', 500);
        }
    }

    /**
     * Delete a submission
     * DELETE /api/admin/submissions/{submission_id}
     */
    public static function deleteSubmission($submission_id) {
        $admin = AuthMiddleware::verify();
        AuthMiddleware::requireAdmin($admin['user_id']);

        $db = new Database();
        $db->prepare("DELETE FROM offer_applications WHERE id = ?");
        $db->bind('i', $submission_id);

        if ($db->execute()) {
            $db->close();
            Response::success(null, 'Submission deleted successfully');
        } else {
            $db->close();
            Response::error('Failed to delete submission', 500);
        }
    }
}
?>
