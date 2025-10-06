// CH9329 WebSerial Controller JavaScript
// WebSerial APIを使用してブラウザからCH9329チップを制御

// =====================================================
// CH9329コントローラークラス
// =====================================================

class CH9329Controller {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;
        this.isConnected = false;
        this.sourceLayout = 'auto';  // UI表示用のキーボード配列（送信には影響しない）
        this.targetLayout = null;    // 被操作側PCのキーボード認識（送信キーコードを決定）HTMLから読み込む
        
        // キーコード定義
        this.SPECIAL_KEYS = {
            ZENHAN: 0x35,
            ENTER: 0x28,
            SPACE: 0x2C,
            BACKSPACE: 0x2A,
            SHIFT: 0xE1,
            CTRL: 0xE0,
            ALT: 0xE2,
            TAB: 0x2B,
            ESC: 0x58,
            WINDOWS: 0xE3,
            PAGEUP: 0x4B,
            PAGEDOWN: 0x4E,
            HOME: 0x4A,
            END: 0x4D,
            INSERT: 0x49,
            DELETE: 0x4C,
            UP: 0x52,
            DOWN: 0x51,
            LEFT: 0x50,
            RIGHT: 0x4F
        };
        
        // マウスボタン定義
        this.MOUSE_BUTTONS = {
            LEFT: 0x01,
            RIGHT: 0x02,
            MIDDLE: 0x04
        };
        
