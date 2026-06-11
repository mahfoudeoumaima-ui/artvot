<?php
/**
 * ARTVOT - Configuration File
 * Updated: Added Google OAuth 2.0 + Facebook OAuth credentials
 */

define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'artvot_db');
define('DB_PORT', 3306);

define('APP_NAME', 'ARTVOT');
define('APP_VERSION', '1.0.0');
define('APP_URL', 'http://localhost/again');
define('API_URL', APP_URL . '/api');

define('DEBUG_MODE', true);

// ⚠️  SECURITY: Change this secret before deploying to production!
//    Use a random 64-char string: php -r "echo bin2hex(random_bytes(32));"
define('JWT_SECRET', 'your-super-secret-key-change-this-in-production-12345');
define('JWT_EXPIRATION', 86400 * 7);
define('JWT_ALGORITHM', 'HS256');

define('BCRYPT_COST', 12);
define('SESSION_TIMEOUT', 3600);

define('UPLOAD_DIR', __DIR__ . '/../../api/uploads/');
define('MAX_FILE_SIZE', 50 * 1024 * 1024);
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'zip', 'rar', 'ai', 'psd']);

define('MAIL_FROM', 'noreply@artvot.com');
define('MAIL_SMTP_HOST', 'smtp.gmail.com');
define('MAIL_SMTP_PORT', 587);
define('MAIL_SMTP_USER', 'your-email@gmail.com');
define('MAIL_SMTP_PASS', 'your-app-password');

define('STRIPE_SECRET', 'sk_test_your_stripe_key');
define('STRIPE_PUBLIC', 'pk_test_your_stripe_key');
define('ANTHROPIC_API_KEY', 'your-anthropic-api-key-here');

// ── Google OAuth 2.0 ─────────────────────────────────────────────────────────
// To get these: https://console.cloud.google.com/apis/credentials
define('GOOGLE_CLIENT_ID',     '');
define('GOOGLE_CLIENT_SECRET', '');
// Adjust GOOGLE_REDIRECT_URI when deploying to production:
//   Production:  'https://artvot.com/again/api/auth/google/callback'
define('GOOGLE_REDIRECT_URI',  APP_URL . '/api/auth/google/callback');
// ─────────────────────────────────────────────────────────────────────────────

// ── Facebook OAuth 2.0 ───────────────────────────────────────────────────────
// To get these: https://developers.facebook.com/apps/
define('FACEBOOK_APP_ID',      '');
define('FACEBOOK_APP_SECRET',  '');
// Adjust FACEBOOK_REDIRECT_URI when deploying to production:
//   Production:  'https://artvot.com/again/api/auth/facebook/callback'
define('FACEBOOK_REDIRECT_URI', APP_URL . '/api/auth/facebook/callback');
// ─────────────────────────────────────────────────────────────────────────────

define('ADMIN_REWARD_PERCENTAGE', 5);
define('DESIGNER_REWARD_PERCENTAGE', 70);
define('VOTER_REWARD_PERCENTAGE', 25);

if (DEBUG_MODE) {
    error_reporting(E_ALL);
    ini_set('display_errors', 0); // keep OFF — errors go to log not response
    ini_set('log_errors', 1);
    ini_set('error_log', __DIR__ . '/error.log');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', __DIR__ . '/error.log');
}
?>
