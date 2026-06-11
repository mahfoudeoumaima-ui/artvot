
CREATE DATABASE IF NOT EXISTS artvot_db;
USE artvot_db;

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- =========================
-- USERS
-- =========================

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) DEFAULT NULL,
    roles JSON DEFAULT ('["voter"]'),
    is_blocked TINYINT(1) DEFAULT 0,
    posting_restricted TINYINT(1) DEFAULT 0,
    has_free_publish TINYINT(1) DEFAULT 0,
    wallet_balance DECIMAL(12,2) DEFAULT 0.00,
    total_earned DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================
-- USER PROFILES
-- =========================

CREATE TABLE user_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    bio TEXT DEFAULT NULL,
    avatar_url VARCHAR(255) DEFAULT NULL,
    banner_url VARCHAR(255) DEFAULT NULL,
    location VARCHAR(120) DEFAULT NULL,
    website VARCHAR(255) DEFAULT NULL,
    social_links JSON DEFAULT NULL,
    payout_method VARCHAR(50) DEFAULT 'crypto',
    wallet_address VARCHAR(255) DEFAULT NULL,
    theme VARCHAR(20) DEFAULT 'dark',
    language VARCHAR(10) DEFAULT 'en',
    ui_preferences JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_profile_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- OFFERS
-- =========================

CREATE TABLE offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description LONGTEXT,
    budget DECIMAL(12,2) NOT NULL,
    deadline DATE DEFAULT NULL,
    package_type ENUM('basic','premium','featured') DEFAULT 'basic',
    duration_days INT DEFAULT 3,
    tags VARCHAR(500) DEFAULT NULL,
    status ENUM('active','pending_payment','closed','deleted') DEFAULT 'active',
    is_approved TINYINT(1) DEFAULT 0,
    is_hidden TINYINT(1) DEFAULT 0,
    approval_date DATETIME DEFAULT NULL,
    requires_payment TINYINT(1) DEFAULT 1,
    payment_status ENUM('pending','paid','free') DEFAULT 'pending',
    reference_images JSON DEFAULT NULL,
    vote_average DECIMAL(3,1) DEFAULT 0.0,
    total_votes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_offer_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE FULLTEXT INDEX ft_offer_search
ON offers(title, description);



-- =========================
-- VOTES
-- =========================

