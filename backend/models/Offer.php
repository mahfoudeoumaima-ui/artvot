<?php
/**
 * Offer Model
 * Handles offer database operations
 */

class Offer {
    private $db;
    
    public function __construct() {
        $this->db = new Database();
    }
    
    /**
     * Create new offer
     */
    public function create($user_id, $title, $description, $budget, $deadline, $package_type = 'basic', $duration_days = 3, $tags = '', $requires_payment = 1, $is_approved = 0, $reference_images = null) {
        $created_at = date('Y-m-d H:i:s');
        // Not-yet-approved offers start as 'pending'; admins start as 'active'
        $status = $is_approved ? 'active' : 'pending';

        $this->db->prepare("
            INSERT INTO offers 
            (user_id, title, description, budget, deadline, package_type, duration_days, tags, status, requires_payment, payment_status, is_approved, reference_images, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        ");

        $this->db->bind('issdssississs',
            $user_id,
            $title,
            $description,
            $budget,
            $deadline,
            $package_type,
            $duration_days,
            $tags,
            $status,
            $requires_payment,
            $is_approved ? 1 : 0,
            $reference_images,
            $created_at
        );
        
        if ($this->db->execute()) {
            $offer_id = $this->db->lastInsertId();
            
            // Add 'client' role to user
            $user = new User();
            $user->addRole($user_id, 'client');
            
            return ['success' => true, 'offer_id' => $offer_id];
        }
        
        return ['success' => false, 'message' => 'Failed to create offer'];
    }
    
    /**
     * Get offer by ID
     */
    public function getById($id) {
        $this->db->prepare("
            SELECT o.*, u.username, u.full_name, 
                   (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count
            FROM offers o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
        ");
        $this->db->bind('i', $id);
        $this->db->execute();
        return $this->db->getRow();
    }
    
    /**
     * Get all offers with pagination
     */
    public function getAll($page = 1, $limit = 12, $status = 'active', $category = 'all', $search = '', $sort = 'trending') {
        $offset = ($page - 1) * $limit;
        
        $where = ["o.status != 'deleted'"];
        $params = [];
        $types = "";
        
        if ($status === 'expired') {
            $where[] = "(o.deadline < CURRENT_DATE() OR o.status = 'closed')";
        } else {
            // Only show approved active offers publicly
            $where[] = "(o.deadline IS NULL OR o.deadline >= CURRENT_DATE()) AND o.status = 'active' AND o.is_approved = 1";
        }
        
        if ($category && strtolower($category) !== 'all') {
            $where[] = "(o.tags LIKE ? OR o.title LIKE ?)";
            $params[] = '%' . $category . '%';
            $params[] = '%' . $category . '%';
            $types .= "ss";
        }
        
        if ($search && trim($search) !== '') {
            $where[] = "(o.title LIKE ? OR o.description LIKE ?)";
            $params[] = '%' . $search . '%';
            $params[] = '%' . $search . '%';
            $types .= "ss";
        }
        
        $whereClause = implode(" AND ", $where);
        
        $orderBy = "o.created_at DESC";
        if ($sort === 'trending') {
            $orderBy = "o.vote_average DESC, o.total_votes DESC";
        } elseif ($sort === 'popular') {
            $orderBy = "o.total_votes DESC";
        } elseif ($sort === 'newest') {
            $orderBy = "o.created_at DESC";
        }
        
        // Query for count
        $countQuery = "SELECT COUNT(*) as total FROM offers o WHERE " . $whereClause;
        $this->db->prepare($countQuery);
        if (!empty($params)) {
            $this->db->bind($types, ...$params);
        }
        $this->db->execute();
        $count_result = $this->db->getRow();
        $total = $count_result['total'] ?? 0;
        
        // Query for data
        $dataQuery = "
            SELECT o.*, u.username, u.full_name,
                   (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count,
                   p.title as parent_offer_title, p.id as parent_offer_id
            FROM offers o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN offers p ON o.description LIKE CONCAT('%(Submitted for Offer #', p.id, ')%')
            WHERE " . $whereClause . "
            ORDER BY " . $orderBy . "
            LIMIT ? OFFSET ?
        ";
        
        $this->db->prepare($dataQuery);
        
        $dataParams = array_merge($params, [$limit, $offset]);
        $dataTypes = $types . "ii";
        
        $this->db->bind($dataTypes, ...$dataParams);
        $this->db->execute();
        $offers = $this->db->getRows();
        
        return [
            'data' => $offers,
            'total' => $total
        ];
    }
    
    /**
     * Get user's offers
     */
    public function getUserOffers($user_id, $page = 1, $limit = 50) {
        $offset = ($page - 1) * $limit;
        
        $this->db->prepare("
            SELECT o.*, 
                   (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count,
                   COALESCE(oa.status, 'creator') as user_application_status
            FROM offers o
            LEFT JOIN offer_applications oa ON oa.offer_id = o.id AND oa.user_id = ?
            WHERE o.user_id = ? OR (oa.user_id = ? AND oa.status IN ('applied', 'accepted'))
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('iiiii', $user_id, $user_id, $user_id, $limit, $offset);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Alias for getUserOffers or designs/contributions
     */
    public function getByUserId($user_id, $page = 1, $limit = 10) {
        return $this->getUserOffers($user_id, $page, $limit);
    }
    
    /**
     * Close offer and trigger reward distribution
     */
    public function closeAndDistribute($offer_id) {
        // Update offer status to closed
        $this->db->prepare("UPDATE offers SET status = 'closed' WHERE id = ?");
        $this->db->bind('i', $offer_id);
        
        if (!$this->db->execute()) {
            return ['success' => false, 'message' => 'Failed to close offer'];
        }
        
        // Trigger reward distribution
        $reward = new Reward();
        $result = $reward->distributeRewards($offer_id);
        
        return $result;
    }
    
    /**
     * Approve offer (admin only)
     */
    public function approve($offer_id) {
        $approval_date = date('Y-m-d H:i:s');
        
        $this->db->prepare("UPDATE offers SET is_approved = 1, approval_date = ? WHERE id = ?");
        $this->db->bind('si', $approval_date, $offer_id);
        
        return ['success' => $this->db->execute()];
    }
    
    /**
     * Get pending approval offers (admin only)
     */
    public function getPendingApproval($limit = 20, $offset = 0) {
        $this->db->prepare("
            SELECT o.*, u.username, u.full_name,
                   (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count
            FROM offers o
            JOIN users u ON o.user_id = u.id
            WHERE o.is_approved = 0
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('ii', $limit, $offset);
        $this->db->execute();
        return $this->db->getRows();
    }
    
    /**
     * Search offers
     */
    public function search($query, $page = 1, $limit = 12) {
        $offset = ($page - 1) * $limit;
        $search_term = '%' . $query . '%';
        
        $this->db->prepare("
            SELECT o.*, u.username, 
                   (SELECT COUNT(*) FROM offer_applications WHERE offer_id = o.id) as submission_count
            FROM offers o
            JOIN users u ON o.user_id = u.id
            WHERE o.status = 'active' AND (o.title LIKE ? OR o.description LIKE ? OR o.tags LIKE ?)
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $this->db->bind('sssii', $search_term, $search_term, $search_term, $limit, $offset);
        $this->db->execute();
        
        return $this->db->getRows();
    }
    
    /**
     * Update offer (only creator within 1st hour, or admin)
     */
    public function update($id, $user_id, $title, $description, $budget, $deadline, $tags, $reference_images = null) {
        $this->db->prepare("SELECT user_id, created_at FROM offers WHERE id = ?");
        $this->db->bind('i', $id);
        $this->db->execute();
        $offer = $this->db->getRow();
        
        if (!$offer) {
            return ['success' => false, 'message' => 'Offer not found'];
        }
        
        // RBAC check
        $this->db->prepare("SELECT roles FROM users WHERE id = ?");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        $userRow = $this->db->getRow();
        $roles = [];
        if ($userRow && $userRow['roles']) {
            $roles = json_decode($userRow['roles'], true) ?: [];
        }
        $isAdmin = in_array('admin', $roles);
        
        if (intval($offer['user_id']) !== intval($user_id) && !$isAdmin) {
            return ['success' => false, 'message' => 'Unauthorized'];
        }
        
        // 1 hour limit for creators
        if (!$isAdmin) {
            $created_time = strtotime($offer['created_at']);
            if (time() - $created_time > 3600) {
                return ['success' => false, 'message' => 'Offer can no longer be modified.'];
            }
        }
        
        $is_submission = ($budget == 0 && stripos($description, '(Submitted for Offer #') !== false);
        $now = date('Y-m-d H:i:s');

        if ($reference_images !== null) {
            if ($is_submission) {
                $this->db->prepare("
                    UPDATE offers 
                    SET title = ?, description = ?, budget = ?, deadline = ?, tags = ?, reference_images = ?, created_at = ?
                    WHERE id = ?
                ");
                $this->db->bind('ssdssssi', $title, $description, $budget, $deadline, $tags, $reference_images, $now, $id);
            } else {
                $this->db->prepare("
                    UPDATE offers 
                    SET title = ?, description = ?, budget = ?, deadline = ?, tags = ?, reference_images = ?
                    WHERE id = ?
                ");
                $this->db->bind('ssdsssi', $title, $description, $budget, $deadline, $tags, $reference_images, $id);
            }
        } else {
            if ($is_submission) {
                $this->db->prepare("
                    UPDATE offers 
                    SET title = ?, description = ?, budget = ?, deadline = ?, tags = ?, created_at = ?
                    WHERE id = ?
                ");
                $this->db->bind('ssdsssi', $title, $description, $budget, $deadline, $tags, $now, $id);
            } else {
                $this->db->prepare("
                    UPDATE offers 
                    SET title = ?, description = ?, budget = ?, deadline = ?, tags = ?
                    WHERE id = ?
                ");
                $this->db->bind('ssdssi', $title, $description, $budget, $deadline, $tags, $id);
            }
        }
        
        if ($this->db->execute()) {
            return ['success' => true];
        }
        return ['success' => false, 'message' => 'Failed to update offer'];
    }

    /**
     * Close/Delete offer (creator or admin)
     */
    public function close($id, $user_id) {
        $this->db->prepare("SELECT user_id FROM offers WHERE id = ?");
        $this->db->bind('i', $id);
        $this->db->execute();
        $offer = $this->db->getRow();
        
        if (!$offer) {
            return ['success' => false, 'message' => 'Offer not found'];
        }
        
        // RBAC check
        $this->db->prepare("SELECT roles FROM users WHERE id = ?");
        $this->db->bind('i', $user_id);
        $this->db->execute();
        $userRow = $this->db->getRow();
        $roles = [];
        if ($userRow && $userRow['roles']) {
            $roles = json_decode($userRow['roles'], true) ?: [];
        }
        $isAdmin = in_array('admin', $roles);
        
        if (intval($offer['user_id']) !== intval($user_id) && !$isAdmin) {
            return ['success' => false, 'message' => 'Unauthorized'];
        }
        
        $this->db->prepare("UPDATE offers SET status = 'closed' WHERE id = ?");
        $this->db->bind('i', $id);
        
        if ($this->db->execute()) {
            // Delete all linked submissions and applications safely to avoid orphans
            $db2 = new Database();
            $db2->prepare("DELETE FROM offers WHERE budget = 0 AND description LIKE ?");
            $suffix = "%(Submitted for Offer #" . $id . ")";
            $db2->bind('s', $suffix);
            $db2->execute();
            $db2->close();
            
            $db3 = new Database();
            $db3->prepare("DELETE FROM offer_applications WHERE offer_id = ?");
            $db3->bind('i', $id);
            $db3->execute();
            $db3->close();

            return ['success' => true];
        }
        return ['success' => false, 'message' => 'Failed to close offer'];
    }

    
    public function __destruct() {
        $this->db->close();
    }
}
?>
