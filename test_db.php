<?php
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'type' => 'fatal_error_shutdown',
            'error' => $error
        ], JSON_PRETTY_PRINT);
    }
});

require_once 'backend/config/config.php';
require_once 'backend/config/database.php';
require_once 'backend/models/User.php';
require_once 'backend/models/Offer.php';
require_once 'backend/models/Vote.php';
require_once 'backend/models/Reward.php';

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');

$results = [
    'test_run_at' => date('c'),
    'steps' => [],
    'assertions' => [],
    'success' => true
];

try {
    $db = new Database();

    // ==========================================
    // STEP 0: SELF-HEALING DATABASE MIGRATIONS
    // ==========================================
    $db->prepare("
        CREATE TABLE IF NOT EXISTS offer_applications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            offer_id INT NOT NULL,
            user_id INT NOT NULL,
            message TEXT DEFAULT NULL,
            status ENUM('applied','accepted','rejected','completed') DEFAULT 'applied',
            accepted_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_application (offer_id, user_id),
            CONSTRAINT fk_application_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
            CONSTRAINT fk_application_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    $db->execute();

    $db->prepare("
        CREATE TABLE IF NOT EXISTS offer_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            offer_id INT NOT NULL UNIQUE,
            winning_artwork_id INT DEFAULT NULL,
            winning_user_id INT DEFAULT NULL,
            total_budget DECIMAL(12,2) NOT NULL,
            admin_fee DECIMAL(12,2) DEFAULT 0.00,
            designer_pool_distributed DECIMAL(12,2) DEFAULT 0.00,
            voter_pool_distributed DECIMAL(12,2) DEFAULT 0.00,
            total_votes INT DEFAULT 0,
            completed_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_result_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    $db->execute();

    $db->prepare("
        CREATE TABLE IF NOT EXISTS comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            offer_id INT NOT NULL,
            user_id INT NOT NULL,
            comment_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_comment_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
            CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    $db->execute();

    // Check and add read_at column if not exists
    $db->prepare("DESCRIBE notifications");
    $db->execute();
    $notif_cols = array_column($db->getRows(), 'Field');
    if (!in_array('read_at', $notif_cols)) {
        $db->prepare("ALTER TABLE notifications ADD COLUMN read_at DATETIME DEFAULT NULL");
        $db->execute();
    }

    // Check and self-heal offers table columns (vote_average, total_votes)
    $db->prepare("DESCRIBE offers");
    $db->execute();
    $offers_cols = array_column($db->getRows(), 'Field');
    if (!in_array('vote_average', $offers_cols)) {
        $db->prepare("ALTER TABLE offers ADD COLUMN vote_average DECIMAL(3,1) DEFAULT 0.0");
        $db->execute();
    }
    if (!in_array('total_votes', $offers_cols)) {
        $db->prepare("ALTER TABLE offers ADD COLUMN total_votes INT DEFAULT 0");
        $db->execute();
    }

    // Ensure winning_artwork_id / artwork_id columns are nullable for the consolidated architecture
    try {
        $db->prepare("ALTER TABLE offer_results MODIFY COLUMN winning_artwork_id INT DEFAULT NULL");
        $db->execute();
    } catch (Exception $e) {}
    try {
        $db->prepare("ALTER TABLE rewards MODIFY COLUMN artwork_id INT DEFAULT NULL");
        $db->execute();
    } catch (Exception $e) {}
    try {
        $db->prepare("ALTER TABLE wallet_transactions MODIFY COLUMN artwork_id INT DEFAULT NULL");
        $db->execute();
    } catch (Exception $e) {}

    // Check and self-heal votes table columns (artwork_id -> offer_id)
    $db->prepare("DESCRIBE votes");
    $db->execute();
    $votes_cols = array_column($db->getRows(), 'Field');
    if (in_array('artwork_id', $votes_cols) && !in_array('offer_id', $votes_cols)) {
        try {
            $db->prepare("ALTER TABLE votes DROP INDEX unique_vote");
            $db->execute();
        } catch (Exception $e) {}
        try {
            $db->prepare("ALTER TABLE votes DROP FOREIGN KEY fk_vote_artwork");
            $db->execute();
        } catch (Exception $e) {}
        try {
            $db->prepare("ALTER TABLE votes DROP FOREIGN KEY votes_ibfk_1");
            $db->execute();
        } catch (Exception $e) {}
        
        $db->prepare("ALTER TABLE votes CHANGE COLUMN artwork_id offer_id INT NOT NULL");
        $db->execute();
        
        try {
            $db->prepare("ALTER TABLE votes ADD CONSTRAINT fk_vote_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE");
            $db->execute();
        } catch (Exception $e) {}
        try {
            $db->prepare("ALTER TABLE votes ADD UNIQUE KEY unique_vote (offer_id, user_id)");
            $db->execute();
        } catch (Exception $e) {}
    }

    $results['steps'][] = 'Database schema self-healed (created offer_applications and offer_results if missing, updated votes columns).';

    // ==========================================
    // STEP 1: CLEANUP PRIOR TEST RUN RECORDS
    // ==========================================
    $db->prepare("DELETE FROM votes WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM wallet_transactions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM offer_results WHERE offer_id IN (SELECT id FROM offers WHERE title LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM offer_applications WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%') OR offer_id IN (SELECT id FROM offers WHERE title LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM rewards WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%') OR offer_id IN (SELECT id FROM offers WHERE title LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM offers WHERE title LIKE 'test_%' OR user_id IN (SELECT id FROM users WHERE username LIKE 'test_%')");
    $db->execute();

    $db->prepare("DELETE FROM users WHERE username LIKE 'test_%'");
    $db->execute();

    $results['steps'][] = 'Successfully purged prior test execution records from the database.';

    // ==========================================
    // STEP 2: CREATE TEST USERS AND ASSIGN ROLES
    // ==========================================
    $userModel = new User();

    // Create client
    $res = $userModel->create('test_client_user', 'client@test.com', 'testpassword', 'Test Client');
    if (!$res['success']) throw new Exception('Failed to create test_client_user: ' . $res['message']);
    $client_id = $res['user_id'];
    $userModel->addRole($client_id, 'client');

    // Create designer 1
    $res = $userModel->create('test_designer_user_1', 'designer1@test.com', 'testpassword', 'Test Designer One');
    if (!$res['success']) throw new Exception('Failed to create test_designer_user_1: ' . $res['message']);
    $d1_id = $res['user_id'];
    $userModel->addRole($d1_id, 'designer');

    // Create designer 2
    $res = $userModel->create('test_designer_user_2', 'designer2@test.com', 'testpassword', 'Test Designer Two');
    if (!$res['success']) throw new Exception('Failed to create test_designer_user_2: ' . $res['message']);
    $d2_id = $res['user_id'];
    $userModel->addRole($d2_id, 'designer');

    // Create voter 1
    $res = $userModel->create('test_voter_user_1', 'voter1@test.com', 'testpassword', 'Test Voter One');
    if (!$res['success']) throw new Exception('Failed to create test_voter_user_1: ' . $res['message']);
    $v1_id = $res['user_id'];
    $userModel->addRole($v1_id, 'voter');

    // Create voter 2
    $res = $userModel->create('test_voter_user_2', 'voter2@test.com', 'testpassword', 'Test Voter Two');
    if (!$res['success']) throw new Exception('Failed to create test_voter_user_2: ' . $res['message']);
    $v2_id = $res['user_id'];
    $userModel->addRole($v2_id, 'voter');

    $results['steps'][] = 'Created test client, 2 test designers, and 2 test voters with correct roles.';

    // ==========================================
    // STEP 3: FUND CLIENT WALLET & CREATE OFFER
    // ==========================================
    $userModel->addBalance($client_id, 1000.00, 'payment', 'Funding contest budget');

    $offerModel = new Offer();
    $offer_res = $offerModel->create($client_id, 'test_offer_contest', 'Complete identity design for startup.', 1000.00, '2026-06-30', 'premium', 3, 'logo,startup', false);
    if (!$offer_res['success']) throw new Exception('Failed to create test offer');
    $offer_id = $offer_res['offer_id'];

    // Approve the offer
    $offerModel->approve($offer_id);
    $results['steps'][] = "Created and approved test_offer_contest (ID: {$offer_id}) with $1000 budget.";

    // ==========================================
    // STEP 4: SUBMIT APPLICATIONS (DESIGNERS ACCEPT CONTEST)
    // ==========================================
    $db->prepare("INSERT INTO offer_applications (offer_id, user_id, message, status, accepted_at) VALUES (?, ?, 'Minimal brand concept', 'accepted', NOW())");
    $db->bind('ii', $offer_id, $d1_id);
    if (!$db->execute()) throw new Exception('Failed Designer 1 application submission');

    $db->prepare("INSERT INTO offer_applications (offer_id, user_id, message, status, accepted_at) VALUES (?, ?, 'Vibrant brand concept', 'accepted', NOW())");
    $db->bind('ii', $offer_id, $d2_id);
    if (!$db->execute()) throw new Exception('Failed Designer 2 application submission');

    $results['steps'][] = "Submitted 2 designer contest applications (Designer 1: ID {$d1_id}, Designer 2: ID {$d2_id}).";

    // ==========================================
    // STEP 5: CAST VOTES DIRECTLY ON THE OFFER
    // ==========================================
    $voteModel = new Vote();

    // cast votes for the offer
    $voteModel->vote($v1_id, $offer_id, 8);
    $voteModel->vote($v2_id, $offer_id, 10);

    $results['steps'][] = 'Casted votes directly on offer: Voter 1 (score 8), Voter 2 (score 10).';

    // Verify stats on the offer
    $offer = $offerModel->getById($offer_id);
    $total_votes = intval($offer['total_votes']);
    $vote_average = floatval($offer['vote_average']);

    $results['assertions'][] = [
        'check' => 'Offer vote statistics',
        'expected' => ['votes' => 2, 'average' => 9.0],
        'actual' => ['votes' => $total_votes, 'average' => $vote_average],
        'pass' => ($total_votes === 2 && $vote_average == 9.0)
    ];

    // ==========================================
    // STEP 6: CLOSE & DISTRIBUTE REWARDS
    // ==========================================
    $dist_res = $offerModel->closeAndDistribute($offer_id);
    if (!$dist_res['success']) {
        throw new Exception('Distribution failed: ' . $dist_res['message']);
    }
    $results['steps'][] = 'Offer successfully closed and rewards distributed.';

    // ==========================================
    // STEP 7: VALIDATE CALCULATIONS AND WALLETS
    // ==========================================
    $client_bal_final = $userModel->getBalance($client_id);
    $d1_bal_final = $userModel->getBalance($d1_id);
    $d2_bal_final = $userModel->getBalance($d2_id);
    $v1_bal_final = $userModel->getBalance($v1_id);
    $v2_bal_final = $userModel->getBalance($v2_id);

    // Theoretical payout breakdown ($1000 budget):
    // Admin Fee = 5% ($50)
    // Designer Pool = 70% ($700) -> split equally among the 2 designers = $350 each
    // Voter Pool = 25% ($250) -> split equally among the 2 voters = $125 each

    $expected_designer_1 = 350.00;
    $expected_designer_2 = 350.00;
    $expected_voter_1 = 125.00;
    $expected_voter_2 = 125.00;

    $pass_d1 = (abs($d1_bal_final - $expected_designer_1) < 0.05);
    $pass_d2 = (abs($d2_bal_final - $expected_designer_2) < 0.05);
    $pass_v1 = (abs($v1_bal_final - $expected_voter_1) < 0.05);
    $pass_v2 = (abs($v2_bal_final - $expected_voter_2) < 0.05);

    $results['assertions'][] = [
        'check' => 'Designer 1 reward split (70% pool, split equally)',
        'expected' => $expected_designer_1,
        'actual' => $d1_bal_final,
        'pass' => $pass_d1
    ];

    $results['assertions'][] = [
        'check' => 'Designer 2 reward split (70% pool, split equally)',
        'expected' => $expected_designer_2,
        'actual' => $d2_bal_final,
        'pass' => $pass_d2
    ];

    $results['assertions'][] = [
        'check' => 'Voter 1 voter split (25% pool, split between 2 voters)',
        'expected' => $expected_voter_1,
        'actual' => $v1_bal_final,
        'pass' => $pass_v1
    ];

    $results['assertions'][] = [
        'check' => 'Voter 2 voter split (25% pool, split between 2 voters)',
        'expected' => $expected_voter_2,
        'actual' => $v2_bal_final,
        'pass' => $pass_v2
    ];

    // ==========================================
    // STEP 8: CHECK AUDIT TRAIL RECORDS
    // ==========================================
    $db->prepare("SELECT * FROM offer_results WHERE offer_id = ?");
    $db->bind('i', $offer_id);
    $db->execute();
    $result_record = $db->getRow();

    $results['assertions'][] = [
        'check' => 'Offer result audit trail record creation',
        'expected' => 'Found entry',
        'actual' => $result_record ? 'Found entry' : 'Not found',
        'pass' => ($result_record !== null)
    ];

    if ($result_record) {
        $results['assertions'][] = [
            'check' => 'Result record - admin fee distribution match',
            'expected' => 50.00,
            'actual' => floatval($result_record['admin_fee']),
            'pass' => (floatval($result_record['admin_fee']) == 50.00)
        ];
    }

    // Check if any check failed
    foreach ($results['assertions'] as $assertion) {
        if (!$assertion['pass']) {
            $results['success'] = false;
        }
    }

    echo json_encode($results, JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(200);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString(),
        'timestamp' => date('c')
    ], JSON_PRETTY_PRINT);
}
?>
