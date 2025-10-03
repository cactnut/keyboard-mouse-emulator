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
