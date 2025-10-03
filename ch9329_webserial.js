// CH9329 WebSerial Controller JavaScript
// WebSerial APIを使用してブラウザからCH9329チップを制御

class CH9329Controller {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;
        this.isConnected = false;
        this.screenWidth = 1920;
        this.screenHeight = 1080;
        
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
            WINDOWS: 0xE3
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
        
        // 特殊文字
        const specialChars = {
            '!': [2, 0x1E], '"': [2, 0x1F], '#': [2, 0x20], '$': [2, 0x21], 
            '%': [2, 0x22], '&': [2, 0x23], "'": [2, 0x24], '=': [2, 0x2D],
            '-': [0, 0x2D], '~': [2, 0x2E], '^': [0, 0x2E], '|': [2, 0x89],
            '\\': [0, 0x89], '`': [2, 0x2F], '@': [0, 0x2F], '{': [2, 0x30],
            '[': [0, 0x30], '}': [2, 0x31], ']': [0, 0x31], '*': [2, 0x34],
            ':': [0, 0x34], '+': [2, 0x33], ';': [0, 0x33], '<': [2, 0x36],
            ',': [0, 0x36], '>': [2, 0x37], '.': [0, 0x37], '?': [2, 0x38],
            '/': [0, 0x38], '_': [2, 0x87], '(': [2, 0x26], ')': [2, 0x27]
        };
        
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
        if (!keyCode) return;
        
        this.log(`特殊キー: ${keyName}`, 'info');
        
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
    
    async moveMouseAbsolute(x, y) {
        this.log(`マウス絶対移動: (${x}, ${y})`, 'info');
        
        // 座標を4096スケールに変換
        const xAbs = Math.floor(4096 * x / this.screenWidth);
        const yAbs = Math.floor(4096 * y / this.screenHeight);
        
        const packet = [
            0x57, 0xAB, 0x00, 0x04, 0x07, 0x02, 0x00,
            xAbs & 0xFF, (xAbs >> 8) & 0xFF,
            yAbs & 0xFF, (yAbs >> 8) & 0xFF,
            0x00
        ];
        packet.push(this.checksum(packet));
        await this.sendPacket(packet);
    }
    
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
}

// UIとの連携
document.addEventListener('DOMContentLoaded', () => {
    const controller = new CH9329Controller();
    
    // 要素取得
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const statusDiv = document.getElementById('status');
    const logDiv = document.getElementById('log');
    const baudRateSelect = document.getElementById('baudRate');
    const screenWidthInput = document.getElementById('screenWidth');
    const screenHeightInput = document.getElementById('screenHeight');
    
    // 接続ボタン
    connectBtn.addEventListener('click', async () => {
        try {
            const baudRate = parseInt(baudRateSelect.value);
            controller.screenWidth = parseInt(screenWidthInput.value);
            controller.screenHeight = parseInt(screenHeightInput.value);
            
            await controller.connect(baudRate);
            
            statusDiv.textContent = '接続済み';
            statusDiv.className = 'status connected';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            
            // 全ボタン有効化
            document.querySelectorAll('.key-btn, .mod-btn, .media-btn, .mouse-button, #sendTextBtn, #leftClickBtn, #rightClickBtn, #middleClickBtn, #moveRelBtn, #scrollBtn').forEach(btn => {
                btn.disabled = false;
            });
        } catch (error) {
            alert(`接続エラー: ${error.message}`);
        }
    });
    
    // 切断ボタン
    disconnectBtn.addEventListener('click', async () => {
        await controller.disconnect();
        
        statusDiv.textContent = '未接続';
        statusDiv.className = 'status disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        
        // 全ボタン無効化
        document.querySelectorAll('.key-btn, .mod-btn, .media-btn, .mouse-button, #sendTextBtn, #leftClickBtn, #rightClickBtn, #middleClickBtn, #moveRelBtn, #scrollBtn').forEach(btn => {
            btn.disabled = true;
        });
    });
    
    // テキスト送信
    const textInput = document.getElementById('textInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const clearTextBtn = document.getElementById('clearTextBtn');
    
    sendTextBtn.addEventListener('click', async () => {
        const text = textInput.value;
        if (text) {
            await controller.sendText(text);
        }
    });
    
    clearTextBtn.addEventListener('click', () => {
        textInput.value = '';
    });
    
    // キーボードボタン
    document.querySelectorAll('.key-btn, .mod-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            await controller.sendSpecialKey(key);
        });
    });
    
    // メディアキー
    document.querySelectorAll('.media-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            await controller.sendMediaKey(key);
        });
    });
    
    // マウスパッド
    const mousePad = document.getElementById('mousePad');
    const coordinates = document.getElementById('coordinates');
    
    mousePad.addEventListener('click', async (e) => {
        if (!controller.isConnected) return;
        
        const rect = mousePad.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / rect.width * controller.screenWidth);
        const y = Math.floor((e.clientY - rect.top) / rect.height * controller.screenHeight);
        
        coordinates.textContent = `座標: (${x}, ${y})`;
        await controller.moveMouseAbsolute(x, y);
    });
    
    // マウスボタン
    document.getElementById('leftClickBtn').addEventListener('click', async () => {
        await controller.clickMouse('LEFT');
    });
    
    document.getElementById('rightClickBtn').addEventListener('click', async () => {
        await controller.clickMouse('RIGHT');
    });
    
    document.getElementById('middleClickBtn').addEventListener('click', async () => {
        await controller.clickMouse('MIDDLE');
    });
    
    // 相対移動スライダー
    const relXSlider = document.getElementById('relX');
    const relYSlider = document.getElementById('relY');
    const relXValue = document.getElementById('relXValue');
    const relYValue = document.getElementById('relYValue');
    const moveRelBtn = document.getElementById('moveRelBtn');
    
    relXSlider.addEventListener('input', () => {
        relXValue.textContent = relXSlider.value;
    });
    
    relYSlider.addEventListener('input', () => {
        relYValue.textContent = relYSlider.value;
    });
    
    moveRelBtn.addEventListener('click', async () => {
        const x = parseInt(relXSlider.value);
        const y = parseInt(relYSlider.value);
        await controller.moveMouseRelative(x, y);
        
        // スライダーリセット
        relXSlider.value = 0;
        relYSlider.value = 0;
        relXValue.textContent = '0';
        relYValue.textContent = '0';
    });
    
    // スクロール
    const scrollSlider = document.getElementById('scrollAmount');
    const scrollValue = document.getElementById('scrollValue');
    const scrollBtn = document.getElementById('scrollBtn');
    
    scrollSlider.addEventListener('input', () => {
        scrollValue.textContent = scrollSlider.value;
    });
    
    scrollBtn.addEventListener('click', async () => {
        const amount = parseInt(scrollSlider.value);
        await controller.scrollMouse(amount);
        
        // スライダーリセット
        scrollSlider.value = 0;
        scrollValue.textContent = '0';
    });
    
    // ログ表示
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
    
    // キーボードショートカット（Ctrl+Enterでテキスト送信）
    textInput.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.key === 'Enter' && controller.isConnected) {
            await controller.sendText(textInput.value);
        }
    });
});