<?php
/**
 * ARTVOT API Router
 * Main entry point for all API requests
 */
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    error_log("[$errno] $errstr in $errfile on line $errline");
    return true;
});
 
// Output buffering
ob_start();
 
// CORS
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Methods');
header_remove('Access-Control-Allow-Headers');
header_remove('Content-Type');
 
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');
 
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
 
// Load config
require_once(__DIR__ . '/../backend/config/config.php');
require_once(__DIR__ . '/../backend/config/database.php');
require_once(__DIR__ . '/../backend/helpers/jwt.php');
require_once(__DIR__ . '/../backend/helpers/response.php');
require_once(__DIR__ . '/../backend/helpers/media.php');
require_once(__DIR__ . '/../backend/middleware/auth.php');
 
// Models
require_once(__DIR__ . '/../backend/models/User.php');
require_once(__DIR__ . '/../backend/models/Offer.php');
require_once(__DIR__ . '/../backend/models/Vote.php');
require_once(__DIR__ . '/../backend/models/Reward.php');
require_once(__DIR__ . '/../backend/models/Report.php');
require_once(__DIR__ . '/../backend/models/Notification.php');
require_once(__DIR__ . '/../backend/models/Analytics.php');
require_once(__DIR__ . '/../backend/models/Comment.php');
 
// Controllers
require_once(__DIR__ . '/../backend/controllers/AuthController.php');
require_once(__DIR__ . '/../backend/controllers/GoogleAuthController.php');
require_once(__DIR__ . '/../backend/controllers/FacebookAuthController.php');
require_once(__DIR__ . '/../backend/controllers/OfferController.php');
require_once(__DIR__ . '/../backend/controllers/VoteController.php');
require_once(__DIR__ . '/../backend/controllers/UserController.php');
require_once(__DIR__ . '/../backend/controllers/RewardController.php');
require_once(__DIR__ . '/../backend/controllers/ModerationController.php');
require_once(__DIR__ . '/../backend/controllers/NotificationController.php');
require_once(__DIR__ . '/../backend/controllers/AnalyticsController.php');
require_once(__DIR__ . '/../backend/controllers/AdminController.php');
require_once(__DIR__ . '/../backend/controllers/CommentController.php');
require_once(__DIR__ . '/../backend/controllers/PasswordResetController.php');
require_once(__DIR__ . '/../backend/helpers/mailer.php');
 
// Parse request
$method = $_SERVER['REQUEST_METHOD'];
 
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/[^/]+/api(?:/index\.php)?#', '', $path);
$path = trim($path, '/');
$segments = $path !== '' ? array_values(array_filter(explode('/', $path))) : [];
 
