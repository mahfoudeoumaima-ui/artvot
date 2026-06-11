<?php
/**
 * ARTVOT – FacebookAuthController
 * Mirrors: GoogleAuthController
 *
 * Static methods called directly by the router:
 *   FacebookAuthController::redirect()   →  GET /auth/facebook
 *   FacebookAuthController::callback()   →  GET /auth/facebook/callback
 */

class FacebookAuthController {

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Redirect to login page with a facebook_error param.
     * Mirrors the google_error= pattern used by GoogleAuthController.
     */
    private static function redirectError(string $code): void {
        $loginUrl = defined('APP_URL') ? APP_URL . '/login.html' : '/again/login.html';
        header('Location: ' . $loginUrl . '?facebook_error=' . urlencode($code));
        exit;
    }

    /**
     * Generate a JWT — byte-for-byte identical logic to GoogleAuthController.
     */
    private static function generateJWT(array $payload): string {
        $header  = base64_encode(json_encode(['alg' => JWT_ALGORITHM, 'typ' => 'JWT']));
        $payload = base64_encode(json_encode($payload));
        $sig     = base64_encode(hash_hmac(
            'sha256',
            $header . '.' . $payload,
            JWT_SECRET,
            true
        ));
        return $header . '.' . $payload . '.' . $sig;
    }

