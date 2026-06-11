<?php
/**
 * ARTVOT – Google OAuth Callback Handler
 * File location: /backend/controllers/GoogleAuthController.php
 *
 * Called by index.php router when:
 *   GET  /auth/google          → redirect user to Google
 *   GET  /auth/google/callback → handle code exchange
 */

class GoogleAuthController {

    // ── Config ─────────────────────────────────────────────
    private static function cfg(): array {
        return [
            'client_id'     => defined('GOOGLE_CLIENT_ID')     ? GOOGLE_CLIENT_ID     : '',
            'client_secret' => defined('GOOGLE_CLIENT_SECRET') ? GOOGLE_CLIENT_SECRET : '',
            'redirect_uri'  => defined('GOOGLE_REDIRECT_URI')  ? GOOGLE_REDIRECT_URI  : '',
        ];
    }

    // ── Step 1: Redirect to Google ──────────────────────────
    public static function redirect(): void {
        $cfg   = self::cfg();
        $state = bin2hex(random_bytes(16));

        // Store state in a short-lived cookie so callback can verify it
        setcookie('google_oauth_state', $state, time() + 300, '/', '', false, true);

        $params = http_build_query([
            'client_id'     => $cfg['client_id'],
            'redirect_uri'  => $cfg['redirect_uri'],
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'access_type'   => 'online',
            'state'         => $state,
            'prompt'        => 'select_account',
        ]);

        header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params);
        exit;
    }

    // ── Step 2: Handle Callback ─────────────────────────────
    public static function callback(): void {
        $code  = $_GET['code']  ?? '';
        $state = $_GET['state'] ?? '';
        $error = $_GET['error'] ?? '';

        // ── Error from Google ──
        if ($error) {
            self::redirectToLogin('google_error=' . urlencode($error));
        }

        // ── State validation ──
        $storedState = $_COOKIE['google_oauth_state'] ?? '';
        if (!$state || !hash_equals($storedState, $state)) {
            self::redirectToLogin('google_error=invalid_state');
        }
        // Clear state cookie
        setcookie('google_oauth_state', '', time() - 3600, '/');

        // ── Exchange code for token ──
        $cfg    = self::cfg();
        $tokens = self::exchangeCode($code, $cfg);

        if (!$tokens || empty($tokens['access_token'])) {
            self::redirectToLogin('google_error=token_exchange_failed');
        }

        // ── Fetch user info from Google ──
        $googleUser = self::fetchGoogleUser($tokens['access_token']);

        if (!$googleUser || empty($googleUser['email'])) {
            self::redirectToLogin('google_error=user_fetch_failed');
        }

        // ── Upsert user in DB and issue JWT ──
        $result = self::upsertUser($googleUser);

        if (!$result['success']) {
            self::redirectToLogin('google_error=' . urlencode($result['message'] ?? 'db_error'));
        }

        // ── Redirect to frontend with token in query param ──
        // Frontend JS reads this param, stores it in localStorage, then cleans URL.
        $appUrl = defined('APP_URL') ? APP_URL : '';
        header('Location: ' . $appUrl . '/login.html?google_token=' . urlencode($result['token'])
             . '&google_user=' . urlencode(json_encode($result['user'])));
        exit;
    }

    // ── Exchange authorization code for tokens ──────────────
    private static function exchangeCode(string $code, array $cfg): ?array {
        $postData = http_build_query([
            'code'          => $code,
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'redirect_uri'  => $cfg['redirect_uri'],
            'grant_type'    => 'authorization_code',
        ]);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $postData,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        $resp = curl_exec($ch);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            error_log('Google token exchange cURL error: ' . $err);
            return null;
        }

        $data = json_decode($resp, true);
        return is_array($data) ? $data : null;
    }

    // ── Fetch Google user profile ───────────────────────────
    private static function fetchGoogleUser(string $accessToken): ?array {
        $ch = curl_init('https://www.googleapis.com/oauth2/v3/userinfo');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        $resp = curl_exec($ch);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) {
            error_log('Google userinfo cURL error: ' . $err);
            return null;
        }

        $data = json_decode($resp, true);
        return is_array($data) ? $data : null;
    }

    // ── Create or fetch user, return JWT ───────────────────
    private static function upsertUser(array $googleUser): array {
        $email     = filter_var($googleUser['email'] ?? '', FILTER_VALIDATE_EMAIL);
        $name      = trim($googleUser['name'] ?? '');
        $avatarUrl = $googleUser['picture'] ?? null;
        $googleId  = $googleUser['sub'] ?? '';

        if (!$email) {
            return ['success' => false, 'message' => 'invalid_email'];
        }

        $db = new Database();

        // ── Check if user already exists (by email) ──
        $db->prepare('SELECT id, username, email, full_name, roles, is_blocked, wallet_balance FROM users WHERE email = ?');
        $db->bind('s', $email);
        $db->execute();
        $user = $db->getRow();

        if ($user) {
            // ── Existing user ──
            if ($user['is_blocked']) {
                $db->close();
                return ['success' => false, 'message' => 'account_blocked'];
            }
            $userId = $user['id'];

            // Optionally update avatar if not set
            $db->prepare('UPDATE user_profiles SET avatar_url = ? WHERE user_id = ? AND avatar_url IS NULL');
            $db->bind('si', $avatarUrl, $userId);
            $db->execute();

        } else {
            // ── New user — auto-create account ──
            // Generate a unique username from name or email
            $baseUsername = strtolower(preg_replace('/[^a-z0-9]/i', '', explode('@', $email)[0]));
            $baseUsername = $baseUsername ?: 'user';
            $username     = $baseUsername;
            $suffix       = 1;

            while (true) {
                $db->prepare('SELECT id FROM users WHERE username = ?');
                $db->bind('s', $username);
                $db->execute();
                if (!$db->getRow()) break;
                $username = $baseUsername . $suffix++;
            }

            // Random strong password (user cannot login with password — Google only)
            $randomPassword = password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);

            $db->prepare('INSERT INTO users (username, email, password, full_name, roles) VALUES (?, ?, ?, ?, ?)');
            $db->bind('sssss', $username, $email, $randomPassword, $name, '["voter"]');
            $db->execute();
            $userId = $db->lastInsertId();

            // Create user profile with Google avatar
            $db->prepare('INSERT INTO user_profiles (user_id, avatar_url) VALUES (?, ?)');
            $db->bind('is', $userId, $avatarUrl);
            $db->execute();

            // Re-fetch the full user row
            $db->prepare('SELECT id, username, email, full_name, roles, is_blocked, wallet_balance FROM users WHERE id = ?');
            $db->bind('i', $userId);
            $db->execute();
            $user = $db->getRow();
        }

        $db->close();

        // ── Decode roles ──
        $roles = json_decode($user['roles'] ?? '["voter"]', true) ?: ['voter'];

        // ── Build JWT payload — identical structure to AuthController::login() ──
        $payload = [
            'user_id'  => (int)$user['id'],
            'email'    => $user['email'],
            'username' => $user['username'],
            'roles'    => $roles,
        ];

        $token = JWT::generate($payload);

        $userPublic = [
            'id'             => (int)$user['id'],
            'user_id'        => (int)$user['id'],
            'username'       => $user['username'],
            'email'          => $user['email'],
            'full_name'      => $user['full_name'],
            'roles'          => $roles,
            'wallet_balance' => (float)$user['wallet_balance'],
            'avatar_url'     => $avatarUrl,
        ];

        return [
            'success' => true,
            'token'   => $token,
            'user'    => $userPublic,
        ];
    }

    // ── Helper: redirect to login page with error ───────────
    private static function redirectToLogin(string $query): void {
        $appUrl = defined('APP_URL') ? APP_URL : '';
        header('Location: ' . $appUrl . '/login.html?' . $query);
        exit;
    }
}