        // 文字→キーコード変換テーブル
        this.initKeyTable();
    }
    
    initKeyTable() {
        this.KEY_TABLE = {};
        
        // 被操作側PCがUS配列として認識している場合のマッピング
        const targetUSMapping = {
            '!': [2, 0x1E], '"': [2, 0x1F], '#': [2, 0x20], '$': [2, 0x21], 
            '%': [2, 0x22], '&': [2, 0x23], "'": [2, 0x34], 
            '(': [2, 0x26], ')': [2, 0x27], 
            '*': [2, 0x25], '+': [2, 0x2E], 
            '-': [0, 0x2D], '=': [0, 0x2E], '_': [2, 0x2D], 
            '~': [2, 0x35], '`': [0, 0x35], 
            '@': [2, 0x1F], '^': [2, 0x23], 
            '[': [0, 0x2F], '{': [2, 0x2F], ']': [0, 0x30], '}': [2, 0x30],
            '\\': [0, 0x31], '|': [2, 0x31],  // US配列の場合
            ';': [0, 0x33], ':': [2, 0x33], 
            ',': [0, 0x36], '<': [2, 0x36], '.': [0, 0x37], '>': [2, 0x37],
            '/': [0, 0x38], '?': [2, 0x38]
        };
        
        // 被操作側PCがJIS配列として認識している場合のマッピング
        const targetJISMapping = {
            '!': [2, 0x1E], '"': [2, 0x1F], '#': [2, 0x20], '$': [2, 0x21], 
            '%': [2, 0x22], '&': [2, 0x23], "'": [2, 0x24], 
            '(': [2, 0x25],  // JIS: Shift+8
            ')': [2, 0x26],  // JIS: Shift+9
            '=': [2, 0x2D], '-': [0, 0x2D], '~': [2, 0x2E], '^': [0, 0x2E],
            '@': [0, 0x2F], '`': [2, 0x2F],
            '[': [0, 0x30], '{': [2, 0x30], ']': [0, 0x31], '}': [2, 0x31],
            '\\': [0, 0x89], // JIS配列として認識されている場合
            '|': [2, 0x89],   // JISの|はShift+0x89
            '¥': [0, 0x89],   // 円マークも同じキー
            ';': [0, 0x33], '+': [2, 0x33], ':': [0, 0x34], '*': [2, 0x34],
            ',': [0, 0x36], '<': [2, 0x36], '.': [0, 0x37], '>': [2, 0x37],
            '/': [0, 0x38], '?': [2, 0x38], '_': [2, 0x87]  // JISの_はInt1キー
        };
        
        // 被操作側PCの配列に基づいて選択
        let specialChars;
        if (this.targetLayout === 'jis') {
            specialChars = targetJISMapping;
            this.log(`被操作側PC: JIS配列として認識`, 'info');
        } else {
            specialChars = targetUSMapping;
            this.log(`被操作側PC: US配列として認識`, 'info');
        }
        
        Object.assign(this.KEY_TABLE, specialChars);
        
        // 数字（0-9）
        this.KEY_TABLE['0'] = [0, 0x27];
        for (let i = 1; i <= 9; i++) {
            this.KEY_TABLE[String(i)] = [0, 0x1E + i - 1];
        }
        
        // アルファベット（大文字・小文字）
        for (let i = 0; i < 26; i++) {
            // 大文字（Shift必要）
            this.KEY_TABLE[String.fromCharCode(65 + i)] = [2, 0x04 + i];
            // 小文字
            this.KEY_TABLE[String.fromCharCode(97 + i)] = [0, 0x04 + i];
        }
    }
    
    async connect(baudRate = 115200) {
        try {
            // WebSerial APIサポート確認
            if (!('serial' in navigator)) {
                throw new Error('WebSerial APIはサポートされていません。Chrome/Edge/Operaを使用してください。');
            }
            
            // シリアルポート選択
            this.port = await navigator.serial.requestPort();
            
            // ポート開く
            await this.port.open({ baudRate: baudRate });
            
            // WriterとReaderを直接取得（TextEncoderStreamは使わない）
            this.writer = this.port.writable.getWriter();
            this.reader = this.port.readable.getReader();
            
            this.isConnected = true;
            this.log('接続成功', 'success');
            
            return true;
        } catch (error) {
            this.log(`接続エラー: ${error.message}`, 'error');
            throw error;
        }
    }
    
    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.close();
                this.writer.releaseLock();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.isConnected = false;
            this.log('切断しました', 'info');
        } catch (error) {
            this.log(`切断エラー: ${error.message}`, 'error');
        }
    }
    
    async sendPacket(data) {
        if (!this.isConnected || !this.writer) {
            throw new Error('デバイスが接続されていません');
        }
        
        try {
            // バイト配列をUint8Arrayに変換
            const bytes = new Uint8Array(data);
            
            // 既存のwriterを使用して書き込み
            await this.writer.write(bytes);
            
            // デバッグログ
            const hexString = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            this.log(`送信: ${hexString}`, 'debug');
            
            // 応答待機
            await this.delay(20);
        } catch (error) {
            this.log(`送信エラー: ${error.message}`, 'error');
            throw error;
        }
    }
    
    async pushKey(modifier, key1, key2 = 0, key3 = 0, key4 = 0, key5 = 0, key6 = 0) {
        // キー押下パケット
        const pushPacket = [0x57, 0xAB, 0x00, 0x02, 0x08, modifier, 0x00, key1, key2, key3, key4, key5, key6];
        pushPacket.push(this.checksum(pushPacket));
        await this.sendPacket(pushPacket);
        
        // キー離すパケット
        const releasePacket = [0x57, 0xAB, 0x00, 0x02, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C];
        await this.sendPacket(releasePacket);
    }
    
    async sendText(text) {
        if (!text) return;
        
        this.log(`テキスト送信: "${text}"`, 'info');
        
        for (const char of text) {
            if (this.KEY_TABLE[char]) {
                const [modifier, keycode] = this.KEY_TABLE[char];
                await this.pushKey(modifier, keycode);
                await this.delay(10); // キー間隔
            }
        }
    }
    
    async sendSpecialKey(keyName) {
        const keyCode = this.SPECIAL_KEYS[keyName];
        if (!keyCode) {
            this.log(`未定義の特殊キー: ${keyName}`, 'warning');
            return;
        }
        
        this.log(`特殊キー: ${keyName} (0x${keyCode.toString(16).padStart(2, '0').toUpperCase()})`, 'info');
        
        // 修飾キーの特別処理
        if (keyName === 'SHIFT') {
            await this.pushKey(0x02, 0);
        } else if (keyName === 'CTRL') {
            await this.pushKey(0x01, 0);
        } else if (keyName === 'ALT') {
            await this.pushKey(0x04, 0);
        } else if (keyName === 'WINDOWS') {
            await this.pushKey(0x08, 0);
        } else {
            await this.pushKey(0x00, keyCode);
        }
    }

    // 修飾キー付きでキーを送信
    async sendKeyWithModifiers(keyCode, ctrlKey = false, shiftKey = false, altKey = false, metaKey = false) {
        let modifier = 0x00;

        // 修飾キーのビットマスク
        if (ctrlKey) modifier |= 0x01;   // Left Ctrl
        if (shiftKey) modifier |= 0x02;  // Left Shift
        if (altKey) modifier |= 0x04;    // Left Alt
        if (metaKey) modifier |= 0x08;   // Left Win/Command

        await this.pushKey(modifier, keyCode);
    }

    // 絶対座標移動は削除（相対移動のみ使用）
    
    async moveMouseRelative(x, y) {
        // 範囲制限
        x = Math.max(-128, Math.min(127, x));
        y = Math.max(-128, Math.min(127, y));
        
        this.log(`マウス相対移動: (${x}, ${y})`, 'info');
        
        // 負の値を2の補数に変換
        if (x < 0) x = 0x100 + x;
        if (y < 0) y = 0x100 + y;
        
        const packet = [0x57, 0xAB, 0x00, 0x05, 0x05, 0x01, 0x00, x, y, 0x00];
        packet.push(this.checksum(packet));
        await this.sendPacket(packet);
    }
    
    async clickMouse(button) {
        const buttonCode = this.MOUSE_BUTTONS[button];
        if (!buttonCode) return;
        
        this.log(`マウスクリック: ${button}`, 'info');
        
        // ボタン押下
        const pressPacket = [0x57, 0xAB, 0x00, 0x05, 0x05, 0x01, buttonCode, 0x00, 0x00, 0x00];
        pressPacket.push(this.checksum(pressPacket));
        await this.sendPacket(pressPacket);
        
        // ボタン離す
        const releasePacket = [0x57, 0xAB, 0x00, 0x05, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x0D];
        await this.sendPacket(releasePacket);
    }
    
    async scrollMouse(amount) {
        // 範囲制限
        amount = Math.max(-127, Math.min(127, amount));
        
        this.log(`スクロール: ${amount}`, 'info');
        
        // 負の値を2の補数に変換
        if (amount < 0) amount = 0x100 + amount;
        
        const packet = [0x57, 0xAB, 0x00, 0x05, 0x05, 0x01, 0x00, 0x00, 0x00, amount];
        packet.push(this.checksum(packet));
        await this.sendPacket(packet);
    }
    
    checksum(data) {
        return data.reduce((sum, byte) => sum + byte, 0) & 0xFF;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        
        // UIログ表示用のイベント発火
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ch9329-log', { 
                detail: { message, level, timestamp } 
            }));
        }
    }
    
    detectSourceLayout() {
        // UI表示用のキーボード配列を簡易検出
        const lang = navigator.language || navigator.userLanguage;
        return lang.startsWith('ja') ? 'jis' : 'us';
    }
    
    setSourceLayout(layout) {
        // UI表示用のレイアウト設定（送信には影響しない）
        this.sourceLayout = (layout === 'auto') ? this.detectSourceLayout() : layout;
        const autoText = (layout === 'auto') ? ' (自動検出)' : ' (手動設定)';
        this.log(`UI表示: ${this.sourceLayout.toUpperCase()}配列${autoText}`, 'info');
        return this.sourceLayout;
    }
    
    setTargetLayout(layout) {
        this.targetLayout = layout;
        this.initKeyTable();  // キーテーブルを再初期化
    }
}

