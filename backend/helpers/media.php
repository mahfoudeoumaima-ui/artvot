<?php
/**
 * Media storage and validation helpers.
 */

class MediaStorage {
    private const IMAGE_MAX_BYTES = 10485760;  // 10MB
    private const VIDEO_MAX_BYTES = 20971520;  // 20MB
    private const IMAGE_MIME_EXT = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    private const VIDEO_MIME_EXT = [
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
    ];
    private const CATEGORIES = ['offers', 'posts', 'submissions', 'profiles'];

    public static function uploadRoot() {
        return realpath(__DIR__ . '/../../api/uploads') ?: (__DIR__ . '/../../api/uploads');
    }

    public static function normalizeCategory($category) {
        $category = strtolower(trim((string)$category));
        return in_array($category, self::CATEGORIES, true) ? $category : 'posts';
    }

    public static function saveUploadedFile(array $file, $category = 'posts') {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new Exception(self::uploadErrorMessage($file['error'] ?? UPLOAD_ERR_NO_FILE));
        }

        if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            throw new Exception('Invalid upload.');
        }

        $mime = mime_content_type($file['tmp_name']);
        $ext = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));
        $isImage = isset(self::IMAGE_MIME_EXT[$mime]);
        $isVideo = isset(self::VIDEO_MIME_EXT[$mime]);

        if (!$isImage && !$isVideo) {
            throw new Exception('Invalid file type. Allowed images: JPG, JPEG, PNG, WEBP. Allowed videos: MP4, WEBM.');
        }

        $expectedExts = $isImage
            ? ($mime === 'image/jpeg' ? ['jpg', 'jpeg'] : [self::IMAGE_MIME_EXT[$mime]])
            : [self::VIDEO_MIME_EXT[$mime]];

        if (!in_array($ext, $expectedExts, true)) {
            throw new Exception('File extension does not match the uploaded media type.');
        }

        $maxBytes = $isImage ? self::IMAGE_MAX_BYTES : self::VIDEO_MAX_BYTES;
        if (($file['size'] ?? 0) > $maxBytes) {
            throw new Exception($isImage ? 'Image files must be 10MB or smaller.' : 'Video files must be 20MB or smaller.');
        }

        $category = self::normalizeCategory($category);
        $uploadDir = self::uploadRoot() . DIRECTORY_SEPARATOR . $category;
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            throw new Exception('Failed to create upload directory.');
        }

        $safeExt = $isImage ? self::IMAGE_MIME_EXT[$mime] : self::VIDEO_MIME_EXT[$mime];
        $filename = date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.' . $safeExt;
        $target = $uploadDir . DIRECTORY_SEPARATOR . $filename;

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            throw new Exception('Failed to save uploaded file.');
        }

        chmod($target, 0644);

        $relativePath = 'uploads/' . $category . '/' . $filename;
        return [
            'filename' => $filename,
            'path' => $relativePath,
            'url' => '/again/api/' . $relativePath,
            'size' => (int)$file['size'],
            'type' => $mime,
            'media_type' => $isImage ? 'image' : 'video',
        ];
    }

    public static function normalizeReferenceImages($referenceImages) {
        if ($referenceImages === null || $referenceImages === '' || $referenceImages === []) {
            return null;
        }

        $items = $referenceImages;
        if (is_string($items)) {
            $decoded = json_decode($items, true);
            $items = json_last_error() === JSON_ERROR_NONE ? $decoded : [$items];
        }

        if (!is_array($items)) {
            throw new Exception('Invalid media payload.');
        }

        $normalized = [];
        foreach ($items as $item) {
            if (is_array($item)) {
                $item = $item['url'] ?? $item['path'] ?? '';
            }

            if (!is_string($item) || trim($item) === '') {
                continue;
            }

            $item = trim($item);
            if (preg_match('/^data:(image|video)\//i', $item) || stripos($item, ';base64,') !== false) {
                throw new Exception('Base64 media is not accepted. Upload media first and store only the returned file URL.');
            }

            if (strlen($item) > 2048) {
                throw new Exception('Media URL is too large. Upload media first and store only the returned file URL.');
            }

            $normalized[] = $item;
        }

        return $normalized ? json_encode(array_values(array_unique($normalized))) : null;
    }

    private static function uploadErrorMessage($code) {
        $messages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds the server upload limit.',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds the form upload limit.',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded.',
            UPLOAD_ERR_NO_FILE => 'No file uploaded.',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary upload folder.',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write uploaded file.',
            UPLOAD_ERR_EXTENSION => 'Upload blocked by a PHP extension.',
        ];
        return $messages[$code] ?? 'Unknown upload error.';
    }
}
?>
