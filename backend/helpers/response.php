<?php
/**
 * Response Helper Class
 * Standardized API response format
 */

class Response {
    /**
     * Send success response
     */
    public static function success($data = null, $message = 'Success', $code = 200) {
        http_response_code($code);
        if (ob_get_level() > 0) ob_clean();
        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => $data,
            'users' => $data,
            'reports' => $data,
            'offers' => $data,
            'artworks' => $data
        ]);
        exit;
    }
    
    /**
     * Send error response
     */
    public static function error($message = 'Error', $code = 400, $errors = null) {
        http_response_code($code);
        if (ob_get_level() > 0) ob_clean();
        echo json_encode([
            'success' => false,
            'message' => $message,
            'errors' => $errors
        ]);
        exit;
    }
    
    /**
     * Send paginated response
     */
    public static function paginate($data, $page = 1, $limit = 10, $total = 0) {
        http_response_code(200);
        if (ob_get_level() > 0) ob_clean();
        echo json_encode([
            'success' => true,
            'data' => $data,
            'users' => $data,
            'reports' => $data,
            'offers' => $data,
            'artworks' => $data,
            'pagination' => [
                'page' => (int)$page,
                'limit' => (int)$limit,
                'total' => (int)$total,
                'pages' => ceil($total / $limit)
            ]
        ]);
        exit;
    }
}

?>