try {
    OfferController::checkExpiredDeadlines();
 
    if (empty($segments)) {
        echo json_encode(['success' => true, 'message' => 'ARTVOT API is running', 'version' => '1.0']);
        exit;
    }

    /*
    |--------------------------------------------------------------------------
    | AUTH ROUTES
    |--------------------------------------------------------------------------
    */

    if ($segments[0] === 'auth') {
 
        if ($method === 'POST' && $segments[1] === 'register') {
            AuthController::register();
        }
 
        elseif ($method === 'POST' && $segments[1] === 'login') {
            AuthController::login();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'me') {
            AuthController::getMe();
        }
 
        elseif ($method === 'PUT' && $segments[1] === 'profile') {
            AuthController::updateProfile();
        }
 
        elseif ($method === 'POST' && $segments[1] === 'change-password') {
            AuthController::changePassword();
        }
 
        elseif ($method === 'POST' && $segments[1] === 'logout') {
            AuthController::logout();
        }
 
        elseif ($method === 'POST' && isset($segments[1]) && $segments[1] === 'forgot-password') {
            PasswordResetController::requestReset();
        }
 
        elseif ($method === 'POST' && isset($segments[1]) && $segments[1] === 'reset-password') {
            PasswordResetController::resetPassword();
        }
 
        // GET /auth/google — redirect user to Google login page
        elseif ($method === 'GET' && isset($segments[1]) && $segments[1] === 'google'
                && count($segments) === 2) {
            GoogleAuthController::redirect();
        }

        // GET /auth/google/callback — handle code exchange after Google redirects back
        elseif ($method === 'GET' && isset($segments[1]) && $segments[1] === 'google'
                && isset($segments[2]) && $segments[2] === 'callback') {
            GoogleAuthController::callback();
        }

        // GET /auth/facebook — redirect user to Facebook login page
        elseif ($method === 'GET' && isset($segments[1]) && $segments[1] === 'facebook'
                && count($segments) === 2) {
            FacebookAuthController::redirect();
        }

        // GET /auth/facebook/callback — handle code exchange after Facebook redirects back
        elseif ($method === 'GET' && isset($segments[1]) && $segments[1] === 'facebook'
                && isset($segments[2]) && $segments[2] === 'callback') {
            FacebookAuthController::callback();
        }

        else {
            Response::error('Auth route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | OFFERS ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'offers') {
 
        if ($method === 'GET' && count($segments) === 1) {
            OfferController::getAll();
        }
 
        elseif ($method === 'GET' && count($segments) === 2) {
            OfferController::getById($segments[1]);
        }
 
        elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'result') {
            RewardController::getOfferResult($segments[1]);
        }
 
        elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'analytics') {
            AnalyticsController::getOfferAnalytics($segments[1]);
        }
 
        elseif ($method === 'POST' && count($segments) === 1) {
            $user = AuthMiddleware::verify();
            OfferController::create();
        }
 
        elseif ($method === 'PUT' && count($segments) === 2) {
            $user = AuthMiddleware::verify();
            OfferController::update($segments[1]);
        }
 
        elseif ($method === 'PUT' && count($segments) === 3 && $segments[2] === 'close') {
            $user = AuthMiddleware::verify();
            OfferController::closeOffer($segments[1]);
        }
 
        elseif ($method === 'DELETE' && count($segments) === 2) {
            $user = AuthMiddleware::verify();
            OfferController::delete($segments[1]);
        }
 
        elseif ($method === 'GET' && $segments[1] === 'search') {
            OfferController::search();
        }
 
        // POST /offers/{id}/apply — user applies to an offer
        elseif ($method === 'POST' && count($segments) === 3 && $segments[2] === 'apply') {
            try {
                $user = AuthMiddleware::verify();
                $offer_id = intval($segments[1]);
                $data = json_decode(file_get_contents('php://input'), true);
                $message = $data['message'] ?? '';

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

                $db2 = new Database();
                $db2->prepare("SELECT o.id, o.title, o.status, o.deadline, o.budget, o.description, u.username as client_name, u.full_name as client_full_name FROM offers o JOIN users u ON o.user_id = u.id WHERE o.id = ?");
                $db2->bind('i', $offer_id);
                $db2->execute();
                $offer = $db2->getRow();
                $db2->close();

                if (!$offer) {
                    Response::error('Offer not found', 404);
                }

                $now = new DateTime();
                $deadlineDate = $offer['deadline'] ? new DateTime($offer['deadline']) : null;
                $isExpired = $deadlineDate && $deadlineDate < $now;
                $isClosed = $offer['status'] === 'closed' || $offer['status'] === 'completed' || $isExpired;
                if ($isClosed) {
                    Response::error('Offer not found or closed', 400);
                }

                $db = new Database();
                $db->prepare("SELECT id, user_id FROM offer_applications WHERE offer_id = ? AND user_id = ?");
                $db->bind('ii', $offer_id, $user['user_id']);
                $db->execute();
                $existing = $db->getRow();
                $db->close();

                if ($existing) {
                    $db3 = new Database();
                    $db3->prepare("UPDATE offer_applications SET message = ?, status = 'applied' WHERE offer_id = ? AND user_id = ?");
                    $db3->bind('sii', $message, $offer_id, $user['user_id']);
                    $execute_success = $db3->execute();
                    $db3->close();
                    
                    if ($execute_success) {
                        Response::success([
                            'application_id' => $existing['id'],
                            'offer' => [
                                'id' => $offer['id'],
                                'title' => $offer['title'],
                                'description' => $offer['description'],
                                'budget' => $offer['budget'],
                                'deadline' => $offer['deadline'],
                                'client_name' => $offer['client_full_name'] ?: $offer['client_name'],
                            ]
                        ], 'Application updated successfully!', 200);
                    } else {
                        Response::error('Failed to update application', 500);
                    }
                    exit;
                }

                $db3 = new Database();
                $db3->prepare("INSERT INTO offer_applications (offer_id, user_id, message, status) VALUES (?, ?, ?, 'applied')");
                $db3->bind('iis', $offer_id, $user['user_id'], $message);
                $execute_success = $db3->execute();
                $last_id = $db3->lastInsertId();
                $db3->close();

                if ($execute_success) {
                    Response::success([
                        'application_id' => $last_id,
                        'offer' => [
                            'id' => $offer['id'],
                            'title' => $offer['title'],
                            'description' => $offer['description'],
                            'budget' => $offer['budget'],
                            'deadline' => $offer['deadline'],
                            'client_name' => $offer['client_full_name'] ?: $offer['client_name'],
                        ]
                    ], 'Offer accepted! You can now submit your design.', 201);
                } else {
                    Response::error('Failed to submit application', 500);
                }
            } catch (Exception $e) {
                Response::error('Server error: ' . $e->getMessage(), 500);
            }
        }

        // GET /offers/{id}/my-application
        elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'my-application') {
            $user = AuthMiddleware::verify();
            $offer_id = intval($segments[1]);
            $db = new Database();
            $db->prepare("SELECT oa.*, o.title as offer_title, o.budget, o.deadline, o.description as offer_description, u.full_name as client_name FROM offer_applications oa JOIN offers o ON oa.offer_id = o.id JOIN users u ON o.user_id = u.id WHERE oa.offer_id = ? AND oa.user_id = ?");
            $db->bind('ii', $offer_id, $user['user_id']);
            $db->execute();
            $app = $db->getRow();
            $db->close();
            if ($app) {
                Response::success($app, 'Application found');
            } else {
                Response::error('No application found', 404);
            }
        }

        // GET /offers/{id}/submissions
        elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'submissions') {
            $offer_id = intval($segments[1]);
            $db = new Database();
            $db->prepare("
                SELECT o.*, u.username, u.full_name, COALESCE(oa.status, 'applied') as status 
                FROM offers o 
                JOIN users u ON o.user_id = u.id 
                LEFT JOIN offer_applications oa ON oa.offer_id = ? AND oa.user_id = o.user_id
                WHERE o.description LIKE CONCAT('%(Submitted for Offer #', ?, ')%')
                ORDER BY o.created_at DESC
            ");
            $db->bind('ii', $offer_id, $offer_id);
            $db->execute();
            $submissions = $db->getRows();
            $db->close();
            Response::success($submissions, 'Submissions fetched');
        }

        // POST /offers/{id}/submissions/{sub_id}/accept
        elseif ($method === 'POST' && count($segments) === 5 && $segments[2] === 'submissions' && $segments[4] === 'accept') {
            $user = AuthMiddleware::verify();
            $offer_id = intval($segments[1]);
            $sub_id = intval($segments[3]);
            
            $db = new Database();
            $db->prepare("SELECT user_id FROM offers WHERE id = ?");
            $db->bind('i', $sub_id);
            $db->execute();
            $sub = $db->getRow();
            if (!$sub) {
                $db->close();
                Response::error('Submission not found', 404);
            }
            $designer_id = $sub['user_id'];
            
            $db->prepare("SELECT user_id FROM offers WHERE id = ?");
            $db->bind('i', $offer_id);
            $db->execute();
            $parent = $db->getRow();
            if (!$parent || intval($parent['user_id']) !== intval($user['user_id'])) {
                $db->close();
                Response::error('Unauthorized to accept submissions for this offer', 403);
            }
            
            $db->prepare("UPDATE offer_applications SET status = 'accepted', accepted_at = NOW() WHERE offer_id = ? AND user_id = ?");
            $db->bind('ii', $offer_id, $designer_id);
            if ($db->execute()) {
                $notif = new Notification();
                $notif->create(
                    $designer_id,
                    'offer_update',
                    'Submission Accepted! 🎉',
                    "Your design was accepted for this offer! Check your profile for details.",
                    '/again/#page-profile',
                    $offer_id
                );
                $db->close();
                Response::success(null, 'Submission accepted successfully');
            } else {
                $db->close();
                Response::error('Failed to accept submission', 500);
            }
        }

        // POST /offers/{id}/submissions/{sub_id}/reject
        elseif ($method === 'POST' && count($segments) === 5 && $segments[2] === 'submissions' && $segments[4] === 'reject') {
            $user = AuthMiddleware::verify();
            $offer_id = intval($segments[1]);
            $sub_id = intval($segments[3]);
            
            $db = new Database();
            $db->prepare("SELECT user_id FROM offers WHERE id = ?");
            $db->bind('i', $sub_id);
            $db->execute();
            $sub = $db->getRow();
            if (!$sub) {
                $db->close();
                Response::error('Submission not found', 404);
            }
            $designer_id = $sub['user_id'];
            
            $db->prepare("SELECT user_id FROM offers WHERE id = ?");
            $db->bind('i', $offer_id);
            $db->execute();
            $parent = $db->getRow();
            if (!$parent || intval($parent['user_id']) !== intval($user['user_id'])) {
                $db->close();
                Response::error('Unauthorized to reject submissions for this offer', 403);
            }
            
            $db->prepare("UPDATE offer_applications SET status = 'rejected' WHERE offer_id = ? AND user_id = ?");
            $db->bind('ii', $offer_id, $designer_id);
            if ($db->execute()) {
                $db->close();
                Response::success(null, 'Submission rejected');
            } else {
                $db->close();
                Response::error('Failed to reject submission', 500);
            }
        }

        // POST /offers/{id}/approve
        elseif ($method === 'POST' && count($segments) === 3 && $segments[2] === 'approve') {
            OfferController::approveOffer($segments[1]);
        }

        // GET /offers/{id}/comments
        elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'comments') {
            CommentController::getComments($segments[1]);
        }

        // POST /offers/{id}/comments
        elseif ($method === 'POST' && count($segments) === 3 && $segments[2] === 'comments') {
            OfferController::requireOfferActive((int)$segments[1]);
            CommentController::postComment($segments[1]);
        }
 
        else {
            Response::error('Offer route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | SUBMISSIONS ROUTES
    |--------------------------------------------------------------------------
    */
    elseif ($segments[0] === 'submissions') {
        if ($method === 'GET' && count($segments) === 1) {
            $user = AuthMiddleware::verify();
            if (isset($_GET['designer_id'])) {
                $designer_id = intval($_GET['designer_id']);
                
                // Security check: own Artwork data only unlocks after the first real design submission.
                $db_check = new Database();
                $db_check->prepare("SELECT COUNT(*) as sub_count FROM offers WHERE user_id = ? AND budget = 0 AND description LIKE '%(Submitted for Offer #%'");
                $db_check->bind('i', $designer_id);
                $db_check->execute();
                $check_row = $db_check->getRow();
                $sub_count = intval($check_row['sub_count'] ?? 0);
                $db_check->close();
                
                if (intval($designer_id) === intval($user['user_id']) && $sub_count < 1) {
                    Response::error('Access Denied: You must have submitted at least one design submission to access artwork data.', 403);
                    exit;
                }

                $db = new Database();
                $db->prepare("
                    SELECT o.*, u.username, u.full_name,
                           p.title as parent_offer_title, p.id as parent_offer_id,
                           COALESCE(oa.status, 'applied') as status
                    FROM offers o
                    JOIN users u ON o.user_id = u.id
                    LEFT JOIN offers p ON o.description LIKE CONCAT('%(Submitted for Offer #', p.id, ')%')
                    LEFT JOIN offer_applications oa ON oa.offer_id = p.id AND oa.user_id = o.user_id
                    WHERE o.user_id = ? AND o.description LIKE '%(Submitted for Offer #%'
                    ORDER BY o.created_at DESC
                ");
                $db->bind('i', $designer_id);
                $db->execute();
                $rows = $db->getRows();
                $db->close();
                Response::success($rows, 'Designer submissions fetched');
            } elseif (isset($_GET['offer_id'])) {
                $offer_id = intval($_GET['offer_id']);
                $db = new Database();
                $db->prepare("
                    SELECT o.*, u.username, u.full_name,
                           COALESCE(oa.status, 'applied') as status
                    FROM offers o
                    JOIN users u ON o.user_id = u.id
                    LEFT JOIN offer_applications oa ON oa.offer_id = ? AND oa.user_id = o.user_id
                    WHERE o.description LIKE CONCAT('%(Submitted for Offer #', ?, ')%')
                    ORDER BY o.created_at DESC
                ");
                $db->bind('ii', $offer_id, $offer_id);
                $db->execute();
                $rows = $db->getRows();
                $db->close();
                Response::success($rows, 'Offer submissions fetched');
            } else {
                Response::error('Missing designer_id or offer_id', 400);
            }
        }
        elseif ($method === 'PUT' && count($segments) === 3 && $segments[2] === 'status') {
            $user = AuthMiddleware::verify();
            $sub_id = intval($segments[1]);
            $data = json_decode(file_get_contents('php://input'), true);
            $status = $data['status'] ?? '';

            if (!in_array($status, ['accepted', 'rejected'])) {
                Response::error('Invalid status. Must be accepted or rejected', 400);
            }

            $db = new Database();
            $db->prepare("SELECT user_id, description FROM offers WHERE id = ?");
            $db->bind('i', $sub_id);
            $db->execute();
            $sub = $db->getRow();
            if (!$sub) {
                $db->close();
                Response::error('Submission not found', 404);
            }
            $designer_id = $sub['user_id'];
            
            if (!preg_match('/\(Submitted for Offer #(\d+)\)/i', $sub['description'], $matches)) {
                $db->close();
                Response::error('Invalid submission format', 400);
            }
            $offer_id = intval($matches[1]);

            $db->prepare("SELECT user_id, title FROM offers WHERE id = ?");
            $db->bind('i', $offer_id);
            $db->execute();
            $parent = $db->getRow();
            if (!$parent || intval($parent['user_id']) !== intval($user['user_id'])) {
                $db->close();
                Response::error('Unauthorized to manage submissions for this offer', 403);
            }

            $db->prepare("UPDATE offer_applications SET status = ?, accepted_at = " . ($status === 'accepted' ? 'NOW()' : 'NULL') . " WHERE offer_id = ? AND user_id = ?");
            $db->bind('sii', $status, $offer_id, $designer_id);
            if ($db->execute()) {
                $notif = new Notification();
                $notif->create(
                    $designer_id,
                    'offer_update',
                    $status === 'accepted' ? 'Submission Accepted! 🎉' : 'Submission Update',
                    "Your design submission for the offer '" . addslashes($parent['title'] ?? '') . "' has been " . $status . "!",
                    '/again/#page-profile',
                    $offer_id
                );
                $db->close();
                Response::success(null, 'Submission status updated to ' . $status);
            } else {
                $db->close();
                Response::error('Failed to update submission status', 500);
            }
        }
        elseif ($method === 'DELETE' && count($segments) === 2) {
            $user = AuthMiddleware::verify();
            $sub_id = intval($segments[1]);

            $db = new Database();
            $db->prepare("SELECT user_id, description FROM offers WHERE id = ?");
            $db->bind('i', $sub_id);
            $db->execute();
            $sub = $db->getRow();
            if (!$sub) {
                $db->close();
                Response::error('Submission not found', 404);
            }
            
            if (intval($sub['user_id']) !== intval($user['user_id'])) {
                $db->close();
                Response::error('Unauthorized', 403);
            }

            if (!preg_match('/\(Submitted for Offer #(\d+)\)/i', $sub['description'], $matches)) {
                $db->close();
                Response::error('Invalid submission format', 400);
            }
            $offer_id = intval($matches[1]);

            $db->prepare("SELECT status FROM offers WHERE id = ?");
            $db->bind('i', $offer_id);
            $db->execute();
            $parent = $db->getRow();
            if (!$parent || $parent['status'] !== 'active') {
                $db->close();
                Response::error('Cannot cancel submission. The contest is closed.', 400);
            }

            $db->prepare("SELECT status FROM offer_applications WHERE offer_id = ? AND user_id = ?");
            $db->bind('ii', $offer_id, $user['user_id']);
            $db->execute();
            $app = $db->getRow();
            
            if ($app && $app['status'] !== 'applied') {
                $db->close();
                Response::error('Cannot cancel submission. It has already been accepted/rejected.', 400);
            }

            $db->prepare("DELETE FROM offers WHERE id = ?");
            $db->bind('i', $sub_id);
            $db->execute();

            $db->prepare("DELETE FROM offer_applications WHERE offer_id = ? AND user_id = ?");
            $db->bind('ii', $offer_id, $user['user_id']);
            $db->execute();

            $db->close();
            Response::success(null, 'Submission cancelled successfully');
        }
        else {
            Response::error('Submissions route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | VOTES ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'votes') {
 
        if ($method === 'POST' && count($segments) === 1) {
            $voteData = json_decode(file_get_contents('php://input'), true);
            if (!empty($voteData['offer_id'])) {
                OfferController::requireOfferActive((int)$voteData['offer_id']);
            }
            VoteController::vote();
        }
 
        elseif ($method === 'DELETE' && count($segments) === 2) {
            VoteController::deleteVote($segments[1]);
        }
 
        else {
            Response::error('Vote route not found', 404);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | COMMENTS ROUTES
    |--------------------------------------------------------------------------
    */

    elseif ($segments[0] === 'comments') {
        if ($method === 'DELETE' && count($segments) === 2) {
            CommentController::deleteComment($segments[1]);
        } else {
            Response::error('Comments route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | USER ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'user') {

        if (count($segments) < 2) {
            Response::error('User route not found', 404);
        }

        elseif ($method === 'GET' && $segments[1] === 'offers') {
            OfferController::getUserOffers();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'votes') {
            VoteController::getUserVotes();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'rewards') {
            if (count($segments) === 3 && $segments[2] === 'history') {
                UserController::getRewardHistory();
            } else {
                UserController::getRewards();
            }
        }
 
        elseif ($method === 'GET' && $segments[1] === 'wallet') {
            if (count($segments) === 3 && $segments[2] === 'transactions') {
                UserController::getWalletTransactions();
            } else {
                UserController::getWallet();
            }
        }
 
        elseif ($segments[1] === 'notifications') {
 
            if ($method === 'GET' && count($segments) === 2) {
                NotificationController::getNotifications();
            }
 
            elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'unread-count') {
                NotificationController::getUnreadCount();
            }
 
            elseif ($method === 'PUT' && count($segments) === 3 && $segments[2] === 'read-all') {
                NotificationController::markAllAsRead();
            }
 
            elseif ($method === 'PUT' && count($segments) === 4 && $segments[3] === 'read') {
                NotificationController::markAsRead($segments[2]);
            }
 
            elseif ($method === 'DELETE' && count($segments) === 3) {
                NotificationController::deleteNotification($segments[2]);
            }
 
            else {
                Response::error('Notification route not found', 404);
            }
        }
 
        elseif ($method === 'GET' && $segments[1] === 'dashboard') {
            AnalyticsController::getUserDashboard();
        }

        elseif ($method === 'GET' && count($segments) === 3 && $segments[1] === 'profile') {
            UserController::getById($segments[2]);
        }
        
        elseif (($method === 'PUT' || $method === 'POST') && count($segments) === 2 && $segments[1] === 'profile') {
            UserController::updateProfile();
        }

        elseif ($method === 'GET' && $segments[1] === 'activity') {
            AnalyticsController::getUserActivity();
        }

        elseif ($method === 'GET' && $segments[1] === 'applications') {
            $user = AuthMiddleware::verify();
            $db = new Database();
            $db->prepare("
                SELECT oa.*, o.title as offer_title, o.budget, o.deadline, o.description as offer_description,
                       u.full_name as client_name, u.username as client_username
                FROM offer_applications oa
                JOIN offers o ON oa.offer_id = o.id
                JOIN users u ON o.user_id = u.id
                WHERE oa.user_id = ?
                ORDER BY oa.created_at DESC
            ");
            $db->bind('i', $user['user_id']);
            $db->execute();
            $applications = $db->getRows();
            $db->close();
            Response::success($applications, 'User applications fetched');
        }

        elseif ($method === 'DELETE' && $segments[1] === 'applications' && count($segments) === 3) {
            $user = AuthMiddleware::verify();
            $offer_id = intval($segments[2]);
            
            $db = new Database();
            $db->prepare("DELETE FROM offer_applications WHERE offer_id = ? AND user_id = ?");
            $db->bind('ii', $offer_id, $user['user_id']);
            
            if ($db->execute()) {
                $db2 = new Database();
                $db2->prepare("DELETE FROM offers WHERE user_id = ? AND budget = 0 AND description LIKE ?");
                $suffix = "%(Submitted for Offer #" . $offer_id . ")";
                $db2->bind('is', $user['user_id'], $suffix);
                $db2->execute();
                $db2->close();
                
                Response::success(null, 'Participation cancelled successfully');
            } else {
                Response::error('Failed to cancel participation', 500);
            }
            $db->close();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'client-stats') {
            $user = AuthMiddleware::verify();
            $db = new Database();
            
            $db->prepare("
                SELECT 
                    COUNT(*) as total_offers,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_offers,
                    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as completed_offers,
                    COALESCE(SUM(budget), 0) as total_budget,
                    COALESCE(SUM(total_votes), 0) as total_votes,
                    COALESCE(AVG(vote_average), 0) as avg_rating
                FROM offers WHERE user_id = ?
            ");
            $db->bind('i', $user['user_id']);
            $db->execute();
            $stats = $db->getRow();
            
            $db->prepare("
                SELECT COUNT(*) as total_submissions
                FROM offer_applications oa
                JOIN offers o ON oa.offer_id = o.id
                WHERE o.user_id = ?
            ");
            $db->bind('i', $user['user_id']);
            $db->execute();
            $subRow = $db->getRow();
            $db->close();
            
            $totalSubs = intval($subRow['total_submissions'] ?? 0);
            $totalVotes = intval($stats['total_votes'] ?? 0);
            $avgEngagement = $totalSubs > 0 ? round(($totalVotes / $totalSubs) * 100, 1) : 0;
            
            Response::success([
                'total_offers'      => intval($stats['total_offers'] ?? 0),
                'active_offers'     => intval($stats['active_offers'] ?? 0),
                'completed_offers'  => intval($stats['completed_offers'] ?? 0),
                'total_budget'      => floatval($stats['total_budget'] ?? 0),
                'total_submissions' => $totalSubs,
                'total_votes'       => $totalVotes,
                'avg_engagement'    => $avgEngagement,
                'avg_rating'        => round(floatval($stats['avg_rating'] ?? 0), 1)
            ], 'Client stats retrieved');
        }
 
        else {
            Response::error('User route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | PUBLIC USER ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'users') {
 
        if ($method === 'GET' && count($segments) === 2 && $segments[1] !== 'leaderboard' && $segments[1] !== 'id') {
            UserController::getByUsername($segments[1]);
        }
 
        elseif ($method === 'GET' && count($segments) === 3 && $segments[1] === 'id') {
            UserController::getById($segments[2]);
        }
 
        elseif ($method === 'GET' && count($segments) === 3 && ($segments[2] === 'artworks' || $segments[2] === 'offers')) {
            UserController::getUserDesigns($segments[1]);
        }
 
        elseif ($method === 'GET' && $segments[1] === 'leaderboard') {
            UserController::getLeaderboard();
        }
 
        else {
            Response::error('Users route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | LEADERBOARD ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'leaderboard') {
 
        if ($segments[1] === 'designers') {
            RewardController::getDesignerLeaderboard();
        }
 
        elseif ($segments[1] === 'voters') {
            RewardController::getVoterLeaderboard();
        }
 
        else {
            Response::error('Leaderboard route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | REPORTS ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'reports') {
 
        if ($method === 'POST' && count($segments) === 1) {
            ModerationController::createReport();
        }
 
        else {
            Response::error('Reports route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | ADMIN ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'admin') {
 
        if ($method === 'GET' && $segments[1] === 'stats') {
            AdminController::getStats();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'users') {
            AdminController::getUsers();
        }
 
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[3] === 'block') {
            AdminController::blockUser($segments[2]);
        }

        elseif ($method === 'PUT' && count($segments) === 3 && $segments[1] === 'users') {
            AdminController::blockUser($segments[2]);
        }

        elseif ($method === 'PUT' && count($segments) === 4 && $segments[3] === 'free-publish') {
            AdminController::giveFrePublishAccess($segments[2]);
        }

        elseif ($method === 'DELETE' && count($segments) === 3 && $segments[1] === 'offers') {
            AdminController::deleteOffer($segments[2]);
        }

        elseif ($method === 'GET' && count($segments) === 2 && $segments[1] === 'offers') {
            // Replaced by AdminController::getAdminOffers() — includes pending + all statuses
            AdminController::getAdminOffers();
        }

        elseif ($method === 'POST' && count($segments) === 4 && $segments[1] === 'offers' && $segments[3] === 'approve') {
            OfferController::approveOffer($segments[2]);
        }

        elseif ($method === 'GET' && $segments[1] === 'activity') {
            AdminController::getActivity();
        }

        elseif ($method === 'POST' && count($segments) === 4 && $segments[3] === 'close-and-distribute') {
            RewardController::closeAndDistribute($segments[2]);
        }

        elseif ($method === 'POST' && count($segments) === 4 && $segments[3] === 'distribute-rewards') {
            RewardController::distributeRewardsManual($segments[2]);
        }
 
        elseif ($segments[1] === 'reports') {
 
            if ($method === 'GET' && count($segments) === 2) {
                ModerationController::getOpenReports();
            }
 
            elseif ($method === 'GET' && count($segments) === 3 && $segments[2] === 'stats') {
                ModerationController::getReportStats();
            }
 
            elseif ($method === 'GET' && count($segments) === 3) {
                ModerationController::getReport($segments[2]);
            }
 
            elseif ($method === 'PUT' && count($segments) === 3) {
                ModerationController::updateReportStatus($segments[2]);
            }
 
            else {
                Response::error('Admin reports route not found', 404);
            }
        }

        // DELETE user
        elseif ($method === 'DELETE' && count($segments) === 3 && $segments[1] === 'users') {
            AdminController::deleteUser($segments[2]);
        }

        // Toggle posting restriction
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[1] === 'users' && $segments[3] === 'posting') {
            AdminController::togglePostingRestriction($segments[2]);
        }

        // Hide/unhide offer
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[1] === 'offers' && $segments[3] === 'hide') {
            AdminController::hideOffer($segments[2]);
        }

        // Close offer
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[1] === 'offers' && $segments[3] === 'close') {
            AdminController::closeOffer($segments[2]);
        }

        // PUT /admin/offers/{id}/pause — pause an offer
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[1] === 'offers' && $segments[3] === 'pause') {
            AdminController::pauseOffer((int)$segments[2]);
        }

        // PUT /admin/offers/{id}/reopen — reopen a paused offer
        elseif ($method === 'PUT' && count($segments) === 4 && $segments[1] === 'offers' && $segments[3] === 'reopen') {
            AdminController::reopenOffer((int)$segments[2]);
        }

        // Submissions management
        elseif ($segments[1] === 'submissions') {
            if ($method === 'GET' && count($segments) === 2) {
                AdminController::getAllSubmissions();
            }
            elseif ($method === 'PUT' && count($segments) === 3) {
                AdminController::moderateSubmission($segments[2]);
            }
            elseif ($method === 'DELETE' && count($segments) === 3) {
                AdminController::deleteSubmission($segments[2]);
            }
            else {
                Response::error('Admin submissions route not found', 404);
            }
        }
 
        // Platform-wide settings
        elseif ($method === 'GET' && count($segments) === 3 && $segments[1] === 'platform' && $segments[2] === 'settings') {
            AdminController::getPlatformSettings();
        }

        // Toggle platform-wide offer creation
        elseif ($method === 'PUT' && count($segments) === 3 && $segments[1] === 'platform' && $segments[2] === 'offer-creation') {
            AdminController::togglePlatformOfferCreation();
        }

        // Toggle platform-wide submission creation
        elseif ($method === 'PUT' && count($segments) === 3 && $segments[1] === 'platform' && $segments[2] === 'submissions') {
            AdminController::togglePlatformSubmissions();
        }

        else {
            Response::error('Admin route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | ANALYTICS ROUTES
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'analytics') {
 
        if ($method === 'GET' && $segments[1] === 'platform') {
            AnalyticsController::getPlatformStats();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'trending-offers') {
            AnalyticsController::getTrendingOffers();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'top-designers') {
            AnalyticsController::getTopDesigners();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'top-voters') {
            AnalyticsController::getTopVoters();
        }
 
        elseif ($method === 'GET' && $segments[1] === 'activity-breakdown') {
            AnalyticsController::getActivityBreakdown();
        }
 
        else {
            Response::error('Analytics route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | AI ROUTES
    |--------------------------------------------------------------------------
    */
    elseif ($segments[0] === 'ai') {
        if ($method === 'POST' && count($segments) === 2 && $segments[1] === 'generate-description') {
            $user = AuthMiddleware::verify();
            
            $data = json_decode(file_get_contents('php://input'), true);
            $title = $data['title'] ?? '';
            $category = $data['category'] ?? '';
            
            if (!$title || !trim($title)) {
                Response::error('Title is required to generate description', 400);
            }
            
            $apiKey = defined('ANTHROPIC_API_KEY') ? ANTHROPIC_API_KEY : '';
            
            $systemPrompt = "You are a creative director for a design competition platform. Generate a compelling, specific, and inspiring offer description in 2-3 sentences based on the title. Be direct, professional, and exciting for designers. Language: match the title's language (Arabic/French/English). No fluff, no generic phrases.";
            
            $description = "";
            $success = false;
            
            if ($apiKey && $apiKey !== 'your-anthropic-api-key-here') {
                $url = 'https://api.anthropic.com/v1/messages';
                
                $headers = [
                    'Content-Type: application/json',
                    'x-api-key: ' . $apiKey,
                    'anthropic-version: 2023-06-01'
                ];
                
                $postData = [
                    'model' => 'claude-sonnet-4-20250514',
                    'max_tokens' => 300,
                    'system' => $systemPrompt,
                    'messages' => [
                        [
                            'role' => 'user',
                            'content' => "Contest title: \"$title\". Category: \"$category\"."
                        ]
                    ]
                ];
                
                $ch = curl_init($url);
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($httpCode === 200) {
                    $resDecoded = json_decode($response, true);
                    if (isset($resDecoded['content'][0]['text'])) {
                        $description = trim($resDecoded['content'][0]['text']);
                        $success = true;
                    }
                } else {
                    error_log("Anthropic API Error (Code $httpCode): " . $response);
                }
            }
            
            if (!$success) {
                $isArabic = preg_match('/\p{Arabic}/u', $title);
                $isFrench = preg_match('/\b(de|le|la|les|pour|conception|logo)\b/i', $title);
                
                if ($isArabic) {
                    $description = "نحن نبحث عن مصمم مبدع لابتكار " . htmlspecialchars($title) . " مميز وعصري. يجب أن يعكس التصميم رؤية المشروع ويلهم الفئة المستهدفة بشكل احترافي. انضم إلينا وقدم أفضل ما لديك للفوز بالمسابقة!";
                } elseif ($isFrench) {
                    $description = "Nous recherchons un designer talentueux pour créer un design exceptionnel de \"" . htmlspecialchars($title) . "\". Le concept doit être moderne, épuré et refléter l'identité professionnelle de notre marque. Participez dès maintenant et remportez le prix !";
                } else {
                    $description = "We are seeking a talented designer to create a stunning, high-quality concept for \"" . htmlspecialchars($title) . "\". The design must be modern, memorable, and elevate our brand identity. Submit your best work to stand out and win the reward pool!";
                }
                $success = true;
            }
            
            Response::success(['description' => $description], 'Description generated successfully');
        } else {
            Response::error('AI route not found', 404);
        }
    }
 
    /*
    |--------------------------------------------------------------------------
    | HEALTH CHECK
    |--------------------------------------------------------------------------
    */
 
    elseif ($segments[0] === 'health') {
        Response::success(['status' => 'ok'], 'API is running');
    }
 
    /*
    |--------------------------------------------------------------------------
    | DEFAULT
    |--------------------------------------------------------------------------
    */
 
    else {
        Response::error('Route not found', 404);
    }
 
} catch (Throwable $e) {
    if (DEBUG_MODE) {
        Response::error($e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine(), 500);
    } else {
        Response::error('Internal server error', 500);
    }
}
?>