// =====================================================
// キーボードレイアウト定義
// =====================================================
// US-Mac、US-Win、JIS-Mac、JIS-Winの4種類を完全実装
// UIと送信キーコードの両方に対応
const KEYBOARD_LAYOUTS = {
    'us': {
        name: 'US (ANSI)',
        functionRow: [
            { code: 'Escape', label: 'ESC', class: 'function-key' },
            { type: 'spacer', width: 30 },
            { code: 'F1', label: 'F1', class: 'function-key' },
            { code: 'F2', label: 'F2', class: 'function-key' },
            { code: 'F3', label: 'F3', class: 'function-key' },
            { code: 'F4', label: 'F4', class: 'function-key' },
            { type: 'spacer', width: 20 },
            { code: 'F5', label: 'F5', class: 'function-key' },
            { code: 'F6', label: 'F6', class: 'function-key' },
            { code: 'F7', label: 'F7', class: 'function-key' },
            { code: 'F8', label: 'F8', class: 'function-key' },
            { type: 'spacer', width: 20 },
            { code: 'F9', label: 'F9', class: 'function-key' },
            { code: 'F10', label: 'F10', class: 'function-key' },
            { code: 'F11', label: 'F11', class: 'function-key' },
            { code: 'F12', label: 'F12', class: 'function-key' }
        ],
        numberRow: [
            { code: 'Backquote', normal: '`', shift: '~' },
            { code: 'Digit1', normal: '1', shift: '!' },
            { code: 'Digit2', normal: '2', shift: '@' },
            { code: 'Digit3', normal: '3', shift: '#' },
            { code: 'Digit4', normal: '4', shift: '$' },
            { code: 'Digit5', normal: '5', shift: '%' },
            { code: 'Digit6', normal: '6', shift: '^' },
            { code: 'Digit7', normal: '7', shift: '&' },
            { code: 'Digit8', normal: '8', shift: '*' },
            { code: 'Digit9', normal: '9', shift: '(' },
            { code: 'Digit0', normal: '0', shift: ')' },
            { code: 'Minus', normal: '-', shift: '_' },
            { code: 'Equal', normal: '=', shift: '+' },
            { code: 'Backspace', label: '←BS', class: 'backspace' }
        ],
        symbolKeys: {
            'BracketLeft': { normal: '[', shift: '{' },
            'BracketRight': { normal: ']', shift: '}' },
            'Backslash': { normal: '\\', shift: '|' },
            'Semicolon': { normal: ';', shift: ':' },
            'Quote': { normal: "'", shift: '"' },
            'Comma': { normal: ',', shift: '<' },
            'Period': { normal: '.', shift: '>' },
            'Slash': { normal: '/', shift: '?' }
        }
    },
    'jis': {
        name: 'JIS',
        functionRow: [
            { code: 'Escape', label: 'ESC', class: 'function-key' },
            { type: 'spacer', width: 30 },
            { code: 'F1', label: 'F1', class: 'function-key' },
            { code: 'F2', label: 'F2', class: 'function-key' },
            { code: 'F3', label: 'F3', class: 'function-key' },
            { code: 'F4', label: 'F4', class: 'function-key' },
            { type: 'spacer', width: 20 },
            { code: 'F5', label: 'F5', class: 'function-key' },
            { code: 'F6', label: 'F6', class: 'function-key' },
            { code: 'F7', label: 'F7', class: 'function-key' },
            { code: 'F8', label: 'F8', class: 'function-key' },
            { type: 'spacer', width: 20 },
            { code: 'F9', label: 'F9', class: 'function-key' },
            { code: 'F10', label: 'F10', class: 'function-key' },
            { code: 'F11', label: 'F11', class: 'function-key' },
            { code: 'F12', label: 'F12', class: 'function-key' }
        ],
        numberRow: [
            { code: 'Digit1', normal: '1', shift: '!' },
            { code: 'Digit2', normal: '2', shift: '"' },
            { code: 'Digit3', normal: '3', shift: '#' },
            { code: 'Digit4', normal: '4', shift: '$' },
            { code: 'Digit5', normal: '5', shift: '%' },
            { code: 'Digit6', normal: '6', shift: '&' },
            { code: 'Digit7', normal: '7', shift: "'" },
            { code: 'Digit8', normal: '8', shift: '(' },
            { code: 'Digit9', normal: '9', shift: ')' },
            { code: 'Digit0', normal: '0', shift: '~' },
            { code: 'Minus', normal: '-', shift: '=' },
            { code: 'Equal', normal: '^', shift: '~' },
            { code: 'IntlYen', normal: '¥', shift: '|' },
            { code: 'Backspace', label: '←BS', class: 'backspace' }
        ],
        symbolKeys: {
            'BracketLeft': { normal: '@', shift: '`' },
            'BracketRight': { normal: '[', shift: '{' },
            'Backslash': { normal: ']', shift: '}' },
            'Semicolon': { normal: ';', shift: '+' },
            'Quote': { normal: ':', shift: '*' },
            'Comma': { normal: ',', shift: '<' },
            'Period': { normal: '.', shift: '>' },
            'Slash': { normal: '/', shift: '?' }
        }
    }
};

