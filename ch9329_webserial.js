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
        this.targetLayout = 'us';    // 被操作側PCのキーボード認識（送信キーコードを決定）
        
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
        
        // メディアキー定義
        this.MEDIA_KEYS = {
            EJECT: [0x02, 0x80, 0x00, 0x00],
            CDSTOP: [0x02, 0x40, 0x00, 0x00],
            PREVTRACK: [0x02, 0x20, 0x00, 0x00],
            NEXTTRACK: [0x02, 0x10, 0x00, 0x00],
            PLAYPAUSE: [0x02, 0x08, 0x00, 0x00],
            MUTE: [0x02, 0x04, 0x00, 0x00],
            VOLUMEM: [0x02, 0x02, 0x00, 0x00],
            VOLUMEP: [0x02, 0x01, 0x00, 0x00]
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
    
    async connect(baudRate = 9600) {
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
    
    async sendMediaKey(keyName) {
        const mediaData = this.MEDIA_KEYS[keyName];
        if (!mediaData) return;
        
        this.log(`メディアキー: ${keyName}`, 'info');
        
        // メディアキー押下パケット
        const packet = [0x57, 0xAB, 0x00, 0x03, 0x04, ...mediaData];
        packet.push(this.checksum(packet));
        await this.sendPacket(packet);
        
        // メディアキー離すパケット
        const releasePacket = [0x57, 0xAB, 0x00, 0x03, 0x04, 0x02, 0x00, 0x00, 0x00, 0x0B];
        await this.sendPacket(releasePacket);
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
    const baudRateSelect = document.getElementById('baudRate');
    const textInput = document.getElementById('textInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const clearTextBtn = document.getElementById('clearTextBtn');
    const touchpad = document.getElementById('touchpad');
    const textInputContainer = document.getElementById('textInputContainer');
    const realtimeStatus = document.getElementById('realtimeStatus');
    const keyboardOverlay = document.getElementById('keyboardOverlay');
    const visualKeyboard = document.getElementById('visualKeyboard');
    const exitRealtimeBtn = document.getElementById('exitRealtimeBtn');
    
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
            const baudRate = parseInt(baudRateSelect.value);
            await controller.connect(baudRate);
            
            statusDiv.textContent = '接続済み';
            statusDiv.className = 'status connected';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            
            // 全ボタン有効化
            document.querySelectorAll('.media-btn, #sendTextBtn').forEach(btn => {
                btn.disabled = false;
            });
            
            // オーバーレイ表示（接続後はクリック可能に）
            keyboardOverlay.style.display = 'flex';
        } catch (error) {
            alert(`接続エラー: ${error.message}`);
        }
    });
    
    // デバイス切断処理
    disconnectBtn.addEventListener('click', async () => {
        await controller.disconnect();
        
        statusDiv.textContent = '未接続';
        statusDiv.className = 'status disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        
        // 全ボタン無効化
        document.querySelectorAll('.media-btn, #sendTextBtn').forEach(btn => {
            btn.disabled = true;
        });
        
        // リアルタイムモード終了
        disableRealtimeMode();
        keyboardOverlay.style.display = 'flex';
    });
    
    // =====================================================
    // キーボード制御
    // =====================================================
    
    // レイアウト設定
    function updateSourceLayout() {
        const value = sourceLayoutSelect.value;
        let layoutType, osType;
        
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
    
    // メディアキー
    document.querySelectorAll('.media-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            await controller.sendMediaKey(key);
        });
    });
    
    // =====================================================
    // マウス制御
    // =====================================================
    
    // マウスキャプチャモードの切り替え
    function enableMouseCapture() {
        isMouseCaptureActive = true;
        touchpad.style.background = 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)';
        touchpad.style.border = '2px solid #ffd700';
        touchpad.innerHTML = '<div style="color: white; text-align: center; line-height: 150px; font-weight: bold;">🖱️ マウスキャプチャ中 (ESCで解除)</div>';
        
        // Pointer Lock APIでマウスカーソルをロック
        if (touchpad.requestPointerLock) {
            touchpad.requestPointerLock();
        }
        
        addGlobalLog('マウスキャプチャモード開始', 'info');
    }
    
    function disableMouseCapture() {
        isMouseCaptureActive = false;
        isDragging = false;
        touchpad.style.background = 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)';
        touchpad.style.border = '2px solid #555';
        touchpad.innerHTML = '';
        
        // Pointer Lockを解除
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
        
        addGlobalLog('マウスキャプチャモード終了', 'info');
    }
    
    // タッチパッドクリックでマウスキャプチャ開始
    touchpad.addEventListener('click', (e) => {
        if (!controller.isConnected) return;
        if (!isMouseCaptureActive) {
            e.preventDefault();
            e.stopPropagation();
            enableMouseCapture();
        }
    });
    
    // Pointer Lock状態の変更を監視
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === touchpad) {
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
        if (document.pointerLockElement === touchpad) {
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
            } else if (e.button === 2) {
                await controller.clickMouse('RIGHT');
            } else if (e.button === 1) {
                await controller.clickMouse('MIDDLE');
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
        
        return false; // スクロールを完全に無効化
    }, { passive: false, capture: true }); // キャプチャフェーズで処理
    
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
    
    // キーボードオーバーレイクリックでリアルタイムモード開始
    keyboardOverlay.addEventListener('click', () => {
        if (!controller.isConnected) {
            alert('先にデバイスを接続してください');
            return;
        }
        
        enableRealtimeMode();
    });
    
    // リアルタイムモード終了ボタン
    exitRealtimeBtn.addEventListener('click', () => {
        disableRealtimeMode();
    });
    
    function enableRealtimeMode() {
        isRealtimeActive = true;
        keyboardOverlay.style.display = 'none';
        visualKeyboard.style.cursor = 'default';
        textInputContainer.style.display = 'none';
        realtimeStatus.style.display = 'block';
        
        // キーボード背景を変更
        visualKeyboard.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        visualKeyboard.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.5)';
    }
    
    function disableRealtimeMode() {
        isRealtimeActive = false;
        keyboardOverlay.style.display = 'flex';
        visualKeyboard.style.cursor = 'pointer';
        textInputContainer.style.display = 'block';
        realtimeStatus.style.display = 'none';
        
        // キーボード背景を元に戻す
        visualKeyboard.style.background = '#2a2a2a';
        visualKeyboard.style.boxShadow = 'none';
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
        
        // Escapeキーでリアルタイムモード終了
        if (e.key === 'Escape' && isRealtimeActive) {
            disableRealtimeMode();
            return;
        }
        
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
        
        // キー送信
        await handleKeyPress(e.code, e.key);
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
        
        // イベントリスナー再設定
        setupKeyboardEventListeners();
    }
    
    // =====================================================
    // キーボードイベント処理
    // =====================================================
    
    function setupKeyboardEventListeners() {
        const visualKeys = document.querySelectorAll('.visual-keyboard .key');
        visualKeys.forEach(key => {
            key.addEventListener('mousedown', async () => {
                if (!controller.isConnected) return;
                
                key.classList.add('pressed');
                const code = key.dataset.code;
                const keyChar = key.dataset.key;
                
                // キー送信
                await handleKeyPress(code, keyChar, key);
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
    async function handleKeyPress(code, key, element = null) {
        if (!controller.isConnected) return;
        
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
        
        if (specialKeys[code]) {
            await controller.sendSpecialKey(specialKeys[code]);
        } else if (key && key.length === 1) {
            await controller.sendText(key);
        }
    }
    
});