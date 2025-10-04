# keyboard-mouse-emulator
Keyboard and mouse emulator program using CH340 and CH9329.   Emulates standard USB HID devices to allow PCs or microcontrollers to send keyboard and mouse input.

## Overview

This project is a keyboard and mouse emulator using CH340 (USB–UART bridge) and CH9329 (USB HID chip).

### System configuration

PC1 ── CH340 ── CH9329 ── PC2

- **PC1**: Runs the emulator program. Sends commands via CH340 (UART).
- **CH340**: USB–UART bridge.
- **CH9329**: USB HID chip. Converts UART commands to USB HID signals.
- **PC2**: Recognizes the device as a standard USB keyboard and mouse.

### Purpose

From the viewpoint of PC2, it looks like a regular USB keyboard/mouse is connected.  
This allows PC1 (or microcontroller) to programmatically control keyboard and mouse input to PC2.

## Web Interface

### Browser Compatibility

The web interface uses WebSerial API which requires a compatible browser:

#### ✅ Supported Browsers
- **Chrome** 89 or later (Windows, Mac, Linux)
- **Edge** 89 or later (Windows, Mac)
- **Opera** 76 or later (Windows, Mac, Linux)

#### ❌ Not Supported
- **Firefox** - WebSerial API not implemented
- **Safari** - WebSerial API not implemented
- **Mobile browsers** - WebSerial API not available on mobile platforms

### Usage

1. Open `webserial_ch9329.html` in a supported browser
2. Click "接続" (Connect) button
3. Select the serial port for CH9329 device
4. Use the visual keyboard, mouse pad, and media controls

### Features

- **Visual Keyboard** with OS-specific layouts
  - Automatic OS detection (Windows/Mac/Linux)
  - US and JIS keyboard layout support
  - Real-time keyboard input mode
- **Mouse Control**
  - Absolute positioning via touchpad interface
  - Relative movement controls
  - Scroll wheel support
- **Media Keys** for volume, playback control, etc.

## Python Script

For Python-based control, use `sample.py` with pyserial library:

```bash
pip install pyserial
python3 sample.py
```