// =====================================================
// メインアプリケーション
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    const controller = new CH9329Controller();
    let isRealtimeActive = false;
    let isMouseCaptureActive = false;
    
    // =====================================================
    // 初期化とグローバル変数
    // =====================================================
    
    // UI要素の取得
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const statusDiv = document.getElementById('status');
    const logDiv = document.getElementById('log');
    const BAUD_RATE = 9600; // ボーレートを指定 デフォルト9600 変更にはデータ書き込みが必要 19200,38400つながらない? 57600つながることもある 74880,115200つながらない
    const textInput = document.getElementById('textInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const clearTextBtn = document.getElementById('clearTextBtn');
    const touchpad = document.getElementById('touchpad');
    const touchpadArea = document.getElementById('touchpadArea');
    const touchpadLeft = document.getElementById('touchpadLeft');
    const touchpadMiddle = document.getElementById('touchpadMiddle');
    const touchpadRight = document.getElementById('touchpadRight');
    const textInputContainer = document.getElementById('textInputContainer');
    const visualKeyboard = document.getElementById('visualKeyboard');
    
    const sourceLayoutSelect = document.getElementById('sourceKeyboardLayout');
    const detectedLayoutSpan = document.getElementById('detectedLayout');
    const targetLayoutSelect = document.getElementById('targetKeyboardLayout');
    
    // マウス制御用変数
    let lastMouseX = 0;
    let lastMouseY = 0;
    let isDragging = false;
    
    // タッチ制御用変数
    let touchCount = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    
    // =====================================================
    // デバイス接続管理
    // =====================================================
    
    // デバイス接続処理
    connectBtn.addEventListener('click', async () => {
        try {
            await controller.connect(BAUD_RATE);
            
            statusDiv.textContent = '接続済み';
            statusDiv.className = 'status-tag connected';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            
            // テキスト送信ボタン有効化
            sendTextBtn.disabled = false;
        } catch (error) {
            alert(`接続エラー: ${error.message}`);
        }
    });
    
    // デバイス切断処理
    disconnectBtn.addEventListener('click', async () => {
        await controller.disconnect();
        
        statusDiv.textContent = '未接続';
        statusDiv.className = 'status-tag disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        
        // テキスト送信ボタン無効化
        sendTextBtn.disabled = true;
        
        // リアルタイムモード終了
        disableRealtimeMode();
    });
    
    // =====================================================
    // キーボード制御
    // =====================================================
    
    // レイアウト設定
    function updateSourceLayout() {
        const value = sourceLayoutSelect.value;
        let layoutType, osType;
        const eisuKanaOption = document.getElementById('eisuKanaOption');

        if (value === 'auto') {
            // 自動検出
            osType = getOSInfo();
            const detectedLayout = controller.setSourceLayout(value);
            layoutType = detectedLayout;
            detectedLayoutSpan.textContent = `(検出: ${detectedLayout.toUpperCase()}配列 ${osType === 'mac' ? 'Mac' : 'Windows'})`;
        } else {
            // 手動選択
            detectedLayoutSpan.textContent = '';
            const parts = value.split('-');
            layoutType = parts[0]; // 'us' or 'jis'

            // 'win' を 'windows' に変換
            if (parts[1] === 'win') {
                osType = 'windows';
            } else if (parts[1] === 'mac') {
                osType = 'mac';
            } else {
                osType = getOSInfo();
            }

            // controllerには配列タイプのみ設定
            controller.setSourceLayout(layoutType);
        }

        // JIS配列 Mac の場合のみ、英数/かなキー変換オプションを表示
        if (layoutType === 'jis' && osType === 'mac') {
            eisuKanaOption.style.display = 'inline';
        } else {
            eisuKanaOption.style.display = 'none';
        }

        generateKeyboardLayout(layoutType, osType);
    }
    
    sourceLayoutSelect.addEventListener('change', updateSourceLayout);
    
    targetLayoutSelect.addEventListener('change', () => {
        const layout = targetLayoutSelect.value;
        controller.setTargetLayout(layout);
    });
    
    // 初期化時にレイアウトを設定
    updateSourceLayout();
    controller.setTargetLayout(targetLayoutSelect.value);
    
    // テキスト入力
    
    sendTextBtn.addEventListener('click', async () => {
        const text = textInput.value;
        if (text) {
            await controller.sendText(text);
        }
    });
    
    clearTextBtn.addEventListener('click', () => {
        textInput.value = '';
    });
    
    // キーボードショートカット（Ctrl+Enterでテキスト送信）
    textInput.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.key === 'Enter' && controller.isConnected) {
            await controller.sendText(textInput.value);
        }
    });
    
    // =====================================================
    // マウス制御
    // =====================================================
    
    // マウスキャプチャモードの切り替え
    function enableMouseCapture() {
        isMouseCaptureActive = true;

        // UIフィードバック - タッチパッド全体にアクティブクラスを追加
        touchpadArea.classList.add('capture-active');
        touchpadLeft.classList.add('capture-active');
        touchpadMiddle.classList.add('capture-active');
        touchpadRight.classList.add('capture-active');
        
        // Pointer Lock APIでマウスカーソルをロック
        if (touchpadArea.requestPointerLock) {
            touchpadArea.requestPointerLock();
        }

        controller.log('マウスキャプチャモード開始', 'info');
    }
    
    function disableMouseCapture() {
        isMouseCaptureActive = false;
        isDragging = false;

        // UIを元に戻す
        touchpadArea.classList.remove('capture-active');
        touchpadLeft.classList.remove('capture-active');
        touchpadMiddle.classList.remove('capture-active');
        touchpadRight.classList.remove('capture-active');
        touchpadMiddle.classList.remove('scrolling-up', 'scrolling-down');
        
        // Pointer Lockを解除
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }

        controller.log('マウスキャプチャモード終了', 'info');
    }
    
    // タッチパッドエリアクリックでマウスキャプチャ開始
    touchpadArea.addEventListener('click', (e) => {
        if (!controller.isConnected) {
            alert('先にデバイスを接続してください');
            return;
        }
        if (!isMouseCaptureActive) {
            e.preventDefault();
            e.stopPropagation();
            enableMouseCapture();
        }
    });
    
    // タッチパッドボタンのクリック処理
    touchpadLeft.addEventListener('mousedown', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadLeft.classList.add('active');
    });
    
    touchpadLeft.addEventListener('mouseup', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadLeft.classList.remove('active');
        await controller.clickMouse('LEFT');
        
        // クリックフィードバック
        touchpadLeft.classList.add('click-feedback');
        setTimeout(() => {
            touchpadLeft.classList.remove('click-feedback');
        }, 200);
    });
    
    touchpadMiddle.addEventListener('mousedown', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadMiddle.classList.add('active');
    });
    
    touchpadMiddle.addEventListener('mouseup', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadMiddle.classList.remove('active');
        await controller.clickMouse('MIDDLE');
        
        // クリックフィードバック
        touchpadMiddle.classList.add('click-feedback');
        setTimeout(() => {
            touchpadMiddle.classList.remove('click-feedback');
        }, 200);
    });
    
    touchpadRight.addEventListener('mousedown', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadRight.classList.add('active');
    });
    
    touchpadRight.addEventListener('mouseup', async (e) => {
        if (!controller.isConnected) return;
        e.stopPropagation();
        touchpadRight.classList.remove('active');
        await controller.clickMouse('RIGHT');
        
        // クリックフィードバック
        touchpadRight.classList.add('click-feedback');
        setTimeout(() => {
            touchpadRight.classList.remove('click-feedback');
        }, 200);
    });
    
    // Pointer Lock状態の変更を監視
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === touchpadArea) {
            // ポインターロックが成功
            addGlobalLog('ポインターロック有効', 'debug');
            
            // スクロールイベントも無効化するためのリスナーを追加
            window.addEventListener('scroll', preventScroll, { passive: false });
            document.addEventListener('scroll', preventScroll, { passive: false });
            document.body.addEventListener('scroll', preventScroll, { passive: false });
        } else {
            // ポインターロックが解除された
            if (isMouseCaptureActive) {
                disableMouseCapture();
            }
            
            // スクロール無効化リスナーを削除
            window.removeEventListener('scroll', preventScroll);
            document.removeEventListener('scroll', preventScroll);
            document.body.removeEventListener('scroll', preventScroll);
        }
    });
    
    // スクロールを防ぐヘルパー関数
    function preventScroll(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    
    // Pointer Lockエラー時の処理
    document.addEventListener('pointerlockerror', () => {
        addGlobalLog('ポインターロックエラー', 'warning');
    });
    
    // グローバルマウスイベント（キャプチャモード時のみ動作）
    document.addEventListener('mousedown', (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        e.preventDefault();
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    document.addEventListener('mousemove', async (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        e.preventDefault();
        e.stopPropagation();
        
        // Pointer Lock APIを使用している場合はmovementX/Yを使用
        if (document.pointerLockElement === touchpadArea) {
            const deltaX = e.movementX || 0;
            const deltaY = e.movementY || 0;
            
            if (deltaX !== 0 || deltaY !== 0) {
                await controller.moveMouseRelative(deltaX, deltaY);
            }
        } else {
            // フォールバック: 従来の方法（ポインターロックが使えない場合）
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            
            if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
                await controller.moveMouseRelative(deltaX, deltaY);
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        }
    });
    
    document.addEventListener('mouseup', async (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        e.preventDefault();
        
        const wasDragging = isDragging;
        isDragging = false;
        
        // クリック判定（ドラッグしていない場合）
        if (!wasDragging || (Math.abs(e.clientX - lastMouseX) < 3 && Math.abs(e.clientY - lastMouseY) < 3)) {
            if (e.button === 0) {
                await controller.clickMouse('LEFT');
                // UIフィードバック
                touchpadLeft.classList.add('click-feedback');
                setTimeout(() => {
                    touchpadLeft.classList.remove('click-feedback');
                }, 200);
            } else if (e.button === 2) {
                await controller.clickMouse('RIGHT');
                // UIフィードバック
                touchpadRight.classList.add('click-feedback');
                setTimeout(() => {
                    touchpadRight.classList.remove('click-feedback');
                }, 200);
            } else if (e.button === 1) {
                await controller.clickMouse('MIDDLE');
                // UIフィードバック
                touchpadMiddle.classList.add('click-feedback');
                setTimeout(() => {
                    touchpadMiddle.classList.remove('click-feedback');
                }, 200);
            }
        }
    });
    
    // 右クリックメニューを無効化（キャプチャモード時）
    document.addEventListener('contextmenu', (e) => {
        if (isMouseCaptureActive) {
            e.preventDefault();
        }
    });
    
    // ホイールスクロール（グローバル）
    document.addEventListener('wheel', async (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        
        // マウスキャプチャモード中は全てのスクロールをキャプチャ
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const scrollAmount = Math.sign(e.deltaY) * -3; // スクロール方向を反転
        await controller.scrollMouse(scrollAmount);
        
        // スクロールインジケーターを表示
        showScrollIndicator(scrollAmount);
        
        return false; // スクロールを完全に無効化
    }, { passive: false, capture: true }); // キャプチャフェーズで処理
    
    // スクロールインジケーター表示関数
    function showScrollIndicator(amount) {
        if (!touchpadMiddle) return;

        // 中ボタンにスクロール方向に応じたクラスを追加
        touchpadMiddle.classList.remove('scrolling-up', 'scrolling-down');
        if (amount > 0) {
            touchpadMiddle.classList.add('scrolling-up');
        } else {
            touchpadMiddle.classList.add('scrolling-down');
        }

        // 一定時間後に非表示
        clearTimeout(showScrollIndicator.timer);
        showScrollIndicator.timer = setTimeout(() => {
            touchpadMiddle.classList.remove('scrolling-up', 'scrolling-down');
        }, 100);
    }
    
    // タッチイベント（モバイル対応）
    
    touchpad.addEventListener('touchstart', (e) => {
        if (!controller.isConnected) return;
        e.preventDefault();
        
        // マウスキャプチャモードを開始
        if (!isMouseCaptureActive) {
            enableMouseCapture();
        }
        
        touchCount = e.touches.length;
        if (touchCount === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            lastTouchX = touchStartX;
            lastTouchY = touchStartY;
        }
    });
    
    touchpad.addEventListener('touchmove', async (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        e.preventDefault();
        
        if (touchCount === 1) {
            // 1本指：マウス移動
            const deltaX = e.touches[0].clientX - lastTouchX;
            const deltaY = e.touches[0].clientY - lastTouchY;
            
            if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
                await controller.moveMouseRelative(deltaX, deltaY);
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            }
        } else if (touchCount === 2) {
            // 2本指：スクロール
            const deltaY = e.touches[0].clientY - lastTouchY;
            if (Math.abs(deltaY) > 5) {
                const scrollAmount = Math.sign(deltaY) * -2;
                await controller.scrollMouse(scrollAmount);
                lastTouchY = e.touches[0].clientY;
            }
        }
    });
    
    touchpad.addEventListener('touchend', async (e) => {
        if (!controller.isConnected || !isMouseCaptureActive) return;
        e.preventDefault();
        
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTouchTime;
        
        if (touchCount === 1 && timeDiff < 300) {
            // タップで左クリック
            await controller.clickMouse('LEFT');
        } else if (touchCount === 2 && timeDiff < 300) {
            // 2本指タップで右クリック
            await controller.clickMouse('RIGHT');
        }
        
        lastTouchTime = currentTime;
        touchCount = 0;
    });
    
    // =====================================================
    // リアルタイムキーボードモード
    // =====================================================
    
    // ビジュアルキーボードクリックでリアルタイムモード開始
    visualKeyboard.addEventListener('click', (e) => {
        // キー自体がクリックされた場合は無視
        if (e.target.classList.contains('key')) {
            return;
        }
        
        if (isRealtimeActive) {
            return;
        }
        
        if (!controller.isConnected) {
            alert('先にデバイスを接続してください');
            return;
        }
        
        enableRealtimeMode();
    });
    
    // visual-keyboard枠外クリックでリアルタイムモード解除
    document.addEventListener('click', (e) => {
        if (!isRealtimeActive) return;

        // クリックがvisual-keyboardエリアまたはタッチパッドエリアの外側の場合
        if (!visualKeyboard.contains(e.target) && !touchpad.contains(e.target)) {
            disableRealtimeMode();
        }
    });
    
    function enableRealtimeMode() {
        isRealtimeActive = true;
        visualKeyboard.style.cursor = 'default';
        // textInputContainerは無効にしない

        // キーボード背景を変更
        visualKeyboard.classList.add('realtime-active');
    }
    
    function disableRealtimeMode() {
        isRealtimeActive = false;
        visualKeyboard.style.cursor = 'pointer';
        // textInputContainerは元々表示されているので何もしない

        // キーボード背景を元に戻す
        visualKeyboard.classList.remove('realtime-active');
    }
    
    // 物理キーボードからの入力イベント処理
    document.addEventListener('keydown', async (e) => {
        // ESCキーでマウスキャプチャ解除
        if (e.key === 'Escape' && isMouseCaptureActive) {
            disableMouseCapture();
            return;
        }
        
        if (!isRealtimeActive || !controller.isConnected) return;

        // テキストエリアなどの入力要素がフォーカスされている場合はスキップ
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        // MacのCommand+BackspaceをWindowsのDeleteとして処理
        if (e.metaKey && e.key === 'Backspace') {
            e.preventDefault();
            await controller.sendSpecialKey('DELETE');
            return;
        }
        
        e.preventDefault();
        
        // ビジュアルキーボードのキーをハイライト
        const visualKey = document.querySelector(`.visual-keyboard .key[data-code="${e.code}"]`);
        if (visualKey) {
            visualKey.classList.add('pressed');
        }

        // 修飾キーの状態を取得
        const modifiers = {
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        };

        // キー送信
        await handleKeyPress(e.code, e.key, modifiers);
    });
    
    document.addEventListener('keyup', (e) => {
        if (!isRealtimeActive) return;
        
        // ビジュアルキーボードのハイライト解除
        const visualKey = document.querySelector(`.visual-keyboard .key[data-code="${e.code}"]`);
        if (visualKey) {
            setTimeout(() => visualKey.classList.remove('pressed'), 100);
        }
    });
    
    // =====================================================
    // ログ管理
    // =====================================================
    
    window.addEventListener('ch9329-log', (e) => {
        const { message, level, timestamp } = e.detail;
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.textContent = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        logDiv.appendChild(logEntry);
        
        // 自動スクロール
        logDiv.scrollTop = logDiv.scrollHeight;
        
        // ログ数制限（最大100件）
        while (logDiv.children.length > 100) {
            logDiv.removeChild(logDiv.firstChild);
        }
    });
    
    // ログクリア
    document.getElementById('clearLogBtn').addEventListener('click', () => {
        logDiv.innerHTML = '';
    });
    
    // =====================================================
    // ヘルパー関数とユーティリティ
    // =====================================================
    
    function getOSInfo() {
        const platform = navigator.platform.toLowerCase();
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (platform.includes('mac') || userAgent.includes('mac')) {
            return 'mac';
        } else if (platform.includes('win') || userAgent.includes('win')) {
            return 'windows';
        } else if (platform.includes('linux') || userAgent.includes('linux')) {
            return 'linux';
        }
        return 'windows'; // デフォルト
    }
    
    // =====================================================
    // ビジュアルキーボード生成
    // =====================================================
    
    function generateKeyboardLayout(layoutName, osTypeParam = null) {
        const layout = KEYBOARD_LAYOUTS[layoutName] || KEYBOARD_LAYOUTS['us'];
        const osType = osTypeParam || getOSInfo();
        
        // ファンクションキー行
        const functionRow = document.getElementById('functionRow');
        functionRow.innerHTML = '';
        
        layout.functionRow.forEach(item => {
            if (item.type === 'spacer') {
                // スペーサー
                const spacer = document.createElement('div');
                spacer.style.width = `${item.width}px`;
                functionRow.appendChild(spacer);
            } else {
                // キー
                const keyDiv = document.createElement('div');
                keyDiv.className = `key ${item.class || ''}`;
                keyDiv.dataset.code = item.code;
                keyDiv.textContent = item.label || '';
                functionRow.appendChild(keyDiv);
            }
        });
        
        // 数字キー行
        const numberRow = document.getElementById('numberRow');
        numberRow.innerHTML = '';
        
        // WindowsのJIS配列の場合のみ、全角/半角キーを追加
        if (layoutName === 'jis' && osType === 'windows') {
            const zenkakuKey = document.createElement('div');
            zenkakuKey.className = 'key';
            zenkakuKey.dataset.code = 'Backquote';
            zenkakuKey.textContent = '全/半';
            zenkakuKey.dataset.key = '';  // 全角/半角キーの送信
            numberRow.appendChild(zenkakuKey);
        }
        
        layout.numberRow.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class || ''}`;
            keyDiv.dataset.code = key.code;
            
            if (key.normal) {
                keyDiv.dataset.key = key.normal;
                if (key.label) {
                    keyDiv.textContent = key.label;
                } else if (key.shift) {
                    keyDiv.innerHTML = `${key.shift}<br>${key.normal}`;
                } else {
                    keyDiv.textContent = key.normal;
                }
            } else {
                keyDiv.textContent = key.label || '';
            }
            
            numberRow.appendChild(keyDiv);
        });
        
        // QWERTY行
        const qwertyRow = document.getElementById('qwertyRow');
        qwertyRow.innerHTML = '';
        const qwertyKeys = [
            { code: 'Tab', label: 'Tab', class: 'tab' },
            { code: 'KeyQ', key: 'q', label: 'Q' },
            { code: 'KeyW', key: 'w', label: 'W' },
            { code: 'KeyE', key: 'e', label: 'E' },
            { code: 'KeyR', key: 'r', label: 'R' },
            { code: 'KeyT', key: 't', label: 'T' },
            { code: 'KeyY', key: 'y', label: 'Y' },
            { code: 'KeyU', key: 'u', label: 'U' },
            { code: 'KeyI', key: 'i', label: 'I' },
            { code: 'KeyO', key: 'o', label: 'O' },
            { code: 'KeyP', key: 'p', label: 'P' }
        ];
        
        // 記号キー追加
        const symbolCodes = ['BracketLeft', 'BracketRight', 'Backslash'];
        symbolCodes.forEach(code => {
            if (layout.symbolKeys[code]) {
                const sym = layout.symbolKeys[code];
                qwertyKeys.push({
                    code: code,
                    key: sym.normal,
                    label: sym.shift ? `${sym.shift}<br>${sym.normal}` : sym.normal,
                    isHtml: true
                });
            }
        });
        
        qwertyKeys.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class || ''}`;
            keyDiv.dataset.code = key.code;
            if (key.key) keyDiv.dataset.key = key.key;
            if (key.isHtml) {
                keyDiv.innerHTML = key.label;
            } else {
                keyDiv.textContent = key.label;
            }
            qwertyRow.appendChild(keyDiv);
        });
        
        // ASDF行
        const asdfRow = document.getElementById('asdfRow');
        asdfRow.innerHTML = '';
        const asdfKeys = [
            { code: 'CapsLock', label: 'Caps', class: 'caps' },
            { code: 'KeyA', key: 'a', label: 'A' },
            { code: 'KeyS', key: 's', label: 'S' },
            { code: 'KeyD', key: 'd', label: 'D' },
            { code: 'KeyF', key: 'f', label: 'F' },
            { code: 'KeyG', key: 'g', label: 'G' },
            { code: 'KeyH', key: 'h', label: 'H' },
            { code: 'KeyJ', key: 'j', label: 'J' },
            { code: 'KeyK', key: 'k', label: 'K' },
            { code: 'KeyL', key: 'l', label: 'L' }
        ];
        
        // 記号キー追加
        ['Semicolon', 'Quote'].forEach(code => {
            if (layout.symbolKeys[code]) {
                const sym = layout.symbolKeys[code];
                asdfKeys.push({
                    code: code,
                    key: sym.normal,
                    label: sym.shift ? `${sym.shift}<br>${sym.normal}` : sym.normal,
                    isHtml: true
                });
            }
        });
        
        asdfKeys.push({ code: 'Enter', label: 'Enter', class: 'enter' });
        
        asdfKeys.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class || ''}`;
            keyDiv.dataset.code = key.code;
            if (key.key) keyDiv.dataset.key = key.key;
            if (key.isHtml) {
                keyDiv.innerHTML = key.label;
            } else {
                keyDiv.textContent = key.label;
            }
            asdfRow.appendChild(keyDiv);
        });
        
        // ZXCV行
        const zxcvRow = document.getElementById('zxcvRow');
        zxcvRow.innerHTML = '';
        const zxcvKeys = [
            { code: 'ShiftLeft', label: 'Shift', class: 'shift' },
            { code: 'KeyZ', key: 'z', label: 'Z' },
            { code: 'KeyX', key: 'x', label: 'X' },
            { code: 'KeyC', key: 'c', label: 'C' },
            { code: 'KeyV', key: 'v', label: 'V' },
            { code: 'KeyB', key: 'b', label: 'B' },
            { code: 'KeyN', key: 'n', label: 'N' },
            { code: 'KeyM', key: 'm', label: 'M' }
        ];
        
        // 記号キー追加
        ['Comma', 'Period', 'Slash'].forEach(code => {
            if (layout.symbolKeys[code]) {
                const sym = layout.symbolKeys[code];
                zxcvKeys.push({
                    code: code,
                    key: sym.normal,
                    label: sym.shift ? `${sym.shift}<br>${sym.normal}` : sym.normal,
                    isHtml: true
                });
            }
        });
        
        // JISの場合、ローマ字キー追加（もし定義されていれば）
        if (layoutName === 'jis' && layout.symbolKeys && layout.symbolKeys['IntlRo']) {
            const sym = layout.symbolKeys['IntlRo'];
            zxcvKeys.push({
                code: 'IntlRo',
                key: sym.normal,
                label: sym.shift ? `${sym.shift}<br>${sym.normal}` : sym.normal,
                isHtml: true
            });
        }
        
        zxcvKeys.push({ code: 'ShiftRight', label: 'Shift', class: 'shift' });
        
        zxcvKeys.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class || ''}`;
            keyDiv.dataset.code = key.code;
            if (key.key) keyDiv.dataset.key = key.key;
            if (key.isHtml) {
                keyDiv.innerHTML = key.label;
            } else {
                keyDiv.textContent = key.label;
            }
            zxcvRow.appendChild(keyDiv);
        });
        
        // スペースバー行
        const spaceRow = document.getElementById('spaceRow');
        spaceRow.innerHTML = '';
        
        // OS別のキー配列
        let spaceKeys = [];
        
        if (osType === 'mac') {
            // Mac配列
            spaceKeys = [
                { code: 'ControlLeft', label: 'Control', class: 'ctrl' },
                { code: 'AltLeft', label: 'Option', class: 'alt' },
                { code: 'MetaLeft', label: 'Command', class: 'cmd' }
            ];
            
            // JISの場合、英数キー追加
            if (layoutName === 'jis') {
                spaceKeys.push({ code: 'Lang2', label: '英数' });
            }
            
            spaceKeys.push({ code: 'Space', key: ' ', label: 'Space', class: 'space' });
            
            // JISの場合、かなキー追加
            if (layoutName === 'jis') {
                spaceKeys.push({ code: 'Lang1', label: 'かな' });
            }
            
            spaceKeys.push(
                { code: 'MetaRight', label: 'Command', class: 'cmd' },
                { code: 'AltRight', label: 'Option', class: 'alt' },
                { code: 'ControlRight', label: 'Control', class: 'ctrl' }
            );
        } else {
            // Windows/Linux配列
            spaceKeys = [
                { code: 'ControlLeft', label: 'Ctrl', class: 'ctrl' },
                { code: 'MetaLeft', label: 'Win', class: 'win' },
                { code: 'AltLeft', label: 'Alt', class: 'alt' }
            ];
            
            spaceKeys.push({ code: 'Space', key: ' ', label: 'Space', class: 'space' });
            
            spaceKeys.push(
                { code: 'AltRight', label: 'Alt', class: 'alt' },
                { code: 'MetaRight', label: 'Win', class: 'win' },
                { code: 'ContextMenu', label: 'Menu', class: 'menu' },
                { code: 'ControlRight', label: 'Ctrl', class: 'ctrl' }
            );
        }
        
        spaceKeys.forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class || ''}`;
            keyDiv.dataset.code = key.code;
            if (key.key) keyDiv.dataset.key = key.key;
            keyDiv.textContent = key.label;
            spaceRow.appendChild(keyDiv);
        });

        // ナビゲーションキー（上部3行）
        const navRow1 = document.getElementById('navRow1');
        navRow1.innerHTML = '';
        [
            { code: 'PrintScreen', label: 'PrtSc', class: 'nav-key' },
            { code: 'ScrollLock', label: 'Scroll', class: 'nav-key' },
            { code: 'Pause', label: 'Pause', class: 'nav-key' }
        ].forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class}`;
            keyDiv.dataset.code = key.code;
            keyDiv.textContent = key.label;
            navRow1.appendChild(keyDiv);
        });

        const navRow2 = document.getElementById('navRow2');
        navRow2.innerHTML = '';
        [
            { code: 'Insert', label: 'Ins', class: 'nav-key' },
            { code: 'Home', label: 'Home', class: 'nav-key' },
            { code: 'PageUp', label: 'PgUp', class: 'nav-key' }
        ].forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class}`;
            keyDiv.dataset.code = key.code;
            keyDiv.textContent = key.label;
            navRow2.appendChild(keyDiv);
        });

        const navRow3 = document.getElementById('navRow3');
        navRow3.innerHTML = '';
        [
            { code: 'Delete', label: 'Del', class: 'nav-key' },
            { code: 'End', label: 'End', class: 'nav-key' },
            { code: 'PageDown', label: 'PgDn', class: 'nav-key' }
        ].forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class}`;
            keyDiv.dataset.code = key.code;
            keyDiv.textContent = key.label;
            navRow3.appendChild(keyDiv);
        });

        // 矢印キー（下部2行）
        const arrowRow1 = document.getElementById('arrowRow1');
        arrowRow1.innerHTML = '';
        [
            { code: 'ArrowUp', label: '↑', class: 'arrow-key' }
        ].forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class}`;
            keyDiv.dataset.code = key.code;
            keyDiv.textContent = key.label;
            arrowRow1.appendChild(keyDiv);
        });

        const arrowRow2 = document.getElementById('arrowRow2');
        arrowRow2.innerHTML = '';
        [
            { code: 'ArrowLeft', label: '←', class: 'arrow-key' },
            { code: 'ArrowDown', label: '↓', class: 'arrow-key' },
            { code: 'ArrowRight', label: '→', class: 'arrow-key' }
        ].forEach(key => {
            const keyDiv = document.createElement('div');
            keyDiv.className = `key ${key.class}`;
            keyDiv.dataset.code = key.code;
            keyDiv.textContent = key.label;
            arrowRow2.appendChild(keyDiv);
        });

        // イベントリスナー再設定
        setupKeyboardEventListeners();
    }
    
    // =====================================================
    // キーボードイベント処理
    // =====================================================
    
    function setupKeyboardEventListeners() {
        const visualKeys = document.querySelectorAll('.visual-keyboard .key');
        visualKeys.forEach(key => {
            key.addEventListener('mousedown', async (e) => {
                if (!controller.isConnected) return;

                key.classList.add('pressed');
                const code = key.dataset.code;
                const keyChar = key.dataset.key;

                // 修飾キーの状態を取得（マウスイベントから）
                const modifiers = {
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    metaKey: e.metaKey
                };

                // キー送信
                await handleKeyPress(code, keyChar, modifiers, key);
            });

            key.addEventListener('mouseup', () => {
                setTimeout(() => key.classList.remove('pressed'), 100);
            });

            key.addEventListener('mouseleave', () => {
                key.classList.remove('pressed');
            });
        });
    }
    
    
    // キー入力処理
    async function handleKeyPress(code, key, modifiers = {}, element = null) {
        if (!controller.isConnected) return;

        const { ctrlKey = false, shiftKey = false, altKey = false, metaKey = false } = modifiers;

        // 英数/かなキー → 全角/半角キー変換（JIS Mac のみ）
        const eisuKanaCheckbox = document.getElementById('eisuKanaToZenhan');
        if (eisuKanaCheckbox && eisuKanaCheckbox.checked) {
            if (code === 'Lang2' || code === 'Lang1') {
                // 英数キー(Lang2) または かなキー(Lang1) → 全角/半角キー(0x35)を送信
                await controller.sendSpecialKey('ZENHAN');
                return;
            }
        }

        // 特殊キーの処理
        const specialKeys = {
            'Enter': 'ENTER',
            'Tab': 'TAB',
            'Escape': 'ESC',
            'Backspace': 'BACKSPACE',
            'Space': 'SPACE',
            'ShiftLeft': 'SHIFT',
            'ShiftRight': 'SHIFT',
            'ControlLeft': 'CTRL',
            'ControlRight': 'CTRL',
            'AltLeft': 'ALT',
            'AltRight': 'ALT',
            'MetaLeft': 'WINDOWS',
            'MetaRight': 'WINDOWS',
            'CapsLock': 'CAPS',
            'PageUp': 'PAGEUP',
            'PageDown': 'PAGEDOWN',
            'Home': 'HOME',
            'End': 'END',
            'Insert': 'INSERT',
            'Delete': 'DELETE',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT'
        };

        // キーコードマッピング（code → HID keycode）
        const keycodeMap = {
            'KeyA': 0x04, 'KeyB': 0x05, 'KeyC': 0x06, 'KeyD': 0x07, 'KeyE': 0x08, 'KeyF': 0x09,
            'KeyG': 0x0A, 'KeyH': 0x0B, 'KeyI': 0x0C, 'KeyJ': 0x0D, 'KeyK': 0x0E, 'KeyL': 0x0F,
            'KeyM': 0x10, 'KeyN': 0x11, 'KeyO': 0x12, 'KeyP': 0x13, 'KeyQ': 0x14, 'KeyR': 0x15,
            'KeyS': 0x16, 'KeyT': 0x17, 'KeyU': 0x18, 'KeyV': 0x19, 'KeyW': 0x1A, 'KeyX': 0x1B,
            'KeyY': 0x1C, 'KeyZ': 0x1D,
            'Digit1': 0x1E, 'Digit2': 0x1F, 'Digit3': 0x20, 'Digit4': 0x21, 'Digit5': 0x22,
            'Digit6': 0x23, 'Digit7': 0x24, 'Digit8': 0x25, 'Digit9': 0x26, 'Digit0': 0x27,
            'Space': 0x2C, 'Minus': 0x2D, 'Equal': 0x2E, 'BracketLeft': 0x2F, 'BracketRight': 0x30,
            'Backslash': 0x31, 'Semicolon': 0x33, 'Quote': 0x34, 'Backquote': 0x35,
            'Comma': 0x36, 'Period': 0x37, 'Slash': 0x38
        };

        if (specialKeys[code]) {
            // 特殊キーは修飾キーなしで送信
            await controller.sendSpecialKey(specialKeys[code]);
        } else if (keycodeMap[code]) {
            // 修飾キー付きで送信（Ctrl+a, Shift+a など）
            await controller.sendKeyWithModifiers(keycodeMap[code], ctrlKey, shiftKey, altKey, metaKey);
        } else if (key && key.length === 1) {
            // フォールバック（既存の動作）
            await controller.sendText(key);
        }
    }
    
});