    /**
     * Minimal cURL GET helper — returns decoded JSON array or null on failure.
     */
    private static function apiGet(string $url): ?array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'ARTVOT/1.0',
        ]);
        $body = curl_exec($ch);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err || $body === false) {
            error_log('[FB OAuth] cURL error: ' . $err);
            return null;
        }

        $decoded = json_decode($body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('[FB OAuth] JSON decode error on: ' . substr($body, 0, 300));
            return null;
        }
        return $decoded;
    }

    // ── Public controller methods ─────────────────────────────────────────────

    /**
     * GET /auth/facebook
     * Generate CSRF state, store in session, redirect to Facebook OAuth dialog.
     */
    public static function redirect(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $state = bin2hex(random_bytes(16));
        $_SESSION['facebook_oauth_state']      = $state;
        $_SESSION['facebook_oauth_state_time'] = time();

        $params = http_build_query([
            'client_id'     => FACEBOOK_APP_ID,
            'redirect_uri'  => FACEBOOK_REDIRECT_URI,
            'state'         => $state,
            'scope'         => 'email,public_profile',
            'response_type' => 'code',
        ]);

        header('Location: https://www.facebook.com/v19.0/dialog/oauth?' . $params);
        exit;
    }

    /**
     * GET /auth/facebook/callback
     * Validate state → exchange code → fetch profile → upsert user → issue JWT.
     */
    public static function callback(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // ── 1. CSRF state validation ──────────────────────────────────────────
        $incomingState = $_GET['state'] ?? '';
        $storedState   = $_SESSION['facebook_oauth_state'] ?? '';
        $stateTime     = $_SESSION['facebook_oauth_state_time'] ?? 0;

        if (
            empty($incomingState) ||
            !hash_equals($storedState, $incomingState) ||
            (time() - $stateTime) > 600
        ) {
            error_log('[FB OAuth] State mismatch. Incoming: ' . $incomingState . ' | Stored: ' . $storedState);
            unset($_SESSION['facebook_oauth_state'], $_SESSION['facebook_oauth_state_time']);
            self::redirectError('invalid_state');
        }

        // Clear state token — one-time use only
        unset($_SESSION['facebook_oauth_state'], $_SESSION['facebook_oauth_state_time']);

        // ── 2. Handle errors returned by Facebook ─────────────────────────────
        if (isset($_GET['error'])) {
            error_log('[FB OAuth] Facebook error: ' . ($_GET['error_description'] ?? $_GET['error']));
            self::redirectError('access_denied');
        }

        $code = $_GET['code'] ?? '';
        if (empty($code)) {
            error_log('[FB OAuth] Missing authorization code');
            self::redirectError('token_exchange_failed');
        }

        // ── 3. Exchange code → access_token ──────────────────────────────────
        $tokenUrl = 'https://graph.facebook.com/v19.0/oauth/access_token?' . http_build_query([
            'client_id'     => FACEBOOK_APP_ID,
            'client_secret' => FACEBOOK_APP_SECRET,
            'redirect_uri'  => FACEBOOK_REDIRECT_URI,
            'code'          => $code,
        ]);

        $tokenData = self::apiGet($tokenUrl);

        if (empty($tokenData['access_token'])) {
            error_log('[FB OAuth] Token exchange failed: ' . json_encode($tokenData));
            self::redirectError('token_exchange_failed');
        }

        $accessToken = $tokenData['access_token'];

        // ── 4. Fetch user profile from Graph API ──────────────────────────────
        $profileUrl = 'https://graph.facebook.com/v19.0/me?' . http_build_query([
            'fields'       => 'id,name,email,picture.type(large)',
            'access_token' => $accessToken,
        ]);

        $fbUser = self::apiGet($profileUrl);

        if (empty($fbUser) || isset($fbUser['error'])) {
            error_log('[FB OAuth] Profile fetch failed: ' . json_encode($fbUser));
            self::redirectError('user_fetch_failed');
        }

        $facebookId = $fbUser['id']   ?? null;
        $fullName   = $fbUser['name'] ?? '';
        $email      = $fbUser['email'] ?? null;
        $avatarUrl  = $fbUser['picture']['data']['url'] ?? null;

        if (empty($facebookId)) {
            error_log('[FB OAuth] No Facebook ID returned');
            self::redirectError('user_fetch_failed');
        }

        // ── 5. Find or create user ────────────────────────────────────────────
        try {
            $db = new Database();

            $user = null;

            // 5a. Lookup by facebook_id (fast path for returning users)
            $db->prepare('SELECT * FROM users WHERE facebook_id = ? LIMIT 1');
            $db->bind('s', $facebookId);
            $db->execute();
            $user = $db->getRow();

            // 5b. Lookup by email — links Facebook to an existing account
            if (!$user && !empty($email)) {
                $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
                $db->bind('s', $email);
                $db->execute();
                $user = $db->getRow();

                if ($user) {
                    // Attach facebook_id so 5a succeeds on next login
                    $db->prepare('UPDATE users SET facebook_id = ? WHERE id = ?');
                    $db->bind('si', $facebookId, $user['id']);
                    $db->execute();

                    // Reload with updated row
                    $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                    $db->bind('i', $user['id']);
                    $db->execute();
                    $user = $db->getRow();
                }
            }

            // 5c. Block check
            if ($user && (int)$user['is_blocked'] === 1) {
                error_log('[FB OAuth] Blocked user attempted login. ID: ' . $user['id']);
                self::redirectError('account_blocked');
            }

            // 5d. Create new account
            if (!$user) {
                // Handle the rare case Facebook does not return an email
                if (empty($email)) {
                    $email = 'fb_' . $facebookId . '@facebook.placeholder';
                    error_log('[FB OAuth] No email from Facebook for ID ' . $facebookId . '. Using placeholder.');
                }

                // Build a unique username from the full name
                $base     = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $fullName));
                $base     = substr($base ?: 'user', 0, 20);
                $username = $base;
                $suffix   = 1;

                while (true) {
                    $db->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
                    $db->bind('s', $username);
                    $db->execute();
                    if (!$db->getRow()) break;
                    $username = $base . $suffix++;
                }

                // Random unusable password (user authenticates via Facebook, not password)
                $randomPassword = password_hash(
                    bin2hex(random_bytes(32)),
                    PASSWORD_BCRYPT,
                    ['cost' => BCRYPT_COST]
                );

                $db->prepare(
                    'INSERT INTO users (username, email, password, full_name, facebook_id, roles)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $db->bind('ssssss',
                    $username,
                    $email,
                    $randomPassword,
                    $fullName,
                    $facebookId,
                    '["voter"]'
                );
                $db->execute();

                $newId = $db->lastInsertId();

                // Create matching user_profile row with Facebook avatar
                $db->prepare('INSERT INTO user_profiles (user_id, avatar_url) VALUES (?, ?)');
                $db->bind('ss', $newId, $avatarUrl ?? '');
                $db->execute();

                // Reload full row
                $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $db->bind('i', $newId);
                $db->execute();
                $user = $db->getRow();

            } else {
                // 5e. Refresh avatar URL for existing users on every login
                if ($avatarUrl) {
                    $db->prepare('UPDATE user_profiles SET avatar_url = ? WHERE user_id = ?');
                    $db->bind('si', $avatarUrl, $user['id']);
                    $db->execute();
                }
            }

        } catch (Exception $e) {
            error_log('[FB OAuth] DB error: ' . $e->getMessage());
            self::redirectError('db_error');
        }

        // ── 6. Issue JWT — identical structure to GoogleAuthController ─────────
        $roles = [];
        if (!empty($user['roles'])) {
            $decoded = json_decode($user['roles'], true);
            $roles   = is_array($decoded) ? $decoded : [];
        }

        $now     = time();
        $payload = [
            'iss'      => APP_NAME,
            'iat'      => $now,
            'exp'      => $now + JWT_EXPIRATION,
            'user_id'  => (int)$user['id'],
            'username' => $user['username'],
            'email'    => $user['email'],
            'roles'    => $roles,
        ];

        $token = self::generateJWT($payload);

        // ── 7. Build safe user object (same shape as Google flow) ─────────────
        $userObj = [
            'id'             => (int)$user['id'],
            'user_id'        => (int)$user['id'],
            'username'       => $user['username'],
            'email'          => $user['email'],
            'full_name'      => $user['full_name'] ?? '',
            'roles'          => $roles,
            'avatar_url'     => $avatarUrl ?? '',
            'wallet_balance' => (float)($user['wallet_balance'] ?? 0),
        ];

        // ── 8. Redirect to login.html with token params (mirrors Google) ───────
        // Build the URL manually like GoogleAuthController does to avoid
        // double-encoding — urlencode() once, do NOT wrap with http_build_query().
        $loginUrl = defined('APP_URL') ? APP_URL . '/login.html' : '/again/login.html';

        header('Location: ' . $loginUrl
            . '?facebook_token=' . urlencode($token)
            . '&facebook_user='  . urlencode(json_encode($userObj)));
        exit;
    }
}
