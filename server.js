// แก้ไข script.js โดยใช้ ID ปุ่มที่ตรงกับ HTML ล่าสุด และแทน alert ด้วย messageBox

window.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    let peerConnection;
    let localStream;
    let myRole;
    let myRoom;

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const gameStatusElement = document.getElementById('gameStatus');
    const arousalBar = document.getElementById('arousalBar');
    const messageBox = document.getElementById('messageBox');

    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    };

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
            }
            return localStream;
        } catch (error) {
            console.error('Error accessing media devices.', error);
            showMessage('ไม่สามารถเข้าถึงกล้องและไมโครโฟนได้!');
            return null;
        }
    }

    function stopLocalStream() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            if (localVideo) {
                localVideo.srcObject = null;
            }
        }
    }

    function createPeerConnection(room, role) {
        peerConnection = new RTCPeerConnection(rtcConfig);

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }

        peerConnection.ontrack = (event) => {
            if (remoteVideo && event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { room: room, candidate: event.candidate });
            }
        };
    }

    // ========================
    // ปุ่มควบคุมฝั่ง Master
    // ========================
    const bindMasterControls = () => {
        const commandButtons = [
            { id: 'masterOkBtn', command: 'ok' },
            { id: 'masterNoBtn', command: 'no-cum' },
            { id: 'masterNowBtn', command: 'now' },
            { id: 'masterDontTouchBtn', command: 'dont-touch' },
            { id: 'speedUpBpmBtn', command: 'speed-up' },
            { id: 'speedDownBpmBtn', command: 'speed-down' },
            { id: 'stopBpmBtn', command: 'stop' },
        ];

        commandButtons.forEach(({ id, command }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    socket.emit('masterCommand', { room: myRoom, type: command });
                    console.log(`[MASTER] Command sent: ${command}`);
                });
            }
        });
    };

    // ==========================
    // รับคำสั่งจาก Master ฝั่ง Player
    // ==========================
    socket.on('masterCommand', ({ type }) => {
        console.log(`[PLAYER] คำสั่งที่ได้รับจาก Master: ${type}`);
        switch (type) {
            case 'ok':
                showMessage('Master: OK');
                break;
            case 'no-cum':
                showMessage('Master: ห้ามแตก!');
                break;
            case 'stop':
                showMessage('Master: สั่งให้หยุด');
                break;
            default:
                console.log('Unknown command:', type);
        }
    });

    // ==========================
    // ส่ง arousal จาก Player
    // ==========================
    if (arousalBar) {
        arousalBar.addEventListener('input', () => {
            const level = parseInt(arousalBar.value);
            socket.emit('playerArousalUpdate', level);
        });
    }

    // ==========================
    // รับ arousal ฝั่ง Master
    // ==========================
    socket.on('playerArousalUpdate', (level) => {
        const bar = document.getElementById('arousalBar');
        if (bar) {
            bar.value = level;
            console.log(`[MASTER] อัปเดตระดับ arousal: ${level}`);
        }
    });

    // ==========================
    // แสดงข้อความแบบ custom
    // ==========================
    function showMessage(text) {
        if (messageBox) {
            messageBox.textContent = text;
            messageBox.style.display = 'block';
            setTimeout(() => messageBox.style.display = 'none', 3000);
        } else {
            alert(text); // fallback หากไม่มี messageBox
        }
    }

    bindMasterControls();
});
