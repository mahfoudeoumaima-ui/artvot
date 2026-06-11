<?php
/**
 * JWT Token Handler
 * Generate, verify, and decode JWT tokens
 */

class JWT {
    /**
     * Generate JWT token
     */
    public static function generate($payload, $expiration = null) {
        $expiration = $expiration ?? JWT_EXPIRATION;
        
        $payload['iat'] = time();
        $payload['exp'] = time() + $expiration;
        
        $header = self::base64UrlEncode(json_encode(['alg' => JWT_ALGORITHM, 'typ' => 'JWT']));
        $payload_encoded = self::base64UrlEncode(json_encode($payload));
        
        $signature = hash_hmac(
            'sha256',
            "$header.$payload_encoded",
            JWT_SECRET,
            true
        );
        $signature_encoded = self::base64UrlEncode($signature);
        
        return "$header.$payload_encoded.$signature_encoded";
    }
    
    /**
     * Verify and decode JWT token
     */
    public static function verify($token) {
        $parts = explode('.', $token);
        
        if (count($parts) !== 3) {
            return false;
        }
        
        [$header_encoded, $payload_encoded, $signature_encoded] = $parts;
        
        // Verify signature
        $signature = hash_hmac(
            'sha256',
            "$header_encoded.$payload_encoded",
            JWT_SECRET,
            true
        );
        $signature_expected = self::base64UrlDecode($signature_encoded);
        
        if (!hash_equals($signature, $signature_expected)) {
            return false;
        }
        
        // Decode payload
        $payload = json_decode(self::base64UrlDecode($payload_encoded), true);
        
        // Check expiration
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return false;
        }
        
        return $payload;
    }
    
    /**
     * Base64 URL encode
     */
    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    /**
     * Base64 URL decode
     */
    private static function base64UrlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 4 - strlen($data) % 4));
    }
}

?>