CREATE TABLE votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    offer_id INT NOT NULL,
    user_id INT NOT NULL,
    score INT NOT NULL CHECK(score >= 1 AND score <= 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_vote (offer_id, user_id),

    CONSTRAINT fk_vote_offer
    FOREIGN KEY (offer_id) REFERENCES offers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_vote_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- FOLLOWERS
-- =========================

CREATE TABLE followers (
    follower_id INT NOT NULL,
    followed_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY(follower_id, followed_id),

    CONSTRAINT fk_follower_user
    FOREIGN KEY (follower_id) REFERENCES users(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_followed_user
    FOREIGN KEY (followed_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- NOTIFICATIONS
-- =========================

CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM(
        'reward',
        'offer_approved',
        'artwork_voted',
        'offer_update',
        'report_action',
        'new_offer',
        'comment',
        'follow',
        'system'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message LONGTEXT DEFAULT NULL,
    related_offer_id INT DEFAULT NULL,
    related_artwork_id INT DEFAULT NULL,
    related_user_id INT DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    action_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME DEFAULT NULL,

    CONSTRAINT fk_notification_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- COMMENTS
-- =========================

CREATE TABLE comments (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    offer_id     INT  NOT NULL,
    user_id      INT  NOT NULL,
    comment_text TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_comment_offer
        FOREIGN KEY (offer_id) REFERENCES offers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comment_user
        FOREIGN KEY (user_id)  REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_comment_offer (offer_id),
    INDEX idx_comment_user  (user_id)
);

-- =========================
-- OFFER APPLICATIONS
-- =========================

CREATE TABLE offer_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    offer_id INT NOT NULL,
    user_id INT NOT NULL,
    message TEXT DEFAULT NULL,
    status ENUM('applied','accepted','rejected','completed') DEFAULT 'applied',
    accepted_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_application (offer_id, user_id),

    CONSTRAINT fk_application_offer
    FOREIGN KEY (offer_id) REFERENCES offers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_application_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- OFFER RESULTS
-- =========================

CREATE TABLE offer_results (
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

    CONSTRAINT fk_result_offer
    FOREIGN KEY (offer_id) REFERENCES offers(id)
    ON DELETE CASCADE
);

-- =========================
-- REPORTS
-- =========================

CREATE TABLE reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reported_user_id INT DEFAULT NULL,
    offer_id INT DEFAULT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    description LONGTEXT DEFAULT NULL,
    status ENUM(
        'open',
        'under_review',
        'resolved',
        'dismissed'
    ) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- REWARDS
-- =========================

CREATE TABLE rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    artwork_id INT DEFAULT NULL,
    offer_id INT DEFAULT NULL,
    user_id INT DEFAULT NULL,
    amount DECIMAL(12,2) DEFAULT 0.00,
    type ENUM('designer','voter','admin') NOT NULL,
    status ENUM('pending','processed','claimed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reward_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- PAYMENTS
-- =========================

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    offer_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT NULL,
    transaction_id VARCHAR(255) UNIQUE,
    status ENUM(
        'pending',
        'completed',
        'failed',
        'refunded'
    ) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_offer
    FOREIGN KEY (offer_id) REFERENCES offers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_payment_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- WALLET TRANSACTIONS
-- =========================

CREATE TABLE wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    offer_id INT DEFAULT NULL,
    artwork_id INT DEFAULT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type ENUM(
        'reward_designer',
        'reward_voter',
        'withdrawal',
        'refund',
        'admin_transfer',
        'payment'
    ) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    status ENUM(
        'pending',
        'completed',
        'failed'
    ) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wallet_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- =========================
-- ACTIVITY LOG
-- =========================

CREATE TABLE activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action_type VARCHAR(100) NOT NULL,
    entity_type ENUM(
        'user',
        'offer',
        'artwork',
        'vote',
        'reward',
        'report'
    ) NOT NULL,
    entity_id INT DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_activity_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

-- =========================
-- SAMPLE DATA
-- =========================

INSERT INTO users (
    username,
    email,
    password,
    full_name,
    roles
) VALUES
(
    'admin',
    'admin@artvot.com',
    '$2y$12$tPJ5tEVnwQA8WV/tTy6vA..LhsxdJETylcRHD.1JpQKJyCSFVKYOG',
    'Admin User',
    '["admin","client","voter"]'
),
(
    'designer',
    'designer@artvot.com',
    '$2y$12$G3shSmfv3iUH7L2WzOKuP.HaFk/7fJLLuyBkY4fi6ny0e61.vDsly',
    'Art Designer',
    '["designer","voter"]'
);

INSERT INTO offers (
    user_id,
    title,
    description,
    budget,
    deadline,
    package_type,
    status,
    is_approved
) VALUES (
    1,
    'Logo Design Contest',
    'Design a modern logo for startup.',
    500.00,
    '2026-06-01',
    'basic',
    'active',
    1
);

-- Insert design submission as an offer with description suffix indicating it's a submission
INSERT INTO offers (
    user_id,
    title,
    description,
    budget,
    deadline,
    package_type,
    status,
    is_approved,
    reference_images
) VALUES (
    2,
    'Modern Logo',
    'Minimal modern logo concept. (Submitted for Offer #1)',
    0.00,
    '2026-06-08',
    'basic',
    'active',
    1,
    '["https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&q=80&w=800"]'
);

-- Insert into offer_applications to record application status
INSERT INTO offer_applications (
    offer_id,
    user_id,
    message,
    status,
    accepted_at
) VALUES (
    1,
    2,
    'Minimal brand concept',
    'accepted',
    NOW()
);

-- =========================
-- PASSWORD RESETS
-- =========================

CREATE TABLE password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) DEFAULT 0,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reset_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

    INDEX idx_token_hash (token_hash),
    INDEX idx_expires (expires_at)
);

-- Moderation columns (run these manually if tables already exist)
-- ALTER TABLE users ADD COLUMN posting_restricted TINYINT(1) DEFAULT 0 AFTER is_blocked;
-- ALTER TABLE offers ADD COLUMN is_hidden TINYINT(1) DEFAULT 0 AFTER is_approved;

COMMIT;
