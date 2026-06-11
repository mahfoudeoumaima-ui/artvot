<?php
/**
 * Offer Controller
 * Handles offer CRUD operations
 */

class OfferController {
    /**
     * Guard: check offer is ACTIVE before allowing submissions/votes/comments.
     * Returns the offer row on success, calls Response::error and exits on failure.
     */
    public static function requireOfferActive($offer_id) {
        $db = new Database();
        $db->prepare("SELECT id, status, is_hidden FROM offers WHERE id = ?");
        $db->bind('i', $offer_id);
        $db->execute();
        $offer = $db->getRow();
        $db->close();

        if (!$offer) {
            Response::error('Offer not found', 404);
        }
        $status = strtolower($offer['status'] ?? 'active');
        if ($status === 'paused') {
            Response::error('This offer is paused. Submissions, votes, and comments are disabled.', 403);
        }
        if ($status === 'closed') {
            Response::error('This offer is closed. No further submissions or votes are accepted.', 403);
        }
        if ($status === 'deleted' || !empty($offer['is_hidden'])) {
            Response::error('Offer not found', 404);
        }
        return $offer;
    }

    /**
     * Get all offers
     * GET /api/offers?page=1&limit=12
     */
    public static function getAll() {
        $page = intval($_GET['page'] ?? 1);
        $limit = intval($_GET['limit'] ?? 12);
        $status = $_GET['filter'] ?? 'active';
        $category = $_GET['category'] ?? 'all';
        $search = $_GET['search'] ?? '';
        $sort = $_GET['sort'] ?? 'trending';
        
        $offer = new Offer();
        $result = $offer->getAll($page, $limit, $status, $category, $search, $sort);

        // Guard: Offer::getAll() returns ['data'=>[...],'total'=>N]; handle flat array fallback
        if (is_array($result) && isset($result['data'])) {
            $data  = $result['data'];
            $total = $result['total'] ?? count($data);
        } else {
            $data  = is_array($result) ? $result : [];
            $total = count($data);
        }

        Response::paginate($data, $page, $limit, $total);
    }
    
    /**
     * Get single offer
     * GET /api/offers/{id}
     */
    public static function getById($id) {
        $offer = new Offer();
        $offer_data = $offer->getById($id);
        
        if (!$offer_data) {
            Response::error('Offer not found', 404);
        }
        
        Response::success($offer_data, 'Offer fetched successfully');
    }
    
