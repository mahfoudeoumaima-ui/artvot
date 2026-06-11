<?php
/**
 * Comment Controller - Consolidated Architecture
 */

class CommentController {
    
    /**
     * Get comments for an offer
     * GET /api/offers/{id}/comments
     */
    public static function getComments($offer_id) {
        $commentModel = new Comment();
        $comments = $commentModel->getOfferComments($offer_id);
        Response::success($comments, 'Comments fetched successfully');
    }
    
    /**
     * Post a comment on an offer
     * POST /api/offers/{id}/comments
     */
    public static function postComment($offer_id) {
        // Authenticate user
        $user = AuthMiddleware::verify();
        $data = json_decode(file_get_contents('php://input'), true);
        
        $comment_text = trim($data['comment_text'] ?? '');
        if ($comment_text === '') {
            Response::error('Comment text cannot be empty', 400);
        }
        
        $commentModel = new Comment();
        $result = $commentModel->create($offer_id, $user['user_id'], $comment_text);
        
        if ($result['success']) {
            Response::success([
                'comment_id' => $result['id']
            ], 'Comment posted successfully', 201);
        } else {
            Response::error('Failed to post comment', 500);
        }
    }
    
    /**
     * Delete comment
     * DELETE /api/comments/{id}
     */
    public static function deleteComment($comment_id) {
        $user = AuthMiddleware::verify();
        
        $commentModel = new Comment();
        $result = $commentModel->delete($comment_id, $user['user_id']);
        
        if ($result['success']) {
            Response::success(null, 'Comment deleted successfully');
        } else {
            Response::error($result['message'] ?? 'Failed to delete comment', 500);
        }
    }
}
?>
