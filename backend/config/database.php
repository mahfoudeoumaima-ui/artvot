<?php
/**
 * Database Connection Class
 * 
 * FIX: bind() now supports BOTH calling styles:
 *   Old style (used across all models): $db->bind('sii', $val1, $val2, $val3)
 *   New style (single):                 $db->bind('s', $val1)
 */

class Database {
    public $connection;
    private $stmt;
    private $bindTypes = '';
    private $bindings  = [];

    public function __construct() {
        $this->connection = new mysqli(
            DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT
        );

        if ($this->connection->connect_error) {
            die(json_encode([
                'success' => false,
                'message' => defined('DEBUG_MODE') && DEBUG_MODE
                    ? $this->connection->connect_error
                    : 'Database connection failed'
            ]));
        }

        $this->connection->set_charset('utf8mb4');
    }

    /**
     * Prepare query — reset bindings each time
     */
    public function prepare($query) {
        if ($this->stmt !== null) {
            $this->stmt->close();
            $this->stmt = null;
        }
        $this->bindTypes = '';
        $this->bindings  = [];

        $this->stmt = $this->connection->prepare($query);
        if (!$this->stmt) {
            throw new Exception('Prepare failed: ' . $this->connection->error . ' | Query: ' . substr($query, 0, 200));
        }
        return $this;
    }

    /**
     * Bind parameters — supports BOTH styles:
     *
     * Style 1 (old, used in all models):
     *   $db->bind('sii', $str, $int1, $int2)   ← type string + variadic values
     *
     * Style 2 (new, single param):
     *   $db->bind('s', $str)
     *   $db->bind('i', $int)
     *
     * Both styles work because we detect whether $type has length > 1
     * and additional args are passed.
     */
    public function bind($type, ...$values) {
        $typeStr = (string)$type;

        // Style 1: bind('sii', $a, $b, $c) — type string matches count of values
        if (strlen($typeStr) > 1 && count($values) === strlen($typeStr)) {
            $this->bindTypes .= $typeStr;
            foreach ($values as $v) {
                $this->bindings[] = $v;
            }
            return $this;
        }

        // Style 1 alt: bind('sii', $a, $b, $c) where values passed individually
        // already handled above — fall through to single-char handling

        // Style 2: bind('s', $val) — single type char, single value
        if (strlen($typeStr) === 1 && count($values) === 1) {
            $allowed = ['i', 'd', 's', 'b'];
            $t = in_array($typeStr, $allowed, true) ? $typeStr : 's';
            $this->bindTypes .= $t;
            $this->bindings[] = $values[0];
            return $this;
        }

        // Fallback: treat everything as strings
        foreach ($values as $v) {
            $this->bindTypes .= 's';
            $this->bindings[] = $v;
        }

        return $this;
    }

    /**
     * Execute — calls bind_param once with all accumulated params
     */
    public function execute() {
        if (!empty($this->bindings)) {
            $this->stmt->bind_param($this->bindTypes, ...$this->bindings);
        }
        $result = $this->stmt->execute();
        if (!$result) {
            throw new Exception('Execute failed: ' . $this->stmt->error);
        }
        return $result;
    }

    public function getResult() {
        return $this->stmt->get_result();
    }

    public function getRow() {
        $result = $this->getResult();
        return $result ? $result->fetch_assoc() : null;
    }

    public function getRows() {
        $result = $this->getResult();
        if (!$result) return [];
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        return $rows;
    }

    public function lastInsertId() {
        return $this->connection->insert_id;
    }

    public function affectedRows() {
        return $this->connection->affected_rows;
    }

    public function escape($str) {
        return $this->connection->real_escape_string($str);
    }

    public function close() {
        if ($this->stmt) $this->stmt->close();
        return $this->connection->close();
    }
}
?>