    /**
     * Create new offer
     * POST /api/offers
     */
    public static function create() {
        $user = AuthMiddleware::verify();
        
        $dbUser = new Database();
        $dbUser->prepare("SELECT id FROM users WHERE id = ?");
        $dbUser->bind('i', $user['user_id']);
        $dbUser->execute();
        $user_exists = $dbUser->getRow();
        $dbUser->close();
        if (!$user_exists) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid user. Please log in again.']);
            exit;
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $title = $data['title'] ?? null;
        $description = $data['description'] ?? null;
        $budget = $data['budget'] ?? null;
        $deadline = $data['deadline'] ?? null;
        $package_type = $data['package_type'] ?? 'basic';
        $tags = $data['tags'] ?? '';
        $reference_images = $data['reference_images'] ?? null;
        try {
            $reference_images = MediaStorage::normalizeReferenceImages($reference_images);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
        
        // Validate input
        if (!$title || !trim($title)) {
            Response::error('Title is required', 400);
        }
        if (!$description || !trim($description)) {
            Response::error('Description is required', 400);
        }
        
        $is_submission = ($description && stripos($description, '(Submitted for Offer #') !== false);
        if ($is_submission) {
            // Extract parent offer ID and enforce state before allowing submission
            if (preg_match('/\(Submitted for Offer #(\d+)\)/i', $description, $_m)) {
                self::requireOfferActive(intval($_m[1]));
            }
            if ($budget === null || floatval($budget) < 0) {
                Response::error('Budget cannot be negative', 400);
            }
        } else {
            if ($budget === null || floatval($budget) <= 0) {
                Response::error('Budget must be greater than 0', 400);
            }
        }

        if (!$deadline) {
            Response::error('Deadline is required', 400);
        }
        
        if (!in_array($package_type, ['basic', 'premium', 'featured'])) {
            Response::error('Invalid package type', 400);
        }
        
        $offer = new Offer();
        // Auto-approve all offers — skip admin review
        $is_approved = true;
        
        $result = $offer->create(
            $user['user_id'],
            $title,
            $description,
            $budget,
            $deadline,
            $package_type,
            3,               // duration_days default
            $tags,
            1,               // requires_payment default
            $is_approved,
            $reference_images
        );
        
        if ($result['success']) {
            if ($is_submission) {
                if (preg_match('/\(Submitted for Offer #(\d+)\)/i', $description, $matches)) {
                    $parent_offer_id = intval($matches[1]);
                    if ($parent_offer_id > 0) {
                        $db = new Database();
                        $db->prepare("SELECT id FROM offer_applications WHERE offer_id = ? AND user_id = ?");
                        $db->bind('ii', $parent_offer_id, $user['user_id']);
                        $db->execute();
                        $existing = $db->getRow();
                        if (!$existing) {
                            $db->prepare("INSERT INTO offer_applications (offer_id, user_id, message, status) VALUES (?, ?, ?, 'applied')");
                            $msg = "Design Submission submitted";
                            $db->bind('iis', $parent_offer_id, $user['user_id'], $msg);
                            $db->execute();
                        }
                        $db->close();

                        // Send notification to offer owner about new submission
                        if ($parent_offer_id > 0) {
                            $dbNotif = new Database();
                            $dbNotif->prepare("SELECT user_id, title FROM offers WHERE id = ?");
                            $dbNotif->bind('i', $parent_offer_id);
                            $dbNotif->execute();
                            $parentOffer = $dbNotif->getRow();
                            $dbNotif->close();
                            if ($parentOffer && intval($parentOffer['user_id']) !== intval($user['user_id'])) {
                                $notif = new Notification();
                                $notif->create(
                                    intval($parentOffer['user_id']),
                                    'offer_update',
                                    'New Design Submission',
                                    "New design submitted for your offer '" . addslashes($parentOffer['title']) . "' by " . ($user['username'] ?? 'a designer'),
                                    '/again/#page-offers',
                                    $parent_offer_id
                                );
                            }
                        }
                    }
                }
            }
            Response::success(['offer_id' => $result['offer_id']], 'Offer created successfully', 201);
        } else {
            Response::error('Failed to create offer', 500);
        }
    }
    
    /**
     * Update offer
     * PUT /api/offers/{id}
     */
    public static function update($id) {
        $user = AuthMiddleware::verify();
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $title = $data['title'] ?? null;
        $description = $data['description'] ?? null;
        $budget = $data['budget'] ?? null;
        $deadline = $data['deadline'] ?? null;
        $tags = $data['tags'] ?? '';
        $reference_images = $data['reference_images'] ?? null;
        try {
            $reference_images = MediaStorage::normalizeReferenceImages($reference_images);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 400);
        }
        
        if (!$title || !$description || $budget === null || !$deadline) {
            Response::error('Missing required fields', 400);
        }
        
        $offer = new Offer();
        $result = $offer->update($id, $user['user_id'], $title, $description, $budget, $deadline, $tags, $reference_images);
        
        if ($result['success']) {
            Response::success(null, 'Offer updated successfully');
        } else {
            Response::error($result['message'] ?? 'Failed to update offer', 400);
        }
    }
       /**
     * Delete/close offer
     * DELETE /api/offers/{id}
     */
    public static function delete($id) {
        $user = AuthMiddleware::verify();
        
        $offer = new Offer();
        // Since $offer->close() deletes submissions and applications, it acts as a delete cleanup.
        $result = $offer->close($id, $user['user_id']);
        
        if ($result['success']) {
            $db = new Database();
            $db->prepare("DELETE FROM offers WHERE id = ?");
            $db->bind('i', $id);
            $db->execute();
            $db->close();
            Response::success(null, 'Offer deleted successfully');
        } else {
            Response::error($result['message'] ?? 'Failed to delete offer or unauthorized', 400);
        }
    }
       /**
     * Get user's offers
     * GET /api/user/offers?page=1&limit=10
     */
    public static function getUserOffers() {
        $user = AuthMiddleware::verify();
        
        $page = isset($_GET['page']) ? intval($_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 10;
        
        $offer = new Offer();
        $data = $offer->getUserOffers($user['user_id'], $page, $limit);
        
        $db = new Database();
        $db->prepare("
            SELECT COUNT(DISTINCT o.id) as total
            FROM offers o
            LEFT JOIN offer_applications oa ON oa.offer_id = o.id AND oa.user_id = ?
            WHERE o.user_id = ? OR (oa.user_id = ? AND oa.status = 'accepted')
        ");
        $db->bind('iii', $user['user_id'], $user['user_id'], $user['user_id']);
        $db->execute();
        $row = $db->getRow();
        $total = $row ? intval($row['total']) : 0;
        $db->close();
        
        Response::paginate($data, $page, $limit, $total);
    }
    
    /**
     * Search offers
     * GET /api/offers/search?q=keyword
     */
    public static function search() {
        $query = $_GET['q'] ?? '';
        $page = $_GET['page'] ?? 1;
        $limit = $_GET['limit'] ?? 12;
        
        if (strlen($query) < 2) {
            Response::error('Search query must be at least 2 characters', 400);
        }
        
        $offer = new Offer();
        $results = $offer->search($query, $page, $limit);
        
        Response::success($results, 'Search results');
    }
    
    /**
     * Close offer (stop accepting submissions + distribute rewards)
     * PUT /api/offers/{id}/close
     */
    public static function closeOffer($id) {
        $user = AuthMiddleware::verify();
        
        $db = new Database();
        $db->prepare("SELECT user_id FROM offers WHERE id = ?");
        $db->bind('i', $id);
        $db->execute();
        $offerRow = $db->getRow();
        $db->close();

        if (!$offerRow) {
            Response::error('Offer not found', 404);
        }

        $roles = isset($user['roles']) ? (is_array($user['roles']) ? $user['roles'] : json_decode($user['roles'], true)) : [];
        if (!is_array($roles)) $roles = [];
        $isAdmin = in_array('admin', $roles);

        if (intval($offerRow['user_id']) !== intval($user['user_id']) && !$isAdmin) {
            Response::error('Unauthorized', 403);
        }

        $offer = new Offer();
        $result = $offer->closeAndDistribute($id);
        
        if ($result['success']) {
            Response::success(null, 'Offer closed and rewards distributed successfully');
        } else {
            Response::error($result['message'] ?? 'Failed to close offer', 400);
        }
    }
    
    /**
     * Approve offer (admin only)
     * POST /api/admin/offers/{id}/approve
     */
    public static function approveOffer($id) {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $offer = new Offer();
        $result = $offer->approve($id);
        
        if ($result['success']) {
            Response::success(null, 'Offer approved successfully');
        } else {
            Response::error('Failed to approve offer', 500);
        }
    }
    
    /**
     * Get pending approval offers (admin only)
     * GET /api/admin/offers/pending
     */
    public static function getPendingApproval() {
        $user = AuthMiddleware::verify();
        
        // Check admin role
        $user_model = new User();
        $user_data = $user_model->getById($user['user_id']);
        $roles = json_decode($user_data['roles'] ?? '[]', true);
        
        if (!in_array('admin', $roles)) {
            Response::error('Unauthorized - admin role required', 403);
        }
        
        $limit = $_GET['limit'] ?? 20;
        $offset = $_GET['offset'] ?? 0;
        
        $offer = new Offer();
        $result = $offer->getPendingApproval($limit, $offset);
        
        Response::success($result, 'Pending offers retrieved');
    }

    /**
     * Check and handle expired deadlines automatically
     */
    public static function checkExpiredDeadlines() {
        $db = new Database();
        
        $now = date('Y-m-d H:i:s');
        $db->prepare("SELECT id, title, user_id FROM offers WHERE status = 'active' AND is_approved = 1 AND deadline < ?");
        $db->bind('s', $now);
        $db->execute();
        $expiredOffers = $db->getRows();
        
        if (empty($expiredOffers)) {
            $db->close();
            return;
        }
        
        $notif = new Notification();
        $offerModel = new Offer();
        
        foreach ($expiredOffers as $o) {
            $offerId = intval($o['id']);
            $clientId = intval($o['user_id']);
            
            $offerModel->closeAndDistribute($offerId);
            
            $notif->create(
                $clientId,
                'offer_update',
                'Offer Deadline Expired',
                "Your offer '" . addslashes($o['title']) . "' deadline has expired. The contest is now closed and rewards have been distributed!",
                '/again/#page-offers',
                $offerId
            );
            
            $db2 = new Database();
            $db2->prepare("SELECT DISTINCT user_id FROM offer_applications WHERE offer_id = ?");
            $db2->bind('i', $offerId);
            $db2->execute();
            $participants = $db2->getRows();
            $db2->close();
            
            foreach ($participants as $p) {
                $designerId = intval($p['user_id']);
                $notif->create(
                    $designerId,
                    'offer_update',
                    'Contest Concluded',
                    "The offer '" . addslashes($o['title']) . "' has concluded! Winners have been selected and rewards distributed.",
                    '/again/#page-offers',
                    $offerId
                );
            }
        }
        
        $db->close();
    }
}

?>
