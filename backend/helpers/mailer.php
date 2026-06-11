<?php
/**
 * Mailer Helper
 * Sends email via PHP mail() with fallback logging for localhost
 */

class Mailer {
    /**
     * Send an HTML email
     * Always logs to error.log as fallback for XAMPP/localhost
     */
    public static function send($to, $subject, $body) {
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . MAIL_FROM . "\r\n";
        
        // Always log for local dev (reset link will appear in error.log)
        error_log("[MAILER] To: $to | Subject: $subject");
        error_log("[MAILER] Body: $body");
        
        // Try to send via mail()
        $sent = @mail($to, $subject, $body, $headers);
        
        if (!$sent) {
            error_log("[MAILER] mail() failed or not available — check error.log for the reset link above.");
        }
        
        return $sent;
    }
}
?>
