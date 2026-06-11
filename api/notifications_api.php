<?php
/**
 * Notifications API
 * ضع هذا الملف في: tajriba/backend/controllers/NotificationsController.php
 * أو أضف الـ routes ديالو في index.php ديال الـ API
 *
 * Routes:
 *   GET  /tajriba/api/user/notifications              → getNotifications()
 *   GET  /tajriba/api/user/notifications/unread-count → getUnreadCount()
 *   POST /tajriba/api/user/notifications/{id}/read    → markAsRead()
 *   POST /tajriba/api/user/notifications/read-all     → markAllAsRead()
 *   DELETE /tajriba/api/user/notifications/{id}       → deleteNotification()
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Auth ──────────────────────────────────────────────────────
$auth = new Auth();
$auth_error = $auth->verify();
if ($auth_error) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$token   = substr($_SERVER['HTTP_AUTHORIZATION'] ?? '', 7);
$jwt     = new JWT();
$decoded = $jwt->verify($token);
if (!$decoded) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid token']);
    exit;
}
$user_id = (int)$decoded['sub'];

// ── Router ────────────────────────────────────────────────────
$method  = $_SERVER['REQUEST_METHOD'];
$uri     = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// نستخرجو الـ segment بعد /notifications
$base    = '/tajriba/api/user/notifications';
$segment = trim(substr($uri, strlen($base)), '/'); // "" | "unread-count" | "123" | "123/read" | "read-all"

$db = new Database();

// ── GET /notifications ────────────────────────────────────────
if ($method === 'GET' && $segment === '') {
    $page       = max(1, (int)($_GET['page']       ?? 1));
    $limit      = min(50, max(1, (int)($_GET['limit'] ?? 15)));
    $unread_only = filter_var($_GET['unread_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $offset     = ($page - 1) * $limit;

    $query = "SELECT * FROM notifications WHERE user_id = ?";
    if ($unread_only) {
        $query .= " AND is_read = 0";
    }
    $query .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    $db->prepare($query)
       ->bind('i', $user_id)
       ->bind('i', $limit)
       ->bind('i', $offset)
       ->execute();

    $notifications = $db->getRows();

    // نحولو is_read لـ read_at باش يتوافق مع الـ frontend
    foreach ($notifications as &$n) {
        if ($n['is_read'] && !$n['read_at']) {
            $n['read_at'] = $n['updated_at'];
        }
    }

    echo json_encode([
        'success' => true,
        'data'    => $notifications,
        'page'    => $page,
        'limit'   => $limit
    ]);
    exit;
}

// ── GET /notifications/unread-count ───────────────────────────
if ($method === 'GET' && $segment === 'unread-count') {
    $db->prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0")
       ->bind('i', $user_id)
       ->execute();

    $row = $db->getRow();
    echo json_encode([
        'success' => true,
        'data'    => ['unread_count' => (int)($row['count'] ?? 0)]
    ]);
    exit;
}

// ── POST /notifications/read-all ──────────────────────────────
if ($method === 'POST' && $segment === 'read-all') {
    $db->prepare("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0")
       ->bind('i', $user_id)
       ->execute();

    echo json_encode(['success' => true, 'message' => 'All notifications marked as read']);
    exit;
}

// ── POST /notifications/{id}/read ─────────────────────────────
if ($method === 'POST' && preg_match('/^(\d+)\/read$/', $segment, $m)) {
    $notif_id = (int)$m[1];
    $db->prepare("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?")
       ->bind('i', $notif_id)
       ->bind('i', $user_id)
       ->execute();

    echo json_encode(['success' => true, 'message' => 'Notification marked as read']);
    exit;
}

// ── DELETE /notifications/{id} ────────────────────────────────
if ($method === 'DELETE' && preg_match('/^(\d+)$/', $segment, $m)) {
    $notif_id = (int)$m[1];
    $db->prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?")
       ->bind('i', $notif_id)
       ->bind('i', $user_id)
       ->execute();

    echo json_encode(['success' => true, 'message' => 'Notification deleted']);
    exit;
}

// ── 404 ───────────────────────────────────────────────────────
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Route not found']);
